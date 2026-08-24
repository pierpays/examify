create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),

  exam_id uuid not null
    references public.exams(id) on delete cascade,

  user_id uuid not null
    references public.profiles(id) on delete cascade,

  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'abandoned')),

  score_percent numeric(5,2),

  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index exam_attempts_exam_idx
  on public.exam_attempts(exam_id);

create index exam_attempts_user_idx
  on public.exam_attempts(user_id);


create table public.attempt_answers (
  id uuid primary key default gen_random_uuid(),

  attempt_id uuid not null
    references public.exam_attempts(id) on delete cascade,

  question_id uuid not null
    references public.questions(id) on delete cascade,

  option_id uuid not null
    references public.question_options(id) on delete cascade,

  created_at timestamptz not null default now(),

  constraint attempt_answers_unique
    unique (attempt_id, question_id, option_id)
);

create index attempt_answers_attempt_idx
  on public.attempt_answers(attempt_id);

create index attempt_answers_question_idx
  on public.attempt_answers(question_id);


alter table public.exam_attempts enable row level security;
alter table public.attempt_answers enable row level security;


create policy "Students can create own attempts"
on public.exam_attempts
for insert
to authenticated
with check (
  user_id = auth.uid()
);

create policy "Students can read own attempts"
on public.exam_attempts
for select
to authenticated
using (
  user_id = auth.uid()
);

create policy "Students can update own attempts"
on public.exam_attempts
for update
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
);


create policy "Students can create answers for own attempts"
on public.attempt_answers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.exam_attempts a
    where a.id = attempt_answers.attempt_id
      and a.user_id = auth.uid()
  )
);

create policy "Students can read answers for own attempts"
on public.attempt_answers
for select
to authenticated
using (
  exists (
    select 1
    from public.exam_attempts a
    where a.id = attempt_answers.attempt_id
      and a.user_id = auth.uid()
  )
);

create policy "Students can delete answers from own attempts"
on public.attempt_answers
for delete
to authenticated
using (
  exists (
    select 1
    from public.exam_attempts a
    where a.id = attempt_answers.attempt_id
      and a.user_id = auth.uid()
  )
);
