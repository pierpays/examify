-- Examify Update 49: Activity Log, Notification Preferences & Account Security.

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  social_engagement boolean not null default true,
  connections boolean not null default true,
  event_invites boolean not null default true,
  academic_updates boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "Users read own notification preferences" on public.notification_preferences;
create policy "Users read own notification preferences"
on public.notification_preferences for select to authenticated
using(user_id=auth.uid());

drop policy if exists "Users insert own notification preferences" on public.notification_preferences;
create policy "Users insert own notification preferences"
on public.notification_preferences for insert to authenticated
with check(user_id=auth.uid());

drop policy if exists "Users update own notification preferences" on public.notification_preferences;
create policy "Users update own notification preferences"
on public.notification_preferences for update to authenticated
using(user_id=auth.uid()) with check(user_id=auth.uid());

create or replace function public.get_my_notification_preferences()
returns table(
  social_engagement boolean,
  connections boolean,
  event_invites boolean,
  academic_updates boolean
)
language sql stable security definer set search_path='public' as $$
  insert into public.notification_preferences(user_id)
  values(auth.uid())
  on conflict(user_id) do nothing;

  select
    np.social_engagement,
    np.connections,
    np.event_invites,
    np.academic_updates
  from public.notification_preferences np
  where np.user_id=auth.uid();
$$;

grant execute on function public.get_my_notification_preferences() to authenticated;

create or replace function public.update_my_notification_preferences(
  p_social_engagement boolean,
  p_connections boolean,
  p_event_invites boolean,
  p_academic_updates boolean
)
returns void
language sql security definer set search_path='public' as $$
  insert into public.notification_preferences(
    user_id,social_engagement,connections,event_invites,academic_updates,updated_at
  )
  values(
    auth.uid(),p_social_engagement,p_connections,p_event_invites,p_academic_updates,now()
  )
  on conflict(user_id) do update set
    social_engagement=excluded.social_engagement,
    connections=excluded.connections,
    event_invites=excluded.event_invites,
    academic_updates=excluded.academic_updates,
    updated_at=now();
$$;

grant execute on function public.update_my_notification_preferences(boolean,boolean,boolean,boolean)
to authenticated;

-- One central notification gate keeps preferences consistent across every trigger.
create or replace function public.apply_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_preferences public.notification_preferences%rowtype;
begin
  -- Safety reports are intentionally always delivered.
  if new.notification_type='user_safety_report' then
    return new;
  end if;

  select * into v_preferences
  from public.notification_preferences
  where user_id=new.user_id;

  if not found then return new; end if;

  if new.notification_type in ('post_reaction','post_comment','post_mention','post_shared')
     and not v_preferences.social_engagement then
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

drop trigger if exists notifications_apply_preferences on public.notifications;
create trigger notifications_apply_preferences
before insert on public.notifications
for each row execute function public.apply_notification_preferences();

create or replace function public.get_my_activity_log(p_limit integer default 100)
returns table(
  activity_type text,
  title text,
  detail text,
  resource_href text,
  occurred_at timestamptz
)
language sql
stable
security definer
set search_path='public'
as $$
  with activity as (
    select
      'post'::text as activity_type,
      case when fp.post_type='achievement' then 'Shared an achievement'
           when fp.post_type='exam' then 'Shared an exam'
           else 'Created a post' end as title,
      left(coalesce(fp.body,'Post on Examify'),180) as detail,
      '/feed'::text as resource_href,
      fp.created_at as occurred_at
    from public.feed_posts fp
    where fp.author_id=auth.uid()

    union all

    select
      'comment',
      'Commented on a post',
      left(c.body,180),
      '/feed',
      c.created_at
    from public.feed_post_comments c
    where c.author_id=auth.uid()

    union all

    select
      'reaction',
      'Reacted to a post',
      initcap(r.reaction_type),
      '/feed',
      r.created_at
    from public.feed_post_reactions r
    where r.user_id=auth.uid()

    union all

    select
      'teacher_follow',
      'Followed a teacher',
      coalesce(tp.display_name,'Teacher'),
      '/teachers/'||tf.teacher_id::text,
      tf.created_at
    from public.teacher_followers tf
    left join public.teacher_profiles tp on tp.user_id=tf.teacher_id
    where tf.student_id=auth.uid()

    union all

    select
      'institution_follow',
      'Followed an institution',
      coalesce(ip.name,'Institution'),
      '/institutions/'||f.institution_id::text,
      f.created_at
    from public.institution_followers f
    left join public.institution_profiles ip on ip.user_id=f.institution_id
    where f.follower_id=auth.uid()

    union all

    select
      'connection',
      case when c.status='accepted' then 'Connected with someone'
           else 'Sent a connection request' end,
      coalesce(other.full_name,'Examify user'),
      '/people/'||other.id::text,
      coalesce(c.responded_at,c.created_at)
    from public.user_connections c
    join public.profiles other on other.id=
      case when c.requester_id=auth.uid() then c.addressee_id else c.requester_id end
    where c.requester_id=auth.uid() or c.addressee_id=auth.uid()

    union all

    select
      'event_response',
      case when r.response='going' then 'Marked Going to an event'
           else 'Marked Interested in an event' end,
      e.title,
      '/events/'||e.id::text,
      r.updated_at
    from public.academic_event_responses r
    join public.academic_events e on e.id=r.event_id
    where r.user_id=auth.uid()
  )
  select activity_type,title,detail,resource_href,occurred_at
  from activity
  order by occurred_at desc
  limit least(greatest(coalesce(p_limit,100),1),250);
$$;

grant execute on function public.get_my_activity_log(integer) to authenticated;

notify pgrst,'reload schema';
