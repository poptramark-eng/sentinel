drop policy if exists audit_events_insert_member on public.audit_events;
drop policy if exists score_revisions_insert_assigned on public.assessment_score_revisions;

revoke insert on public.audit_events from public, anon, authenticated;
revoke insert on public.assessment_score_revisions from public, anon, authenticated;

grant select on public.audit_events to authenticated;
grant select on public.assessment_score_revisions to authenticated;

comment on table public.audit_events is 'Append-only school audit log. Writes are performed only by scoped privileged database functions; authenticated clients have read-only access under RLS.';
comment on table public.assessment_score_revisions is 'Append-only assessment mark correction history. Writes are performed only by the scoped mark-entry function; authenticated clients have read-only access under RLS.';
