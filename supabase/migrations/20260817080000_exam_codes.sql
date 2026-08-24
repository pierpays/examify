create sequence if not exists public.exam_code_seq start with 1;

alter table public.exams
add column if not exists exam_code text;

create or replace function public.assign_exam_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.exam_code is null or btrim(new.exam_code) = '' then
    new.exam_code := 'EXM-' || lpad(nextval('public.exam_code_seq')::text, 6, '0');
  end if;

  return new;
end;
$$;

update public.exams
set exam_code = 'EXM-' || lpad(nextval('public.exam_code_seq')::text, 6, '0')
where exam_code is null or btrim(exam_code) = '';

alter table public.exams
alter column exam_code set not null;

create unique index if not exists exams_exam_code_key
on public.exams(exam_code);

create index if not exists exams_published_at_idx
on public.exams(published_at);

drop trigger if exists assign_exam_code_before_insert on public.exams;

create trigger assign_exam_code_before_insert
before insert on public.exams
for each row
execute function public.assign_exam_code();
