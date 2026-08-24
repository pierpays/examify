-- Replace generic EXM-000001 style codes with teacher-based codes.
-- Format: first 2 letters of first name + first 3 letters of last name + 4 digits.
-- Example: Jeremy Esquivel -> JEESQ-0001

create or replace function public.exam_code_name_prefix(target_teacher_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  raw_name text;
  clean_name text;
  name_parts text[];
  first_name text;
  last_name text;
  prefix text;
begin
  select coalesce(
    nullif(btrim(tp.display_name), ''),
    nullif(btrim(p.full_name), ''),
    'Teacher'
  )
  into raw_name
  from public.profiles p
  left join public.teacher_profiles tp
    on tp.user_id = p.id
  where p.id = target_teacher_id;

  raw_name := coalesce(raw_name, 'Teacher');

  -- Normalize common accented Latin characters without requiring extensions.
  clean_name := upper(
    translate(
      raw_name,
      'ÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇáàâäãåéèêëíìîïóòôöõúùûüñç',
      'AAAAAAEEEEIIIIOOOOOUUUUNCaaaaaaeeeeiiiiooooouuuunc'
    )
  );

  clean_name := regexp_replace(clean_name, '[^A-Z0-9 ]', '', 'g');
  clean_name := regexp_replace(btrim(clean_name), '\s+', ' ', 'g');

  if clean_name = '' then
    clean_name := 'TEACHER';
  end if;

  name_parts := string_to_array(clean_name, ' ');
  first_name := name_parts[1];

  if coalesce(array_length(name_parts, 1), 0) >= 2 then
    last_name := name_parts[array_length(name_parts, 1)];
  else
    last_name := first_name;
  end if;

  prefix :=
    substr(first_name || 'XX', 1, 2) ||
    substr(last_name || 'XXX', 1, 3);

  return prefix;
end;
$$;

revoke all on function public.exam_code_name_prefix(uuid) from public;
grant execute on function public.exam_code_name_prefix(uuid) to authenticated;

create or replace function public.assign_exam_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prefix text;
  next_number integer;
  candidate text;
begin
  -- Preserve an explicitly supplied code. Normal app inserts leave this null.
  if new.exam_code is not null and btrim(new.exam_code) <> '' then
    return new;
  end if;

  prefix := public.exam_code_name_prefix(new.teacher_id);

  -- Serialize code generation for a prefix to avoid duplicate codes when
  -- exams are created at nearly the same time.
  perform pg_advisory_xact_lock(hashtext('exam-code:' || prefix));

  select coalesce(max((regexp_match(e.exam_code, '([0-9]{4})$'))[1]::integer), 0) + 1
  into next_number
  from public.exams e
  where e.exam_code like prefix || '-%'
    and e.exam_code ~ '[0-9]{4}$';

  loop
    candidate := prefix || '-' || lpad(next_number::text, 4, '0');

    exit when not exists (
      select 1
      from public.exams e
      where e.exam_code = candidate
    );

    next_number := next_number + 1;
  end loop;

  if next_number > 9999 then
    raise exception 'Exam code limit reached for prefix %', prefix;
  end if;

  new.exam_code := candidate;
  return new;
end;
$$;

-- Convert all existing exams to the new format. Numbering is chronological
-- within each five-letter teacher prefix, keeping every code globally unique.
with ranked as (
  select
    e.id,
    public.exam_code_name_prefix(e.teacher_id) as prefix,
    row_number() over (
      partition by public.exam_code_name_prefix(e.teacher_id)
      order by e.created_at asc nulls last, e.id
    ) as seq
  from public.exams e
), new_codes as (
  select
    id,
    prefix || '-' || lpad(seq::text, 4, '0') as exam_code
  from ranked
)
update public.exams e
set exam_code = nc.exam_code
from new_codes nc
where nc.id = e.id;

-- Recreate the unique index defensively. Search-by-code can therefore always
-- identify one exam even when two teachers happen to have the same initials.
drop index if exists public.exams_exam_code_key;
create unique index exams_exam_code_key
on public.exams(exam_code);

drop trigger if exists assign_exam_code_before_insert on public.exams;
create trigger assign_exam_code_before_insert
before insert on public.exams
for each row
execute function public.assign_exam_code();
