alter table public.exams
add column allow_retake boolean not null default true;
