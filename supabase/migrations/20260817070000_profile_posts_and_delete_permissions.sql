-- Public creator-profile posts + explicit feed deletion permissions.

-- Deletion is restricted to the post author or an Examify administrator.
drop policy if exists "Authors can delete own feed posts" on public.feed_posts;
create policy "Authors can delete own feed posts"
on public.feed_posts
for delete
to authenticated
using (author_id = auth.uid());

drop policy if exists "Admins can delete any feed post" on public.feed_posts;
create policy "Admins can delete any feed post"
on public.feed_posts
for delete
to authenticated
using (public.is_examify_admin());

-- Active posts by public teachers/institutions are displayed on creator profiles.
create or replace function public.get_profile_feed_posts(
  p_author_id uuid,
  p_limit integer default 50
)
returns table (
  id uuid,
  author_id uuid,
  post_type text,
  body text,
  created_at timestamptz,
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
    fp.post_type,
    fp.body,
    fp.created_at,
    fp.feed_exam_id,
    e.title,
    e.category,
    e.cover_image_url,
    e.short_description,
    fp.image_url,
    fp.link_url,
    fp.document_url,
    fp.document_name,
    fp.document_size,
    fp.document_mime_type
  from public.feed_posts fp
  join public.profiles p on p.id = fp.author_id
  left join public.exams e on e.id = fp.feed_exam_id
  left join public.teacher_profiles tp
    on tp.user_id = fp.author_id and p.role = 'teacher'
  left join public.institution_profiles ip
    on ip.user_id = fp.author_id and p.role = 'institution'
  where fp.author_id = p_author_id
    and fp.moderation_status = 'active'
    and (
      (p.role = 'teacher' and tp.is_public = true)
      or
      (p.role = 'institution' and ip.is_public = true and ip.verification_status = 'approved')
    )
  order by fp.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.get_profile_feed_posts(uuid, integer) from public;
grant execute on function public.get_profile_feed_posts(uuid, integer) to anon, authenticated;
