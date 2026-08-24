-- Feed posts can include an optional uploaded image and/or external link.

alter table public.feed_posts
  add column if not exists image_url text,
  add column if not exists link_url text;

-- Normal posts may contain text, an image, a link, or any combination.
alter table public.feed_posts
  drop constraint if exists feed_posts_type_shape;

alter table public.feed_posts
  add constraint feed_posts_link_url_http
  check (
    link_url is null
    or link_url ~* '^https?://'
  );

alter table public.feed_posts
  add constraint feed_posts_type_shape
  check (
    (
      post_type = 'post'
      and achievement_attempt_id is null
      and feed_exam_id is null
      and (
        (body is not null and char_length(btrim(body)) > 0)
        or image_url is not null
        or link_url is not null
      )
    )
    or
    (
      post_type = 'achievement'
      and achievement_attempt_id is not null
      and feed_exam_id is null
      and image_url is null
      and link_url is null
    )
    or
    (
      post_type = 'exam'
      and achievement_attempt_id is null
      and feed_exam_id is not null
      and image_url is null
      and link_url is null
    )
  );

-- Public bucket because feed images are intended to be visible to authenticated feed viewers.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'feed-images',
  'feed-images',
  true,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]
)
on conflict (id) do nothing;

create or replace function public.can_create_feed_media()
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('teacher', 'institution', 'admin')
  );
$$;

revoke all on function public.can_create_feed_media() from public;
grant execute on function public.can_create_feed_media() to authenticated;

create policy "Feed authors can upload own feed images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'feed-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_create_feed_media()
);

create policy "Feed authors can update own feed images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'feed-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'feed-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Feed authors can delete own feed images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'feed-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Return media fields in feed RPC.
drop function if exists public.get_feed_posts(integer, integer);

create function public.get_feed_posts(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  author_id uuid,
  author_role text,
  author_name text,
  author_avatar_url text,
  post_type text,
  body text,
  created_at timestamptz,
  achievement_attempt_id uuid,
  achievement_exam_id uuid,
  achievement_exam_title text,
  achievement_cover_image_url text,
  achievement_score numeric,
  achievement_passing_score integer,
  feed_exam_id uuid,
  feed_exam_title text,
  feed_exam_category text,
  feed_exam_cover_image_url text,
  feed_exam_short_description text,
  image_url text,
  link_url text
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    fp.id,
    fp.author_id,
    p.role as author_role,
    case
      when p.role = 'teacher' then coalesce(tp.display_name, p.full_name, 'Teacher')
      when p.role = 'institution' then coalesce(ip.name, p.full_name, 'Institution')
      else coalesce(p.full_name, 'Student')
    end as author_name,
    case
      when p.role = 'teacher' then coalesce(tp.profile_image_url, p.avatar_url)
      else p.avatar_url
    end as author_avatar_url,
    fp.post_type,
    fp.body,
    fp.created_at,
    fp.achievement_attempt_id,
    a.exam_id as achievement_exam_id,
    ae.title as achievement_exam_title,
    ae.cover_image_url as achievement_cover_image_url,
    a.score_percent as achievement_score,
    ae.passing_score as achievement_passing_score,
    fp.feed_exam_id,
    fe.title as feed_exam_title,
    fe.category as feed_exam_category,
    fe.cover_image_url as feed_exam_cover_image_url,
    fe.short_description as feed_exam_short_description,
    fp.image_url,
    fp.link_url
  from public.feed_posts fp
  join public.profiles p on p.id = fp.author_id
  left join public.teacher_profiles tp on tp.user_id = fp.author_id
  left join public.institution_profiles ip on ip.user_id = fp.author_id
  left join public.exam_attempts a on a.id = fp.achievement_attempt_id
  left join public.exams ae on ae.id = a.exam_id
  left join public.exams fe on fe.id = fp.feed_exam_id
  where auth.uid() is not null
  order by fp.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.get_feed_posts(integer, integer) from public;
grant execute on function public.get_feed_posts(integer, integer) to authenticated;
