-- Examify Update 73: Central Requests Hub.
-- Unifies actionable inbound requests and adds explicit event attendance requests.

alter table public.academic_event_invitations
  add column if not exists status text not null default 'pending',
  add column if not exists responded_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname='academic_event_invitations_status_check'
      and conrelid='public.academic_event_invitations'::regclass
  ) then
    alter table public.academic_event_invitations
      add constraint academic_event_invitations_status_check
      check(status in('pending','accepted','declined'));
  end if;
end
$$;

-- Correct institution-class behavior: adding a student creates an invitation,
-- rather than silently making the student an active class member.
create or replace function public.add_student_to_institution_class(
  p_group_id uuid,
  p_student_id uuid
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_institution uuid;
  v_minor boolean;
  v_parent uuid;
begin
  select institution_id
  into v_institution
  from public.academic_groups
  where id=p_group_id
    and group_kind='institution_class'
    and not is_archived;

  if v_institution is null then
    raise exception 'Class not found.';
  end if;

  if auth.uid()<>v_institution
     and not public.is_group_assigned_teacher(p_group_id,auth.uid())
  then
    raise exception 'You are not authorized to invite students to this class.';
  end if;

  if not exists(
    select 1
    from public.institution_relationships ir
    join public.profiles p on p.id=ir.member_id
      and p.role='student'
    where ir.institution_id=v_institution
      and ir.member_id=p_student_id
      and ir.relationship_type='student'
      and ir.status='accepted'
  ) then
    raise exception 'Student must be registered with this institution.';
  end if;

  insert into public.academic_group_members(
    group_id,user_id,membership_role,status,invited_by,responded_at
  )
  values(
    p_group_id,p_student_id,'member','invited',auth.uid(),null
  )
  on conflict(group_id,user_id)
  do update set
    membership_role='member',
    status='invited',
    invited_by=auth.uid(),
    responded_at=null;

  insert into public.notifications(
    user_id,actor_id,notification_type,group_id
  )
  values(
    p_student_id,auth.uid(),'class_invite',p_group_id
  );

  select public.student_requires_minor_safety(p_student_id)
  into v_minor;

  if v_minor then
    for v_parent in
      select parent_id
      from public.parent_student_links
      where student_id=p_student_id
    loop
      insert into public.notifications(
        user_id,actor_id,notification_type,group_id
      )
      values(
        v_parent,auth.uid(),'class_child_invite',p_group_id
      );
    end loop;
  end if;
end;
$$;

grant execute on function public.add_student_to_institution_class(uuid,uuid)
to authenticated;

create or replace function public.send_academic_event_attendance_request(
  p_event_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_minor boolean;
  v_parent uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if p_user_id=auth.uid() then
    raise exception 'You cannot invite yourself.';
  end if;

  if not exists(
    select 1
    from public.academic_events e
    where e.id=p_event_id
      and e.status<>'cancelled'
      and (
        e.creator_id=auth.uid()
        or (
          e.group_id is not null
          and public.is_group_manager(e.group_id,auth.uid())
        )
      )
  ) then
    raise exception 'You are not authorized to request attendance for this event.';
  end if;

  if public.has_block_between(auth.uid(),p_user_id) then
    raise exception 'This user cannot be invited.';
  end if;

  insert into public.academic_event_invitations(
    event_id,invited_user_id,invited_by,status,responded_at,read_at
  )
  values(
    p_event_id,p_user_id,auth.uid(),'pending',null,null
  )
  on conflict(event_id,invited_user_id)
  do update set
    invited_by=auth.uid(),
    status='pending',
    responded_at=null,
    read_at=null,
    created_at=now();

  insert into public.notifications(
    user_id,actor_id,notification_type,event_id
  )
  values(
    p_user_id,auth.uid(),'event_invite',p_event_id
  );

  select public.student_requires_minor_safety(p_user_id)
  into v_minor;

  -- Parents receive visibility for event requests sent to linked minors.
  if v_minor then
    for v_parent in
      select parent_id
      from public.parent_student_links
      where student_id=p_user_id
    loop
      insert into public.notifications(
        user_id,actor_id,notification_type,event_id
      )
      values(
        v_parent,auth.uid(),'event_invite',p_event_id
      );
    end loop;
  end if;
end;
$$;

grant execute on function public.send_academic_event_attendance_request(uuid,uuid)
to authenticated;

-- Re-show declined event invitees as inviteable.
create or replace function public.search_event_invitees(
  p_event_id uuid,
  p_query text default '',
  p_limit integer default 20
)
returns table(
  user_id uuid,
  display_name text,
  role text,
  avatar_url text,
  already_invited boolean
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
      else coalesce(p.full_name,initcap(p.role))
    end,
    p.role,
    coalesce(tp.profile_image_url,p.avatar_url),
    exists(
      select 1
      from public.academic_event_invitations i
      where i.event_id=p_event_id
        and i.invited_user_id=p.id
        and i.status in('pending','accepted')
    )
  from public.profiles p
  left join public.teacher_profiles tp on tp.user_id=p.id
  left join public.institution_profiles ip on ip.user_id=p.id
  where p.id<>auth.uid()
    and not public.has_block_between(auth.uid(),p.id)
    and (
      p.role<>'institution'
      or ip.verification_status='approved'
    )
    and exists(
      select 1
      from public.academic_events e
      where e.id=p_event_id
        and e.status<>'cancelled'
        and (
          e.creator_id=auth.uid()
          or (
            e.group_id is not null
            and public.is_group_manager(e.group_id,auth.uid())
          )
        )
    )
    and (
      coalesce(btrim(p_query),'')=''
      or coalesce(tp.display_name,ip.name,p.full_name,'')
        ilike '%'||btrim(p_query)||'%'
    )
  order by coalesce(tp.display_name,ip.name,p.full_name,'')
  limit least(greatest(coalesce(p_limit,20),1),50);
$$;

grant execute on function public.search_event_invitees(uuid,text,integer)
to authenticated;

-- Central normalized request list.
create or replace function public.get_my_requests_hub()
returns table(
  request_key text,
  request_type text,
  sender_id uuid,
  sender_name text,
  title text,
  subtitle text,
  resource_id uuid,
  subject_id uuid,
  href text,
  status text,
  created_at timestamptz,
  can_respond boolean,
  requires_parent boolean
)
language sql
stable
security definer
set search_path='public'
as $$
  with me as (
    select auth.uid() as id
  ),

  connection_requests as (
    select
      'connection:'||c.requester_id::text,
      'connection'::text,
      c.requester_id,
      coalesce(tp.display_name,p.full_name,initcap(p.role),'Examify user'),
      'Connection request'::text,
      coalesce(tp.display_name,p.full_name,'Someone')||' wants to connect with you.',
      c.requester_id,
      null::uuid,
      ('/people/'||c.requester_id::text)::text,
      'pending'::text,
      c.created_at,
      true,
      false
    from public.user_connections c
    join public.profiles p on p.id=c.requester_id
    left join public.teacher_profiles tp on tp.user_id=p.id
    where c.addressee_id=auth.uid()
      and c.status='pending'
  ),

  event_requests as (
    select
      'event:'||i.event_id::text||':'||i.invited_user_id::text,
      'event'::text,
      i.invited_by,
      coalesce(tp.display_name,ip2.name,p.full_name,'Examify user'),
      e.title,
      'Attendance requested for this event.'::text,
      i.event_id,
      null::uuid,
      ('/events/'||i.event_id::text)::text,
      i.status,
      i.created_at,
      not public.student_requires_minor_safety(i.invited_user_id),
      public.student_requires_minor_safety(i.invited_user_id)
    from public.academic_event_invitations i
    join public.academic_events e on e.id=i.event_id
    join public.profiles p on p.id=i.invited_by
    left join public.teacher_profiles tp on tp.user_id=p.id
    left join public.institution_profiles ip2 on ip2.user_id=p.id
    where i.invited_user_id=auth.uid()
  ),

  child_event_requests as (
    select
      'child_event:'||i.event_id::text||':'||i.invited_user_id::text,
      'event'::text,
      i.invited_by,
      coalesce(tp.display_name,ip2.name,sender.full_name,'Examify user'),
      e.title,
      coalesce(child.full_name,'Your child')||' was requested to attend this event.',
      i.event_id,
      i.invited_user_id,
      ('/events/'||i.event_id::text)::text,
      i.status,
      i.created_at,
      true,
      false
    from public.parent_student_links l
    join public.academic_event_invitations i
      on i.invited_user_id=l.student_id
    join public.academic_events e on e.id=i.event_id
    join public.profiles child on child.id=i.invited_user_id
    join public.profiles sender on sender.id=i.invited_by
    left join public.teacher_profiles tp on tp.user_id=sender.id
    left join public.institution_profiles ip2 on ip2.user_id=sender.id
    where l.parent_id=auth.uid()
      and public.student_requires_minor_safety(l.student_id)
  ),

  class_requests as (
    select
      'class:'||m.group_id::text||':'||m.user_id::text,
      'class'::text,
      m.invited_by,
      coalesce(tp.display_name,ip2.name,sender.full_name,'Examify user'),
      g.name,
      coalesce(ip.name,'Institution')||' invited you to this class.',
      m.group_id,
      null::uuid,
      ('/groups/'||m.group_id::text)::text,
      case when m.status='invited' then 'pending' else m.status end,
      m.created_at,
      not public.student_requires_minor_safety(m.user_id),
      public.student_requires_minor_safety(m.user_id)
    from public.academic_group_members m
    join public.academic_groups g on g.id=m.group_id
    left join public.institution_profiles ip on ip.user_id=g.institution_id
    left join public.profiles sender on sender.id=m.invited_by
    left join public.teacher_profiles tp on tp.user_id=sender.id
    left join public.institution_profiles ip2 on ip2.user_id=sender.id
    where m.user_id=auth.uid()
      and g.group_kind='institution_class'
      and m.status='invited'
  ),

  child_class_requests as (
    select
      'child_class:'||m.group_id::text||':'||m.user_id::text,
      'child_class'::text,
      m.invited_by,
      coalesce(tp.display_name,ip2.name,sender.full_name,'Examify user'),
      g.name,
      coalesce(child.full_name,'Your child')||
        ' was invited to '||coalesce(ip.name,'this institution')||'.',
      m.group_id,
      m.user_id,
      ('/groups/'||m.group_id::text)::text,
      'pending'::text,
      m.created_at,
      true,
      false
    from public.parent_student_links l
    join public.academic_group_members m on m.user_id=l.student_id
    join public.academic_groups g on g.id=m.group_id
    join public.profiles child on child.id=m.user_id
    left join public.institution_profiles ip on ip.user_id=g.institution_id
    left join public.profiles sender on sender.id=m.invited_by
    left join public.teacher_profiles tp on tp.user_id=sender.id
    left join public.institution_profiles ip2 on ip2.user_id=sender.id
    where l.parent_id=auth.uid()
      and g.group_kind='institution_class'
      and m.status='invited'
      and public.student_requires_minor_safety(m.user_id)
  ),

  group_requests as (
    select
      'group:'||m.group_id::text||':'||m.user_id::text,
      'group'::text,
      m.invited_by,
      coalesce(tp.display_name,ip.name,sender.full_name,'Examify user'),
      g.name,
      'You were invited to this group.',
      m.group_id,
      null::uuid,
      ('/groups/'||m.group_id::text)::text,
      'pending'::text,
      m.created_at,
      true,
      false
    from public.academic_group_members m
    join public.academic_groups g on g.id=m.group_id
    left join public.profiles sender on sender.id=m.invited_by
    left join public.teacher_profiles tp on tp.user_id=sender.id
    left join public.institution_profiles ip on ip.user_id=sender.id
    where m.user_id=auth.uid()
      and g.group_kind<>'institution_class'
      and m.status='invited'
  ),

  group_join_requests as (
    select
      'group_join:'||m.group_id::text||':'||m.user_id::text,
      'group_join'::text,
      m.user_id,
      coalesce(tp.display_name,ip.name,p.full_name,'Examify user'),
      g.name,
      coalesce(tp.display_name,ip.name,p.full_name,'Someone')||
        ' requested to join this group.',
      m.group_id,
      m.user_id,
      ('/groups/'||m.group_id::text)::text,
      'pending'::text,
      m.created_at,
      true,
      false
    from public.academic_group_members m
    join public.academic_groups g on g.id=m.group_id
    join public.profiles p on p.id=m.user_id
    left join public.teacher_profiles tp on tp.user_id=p.id
    left join public.institution_profiles ip on ip.user_id=p.id
    where m.status='requested'
      and public.is_group_manager(m.group_id,auth.uid())
  ),

  institution_requests as (
    select
      'institution:'||ir.id::text,
      'institution'::text,
      ir.institution_id,
      coalesce(ip.name,'Institution'),
      'Institution membership request'::text,
      coalesce(ip.name,'An institution')||
        ' requested to register you as '||ir.relationship_type||'.',
      ir.id,
      null::uuid,
      ('/institutions/'||ir.institution_id::text)::text,
      ir.status,
      ir.created_at,
      not (
        ir.relationship_type='student'
        and public.student_requires_parent_institution_approval(ir.member_id)
      ),
      (
        ir.relationship_type='student'
        and public.student_requires_parent_institution_approval(ir.member_id)
      )
    from public.institution_relationships ir
    left join public.institution_profiles ip
      on ip.user_id=ir.institution_id
    where ir.member_id=auth.uid()
      and ir.status in('pending','accepted','rejected')
  ),

  child_institution_requests as (
    select
      'child_institution:'||ir.id::text,
      'child_institution'::text,
      ir.institution_id,
      coalesce(ip.name,'Institution'),
      'Institution request for '||coalesce(child.full_name,'your child'),
      coalesce(ip.name,'An institution')||
        ' requested student membership for '||
        coalesce(child.full_name,'your child')||'.',
      ir.id,
      ir.member_id,
      ('/institutions/'||ir.institution_id::text)::text,
      ir.status,
      ir.created_at,
      ir.status='pending',
      false
    from public.parent_student_links l
    join public.institution_relationships ir
      on ir.member_id=l.student_id
      and ir.relationship_type='student'
    join public.profiles child on child.id=l.student_id
    left join public.institution_profiles ip
      on ip.user_id=ir.institution_id
    where l.parent_id=auth.uid()
      and public.student_requires_parent_institution_approval(l.student_id)
      and ir.status in('pending','accepted','rejected')
  )

  select * from connection_requests
  union all select * from event_requests
  union all select * from child_event_requests
  union all select * from class_requests
  union all select * from child_class_requests
  union all select * from group_requests
  union all select * from group_join_requests
  union all select * from institution_requests
  union all select * from child_institution_requests
  order by created_at desc;
$$;

grant execute on function public.get_my_requests_hub()
to authenticated;

create or replace function public.respond_to_request_hub(
  p_request_type text,
  p_resource_id uuid,
  p_subject_id uuid default null,
  p_accept boolean default false
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

  if p_request_type='connection' then
    perform public.respond_connection_request(p_resource_id,p_accept);

  elsif p_request_type='event' then
    if p_subject_id is null then
      -- User responding to own event request.
      if public.student_requires_minor_safety(auth.uid()) then
        raise exception 'A linked parent or guardian must respond to this event request.';
      end if;

      update public.academic_event_invitations
      set
        status=case when p_accept then 'accepted' else 'declined' end,
        responded_at=now(),
        read_at=coalesce(read_at,now())
      where event_id=p_resource_id
        and invited_user_id=auth.uid()
        and status='pending';

      if not found then
        raise exception 'Pending event request not found.';
      end if;

      if p_accept then
        insert into public.academic_event_responses(
          event_id,user_id,response,updated_at
        )
        values(
          p_resource_id,auth.uid(),'going',now()
        )
        on conflict(event_id,user_id)
        do update set response='going',updated_at=now();
      else
        delete from public.academic_event_responses
        where event_id=p_resource_id
          and user_id=auth.uid();
      end if;
    else
      -- Linked parent responding for a minor.
      if not exists(
        select 1
        from public.parent_student_links l
        where l.parent_id=auth.uid()
          and l.student_id=p_subject_id
      ) then
        raise exception 'You are not authorized for this student.';
      end if;

      if not public.student_requires_minor_safety(p_subject_id) then
        raise exception 'This student can respond to their own event request.';
      end if;

      update public.academic_event_invitations
      set
        status=case when p_accept then 'accepted' else 'declined' end,
        responded_at=now()
      where event_id=p_resource_id
        and invited_user_id=p_subject_id
        and status='pending';

      if not found then
        raise exception 'Pending event request not found.';
      end if;

      if p_accept then
        insert into public.academic_event_responses(
          event_id,user_id,response,updated_at
        )
        values(
          p_resource_id,p_subject_id,'going',now()
        )
        on conflict(event_id,user_id)
        do update set response='going',updated_at=now();
      else
        delete from public.academic_event_responses
        where event_id=p_resource_id
          and user_id=p_subject_id;
      end if;
    end if;

  elsif p_request_type='class' then
    perform public.respond_to_class_invitation(
      p_resource_id,
      case when p_accept then 'accept' else 'decline' end
    );

  elsif p_request_type='child_class' then
    if p_subject_id is null then
      raise exception 'Student is required.';
    end if;

    perform public.respond_to_child_class_invitation(
      p_resource_id,
      p_subject_id,
      case when p_accept then 'accept' else 'decline' end
    );

  elsif p_request_type='group' then
    if p_accept then
      update public.academic_group_members
      set status='active',responded_at=now()
      where group_id=p_resource_id
        and user_id=auth.uid()
        and status='invited';

      if not found then
        raise exception 'Group invitation not found.';
      end if;
    else
      delete from public.academic_group_members
      where group_id=p_resource_id
        and user_id=auth.uid()
        and status='invited';

      if not found then
        raise exception 'Group invitation not found.';
      end if;
    end if;

  elsif p_request_type='group_join' then
    if p_subject_id is null
       or not public.is_group_manager(p_resource_id,auth.uid())
    then
      raise exception 'Not authorized.';
    end if;

    if p_accept then
      update public.academic_group_members
      set status='active',responded_at=now()
      where group_id=p_resource_id
        and user_id=p_subject_id
        and status='requested';

      if not found then
        raise exception 'Join request not found.';
      end if;
    else
      delete from public.academic_group_members
      where group_id=p_resource_id
        and user_id=p_subject_id
        and status='requested';

      if not found then
        raise exception 'Join request not found.';
      end if;
    end if;

  elsif p_request_type='institution' then
    perform public.respond_to_institution_relationship(
      p_resource_id,
      case when p_accept then 'accepted' else 'rejected' end
    );

  elsif p_request_type='child_institution' then
    if p_subject_id is null then
      raise exception 'Student is required.';
    end if;

    perform public.respond_to_child_institution_request(
      p_resource_id,
      case when p_accept then 'accepted' else 'rejected' end
    );

  else
    raise exception 'Unsupported request type.';
  end if;
end;
$$;

grant execute on function public.respond_to_request_hub(text,uuid,uuid,boolean)
to authenticated;

notify pgrst,'reload schema';
