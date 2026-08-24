alter table public.exams
add column category text;

create index exams_category_idx
on public.exams(category);
