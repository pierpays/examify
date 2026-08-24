-- Examify Update 66b:
-- Event editing and event sharing by students, parents, teachers, and verified institutions.

create or replace function public.update_academic_event(
  p_event_id uuid,
  p_title text,
  p_description text,
  p_event_type text,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_location_name text default null,
  p_meeting_url text default null,
  p_cover_image_url text default null
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if p_event_type not in(
    'class',
    'workshop',
    'webinar',
    'exam_session',
    'study_session',
    'conference',
    'deadline',
    'other'
  ) then
    raise exception 'Invalid event type.';
  end if;

  if char_length(btrim(coalesce(p_title,''))) < 3
     or char_length(btrim(coalesce(p_title,''))) > 160 then
    raise exception 'Event title must be between 3 and 160 characters.';
  end if;

  if p_description is not null
     and char_length(p_description) > 5000 then
    raise exception 'Event description is too long.';
  end if;

  if p_ends_at is not null and p_ends_at < p_starts_at then
    raise exception 'Event end time cannot be before its start time.';
  end if;

  update public.academic_events
  set
    title=btrim(p_title),
    description=nullif(btrim(coalesce(p_description,'')),''),
    event_type=p_event_type,
    starts_at=p_starts_at,
    ends_at=p_ends_at,
    location_name=nullif(btrim(coalesce(p_location_name,'')),''),
    meeting_url=nullif(btrim(coalesce(p_meeting_url,'')),''),
    cover_image_url=p_cover_image_url,
    updated_at=now()
  where id=p_event_id
    and creator_id=auth.uid()
    and status='scheduled';

  if not found then
    raise exception 'Only the creator can edit an active event.';
  end if;
end;
$$;

revoke all on function public.update_academic_event(
  uuid,text,text,text,timestamptz,timestamptz,text,text,text
) from public;

grant execute on function public.update_academic_event(
  uuid,text,text,text,timestamptz,timestamptz,text,text,text
) to authenticated;

-- Sharing an academic resource is intentionally broader than permission to
-- publish arbitrary Feed media. This allows student/parent resource sharing
-- without granting those roles unrestricted media-post creation.
create or replace function public.can_share_academic_resource()
returns boolean
language sql
stable
security definer
set search_path='public'
as $$
  select exists(
    select 1
    from public.profiles p
    where p.id=auth.uid()
      and (
        p.role in('student','parent','teacher')
        or (
          p.role='institution'
          and public.is_verified_institution(p.id)
        )
        or p.role='admin'
      )
  );
$$;

revoke all on function public.can_share_academic_resource() from public;
grant execute on function public.can_share_academic_resource()
to authenticated;

create or replace function public.share_academic_resource_to_feed(
  p_resource_type text,
  p_resource_id uuid,
  p_message text default '',
  p_audience text default 'examify'
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_title text;
  v_description text;
  v_image text;
  v_href text;
  v_new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not public.can_share_academic_resource() then
    raise exception 'This account cannot share academic resources.';
  end if;

  if p_audience not in('examify','connections') then
    raise exception 'Invalid audience.';
  end if;

  if p_resource_type='exam' then
    select
      e.title,
      e.short_description,
      e.cover_image_url,
      '/exams/'||e.id::text
    into v_title,v_description,v_image,v_href
    from public.exams e
    where e.id=p_resource_id
      and e.status='published'
      and e.visibility='public';

  elsif p_resource_type='teacher' then
    select
      tp.display_name,
      coalesce(tp.headline,tp.bio),
      tp.profile_image_url,
      '/teachers/'||tp.user_id::text
    into v_title,v_description,v_image,v_href
    from public.teacher_profiles tp
    where tp.user_id=p_resource_id
      and tp.is_public=true
      and not public.has_block_between(auth.uid(),tp.user_id);

  elsif p_resource_type='institution' then
    select
      ip.name,
      ip.description,
      p.avatar_url,
      '/institutions/'||ip.user_id::text
    into v_title,v_description,v_image,v_href
    from public.institution_profiles ip
    join public.profiles p on p.id=ip.user_id
    where ip.user_id=p_resource_id
      and ip.is_public=true
      and ip.verification_status='approved'
      and not public.has_block_between(auth.uid(),ip.user_id);

  elsif p_resource_type='event' then
    select
      ev.title,
      ev.description,
      ev.cover_image_url,
      '/events/'||ev.id::text
    into v_title,v_description,v_image,v_href
    from public.academic_events ev
    where ev.id=p_resource_id
      and ev.visibility='public';

  elsif p_resource_type='group' then
    select
      g.name,
      g.description,
      g.cover_image_url,
      '/groups/'||g.id::text
    into v_title,v_description,v_image,v_href
    from public.academic_groups g
    where g.id=p_resource_id
      and g.is_discoverable=true
      and not g.is_archived;

  else
    raise exception 'Invalid resource type.';
  end if;

  if v_title is null then
    raise exception 'This academic resource is not publicly shareable.';
  end if;

  insert into public.feed_posts(
    author_id,
    post_type,
    body,
    audience
  )
  values(
    auth.uid(),
    'post',
    coalesce(
      nullif(btrim(coalesce(p_message,'')),''),
      'Shared an academic '||p_resource_type
    ),
    p_audience
  )
  returning id into v_new_id;

  insert into public.feed_shared_resources(
    post_id,
    resource_type,
    resource_id,
    title,
    description,
    image_url,
    href
  )
  values(
    v_new_id,
    p_resource_type,
    p_resource_id,
    v_title,
    v_description,
    v_image,
    v_href
  );

  return v_new_id;
end;
$$;

revoke all on function public.share_academic_resource_to_feed(
  text,uuid,text,text
) from public;

grant execute on function public.share_academic_resource_to_feed(
  text,uuid,text,text
) to authenticated;

notify pgrst,'reload schema';
