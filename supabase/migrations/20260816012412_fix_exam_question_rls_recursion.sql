create or replace function public.owns_question(target_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.questions q
    where q.id = target_question_id
      and q.teacher_id = auth.uid()
  );
$$;

revoke all on function public.owns_question(uuid) from public;
grant execute on function public.owns_question(uuid) to authenticated;

drop policy if exists "Teachers can add questions to own exams"
on public.exam_questions;

create policy "Teachers can add questions to own exams"
on public.exam_questions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.exams e
    where e.id = exam_questions.exam_id
      and e.teacher_id = auth.uid()
  )
  and public.owns_question(question_id)
);
