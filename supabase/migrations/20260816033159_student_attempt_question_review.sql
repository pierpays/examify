create or replace function public.get_student_attempt_question_review(
  target_attempt_id uuid
)
returns table (
  question_id uuid,
  question_text text,
  topic_name text,
  is_correct boolean,
  student_answers text[],
  correct_answers text[],
  explanation text
)
language sql
stable
security definer
set search_path = ''
as $$
  with allowed_attempt as (
    select
      a.id as attempt_id,
      a.exam_id
    from public.exam_attempts a
    join public.exams e
      on e.id = a.exam_id
    where a.id = target_attempt_id
      and a.user_id = auth.uid()
      and a.status = 'completed'
      and e.allow_answer_review = true
  ),

  exam_question_list as (
    select
      eq.question_id,
      coalesce(et.name, 'Uncategorized') as topic_name,
      q.question_text,
      q.explanation
    from allowed_attempt aa
    join public.exam_questions eq
      on eq.exam_id = aa.exam_id
    join public.questions q
      on q.id = eq.question_id
    left join public.exam_topics et
      on et.id = eq.topic_id
  )

  select
    eql.question_id,
    eql.question_text,
    eql.topic_name,

    not exists (
      (
        select qo.id
        from public.question_options qo
        where qo.question_id = eql.question_id
          and qo.is_correct = true

        except

        select ans.option_id
        from public.attempt_answers ans
        where ans.attempt_id = target_attempt_id
          and ans.question_id = eql.question_id
      )

      union

      (
        select ans.option_id
        from public.attempt_answers ans
        where ans.attempt_id = target_attempt_id
          and ans.question_id = eql.question_id

        except

        select qo.id
        from public.question_options qo
        where qo.question_id = eql.question_id
          and qo.is_correct = true
      )
    ) as is_correct,

    coalesce(
      array(
        select qo.option_text
        from public.attempt_answers ans
        join public.question_options qo
          on qo.id = ans.option_id
        where ans.attempt_id = target_attempt_id
          and ans.question_id = eql.question_id
        order by qo.display_order
      ),
      array[]::text[]
    ) as student_answers,

    coalesce(
      array(
        select qo.option_text
        from public.question_options qo
        where qo.question_id = eql.question_id
          and qo.is_correct = true
        order by qo.display_order
      ),
      array[]::text[]
    ) as correct_answers,

    eql.explanation

  from exam_question_list eql;
$$;

revoke all
on function public.get_student_attempt_question_review(uuid)
from public;

grant execute
on function public.get_student_attempt_question_review(uuid)
to authenticated;
