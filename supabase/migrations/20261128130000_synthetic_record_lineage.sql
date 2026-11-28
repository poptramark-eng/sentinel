-- Explicitly classify synthetic learner and assessment records in the database.
-- Real school identity, curriculum and staff remain production records.
alter table public.learners
  add column if not exists is_synthetic boolean not null default false;
alter table public.assessments
  add column if not exists is_synthetic boolean not null default false;
alter table public.assessment_scores
  add column if not exists is_synthetic boolean not null default false;
alter table public.assessment_score_revisions
  add column if not exists is_synthetic boolean not null default false;
alter table public.assessment_submissions
  add column if not exists is_synthetic boolean not null default false;

comment on column public.learners.is_synthetic is
  'True only for fictional learner records intentionally seeded for the production walkthrough.';
comment on column public.assessments.is_synthetic is
  'True only for fictional assessments intentionally seeded for the production walkthrough.';
comment on column public.assessment_scores.is_synthetic is
  'Derived from the learner and assessment synthetic classifications; mixed-origin scores are rejected.';
comment on column public.assessment_score_revisions.is_synthetic is
  'Inherited from the score being revised.';
comment on column public.assessment_submissions.is_synthetic is
  'Inherited from the assessment; also copied into the immutable snapshot.';

-- The current production seed is a known, audited synthetic-only dataset.
update public.learners
set is_synthetic = true
where school_id = '47c5bdeb-b6a6-4854-b97d-f6504c116fcc'
  and admission_number like 'DEMO-G_-___';

update public.assessments
set is_synthetic = true
where school_id = '47c5bdeb-b6a6-4854-b97d-f6504c116fcc'
  and title in (
    'Grade 4 A — Term 3 Formative Assessment 1',
    'Grade 5 A — Term 3 Formative Assessment 1',
    'Grade 4 A — Term 3 Summative Assessment',
    'Grade 5 A — Term 3 Summative Assessment'
  );

update public.assessment_scores s
set is_synthetic = true
from public.learners l, public.assessments a
where s.school_id = '47c5bdeb-b6a6-4854-b97d-f6504c116fcc'
  and l.id = s.learner_id and l.school_id = s.school_id and l.is_synthetic
  and a.id = s.assessment_id and a.school_id = s.school_id and a.is_synthetic;

create or replace function private.enforce_school_record_classification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Browser-authenticated users cannot turn real school records into demo data
  -- or relabel synthetic records as real. Trusted database/service operations
  -- may set the flag deliberately.
  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' then
      new.is_synthetic := false;
    else
      new.is_synthetic := old.is_synthetic;
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function private.enforce_school_record_classification() from public, anon, authenticated;

drop trigger if exists learners_synthetic_classification on public.learners;
create trigger learners_synthetic_classification
before insert or update on public.learners
for each row execute function private.enforce_school_record_classification();

drop trigger if exists assessments_synthetic_classification on public.assessments;
create trigger assessments_synthetic_classification
before insert or update on public.assessments
for each row execute function private.enforce_school_record_classification();

create or replace function private.enforce_assessment_score_classification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  learner_is_synthetic boolean;
  assessment_is_synthetic boolean;
begin
  select l.is_synthetic, a.is_synthetic
    into learner_is_synthetic, assessment_is_synthetic
  from public.learners l
  join public.assessments a
    on a.id = new.assessment_id
   and a.school_id = new.school_id
  where l.id = new.learner_id
    and l.school_id = new.school_id;

  if not found then
    raise exception 'The learner and assessment must belong to the same school';
  end if;

  if learner_is_synthetic is distinct from assessment_is_synthetic then
    raise exception 'Synthetic and production learners/assessments cannot be mixed in one score';
  end if;

  new.is_synthetic := learner_is_synthetic;
  return new;
end;
$function$;

revoke all on function private.enforce_assessment_score_classification() from public, anon, authenticated;

drop trigger if exists assessment_scores_synthetic_classification on public.assessment_scores;
create trigger assessment_scores_synthetic_classification
before insert or update on public.assessment_scores
for each row execute function private.enforce_assessment_score_classification();

create or replace function private.inherit_score_revision_classification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  select s.is_synthetic into new.is_synthetic
  from public.assessment_scores s
  where s.id = new.assessment_score_id
    and s.school_id = new.school_id;

  if not found then
    raise exception 'The score revision must reference a score in the same school';
  end if;
  return new;
end;
$function$;

revoke all on function private.inherit_score_revision_classification() from public, anon, authenticated;

drop trigger if exists assessment_score_revisions_synthetic_classification on public.assessment_score_revisions;
create trigger assessment_score_revisions_synthetic_classification
before insert or update on public.assessment_score_revisions
for each row execute function private.inherit_score_revision_classification();

create or replace function private.inherit_submission_classification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  select a.is_synthetic into new.is_synthetic
  from public.assessments a
  where a.id = new.assessment_id
    and a.school_id = new.school_id;

  if not found then
    raise exception 'The submission must reference an assessment in the same school';
  end if;

  new.snapshot := pg_catalog.jsonb_set(
    coalesce(new.snapshot, '{}'::jsonb),
    '{is_synthetic}',
    pg_catalog.to_jsonb(new.is_synthetic),
    true
  );
  return new;
end;
$function$;

revoke all on function private.inherit_submission_classification() from public, anon, authenticated;

drop trigger if exists assessment_submissions_synthetic_classification on public.assessment_submissions;
create trigger assessment_submissions_synthetic_classification
before insert or update on public.assessment_submissions
for each row execute function private.inherit_submission_classification();
