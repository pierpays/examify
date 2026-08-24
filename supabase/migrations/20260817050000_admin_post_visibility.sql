-- Admin post visibility controls + remove admin feed publishing.

alter table public.feed_posts
  add column if not exists moderation_status text not null default 'active'
    check (moderation_status in ('active', 'hidden', 'archived')),
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null,
  add column if not exists moderated_at timestamptz;

create index if not exists feed_posts_moderation_status_idx
  on public.feed_posts(moderation_status, created_at desc);

-- Admins are moderators, not community publishers.
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
        and p.role = 'teacher'
        and e.id = p_exam_id
        and e.status = 'published'
    )
    else false
  end;
$$;

revoke all on function public.feed_post_is_allowed(uuid, text, uuid, uuid) from public;
grant execute on function public.feed_post_is_allowed(uuid, text, uuid, uuid) to authenticated;

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
      and p.role in ('teacher', 'institution')
  );
$$;

revoke all on function public.can_create_feed_media() from public;
grant execute on function public.can_create_feed_media() to authenticated;

-- Hidden/archived content is excluded from the community feed.
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
  link_url text,
  document_url text,
  document_name text,
  document_size bigint,
  document_mime_type text
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
    fp.link_url,
    fp.document_url,
    fp.document_name,
    fp.document_size,
    fp.document_mime_type
  from public.feed_posts fp
  join public.profiles p on p.id = fp.author_id
  left join public.teacher_profiles tp on tp.user_id = fp.author_id
  left join public.institution_profiles ip on ip.user_id = fp.author_id
  left join public.exam_attempts a on a.id = fp.achievement_attempt_id
  left join public.exams ae on ae.id = a.exam_id
  left join public.exams fe on fe.id = fp.feed_exam_id
  where auth.uid() is not null
    and fp.moderation_status = 'active'
  order by fp.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.get_feed_posts(integer, integer) from public;
grant execute on function public.get_feed_posts(integer, integer) to authenticated;

-- Admin post management returns moderation state.
drop function if exists public.get_admin_posts(integer);

create function public.get_admin_posts(
  p_limit integer default 100
)
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  author_role text,
  post_type text,
  body text,
  created_at timestamptz,
  open_report_count bigint,
  image_url text,
  link_url text,
  document_name text,
  moderation_status text,
  moderated_at timestamptz
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    fp.id,
    fp.author_id,
    case
      when p.role = 'teacher' then coalesce(tp.display_name, p.full_name, 'Teacher')
      when p.role = 'institution' then coalesce(ip.name, p.full_name, 'Institution')
      when p.role = 'admin' then coalesce(p.full_name, 'Examify Admin')
      else coalesce(p.full_name, 'Student')
    end,
    p.role,
    fp.post_type,
    fp.body,
    fp.created_at,
    (
      select count(*)
      from public.feed_post_reports r
      where r.post_id = fp.id and r.status = 'open'
    ),
    fp.image_url,
    fp.link_url,
    fp.document_name,
    fp.moderation_status,
    fp.moderated_at
  from public.feed_posts fp
  join public.profiles p on p.id = fp.author_id
  left join public.teacher_profiles tp on tp.user_id = fp.author_id
  left join public.institution_profiles ip on ip.user_id = fp.author_id
  where public.is_examify_admin()
  order by fp.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

revoke all on function public.get_admin_posts(integer) from public;
grant execute on function public.get_admin_posts(integer) to authenticated;

create or replace function public.admin_set_feed_post_moderation(
  p_post_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_author_role text;
begin
  if not public.is_examify_admin() then
    raise exception 'Admin access required';
  end if;

  if p_status not in ('active', 'hidden', 'archived') then
    raise exception 'Invalid moderation status';
  end if;

  select p.role
    into v_author_role
  from public.feed_posts fp
  join public.profiles p on p.id = fp.author_id
  where fp.id = p_post_id;

  if v_author_role is null then
    raise exception 'Post not found';
  end if;

  if v_author_role not in ('teacher', 'institution') then
    raise exception 'Only teacher and institution posts can be hidden or archived';
  end if;

  update public.feed_posts
  set
    moderation_status = p_status,
    moderated_by = case when p_status = 'active' then null else auth.uid() end,
    moderated_at = case when p_status = 'active' then null else now() end
  where id = p_post_id;
end;
$$;

revoke all on function public.admin_set_feed_post_moderation(uuid, text) from public;
grant execute on function public.admin_set_feed_post_moderation(uuid, text) to authenticated;
