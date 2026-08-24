-- ============================================================
-- Examify - Exam Topics
-- ============================================================

create table public.exam_topics (
  id uuid primary key default gen_random_uuid(),

  exam_id uuid not null
    references public.exams(id) on delete cascade,

  name text not null,
  description text,

  display_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint exam_topics_name_unique
    unique (exam_id, name)
);

create index exam_topics_exam_idx
  on public.exam_topics(exam_id);

create index exam_topics_order_idx
  on public.exam_topics(exam_id, display_order);


-- Add topic assignment to questions inside an exam.

alter table public.exam_questions
add column topic_id uuid
references public.exam_topics(id)
on delete set null;

create index exam_questions_topic_idx
  on public.exam_questions(topic_id);


-- Updated-at trigger

create trigger exam_topics_set_updated_at
before update on public.exam_topics
for each row
execute function public.set_updated_at();


-- ============================================================
-- RLS
-- ============================================================

alter table public.exam_topics enable row level security;


create policy "Published exam topics are public"
on public.exam_topics
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.exams e
    where e.id = exam_topics.exam_id
      and (
        (
          e.status = 'published'
          and e.visibility in ('public', 'unlisted')
        )
        or e.teacher_id = auth.uid()
      )
  )
);


create policy "Teachers can create topics for own exams"
on public.exam_topics
for insert
to authenticated
with check (
  exists (
    select 1
    from public.exams e
    where e.id = exam_topics.exam_id
      and e.teacher_id = auth.uid()
  )
);


create policy "Teachers can update topics for own exams"
on public.exam_topics
for update
to authenticated
using (
  exists (
    select 1
    from public.exams e
    where e.id = exam_topics.exam_id
      and e.teacher_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.exams e
    where e.id = exam_topics.exam_id
      and e.teacher_id = auth.uid()
  )
);


create policy "Teachers can delete topics from own exams"
on public.exam_topics
for delete
to authenticated
using (
  exists (
    select 1
    from public.exams e
    where e.id = exam_topics.exam_id
      and e.teacher_id = auth.uid()
  )
);
