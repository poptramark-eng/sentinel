
alter table public.assessments drop constraint assessments_status_check;
alter table public.assessments
  add constraint assessments_status_check
  check (status = any (array['draft','open','submitted','reviewed','approved','published','closed']::text[]));

create table public.assessment_submissions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  assessment_id uuid not null references public.assessments(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict,
  version integer not null check (version > 0),
  status text not null check (status in ('submitted','reviewed','approved','published','returned')),
  snapshot jsonb not null,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_notes text,
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  approval_notes text,
  published_by uuid references auth.users(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (assessment_id, version)
);

create index assessment_submissions_assessment_version_idx
  on public.assessment_submissions (assessment_id, version desc);
create index assessment_submissions_published_idx
  on public.assessment_submissions (school_id, published_at desc)
  where status = 'published';

alter table public.assessment_submissions enable row level security;
create policy assessment_submissions_read_admin
  on public.assessment_submissions
  for select to authenticated
  using (
    (select private.child_data_processing_enabled())
    and school_id = (select private.current_school_id())
    and (select private.has_school_role(array['school_admin']))
  );

revoke all on public.assessment_submissions from public, anon, authenticated;
grant select on public.assessment_submissions to authenticated;

drop trigger if exists assessment_submissions_child_data_gate on public.assessment_submissions;
create trigger assessment_submissions_child_data_gate
before insert or update or delete on public.assessment_submissions
for each row execute function private.enforce_child_data_processing();

create or replace function private.protect_assessment_submission_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'Assessment submission snapshots cannot be deleted';
  end if;
  if new.id is distinct from old.id
    or new.school_id is distinct from old.school_id
    or new.assessment_id is distinct from old.assessment_id
    or new.class_id is distinct from old.class_id
    or new.version is distinct from old.version
    or new.snapshot is distinct from old.snapshot
    or new.submitted_by is distinct from old.submitted_by
    or new.submitted_at is distinct from old.submitted_at then
    raise exception 'Assessment submission snapshots are immutable';
  end if;
  return new;
end;
$function$;

revoke all on function private.protect_assessment_submission_snapshot() from public, anon, authenticated;
drop trigger if exists assessment_submissions_snapshot_immutable on public.assessment_submissions;
create trigger assessment_submissions_snapshot_immutable
before update or delete on public.assessment_submissions
for each row execute function private.protect_assessment_submission_snapshot();

create or replace function private.enforce_assessment_open_for_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_assessment_id uuid;
  current_status text;
begin
  if tg_op = 'DELETE' then
    target_assessment_id := old.assessment_id;
  else
    target_assessment_id := new.assessment_id;
  end if;

  select a.status into current_status
  from public.assessments a
  where a.id = target_assessment_id;

  if current_status is distinct from 'open' then
    raise exception 'Assessment scope and marks are locked after class submission';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function private.enforce_assessment_open_for_mutation() from public, anon, authenticated;

drop trigger if exists assessment_scores_open_only on public.assessment_scores;
create trigger assessment_scores_open_only
before insert or update or delete on public.assessment_scores
for each row execute function private.enforce_assessment_open_for_mutation();

drop trigger if exists assessment_learning_areas_open_only on public.assessment_learning_areas;
create trigger assessment_learning_areas_open_only
before insert or update or delete on public.assessment_learning_areas
for each row execute function private.enforce_assessment_open_for_mutation();

-- Freeze direct assessment and learning-area writes. Creation and workflow
-- transitions happen only through the audited SECURITY DEFINER functions.
revoke insert, update, delete on public.assessments from public, anon, authenticated;
revoke insert, update, delete on public.assessment_learning_areas from public, anon, authenticated;
grant select on public.assessments to authenticated;
grant select on public.assessment_learning_areas to authenticated;

create or replace function private.submit_assessment(p_assessment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  school_id_value uuid := private.current_school_id();
  assessment_row public.assessments%rowtype;
  class_row public.classes%rowtype;
  learner_count integer;
  area_count integer;
  missing_count integer;
  next_version integer;
  submission_id uuid;
  snapshot_value jsonb;
begin
  if actor_id is null or school_id_value is null then
    raise exception 'An active school account is required';
  end if;
  if not private.child_data_processing_enabled() then
    raise exception 'Child-data processing is disabled for this database environment';
  end if;

  select * into assessment_row
  from public.assessments a
  where a.id = p_assessment_id and a.school_id = school_id_value
  for update;
  if not found then
    raise exception 'Assessment not found in this school';
  end if;
  if assessment_row.status <> 'open' then
    raise exception 'Only an open assessment can be submitted';
  end if;

  if not private.has_school_role(array['school_admin'])
    and not exists (
      select 1 from public.teacher_assignments ta
      where ta.school_id = school_id_value
        and ta.teacher_id = actor_id
        and ta.class_id = assessment_row.class_id
        and ta.assignment_role = 'class_teacher'
    ) then
    raise exception 'Only the assigned class teacher or School Administrator can submit this class';
  end if;

  select * into class_row
  from public.classes c
  where c.id = assessment_row.class_id and c.school_id = school_id_value;

  select count(*) into learner_count
  from public.learner_enrollments e
  where e.school_id = school_id_value
    and e.class_id = assessment_row.class_id
    and e.academic_year_id = assessment_row.academic_year_id
    and e.status = 'active';

  select count(*) into area_count
  from public.assessment_learning_areas ala
  where ala.assessment_id = assessment_row.id;

  if learner_count = 0 then
    raise exception 'A class must have active learners before submission';
  end if;
  if area_count = 0 then
    raise exception 'Add at least one learning area before submission';
  end if;

  select count(*) into missing_count
  from (
    select e.learner_id, ala.learning_area_id
    from public.learner_enrollments e
    cross join public.assessment_learning_areas ala
    where e.school_id = school_id_value
      and e.class_id = assessment_row.class_id
      and e.academic_year_id = assessment_row.academic_year_id
      and e.status = 'active'
      and ala.assessment_id = assessment_row.id
    except
    select s.learner_id, s.learning_area_id
    from public.assessment_scores s
    where s.assessment_id = assessment_row.id
  ) missing_marks;

  if missing_count > 0 then
    raise exception 'Submission blocked: % required learner marks are missing', missing_count;
  end if;

  select coalesce(max(s.version), 0) + 1 into next_version
  from public.assessment_submissions s
  where s.assessment_id = assessment_row.id;

  snapshot_value := jsonb_build_object(
    'assessment', jsonb_build_object(
      'id', assessment_row.id,
      'title', assessment_row.title,
      'assessment_type', assessment_row.assessment_type,
      'assessment_date', assessment_row.assessment_date,
      'max_score', assessment_row.max_score,
      'academic_year_id', assessment_row.academic_year_id
    ),
    'class', jsonb_build_object(
      'id', class_row.id,
      'display_name', class_row.display_name,
      'grade_level', class_row.grade_level,
      'stream', class_row.stream
    ),
    'learning_areas', (
      select coalesce(
        jsonb_agg(jsonb_build_object('id', la.id, 'code', la.code, 'name', la.name) order by la.name),
        '[]'::jsonb
      )
      from public.assessment_learning_areas ala
      join public.learning_areas la on la.id = ala.learning_area_id
      where ala.assessment_id = assessment_row.id
    ),
    'learners', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', l.id,
            'admission_number', l.admission_number,
            'name', pg_catalog.concat_ws(' ', l.given_name, nullif(l.other_names, ''), l.family_name),
            'average', (
              select round(avg(s.score), 2)
              from public.assessment_scores s
              where s.assessment_id = assessment_row.id
                and s.learner_id = l.id
            ),
            'scores', (
              select coalesce(
                jsonb_agg(
                  jsonb_build_object(
                    'learning_area_id', la2.id,
                    'learning_area_name', la2.name,
                    'score', s2.score
                  ) order by la2.name
                ),
                '[]'::jsonb
              )
              from public.assessment_learning_areas ala2
              join public.learning_areas la2 on la2.id = ala2.learning_area_id
              join public.assessment_scores s2
                on s2.assessment_id = assessment_row.id
               and s2.learner_id = l.id
               and s2.learning_area_id = la2.id
              where ala2.assessment_id = assessment_row.id
            )
          ) order by l.family_name, l.given_name
        ),
        '[]'::jsonb
      )
      from public.learner_enrollments e
      join public.learners l on l.id = e.learner_id and l.school_id = e.school_id
      where e.school_id = school_id_value
        and e.class_id = assessment_row.class_id
        and e.academic_year_id = assessment_row.academic_year_id
        and e.status = 'active'
    )
  );

  insert into public.assessment_submissions (
    school_id, assessment_id, class_id, version, status, snapshot, submitted_by
  )
  values (
    school_id_value, assessment_row.id, assessment_row.class_id,
    next_version, 'submitted', snapshot_value, actor_id
  )
  returning id into submission_id;

  update public.assessments
  set status = 'submitted', updated_at = now()
  where id = assessment_row.id;

  insert into public.audit_events (school_id, actor_id, action, entity_type, entity_id, details)
  values (
    school_id_value, actor_id, 'assessment.submitted', 'assessment', assessment_row.id,
    jsonb_build_object('submission_id', submission_id, 'version', next_version, 'learner_count', learner_count)
  );

  return submission_id;
end;
$function$;

create or replace function private.review_assessment(p_assessment_id uuid, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  school_id_value uuid := private.current_school_id();
  submission_row public.assessment_submissions%rowtype;
begin
  if actor_id is null or school_id_value is null or not private.has_school_role(array['school_admin']) then
    raise exception 'Only a School Administrator can review assessments';
  end if;
  if not private.child_data_processing_enabled() then
    raise exception 'Child-data processing is disabled for this database environment';
  end if;
  if length(coalesce(p_notes, '')) > 2000 then
    raise exception 'Review notes must be 2000 characters or fewer';
  end if;

  perform 1 from public.assessments a
  where a.id = p_assessment_id and a.school_id = school_id_value and a.status = 'submitted'
  for update;
  if not found then
    raise exception 'Only a submitted assessment can be reviewed';
  end if;

  select * into submission_row
  from public.assessment_submissions s
  where s.assessment_id = p_assessment_id and s.school_id = school_id_value and s.status = 'submitted'
  order by s.version desc
  limit 1
  for update;
  if not found then
    raise exception 'No current submitted version was found';
  end if;

  update public.assessment_submissions
  set status = 'reviewed', reviewed_by = actor_id, reviewed_at = now(), review_notes = nullif(trim(p_notes), '')
  where id = submission_row.id;
  update public.assessments set status = 'reviewed', updated_at = now() where id = p_assessment_id;
  insert into public.audit_events (school_id, actor_id, action, entity_type, entity_id, details)
  values (school_id_value, actor_id, 'assessment.reviewed', 'assessment', p_assessment_id,
    jsonb_build_object('submission_id', submission_row.id, 'version', submission_row.version));
  return submission_row.id;
end;
$function$;

create or replace function private.approve_assessment(p_assessment_id uuid, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  school_id_value uuid := private.current_school_id();
  submission_row public.assessment_submissions%rowtype;
begin
  if actor_id is null or school_id_value is null or not private.has_school_role(array['school_admin']) then
    raise exception 'Only a School Administrator can approve assessments';
  end if;
  if not private.child_data_processing_enabled() then
    raise exception 'Child-data processing is disabled for this database environment';
  end if;
  if length(coalesce(p_notes, '')) > 2000 then
    raise exception 'Approval notes must be 2000 characters or fewer';
  end if;

  perform 1 from public.assessments a
  where a.id = p_assessment_id and a.school_id = school_id_value and a.status = 'reviewed'
  for update;
  if not found then
    raise exception 'Only a reviewed assessment can be approved';
  end if;

  select * into submission_row
  from public.assessment_submissions s
  where s.assessment_id = p_assessment_id and s.school_id = school_id_value and s.status = 'reviewed'
  order by s.version desc
  limit 1
  for update;
  if not found then
    raise exception 'No reviewed version was found';
  end if;

  update public.assessment_submissions
  set status = 'approved', approved_by = actor_id, approved_at = now(), approval_notes = nullif(trim(p_notes), '')
  where id = submission_row.id;
  update public.assessments set status = 'approved', updated_at = now() where id = p_assessment_id;
  insert into public.audit_events (school_id, actor_id, action, entity_type, entity_id, details)
  values (school_id_value, actor_id, 'assessment.approved', 'assessment', p_assessment_id,
    jsonb_build_object('submission_id', submission_row.id, 'version', submission_row.version));
  return submission_row.id;
end;
$function$;

create or replace function private.publish_assessment(p_assessment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  school_id_value uuid := private.current_school_id();
  submission_row public.assessment_submissions%rowtype;
begin
  if actor_id is null or school_id_value is null or not private.has_school_role(array['school_admin']) then
    raise exception 'Only a School Administrator can publish assessments';
  end if;
  if not private.child_data_processing_enabled() then
    raise exception 'Child-data processing is disabled for this database environment';
  end if;

  perform 1 from public.assessments a
  where a.id = p_assessment_id and a.school_id = school_id_value and a.status = 'approved'
  for update;
  if not found then
    raise exception 'Only an approved assessment can be published';
  end if;

  select * into submission_row
  from public.assessment_submissions s
  where s.assessment_id = p_assessment_id and s.school_id = school_id_value and s.status = 'approved'
  order by s.version desc
  limit 1
  for update;
  if not found then
    raise exception 'No approved version was found';
  end if;

  update public.assessment_submissions
  set status = 'published', published_by = actor_id, published_at = now()
  where id = submission_row.id;
  update public.assessments set status = 'published', updated_at = now() where id = p_assessment_id;
  insert into public.audit_events (school_id, actor_id, action, entity_type, entity_id, details)
  values (school_id_value, actor_id, 'assessment.published', 'assessment', p_assessment_id,
    jsonb_build_object('submission_id', submission_row.id, 'version', submission_row.version));
  return submission_row.id;
end;
$function$;

create or replace function private.return_assessment_for_correction(p_assessment_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  school_id_value uuid := private.current_school_id();
  submission_row public.assessment_submissions%rowtype;
begin
  if actor_id is null or school_id_value is null or not private.has_school_role(array['school_admin']) then
    raise exception 'Only a School Administrator can return assessments for correction';
  end if;
  if not private.child_data_processing_enabled() then
    raise exception 'Child-data processing is disabled for this database environment';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 or length(p_reason) > 2000 then
    raise exception 'Provide a correction reason between 3 and 2000 characters';
  end if;

  perform 1 from public.assessments a
  where a.id = p_assessment_id and a.school_id = school_id_value
    and a.status in ('submitted','reviewed','approved')
  for update;
  if not found then
    raise exception 'Only a submitted, reviewed or approved assessment can be returned';
  end if;

  select * into submission_row
  from public.assessment_submissions s
  where s.assessment_id = p_assessment_id and s.school_id = school_id_value
    and s.status in ('submitted','reviewed','approved')
  order by s.version desc
  limit 1
  for update;
  if not found then
    raise exception 'No current submission version was found';
  end if;

  update public.assessment_submissions
  set status = 'returned',
      review_notes = concat_ws(E'\n', nullif(review_notes, ''), 'Returned for correction: ' || trim(p_reason))
  where id = submission_row.id;
  update public.assessments set status = 'open', updated_at = now() where id = p_assessment_id;
  insert into public.audit_events (school_id, actor_id, action, entity_type, entity_id, details)
  values (school_id_value, actor_id, 'assessment.returned_for_correction', 'assessment', p_assessment_id,
    jsonb_build_object('submission_id', submission_row.id, 'version', submission_row.version, 'reason', trim(p_reason)));
  return submission_row.id;
end;
$function$;

revoke all on function private.submit_assessment(uuid) from public, anon;
revoke all on function private.review_assessment(uuid, text) from public, anon;
revoke all on function private.approve_assessment(uuid, text) from public, anon;
revoke all on function private.publish_assessment(uuid) from public, anon;
revoke all on function private.return_assessment_for_correction(uuid, text) from public, anon;
grant execute on function private.submit_assessment(uuid) to authenticated;
grant execute on function private.review_assessment(uuid, text) to authenticated;
grant execute on function private.approve_assessment(uuid, text) to authenticated;
grant execute on function private.publish_assessment(uuid) to authenticated;
grant execute on function private.return_assessment_for_correction(uuid, text) to authenticated;

create or replace function public.submit_assessment(p_assessment_id uuid)
returns uuid language sql security invoker set search_path = ''
as $function$ select private.submit_assessment(p_assessment_id) $function$;
create or replace function public.review_assessment(p_assessment_id uuid, p_notes text default null)
returns uuid language sql security invoker set search_path = ''
as $function$ select private.review_assessment(p_assessment_id, p_notes) $function$;
create or replace function public.approve_assessment(p_assessment_id uuid, p_notes text default null)
returns uuid language sql security invoker set search_path = ''
as $function$ select private.approve_assessment(p_assessment_id, p_notes) $function$;
create or replace function public.publish_assessment(p_assessment_id uuid)
returns uuid language sql security invoker set search_path = ''
as $function$ select private.publish_assessment(p_assessment_id) $function$;
create or replace function public.return_assessment_for_correction(p_assessment_id uuid, p_reason text)
returns uuid language sql security invoker set search_path = ''
as $function$ select private.return_assessment_for_correction(p_assessment_id, p_reason) $function$;

revoke all on function public.submit_assessment(uuid) from public, anon;
revoke all on function public.review_assessment(uuid, text) from public, anon;
revoke all on function public.approve_assessment(uuid, text) from public, anon;
revoke all on function public.publish_assessment(uuid) from public, anon;
revoke all on function public.return_assessment_for_correction(uuid, text) from public, anon;
grant execute on function public.submit_assessment(uuid) to authenticated;
grant execute on function public.review_assessment(uuid, text) to authenticated;
grant execute on function public.approve_assessment(uuid, text) to authenticated;
grant execute on function public.publish_assessment(uuid) to authenticated;
grant execute on function public.return_assessment_for_correction(uuid, text) to authenticated;

comment on table public.assessment_submissions
is 'Versioned immutable snapshots of complete class assessment submissions and their review, approval and publication state.';

