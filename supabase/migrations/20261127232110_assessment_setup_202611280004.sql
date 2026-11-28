-- Atomic creation of an internal assessment and its learning-area scope.
create or replace function public.create_assessment_with_areas(
  p_title text,
  p_assessment_type text,
  p_assessment_date date,
  p_academic_year_id uuid,
  p_term_id uuid,
  p_class_id uuid,
  p_learning_area_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_id uuid := auth.uid();
  school_id_value uuid := public.current_school_id();
  assessment_id_value uuid;
  class_grade smallint;
  area_count integer;
begin
  if actor_id is null or school_id_value is null then
    raise exception 'An active school account is required';
  end if;
  if not public.has_school_role(array['school_admin']) then
    raise exception 'Only a School Administrator can create assessments';
  end if;
  if length(trim(coalesce(p_title, ''))) < 2 then
    raise exception 'Enter an assessment title';
  end if;
  if p_assessment_type not in ('formative','summative') then
    raise exception 'Choose a valid assessment type';
  end if;

  select c.grade_level into class_grade
  from public.classes c
  where c.id = p_class_id and c.school_id = school_id_value
    and c.academic_year_id = p_academic_year_id and c.is_active;
  if class_grade is null then
    raise exception 'Choose an active class in the selected academic year';
  end if;

  if not exists (
    select 1 from public.academic_years y
    where y.id = p_academic_year_id and y.school_id = school_id_value
  ) then
    raise exception 'The selected academic year does not belong to this school';
  end if;

  if p_term_id is not null and not exists (
    select 1 from public.terms t
    where t.id = p_term_id and t.school_id = school_id_value and t.academic_year_id = p_academic_year_id
  ) then
    raise exception 'The selected term does not belong to this academic year';
  end if;

  select count(*) into area_count
  from public.learning_areas la
  where la.id = any(coalesce(p_learning_area_ids, array[]::uuid[]))
    and la.school_id = school_id_value and la.is_active
    and (la.grade_level is null or la.grade_level = class_grade);

  if area_count = 0 or area_count <> cardinality(coalesce(p_learning_area_ids, array[]::uuid[])) then
    raise exception 'Select one or more valid learning areas for this grade';
  end if;

  insert into public.assessments (
    school_id, academic_year_id, term_id, class_id, title, assessment_type,
    status, assessment_date, created_by
  ) values (
    school_id_value, p_academic_year_id, p_term_id, p_class_id, trim(p_title),
    p_assessment_type, 'open', p_assessment_date, actor_id
  ) returning id into assessment_id_value;

  insert into public.assessment_learning_areas (school_id, assessment_id, learning_area_id)
  select school_id_value, assessment_id_value, unnest(p_learning_area_ids);

  insert into public.audit_events (school_id, actor_id, action, entity_type, entity_id, details)
  values (
    school_id_value, actor_id, 'assessment.created', 'assessment', assessment_id_value,
    jsonb_build_object('title', trim(p_title), 'class_id', p_class_id, 'learning_area_count', area_count)
  );

  return assessment_id_value;
end;
$$;

revoke all on function public.create_assessment_with_areas(text,text,date,uuid,uuid,uuid,uuid[]) from public, anon;
grant execute on function public.create_assessment_with_areas(text,text,date,uuid,uuid,uuid,uuid[]) to authenticated;

