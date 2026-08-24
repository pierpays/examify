create or replace function public.get_exam_result_email_payload(
  target_attempt_id uuid
)
returns table (
  attempt_id uuid,
  exam_title text,
  student_email text,
  teacher_email text,
  score_percent numeric,
  passing_score integer,
  passed boolean,
  email_student boolean,
  email_teacher boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    e.title,
    student.email,
    teacher.email,
    a.score_percent,
    e.passing_score,
    coalesce(a.score_percent, 0) >= e.passing_score,
    e.email_results_to_student,
    e.email_results_to_teacher
  from public.exam_attempts a
  join public.exams e
    on e.id = a.exam_id
  join auth.users student
    on student.id = a.user_id
  join auth.users teacher
    on teacher.id = e.teacher_id
  where a.id = target_attempt_id
    and (
      a.user_id = auth.uid()
      or e.teacher_id = auth.uid()
    )
    and a.status = 'completed';
$$;

revoke all
on function public.get_exam_result_email_payload(uuid)
from public;

grant execute
on function public.get_exam_result_email_payload(uuid)
to authenticated;
