create or replace function public.get_attempt_topic_analytics(
  target_attempt_id uuid
)
returns table (
  topic_id uuid,
  topic_name text,
  total_questions integer,
  correct_questions integer,
  score_percent numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with attempt_info as (
    select
      a.id,
      a.exam_id,
      a.user_id
    from public.exam_attempts a
    where a.id = target_attempt_id
      and a.user_id = auth.uid()
  ),

  question_results as (
    select
      eq.topic_id,
      coalesce(et.name, 'Uncategorized') as topic_name,
      eq.question_id,

      not exists (
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
      ) as is_correct

    from attempt_info ai
    join public.exam_questions eq
      on eq.exam_id = ai.exam_id
    left join public.exam_topics et
      on et.id = eq.topic_id
  )

  select
    topic_id,
    topic_name,
    count(*)::integer as total_questions,
    count(*) filter (where is_correct)::integer as correct_questions,
    round(
      (
        count(*) filter (where is_correct)::numeric
        / nullif(count(*)::numeric, 0)
      ) * 100,
      2
    ) as score_percent

  from question_results
  group by topic_id, topic_name
  order by topic_name;
$$;

revoke all
on function public.get_attempt_topic_analytics(uuid)
from public;

grant execute
on function public.get_attempt_topic_analytics(uuid)
to authenticated;
