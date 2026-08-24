-- Institution verification workflow.
-- New institution accounts submit identifying contact information and remain
-- unavailable to the public/community until an Examify administrator approves them.

alter table public.institution_profiles
  add column if not exists physical_address text,
  add column if not exists contact_email text,
  add column if not exists phone_number text,
  add column if not exists verification_status text not null default 'pending',
  add column if not exists verification_submitted_at timestamptz not null default now(),
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles(id) on delete set null,
  add column if not exists verification_notes text;

alter table public.institution_profiles
  drop constraint if exists institution_profiles_verification_status_check;

alter table public.institution_profiles
  add constraint institution_profiles_verification_status_check
  check (verification_status in ('pending', 'approved', 'rejected'));

-- Existing institution profiles predate this workflow. Grandfather them as
-- approved so current test/production institutions are not unexpectedly locked out.
update public.institution_profiles
set
  verification_status = 'approved',
  verified_at = coalesce(verified_at, now()),
  verification_submitted_at = coalesce(verification_submitted_at, created_at, now())
where verification_status = 'pending'
  and physical_address is null
  and contact_email is null
  and phone_number is null;

create index if not exists institution_profiles_verification_idx
  on public.institution_profiles(verification_status, verification_submitted_at desc);

create or replace function public.is_verified_institution(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1
    from public.profiles p
    join public.institution_profiles ip on ip.user_id = p.id
    where p.id = p_user_id
      and p.role = 'institution'
      and ip.verification_status = 'approved'
  );
$$;

revoke all on function public.is_verified_institution(uuid) from public;
grant execute on function public.is_verified_institution(uuid) to anon, authenticated;

-- Protect verification state from institution-side tampering. Changes to the
-- identifying fields after approval automatically send the institution back
-- to the admin review queue.
create or replace function public.protect_institution_verification_fields()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_is_admin boolean := false;
  v_identity_changed boolean := false;
  v_requested_resubmit boolean := false;
begin
  if auth.uid() is not null then
    v_is_admin := public.is_examify_admin();
  end if;

  if auth.uid() = old.user_id and not v_is_admin then
    v_requested_resubmit :=
      old.verification_status = 'rejected'
      and new.verification_status = 'pending';

    v_identity_changed :=
      new.name is distinct from old.name
      or new.physical_address is distinct from old.physical_address
      or new.contact_email is distinct from old.contact_email
      or new.website_url is distinct from old.website_url
      or new.phone_number is distinct from old.phone_number;

    -- Institutions may never self-approve or alter review metadata.
    new.verification_status := old.verification_status;
    new.verified_at := old.verified_at;
    new.verified_by := old.verified_by;
    new.verification_notes := old.verification_notes;

    if v_identity_changed or v_requested_resubmit then
      new.verification_status := 'pending';
      new.verification_submitted_at := now();
      new.verified_at := null;
      new.verified_by := null;
      new.verification_notes := null;
      new.is_public := false;
    elsif old.verification_status <> 'approved' then
      new.is_public := false;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_institution_verification_fields
on public.institution_profiles;

create trigger protect_institution_verification_fields
before update on public.institution_profiles
for each row
execute function public.protect_institution_verification_fields();

-- Public institution discovery is restricted to approved institutions.
drop policy if exists "Public institution profiles readable"
on public.institution_profiles;

create policy "Approved public institution profiles readable"
on public.institution_profiles
for select
to anon, authenticated
using (
  (
    verification_status = 'approved'
    and is_public = true
  )
  or user_id = auth.uid()
  or public.is_examify_admin()
);

-- New institution accounts are created automatically from Auth metadata.
-- The submitted details are available to admins immediately, even when email
-- confirmation is enabled and the signup has no active client session yet.
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

-- Only approved institutions can invite members.
drop policy if exists "Institutions send relationship requests"
on public.institution_relationships;

create policy "Verified institutions send relationship requests"
on public.institution_relationships
for insert
to authenticated
with check (
  institution_id = auth.uid()
  and public.is_verified_institution(auth.uid())
  and relationship_type in ('teacher', 'student', 'parent')
  and public.user_has_profile_role(member_id, relationship_type)
  and member_id <> auth.uid()
);

-- Institution candidate search is also unavailable until approval.
create or replace function public.search_institution_candidates(p_query text, p_role text)
returns table(id uuid, display_name text, role text)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    p.id,
    coalesce(tp.display_name, p.full_name, 'Examify user'),
    p.role
  from public.profiles p
  left join public.teacher_profiles tp on tp.user_id = p.id
  where public.is_verified_institution(auth.uid())
    and p.role in ('teacher', 'student', 'parent')
    and p.role = p_role
    and coalesce(tp.display_name, p.full_name, '') ilike '%' || coalesce(p_query, '') || '%'
    and p.id <> auth.uid()
  order by 2
  limit 25;
$$;

revoke all on function public.search_institution_candidates(text, text) from public;
grant execute on function public.search_institution_candidates(text, text) to authenticated;

-- Only approved institutions expose teacher memberships publicly.
create or replace function public.get_institution_teachers(p_institution_id uuid)
returns table(user_id uuid, display_name text, headline text, profile_image_url text)
language sql
stable
security definer
set search_path = 'public'
as $$
  select tp.user_id, tp.display_name, tp.headline, tp.profile_image_url
  from public.institution_relationships ir
  join public.teacher_profiles tp on tp.user_id = ir.member_id
  join public.institution_profiles ip on ip.user_id = ir.institution_id
  where ir.institution_id = p_institution_id
    and ir.relationship_type = 'teacher'
    and ir.status = 'accepted'
    and tp.is_public = true
    and ip.verification_status = 'approved'
    and ip.is_public = true
  order by tp.display_name;
$$;

revoke all on function public.get_institution_teachers(uuid) from public;
grant execute on function public.get_institution_teachers(uuid) to anon, authenticated;

create or replace function public.get_teacher_institutions(p_teacher_id uuid)
returns table(institution_id uuid, name text, website_url text)
language sql
stable
security definer
set search_path = 'public'
as $$
  select ip.user_id, ip.name, ip.website_url
  from public.institution_relationships ir
  join public.institution_profiles ip on ip.user_id = ir.institution_id
  where ir.member_id = p_teacher_id
    and ir.relationship_type = 'teacher'
    and ir.status = 'accepted'
    and ip.is_public = true
    and ip.verification_status = 'approved'
  order by ip.name;
$$;

revoke all on function public.get_teacher_institutions(uuid) from public;
grant execute on function public.get_teacher_institutions(uuid) to anon, authenticated;

-- Users may only follow approved institutions.
drop policy if exists "Students teachers parents can follow institutions"
on public.institution_followers;

create policy "Students teachers parents can follow verified institutions"
on public.institution_followers
for insert
to authenticated
with check (
  follower_id = auth.uid()
  and (
    public.user_has_profile_role(auth.uid(), 'student')
    or public.user_has_profile_role(auth.uid(), 'teacher')
    or public.user_has_profile_role(auth.uid(), 'parent')
  )
  and exists (
    select 1
    from public.institution_profiles ip
    where ip.user_id = institution_followers.institution_id
      and ip.is_public = true
      and ip.verification_status = 'approved'
  )
);

-- Institution publishing/media rights now require admin approval.
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
        and (
          p.role = 'teacher'
          or (p.role = 'institution' and public.is_verified_institution(p.id))
        )
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
      and (
        p.role = 'teacher'
        or (p.role = 'institution' and public.is_verified_institution(p.id))
      )
  );
$$;

revoke all on function public.can_create_feed_media() from public;
grant execute on function public.can_create_feed_media() to authenticated;

-- Admin verification queue.
create or replace function public.get_admin_institution_verifications(
  p_status text default 'pending'
)
returns table(
  institution_id uuid,
  name text,
  physical_address text,
  contact_email text,
  website_url text,
  phone_number text,
  verification_status text,
  verification_submitted_at timestamptz,
  verified_at timestamptz,
  verification_notes text
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    ip.user_id,
    ip.name,
    ip.physical_address,
    ip.contact_email,
    ip.website_url,
    ip.phone_number,
    ip.verification_status,
    ip.verification_submitted_at,
    ip.verified_at,
    ip.verification_notes
  from public.institution_profiles ip
  where public.is_examify_admin()
    and (p_status = 'all' or ip.verification_status = p_status)
  order by
    case ip.verification_status when 'pending' then 0 when 'rejected' then 1 else 2 end,
    ip.verification_submitted_at asc;
$$;

revoke all on function public.get_admin_institution_verifications(text) from public;
grant execute on function public.get_admin_institution_verifications(text) to authenticated;

create or replace function public.admin_review_institution(
  p_institution_id uuid,
  p_decision text,
  p_notes text default null
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

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  if not exists (
    select 1 from public.institution_profiles where user_id = p_institution_id
  ) then
    raise exception 'Institution not found';
  end if;

  update public.institution_profiles
  set
    verification_status = p_decision,
    is_public = (p_decision = 'approved'),
    verified_at = case when p_decision = 'approved' then now() else null end,
    verified_by = auth.uid(),
    verification_notes = nullif(trim(coalesce(p_notes, '')), ''),
    updated_at = now()
  where user_id = p_institution_id;
end;
$$;

revoke all on function public.admin_review_institution(uuid, text, text) from public;
grant execute on function public.admin_review_institution(uuid, text, text) to authenticated;

-- Add pending verification requests to the existing admin dashboard summary.
drop function if exists public.get_admin_dashboard_stats();

create function public.get_admin_dashboard_stats()
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
  open_reports bigint,
  pending_institution_verifications bigint
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
    (select count(*) from public.feed_post_reports where status = 'open'),
    (select count(*) from public.institution_profiles where verification_status = 'pending')
  where public.is_examify_admin();
$$;

revoke all on function public.get_admin_dashboard_stats() from public;
grant execute on function public.get_admin_dashboard_stats() to authenticated;

create or replace function public.resubmit_institution_verification()
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not public.user_has_profile_role(auth.uid(), 'institution') then
    raise exception 'Institution account required';
  end if;

  update public.institution_profiles
  set
    verification_status = 'pending',
    verification_submitted_at = now(),
    verified_at = null,
    verified_by = null,
    verification_notes = null,
    is_public = false,
    updated_at = now()
  where user_id = auth.uid();
end;
$$;

revoke all on function public.resubmit_institution_verification() from public;
grant execute on function public.resubmit_institution_verification() to authenticated;

-- If an approved institution changes verification-sensitive details and returns
-- to Pending, its older posts are temporarily hidden from the community feed
-- until the institution is approved again. Admin moderation views still retain them.
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
    and (
      p.role <> 'institution'
      or public.is_verified_institution(p.id)
    )
  order by fp.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.get_feed_posts(integer, integer) from public;
grant execute on function public.get_feed_posts(integer, integer) to authenticated;
