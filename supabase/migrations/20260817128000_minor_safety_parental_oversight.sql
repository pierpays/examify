-- Examify Update 65: Minor Safety & Parental Oversight
-- Critical rules are enforced in PostgreSQL, not only in the UI.
--
-- 1. A minor/age-unknown student may follow or privately message a teacher
--    only while they share an active institution class.
-- 2. A parent/guardian safety block overrides that academic relationship.
-- 3. Linked parents can review their minor child's teacher follows and
--    direct-message history read-only.
-- 4. User-facing direct-message deletion/editing is prohibited.
-- 5. Existing message history is preserved after blocking.

create or replace function public.student_requires_minor_safety(
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path='public'
as $$
  select coalesce(
    (
      select
        p.role='student'
        and (
          p.date_of_birth is null
          or p.date_of_birth > (current_date - interval '18 years')::date
        )
      from public.profiles p
      where p.id=p_student_id
    ),
    false
  );
$$;

grant execute on function public.student_requires_minor_safety(uuid)
to authenticated;

create or replace function public.parent_can_supervise_child(
  p_parent_id uuid,
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path='public'
as $$
  select
    public.student_requires_minor_safety(p_student_id)
    and exists(
      select 1
      from public.parent_student_links l
      where l.parent_id=p_parent_id
        and l.student_id=p_student_id
    );
$$;

grant execute on function public.parent_can_supervise_child(uuid,uuid)
to authenticated;

create or replace function public.student_teacher_share_active_class(
  p_student_id uuid,
  p_teacher_id uuid
)
returns boolean
language sql
stable
security definer
set search_path='public'
as $$
  select exists(
    select 1
    from public.academic_group_members sm
    join public.academic_groups g
      on g.id=sm.group_id
     and g.group_kind='institution_class'
     and not g.is_archived
    join public.institution_academic_years y
      on y.id=g.academic_year_id
     and y.is_active=true
    join public.academic_group_teachers gt
      on gt.group_id=g.id
     and gt.teacher_id=p_teacher_id
    where sm.user_id=p_student_id
      and sm.membership_role='member'
      and sm.status='active'
  );
$$;

grant execute on function public.student_teacher_share_active_class(uuid,uuid)
to authenticated;

create table if not exists public.parent_child_teacher_blocks(
  parent_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key(parent_id,student_id,teacher_id),
  check(parent_id<>student_id and student_id<>teacher_id and parent_id<>teacher_id)
);

create index if not exists parent_child_teacher_blocks_student_teacher_idx
on public.parent_child_teacher_blocks(student_id,teacher_id);

alter table public.parent_child_teacher_blocks enable row level security;

drop policy if exists "Parents read child teacher safety blocks"
on public.parent_child_teacher_blocks;
create policy "Parents read child teacher safety blocks"
on public.parent_child_teacher_blocks
for select to authenticated
using(parent_id=auth.uid());

-- All writes use the validated security-definer RPCs below.
revoke insert,update,delete on public.parent_child_teacher_blocks
from authenticated,anon;

create or replace function public.has_parent_teacher_block(
  p_student_id uuid,
  p_teacher_id uuid
)
returns boolean
language sql
stable
security definer
set search_path='public'
as $$
  select exists(
    select 1
    from public.parent_child_teacher_blocks b
    where b.student_id=p_student_id
      and b.teacher_id=p_teacher_id
  );
$$;

grant execute on function public.has_parent_teacher_block(uuid,uuid)
to authenticated;

create or replace function public.can_student_follow_teacher(
  p_student_id uuid,
  p_teacher_id uuid
)
returns boolean
language sql
stable
security definer
set search_path='public'
as $$
  select exists(
    select 1
    from public.profiles s
    join public.profiles t on t.id=p_teacher_id
    where s.id=p_student_id
      and s.role='student'
      and t.role='teacher'
      and not public.has_block_between(p_student_id,p_teacher_id)
      and not public.has_parent_teacher_block(p_student_id,p_teacher_id)
      and (
        not public.student_requires_minor_safety(p_student_id)
        or public.student_teacher_share_active_class(p_student_id,p_teacher_id)
      )
  );
$$;

grant execute on function public.can_student_follow_teacher(uuid,uuid)
to authenticated;

create or replace function public.follow_teacher_safely(
  p_teacher_id uuid
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_student uuid:=auth.uid();
begin
  if not public.can_student_follow_teacher(v_student,p_teacher_id) then
    if public.student_requires_minor_safety(v_student) then
      raise exception 'Minor students can follow only teachers assigned to one of their active institution classes, and only when no parent safety block is active.';
    end if;
    raise exception 'This teacher cannot be followed from your account.';
  end if;

  insert into public.teacher_followers(teacher_id,student_id)
  values(p_teacher_id,v_student)
  on conflict do nothing;
end;
$$;

grant execute on function public.follow_teacher_safely(uuid)
to authenticated;

create or replace function public.unfollow_teacher_safely(
  p_teacher_id uuid
)
returns void
language sql
security definer
set search_path='public'
as $$
  delete from public.teacher_followers
  where teacher_id=p_teacher_id
    and student_id=auth.uid();
$$;

grant execute on function public.unfollow_teacher_safely(uuid)
to authenticated;

-- Direct table inserts cannot bypass the same minor-safety rule.
drop policy if exists "Students can follow teachers"
on public.teacher_followers;
create policy "Students can follow teachers safely"
on public.teacher_followers
for insert to authenticated
with check(
  student_id=auth.uid()
  and public.can_student_follow_teacher(student_id,teacher_id)
);

create or replace function public.minor_teacher_interaction_allowed(
  p_user_a uuid,
  p_user_b uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path='public'
as $$
declare
  v_role_a text;
  v_role_b text;
  v_student uuid;
  v_teacher uuid;
begin
  select role into v_role_a from public.profiles where id=p_user_a;
  select role into v_role_b from public.profiles where id=p_user_b;

  if v_role_a='student' and v_role_b='teacher' then
    v_student:=p_user_a;
    v_teacher:=p_user_b;
  elsif v_role_a='teacher' and v_role_b='student' then
    v_student:=p_user_b;
    v_teacher:=p_user_a;
  else
    return true;
  end if;

  if not public.student_requires_minor_safety(v_student) then
    return true;
  end if;

  return
    public.student_teacher_share_active_class(v_student,v_teacher)
    and not public.has_parent_teacher_block(v_student,v_teacher);
end;
$$;

grant execute on function public.minor_teacher_interaction_allowed(uuid,uuid)
to authenticated;

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
      and public.minor_teacher_interaction_allowed(p_sender,p_target)
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

create or replace function public.get_or_create_direct_conversation(
  p_other_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_me uuid:=auth.uid();
  v_one uuid;
  v_two uuid;
  v_conversation_id uuid;
  v_other_role text;
begin
  if v_me is null then raise exception 'You must be signed in.'; end if;
  if p_other_user_id is null or p_other_user_id=v_me then
    raise exception 'Choose another Examify user.';
  end if;

  select role into v_other_role
  from public.profiles
  where id=p_other_user_id;

  if v_other_role is null then raise exception 'User not found.'; end if;

  if v_other_role='institution'
     and not public.is_verified_institution(p_other_user_id) then
    raise exception 'This institution is not available for messaging.';
  end if;

  if not public.can_message_user(p_other_user_id,v_me) then
    if not public.minor_teacher_interaction_allowed(v_me,p_other_user_id) then
      raise exception 'Teacher messaging with a minor is available only while they share an active institution class and no parent safety block is active.';
    end if;
    raise exception 'This account is not accepting messages from you.';
  end if;

  if v_me::text<p_other_user_id::text then
    v_one:=v_me; v_two:=p_other_user_id;
  else
    v_one:=p_other_user_id; v_two:=v_me;
  end if;

  insert into public.direct_conversations(user_one_id,user_two_id)
  values(v_one,v_two)
  on conflict(user_one_id,user_two_id)
  do update set updated_at=public.direct_conversations.updated_at
  returning id into v_conversation_id;

  return v_conversation_id;
end;
$$;

grant execute on function public.get_or_create_direct_conversation(uuid)
to authenticated;

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
  v_me uuid:=auth.uid();
  v_other uuid;
  v_message_id uuid;
  v_body text:=btrim(coalesce(p_body,''));
begin
  if v_me is null then raise exception 'You must be signed in.'; end if;
  if char_length(v_body)<1 then raise exception 'Message cannot be empty.'; end if;
  if char_length(v_body)>5000 then raise exception 'Message is too long.'; end if;

  select case
    when c.user_one_id=v_me then c.user_two_id
    when c.user_two_id=v_me then c.user_one_id
    else null
  end
  into v_other
  from public.direct_conversations c
  where c.id=p_conversation_id;

  if v_other is null then raise exception 'Conversation not found.'; end if;

  if not public.can_message_user(v_other,v_me) then
    if not public.minor_teacher_interaction_allowed(v_me,v_other) then
      raise exception 'Teacher messaging with a minor is available only while they share an active institution class and no parent safety block is active.';
    end if;
    raise exception 'Messaging is currently unavailable for this conversation.';
  end if;

  insert into public.direct_messages(conversation_id,sender_id,body)
  values(p_conversation_id,v_me,v_body)
  returning id into v_message_id;

  update public.direct_conversations
  set updated_at=now()
  where id=p_conversation_id;

  return v_message_id;
end;
$$;

grant execute on function public.send_direct_message(uuid,text)
to authenticated;

-- Users can read messages through the existing participant RLS/RPCs, but
-- cannot edit or delete message evidence. Security-definer RPCs continue to
-- handle sending and read receipts.
revoke insert,update,delete on public.direct_messages
from authenticated,anon;

-- Parent/guardian controls.
create or replace function public.get_parent_child_followed_teachers(
  p_student_id uuid
)
returns table(
  teacher_id uuid,
  display_name text,
  avatar_url text,
  shared_class_names text,
  parent_blocked boolean,
  followed_at timestamptz
)
language plpgsql
stable
security definer
set search_path='public'
as $$
begin
  if not public.parent_can_supervise_child(auth.uid(),p_student_id) then
    raise exception 'Parental supervision is available only for your linked child while the child is under 18.';
  end if;

  return query
  select
    tf.teacher_id,
    coalesce(tp.display_name,p.full_name,'Teacher'),
    coalesce(tp.profile_image_url,p.avatar_url),
    coalesce(
      (
        select string_agg(distinct g.name,', ' order by g.name)
        from public.academic_group_members sm
        join public.academic_groups g
          on g.id=sm.group_id
         and g.group_kind='institution_class'
         and not g.is_archived
        join public.institution_academic_years y
          on y.id=g.academic_year_id
         and y.is_active=true
        join public.academic_group_teachers gt
          on gt.group_id=g.id
         and gt.teacher_id=tf.teacher_id
        where sm.user_id=p_student_id
          and sm.membership_role='member'
          and sm.status='active'
      ),
      'No active shared class'
    ),
    public.has_parent_teacher_block(p_student_id,tf.teacher_id),
    tf.created_at
  from public.teacher_followers tf
  join public.profiles p on p.id=tf.teacher_id
  left join public.teacher_profiles tp on tp.user_id=tf.teacher_id
  where tf.student_id=p_student_id
  order by 2;
end;
$$;

grant execute on function public.get_parent_child_followed_teachers(uuid)
to authenticated;

create or replace function public.parent_remove_child_teacher_follow(
  p_student_id uuid,
  p_teacher_id uuid
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
begin
  if not public.parent_can_supervise_child(auth.uid(),p_student_id) then
    raise exception 'You cannot manage teacher follows for this account.';
  end if;

  delete from public.teacher_followers
  where student_id=p_student_id
    and teacher_id=p_teacher_id;
end;
$$;

grant execute on function public.parent_remove_child_teacher_follow(uuid,uuid)
to authenticated;

create or replace function public.parent_block_teacher_for_child(
  p_student_id uuid,
  p_teacher_id uuid
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
begin
  if not public.parent_can_supervise_child(auth.uid(),p_student_id) then
    raise exception 'You cannot manage safety blocks for this account.';
  end if;

  if not exists(
    select 1 from public.profiles
    where id=p_teacher_id and role='teacher'
  ) then
    raise exception 'Teacher not found.';
  end if;

  insert into public.parent_child_teacher_blocks(
    parent_id,student_id,teacher_id
  )
  values(auth.uid(),p_student_id,p_teacher_id)
  on conflict do nothing;

  delete from public.teacher_followers
  where student_id=p_student_id
    and teacher_id=p_teacher_id;
end;
$$;

grant execute on function public.parent_block_teacher_for_child(uuid,uuid)
to authenticated;

create or replace function public.parent_unblock_teacher_for_child(
  p_student_id uuid,
  p_teacher_id uuid
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
begin
  if not public.parent_can_supervise_child(auth.uid(),p_student_id) then
    raise exception 'You cannot manage safety blocks for this account.';
  end if;

  delete from public.parent_child_teacher_blocks
  where parent_id=auth.uid()
    and student_id=p_student_id
    and teacher_id=p_teacher_id;
end;
$$;

grant execute on function public.parent_unblock_teacher_for_child(uuid,uuid)
to authenticated;

create or replace function public.get_parent_child_teacher_blocks(
  p_student_id uuid
)
returns table(
  teacher_id uuid,
  display_name text,
  avatar_url text,
  blocked_at timestamptz
)
language plpgsql
stable
security definer
set search_path='public'
as $$
begin
  if not public.parent_can_supervise_child(auth.uid(),p_student_id) then
    raise exception 'You cannot view safety blocks for this account.';
  end if;

  return query
  select
    b.teacher_id,
    coalesce(tp.display_name,p.full_name,'Teacher'),
    coalesce(tp.profile_image_url,p.avatar_url),
    b.created_at
  from public.parent_child_teacher_blocks b
  join public.profiles p on p.id=b.teacher_id
  left join public.teacher_profiles tp on tp.user_id=b.teacher_id
  where b.parent_id=auth.uid()
    and b.student_id=p_student_id
  order by b.created_at desc;
end;
$$;

grant execute on function public.get_parent_child_teacher_blocks(uuid)
to authenticated;

-- Read-only parental message review. Reading through these functions does not
-- mark the child's messages as read and does not let the parent send as child.
create or replace function public.get_parent_child_conversations(
  p_student_id uuid
)
returns table(
  conversation_id uuid,
  other_user_id uuid,
  display_name text,
  role text,
  avatar_url text,
  last_message text,
  last_message_at timestamptz
)
language plpgsql
stable
security definer
set search_path='public'
as $$
begin
  if not public.parent_can_supervise_child(auth.uid(),p_student_id) then
    raise exception 'Message supervision is available only for your linked child while the child is under 18.';
  end if;

  return query
  with mine as (
    select
      c.id,
      case
        when c.user_one_id=p_student_id then c.user_two_id
        else c.user_one_id
      end as other_user_id
    from public.direct_conversations c
    where c.user_one_id=p_student_id
       or c.user_two_id=p_student_id
  )
  select
    m.id,
    m.other_user_id,
    case
      when p.role='teacher' then coalesce(tp.display_name,p.full_name,'Teacher')
      when p.role='institution' then coalesce(ip.name,p.full_name,'Institution')
      else coalesce(p.full_name,'Examify user')
    end,
    p.role,
    coalesce(tp.profile_image_url,p.avatar_url),
    lm.body,
    lm.created_at
  from mine m
  join public.profiles p on p.id=m.other_user_id
  left join public.teacher_profiles tp on tp.user_id=p.id
  left join public.institution_profiles ip on ip.user_id=p.id
  left join lateral(
    select dm.body,dm.created_at
    from public.direct_messages dm
    where dm.conversation_id=m.id
    order by dm.created_at desc
    limit 1
  ) lm on true
  order by lm.created_at desc nulls last;
end;
$$;

grant execute on function public.get_parent_child_conversations(uuid)
to authenticated;

create or replace function public.get_parent_child_messages(
  p_student_id uuid,
  p_conversation_id uuid,
  p_limit integer default 300
)
returns table(
  message_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path='public'
as $$
begin
  if not public.parent_can_supervise_child(auth.uid(),p_student_id) then
    raise exception 'Message supervision is available only for your linked child while the child is under 18.';
  end if;

  if not exists(
    select 1
    from public.direct_conversations c
    where c.id=p_conversation_id
      and (c.user_one_id=p_student_id or c.user_two_id=p_student_id)
  ) then
    raise exception 'Conversation not found for this child.';
  end if;

  return query
  select m.id,m.sender_id,m.body,m.created_at
  from public.direct_messages m
  where m.conversation_id=p_conversation_id
  order by m.created_at asc
  limit least(greatest(coalesce(p_limit,300),1),1000);
end;
$$;

grant execute on function public.get_parent_child_messages(uuid,uuid,integer)
to authenticated;

-- Remove already-invalid minor follows so old data cannot bypass the new rule.
delete from public.teacher_followers tf
where public.student_requires_minor_safety(tf.student_id)
  and not public.can_student_follow_teacher(tf.student_id,tf.teacher_id);

-- Automatically clean minor follows when a class relationship ends.
create or replace function public.cleanup_invalid_minor_teacher_follows()
returns trigger
language plpgsql
security definer
set search_path='public'
as $$
begin
  delete from public.teacher_followers tf
  where public.student_requires_minor_safety(tf.student_id)
    and not public.can_student_follow_teacher(tf.student_id,tf.teacher_id);
  return coalesce(new,old);
end;
$$;

drop trigger if exists cleanup_minor_follows_after_teacher_assignment
on public.academic_group_teachers;
create trigger cleanup_minor_follows_after_teacher_assignment
after delete or update on public.academic_group_teachers
for each statement execute function public.cleanup_invalid_minor_teacher_follows();

drop trigger if exists cleanup_minor_follows_after_class_membership
on public.academic_group_members;
create trigger cleanup_minor_follows_after_class_membership
after delete or update on public.academic_group_members
for each statement execute function public.cleanup_invalid_minor_teacher_follows();

drop trigger if exists cleanup_minor_follows_after_group_change
on public.academic_groups;
create trigger cleanup_minor_follows_after_group_change
after update of is_archived on public.academic_groups
for each statement execute function public.cleanup_invalid_minor_teacher_follows();

notify pgrst,'reload schema';
