-- Save one mark with an immutable correction record when the score changes.
create or replace function public.save_assessment_score(
  p_assessment_id uuid,
  p_learner_id uuid,
  p_learning_area_id uuid,
  p_score numeric,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_id uuid := auth.uid();
  school_id_value uuid := public.current_school_id();
  assessment_row public.assessments%rowtype;
  existing_row public.assessment_scores%rowtype;
  score_id_value uuid;
begin
  if actor_id is null or school_id_value is null then
    raise exception 'An active school account is required';
  end if;
  if p_score is null or p_score < 0 or p_score > 100 then
    raise exception 'Score must be between 0 and 100';
  end if;

  select * into assessment_row
  from public.assessments a
  where a.id = p_assessment_id and a.school_id = school_id_value;

  if assessment_row.id is null then
    raise exception 'Assessment not found';
  end if;
  if assessment_row.status <> 'open' then
    raise exception 'This assessment is not open for mark entry';
  end if;
  if p_score > assessment_row.max_score then
    raise exception 'Score cannot exceed the assessment maximum';
  end if;
  if not public.can_enter_marks(assessment_row.class_id, p_learning_area_id) then
    raise exception 'You are not assigned to enter marks for this class and learning area';
  end if;
  if not exists (
    select 1 from public.assessment_learning_areas al
    where al.assessment_id = p_assessment_id
      and al.learning_area_id = p_learning_area_id
      and al.school_id = school_id_value
  ) then
    raise exception 'This learning area is not part of the assessment';
  end if;
  if not exists (
    select 1 from public.learner_enrollments e
    where e.learner_id = p_learner_id and e.class_id = assessment_row.class_id
      and e.school_id = school_id_value and e.status = 'active'
  ) then
    raise exception 'This learner is not actively enrolled in the assessment class';
  end if;

  select * into existing_row
  from public.assessment_scores s
  where s.assessment_id = p_assessment_id
    and s.learner_id = p_learner_id
    and s.learning_area_id = p_learning_area_id
  for update;

  if existing_row.id is not null then
    if existing_row.score = p_score then
      return existing_row.id;
    end if;
    if length(trim(coalesce(p_reason, ''))) < 3 then
      raise exception 'Provide a reason when correcting an existing mark';
    end if;

    update public.assessment_scores
    set score = p_score, updated_by = actor_id, updated_at = now()
    where id = existing_row.id;

    insert into public.assessment_score_revisions (
      school_id, assessment_score_id, previous_score, new_score, reason, changed_by
    ) values (
      school_id_value, existing_row.id, existing_row.score, p_score, trim(p_reason), actor_id
    );

    score_id_value := existing_row.id;
  else
    insert into public.assessment_scores (
      school_id, assessment_id, learner_id, learning_area_id, score, entered_by, updated_by
    ) values (
      school_id_value, p_assessment_id, p_learner_id, p_learning_area_id, p_score, actor_id, actor_id
    ) returning id into score_id_value;
  end if;

  insert into public.audit_events (school_id, actor_id, action, entity_type, entity_id, details)
  values (
    school_id_value, actor_id,
    case when existing_row.id is null then 'assessment.mark_entered' else 'assessment.mark_corrected' end,
    'assessment_score', score_id_value,
    jsonb_build_object('assessment_id', p_assessment_id, 'learner_id', p_learner_id,
      'learning_area_id', p_learning_area_id, 'score', p_score)
  );

  return score_id_value;
end;
$$;

revoke all on function public.save_assessment_score(uuid,uuid,uuid,numeric,text) from public, anon;
grant execute on function public.save_assessment_score(uuid,uuid,uuid,numeric,text) to authenticated;

