-- Examify social profile upgrade: profile photos, cover photos, about text,
-- and public connection previews for role-aware social profiles.

alter table public.profiles
  add column if not exists bio text,
  add column if not exists cover_image_url text;

comment on column public.profiles.bio is
  'Optional public About text for student and parent social profiles.';
comment on column public.profiles.cover_image_url is
  'Public cover image used on Examify social profiles.';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-media',
  'profile-media',
  true,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload own profile media" on storage.objects;
create policy "Users upload own profile media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users update own profile media" on storage.objects;
create policy "Users update own profile media"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users delete own profile media" on storage.objects;
create policy "Users delete own profile media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.get_public_profile_media(
  p_user_id uuid
)
returns table (
  avatar_url text,
  cover_image_url text,
  bio text
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    case
      when p.role = 'teacher'
        then coalesce(tp.profile_image_url, p.avatar_url)
      else p.avatar_url
    end as avatar_url,
    p.cover_image_url,
    case
      when p.role = 'teacher' then tp.bio
      when p.role = 'institution' then ip.description
      else p.bio
    end as bio
  from public.profiles p
  left join public.teacher_profiles tp
    on tp.user_id = p.id
  left join public.institution_profiles ip
    on ip.user_id = p.id
  where p.id = p_user_id
    and (
      p.role <> 'institution'
      or ip.verification_status = 'approved'
    )
  limit 1;
$$;

revoke all on function public.get_public_profile_media(uuid) from public;
grant execute on function public.get_public_profile_media(uuid)
to anon, authenticated;

drop function if exists public.get_connection_profile(uuid);

create function public.get_connection_profile(p_user_id uuid)
returns table(
  user_id uuid,
  display_name text,
  role text,
  avatar_url text,
  cover_image_url text,
  bio text,
  career text,
  studying_at text,
  birthday text,
  connection_status text,
  mutual_count bigint,
  connection_count bigint
)
language sql
stable
security definer
set search_path='public'
as $$
 select
   p.id,
   case
     when p.role='teacher'
       then coalesce(tp.display_name,p.full_name,'Teacher')
     else coalesce(p.full_name,initcap(p.role))
   end,
   p.role,
   coalesce(tp.profile_image_url,p.avatar_url),
   p.cover_image_url,
   case when p.role='teacher' then tp.bio else p.bio end,
   p.career,
   p.studying_at,
   case
     when p.show_birthday and p.date_of_birth is not null
       then to_char(p.date_of_birth,'FMMonth DD')
     else null
   end,
   case
     when p.id=auth.uid() then 'self'
     when uc.status='accepted' then 'connected'
     when uc.requester_id=auth.uid() then 'sent'
     when uc.addressee_id=auth.uid() then 'received'
     else 'none'
   end,
   (
     select count(*)
     from public.user_connections mine
     join public.user_connections theirs on
       (case when mine.requester_id=auth.uid()
         then mine.addressee_id else mine.requester_id end)
       =
       (case when theirs.requester_id=p.id
         then theirs.addressee_id else theirs.requester_id end)
     where mine.status='accepted'
       and theirs.status='accepted'
       and (mine.requester_id=auth.uid() or mine.addressee_id=auth.uid())
       and (theirs.requester_id=p.id or theirs.addressee_id=p.id)
   ),
   (
     select count(*)
     from public.user_connections x
     where x.status='accepted'
       and (x.requester_id=p.id or x.addressee_id=p.id)
   )
 from public.profiles p
 left join public.teacher_profiles tp on tp.user_id=p.id
 left join public.user_connections uc on
   (
     (uc.requester_id=auth.uid() and uc.addressee_id=p.id)
     or
     (uc.requester_id=p.id and uc.addressee_id=auth.uid())
   )
 where p.id=p_user_id
   and p.role in ('student','teacher','parent')
   and not public.has_block_between(auth.uid(),p.id);
$$;

grant execute on function public.get_connection_profile(uuid) to authenticated;

create or replace function public.get_connection_preview(
  p_user_id uuid,
  p_limit integer default 12
)
returns table (
  user_id uuid,
  display_name text,
  role text,
  avatar_url text
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    other.id,
    case
      when other.role='teacher'
        then coalesce(tp.display_name, other.full_name, 'Teacher')
      else coalesce(other.full_name, initcap(other.role))
    end,
    other.role,
    coalesce(tp.profile_image_url, other.avatar_url)
  from public.user_connections c
  join public.profiles other
    on other.id = case
      when c.requester_id = p_user_id then c.addressee_id
      else c.requester_id
    end
  left join public.teacher_profiles tp on tp.user_id = other.id
  where c.status='accepted'
    and (c.requester_id=p_user_id or c.addressee_id=p_user_id)
    and auth.uid() is not null
    and not public.has_block_between(auth.uid(), p_user_id)
    and not public.has_block_between(auth.uid(), other.id)
  order by c.responded_at desc nulls last, c.created_at desc
  limit least(greatest(coalesce(p_limit,12),1),50);
$$;

revoke all on function public.get_connection_preview(uuid,integer) from public;
grant execute on function public.get_connection_preview(uuid,integer) to authenticated;

notify pgrst, 'reload schema';
