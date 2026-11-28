create table if not exists private.environment_controls (
  control_name text primary key check (control_name = 'child_data_processing_enabled'),
  is_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text not null default current_user
);

comment on table private.environment_controls is
  'Database-owner-managed environment safety switches. Not exposed through Supabase Data API.';

revoke all on table private.environment_controls from public, anon, authenticated;

create or replace function private.child_data_processing_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    (select c.is_enabled from private.environment_controls c
     where c.control_name = 'child_data_processing_enabled'),
    false
  )
$function$;

revoke all on function private.child_data_processing_enabled() from public, anon;
grant execute on function private.child_data_processing_enabled() to authenticated;

insert into private.environment_controls (control_name, is_enabled, updated_at, updated_by)
values ('child_data_processing_enabled', true, now(), current_user)
on conflict (control_name) do update
set is_enabled = true, updated_at = now(), updated_by = current_user;

comment on function private.child_data_processing_enabled()
is 'Returns the database-owner-controlled child-data processing switch. Default is disabled; changes require database-owner access.';
