create table public.teacher_student_notes (
  teacher_id uuid not null
    references public.profiles(id) on delete cascade,

  student_id uuid not null
    references public.profiles(id) on delete cascade,

  note text,

  updated_at timestamptz not null default now(),

  primary key (teacher_id, student_id)
);

alter table public.teacher_student_notes
enable row level security;

create policy "Teachers can read own student notes"
on public.teacher_student_notes
for select
to authenticated
using (
  teacher_id = auth.uid()
);

create policy "Teachers can create own student notes"
on public.teacher_student_notes
for insert
to authenticated
with check (
  teacher_id = auth.uid()
);

create policy "Teachers can update own student notes"
on public.teacher_student_notes
for update
to authenticated
using (
  teacher_id = auth.uid()
)
with check (
  teacher_id = auth.uid()
);

create policy "Teachers can delete own student notes"
on public.teacher_student_notes
for delete
to authenticated
using (
  teacher_id = auth.uid()
);
