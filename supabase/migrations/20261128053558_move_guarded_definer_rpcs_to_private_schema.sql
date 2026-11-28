alter function public.assign_teacher_by_email(text, uuid, text, uuid) set schema private;
alter function public.bootstrap_school(text, text, text, text, text, text) set schema private;
alter function public.create_academic_year_with_terms(text, date, date) set schema private;
alter function public.create_assessment_with_areas(text, text, date, uuid, uuid, uuid, uuid[]) set schema private;
alter function public.create_learner_with_enrollment(text, text, text, uuid, uuid, text, text) set schema private;
alter function public.save_assessment_score(uuid, uuid, uuid, numeric, text) set schema private;

revoke all on function private.assign_teacher_by_email(text, uuid, text, uuid) from public, anon, authenticated;
revoke all on function private.bootstrap_school(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function private.create_academic_year_with_terms(text, date, date) from public, anon, authenticated;
revoke all on function private.create_assessment_with_areas(text, text, date, uuid, uuid, uuid, uuid[]) from public, anon, authenticated;
revoke all on function private.create_learner_with_enrollment(text, text, text, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function private.save_assessment_score(uuid, uuid, uuid, numeric, text) from public, anon, authenticated;

grant execute on function private.assign_teacher_by_email(text, uuid, text, uuid) to authenticated;
grant execute on function private.bootstrap_school(text, text, text, text, text, text) to authenticated;
grant execute on function private.create_academic_year_with_terms(text, date, date) to authenticated;
grant execute on function private.create_assessment_with_areas(text, text, date, uuid, uuid, uuid, uuid[]) to authenticated;
grant execute on function private.create_learner_with_enrollment(text, text, text, uuid, uuid, text, text) to authenticated;
grant execute on function private.save_assessment_score(uuid, uuid, uuid, numeric, text) to authenticated;

create function public.assign_teacher_by_email(
  p_email text,
  p_class_id uuid,
  p_assignment_role text,
  p_learning_area_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.assign_teacher_by_email(p_email, p_class_id, p_assignment_role, p_learning_area_id)
$function$;

create function public.bootstrap_school(
  school_name text,
  school_code text default null,
  school_county text default null,
  school_sub_county text default null,
  school_phone text default null,
  school_email text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.bootstrap_school(school_name, school_code, school_county, school_sub_county, school_phone, school_email)
$function$;

create function public.create_academic_year_with_terms(
  p_name text,
  p_starts_on date,
  p_ends_on date
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.create_academic_year_with_terms(p_name, p_starts_on, p_ends_on)
$function$;

create function public.create_assessment_with_areas(
  p_title text,
  p_assessment_type text,
  p_assessment_date date,
  p_academic_year_id uuid,
  p_term_id uuid,
  p_class_id uuid,
  p_learning_area_ids uuid[]
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.create_assessment_with_areas(
    p_title, p_assessment_type, p_assessment_date,
    p_academic_year_id, p_term_id, p_class_id, p_learning_area_ids
  )
$function$;

create function public.create_learner_with_enrollment(
  p_admission_number text,
  p_given_name text,
  p_family_name text,
  p_academic_year_id uuid,
  p_class_id uuid,
  p_other_names text default null,
  p_gender text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.create_learner_with_enrollment(
    p_admission_number, p_given_name, p_family_name,
    p_academic_year_id, p_class_id, p_other_names, p_gender
  )
$function$;

create function public.save_assessment_score(
  p_assessment_id uuid,
  p_learner_id uuid,
  p_learning_area_id uuid,
  p_score numeric,
  p_reason text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.save_assessment_score(
    p_assessment_id, p_learner_id, p_learning_area_id, p_score, p_reason
  )
$function$;

revoke all on function public.assign_teacher_by_email(text, uuid, text, uuid) from public, anon;
revoke all on function public.bootstrap_school(text, text, text, text, text, text) from public, anon;
revoke all on function public.create_academic_year_with_terms(text, date, date) from public, anon;
revoke all on function public.create_assessment_with_areas(text, text, date, uuid, uuid, uuid, uuid[]) from public, anon;
revoke all on function public.create_learner_with_enrollment(text, text, text, uuid, uuid, text, text) from public, anon;
revoke all on function public.save_assessment_score(uuid, uuid, uuid, numeric, text) from public, anon;

grant execute on function public.assign_teacher_by_email(text, uuid, text, uuid) to authenticated;
grant execute on function public.bootstrap_school(text, text, text, text, text, text) to authenticated;
grant execute on function public.create_academic_year_with_terms(text, date, date) to authenticated;
grant execute on function public.create_assessment_with_areas(text, text, date, uuid, uuid, uuid, uuid[]) to authenticated;
grant execute on function public.create_learner_with_enrollment(text, text, text, uuid, uuid, text, text) to authenticated;
grant execute on function public.save_assessment_score(uuid, uuid, uuid, numeric, text) to authenticated;

comment on schema private is 'Unexposed implementation schema for privileged, tenant-scoped database functions and internal RLS helpers.';
