create or replace function private.learner_record_allowed(p_learner_id uuid, p_school_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select coalesce((select private.child_data_record_allowed(l.is_synthetic)
    from public.learners l where l.id = p_learner_id and l.school_id = p_school_id), false)
$function$;
revoke all on function private.learner_record_allowed(uuid,uuid) from public, anon;
grant execute on function private.learner_record_allowed(uuid,uuid) to authenticated;

drop policy if exists enrollments_admin_write on public.learner_enrollments;
create policy enrollments_admin_write on public.learner_enrollments for all to authenticated
using (school_id = private.current_school_id() and private.has_school_role(array['school_admin'])
  and private.learner_record_allowed(learner_id, school_id))
with check (school_id = private.current_school_id() and private.has_school_role(array['school_admin'])
  and private.learner_record_allowed(learner_id, school_id));

drop policy if exists enrollments_read_assigned on public.learner_enrollments;
create policy enrollments_read_assigned on public.learner_enrollments for select to authenticated
using (school_id = private.current_school_id()
  and private.learner_record_allowed(learner_id, school_id)
  and private.can_access_class(class_id));
