-- Examify Update 46: Academic Events & Calendar.
-- Teachers and verified institutions can create academic events.
-- Authenticated users can mark Interested / Going and receive invitations.

create table if not exists public.academic_events (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.academic_groups(id) on delete cascade,
  title text not null,
  description text,
  event_type text not null default 'other'
    check (event_type in (
      'class',
      'workshop',
      'webinar',
      'exam_session',
      'study_session',
      'conference',
      'deadline',
      'other'
    )),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location_name text,
  meeting_url text,
  visibility text not null default 'public'
    check (visibility in ('public','group')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_events_title_length
    check (char_length(btrim(title)) between 3 and 160),
  constraint academic_events_description_length
    check (description is null or char_length(description) <= 5000),
  constraint academic_events_time_order
    check (ends_at is null or ends_at >= starts_at),
  constraint academic_events_group_visibility
    check (
      (visibility='public' and group_id is null)
      or
      (visibility='group' and group_id is not null)
    )
);

create table if not exists public.academic_event_responses (
  event_id uuid not null references public.academic_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  response text not null check (response in ('interested','going')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(event_id,user_id)
);

create table if not exists public.academic_event_invitations (
  event_id uuid not null references public.academic_events(id) on delete cascade,
  invited_user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  primary key(event_id,invited_user_id)
);

create index if not exists academic_events_starts_idx
  on public.academic_events(starts_at);
create index if not exists academic_events_creator_idx
  on public.academic_events(creator_id,starts_at);
create index if not exists academic_event_responses_user_idx
  on public.academic_event_responses(user_id,response);
create index if not exists academic_event_invitations_user_idx
  on public.academic_event_invitations(invited_user_id,created_at desc);

alter table public.academic_events enable row level security;
alter table public.academic_event_responses enable row level security;
alter table public.academic_event_invitations enable row level security;

create or replace function public.can_view_academic_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path='public'
as $$
  select exists(
    select 1
    from public.academic_events e
    where e.id=p_event_id
      and (
        e.visibility='public'
        or e.creator_id=auth.uid()
        or (
          e.visibility='group'
          and public.is_group_active_member(e.group_id,auth.uid())
        )
        or exists(
          select 1 from public.profiles p
          where p.id=auth.uid() and p.role='admin'
        )
      )
  );
$$;

grant execute on function public.can_view_academic_event(uuid) to authenticated;

drop policy if exists "Users view visible academic events" on public.academic_events;
create policy "Users view visible academic events"
on public.academic_events
for select
to authenticated
using (
  visibility='public'
  or creator_id=auth.uid()
  or (
    visibility='group'
    and public.is_group_active_member(group_id,auth.uid())
  )
  or public.is_examify_admin()
);

drop policy if exists "Creators create academic events" on public.academic_events;
create policy "Creators create academic events"
on public.academic_events
for insert
to authenticated
with check (
  creator_id=auth.uid()
  and exists(
    select 1
    from public.profiles p
    left join public.institution_profiles ip on ip.user_id=p.id
    where p.id=auth.uid()
      and (
        p.role='teacher'
        or (p.role='institution' and ip.verification_status='approved')
      )
  )
  and (
    visibility='public'
    or (
      visibility='group'
      and public.is_group_manager(group_id,auth.uid())
    )
  )
);

drop policy if exists "Creators update academic events" on public.academic_events;
create policy "Creators update academic events"
on public.academic_events
for update
to authenticated
using (creator_id=auth.uid() or public.is_examify_admin())
with check (creator_id=auth.uid() or public.is_examify_admin());

drop policy if exists "Creators delete academic events" on public.academic_events;
create policy "Creators delete academic events"
on public.academic_events
for delete
to authenticated
using (creator_id=auth.uid() or public.is_examify_admin());

drop policy if exists "Users read event responses" on public.academic_event_responses;
create policy "Users read event responses"
on public.academic_event_responses
for select
to authenticated
using (public.can_view_academic_event(event_id));

drop policy if exists "Users manage own event responses" on public.academic_event_responses;
create policy "Users insert own event responses"
on public.academic_event_responses
for insert
to authenticated
with check (
  user_id=auth.uid()
  and public.can_view_academic_event(event_id)
);

create policy "Users update own event responses"
on public.academic_event_responses
for update
to authenticated
using (user_id=auth.uid())
with check (user_id=auth.uid());

create policy "Users delete own event responses"
on public.academic_event_responses
for delete
to authenticated
using (user_id=auth.uid());

drop policy if exists "Invitees and creators read event invitations" on public.academic_event_invitations;
create policy "Invitees and creators read event invitations"
on public.academic_event_invitations
for select
to authenticated
using (
  invited_user_id=auth.uid()
  or invited_by=auth.uid()
  or exists(
    select 1 from public.academic_events e
    where e.id=event_id and e.creator_id=auth.uid()
  )
);

drop policy if exists "Event creators invite users" on public.academic_event_invitations;
create policy "Event creators invite users"
on public.academic_event_invitations
for insert
to authenticated
with check (
  invited_by=auth.uid()
  and exists(
    select 1 from public.academic_events e
    where e.id=event_id
      and (
        e.creator_id=auth.uid()
        or (
          e.group_id is not null
          and public.is_group_manager(e.group_id,auth.uid())
        )
      )
  )
  and invited_user_id<>auth.uid()
  and not public.has_block_between(auth.uid(),invited_user_id)
);

alter table public.notifications
  add column if not exists event_id uuid references public.academic_events(id) on delete cascade;

create index if not exists notifications_event_idx
  on public.notifications(event_id)
  where event_id is not null;

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
    'event_invite'
  ));

create or replace function public.notify_academic_event_invite()
returns trigger
language plpgsql
security definer
set search_path='public'
as $$
begin
  insert into public.notifications(
    user_id,
    actor_id,
    notification_type,
    event_id
  )
  values(
    new.invited_user_id,
    new.invited_by,
    'event_invite',
    new.event_id
  );
  return new;
end;
$$;

drop trigger if exists academic_event_invite_notification
on public.academic_event_invitations;

create trigger academic_event_invite_notification
after insert on public.academic_event_invitations
for each row
execute function public.notify_academic_event_invite();

create or replace function public.set_academic_event_response(
  p_event_id uuid,
  p_response text
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
begin
  if not public.can_view_academic_event(p_event_id) then
    raise exception 'Event not available.';
  end if;

  if p_response not in ('interested','going') then
    raise exception 'Invalid response.';
  end if;

  insert into public.academic_event_responses(
    event_id,
    user_id,
    response,
    updated_at
  )
  values(
    p_event_id,
    auth.uid(),
    p_response,
    now()
  )
  on conflict(event_id,user_id)
  do update
  set response=excluded.response,updated_at=now();
end;
$$;

grant execute on function public.set_academic_event_response(uuid,text)
to authenticated;

create or replace function public.clear_academic_event_response(
  p_event_id uuid
)
returns void
language sql
security definer
set search_path='public'
as $$
  delete from public.academic_event_responses
  where event_id=p_event_id
    and user_id=auth.uid();
$$;

grant execute on function public.clear_academic_event_response(uuid)
to authenticated;

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

create or replace function public.get_academic_event_counts(
  p_event_id uuid
)
returns table(
  interested_count bigint,
  going_count bigint
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    count(*) filter(where response='interested'),
    count(*) filter(where response='going')
  from public.academic_event_responses
  where event_id=p_event_id
    and public.can_view_academic_event(p_event_id);
$$;

grant execute on function public.get_academic_event_counts(uuid)
to authenticated;

notify pgrst,'reload schema';


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
