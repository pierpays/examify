create table public.saved_exams (
  student_id uuid not null
    references public.profiles(id) on delete cascade,

  exam_id uuid not null
    references public.exams(id) on delete cascade,

  created_at timestamptz not null default now(),

  primary key (student_id, exam_id)
);

create index saved_exams_exam_idx
  on public.saved_exams(exam_id);

alter table public.saved_exams
enable row level security;

create policy "Students can save exams"
on public.saved_exams
for insert
to authenticated
with check (
  student_id = auth.uid()
);

create policy "Students can read own saved exams"
on public.saved_exams
for select
to authenticated
using (
  student_id = auth.uid()
);

create policy "Students can remove own saved exams"
on public.saved_exams
for delete
to authenticated
using (
  student_id = auth.uid()
);
