alter table public.exams
add column allow_answer_review boolean not null default true,
add column randomize_questions boolean not null default false,
add column randomize_answers boolean not null default false,
add column email_results_to_student boolean not null default false,
add column email_results_to_teacher boolean not null default false,
add column allow_pdf_export boolean not null default false;
