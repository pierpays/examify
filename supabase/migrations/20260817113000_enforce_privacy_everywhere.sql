-- Examify Update 48: enforce privacy choices across messaging, discovery,
-- profile viewing, mentions, and connection discovery.

-- Admins may send official platform/safety messages even when a recipient's
-- ordinary user-to-user messaging preference is more restrictive.
create or replace function public.can_message_user(
  p_target uuid,
  p_sender uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path='public'
as $$
  select exists(
    select 1
    from public.profiles target
    left join public.profiles sender on sender.id=p_sender
    where target.id=p_target
      and p_target<>p_sender
      and not public.has_block_between(p_sender,p_target)
      and (
        sender.role='admin'
        or target.message_permission='everyone'
        or (
          target.message_permission='connections'
          and public.are_connected(p_sender,p_target)
        )
      )
  );
$$;

grant execute on function public.can_message_user(uuid,uuid)
to authenticated;

-- New conversations cannot bypass recipient messaging preferences.
create or replace function public.get_or_create_direct_conversation(
  p_other_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_me uuid := auth.uid();
  v_one uuid;
  v_two uuid;
  v_conversation_id uuid;
  v_other_role text;
begin
  if v_me is null then
    raise exception 'You must be signed in.';
  end if;

  if p_other_user_id is null or p_other_user_id=v_me then
    raise exception 'Choose another Examify user.';
  end if;

  select p.role
  into v_other_role
  from public.profiles p
  where p.id=p_other_user_id;

  if v_other_role is null then
    raise exception 'User not found.';
  end if;

  if v_other_role='institution'
     and not public.is_verified_institution(p_other_user_id) then
    raise exception 'This institution is not available for messaging.';
  end if;

  if not public.can_message_user(p_other_user_id,v_me) then
    raise exception 'This account is not accepting messages from you.';
  end if;

  if v_me::text < p_other_user_id::text then
    v_one := v_me;
    v_two := p_other_user_id;
  else
    v_one := p_other_user_id;
    v_two := v_me;
  end if;

  insert into public.direct_conversations(user_one_id,user_two_id)
  values(v_one,v_two)
  on conflict(user_one_id,user_two_id)
  do update set updated_at=public.direct_conversations.updated_at
  returning id into v_conversation_id;

  return v_conversation_id;
end;
$$;

revoke all on function public.get_or_create_direct_conversation(uuid) from public;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

-- Re-check privacy every time a message is sent. Existing history remains
-- readable, but a user can stop future messages by changing privacy settings.
create or replace function public.send_direct_message(
  p_conversation_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_me uuid := auth.uid();
  v_other uuid;
  v_message_id uuid;
  v_body text := btrim(coalesce(p_body,''));
begin
  if v_me is null then
    raise exception 'You must be signed in.';
  end if;

  if char_length(v_body)<1 then
    raise exception 'Message cannot be empty.';
  end if;

  if char_length(v_body)>5000 then
    raise exception 'Message is too long.';
  end if;

  select
    case
      when c.user_one_id=v_me then c.user_two_id
      when c.user_two_id=v_me then c.user_one_id
      else null
    end
  into v_other
  from public.direct_conversations c
  where c.id=p_conversation_id;

  if v_other is null then
    raise exception 'Conversation not found.';
  end if;

  if not public.can_message_user(v_other,v_me) then
    raise exception 'This account is not accepting messages from you.';
  end if;

  insert into public.direct_messages(
    conversation_id,
    sender_id,
    body
  )
  values(
    p_conversation_id,
    v_me,
    v_body
  )
  returning id into v_message_id;

  update public.direct_conversations
  set updated_at=now()
  where id=p_conversation_id;

  return v_message_id;
end;
$$;

revoke all on function public.send_direct_message(uuid,text) from public;
grant execute on function public.send_direct_message(uuid,text) to authenticated;

-- Message search only exposes users the current account may actually message.
create or replace function public.search_message_people(
  p_query text,
  p_limit integer default 20
)
returns table(
  user_id uuid,
  display_name text,
  role text,
  avatar_url text,
  is_blocked_by_me boolean,
  has_blocked_me boolean
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    p.id,
    case
      when p.role='teacher'
        then coalesce(tp.display_name,p.full_name,'Teacher')
      when p.role='institution'
        then coalesce(ip.name,p.full_name,'Institution')
      else coalesce(p.full_name,'Examify user')
    end,
    p.role,
    coalesce(tp.profile_image_url,p.avatar_url),
    false,
    false
  from public.profiles p
  left join public.teacher_profiles tp on tp.user_id=p.id
  left join public.institution_profiles ip on ip.user_id=p.id
  where auth.uid() is not null
    and p.id<>auth.uid()
    and (
      p.role<>'institution'
      or ip.verification_status='approved'
    )
    and public.can_message_user(p.id,auth.uid())
    and (
      coalesce(
        case
          when p.role='teacher' then tp.display_name
          when p.role='institution' then ip.name
          else p.full_name
        end,
        ''
      ) ilike '%'||btrim(coalesce(p_query,''))||'%'
    )
  order by display_name
  limit least(greatest(coalesce(p_limit,20),1),50);
$$;

revoke all on function public.search_message_people(text,integer) from public;
grant execute on function public.search_message_people(text,integer) to authenticated;

-- Social discovery respects profile visibility and connection-request rules,
-- while existing sent/received/accepted relationships remain discoverable.
create or replace function public.search_connectable_people(
  p_query text default '',
  p_limit integer default 30
)
returns table(
  user_id uuid,
  display_name text,
  role text,
  avatar_url text,
  career text,
  studying_at text,
  connection_status text,
  mutual_count bigint
)
language sql
stable
security definer
set search_path='public'
as $$
  with me as (
    select role from public.profiles where id=auth.uid()
  ),
  candidates as (
    select
      p.id,
      p.full_name,
      p.role,
      p.avatar_url,
      p.career,
      p.studying_at,
      tp.display_name,
      tp.profile_image_url
    from public.profiles p
    cross join me
    left join public.teacher_profiles tp on tp.user_id=p.id
    where p.id<>auth.uid()
      and p.role=me.role
      and p.role in('student','teacher','parent')
      and not public.has_block_between(auth.uid(),p.id)
      and public.can_view_profile(p.id,auth.uid())
      and (
        coalesce(btrim(p_query),'')=''
        or coalesce(tp.display_name,p.full_name,'')
          ilike '%'||btrim(p_query)||'%'
      )
  )
  select
    c.id,
    coalesce(c.display_name,c.full_name,initcap(c.role)),
    c.role,
    coalesce(c.profile_image_url,c.avatar_url),
    case
      when p.career_visibility='examify'
        or public.are_connected(auth.uid(),c.id)
      then c.career else null
    end,
    case
      when p.studying_at_visibility='examify'
        or public.are_connected(auth.uid(),c.id)
      then c.studying_at else null
    end,
    case
      when uc.status='accepted' then 'connected'
      when uc.requester_id=auth.uid() then 'sent'
      when uc.addressee_id=auth.uid() then 'received'
      when public.can_send_connection_request(c.id,auth.uid()) then 'none'
      else 'unavailable'
    end,
    public.mutual_connection_count(auth.uid(),c.id) as mutual_count
  from candidates c
  join public.profiles p on p.id=c.id
  left join public.user_connections uc
    on (
      (uc.requester_id=auth.uid() and uc.addressee_id=c.id)
      or
      (uc.requester_id=c.id and uc.addressee_id=auth.uid())
    )
  where
    uc.status in ('pending','accepted')
    or public.can_send_connection_request(c.id,auth.uid())
  order by mutual_count desc,2
  limit least(greatest(coalesce(p_limit,30),1),100);
$$;

revoke all on function public.search_connectable_people(text,integer) from public;
grant execute on function public.search_connectable_people(text,integer) to authenticated;

-- The Facebook-style people profile now respects profile and field privacy.
drop function if exists public.get_connection_profile(uuid);

create function public.get_connection_profile(p_user_id uuid)
returns table(
  user_id uuid,
  display_name text,
  role text,
  avatar_url text,
  cover_image_url text,
  bio text,
  career text,
  studying_at text,
  birthday text,
  connection_status text,
  mutual_count bigint,
  connection_count bigint
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    p.id,
    case
      when p.role='teacher'
        then coalesce(tp.display_name,p.full_name,'Teacher')
      else coalesce(p.full_name,initcap(p.role))
    end,
    p.role,
    coalesce(tp.profile_image_url,p.avatar_url),
    p.cover_image_url,
    case when p.role='teacher' then tp.bio else p.bio end,
    case
      when p.id=auth.uid()
        or public.is_examify_admin()
        or p.career_visibility='examify'
        or (
          p.career_visibility='connections'
          and public.are_connected(auth.uid(),p.id)
        )
      then p.career else null
    end,
    case
      when p.id=auth.uid()
        or public.is_examify_admin()
        or p.studying_at_visibility='examify'
        or (
          p.studying_at_visibility='connections'
          and public.are_connected(auth.uid(),p.id)
        )
      then p.studying_at else null
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
      then to_char(p.date_of_birth,'FMMonth DD')
      else null
    end,
    case
      when p.id=auth.uid() then 'self'
      when uc.status='accepted' then 'connected'
      when uc.requester_id=auth.uid() then 'sent'
      when uc.addressee_id=auth.uid() then 'received'
      when public.can_send_connection_request(p.id,auth.uid()) then 'none'
      else 'unavailable'
    end,
    public.mutual_connection_count(auth.uid(),p.id),
    (
      select count(*)
      from public.user_connections x
      where x.status='accepted'
        and (x.requester_id=p.id or x.addressee_id=p.id)
    )
  from public.profiles p
  left join public.teacher_profiles tp on tp.user_id=p.id
  left join public.user_connections uc
    on (
      (uc.requester_id=auth.uid() and uc.addressee_id=p.id)
      or
      (uc.requester_id=p.id and uc.addressee_id=auth.uid())
    )
  where p.id=p_user_id
    and p.role in('student','teacher','parent')
    and public.can_view_profile(p.id,auth.uid());
$$;

grant execute on function public.get_connection_profile(uuid) to authenticated;

-- Search/Discover gets a privacy-aware academic profile source instead of
-- reading teacher/institution profile tables directly.
create or replace function public.search_visible_academic_profiles(
  p_query text,
  p_limit integer default 10
)
returns table(
  user_id uuid,
  display_name text,
  role text,
  headline text,
  description text,
  avatar_url text,
  website_url text
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    p.id,
    case
      when p.role='teacher'
        then coalesce(tp.display_name,p.full_name,'Teacher')
      else coalesce(ip.name,p.full_name,'Institution')
    end,
    p.role,
    case when p.role='teacher' then tp.headline else null end,
    case when p.role='institution' then ip.description else null end,
    coalesce(tp.profile_image_url,p.avatar_url),
    case
      when p.role='teacher' then tp.website_url
      when p.role='institution' then ip.website_url
      else null
    end
  from public.profiles p
  left join public.teacher_profiles tp on tp.user_id=p.id
  left join public.institution_profiles ip on ip.user_id=p.id
  where p.role in('teacher','institution')
    and (
      (p.role='teacher' and tp.is_public=true)
      or
      (
        p.role='institution'
        and ip.is_public=true
        and ip.verification_status='approved'
      )
    )
    and public.can_view_profile(p.id,auth.uid())
    and coalesce(tp.display_name,ip.name,p.full_name,'')
      ilike '%'||btrim(coalesce(p_query,''))||'%'
  order by display_name
  limit least(greatest(coalesce(p_limit,10),1),30);
$$;

grant execute on function public.search_visible_academic_profiles(text,integer)
to authenticated;

-- Mentions should not expose profiles the viewer has chosen to hide from.
create or replace function public.search_mentionable_people(
  p_query text default '',
  p_limit integer default 12
)
returns table(
  user_id uuid,
  display_name text,
  role text,
  avatar_url text
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    p.id,
    case
      when p.role='teacher'
        then coalesce(tp.display_name,p.full_name,'Teacher')
      when p.role='institution'
        then coalesce(ip.name,p.full_name,'Institution')
      when p.role='parent'
        then coalesce(p.full_name,'Parent')
      else coalesce(p.full_name,'Student')
    end,
    p.role,
    coalesce(tp.profile_image_url,p.avatar_url)
  from public.profiles p
  left join public.teacher_profiles tp on tp.user_id=p.id
  left join public.institution_profiles ip on ip.user_id=p.id
  where p.id<>auth.uid()
    and p.role in('student','teacher','parent','institution')
    and not public.has_block_between(auth.uid(),p.id)
    and public.can_view_profile(p.id,auth.uid())
    and (
      p.role<>'institution'
      or ip.verification_status='approved'
    )
    and (
      coalesce(btrim(p_query),'')=''
      or coalesce(tp.display_name,ip.name,p.full_name,'')
        ilike '%'||btrim(p_query)||'%'
    )
  order by
    case
      when coalesce(tp.display_name,ip.name,p.full_name,'')
        ilike btrim(p_query)||'%'
      then 0 else 1
    end,
    coalesce(tp.display_name,ip.name,p.full_name,'')
  limit least(greatest(coalesce(p_limit,12),1),30);
$$;

grant execute on function public.search_mentionable_people(text,integer)
to authenticated;


-- Profile timelines must respect both profile visibility and post audiences.
drop function if exists public.get_profile_feed_posts(uuid,integer);

create function public.get_profile_feed_posts(
  p_author_id uuid,
  p_limit integer default 50
)
returns table(
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
set search_path='public'
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
  join public.profiles p on p.id=fp.author_id
  left join public.exams e on e.id=fp.feed_exam_id
  left join public.teacher_profiles tp
    on tp.user_id=fp.author_id and p.role='teacher'
  left join public.institution_profiles ip
    on ip.user_id=fp.author_id and p.role='institution'
  where fp.author_id=p_author_id
    and fp.moderation_status='active'
    and public.can_view_profile(p_author_id,auth.uid())
    and not public.has_block_between(auth.uid(),p_author_id)
    and (
      fp.author_id=auth.uid()
      or public.is_examify_admin()
      or fp.audience='examify'
      or (
        fp.audience='connections'
        and public.are_connected(auth.uid(),fp.author_id)
      )
    )
    and (
      p.role in('student','parent')
      or (p.role='teacher' and tp.is_public=true)
      or (
        p.role='institution'
        and ip.is_public=true
        and ip.verification_status='approved'
      )
    )
  order by fp.created_at desc
  limit least(greatest(coalesce(p_limit,50),1),100);
$$;

revoke all on function public.get_profile_feed_posts(uuid,integer) from public;
grant execute on function public.get_profile_feed_posts(uuid,integer) to authenticated;

-- Public media helper must not bypass profile visibility.
create or replace function public.get_public_profile_media(
  p_user_id uuid
)
returns table(
  avatar_url text,
  cover_image_url text,
  bio text
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    case
      when p.role='teacher'
        then coalesce(tp.profile_image_url,p.avatar_url)
      else p.avatar_url
    end,
    p.cover_image_url,
    case
      when p.role='teacher' then tp.bio
      when p.role='institution' then ip.description
      else p.bio
    end
  from public.profiles p
  left join public.teacher_profiles tp on tp.user_id=p.id
  left join public.institution_profiles ip on ip.user_id=p.id
  where p.id=p_user_id
    and public.can_view_profile(p.id,auth.uid())
    and (
      p.role<>'institution'
      or ip.verification_status='approved'
    )
  limit 1;
$$;

revoke all on function public.get_public_profile_media(uuid) from public;
grant execute on function public.get_public_profile_media(uuid) to authenticated;


-- Preserve the existing reverse-request auto-accept behavior. If the target
-- already requested a connection, accepting that request must not be blocked
-- by the target's current preference for *new* requests.
create or replace function public.send_connection_request(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_me uuid:=auth.uid();
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
      and addressee_id=v_me
      and status='pending';

    if found then
      insert into public.notifications(
        user_id,
        actor_id,
        notification_type
      )
      values(
        p_user_id,
        v_me,
        'connection_accepted'
      );
    end if;

    return;
  end if;

  if not public.can_send_connection_request(p_user_id,v_me) then
    raise exception 'This account is not accepting this connection request.';
  end if;

  insert into public.user_connections(
    requester_id,
    addressee_id,
    status
  )
  values(
    v_me,
    p_user_id,
    'pending'
  )
  on conflict(requester_id,addressee_id)
  do nothing;

  if found then
    insert into public.notifications(
      user_id,
      actor_id,
      notification_type
    )
    values(
      p_user_id,
      v_me,
      'connection_request'
    );
  end if;
end;
$$;

grant execute on function public.send_connection_request(uuid)
to authenticated;

notify pgrst,'reload schema';
