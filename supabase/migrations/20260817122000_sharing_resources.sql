-- Examify Update 57: safe reposting and academic resource sharing.

create table if not exists public.feed_shared_resources(
  post_id uuid primary key references public.feed_posts(id) on delete cascade,
  resource_type text not null
    check(resource_type in('exam','teacher','institution','event','group')),
  resource_id uuid not null,
  title text not null,
  description text,
  image_url text,
  href text not null,
  created_at timestamptz not null default now()
);

alter table public.feed_shared_resources enable row level security;

drop policy if exists "Users read visible shared resources" on public.feed_shared_resources;
create policy "Users read visible shared resources"
on public.feed_shared_resources
for select
to authenticated
using(
  exists(
    select 1
    from public.feed_posts fp
    where fp.id=post_id
      and fp.moderation_status='active'
      and not public.has_block_between(auth.uid(),fp.author_id)
      and (
        fp.author_id=auth.uid()
        or public.is_examify_admin()
        or (
          coalesce(fp.scheduled_at,fp.created_at)<=now()
          and (
            fp.audience='examify'
            or (
              fp.audience='connections'
              and public.are_connected(auth.uid(),fp.author_id)
            )
          )
        )
      )
  )
);

create or replace function public.share_feed_post(
  p_post_id uuid,
  p_message text default '',
  p_audience text default 'examify'
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_source public.feed_posts%rowtype;
  v_original_id uuid;
  v_original_author uuid;
  v_new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not public.can_create_feed_media() then
    raise exception 'This account cannot publish to the Feed.';
  end if;

  if p_audience not in('examify','connections') then
    raise exception 'Invalid audience.';
  end if;

  select *
  into v_source
  from public.feed_posts
  where id=p_post_id
    and moderation_status='active';

  if v_source.id is null then
    raise exception 'Post not found.';
  end if;

  v_original_id:=coalesce(v_source.shared_post_id,v_source.id);

  select author_id
  into v_original_author
  from public.feed_posts
  where id=v_original_id
    and moderation_status='active';

  if v_original_author is null then
    raise exception 'The original post is no longer available.';
  end if;

  if v_original_author=auth.uid() then
    raise exception 'You cannot repost your own post.';
  end if;

  if public.has_block_between(auth.uid(),v_original_author) then
    raise exception 'This post cannot be shared.';
  end if;

  -- Connections-only content is intentionally not reshareable because the
  -- sharer's connections are not necessarily connected to the original author.
  if not exists(
    select 1
    from public.feed_posts fp
    where fp.id=v_original_id
      and fp.audience='examify'
      and fp.moderation_status='active'
      and coalesce(fp.scheduled_at,fp.created_at)<=now()
  ) then
    raise exception 'Only posts shared with all of Examify can be reposted.';
  end if;

  insert into public.feed_posts(
    author_id,
    post_type,
    body,
    shared_post_id,
    audience
  )
  values(
    auth.uid(),
    'post',
    nullif(btrim(coalesce(p_message,'')),''),
    v_original_id,
    p_audience
  )
  returning id into v_new_id;

  insert into public.notifications(
    user_id,
    actor_id,
    notification_type,
    post_id
  )
  values(
    v_original_author,
    auth.uid(),
    'post_shared',
    v_new_id
  );

  return v_new_id;
end;
$$;

grant execute on function public.share_feed_post(uuid,text,text)
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

  if not public.can_create_feed_media() then
    raise exception 'This account cannot publish to the Feed.';
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
      null::text,
      '/events/'||ev.id::text
    into v_title,v_description,v_image,v_href
    from public.academic_events ev
    where ev.id=p_resource_id
      and ev.visibility='public';

  elsif p_resource_type='group' then
    select
      g.name,
      g.description,
      null::text,
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

grant execute on function public.share_academic_resource_to_feed(text,uuid,text,text)
to authenticated;

notify pgrst,'reload schema';
