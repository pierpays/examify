-- Examify Update 52: Birthdays, academic milestones & social celebrations.

create table if not exists public.social_congratulations (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  celebration_type text not null
    check (celebration_type in ('birthday','examify_anniversary','achievement')),
  related_post_id uuid references public.feed_posts(id) on delete cascade,
  celebration_date date not null default current_date,
  created_at timestamptz not null default now()
);

create unique index if not exists social_congratulations_unique_idx
  on public.social_congratulations(
    sender_id,
    recipient_id,
    celebration_type,
    coalesce(related_post_id,'00000000-0000-0000-0000-000000000000'::uuid),
    celebration_date
  );

alter table public.social_congratulations enable row level security;

drop policy if exists "Users read relevant congratulations" on public.social_congratulations;
create policy "Users read relevant congratulations"
on public.social_congratulations for select to authenticated
using(sender_id=auth.uid() or recipient_id=auth.uid() or public.is_examify_admin());

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
    'achievement_congrats'
  ));

create or replace function public.get_upcoming_connection_birthdays(
  p_days integer default 7,
  p_limit integer default 30
)
returns table(
  user_id uuid,
  display_name text,
  avatar_url text,
  birthday_month integer,
  birthday_day integer,
  days_until integer,
  already_congratulated boolean
)
language sql
stable
security definer
set search_path='public'
as $$
  with connected as (
    select
      case
        when c.requester_id=auth.uid() then c.addressee_id
        else c.requester_id
      end as user_id
    from public.user_connections c
    where c.status='accepted'
      and (c.requester_id=auth.uid() or c.addressee_id=auth.uid())
  ),
  birthdays as (
    select
      p.id,
      coalesce(tp.display_name,p.full_name,initcap(p.role)) as display_name,
      coalesce(tp.profile_image_url,p.avatar_url) as avatar_url,
      extract(month from p.date_of_birth)::integer as birthday_month,
      extract(day from p.date_of_birth)::integer as birthday_day,
      make_date(
        extract(year from current_date)::integer,
        extract(month from p.date_of_birth)::integer,
        least(
          extract(day from p.date_of_birth)::integer,
          extract(
            day from (
              date_trunc(
                'month',
                make_date(
                  extract(year from current_date)::integer,
                  extract(month from p.date_of_birth)::integer,
                  1
                )
              ) + interval '1 month - 1 day'
            )
          )::integer
        )
      ) as birthday_this_year
    from connected c
    join public.profiles p on p.id=c.user_id
    left join public.teacher_profiles tp on tp.user_id=p.id
    where p.show_birthday=true
      and p.date_of_birth is not null
      and not public.has_block_between(auth.uid(),p.id)
      and (
        p.birthday_visibility='examify'
        or (
          p.birthday_visibility='connections'
          and public.are_connected(auth.uid(),p.id)
        )
      )
  ),
  normalized as (
    select
      b.*,
      case
        when b.birthday_this_year>=current_date
          then b.birthday_this_year
        else b.birthday_this_year + interval '1 year'
      end::date as next_birthday
    from birthdays b
  )
  select
    n.id,
    n.display_name,
    n.avatar_url,
    n.birthday_month,
    n.birthday_day,
    (n.next_birthday-current_date)::integer,
    exists(
      select 1
      from public.social_congratulations sc
      where sc.sender_id=auth.uid()
        and sc.recipient_id=n.id
        and sc.celebration_type='birthday'
        and sc.celebration_date=n.next_birthday
    )
  from normalized n
  where (n.next_birthday-current_date)
    between 0 and least(greatest(coalesce(p_days,7),0),30)
  order by n.next_birthday,n.display_name
  limit least(greatest(coalesce(p_limit,30),1),100);
$$;

grant execute on function public.get_upcoming_connection_birthdays(integer,integer)
to authenticated;

create or replace function public.get_connection_anniversaries(
  p_days integer default 7,
  p_limit integer default 30
)
returns table(
  user_id uuid,
  display_name text,
  avatar_url text,
  years_on_examify integer,
  days_until integer,
  already_congratulated boolean
)
language sql
stable
security definer
set search_path='public'
as $$
  with connected as (
    select
      case
        when c.requester_id=auth.uid() then c.addressee_id
        else c.requester_id
      end as user_id
    from public.user_connections c
    where c.status='accepted'
      and (c.requester_id=auth.uid() or c.addressee_id=auth.uid())
  ),
  anniversaries as (
    select
      p.id,
      coalesce(tp.display_name,p.full_name,initcap(p.role)) as display_name,
      coalesce(tp.profile_image_url,p.avatar_url) as avatar_url,
      (extract(year from current_date)::integer - extract(year from p.created_at)::integer) as years_on_examify,
      make_date(
        extract(year from current_date)::integer,
        extract(month from p.created_at)::integer,
        least(
          extract(day from p.created_at)::integer,
          extract(
            day from (
              date_trunc(
                'month',
                make_date(
                  extract(year from current_date)::integer,
                  extract(month from p.created_at)::integer,
                  1
                )
              ) + interval '1 month - 1 day'
            )
          )::integer
        )
      ) as anniversary_this_year
    from connected c
    join public.profiles p on p.id=c.user_id
    left join public.teacher_profiles tp on tp.user_id=p.id
    where not public.has_block_between(auth.uid(),p.id)
      and public.can_view_profile(p.id,auth.uid())
      and p.created_at::date <= current_date - interval '1 year'
  ),
  normalized as (
    select
      a.*,
      case
        when a.anniversary_this_year>=current_date
          then a.anniversary_this_year
        else a.anniversary_this_year + interval '1 year'
      end::date as next_anniversary
    from anniversaries a
  )
  select
    n.id,
    n.display_name,
    n.avatar_url,
    (
      n.years_on_examify
      + case when n.anniversary_this_year<current_date then 1 else 0 end
    )::integer,
    (n.next_anniversary-current_date)::integer,
    exists(
      select 1
      from public.social_congratulations sc
      where sc.sender_id=auth.uid()
        and sc.recipient_id=n.id
        and sc.celebration_type='examify_anniversary'
        and sc.celebration_date=n.next_anniversary
    )
  from normalized n
  where (n.next_anniversary-current_date)
    between 0 and least(greatest(coalesce(p_days,7),0),30)
  order by n.next_anniversary,n.display_name
  limit least(greatest(coalesce(p_limit,30),1),100);
$$;

grant execute on function public.get_connection_anniversaries(integer,integer)
to authenticated;

create or replace function public.get_recent_connection_achievements(
  p_limit integer default 20
)
returns table(
  post_id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  exam_title text,
  score_percent numeric,
  passing_score integer,
  completed_at timestamptz,
  already_congratulated boolean
)
language sql
stable
security definer
set search_path='public'
as $$
  with connected as (
    select
      case
        when c.requester_id=auth.uid() then c.addressee_id
        else c.requester_id
      end as user_id
    from public.user_connections c
    where c.status='accepted'
      and (c.requester_id=auth.uid() or c.addressee_id=auth.uid())
  )
  select
    fp.id,
    fp.author_id,
    coalesce(tp.display_name,p.full_name,'Student'),
    coalesce(tp.profile_image_url,p.avatar_url),
    e.title,
    a.score_percent,
    e.passing_score,
    a.completed_at,
    exists(
      select 1
      from public.social_congratulations sc
      where sc.sender_id=auth.uid()
        and sc.recipient_id=fp.author_id
        and sc.celebration_type='achievement'
        and sc.related_post_id=fp.id
    )
  from public.feed_posts fp
  join connected c on c.user_id=fp.author_id
  join public.profiles p on p.id=fp.author_id
  left join public.teacher_profiles tp on tp.user_id=p.id
  join public.exam_attempts a on a.id=fp.achievement_attempt_id
  join public.exams e on e.id=a.exam_id
  where fp.post_type='achievement'
    and fp.moderation_status='active'
    and coalesce(fp.scheduled_at,fp.created_at)<=now()
    and not public.has_block_between(auth.uid(),fp.author_id)
    and (
      fp.audience='examify'
      or public.are_connected(auth.uid(),fp.author_id)
    )
    and a.completed_at>=now()-interval '30 days'
  order by a.completed_at desc
  limit least(greatest(coalesce(p_limit,20),1),50);
$$;

grant execute on function public.get_recent_connection_achievements(integer)
to authenticated;

create or replace function public.send_social_congratulations(
  p_recipient_id uuid,
  p_celebration_type text,
  p_related_post_id uuid default null,
  p_celebration_date date default current_date
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_notification_type text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if p_recipient_id is null or p_recipient_id=auth.uid() then
    raise exception 'Choose another user.';
  end if;

  if not public.are_connected(auth.uid(),p_recipient_id) then
    raise exception 'Congratulations are available between accepted connections.';
  end if;

  if public.has_block_between(auth.uid(),p_recipient_id) then
    raise exception 'This interaction is unavailable.';
  end if;

  if p_celebration_type='birthday' then
    v_notification_type:='birthday_congrats';
  elsif p_celebration_type='examify_anniversary' then
    v_notification_type:='anniversary_congrats';
  elsif p_celebration_type='achievement' then
    if p_related_post_id is null or not exists(
      select 1 from public.feed_posts fp
      where fp.id=p_related_post_id
        and fp.author_id=p_recipient_id
        and fp.post_type='achievement'
        and fp.moderation_status='active'
    ) then
      raise exception 'Achievement not available.';
    end if;
    v_notification_type:='achievement_congrats';
  else
    raise exception 'Invalid celebration type.';
  end if;

  insert into public.social_congratulations(
    sender_id,
    recipient_id,
    celebration_type,
    related_post_id,
    celebration_date
  )
  values(
    auth.uid(),
    p_recipient_id,
    p_celebration_type,
    p_related_post_id,
    coalesce(p_celebration_date,current_date)
  )
  on conflict do nothing;

  if found then
    insert into public.notifications(
      user_id,
      actor_id,
      notification_type,
      post_id
    )
    values(
      p_recipient_id,
      auth.uid(),
      v_notification_type,
      case when p_celebration_type='achievement' then p_related_post_id else null end
    );
  end if;
end;
$$;

grant execute on function public.send_social_congratulations(uuid,text,uuid,date)
to authenticated;

-- Celebration notifications are part of ordinary social engagement preferences.
create or replace function public.apply_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_preferences public.notification_preferences%rowtype;
begin
  if new.notification_type='user_safety_report' then
    return new;
  end if;

  select * into v_preferences
  from public.notification_preferences
  where user_id=new.user_id;

  if not found then return new; end if;

  if new.notification_type in (
    'post_reaction',
    'post_comment',
    'post_mention',
    'post_shared',
    'birthday_congrats',
    'anniversary_congrats',
    'achievement_congrats'
  ) and not v_preferences.social_engagement then
    return null;
  end if;

  if new.notification_type in ('connection_request','connection_accepted')
     and not v_preferences.connections then
    return null;
  end if;

  if new.notification_type='event_invite'
     and not v_preferences.event_invites then
    return null;
  end if;

  if new.notification_type='child_exam_result'
     and not v_preferences.academic_updates then
    return null;
  end if;

  return new;
end;
$$;

-- Refresh notifications RPC with the same public shape used by the UI.
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
