
create or replace function public.child_data_processing_is_enabled()
returns boolean
language sql
stable
set search_path = ''
as $function$
  select private.child_data_processing_enabled()
$function$;

revoke all on function public.child_data_processing_is_enabled() from public, anon;
grant execute on function public.child_data_processing_is_enabled() to authenticated;

comment on function public.child_data_processing_is_enabled()
is 'Read-only status of the database child-data processing gate; enabled only by trusted database configuration.';

revoke insert, update, delete on public.assessment_score_revisions from public, anon, authenticated;
revoke insert, update, delete on public.audit_events from public, anon, authenticated;
grant select on public.assessment_score_revisions to authenticated;
grant select on public.audit_events to authenticated;

