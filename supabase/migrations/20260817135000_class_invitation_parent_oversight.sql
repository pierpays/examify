-- Examify Update 72: class invitation visibility and parent oversight.

alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in (
    'post_reaction','post_comment','child_exam_result','user_safety_report',
    'connection_request','connection_accepted','post_mention','post_shared',
    'event_invite','birthday_congrats','anniversary_congrats','achievement_congrats',
    'group_invite','group_join_request','group_join_approved','group_comment',
    'group_reaction','group_content_report','institution_request',
    'institution_child_request','institution_request_accepted',
    'institution_request_rejected','class_invite','class_child_invite'
  ));

create or replace function public.get_my_class_invitations()
returns table(
  group_id uuid,
  class_name text,
  institution_name text,
  status text,
  requires_parent_approval boolean,
  invited_at timestamptz
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    m.group_id,
    g.name,
    coalesce(ip.name,'Institution'),
    m.status,
    coalesce(
      p.date_of_birth > (current_date - interval '18 years')::date,
      false
    ),
    m.created_at
  from public.academic_group_members m
  join public.academic_groups g on g.id=m.group_id
  join public.profiles p on p.id=m.user_id
  left join public.institution_profiles ip on ip.user_id=g.institution_id
  where m.user_id=auth.uid()
    and g.group_kind='institution_class'
    and m.status='invited'
  order by m.created_at desc;
$$;

grant execute on function public.get_my_class_invitations() to authenticated;

create or replace function public.get_parent_child_class_invitations()
returns table(
  group_id uuid,
  class_name text,
  institution_name text,
  student_id uuid,
  student_name text,
  status text,
  invited_at timestamptz
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    m.group_id,
    g.name,
    coalesce(ip.name,'Institution'),
    m.user_id,
    coalesce(p.full_name,'Student'),
    m.status,
    m.created_at
  from public.parent_student_links l
  join public.academic_group_members m on m.user_id=l.student_id
  join public.academic_groups g on g.id=m.group_id
  join public.profiles p on p.id=m.user_id
  left join public.institution_profiles ip on ip.user_id=g.institution_id
  where l.parent_id=auth.uid()
    and g.group_kind='institution_class'
    and m.status='invited'
    and coalesce(
      p.date_of_birth > (current_date - interval '18 years')::date,
      false
    )
  order by m.created_at desc;
$$;

grant execute on function public.get_parent_child_class_invitations() to authenticated;

create or replace function public.respond_to_class_invitation(
  p_group_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_minor boolean;
begin
  if p_action not in ('accept','decline') then
    raise exception 'Invalid action.';
  end if;

  select coalesce(
    p.date_of_birth > (current_date - interval '18 years')::date,
    false
  )
  into v_minor
  from public.academic_group_members m
  join public.profiles p on p.id=m.user_id
  where m.group_id=p_group_id
    and m.user_id=auth.uid()
    and m.status='invited';

  if v_minor then
    raise exception 'A linked parent or guardian must respond to this class invitation.';
  end if;

  if p_action='accept' then
    update public.academic_group_members
    set status='active', responded_at=now()
    where group_id=p_group_id
      and user_id=auth.uid()
      and status='invited';
  else
    delete from public.academic_group_members
    where group_id=p_group_id
      and user_id=auth.uid()
      and status='invited';
  end if;
end;
$$;

grant execute on function public.respond_to_class_invitation(uuid,text)
to authenticated;

create or replace function public.respond_to_child_class_invitation(
  p_group_id uuid,
  p_student_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
begin
  if p_action not in ('accept','decline') then
    raise exception 'Invalid action.';
  end if;

  if not exists (
    select 1
    from public.parent_student_links
    where parent_id=auth.uid()
      and student_id=p_student_id
  ) then
    raise exception 'Not authorized for this student.';
  end if;

  if p_action='accept' then
    update public.academic_group_members
    set status='active', responded_at=now()
    where group_id=p_group_id
      and user_id=p_student_id
      and status='invited';
  else
    delete from public.academic_group_members
    where group_id=p_group_id
      and user_id=p_student_id
      and status='invited';
  end if;
end;
$$;

grant execute on function public.respond_to_child_class_invitation(uuid,uuid,text)
to authenticated;

notify pgrst,'reload schema';
