create or replace function public.finish_exam_attempt(
  target_attempt_id uuid
)
returns table (
  score_percent numeric,
  correct_questions integer,
  total_questions integer,
  passed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_exam_id uuid;
  v_passing_score integer;
  v_total integer;
  v_correct integer;
  v_score numeric;
begin
  select
    a.user_id,
    a.exam_id,
    e.passing_score
  into
    v_user_id,
    v_exam_id,
    v_passing_score
  from public.exam_attempts a
  join public.exams e
    on e.id = a.exam_id
  where a.id = target_attempt_id;

  if v_user_id is null then
    raise exception 'Exam attempt not found';
  end if;

  if v_user_id <> auth.uid() then
    raise exception 'You do not own this exam attempt';
  end if;

  select count(*)::integer
  into v_total
  from public.exam_questions eq
  where eq.exam_id = v_exam_id;

  if v_total = 0 then
    raise exception 'This exam has no questions';
  end if;

  select count(*)::integer
  into v_correct
  from public.exam_questions eq
  where eq.exam_id = v_exam_id
    and not exists (
      (
        select qo.id
        from public.question_options qo
        where qo.question_id = eq.question_id
          and qo.is_correct = true

        except

        select aa.option_id
        from public.attempt_answers aa
        where aa.attempt_id = target_attempt_id
          and aa.question_id = eq.question_id
      )

      union

      (
        select aa.option_id
        from public.attempt_answers aa
        where aa.attempt_id = target_attempt_id
          and aa.question_id = eq.question_id

        except

        select qo.id
        from public.question_options qo
        where qo.question_id = eq.question_id
          and qo.is_correct = true
      )
    );

  v_score := round(
    (v_correct::numeric / v_total::numeric) * 100,
    2
  );

  update public.exam_attempts
  set
    status = 'completed',
    score_percent = v_score,
    completed_at = now()
  where id = target_attempt_id;

  -- Clean up any older duplicate active attempts
  -- for this same student and exam.
  update public.exam_attempts
  set status = 'abandoned'
  where user_id = v_user_id
    and exam_id = v_exam_id
    and status = 'in_progress'
    and id <> target_attempt_id;

  return query
  select
    v_score,
    v_correct,
    v_total,
    (v_score >= v_passing_score);
end;
$$;
