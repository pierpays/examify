-- Ensure every teacher account has a teacher_profiles row immediately.
-- This prevents newly registered teachers from being missing from teacher/profile views
-- until they manually visit and save the creator profile editor.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text;
begin
  requested_role := new.raw_user_meta_data ->> 'role';

  if requested_role not in ('student', 'teacher', 'parent', 'institution') then
    requested_role := 'student';
  end if;

  insert into public.profiles(id, full_name, avatar_url, role)
  values(
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    requested_role
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    role = excluded.role;

  if requested_role = 'teacher' then
    insert into public.teacher_profiles(
      user_id,
      display_name,
      profile_image_url,
      is_public
    )
    values(
      new.id,
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        'Teacher'
      ),
      new.raw_user_meta_data ->> 'avatar_url',
      true
    )
    on conflict (user_id) do nothing;
  end if;

  if requested_role = 'institution' then
    insert into public.institution_profiles(
      user_id,
      name,
      physical_address,
      contact_email,
      website_url,
      phone_number,
      is_public,
      verification_status,
      verification_submitted_at
    )
    values(
      new.id,
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'institution_name'), ''),
               nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
               'Institution'),
      nullif(trim(new.raw_user_meta_data ->> 'physical_address'), ''),
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'contact_email'), ''), new.email),
      nullif(trim(new.raw_user_meta_data ->> 'website_url'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'phone_number'), ''),
      false,
      'pending',
      now()
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

insert into public.teacher_profiles(user_id, display_name, profile_image_url, is_public)
select
  p.id,
  coalesce(nullif(trim(p.full_name), ''), 'Teacher'),
  p.avatar_url,
  true
from public.profiles p
where p.role = 'teacher'
  and not exists (
    select 1
    from public.teacher_profiles tp
    where tp.user_id = p.id
  );
