-- Examify Update 62: Global Search
-- Search public/visible academic content from one privacy-aware endpoint.

create or replace function public.search_examify_global(
  p_query text default '',
  p_exam_date date default null,
  p_limit_per_type integer default 8
)
returns table(
  result_type text,
  result_id uuid,
  title text,
  subtitle text,
  image_url text,
  href text,
  meta text,
  occurred_at timestamptz
)
language sql
stable
security definer
set search_path='public'
as $$
  with settings as (
    select
      btrim(coalesce(p_query,'')) as q,
      least(greatest(coalesce(p_limit_per_type,8),1),20) as lim,
      (select role from public.profiles where id=auth.uid()) as viewer_role
  ),
  people_results as (
    select
      'people'::text as result_type,
      p.id as result_id,
      coalesce(p.full_name,initcap(p.role))::text as title,
      case
        when p.career is not null and btrim(p.career)<>'' then p.career
        when p.studying_at is not null and btrim(p.studying_at)<>'' then 'Studying at '||p.studying_at
        else initcap(p.role)
      end::text as subtitle,
      p.avatar_url::text as image_url,
      ('/people/'||p.id::text)::text as href,
      initcap(p.role)::text as meta,
      null::timestamptz as occurred_at
    from public.profiles p
    cross join settings s
    where auth.uid() is not null
      and p.id<>auth.uid()
      and p.role in('student','parent')
      and p.role=s.viewer_role
      and not public.has_block_between(auth.uid(),p.id)
      and public.can_view_profile(p.id,auth.uid())
      and s.q<>''
      and (
        coalesce(p.full_name,'') ilike '%'||s.q||'%'
        or coalesce(p.career,'') ilike '%'||s.q||'%'
        or coalesce(p.studying_at,'') ilike '%'||s.q||'%'
      )
    order by
      case when coalesce(p.full_name,'') ilike s.q||'%' then 0 else 1 end,
      coalesce(p.full_name,'')
    limit (select lim from settings)
  ),
  teacher_results as (
    select
      'teachers'::text,
      p.id,
      coalesce(tp.display_name,p.full_name,'Teacher')::text,
      coalesce(nullif(tp.headline,''),'Registered teacher')::text,
      coalesce(tp.profile_image_url,p.avatar_url)::text,
      ('/teachers/'||p.id::text)::text,
      'Teacher'::text,
      null::timestamptz
    from public.profiles p
    join public.teacher_profiles tp on tp.user_id=p.id
    cross join settings s
    where auth.uid() is not null
      and p.role='teacher'
      and tp.is_public=true
      and not public.has_block_between(auth.uid(),p.id)
      and public.can_view_profile(p.id,auth.uid())
      and s.q<>''
      and (
        coalesce(tp.display_name,p.full_name,'') ilike '%'||s.q||'%'
        or coalesce(tp.headline,'') ilike '%'||s.q||'%'
        or coalesce(p.career,'') ilike '%'||s.q||'%'
      )
    order by
      case when coalesce(tp.display_name,p.full_name,'') ilike s.q||'%' then 0 else 1 end,
      coalesce(tp.display_name,p.full_name,'')
    limit (select lim from settings)
  ),
  institution_results as (
    select
      'institutions'::text,
      p.id,
      coalesce(ip.name,p.full_name,'Institution')::text,
      coalesce(nullif(ip.description,''),'Verified institution')::text,
      p.avatar_url::text,
      ('/institutions/'||p.id::text)::text,
      'Verified institution'::text,
      null::timestamptz
    from public.profiles p
    join public.institution_profiles ip on ip.user_id=p.id
    cross join settings s
    where auth.uid() is not null
      and p.role='institution'
      and ip.is_public=true
      and ip.verification_status='approved'
      and not public.has_block_between(auth.uid(),p.id)
      and public.can_view_profile(p.id,auth.uid())
      and s.q<>''
      and (
        coalesce(ip.name,p.full_name,'') ilike '%'||s.q||'%'
        or coalesce(ip.description,'') ilike '%'||s.q||'%'
      )
    order by
      case when coalesce(ip.name,p.full_name,'') ilike s.q||'%' then 0 else 1 end,
      coalesce(ip.name,p.full_name,'')
    limit (select lim from settings)
  ),
  exam_results as (
    select
      'exams'::text,
      e.id,
      e.title::text,
      coalesce(nullif(e.short_description,''),nullif(e.category,''),'Public exam')::text,
      e.cover_image_url::text,
      ('/exams/'||e.id::text)::text,
      case
        when e.category is not null and btrim(e.category)<>''
          then e.exam_code||' · '||e.category
        else e.exam_code
      end::text,
      e.published_at
    from public.exams e
    cross join settings s
    where auth.uid() is not null
      and e.status='published'
      and e.visibility='public'
      and (
        (
          s.q<>''
          and (
            e.title ilike '%'||s.q||'%'
            or e.exam_code ilike '%'||s.q||'%'
            or coalesce(e.category,'') ilike '%'||s.q||'%'
            or coalesce(e.short_description,'') ilike '%'||s.q||'%'
          )
        )
        or p_exam_date is not null
      )
      and (
        p_exam_date is null
        or e.published_at::date=p_exam_date
      )
    order by
      case when s.q<>'' and e.title ilike s.q||'%' then 0 else 1 end,
      e.published_at desc nulls last
    limit (select lim from settings)
  ),
  group_results as (
    select
      'groups'::text,
      g.id,
      g.name::text,
      coalesce(nullif(g.description,''),'Academic group or class')::text,
      g.cover_image_url::text,
      ('/groups/'||g.id::text)::text,
      initcap(replace(g.category,'_',' '))::text,
      g.created_at
    from public.academic_groups g
    cross join settings s
    where auth.uid() is not null
      and g.is_discoverable=true
      and g.is_archived=false
      and s.q<>''
      and (
        g.name ilike '%'||s.q||'%'
        or coalesce(g.description,'') ilike '%'||s.q||'%'
        or coalesce(g.category,'') ilike '%'||s.q||'%'
      )
    order by
      case when g.name ilike s.q||'%' then 0 else 1 end,
      g.created_at desc
    limit (select lim from settings)
  ),
  event_results as (
    select
      'events'::text,
      ev.id,
      ev.title::text,
      coalesce(
        nullif(ev.description,''),
        nullif(ev.location_name,''),
        initcap(replace(ev.event_type,'_',' '))
      )::text,
      null::text,
      ('/events/'||ev.id::text)::text,
      (
        initcap(replace(ev.event_type,'_',' '))
        ||' · '||
        to_char(ev.starts_at,'Mon DD, YYYY')
      )::text,
      ev.starts_at
    from public.academic_events ev
    cross join settings s
    where auth.uid() is not null
      and ev.visibility='public'
      and s.q<>''
      and (
        ev.title ilike '%'||s.q||'%'
        or coalesce(ev.description,'') ilike '%'||s.q||'%'
        or coalesce(ev.location_name,'') ilike '%'||s.q||'%'
        or coalesce(ev.event_type,'') ilike '%'||s.q||'%'
      )
    order by
      case when ev.title ilike s.q||'%' then 0 else 1 end,
      ev.starts_at desc
    limit (select lim from settings)
  ),
  post_results as (
    select
      'posts'::text,
      fp.id,
      case
        when p.role='teacher'
          then coalesce(tp.display_name,p.full_name,'Teacher')
        when p.role='institution'
          then coalesce(ip.name,p.full_name,'Institution')
        else coalesce(p.full_name,'Examify user')
      end::text as title,
      left(
        coalesce(
          nullif(fp.body,''),
          nullif(fp.document_name,''),
          'Examify post'
        ),
        220
      )::text as subtitle,
      case
        when p.role='teacher'
          then coalesce(tp.profile_image_url,p.avatar_url)
        else p.avatar_url
      end::text as image_url,
      ('/feed#post-'||fp.id::text)::text as href,
      (
        initcap(p.role)
        ||' · '||
        to_char(fp.created_at,'Mon DD, YYYY')
      )::text as meta,
      fp.created_at
    from public.feed_posts fp
    join public.profiles p on p.id=fp.author_id
    left join public.teacher_profiles tp on tp.user_id=fp.author_id
    left join public.institution_profiles ip on ip.user_id=fp.author_id
    cross join settings s
    where auth.uid() is not null
      and fp.moderation_status='active'
      and not public.has_block_between(auth.uid(),fp.author_id)
      and (
        fp.author_id=auth.uid()
        or public.is_examify_admin()
        or coalesce(fp.scheduled_at,fp.created_at)<=now()
      )
      and (
        fp.author_id=auth.uid()
        or public.is_examify_admin()
        or fp.audience='examify'
        or (
          fp.audience='connections'
          and public.are_connected(auth.uid(),fp.author_id)
        )
      )
      and s.q<>''
      and (
        coalesce(fp.body,'') ilike '%'||s.q||'%'
        or coalesce(fp.document_name,'') ilike '%'||s.q||'%'
        or coalesce(p.full_name,'') ilike '%'||s.q||'%'
        or coalesce(tp.display_name,'') ilike '%'||s.q||'%'
        or coalesce(ip.name,'') ilike '%'||s.q||'%'
      )
    order by fp.created_at desc
    limit (select lim from settings)
  )
  select * from people_results
  union all select * from teacher_results
  union all select * from institution_results
  union all select * from exam_results
  union all select * from group_results
  union all select * from event_results
  union all select * from post_results;
$$;

grant execute on function public.search_examify_global(text,date,integer)
to authenticated;

notify pgrst,'reload schema';
