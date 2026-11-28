-- Permit full assessment workflows for records already classified as synthetic,
-- while keeping the global real-child-data control closed.
create or replace function private.child_data_record_allowed(p_is_synthetic boolean)
returns boolean language sql stable security definer set search_path = ''
as $function$ select coalesce(p_is_synthetic, false) or private.child_data_processing_enabled() $function$;
revoke all on function private.child_data_record_allowed(boolean) from public, anon;
grant execute on function private.child_data_record_allowed(boolean) to authenticated;

create or replace function public.child_data_processing_mode()
returns text language sql stable security definer set search_path = ''
as $function$ select case when private.child_data_processing_enabled() then 'all' else 'synthetic_only' end $function$;
revoke all on function public.child_data_processing_mode() from public, anon;
grant execute on function public.child_data_processing_mode() to authenticated;

create or replace function private.enforce_child_data_processing()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare allowed_synthetic boolean := false;
begin
  if tg_op = 'DELETE' then
    if tg_table_name = 'learners' then allowed_synthetic := old.is_synthetic;
    elsif tg_table_name = 'learner_enrollments' then
      select l.is_synthetic into allowed_synthetic from public.learners l where l.id = old.learner_id and l.school_id = old.school_id;
    elsif tg_table_name = 'assessment_scores' then
      select a.is_synthetic into allowed_synthetic from public.assessments a where a.id = old.assessment_id and a.school_id = old.school_id;
    elsif tg_table_name = 'assessment_score_revisions' then
      select s.is_synthetic into allowed_synthetic from public.assessment_scores s where s.id = old.assessment_score_id and s.school_id = old.school_id;
    elsif tg_table_name = 'assessment_submissions' then
      select a.is_synthetic into allowed_synthetic from public.assessments a where a.id = old.assessment_id and a.school_id = old.school_id;
    end if;
  else
    if tg_table_name = 'learners' then allowed_synthetic := new.is_synthetic;
    elsif tg_table_name = 'learner_enrollments' then
      select l.is_synthetic into allowed_synthetic from public.learners l where l.id = new.learner_id and l.school_id = new.school_id;
    elsif tg_table_name = 'assessment_scores' then
      select a.is_synthetic into allowed_synthetic from public.assessments a
      join public.learners l on l.id = new.learner_id and l.school_id = new.school_id
      where a.id = new.assessment_id and a.school_id = new.school_id and a.is_synthetic = l.is_synthetic;
      if not found then raise exception 'Learner and assessment must have matching school and data classifications'; end if;
    elsif tg_table_name = 'assessment_score_revisions' then
      select s.is_synthetic into allowed_synthetic from public.assessment_scores s where s.id = new.assessment_score_id and s.school_id = new.school_id;
    elsif tg_table_name = 'assessment_submissions' then
      select a.is_synthetic into allowed_synthetic from public.assessments a where a.id = new.assessment_id and a.school_id = new.school_id;
    end if;
  end if;
  if not private.child_data_record_allowed(coalesce(allowed_synthetic, false)) then
    raise exception 'This record is outside the enabled data-processing scope';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;
revoke all on function private.enforce_child_data_processing() from public, anon, authenticated;

drop policy if exists learners_admin_write on public.learners;
create policy learners_admin_write on public.learners for all to authenticated
using (school_id = private.current_school_id() and private.has_school_role(array['school_admin']) and private.child_data_record_allowed(is_synthetic))
with check (school_id = private.current_school_id() and private.has_school_role(array['school_admin']) and private.child_data_record_allowed(is_synthetic));
drop policy if exists learners_read_assigned on public.learners;
create policy learners_read_assigned on public.learners for select to authenticated
using (school_id = private.current_school_id() and private.child_data_record_allowed(is_synthetic)
and exists (select 1 from public.learner_enrollments e where e.learner_id = learners.id and e.school_id = learners.school_id and e.status = 'active' and private.can_access_class(e.class_id)));

drop policy if exists enrollments_admin_write on public.learner_enrollments;
create policy enrollments_admin_write on public.learner_enrollments for all to authenticated
using (school_id = private.current_school_id() and private.has_school_role(array['school_admin'])
and exists (select 1 from public.learners l where l.id = learner_enrollments.learner_id and l.school_id = learner_enrollments.school_id and private.child_data_record_allowed(l.is_synthetic)))
with check (school_id = private.current_school_id() and private.has_school_role(array['school_admin'])
and exists (select 1 from public.learners l where l.id = learner_enrollments.learner_id and l.school_id = learner_enrollments.school_id and private.child_data_record_allowed(l.is_synthetic)));
drop policy if exists enrollments_read_assigned on public.learner_enrollments;
create policy enrollments_read_assigned on public.learner_enrollments for select to authenticated
using (school_id = private.current_school_id()
and exists (select 1 from public.learners l where l.id = learner_enrollments.learner_id and l.school_id = learner_enrollments.school_id and private.child_data_record_allowed(l.is_synthetic))
and private.can_access_class(class_id));

drop policy if exists assessments_admin_write on public.assessments;
create policy assessments_admin_write on public.assessments for all to authenticated
using (school_id = private.current_school_id() and private.has_school_role(array['school_admin']) and private.child_data_record_allowed(is_synthetic))
with check (school_id = private.current_school_id() and private.has_school_role(array['school_admin']) and private.child_data_record_allowed(is_synthetic));
drop policy if exists assessments_read_assigned on public.assessments;
create policy assessments_read_assigned on public.assessments for select to authenticated
using (school_id = private.current_school_id() and private.child_data_record_allowed(is_synthetic) and private.can_access_class(class_id));

drop policy if exists scores_enter_assigned on public.assessment_scores;
create policy scores_enter_assigned on public.assessment_scores for insert to authenticated
with check (school_id = private.current_school_id() and entered_by = auth.uid() and private.child_data_record_allowed(is_synthetic)
and exists (select 1 from public.assessments a where a.id = assessment_scores.assessment_id and private.child_data_record_allowed(a.is_synthetic) and private.can_enter_marks(a.class_id, assessment_scores.learning_area_id)));
drop policy if exists scores_read_assigned on public.assessment_scores;
create policy scores_read_assigned on public.assessment_scores for select to authenticated
using (school_id = private.current_school_id() and private.child_data_record_allowed(is_synthetic)
and exists (select 1 from public.assessments a where a.id = assessment_scores.assessment_id and private.child_data_record_allowed(a.is_synthetic) and private.can_access_class(a.class_id, assessment_scores.learning_area_id)));
drop policy if exists scores_update_assigned on public.assessment_scores;
create policy scores_update_assigned on public.assessment_scores for update to authenticated
using (school_id = private.current_school_id() and private.child_data_record_allowed(is_synthetic)
and exists (select 1 from public.assessments a where a.id = assessment_scores.assessment_id and private.child_data_record_allowed(a.is_synthetic) and private.can_enter_marks(a.class_id, assessment_scores.learning_area_id)))
with check (school_id = private.current_school_id() and updated_by = auth.uid() and private.child_data_record_allowed(is_synthetic)
and exists (select 1 from public.assessments a where a.id = assessment_scores.assessment_id and private.child_data_record_allowed(a.is_synthetic) and private.can_enter_marks(a.class_id, assessment_scores.learning_area_id)));

drop policy if exists score_revisions_read_assigned on public.assessment_score_revisions;
create policy score_revisions_read_assigned on public.assessment_score_revisions for select to authenticated
using (school_id = private.current_school_id() and private.child_data_record_allowed(is_synthetic)
and exists (select 1 from public.assessment_scores s join public.assessments a on a.id = s.assessment_id
where s.id = assessment_score_revisions.assessment_score_id and private.child_data_record_allowed(s.is_synthetic) and private.can_access_class(a.class_id, s.learning_area_id)));
drop policy if exists assessment_submissions_read_admin on public.assessment_submissions;
create policy assessment_submissions_read_admin on public.assessment_submissions for select to authenticated
using (school_id = private.current_school_id() and private.has_school_role(array['school_admin']) and private.child_data_record_allowed(is_synthetic));

-- Patch the existing privileged RPC bodies, retaining their workflow and validation logic.
do $migration$
declare fn regprocedure; definition text;
begin
  foreach fn in array array[
    'private.submit_assessment(uuid)'::regprocedure,
    'private.review_assessment(uuid,text)'::regprocedure,
    'private.approve_assessment(uuid,text)'::regprocedure,
    'private.publish_assessment(uuid)'::regprocedure,
    'private.return_assessment_for_correction(uuid,text)'::regprocedure
  ] loop
    definition := pg_get_functiondef(fn);
    definition := replace(definition, 'if not private.child_data_processing_enabled() then',
      'if not private.child_data_record_allowed((select a.is_synthetic from public.assessments a where a.id = p_assessment_id and a.school_id = private.current_school_id())) then');
    execute definition;
  end loop;
  definition := pg_get_functiondef('private.save_assessment_score(uuid,uuid,uuid,numeric,text)'::regprocedure);
  definition := replace(definition,
    'if assessment_row.id is null then
    raise exception ''Assessment not found'';
  end if;',
    'if assessment_row.id is null then
    raise exception ''Assessment not found'';
  end if;
  if not private.child_data_record_allowed(assessment_row.is_synthetic) then
    raise exception ''This assessment is outside the enabled data-processing scope'';
  end if;');
  execute definition;
  definition := pg_get_functiondef('private.create_assessment_with_areas(text,text,date,uuid,uuid,uuid,uuid[])'::regprocedure);
  definition := replace(definition, 'if not public.has_school_role(array[''school_admin'']) then',
    'if not private.child_data_processing_enabled() then raise exception ''Creating non-synthetic assessments is disabled in synthetic-only mode''; end if;
  if not public.has_school_role(array[''school_admin'']) then');
  execute definition;
end;
$migration$;
