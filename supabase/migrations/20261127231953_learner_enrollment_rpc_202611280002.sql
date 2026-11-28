-- Atomic learner admission and class placement workflow.
create or replace function public.create_learner_with_enrollment(
  p_admission_number text,
  p_given_name text,
  p_family_name text,
  p_academic_year_id uuid,
  p_class_id uuid,
  p_other_names text default null,
  p_gender text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_id uuid := auth.uid();
  school_id_value uuid := public.current_school_id();
  learner_id_value uuid;
begin
  if actor_id is null or school_id_value is null then
    raise exception 'An active school account is required';
  end if;
  if not public.has_school_role(array['school_admin']) then
    raise exception 'Only a School Administrator can register learners';
  end if;
  if length(trim(coalesce(p_admission_number, ''))) = 0
     or length(trim(coalesce(p_given_name, ''))) = 0
     or length(trim(coalesce(p_family_name, ''))) = 0 then
    raise exception 'Admission number, given name and family name are required';
  end if;
  if not exists (
    select 1 from public.classes c
    where c.id = p_class_id and c.school_id = school_id_value
  ) then
    raise exception 'The selected class is not part of this school';
  end if;
  if not exists (
    select 1 from public.academic_years y
    where y.id = p_academic_year_id and y.school_id = school_id_value
  ) then
    raise exception 'The selected academic year is not part of this school';
  end if;

  insert into public.learners (
    school_id, admission_number, given_name, family_name, other_names, gender
  ) values (
    school_id_value, trim(p_admission_number), trim(p_given_name), trim(p_family_name),
    nullif(trim(coalesce(p_other_names, '')), ''), nullif(trim(coalesce(p_gender, '')), '')
  )
  returning id into learner_id_value;

  insert into public.learner_enrollments (
    school_id, learner_id, academic_year_id, class_id, status
  ) values (
    school_id_value, learner_id_value, p_academic_year_id, p_class_id, 'active'
  );

  insert into public.audit_events (school_id, actor_id, action, entity_type, entity_id, details)
  values (
    school_id_value, actor_id, 'learner.created', 'learner', learner_id_value,
    jsonb_build_object('admission_number', trim(p_admission_number), 'class_id', p_class_id)
  );

  return learner_id_value;
end;
$$;

revoke all on function public.create_learner_with_enrollment(text,text,text,uuid,uuid,text,text) from public, anon;
grant execute on function public.create_learner_with_enrollment(text,text,text,uuid,uuid,text,text) to authenticated;

