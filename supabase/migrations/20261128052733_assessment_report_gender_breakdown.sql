CREATE OR REPLACE FUNCTION private.submit_assessment(p_assessment_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := auth.uid();
  school_id_value uuid := private.current_school_id();
  assessment_row public.assessments%rowtype;
  class_row public.classes%rowtype;
  learner_count integer;
  area_count integer;
  missing_count integer;
  next_version integer;
  submission_id uuid;
  snapshot_value jsonb;
begin
  if actor_id is null or school_id_value is null then
    raise exception 'An active school account is required';
  end if;
  if not private.child_data_processing_enabled() then
    raise exception 'Child-data processing is disabled for this database environment';
  end if;

  select * into assessment_row
  from public.assessments a
  where a.id = p_assessment_id and a.school_id = school_id_value
  for update;
  if not found then
    raise exception 'Assessment not found in this school';
  end if;
  if assessment_row.status <> 'open' then
    raise exception 'Only an open assessment can be submitted';
  end if;

  if not private.has_school_role(array['school_admin'])
    and not exists (
      select 1 from public.teacher_assignments ta
      where ta.school_id = school_id_value
        and ta.teacher_id = actor_id
        and ta.class_id = assessment_row.class_id
        and ta.assignment_role = 'class_teacher'
    ) then
    raise exception 'Only the assigned class teacher or School Administrator can submit this class';
  end if;

  select * into class_row
  from public.classes c
  where c.id = assessment_row.class_id and c.school_id = school_id_value;

  select count(*) into learner_count
  from public.learner_enrollments e
  where e.school_id = school_id_value
    and e.class_id = assessment_row.class_id
    and e.academic_year_id = assessment_row.academic_year_id
    and e.status = 'active';

  select count(*) into area_count
  from public.assessment_learning_areas ala
  where ala.assessment_id = assessment_row.id;

  if learner_count = 0 then
    raise exception 'A class must have active learners before submission';
  end if;
  if area_count = 0 then
    raise exception 'Add at least one learning area before submission';
  end if;

  select count(*) into missing_count
  from (
    select e.learner_id, ala.learning_area_id
    from public.learner_enrollments e
    cross join public.assessment_learning_areas ala
    where e.school_id = school_id_value
      and e.class_id = assessment_row.class_id
      and e.academic_year_id = assessment_row.academic_year_id
      and e.status = 'active'
      and ala.assessment_id = assessment_row.id
    except
    select s.learner_id, s.learning_area_id
    from public.assessment_scores s
    where s.assessment_id = assessment_row.id
  ) missing_marks;

  if missing_count > 0 then
    raise exception 'Submission blocked: % required learner marks are missing', missing_count;
  end if;

  select coalesce(max(s.version), 0) + 1 into next_version
  from public.assessment_submissions s
  where s.assessment_id = assessment_row.id;

  snapshot_value := jsonb_build_object(
    'assessment', jsonb_build_object(
      'id', assessment_row.id,
      'title', assessment_row.title,
      'assessment_type', assessment_row.assessment_type,
      'assessment_date', assessment_row.assessment_date,
      'max_score', assessment_row.max_score,
      'academic_year_id', assessment_row.academic_year_id
    ),
    'class', jsonb_build_object(
      'id', class_row.id,
      'display_name', class_row.display_name,
      'grade_level', class_row.grade_level,
      'stream', class_row.stream
    ),
    'learning_areas', (
      select coalesce(
        jsonb_agg(jsonb_build_object('id', la.id, 'code', la.code, 'name', la.name) order by la.name),
        '[]'::jsonb
      )
      from public.assessment_learning_areas ala
      join public.learning_areas la on la.id = ala.learning_area_id
      where ala.assessment_id = assessment_row.id
    ),
    'learners', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', l.id,
            'admission_number', l.admission_number,
            'name', pg_catalog.concat_ws(' ', l.given_name, nullif(l.other_names, ''), l.family_name),
            'gender', l.gender,
            'average', (
              select round(avg(s.score), 2)
              from public.assessment_scores s
              where s.assessment_id = assessment_row.id
                and s.learner_id = l.id
            ),
            'scores', (
              select coalesce(
                jsonb_agg(
                  jsonb_build_object(
                    'learning_area_id', la2.id,
                    'learning_area_name', la2.name,
                    'score', s2.score
                  ) order by la2.name
                ),
                '[]'::jsonb
              )
              from public.assessment_learning_areas ala2
              join public.learning_areas la2 on la2.id = ala2.learning_area_id
              join public.assessment_scores s2
                on s2.assessment_id = assessment_row.id
               and s2.learner_id = l.id
               and s2.learning_area_id = la2.id
              where ala2.assessment_id = assessment_row.id
            )
          ) order by l.family_name, l.given_name
        ),
        '[]'::jsonb
      )
      from public.learner_enrollments e
      join public.learners l on l.id = e.learner_id and l.school_id = e.school_id
      where e.school_id = school_id_value
        and e.class_id = assessment_row.class_id
        and e.academic_year_id = assessment_row.academic_year_id
        and e.status = 'active'
    )
  );

  insert into public.assessment_submissions (
    school_id, assessment_id, class_id, version, status, snapshot, submitted_by
  )
  values (
    school_id_value, assessment_row.id, assessment_row.class_id,
    next_version, 'submitted', snapshot_value, actor_id
  )
  returning id into submission_id;

  update public.assessments
  set status = 'submitted', updated_at = now()
  where id = assessment_row.id;

  insert into public.audit_events (school_id, actor_id, action, entity_type, entity_id, details)
  values (
    school_id_value, actor_id, 'assessment.submitted', 'assessment', assessment_row.id,
    jsonb_build_object('submission_id', submission_id, 'version', next_version, 'learner_count', learner_count)
  );

  return submission_id;
end;
$function$

