do $seed_guard$
begin
  if not private.child_data_processing_enabled() then
    raise exception 'Refusing to seed learner data while the child-data gate is disabled';
  end if;
end;
$seed_guard$;

with y as (
  select id, school_id from public.academic_years
  where school_id = '47c5bdeb-b6a6-4854-b97d-f6504c116fcc' and name = '2026'
),
t as (
  select id from public.terms where academic_year_id = (select id from y) and term_number = 3
),
c as (
  select id, display_name from public.classes
  where school_id = '47c5bdeb-b6a6-4854-b97d-f6504c116fcc'
    and grade_level in (4,5) and stream = 'A' and academic_year_id = (select id from y)
)
insert into public.assessments (
  school_id, academic_year_id, term_id, class_id, title,
  assessment_type, status, assessment_date, max_score, created_by
)
select y.school_id, y.id, t.id, c.id,
       c.display_name || ' — Term 3 Summative Assessment',
       'summative', 'open', date '2026-11-28', 100,
       '02f4e222-4471-4aae-b811-b34dc6aa51a8'
from c cross join y cross join t
where not exists (
  select 1 from public.assessments a
  where a.school_id = y.school_id and a.class_id = c.id
    and a.title = c.display_name || ' — Term 3 Summative Assessment'
);

insert into public.assessment_learning_areas (school_id, assessment_id, learning_area_id)
select a.school_id, a.id, la.id
from public.assessments a
join public.classes c on c.id = a.class_id and c.school_id = a.school_id
join public.learning_areas la on la.school_id = a.school_id and la.grade_level = c.grade_level
where a.school_id = '47c5bdeb-b6a6-4854-b97d-f6504c116fcc'
  and a.title like '%Term 3%'
on conflict (assessment_id, learning_area_id) do nothing;

with demo_people(grade_level, seq, given_name, gender) as (
  values
    (4,1,'Amani','female'), (4,2,'Baraka','male'),
    (4,3,'Chao','female'), (4,4,'Dalia','female'),
    (4,5,'Enock','male'), (4,6,'Farida','female'),
    (4,7,'Gift','undisclosed'), (4,8,'Hellen','female'),
    (4,9,'Ian','male'), (4,10,'Jalia','female'),
    (5,1,'Kelvin','male'), (5,2,'Lorna','female'),
    (5,3,'Musa','male'), (5,4,'Nia','female'),
    (5,5,'Otis','male'), (5,6,'Pendo','female'),
    (5,7,'Quincy','undisclosed'), (5,8,'Rina','female'),
    (5,9,'Samwel','male'), (5,10,'Talia','female')
)
insert into public.learners (
  school_id, admission_number, given_name, family_name, other_names, gender, status
)
select
  '47c5bdeb-b6a6-4854-b97d-f6504c116fcc',
  'DEMO-G' || p.grade_level || '-' || lpad(p.seq::text, 3, '0'),
  p.given_name, 'Demo', 'Learner ' || lpad(p.seq::text, 2, '0'), p.gender, 'active'
from demo_people p
on conflict (school_id, admission_number) do nothing;

insert into public.learner_enrollments (
  school_id, learner_id, academic_year_id, class_id, status, started_on
)
select l.school_id, l.id, y.id, c.id, 'active', date '2026-09-01'
from public.learners l
join public.academic_years y on y.school_id = l.school_id and y.name = '2026'
join public.classes c
  on c.school_id = l.school_id
 and c.academic_year_id = y.id
 and c.grade_level = substring(split_part(l.admission_number, '-', 2) from 2)::smallint
 and c.stream = 'A'
where l.school_id = '47c5bdeb-b6a6-4854-b97d-f6504c116fcc'
  and l.admission_number like 'DEMO-G_-___'
on conflict (learner_id, academic_year_id) do nothing;

with learner_ranked as (
  select l.id as learner_id, l.school_id, e.class_id,
         row_number() over (partition by e.class_id order by l.admission_number) as learner_n
  from public.learners l
  join public.learner_enrollments e
    on e.learner_id = l.id and e.school_id = l.school_id and e.status = 'active'
  where l.school_id = '47c5bdeb-b6a6-4854-b97d-f6504c116fcc'
    and l.admission_number like 'DEMO-G_-___'
),
area_ranked as (
  select a.id as assessment_id, a.school_id, a.class_id, ala.learning_area_id,
         row_number() over (partition by a.id order by la.code) as area_n
  from public.assessments a
  join public.assessment_learning_areas ala
    on ala.assessment_id = a.id and ala.school_id = a.school_id
  join public.learning_areas la
    on la.id = ala.learning_area_id and la.school_id = ala.school_id
  where a.school_id = '47c5bdeb-b6a6-4854-b97d-f6504c116fcc'
    and a.assessment_type = 'formative'
    and a.title like '%Term 3 Formative Assessment 1%'
)
insert into public.assessment_scores (
  school_id, assessment_id, learner_id, learning_area_id, score, entered_by, updated_by
)
select ar.school_id, ar.assessment_id, lr.learner_id, ar.learning_area_id,
       (50 + ((lr.learner_n * 7 + ar.area_n * 11) % 46))::numeric,
       '02f4e222-4471-4aae-b811-b34dc6aa51a8',
       '02f4e222-4471-4aae-b811-b34dc6aa51a8'
from learner_ranked lr
join area_ranked ar on ar.school_id = lr.school_id and ar.class_id = lr.class_id
on conflict (assessment_id, learner_id, learning_area_id) do nothing;

insert into public.audit_events (school_id, actor_id, action, entity_type, entity_id, details)
select
  '47c5bdeb-b6a6-4854-b97d-f6504c116fcc',
  '02f4e222-4471-4aae-b811-b34dc6aa51a8',
  'demo.seeded', 'demo_dataset', null,
  jsonb_build_object(
    'seed_key', 'sentinel-demo-2026-11-28-v1',
    'synthetic_only', true,
    'learners', 20,
    'classes', 2,
    'learning_areas_per_grade', 9,
    'formative_marks_expected', 180,
    'created_at', now()
  )
where not exists (
  select 1 from public.audit_events
  where school_id = '47c5bdeb-b6a6-4854-b97d-f6504c116fcc'
    and action = 'demo.seeded'
    and details ->> 'seed_key' = 'sentinel-demo-2026-11-28-v1'
);
