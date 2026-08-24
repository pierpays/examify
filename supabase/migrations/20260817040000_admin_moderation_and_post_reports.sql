-- Examify administration + community post reporting/moderation.

create or replace function public.is_examify_admin()
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
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_examify_admin() from public;
grant execute on function public.is_examify_admin() to authenticated;

create table if not exists public.feed_post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (
    reason in ('inappropriate', 'spam', 'harassment', 'misinformation', 'other')
  ),
  details text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  constraint feed_post_reports_details_length
    check (details is null or char_length(details) <= 1000),
  unique (post_id, reporter_id)
);

create index if not exists feed_post_reports_status_idx
  on public.feed_post_reports(status, created_at desc);
create index if not exists feed_post_reports_post_idx
  on public.feed_post_reports(post_id);

alter table public.feed_post_reports enable row level security;

create policy "Users can report feed posts"
on public.feed_post_reports
for insert
to authenticated
with check (
  reporter_id = auth.uid()
  and exists (
    select 1
    from public.feed_posts fp
    where fp.id = post_id
      and fp.author_id <> auth.uid()
  )
);

create policy "Users can read own post reports"
on public.feed_post_reports
for select
to authenticated
using (
  reporter_id = auth.uid()
  or public.is_examify_admin()
);

create policy "Admins can update post reports"
on public.feed_post_reports
for update
to authenticated
using (public.is_examify_admin())
with check (public.is_examify_admin());

-- Administrators can moderate any feed post.
create policy "Admins can delete any feed post"
on public.feed_posts
for delete
to authenticated
using (public.is_examify_admin());

-- Administrators need directory visibility for account moderation.
create policy "Admins can read all profiles"
on public.profiles
for select
to authenticated
using (public.is_examify_admin());

-- Admin accounts may publish normal community updates too.
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
        and p.role in ('teacher', 'institution', 'admin')
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

create or replace function public.get_admin_dashboard_stats()
returns table (
  total_users bigint,
  students bigint,
  teachers bigint,
  parents bigint,
  institutions bigint,
  admins bigint,
  total_exams bigint,
  published_exams bigint,
  total_posts bigint,
  open_reports bigint
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    (select count(*) from public.profiles),
    (select count(*) from public.profiles where role = 'student'),
    (select count(*) from public.profiles where role = 'teacher'),
    (select count(*) from public.profiles where role = 'parent'),
    (select count(*) from public.profiles where role = 'institution'),
    (select count(*) from public.profiles where role = 'admin'),
    (select count(*) from public.exams),
    (select count(*) from public.exams where status = 'published'),
    (select count(*) from public.feed_posts),
    (select count(*) from public.feed_post_reports where status = 'open')
  where public.is_examify_admin();
$$;

revoke all on function public.get_admin_dashboard_stats() from public;
grant execute on function public.get_admin_dashboard_stats() to authenticated;

create or replace function public.get_admin_reports()
returns table (
  report_id uuid,
  post_id uuid,
  reporter_id uuid,
  reporter_name text,
  reason text,
  details text,
  report_status text,
  reported_at timestamptz,
  author_id uuid,
  author_name text,
  author_role text,
  post_type text,
  post_body text,
  post_created_at timestamptz,
  image_url text,
  link_url text,
  document_name text
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    r.id,
    r.post_id,
    r.reporter_id,
    coalesce(rp.full_name, 'Examify user'),
    r.reason,
    r.details,
    r.status,
    r.created_at,
    fp.author_id,
    case
      when ap.role = 'teacher' then coalesce(tp.display_name, ap.full_name, 'Teacher')
      when ap.role = 'institution' then coalesce(ip.name, ap.full_name, 'Institution')
      when ap.role = 'admin' then coalesce(ap.full_name, 'Examify Admin')
      else coalesce(ap.full_name, 'Student')
    end,
    ap.role,
    fp.post_type,
    fp.body,
    fp.created_at,
    fp.image_url,
    fp.link_url,
    fp.document_name
  from public.feed_post_reports r
  join public.feed_posts fp on fp.id = r.post_id
  join public.profiles rp on rp.id = r.reporter_id
  join public.profiles ap on ap.id = fp.author_id
  left join public.teacher_profiles tp on tp.user_id = fp.author_id
  left join public.institution_profiles ip on ip.user_id = fp.author_id
  where public.is_examify_admin()
  order by
    case when r.status = 'open' then 0 else 1 end,
    r.created_at desc;
$$;

revoke all on function public.get_admin_reports() from public;
grant execute on function public.get_admin_reports() to authenticated;

create or replace function public.get_admin_users()
returns table (
  id uuid,
  full_name text,
  role text,
  username text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select p.id, p.full_name, p.role, p.username, p.created_at
  from public.profiles p
  where public.is_examify_admin()
  order by p.created_at desc;
$$;

revoke all on function public.get_admin_users() from public;
grant execute on function public.get_admin_users() to authenticated;

create or replace function public.get_admin_posts(
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
  document_name text
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
    fp.document_name
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

create or replace function public.admin_set_report_status(
  p_report_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not public.is_examify_admin() then
    raise exception 'Admin access required';
  end if;

  if p_status not in ('open', 'resolved', 'dismissed') then
    raise exception 'Invalid report status';
  end if;

  update public.feed_post_reports
  set
    status = p_status,
    reviewed_at = case when p_status = 'open' then null else now() end,
    reviewed_by = case when p_status = 'open' then null else auth.uid() end
  where id = p_report_id;
end;
$$;

revoke all on function public.admin_set_report_status(uuid, text) from public;
grant execute on function public.admin_set_report_status(uuid, text) to authenticated;

create or replace function public.admin_remove_reported_post(
  p_report_id uuid
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_post_id uuid;
begin
  if not public.is_examify_admin() then
    raise exception 'Admin access required';
  end if;

  select post_id into v_post_id
  from public.feed_post_reports
  where id = p_report_id;

  if v_post_id is null then
    raise exception 'Report not found';
  end if;

  delete from public.feed_posts where id = v_post_id;
end;
$$;

revoke all on function public.admin_remove_reported_post(uuid) from public;
grant execute on function public.admin_remove_reported_post(uuid) to authenticated;
