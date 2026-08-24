-- Allow teachers to share their published exams to the community feed.

alter table public.feed_posts
  add column if not exists feed_exam_id uuid references public.exams(id) on delete cascade;

create index if not exists feed_posts_exam_idx
  on public.feed_posts(feed_exam_id)
  where feed_exam_id is not null;

alter table public.feed_posts
  drop constraint if exists feed_posts_post_type_check;

alter table public.feed_posts
  drop constraint if exists feed_posts_type_shape;

alter table public.feed_posts
  add constraint feed_posts_post_type_check
  check (post_type in ('post', 'achievement', 'exam'));

alter table public.feed_posts
  add constraint feed_posts_type_shape
  check (
    (
      post_type = 'post'
      and achievement_attempt_id is null
      and feed_exam_id is null
      and body is not null
      and char_length(btrim(body)) > 0
    )
    or
    (
      post_type = 'achievement'
      and achievement_attempt_id is not null
      and feed_exam_id is null
    )
    or
    (
      post_type = 'exam'
      and achievement_attempt_id is null
      and feed_exam_id is not null
    )
  );

create or replace function public.feed_post_is_allowed(
  p_author_id uuid,
  p_post_type text,
  p_attempt_id uuid,
  p_exam_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select case
    when p_author_id is distinct from auth.uid() then false
    when p_post_type = 'post' then exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'institution')
    )
    when p_post_type = 'achievement' then exists (
      select 1
      from public.profiles p
      join public.exam_attempts a on a.user_id = p.id
      join public.exams e on e.id = a.exam_id
      where p.id = auth.uid()
        and p.role = 'student'
        and a.id = p_attempt_id
        and a.status = 'completed'
        and a.score_percent is not null
        and a.score_percent >= e.passing_score
    )
    when p_post_type = 'exam' then exists (
      select 1
      from public.profiles p
      join public.exams e on e.teacher_id = p.id
      where p.id = auth.uid()
        and p.role in ('teacher', 'admin')
        and e.id = p_exam_id
        and e.status = 'published'
    )
    else false
  end;
$$;

revoke all on function public.feed_post_is_allowed(uuid, text, uuid, uuid) from public;
grant execute on function public.feed_post_is_allowed(uuid, text, uuid, uuid) to authenticated;

drop policy if exists "Allowed users can create feed posts"
on public.feed_posts;

create policy "Allowed users can create feed posts"
on public.feed_posts
for insert
to authenticated
with check (
  public.feed_post_is_allowed(
    author_id,
    post_type,
    achievement_attempt_id,
    feed_exam_id
  )
);

-- The return shape changes, so recreate the RPC.
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
  feed_exam_short_description text
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
    fe.short_description as feed_exam_short_description
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
