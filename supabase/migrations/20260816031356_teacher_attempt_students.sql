create or replace function public.get_teacher_exam_attempts(
  target_exam_id uuid
)
returns table (
  attempt_id uuid,
  student_id uuid,
  student_name text,
  student_email text,
  status text,
  score_percent numeric,
  started_at timestamptz,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    a.user_id,
    coalesce(
      p.full_name,
      'Student'
    ),
    u.email,
    a.status,
    a.score_percent,
    a.started_at,
    a.completed_at
  from public.exam_attempts a
  join public.exams e
    on e.id = a.exam_id
  left join public.profiles p
    on p.id = a.user_id
  left join auth.users u
    on u.id = a.user_id
  where a.exam_id = target_exam_id
    and e.teacher_id = auth.uid()
  order by a.started_at desc;
$$;

revoke all
on function public.get_teacher_exam_attempts(uuid)
from public;

grant execute
on function public.get_teacher_exam_attempts(uuid)
to authenticated;
