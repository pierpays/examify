create table public.teacher_followers (
  teacher_id uuid not null
    references public.teacher_profiles(user_id) on delete cascade,

  student_id uuid not null
    references public.profiles(id) on delete cascade,

  created_at timestamptz not null default now(),

  primary key (teacher_id, student_id)
);

create index teacher_followers_student_idx
  on public.teacher_followers(student_id);

alter table public.teacher_followers enable row level security;

create policy "Students can follow teachers"
on public.teacher_followers
for insert
to authenticated
with check (
  student_id = auth.uid()
);

create policy "Students can read own follows"
on public.teacher_followers
for select
to authenticated
using (
  student_id = auth.uid()
  or teacher_id = auth.uid()
);

create policy "Students can unfollow teachers"
on public.teacher_followers
for delete
to authenticated
using (
  student_id = auth.uid()
);
