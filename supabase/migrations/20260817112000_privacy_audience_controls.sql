-- Examify Update 47: Privacy & Audience Controls
-- Safety-first defaults for an academic social network.

alter table public.profiles
  add column if not exists profile_visibility text not null default 'examify'
    check (profile_visibility in ('examify','connections')),
  add column if not exists career_visibility text not null default 'examify'
    check (career_visibility in ('examify','connections','private')),
  add column if not exists studying_at_visibility text not null default 'examify'
    check (studying_at_visibility in ('examify','connections','private')),
  add column if not exists birthday_visibility text not null default 'connections'
    check (birthday_visibility in ('examify','connections','private')),
  add column if not exists message_permission text not null default 'connections'
    check (message_permission in ('everyone','connections','nobody')),
  add column if not exists connection_request_permission text not null default 'everyone'
    check (connection_request_permission in ('everyone','mutuals','nobody'));

alter table public.feed_posts
  add column if not exists audience text not null default 'examify'
    check (audience in ('examify','connections'));

create index if not exists feed_posts_audience_idx
  on public.feed_posts(audience,created_at desc);

create or replace function public.are_connected(p_user_a uuid,p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path='public'
as $$
  select exists(
    select 1 from public.user_connections c
    where c.status='accepted'
      and (
        (c.requester_id=p_user_a and c.addressee_id=p_user_b)
        or
        (c.requester_id=p_user_b and c.addressee_id=p_user_a)
      )
  );
$$;
grant execute on function public.are_connected(uuid,uuid) to authenticated;

create or replace function public.mutual_connection_count(p_user_a uuid,p_user_b uuid)
returns bigint
language sql
stable
security definer
set search_path='public'
as $$
  with a as (
    select case when requester_id=p_user_a then addressee_id else requester_id end as friend_id
    from public.user_connections
    where status='accepted' and (requester_id=p_user_a or addressee_id=p_user_a)
  ),
  b as (
    select case when requester_id=p_user_b then addressee_id else requester_id end as friend_id
    from public.user_connections
    where status='accepted' and (requester_id=p_user_b or addressee_id=p_user_b)
  )
  select count(*) from a join b using(friend_id);
$$;
grant execute on function public.mutual_connection_count(uuid,uuid) to authenticated;

create or replace function public.can_view_profile(p_target uuid,p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path='public'
as $$
  select exists(
    select 1 from public.profiles p
    where p.id=p_target
      and (
        p_target=p_viewer
        or public.is_examify_admin()
        or not public.has_block_between(p_viewer,p_target)
           and (
             p.profile_visibility='examify'
             or public.are_connected(p_viewer,p_target)
           )
      )
  );
$$;
grant execute on function public.can_view_profile(uuid,uuid) to authenticated;

create or replace function public.can_message_user(p_target uuid,p_sender uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path='public'
as $$
  select exists(
    select 1 from public.profiles p
    where p.id=p_target
      and p_target<>p_sender
      and not public.has_block_between(p_sender,p_target)
      and (
        p.message_permission='everyone'
        or (
          p.message_permission='connections'
          and public.are_connected(p_sender,p_target)
        )
      )
  );
$$;
grant execute on function public.can_message_user(uuid,uuid) to authenticated;

create or replace function public.can_send_connection_request(p_target uuid,p_sender uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path='public'
as $$
  select exists(
    select 1 from public.profiles p
    where p.id=p_target
      and p_target<>p_sender
      and p.role in ('student','teacher','parent')
      and not public.has_block_between(p_sender,p_target)
      and not public.are_connected(p_sender,p_target)
      and (
        p.connection_request_permission='everyone'
        or (
          p.connection_request_permission='mutuals'
          and public.mutual_connection_count(p_sender,p_target)>0
        )
      )
  );
$$;
grant execute on function public.can_send_connection_request(uuid,uuid) to authenticated;

create or replace function public.get_my_privacy_settings()
returns table(
  profile_visibility text,
  career_visibility text,
  studying_at_visibility text,
  birthday_visibility text,
  message_permission text,
  connection_request_permission text
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    p.profile_visibility,
    p.career_visibility,
    p.studying_at_visibility,
    p.birthday_visibility,
    p.message_permission,
    p.connection_request_permission
  from public.profiles p
  where p.id=auth.uid();
$$;
grant execute on function public.get_my_privacy_settings() to authenticated;

create or replace function public.update_my_privacy_settings(
  p_profile_visibility text,
  p_career_visibility text,
  p_studying_at_visibility text,
  p_birthday_visibility text,
  p_message_permission text,
  p_connection_request_permission text
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
begin
  if p_profile_visibility not in ('examify','connections')
     or p_career_visibility not in ('examify','connections','private')
     or p_studying_at_visibility not in ('examify','connections','private')
     or p_birthday_visibility not in ('examify','connections','private')
     or p_message_permission not in ('everyone','connections','nobody')
     or p_connection_request_permission not in ('everyone','mutuals','nobody')
  then
    raise exception 'Invalid privacy setting.';
  end if;

  update public.profiles
  set
    profile_visibility=p_profile_visibility,
    career_visibility=p_career_visibility,
    studying_at_visibility=p_studying_at_visibility,
    birthday_visibility=p_birthday_visibility,
    message_permission=p_message_permission,
    connection_request_permission=p_connection_request_permission
  where id=auth.uid();
end;
$$;
grant execute on function public.update_my_privacy_settings(text,text,text,text,text,text)
to authenticated;

-- Replace the public personal-details RPC with privacy-aware field filtering.
drop function if exists public.get_public_person_profile_details(uuid);
create function public.get_public_person_profile_details(p_user_id uuid)
returns table(
  career text,
  studying_at text,
  birthday_month integer,
  birthday_day integer
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    case
      when p.id=auth.uid()
        or public.is_examify_admin()
        or p.career_visibility='examify'
        or (p.career_visibility='connections' and public.are_connected(auth.uid(),p.id))
      then p.career else null end,
    case
      when p.id=auth.uid()
        or public.is_examify_admin()
        or p.studying_at_visibility='examify'
        or (p.studying_at_visibility='connections' and public.are_connected(auth.uid(),p.id))
      then p.studying_at else null end,
    case
      when p.show_birthday
        and p.date_of_birth is not null
        and (
          p.id=auth.uid()
          or public.is_examify_admin()
          or p.birthday_visibility='examify'
          or (
            p.birthday_visibility='connections'
            and public.are_connected(auth.uid(),p.id)
          )
        )
      then extract(month from p.date_of_birth)::integer
      else null
    end,
    case
      when p.show_birthday
        and p.date_of_birth is not null
        and (
          p.id=auth.uid()
          or public.is_examify_admin()
          or p.birthday_visibility='examify'
          or (
            p.birthday_visibility='connections'
            and public.are_connected(auth.uid(),p.id)
          )
        )
      then extract(day from p.date_of_birth)::integer
      else null
    end
  from public.profiles p
  where p.id=p_user_id
    and public.can_view_profile(p.id,auth.uid());
$$;
grant execute on function public.get_public_person_profile_details(uuid) to authenticated;

-- Feed visibility: Examify-wide posts remain visible; connection-only posts require an accepted connection.
drop function if exists public.get_feed_posts(integer,integer);
create function public.get_feed_posts(p_limit integer default 50,p_offset integer default 0)
returns table(
 id uuid,author_id uuid,author_role text,author_name text,author_avatar_url text,
 post_type text,body text,created_at timestamptz,
 achievement_attempt_id uuid,achievement_exam_id uuid,achievement_exam_title text,
 achievement_cover_image_url text,achievement_score numeric,achievement_passing_score integer,
 feed_exam_id uuid,feed_exam_title text,feed_exam_category text,feed_exam_cover_image_url text,
 feed_exam_short_description text,image_url text,link_url text,document_url text,
 document_name text,document_size bigint,document_mime_type text,
 shared_post_id uuid,shared_author_id uuid,shared_author_role text,shared_author_name text,
 shared_body text,shared_image_url text,shared_link_url text,shared_document_url text,
 shared_document_name text,shared_post_type text,shared_created_at timestamptz,
 audience text
)
language sql stable security definer set search_path='public' as $$
 select
 fp.id,fp.author_id,p.role,
 case when p.role='teacher' then coalesce(tp.display_name,p.full_name,'Teacher')
      when p.role='institution' then coalesce(ip.name,p.full_name,'Institution')
      else coalesce(p.full_name,'Student') end,
 case when p.role='teacher' then coalesce(tp.profile_image_url,p.avatar_url) else p.avatar_url end,
 fp.post_type,fp.body,fp.created_at,fp.achievement_attempt_id,
 a.exam_id,ae.title,ae.cover_image_url,a.score_percent,ae.passing_score,
 fp.feed_exam_id,fe.title,fe.category,fe.cover_image_url,fe.short_description,
 fp.image_url,fp.link_url,fp.document_url,fp.document_name,fp.document_size,fp.document_mime_type,
 fp.shared_post_id,sp.author_id,sp_profile.role,
 case when sp_profile.role='teacher' then coalesce(sp_tp.display_name,sp_profile.full_name,'Teacher')
      when sp_profile.role='institution' then coalesce(sp_ip.name,sp_profile.full_name,'Institution')
      else coalesce(sp_profile.full_name,'Student') end,
 sp.body,sp.image_url,sp.link_url,sp.document_url,sp.document_name,sp.post_type,sp.created_at,
 fp.audience
 from public.feed_posts fp
 join public.profiles p on p.id=fp.author_id
 left join public.teacher_profiles tp on tp.user_id=fp.author_id
 left join public.institution_profiles ip on ip.user_id=fp.author_id
 left join public.exam_attempts a on a.id=fp.achievement_attempt_id
 left join public.exams ae on ae.id=a.exam_id
 left join public.exams fe on fe.id=fp.feed_exam_id
 left join public.feed_posts sp on sp.id=fp.shared_post_id and sp.moderation_status='active'
 left join public.profiles sp_profile on sp_profile.id=sp.author_id
 left join public.teacher_profiles sp_tp on sp_tp.user_id=sp.author_id
 left join public.institution_profiles sp_ip on sp_ip.user_id=sp.author_id
 where auth.uid() is not null
   and fp.moderation_status='active'
   and not public.has_block_between(auth.uid(),fp.author_id)
   and (
     fp.author_id=auth.uid()
     or public.is_examify_admin()
     or fp.audience='examify'
     or (fp.audience='connections' and public.are_connected(auth.uid(),fp.author_id))
   )
 order by fp.created_at desc
 limit least(greatest(coalesce(p_limit,50),1),100)
 offset greatest(coalesce(p_offset,0),0);
$$;
grant execute on function public.get_feed_posts(integer,integer) to authenticated;

-- Enforce connection-request privacy at the write boundary.
create or replace function public.send_connection_request(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_me uuid := auth.uid();
  v_reverse public.user_connections%rowtype;
begin
  if v_me is null then
    raise exception 'You must be signed in.';
  end if;

  if p_user_id is null or p_user_id=v_me then
    raise exception 'Choose another user.';
  end if;

  if not public.connection_roles_compatible(v_me,p_user_id) then
    raise exception 'Connections are only available between students, between teachers, or between parents.';
  end if;

  if public.has_block_between(v_me,p_user_id) then
    raise exception 'Connection unavailable because one account has blocked the other.';
  end if;

  if not public.can_send_connection_request(p_user_id,v_me) then
    raise exception 'This account is not accepting this connection request.';
  end if;

  select *
  into v_reverse
  from public.user_connections
  where requester_id=p_user_id
    and addressee_id=v_me;

  if found then
    if v_reverse.status='accepted' then
      raise exception 'You are already connected.';
    end if;

    update public.user_connections
    set status='accepted',responded_at=now()
    where requester_id=p_user_id
      and addressee_id=v_me;

    insert into public.notifications(user_id,actor_id,notification_type)
    values(p_user_id,v_me,'connection_accepted');

    return;
  end if;

  insert into public.user_connections(requester_id,addressee_id,status)
  values(v_me,p_user_id,'pending')
  on conflict(requester_id,addressee_id) do nothing;

  if found then
    insert into public.notifications(user_id,actor_id,notification_type)
    values(p_user_id,v_me,'connection_request');
  end if;
end;
$$;

grant execute on function public.send_connection_request(uuid) to authenticated;

notify pgrst,'reload schema';
