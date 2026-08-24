-- Saved feed posts and lightweight unread-notification count.

create table if not exists public.feed_saved_posts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists feed_saved_posts_user_created_idx
  on public.feed_saved_posts(user_id, created_at desc);

alter table public.feed_saved_posts enable row level security;

drop policy if exists "Users can read own saved posts" on public.feed_saved_posts;
create policy "Users can read own saved posts"
on public.feed_saved_posts
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can save posts" on public.feed_saved_posts;
create policy "Users can save posts"
on public.feed_saved_posts
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can remove own saved posts" on public.feed_saved_posts;
create policy "Users can remove own saved posts"
on public.feed_saved_posts
for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.get_my_saved_feed_posts(
  p_limit integer default 100
)
returns table (
  post_id uuid,
  saved_at timestamptz,
  author_id uuid,
  author_name text,
  author_role text,
  author_avatar_url text,
  post_type text,
  body text,
  created_at timestamptz,
  image_url text,
  link_url text,
  document_name text,
  feed_exam_title text,
  achievement_exam_title text
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    s.post_id,
    s.created_at as saved_at,
    fp.author_id,
    case
      when p.role = 'teacher' then coalesce(tp.display_name, p.full_name, 'Teacher')
      when p.role = 'institution' then coalesce(ip.name, p.full_name, 'Institution')
      when p.role = 'admin' then coalesce(p.full_name, 'Examify Admin')
      when p.role = 'parent' then coalesce(p.full_name, 'Parent')
      else coalesce(p.full_name, 'Student')
    end as author_name,
    p.role as author_role,
    case
      when p.role = 'teacher' then coalesce(tp.profile_image_url, p.avatar_url)
      else p.avatar_url
    end as author_avatar_url,
    fp.post_type,
    fp.body,
    fp.created_at,
    fp.image_url,
    fp.link_url,
    fp.document_name,
    e.title as feed_exam_title,
    ae.title as achievement_exam_title
  from public.feed_saved_posts s
  join public.feed_posts fp on fp.id = s.post_id
  join public.profiles p on p.id = fp.author_id
  left join public.teacher_profiles tp on tp.user_id = fp.author_id
  left join public.institution_profiles ip on ip.user_id = fp.author_id
  left join public.exams e on e.id = fp.feed_exam_id
  left join public.exam_attempts aa on aa.id = fp.achievement_attempt_id
  left join public.exams ae on ae.id = aa.exam_id
  where s.user_id = auth.uid()
    and fp.moderation_status = 'active'
  order by s.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

revoke all on function public.get_my_saved_feed_posts(integer) from public;
grant execute on function public.get_my_saved_feed_posts(integer) to authenticated;

create or replace function public.get_my_unread_notification_count()
returns bigint
language sql
stable
security definer
set search_path = 'public'
as $$
  select count(*)
  from public.notifications n
  where n.user_id = auth.uid()
    and n.read_at is null;
$$;

revoke all on function public.get_my_unread_notification_count() from public;
grant execute on function public.get_my_unread_notification_count() to authenticated;

notify pgrst, 'reload schema';
