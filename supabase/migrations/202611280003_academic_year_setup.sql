-- Create an academic year and its three term records atomically.
create unique index if not exists one_current_academic_year_per_school
  on public.academic_years (school_id) where is_current = true;

create or replace function public.create_academic_year_with_terms(
  p_name text,
  p_starts_on date,
  p_ends_on date
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_id uuid := auth.uid();
  school_id_value uuid := public.current_school_id();
  year_id_value uuid;
  make_current boolean;
  term_index integer;
begin
  if actor_id is null or school_id_value is null then
    raise exception 'An active school account is required';
  end if;
  if not public.has_school_role(array['school_admin']) then
    raise exception 'Only a School Administrator can configure academic years';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 or p_ends_on < p_starts_on then
    raise exception 'Enter a valid academic year and date range';
  end if;

  make_current := not exists (
    select 1 from public.academic_years y where y.school_id = school_id_value and y.is_current
  );

  insert into public.academic_years (school_id, name, starts_on, ends_on, is_current)
  values (school_id_value, trim(p_name), p_starts_on, p_ends_on, make_current)
  returning id into year_id_value;

  for term_index in 1..3 loop
    insert into public.terms (school_id, academic_year_id, name, term_number)
    values (school_id_value, year_id_value, 'Term ' || term_index, term_index);
  end loop;

  insert into public.audit_events (school_id, actor_id, action, entity_type, entity_id, details)
  values (
    school_id_value, actor_id, 'academic_year.created', 'academic_year', year_id_value,
    jsonb_build_object('name', trim(p_name), 'starts_on', p_starts_on, 'ends_on', p_ends_on)
  );

  return year_id_value;
end;
$$;

revoke all on function public.create_academic_year_with_terms(text,date,date) from public, anon;
grant execute on function public.create_academic_year_with_terms(text,date,date) to authenticated;
