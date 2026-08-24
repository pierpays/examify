-- Examify Update 61: actionable institution notifications and live notification routing.

alter table public.notifications
  add column if not exists institution_relationship_id uuid
  references public.institution_relationships(id) on delete cascade;

alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

alter table public.notifications
  add constraint notifications_notification_type_check
  check(notification_type in(
    'post_reaction',
    'post_comment',
    'child_exam_result',
    'user_safety_report',
    'connection_request',
    'connection_accepted',
    'post_mention',
    'post_shared',
    'event_invite',
    'birthday_congrats',
    'anniversary_congrats',
    'achievement_congrats',
    'group_invite',
    'group_join_request',
    'group_join_approved',
    'group_comment',
    'group_reaction',
    'group_content_report',
    'institution_request',
    'institution_child_request',
    'institution_request_accepted',
    'institution_request_rejected'
  ));

create or replace function public.send_institution_relationship_request(
  p_member_id uuid,
  p_relationship_type text
)
returns table(
  relationship_id uuid,
  approval_route text
)
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_institution uuid:=auth.uid();
  v_member_role text;
  v_dob date;
  v_id uuid;
  v_route text:='member';
begin
  if not exists(
    select 1
    from public.profiles p
    join public.institution_profiles ip on ip.user_id=p.id
    where p.id=v_institution
      and p.role='institution'
      and ip.verification_status='approved'
  ) then
    raise exception 'Only an approved institution can send membership requests.';
  end if;

  if p_relationship_type not in('teacher','student','parent') then
    raise exception 'Invalid institution relationship type.';
  end if;

  select role,date_of_birth
  into v_member_role,v_dob
  from public.profiles
  where id=p_member_id;

  if v_member_role is null or v_member_role<>p_relationship_type then
    raise exception 'The selected account does not match this relationship type.';
  end if;

  if p_relationship_type='student' then
    if v_dob is null then
      raise exception 'This student must have a date of birth before an institution request can be sent.';
    end if;

    if v_dob > (current_date - interval '18 years')::date then
      if not exists(
        select 1
        from public.parent_student_links l
        where l.student_id=p_member_id
      ) then
        raise exception 'A student under 18 must have a linked parent or guardian before an institution request can be sent.';
      end if;

      v_route:='parent';
    end if;
  end if;

  insert into public.institution_relationships(
    institution_id,
    member_id,
    relationship_type,
    status,
    responded_at
  )
  values(
    v_institution,
    p_member_id,
    p_relationship_type,
    'pending',
    null
  )
  on conflict(institution_id,member_id,relationship_type)
  do update set
    status='pending',
    responded_at=null
  returning id into v_id;

  delete from public.notifications
  where institution_relationship_id=v_id
    and notification_type in(
      'institution_request',
      'institution_child_request'
    );

  if v_route='parent' then
    insert into public.notifications(
      user_id,
      actor_id,
      notification_type,
      institution_relationship_id
    )
    select
      l.parent_id,
      v_institution,
      'institution_child_request',
      v_id
    from public.parent_student_links l
    where l.student_id=p_member_id;

    -- The student also gets an informational notification, but cannot act on it.
    insert into public.notifications(
      user_id,
      actor_id,
      notification_type,
      institution_relationship_id
    )
    values(
      p_member_id,
      v_institution,
      'institution_child_request',
      v_id
    );
  else
    insert into public.notifications(
      user_id,
      actor_id,
      notification_type,
      institution_relationship_id
    )
    values(
      p_member_id,
      v_institution,
      'institution_request',
      v_id
    );
  end if;

  return query select v_id,v_route;
end;
$$;

grant execute on function public.send_institution_relationship_request(uuid,text)
to authenticated;

create or replace function public.respond_to_institution_relationship(
  p_relationship_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_relationship public.institution_relationships%rowtype;
  v_type text;
begin
  if p_status not in('accepted','rejected') then
    raise exception 'Invalid response.';
  end if;

  select *
  into v_relationship
  from public.institution_relationships
  where id=p_relationship_id;

  if v_relationship.id is null then
    raise exception 'Institution request not found.';
  end if;

  if v_relationship.member_id<>auth.uid() then
    raise exception 'You cannot respond to this institution request.';
  end if;

  if v_relationship.status<>'pending' then
    raise exception 'This institution request has already been answered.';
  end if;

  if v_relationship.relationship_type='student'
     and public.student_requires_parent_institution_approval(v_relationship.member_id)
  then
    raise exception 'A linked parent or guardian must respond to this request.';
  end if;

  update public.institution_relationships
  set status=p_status,
      responded_at=now()
  where id=p_relationship_id;

  v_type:=case
    when p_status='accepted' then 'institution_request_accepted'
    else 'institution_request_rejected'
  end;

  insert into public.notifications(
    user_id,
    actor_id,
    notification_type,
    institution_relationship_id
  )
  values(
    v_relationship.institution_id,
    v_relationship.member_id,
    v_type,
    v_relationship.id
  );
end;
$$;

grant execute on function public.respond_to_institution_relationship(uuid,text)
to authenticated;

create or replace function public.respond_to_child_institution_request(
  p_relationship_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_relationship public.institution_relationships%rowtype;
  v_type text;
begin
  if p_status not in('accepted','rejected') then
    raise exception 'Invalid response.';
  end if;

  select *
  into v_relationship
  from public.institution_relationships
  where id=p_relationship_id
    and relationship_type='student';

  if v_relationship.id is null then
    raise exception 'Student institution request not found.';
  end if;

  if v_relationship.status<>'pending' then
    raise exception 'This institution request has already been answered.';
  end if;

  if not public.student_requires_parent_institution_approval(v_relationship.member_id) then
    raise exception 'This student can respond to their own institution request.';
  end if;

  if not exists(
    select 1
    from public.parent_student_links l
    where l.parent_id=auth.uid()
      and l.student_id=v_relationship.member_id
  ) then
    raise exception 'You are not linked to this student as a parent or guardian.';
  end if;

  update public.institution_relationships
  set status=p_status,
      responded_at=now()
  where id=p_relationship_id;

  v_type:=case
    when p_status='accepted' then 'institution_request_accepted'
    else 'institution_request_rejected'
  end;

  insert into public.notifications(
    user_id,
    actor_id,
    notification_type,
    institution_relationship_id
  )
  values(
    v_relationship.institution_id,
    v_relationship.member_id,
    v_type,
    v_relationship.id
  );
end;
$$;

grant execute on function public.respond_to_child_institution_request(uuid,text)
to authenticated;

drop function if exists public.get_my_notifications(integer);

create function public.get_my_notifications(p_limit integer default 50)
returns table(
  id uuid,
  notification_type text,
  post_id uuid,
  comment_id uuid,
  exam_attempt_id uuid,
  user_report_id uuid,
  event_id uuid,
  group_id uuid,
  group_post_id uuid,
  group_comment_id uuid,
  institution_relationship_id uuid,
  actor_id uuid,
  actor_name text,
  actor_role text,
  exam_title text,
  exam_score numeric,
  exam_passing_score integer,
  read_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    n.id,
    n.notification_type,
    n.post_id,
    n.comment_id,
    n.exam_attempt_id,
    n.user_report_id,
    n.event_id,
    n.group_id,
    n.group_post_id,
    n.group_comment_id,
    n.institution_relationship_id,
    n.actor_id,
    case
      when p.role='teacher'
        then coalesce(tp.display_name,p.full_name,'Teacher')
      when p.role='institution'
        then coalesce(ip.name,p.full_name,'Institution')
      when p.role='admin'
        then coalesce(p.full_name,'Examify Admin')
      when p.role='parent'
        then coalesce(p.full_name,'Parent')
      else coalesce(p.full_name,'Student')
    end,
    p.role,
    e.title,
    a.score_percent,
    e.passing_score,
    n.read_at,
    n.created_at
  from public.notifications n
  left join public.profiles p on p.id=n.actor_id
  left join public.teacher_profiles tp on tp.user_id=n.actor_id
  left join public.institution_profiles ip on ip.user_id=n.actor_id
  left join public.exam_attempts a on a.id=n.exam_attempt_id
  left join public.exams e on e.id=a.exam_id
  where n.user_id=auth.uid()
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit,50),1),100);
$$;

grant execute on function public.get_my_notifications(integer)
to authenticated;

notify pgrst,'reload schema';
