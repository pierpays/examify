-- Examify Update 56: photo/video media system and galleries.
-- Extends the existing multi-image feed and Groups system without replacing either.

create table if not exists public.feed_post_videos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  video_url text not null,
  mime_type text,
  created_at timestamptz not null default now(),
  unique(post_id)
);

create index if not exists feed_post_videos_post_idx
  on public.feed_post_videos(post_id);

alter table public.feed_post_videos enable row level security;

drop policy if exists "Users read visible feed post videos" on public.feed_post_videos;
create policy "Users read visible feed post videos"
on public.feed_post_videos
for select
to authenticated
using (
  exists(
    select 1
    from public.feed_posts fp
    where fp.id=post_id
      and fp.moderation_status='active'
      and not public.has_block_between(auth.uid(),fp.author_id)
      and (
        fp.author_id=auth.uid()
        or public.is_examify_admin()
        or (
          coalesce(fp.scheduled_at,fp.created_at)<=now()
          and (
            fp.audience='examify'
            or (
              fp.audience='connections'
              and public.are_connected(auth.uid(),fp.author_id)
            )
          )
        )
      )
  )
);

drop policy if exists "Authors add video to own posts" on public.feed_post_videos;
create policy "Authors add video to own posts"
on public.feed_post_videos
for insert
to authenticated
with check(
  exists(
    select 1 from public.feed_posts fp
    where fp.id=post_id
      and fp.author_id=auth.uid()
  )
);

drop policy if exists "Authors delete video from own posts" on public.feed_post_videos;
create policy "Authors delete video from own posts"
on public.feed_post_videos
for delete
to authenticated
using(
  exists(
    select 1 from public.feed_posts fp
    where fp.id=post_id
      and fp.author_id=auth.uid()
  )
);

insert into storage.buckets(
  id,name,public,file_size_limit,allowed_mime_types
)
values(
  'feed-videos',
  'feed-videos',
  true,
  52428800,
  array[
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
on conflict(id) do update
set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Feed authors upload own videos" on storage.objects;
create policy "Feed authors upload own videos"
on storage.objects
for insert
to authenticated
with check(
  bucket_id='feed-videos'
  and (storage.foldername(name))[1]=auth.uid()::text
  and public.can_create_feed_media()
);

drop policy if exists "Feed authors update own videos" on storage.objects;
create policy "Feed authors update own videos"
on storage.objects
for update
to authenticated
using(
  bucket_id='feed-videos'
  and (storage.foldername(name))[1]=auth.uid()::text
)
with check(
  bucket_id='feed-videos'
  and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists "Feed authors delete own videos" on storage.objects;
create policy "Feed authors delete own videos"
on storage.objects
for delete
to authenticated
using(
  bucket_id='feed-videos'
  and (storage.foldername(name))[1]=auth.uid()::text
);

create table if not exists public.academic_group_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.academic_group_posts(id) on delete cascade,
  group_id uuid not null references public.academic_groups(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  media_type text not null check(media_type in('image','video')),
  object_path text not null,
  mime_type text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(post_id,display_order)
);

create index if not exists academic_group_post_media_post_idx
  on public.academic_group_post_media(post_id,display_order);

alter table public.academic_group_post_media enable row level security;

drop policy if exists "Group members read post media" on public.academic_group_post_media;
create policy "Group members read post media"
on public.academic_group_post_media
for select
to authenticated
using(
  public.is_group_active_member(group_id,auth.uid())
  or public.is_examify_admin()
);

drop policy if exists "Group members attach own post media" on public.academic_group_post_media;
create policy "Group members attach own post media"
on public.academic_group_post_media
for insert
to authenticated
with check(
  uploaded_by=auth.uid()
  and public.is_group_active_member(group_id,auth.uid())
  and exists(
    select 1
    from public.academic_group_posts gp
    where gp.id=post_id
      and gp.group_id=academic_group_post_media.group_id
      and gp.author_id=auth.uid()
  )
);

drop policy if exists "Authors managers remove group post media" on public.academic_group_post_media;
create policy "Authors managers remove group post media"
on public.academic_group_post_media
for delete
to authenticated
using(
  uploaded_by=auth.uid()
  or public.is_group_manager(group_id,auth.uid())
  or public.is_examify_admin()
);

insert into storage.buckets(
  id,name,public,file_size_limit,allowed_mime_types
)
values(
  'group-media',
  'group-media',
  false,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
on conflict(id) do update
set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Members upload group media" on storage.objects;
create policy "Members upload group media"
on storage.objects
for insert
to authenticated
with check(
  bucket_id='group-media'
  and public.is_group_active_member(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
  and (storage.foldername(name))[2]=auth.uid()::text
);

drop policy if exists "Members read group media" on storage.objects;
create policy "Members read group media"
on storage.objects
for select
to authenticated
using(
  bucket_id='group-media'
  and (
    public.is_group_active_member(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
    or public.is_examify_admin()
  )
);

drop policy if exists "Authors managers delete group media" on storage.objects;
create policy "Authors managers delete group media"
on storage.objects
for delete
to authenticated
using(
  bucket_id='group-media'
  and (
    (storage.foldername(name))[2]=auth.uid()::text
    or public.is_group_manager(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
    or public.is_examify_admin()
  )
);

create or replace function public.get_profile_media_gallery(
  p_user_id uuid,
  p_limit integer default 60
)
returns table(
  media_type text,
  media_url text,
  post_id uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path='public'
as $$
  with visible_posts as (
    select fp.id,fp.created_at
    from public.feed_posts fp
    where fp.author_id=p_user_id
      and fp.moderation_status='active'
      and public.can_view_profile(p_user_id,auth.uid())
      and not public.has_block_between(auth.uid(),p_user_id)
      and (
        fp.author_id=auth.uid()
        or public.is_examify_admin()
        or (
          coalesce(fp.scheduled_at,fp.created_at)<=now()
          and (
            fp.audience='examify'
            or (
              fp.audience='connections'
              and public.are_connected(auth.uid(),fp.author_id)
            )
          )
        )
      )
  ),
  media as (
    select
      'image'::text as media_type,
      i.image_url as media_url,
      i.post_id,
      vp.created_at
    from public.feed_post_images i
    join visible_posts vp on vp.id=i.post_id

    union all

    select
      'image'::text,
      fp.image_url,
      fp.id,
      vp.created_at
    from public.feed_posts fp
    join visible_posts vp on vp.id=fp.id
    where fp.image_url is not null
      and not exists(
        select 1 from public.feed_post_images i
        where i.post_id=fp.id
      )

    union all

    select
      'video'::text,
      v.video_url,
      v.post_id,
      vp.created_at
    from public.feed_post_videos v
    join visible_posts vp on vp.id=v.post_id
  )
  select media_type,media_url,post_id,created_at
  from media
  order by created_at desc
  limit least(greatest(coalesce(p_limit,60),1),120);
$$;

grant execute on function public.get_profile_media_gallery(uuid,integer)
to authenticated;

create or replace function public.get_group_post_media(
  p_post_ids uuid[]
)
returns table(
  id uuid,
  post_id uuid,
  group_id uuid,
  media_type text,
  object_path text,
  mime_type text,
  display_order integer
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    m.id,
    m.post_id,
    m.group_id,
    m.media_type,
    m.object_path,
    m.mime_type,
    m.display_order
  from public.academic_group_post_media m
  where m.post_id=any(p_post_ids)
    and (
      public.is_group_active_member(m.group_id,auth.uid())
      or public.is_examify_admin()
    )
  order by m.post_id,m.display_order;
$$;

grant execute on function public.get_group_post_media(uuid[])
to authenticated;

notify pgrst,'reload schema';
