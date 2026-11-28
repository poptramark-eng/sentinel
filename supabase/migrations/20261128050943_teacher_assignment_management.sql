create or replace function public.assign_teacher_by_email(
  p_email text,
  p_class_id uuid,
  p_assignment_role text,
  p_learning_area_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  school_id_value uuid := public.current_school_id();
  target_teacher_id uuid;
  class_grade smallint;
  existing_membership record;
  inserted_count integer;
begin
  if actor_id is null or school_id_value is null then
    raise exception 'An active school account is required';
  end if;

  if not public.has_school_role(array['school_admin']) then
    raise exception 'Only a School Administrator can assign teachers';
  end if;

  if p_assignment_role not in ('class_teacher', 'subject_teacher') then
    raise exception 'Choose a valid teacher assignment';
  end if;

  if length(trim(coalesce(p_email, ''))) < 5 then
    raise exception 'Enter a valid teacher email address';
  end if;

  select c.grade_level into class_grade
  from public.classes c
  where c.id = p_class_id
    and c.school_id = school_id_value
    and c.is_active;

  if class_grade is null then
    raise exception 'Choose an active class in this school';
  end if;

  if p_assignment_role = 'class_teacher' then
    if p_learning_area_id is not null then
      raise exception 'A class teacher assignment must not include a learning area';
    end if;
  else
    if p_learning_area_id is null or not exists (
      select 1
      from public.learning_areas la
      where la.id = p_learning_area_id
        and la.school_id = school_id_value
        and la.is_active
        and (la.grade_level is null or la.grade_level = class_grade)
    ) then
      raise exception 'Choose an active learning area for this class grade';
    end if;
  end if;

  select u.id into target_teacher_id
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
    and u.email_confirmed_at is not null
  limit 1;

  if target_teacher_id is null then
    raise exception 'No verified account was found for that email. Create the account in Supabase Auth first.';
  end if;

  if target_teacher_id = actor_id then
    raise exception 'The School Administrator cannot assign their own account as a teacher';
  end if;

  select m.role, m.status into existing_membership
  from public.school_memberships m
  where m.school_id = school_id_value
    and m.user_id = target_teacher_id;

  if found then
    if existing_membership.role = 'school_admin' then
      raise exception 'A School Administrator account cannot be assigned as a teacher';
    end if;
    if existing_membership.status <> 'active' then
      raise exception 'This teacher membership is not active';
    end if;
  else
    insert into public.school_memberships (school_id, user_id, role, status)
    values (school_id_value, target_teacher_id, p_assignment_role, 'active');
  end if;

  insert into public.teacher_assignments (
    school_id, teacher_id, class_id, learning_area_id, assignment_role
  )
  values (
    school_id_value, target_teacher_id, p_class_id, p_learning_area_id, p_assignment_role
  )
  on conflict do nothing;

  get diagnostics inserted_count = row_count;

  if inserted_count = 1 then
    insert into public.audit_events (
      school_id, actor_id, action, entity_type, entity_id, details
    )
    values (
      school_id_value, actor_id, 'teacher.assignment_created', 'teacher_assignment', null,
      jsonb_build_object(
        'teacher_id', target_teacher_id,
        'class_id', p_class_id,
        'assignment_role', p_assignment_role,
        'learning_area_id', p_learning_area_id
      )
    );
  end if;

  return target_teacher_id;
end;
$function$;

revoke all on function public.assign_teacher_by_email(text, uuid, text, uuid) from public, anon;
grant execute on function public.assign_teacher_by_email(text, uuid, text, uuid) to authenticated;

comment on function public.assign_teacher_by_email(text, uuid, text, uuid)
is 'School-admin-only assignment of an already provisioned, verified Supabase Auth user. Does not send invitations or messages.';
