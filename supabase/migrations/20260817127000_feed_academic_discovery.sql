-- Examify Update 64: safe academic discovery for the Feed.
-- Deliberately returns NO individual user/teacher/parent/student suggestions.

create or replace function public.get_feed_academic_discovery(
  p_limit_per_type integer default 4
)
returns table(
  item_type text,
  item_id uuid,
  title text,
  subtitle text,
  image_url text,
  href text,
  badge text
)
language sql
stable
security definer
set search_path='public'
as $$
  with settings as (
    select least(greatest(coalesce(p_limit_per_type,4),1),10) as lim
  ),
  institutions as (
    select
      'institution'::text,
      p.id,
      coalesce(ip.name,p.full_name,'Institution')::text,
      coalesce(nullif(ip.description,''),'Verified institution')::text,
      p.avatar_url::text,
      ('/institutions/'||p.id::text)::text,
      'Verified institution'::text
    from public.profiles p
    join public.institution_profiles ip on ip.user_id=p.id
    where auth.uid() is not null
      and p.role='institution'
      and ip.is_public=true
      and ip.verification_status='approved'
      and not public.has_block_between(auth.uid(),p.id)
    order by random()
    limit (select lim from settings)
  ),
  groups as (
    select
      'group'::text,
      g.id,
      g.name::text,
      coalesce(nullif(g.description,''),'Public academic group')::text,
      g.cover_image_url::text,
      ('/groups/'||g.id::text)::text,
      initcap(replace(g.category,'_',' '))::text
    from public.academic_groups g
    where auth.uid() is not null
      and g.is_discoverable=true
      and g.is_archived=false
    order by random()
    limit (select lim from settings)
  ),
  events as (
    select
      'event'::text,
      e.id,
      e.title::text,
      coalesce(nullif(e.location_name,''),nullif(e.description,''),'Public academic event')::text,
      null::text,
      ('/events/'||e.id::text)::text,
      ('Event · '||to_char(e.starts_at,'Mon DD'))::text
    from public.academic_events e
    where auth.uid() is not null
      and e.visibility='public'
      and e.starts_at >= now() - interval '1 day'
    order by e.starts_at asc
    limit (select lim from settings)
  ),
  exams as (
    select
      'exam'::text,
      e.id,
      e.title::text,
      coalesce(nullif(e.short_description,''),nullif(e.category,''),'Public exam')::text,
      e.cover_image_url::text,
      ('/exams/'||e.id::text)::text,
      coalesce(nullif(e.category,''),'Public exam')::text
    from public.exams e
    where auth.uid() is not null
      and e.status='published'
      and e.visibility='public'
    order by e.published_at desc nulls last
    limit (select lim from settings)
  )
  select * from institutions
  union all select * from groups
  union all select * from events
  union all select * from exams;
$$;

grant execute on function public.get_feed_academic_discovery(integer)
to authenticated;

notify pgrst,'reload schema';
