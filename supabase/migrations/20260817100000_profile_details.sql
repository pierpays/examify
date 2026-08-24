alter table public.profiles
  add column if not exists career text,
  add column if not exists studying_at text,
  add column if not exists date_of_birth date,
  add column if not exists show_birthday boolean not null default false;

comment on column public.profiles.career is 'Career, profession, or field of work shared by the user.';
comment on column public.profiles.studying_at is 'School, college, university, or other institution where the user studies.';
comment on column public.profiles.date_of_birth is 'Private full date of birth. Public surfaces should only expose month/day when show_birthday is true.';
comment on column public.profiles.show_birthday is 'Whether public profile surfaces may show the birthday month/day. Birth year remains private.';

create or replace function public.get_public_person_profile_details(
  p_user_id uuid
)
returns table (
  career text,
  studying_at text,
  birthday_month integer,
  birthday_day integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.career,
    p.studying_at,
    case when p.show_birthday and p.date_of_birth is not null
      then extract(month from p.date_of_birth)::integer
      else null
    end as birthday_month,
    case when p.show_birthday and p.date_of_birth is not null
      then extract(day from p.date_of_birth)::integer
      else null
    end as birthday_day
  from public.profiles p
  where p.id = p_user_id
  limit 1;
$$;

revoke all on function public.get_public_person_profile_details(uuid) from public;
grant execute on function public.get_public_person_profile_details(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
