CREATE OR REPLACE FUNCTION public.bootstrap_school(school_name text, school_code text DEFAULT NULL::text, school_county text DEFAULT NULL::text, school_sub_county text DEFAULT NULL::text, school_phone text DEFAULT NULL::text, school_email text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  new_school_id uuid;
  actor_id uuid := auth.uid();
begin
  perform pg_advisory_xact_lock(hashtext('sentinel-single-school-bootstrap'));
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if actor_id <> (
    select u.id from auth.users u
    order by u.created_at asc, u.id asc
    limit 1
  ) then
    raise exception 'Only the first provisioned account can complete initial school setup';
  end if;

  if exists (select 1 from public.schools) then
    raise exception 'School setup has already been completed';
  end if;

  if length(trim(coalesce(school_name, ''))) < 2 then
    raise exception 'Enter a valid school name';
  end if;

  insert into public.schools (name, code, county, sub_county, phone, email, created_by)
  values (trim(school_name), nullif(trim(school_code), ''), nullif(trim(school_county), ''),
          nullif(trim(school_sub_county), ''), nullif(trim(school_phone), ''),
          nullif(trim(school_email), ''), actor_id)
  returning id into new_school_id;

  insert into public.school_memberships (school_id, user_id, role, status)
  values (new_school_id, actor_id, 'school_admin', 'active');

  insert into public.audit_events (school_id, actor_id, action, entity_type, entity_id, details)
  values (new_school_id, actor_id, 'school.bootstrapped', 'school', new_school_id,
          jsonb_build_object('school_name', trim(school_name)));

  return new_school_id;
end;
$function$

