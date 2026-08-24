create table public.attempt_flagged_questions (
  attempt_id uuid not null
    references public.exam_attempts(id) on delete cascade,

  question_id uuid not null
    references public.questions(id) on delete cascade,

  created_at timestamptz not null default now(),

  primary key (attempt_id, question_id)
);

alter table public.attempt_flagged_questions
enable row level security;

create policy "Students can flag questions on own attempts"
on public.attempt_flagged_questions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.exam_attempts a
    where a.id = attempt_flagged_questions.attempt_id
      and a.user_id = auth.uid()
  )
);

create policy "Students can read own flagged questions"
on public.attempt_flagged_questions
for select
to authenticated
using (
  exists (
    select 1
    from public.exam_attempts a
    where a.id = attempt_flagged_questions.attempt_id
      and a.user_id = auth.uid()
  )
);

create policy "Students can unflag questions on own attempts"
on public.attempt_flagged_questions
for delete
to authenticated
using (
  exists (
    select 1
    from public.exam_attempts a
    where a.id = attempt_flagged_questions.attempt_id
      and a.user_id = auth.uid()
  )
);
