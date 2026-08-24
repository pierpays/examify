create or replace function public.get_teacher_attempt_details(
  target_attempt_id uuid
)
returns table (
  attempt_id uuid,
  exam_id uuid,
  exam_title text,
  student_name text,
  student_email text,
  score_percent numeric,
  status text,
  started_at timestamptz,
  completed_at timestamptz,
  passing_score integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    e.id,
    e.title,
    coalesce(p.full_name, 'Student'),
    u.email,
    a.score_percent,
    a.status,
    a.started_at,
    a.completed_at,
    e.passing_score
  from public.exam_attempts a
  join public.exams e
    on e.id = a.exam_id
  left join public.profiles p
    on p.id = a.user_id
  left join auth.users u
    on u.id = a.user_id
  where a.id = target_attempt_id
    and e.teacher_id = auth.uid();
$$;

revoke all
on function public.get_teacher_attempt_details(uuid)
from public;

grant execute
on function public.get_teacher_attempt_details(uuid)
to authenticated;
