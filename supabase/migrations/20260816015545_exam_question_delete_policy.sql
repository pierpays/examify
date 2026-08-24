drop policy if exists "Teachers can remove questions from own exams"
on public.exam_questions;

create policy "Teachers can remove questions from own exams"
on public.exam_questions
for delete
to authenticated
using (
  exists (
    select 1
    from public.exams e
    where e.id = exam_questions.exam_id
      and e.teacher_id = auth.uid()
  )
);
