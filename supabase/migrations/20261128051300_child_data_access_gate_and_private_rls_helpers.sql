
-- Internal authorization helpers live outside the exposed Data API schema.
create schema if not exists private;
comment on schema private is 'Internal authorization and data-processing controls; do not expose through the Supabase Data API.';
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.child_data_processing_enabled()
returns boolean
language sql
stable
set search_path = ''
as $function$
  select coalesce(pg_catalog.current_setting('app.child_data_processing_enabled', true), 'false') = 'true'
$function$;

create or replace function private.current_school_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select m.school_id
  from public.school_memberships m
  where m.user_id = (select auth.uid())
    and m.status = 'active'
  order by m.created_at
  limit 1
$function$;

create or replace function private.has_school_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.school_memberships m
    where m.user_id = (select auth.uid())
      and m.school_id = private.current_school_id()
      and m.status = 'active'
      and m.role = any(allowed_roles)
  )
$function$;

create or replace function private.can_access_class(target_class_id uuid, target_learning_area_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.has_school_role(array['school_admin'])
    or exists (
      select 1
      from public.teacher_assignments a
      where a.school_id = private.current_school_id()
        and a.teacher_id = (select auth.uid())
        and a.class_id = target_class_id
        and (
          a.assignment_role = 'class_teacher'
          or (
            a.assignment_role = 'subject_teacher'
            and (target_learning_area_id is null or a.learning_area_id = target_learning_area_id)
          )
        )
    )
$function$;

create or replace function private.can_enter_marks(target_class_id uuid, target_learning_area_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.has_school_role(array['school_admin'])
    or exists (
      select 1
      from public.teacher_assignments a
      where a.school_id = private.current_school_id()
        and a.teacher_id = (select auth.uid())
        and a.class_id = target_class_id
        and a.assignment_role = 'subject_teacher'
        and a.learning_area_id = target_learning_area_id
    )
$function$;

revoke all on function private.child_data_processing_enabled() from public, anon;
revoke all on function private.current_school_id() from public, anon;
revoke all on function private.has_school_role(text[]) from public, anon;
revoke all on function private.can_access_class(uuid, uuid) from public, anon;
revoke all on function private.can_enter_marks(uuid, uuid) from public, anon;
grant execute on function private.child_data_processing_enabled() to authenticated;
grant execute on function private.current_school_id() to authenticated;
grant execute on function private.has_school_role(text[]) to authenticated;
grant execute on function private.can_access_class(uuid, uuid) to authenticated;
grant execute on function private.can_enter_marks(uuid, uuid) to authenticated;

-- Recreate every policy that references the former public helpers, preserving
-- its existing roles, command, permissive mode and predicates.
do $policy_migration$
declare
  policy_row record;
  using_expression text;
  check_expression text;
  statement text;
begin
  for policy_row in
    select *
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') like '%current_school_id()%'
        or coalesce(qual, '') like '%has_school_role(%'
        or coalesce(qual, '') like '%can_access_class(%'
        or coalesce(qual, '') like '%can_enter_marks(%'
        or coalesce(with_check, '') like '%current_school_id()%'
        or coalesce(with_check, '') like '%has_school_role(%'
        or coalesce(with_check, '') like '%can_access_class(%'
        or coalesce(with_check, '') like '%can_enter_marks(%'
      )
  loop
    using_expression := policy_row.qual;
    check_expression := policy_row.with_check;

    if using_expression is not null then
      using_expression := replace(using_expression, 'current_school_id()', 'private.current_school_id()');
      using_expression := replace(using_expression, 'has_school_role(', 'private.has_school_role(');
      using_expression := replace(using_expression, 'can_access_class(', 'private.can_access_class(');
      using_expression := replace(using_expression, 'can_enter_marks(', 'private.can_enter_marks(');
    end if;

    if check_expression is not null then
      check_expression := replace(check_expression, 'current_school_id()', 'private.current_school_id()');
      check_expression := replace(check_expression, 'has_school_role(', 'private.has_school_role(');
      check_expression := replace(check_expression, 'can_access_class(', 'private.can_access_class(');
      check_expression := replace(check_expression, 'can_enter_marks(', 'private.can_enter_marks(');
    end if;

    if policy_row.tablename in ('learners', 'learner_enrollments', 'assessment_scores', 'assessment_score_revisions') then
      if using_expression is not null then
        using_expression := '(select private.child_data_processing_enabled()) AND (' || using_expression || ')';
      end if;
      if check_expression is not null then
        check_expression := '(select private.child_data_processing_enabled()) AND (' || check_expression || ')';
      end if;
    end if;

    if policy_row.tablename = 'audit_events' and policy_row.policyname = 'audit_events_read_admin' then
      using_expression := '(' || using_expression || ') AND ((select private.child_data_processing_enabled()) OR (action not like ''learner.%'' AND action not like ''assessment.mark_%''))';
    end if;

    execute pg_catalog.format('drop policy %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);

    statement := pg_catalog.format(
      'create policy %I on %I.%I as %s for %s to %s',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename,
      policy_row.permissive,
      policy_row.cmd,
      pg_catalog.array_to_string(policy_row.roles, ', ')
    );

    if using_expression is not null then
      statement := statement || ' using (' || using_expression || ')';
    end if;
    if check_expression is not null then
      statement := statement || ' with check (' || check_expression || ')';
    end if;

    execute statement;
  end loop;
end;
$policy_migration$;

-- Authenticated users must use audited RPCs for sensitive writes. RLS still
-- governs reads; these grants prevent bypassing revision/audit workflows.
revoke insert, update, delete on public.learners from authenticated;
revoke insert, update, delete on public.learner_enrollments from authenticated;
revoke insert, update, delete on public.assessment_scores from authenticated;
revoke insert on public.assessment_score_revisions from authenticated;
revoke insert, update, delete on public.teacher_assignments from authenticated;
revoke insert on public.audit_events from authenticated;
grant select on public.learners to authenticated;
grant select on public.learner_enrollments to authenticated;
grant select on public.assessment_scores to authenticated;
grant select on public.assessment_score_revisions to authenticated;
grant select on public.teacher_assignments to authenticated;
grant select on public.audit_events to authenticated;

-- The database-side switch defaults to false. Only a trusted database
-- administrator can change the authenticator role setting; it is not exposed
-- as a user-callable RPC.
create or replace function private.enforce_child_data_processing()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if not private.child_data_processing_enabled() then
    raise exception 'Child-data processing is disabled for this database environment';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function private.enforce_child_data_processing() from public, anon, authenticated;

drop trigger if exists learners_child_data_gate on public.learners;
create trigger learners_child_data_gate
before insert or update or delete on public.learners
for each row execute function private.enforce_child_data_processing();

drop trigger if exists learner_enrollments_child_data_gate on public.learner_enrollments;
create trigger learner_enrollments_child_data_gate
before insert or update or delete on public.learner_enrollments
for each row execute function private.enforce_child_data_processing();

drop trigger if exists assessment_scores_child_data_gate on public.assessment_scores;
create trigger assessment_scores_child_data_gate
before insert or update or delete on public.assessment_scores
for each row execute function private.enforce_child_data_processing();

drop trigger if exists assessment_score_revisions_child_data_gate on public.assessment_score_revisions;
create trigger assessment_score_revisions_child_data_gate
before insert or update or delete on public.assessment_score_revisions
for each row execute function private.enforce_child_data_processing();

-- The older public helper functions are no longer needed by RLS and should not
-- be callable as standalone PostgREST RPC endpoints. SECURITY DEFINER business
-- RPCs retain access as their owner (postgres).
revoke all on function public.current_school_id() from public, anon, authenticated;
revoke all on function public.has_school_role(text[]) from public, anon, authenticated;
revoke all on function public.can_access_class(uuid, uuid) from public, anon, authenticated;
revoke all on function public.can_enter_marks(uuid, uuid) from public, anon, authenticated;

