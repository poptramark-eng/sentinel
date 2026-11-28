-- Single-school first-release foundation for Sentinel.
-- Supabase Auth owns identity; all school data is scoped through trusted memberships.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  county text,
  sub_county text,
  phone text,
  email text,
  address text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('school_admin','class_teacher','subject_teacher')),
  status text not null default 'active' check (status in ('active','suspended','invited')),
  created_at timestamptz not null default now(),
  unique (school_id, user_id)
);

create table if not exists public.academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  unique (school_id, name)
);

create table if not exists public.terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  name text not null,
  term_number smallint not null check (term_number between 1 and 3),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  check (starts_on is null or ends_on is null or ends_on >= starts_on),
  unique (academic_year_id, term_number)
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  grade_level smallint not null check (grade_level between 1 and 9),
  stream text not null default 'A',
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, academic_year_id, grade_level, stream)
);

create table if not exists public.learning_areas (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  code text not null,
  name text not null,
  grade_level smallint check (grade_level between 1 and 9),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, code)
);

create table if not exists public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  learning_area_id uuid references public.learning_areas(id) on delete cascade,
  assignment_role text not null check (assignment_role in ('class_teacher','subject_teacher')),
  created_at timestamptz not null default now(),
  check (
    (assignment_role = 'class_teacher' and learning_area_id is null)
    or (assignment_role = 'subject_teacher' and learning_area_id is not null)
  )
);

create unique index if not exists teacher_class_role_unique
  on public.teacher_assignments (school_id, teacher_id, class_id, assignment_role, coalesce(learning_area_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.learners (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  admission_number text not null,
  given_name text not null,
  family_name text not null,
  other_names text,
  gender text check (gender in ('female','male','other','undisclosed')),
  status text not null default 'active' check (status in ('active','transferred','withdrawn','graduated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, admission_number)
);

create table if not exists public.learner_enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict,
  status text not null default 'active' check (status in ('active','completed','transferred','withdrawn')),
  started_on date not null default current_date,
  ended_on date,
  created_at timestamptz not null default now(),
  unique (learner_id, academic_year_id),
  check (ended_on is null or ended_on >= started_on)
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  term_id uuid references public.terms(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict,
  title text not null,
  assessment_type text not null default 'formative' check (assessment_type in ('formative','summative')),
  status text not null default 'draft' check (status in ('draft','open','submitted','reviewed','published','closed')),
  assessment_date date,
  max_score numeric(5,2) not null default 100 check (max_score > 0 and max_score <= 100),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assessment_learning_areas (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  learning_area_id uuid not null references public.learning_areas(id) on delete restrict,
  unique (assessment_id, learning_area_id)
);

create table if not exists public.assessment_scores (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete restrict,
  learning_area_id uuid not null references public.learning_areas(id) on delete restrict,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  entered_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (assessment_id, learner_id, learning_area_id)
);

create table if not exists public.assessment_score_revisions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  assessment_score_id uuid not null references public.assessment_scores(id) on delete cascade,
  previous_score numeric(5,2) not null,
  new_score numeric(5,2) not null,
  reason text not null,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now(),
  check (previous_score between 0 and 100),
  check (new_score between 0 and 100)
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists memberships_user_status_idx on public.school_memberships(user_id, status);
create index if not exists enrollments_class_year_idx on public.learner_enrollments(school_id, class_id, academic_year_id, status);
create index if not exists learners_name_idx on public.learners(school_id, family_name, given_name);
create index if not exists assessments_class_status_idx on public.assessments(school_id, class_id, status);
create index if not exists scores_assessment_idx on public.assessment_scores(school_id, assessment_id, learning_area_id);

create or replace function public.current_school_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select m.school_id
  from public.school_memberships m
  where m.user_id = (select auth.uid()) and m.status = 'active'
  order by m.created_at
  limit 1
$$;

create or replace function public.has_school_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.school_memberships m
    where m.user_id = (select auth.uid())
      and m.school_id = public.current_school_id()
      and m.status = 'active'
      and m.role = any(allowed_roles)
  )
$$;

create or replace function public.can_access_class(target_class_id uuid, target_learning_area_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.has_school_role(array['school_admin'])
    or exists (
      select 1 from public.teacher_assignments a
      where a.school_id = public.current_school_id()
        and a.teacher_id = (select auth.uid())
        and a.class_id = target_class_id
        and (
          a.assignment_role = 'class_teacher'
          or (a.assignment_role = 'subject_teacher'
              and (target_learning_area_id is null or a.learning_area_id = target_learning_area_id))
        )
    )
$$;

create or replace function public.can_enter_marks(target_class_id uuid, target_learning_area_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.has_school_role(array['school_admin'])
    or exists (
      select 1 from public.teacher_assignments a
      where a.school_id = public.current_school_id()
        and a.teacher_id = (select auth.uid())
        and a.class_id = target_class_id
        and a.assignment_role = 'subject_teacher'
        and a.learning_area_id = target_learning_area_id
    )
$$;

create or replace function public.bootstrap_school(
  school_name text,
  school_code text default null,
  school_county text default null,
  school_sub_county text default null,
  school_phone text default null,
  school_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  new_school_id uuid;
  actor_id uuid := auth.uid();
begin
  perform pg_advisory_xact_lock(hashtext('sentinel-single-school-bootstrap'));
  if actor_id is null then
    raise exception 'Authentication required';
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
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

revoke all on function public.current_school_id() from public, anon;
revoke all on function public.has_school_role(text[]) from public, anon;
revoke all on function public.can_access_class(uuid, uuid) from public, anon;
revoke all on function public.can_enter_marks(uuid, uuid) from public, anon;
revoke all on function public.bootstrap_school(text,text,text,text,text,text) from public, anon;
grant execute on function public.current_school_id() to authenticated;
grant execute on function public.has_school_role(text[]) to authenticated;
grant execute on function public.can_access_class(uuid, uuid) to authenticated;
grant execute on function public.can_enter_marks(uuid, uuid) to authenticated;
grant execute on function public.bootstrap_school(text,text,text,text,text,text) to authenticated;

alter table public.profiles enable row level security;
alter table public.schools enable row level security;
alter table public.school_memberships enable row level security;
alter table public.academic_years enable row level security;
alter table public.terms enable row level security;
alter table public.classes enable row level security;
alter table public.learning_areas enable row level security;
alter table public.teacher_assignments enable row level security;
alter table public.learners enable row level security;
alter table public.learner_enrollments enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_learning_areas enable row level security;
alter table public.assessment_scores enable row level security;
alter table public.assessment_score_revisions enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_read_school on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1 from public.school_memberships m
    where m.user_id = profiles.id
      and m.school_id = public.current_school_id()
      and m.status = 'active'
  )
);
create policy profiles_update_self on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy schools_read_member on public.schools for select to authenticated
using (id = public.current_school_id());
create policy schools_update_admin on public.schools for update to authenticated
using (id = public.current_school_id() and public.has_school_role(array['school_admin']))
with check (id = public.current_school_id() and public.has_school_role(array['school_admin']));

create policy memberships_read_school on public.school_memberships for select to authenticated
using (school_id = public.current_school_id());
create policy memberships_update_admin on public.school_memberships for update to authenticated
using (school_id = public.current_school_id() and public.has_school_role(array['school_admin']))
with check (school_id = public.current_school_id() and public.has_school_role(array['school_admin']));

create policy academic_years_read_school on public.academic_years for select to authenticated
using (school_id = public.current_school_id());
create policy academic_years_admin_write on public.academic_years for all to authenticated
using (school_id = public.current_school_id() and public.has_school_role(array['school_admin']))
with check (school_id = public.current_school_id() and public.has_school_role(array['school_admin']));

create policy terms_read_school on public.terms for select to authenticated
using (school_id = public.current_school_id());
create policy terms_admin_write on public.terms for all to authenticated
using (school_id = public.current_school_id() and public.has_school_role(array['school_admin']))
with check (school_id = public.current_school_id() and public.has_school_role(array['school_admin']));

create policy classes_read_assigned on public.classes for select to authenticated
using (school_id = public.current_school_id() and public.can_access_class(id));
create policy classes_admin_write on public.classes for all to authenticated
using (school_id = public.current_school_id() and public.has_school_role(array['school_admin']))
with check (school_id = public.current_school_id() and public.has_school_role(array['school_admin']));

create policy learning_areas_read_school on public.learning_areas for select to authenticated
using (school_id = public.current_school_id());
create policy learning_areas_admin_write on public.learning_areas for all to authenticated
using (school_id = public.current_school_id() and public.has_school_role(array['school_admin']))
with check (school_id = public.current_school_id() and public.has_school_role(array['school_admin']));

create policy teacher_assignments_read on public.teacher_assignments for select to authenticated
using (
  school_id = public.current_school_id()
  and (public.has_school_role(array['school_admin']) or teacher_id = (select auth.uid()) or public.can_access_class(class_id))
);
create policy teacher_assignments_admin_write on public.teacher_assignments for all to authenticated
using (school_id = public.current_school_id() and public.has_school_role(array['school_admin']))
with check (school_id = public.current_school_id() and public.has_school_role(array['school_admin']));

create policy learners_read_assigned on public.learners for select to authenticated
using (
  school_id = public.current_school_id()
  and exists (
    select 1 from public.learner_enrollments e
    where e.learner_id = learners.id and e.school_id = learners.school_id
      and e.status = 'active' and public.can_access_class(e.class_id)
  )
);
create policy learners_admin_write on public.learners for all to authenticated
using (school_id = public.current_school_id() and public.has_school_role(array['school_admin']))
with check (school_id = public.current_school_id() and public.has_school_role(array['school_admin']));

create policy enrollments_read_assigned on public.learner_enrollments for select to authenticated
using (school_id = public.current_school_id() and public.can_access_class(class_id));
create policy enrollments_admin_write on public.learner_enrollments for all to authenticated
using (school_id = public.current_school_id() and public.has_school_role(array['school_admin']))
with check (school_id = public.current_school_id() and public.has_school_role(array['school_admin']));

create policy assessments_read_assigned on public.assessments for select to authenticated
using (school_id = public.current_school_id() and public.can_access_class(class_id));
create policy assessments_admin_write on public.assessments for all to authenticated
using (school_id = public.current_school_id() and public.has_school_role(array['school_admin']))
with check (school_id = public.current_school_id() and public.has_school_role(array['school_admin']));

create policy assessment_areas_read_assigned on public.assessment_learning_areas for select to authenticated
using (
  school_id = public.current_school_id()
  and exists (
    select 1 from public.assessments a
    where a.id = assessment_id and public.can_access_class(a.class_id, learning_area_id)
  )
);
create policy assessment_areas_admin_write on public.assessment_learning_areas for all to authenticated
using (school_id = public.current_school_id() and public.has_school_role(array['school_admin']))
with check (school_id = public.current_school_id() and public.has_school_role(array['school_admin']));

create policy scores_read_assigned on public.assessment_scores for select to authenticated
using (
  school_id = public.current_school_id()
  and exists (
    select 1 from public.assessments a
    where a.id = assessment_id and public.can_access_class(a.class_id, learning_area_id)
  )
);
create policy scores_enter_assigned on public.assessment_scores for insert to authenticated
with check (
  school_id = public.current_school_id()
  and entered_by = (select auth.uid())
  and exists (
    select 1 from public.assessments a
    where a.id = assessment_id and public.can_enter_marks(a.class_id, learning_area_id)
  )
);
create policy scores_update_assigned on public.assessment_scores for update to authenticated
using (
  school_id = public.current_school_id()
  and exists (
    select 1 from public.assessments a
    where a.id = assessment_id and public.can_enter_marks(a.class_id, learning_area_id)
  )
)
with check (
  school_id = public.current_school_id()
  and updated_by = (select auth.uid())
  and exists (
    select 1 from public.assessments a
    where a.id = assessment_id and public.can_enter_marks(a.class_id, learning_area_id)
  )
);

create policy score_revisions_read_assigned on public.assessment_score_revisions for select to authenticated
using (
  school_id = public.current_school_id()
  and exists (
    select 1 from public.assessment_scores s
    join public.assessments a on a.id = s.assessment_id
    where s.id = assessment_score_id and public.can_access_class(a.class_id, s.learning_area_id)
  )
);
create policy score_revisions_insert_assigned on public.assessment_score_revisions for insert to authenticated
with check (
  school_id = public.current_school_id()
  and changed_by = (select auth.uid())
  and exists (
    select 1 from public.assessment_scores s
    join public.assessments a on a.id = s.assessment_id
    where s.id = assessment_score_id and public.can_enter_marks(a.class_id, s.learning_area_id)
  )
);

create policy audit_events_read_admin on public.audit_events for select to authenticated
using (school_id = public.current_school_id() and public.has_school_role(array['school_admin']));
create policy audit_events_insert_member on public.audit_events for insert to authenticated
with check (school_id = public.current_school_id() and actor_id = (select auth.uid()));

grant select, update on public.profiles to authenticated;
grant select, update on public.schools to authenticated;
grant select, update on public.school_memberships to authenticated;
grant select, insert, update, delete on public.academic_years to authenticated;
grant select, insert, update, delete on public.terms to authenticated;
grant select, insert, update, delete on public.classes to authenticated;
grant select, insert, update, delete on public.learning_areas to authenticated;
grant select, insert, update, delete on public.teacher_assignments to authenticated;
grant select, insert, update, delete on public.learners to authenticated;
grant select, insert, update, delete on public.learner_enrollments to authenticated;
grant select, insert, update, delete on public.assessments to authenticated;
grant select, insert, update, delete on public.assessment_learning_areas to authenticated;
grant select, insert, update on public.assessment_scores to authenticated;
grant select, insert on public.assessment_score_revisions to authenticated;
grant select, insert on public.audit_events to authenticated;

