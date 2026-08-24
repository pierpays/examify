-- Examify social feed: teacher/institution posts and optional student achievement posts.
create table public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  post_type text not null default 'post' check (post_type in ('post', 'achievement')),
  body text,
  achievement_attempt_id uuid references public.exam_attempts(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feed_posts_body_length check (body is null or char_length(body) <= 2000),
  constraint feed_posts_type_shape check (
    (post_type = 'post' and achievement_attempt_id is null and body is not null and char_length(btrim(body)) > 0)
    or
    (post_type = 'achievement' and achievement_attempt_id is not null)
  )
);

create index feed_posts_created_idx on public.feed_posts(created_at desc);
create index feed_posts_author_idx on public.feed_posts(author_id, created_at desc);
create unique index feed_posts_unique_achievement_idx
  on public.feed_posts(achievement_attempt_id)
  where achievement_attempt_id is not null;

alter table public.feed_posts enable row level security;

create or replace function public.feed_post_is_allowed(
  p_author_id uuid,
  p_post_type text,
  p_attempt_id uuid
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
    else false
  end;
$$;

revoke all on function public.feed_post_is_allowed(uuid, text, uuid) from public;
grant execute on function public.feed_post_is_allowed(uuid, text, uuid) to authenticated;

create policy "Authenticated users can read feed posts"
on public.feed_posts
for select
to authenticated
using (true);

create policy "Allowed users can create feed posts"
on public.feed_posts
for insert
to authenticated
with check (
  public.feed_post_is_allowed(author_id, post_type, achievement_attempt_id)
);

create policy "Authors can delete own feed posts"
on public.feed_posts
for delete
to authenticated
using (author_id = auth.uid());

-- Return the feed with safe public-facing author information and achievement details.
create or replace function public.get_feed_posts(
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
  achievement_passing_score integer
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
    e.title as achievement_exam_title,
    e.cover_image_url as achievement_cover_image_url,
    a.score_percent as achievement_score,
    e.passing_score as achievement_passing_score
  from public.feed_posts fp
  join public.profiles p on p.id = fp.author_id
  left join public.teacher_profiles tp on tp.user_id = fp.author_id
  left join public.institution_profiles ip on ip.user_id = fp.author_id
  left join public.exam_attempts a on a.id = fp.achievement_attempt_id
  left join public.exams e on e.id = a.exam_id
  where auth.uid() is not null
  order by fp.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.get_feed_posts(integer, integer) from public;
grant execute on function public.get_feed_posts(integer, integer) to authenticated;

-- Passed attempts the current student may share once as an achievement.
create or replace function public.get_shareable_achievements()
returns table (
  attempt_id uuid,
  exam_id uuid,
  exam_title text,
  cover_image_url text,
  score_percent numeric,
  passing_score integer,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    a.id,
    a.exam_id,
    e.title,
    e.cover_image_url,
    a.score_percent,
    e.passing_score,
    a.completed_at
  from public.exam_attempts a
  join public.exams e on e.id = a.exam_id
  join public.profiles p on p.id = a.user_id
  where a.user_id = auth.uid()
    and p.role = 'student'
    and a.status = 'completed'
    and a.score_percent is not null
    and a.score_percent >= e.passing_score
    and not exists (
      select 1
      from public.feed_posts fp
      where fp.achievement_attempt_id = a.id
    )
  order by a.completed_at desc;
$$;

revoke all on function public.get_shareable_achievements() from public;
grant execute on function public.get_shareable_achievements() to authenticated;
