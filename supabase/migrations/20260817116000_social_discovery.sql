-- Examify Update 51: social discovery.
-- "People you may know" remains role-aware and respects privacy/blocking rules.

create or replace function public.get_people_you_may_know(
  p_limit integer default 12
)
returns table(
  user_id uuid,
  display_name text,
  role text,
  avatar_url text,
  career text,
  studying_at text,
  mutual_count bigint,
  reason text,
  connection_status text
)
language sql
stable
security definer
set search_path='public'
as $$
  with me as (
    select id,role,career,studying_at
    from public.profiles
    where id=auth.uid()
  ),
  eligible as (
    select
      p.id,
      p.full_name,
      p.role,
      p.avatar_url,
      p.career,
      p.studying_at,
      tp.display_name,
      tp.profile_image_url,
      public.mutual_connection_count(auth.uid(),p.id) as mutual_count,
      case
        when coalesce(me.studying_at,'')<>'' and lower(coalesce(me.studying_at,''))=lower(coalesce(p.studying_at,''))
          then 2
        when coalesce(me.career,'')<>'' and lower(coalesce(me.career,''))=lower(coalesce(p.career,''))
          then 1
        else 0
      end as affinity
    from public.profiles p
    cross join me
    left join public.teacher_profiles tp on tp.user_id=p.id
    where p.id<>auth.uid()
      and p.role=me.role
      and p.role in('student','teacher','parent')
      and not public.has_block_between(auth.uid(),p.id)
      and public.can_view_profile(p.id,auth.uid())
      and public.can_send_connection_request(p.id,auth.uid())
      and not exists(
        select 1
        from public.user_connections c
        where
          (c.requester_id=auth.uid() and c.addressee_id=p.id)
          or
          (c.requester_id=p.id and c.addressee_id=auth.uid())
      )
  )
  select
    e.id,
    coalesce(e.display_name,e.full_name,initcap(e.role)),
    e.role,
    coalesce(e.profile_image_url,e.avatar_url),
    case
      when p.career_visibility='examify'
      then e.career
      else null
    end,
    case
      when p.studying_at_visibility='examify'
      then e.studying_at
      else null
    end,
    e.mutual_count,
    case
      when e.mutual_count>0
        then e.mutual_count::text||' mutual connection'||case when e.mutual_count=1 then '' else 's' end
      when e.affinity=2
        then 'Studies at the same place'
      when e.affinity=1
        then 'Similar academic or professional field'
      else 'New to your Examify network'
    end,
    'none'::text
  from eligible e
  join public.profiles p on p.id=e.id
  order by
    case when e.mutual_count>0 then 0 else 1 end,
    e.mutual_count desc,
    e.affinity desc,
    coalesce(e.display_name,e.full_name,initcap(e.role))
  limit least(greatest(coalesce(p_limit,12),1),30);
$$;

grant execute on function public.get_people_you_may_know(integer)
to authenticated;

create or replace function public.get_suggested_teachers(
  p_limit integer default 8
)
returns table(
  user_id uuid,
  display_name text,
  headline text,
  avatar_url text,
  follower_count bigint,
  reason text,
  is_following boolean
)
language sql
stable
security definer
set search_path='public'
as $$
  with my_connections as (
    select
      case
        when c.requester_id=auth.uid() then c.addressee_id
        else c.requester_id
      end as user_id
    from public.user_connections c
    where c.status='accepted'
      and (c.requester_id=auth.uid() or c.addressee_id=auth.uid())
  ),
  scores as (
    select
      tp.user_id,
      tp.display_name,
      tp.headline,
      coalesce(tp.profile_image_url,p.avatar_url) as avatar_url,
      count(distinct allf.student_id) as follower_count,
      count(distinct friendf.student_id) as connection_follow_count
    from public.teacher_profiles tp
    join public.profiles p on p.id=tp.user_id
    left join public.teacher_followers allf on allf.teacher_id=tp.user_id
    left join public.teacher_followers friendf
      on friendf.teacher_id=tp.user_id
      and friendf.student_id in(select user_id from my_connections)
    where tp.is_public=true
      and public.can_view_profile(tp.user_id,auth.uid())
      and not public.has_block_between(auth.uid(),tp.user_id)
      and not exists(
        select 1 from public.teacher_followers mine
        where mine.teacher_id=tp.user_id
          and mine.student_id=auth.uid()
      )
      and tp.user_id<>auth.uid()
    group by
      tp.user_id,tp.display_name,tp.headline,tp.profile_image_url,p.avatar_url
  )
  select
    s.user_id,
    s.display_name,
    s.headline,
    s.avatar_url,
    s.follower_count,
    case
      when s.connection_follow_count>0
        then s.connection_follow_count::text||' of your connections follow this teacher'
      when s.follower_count>0
        then 'Popular in the Examify academic community'
      else 'Discover a teacher on Examify'
    end,
    false
  from scores s
  order by
    case when s.connection_follow_count>0 then 0 else 1 end,
    s.connection_follow_count desc,
    s.follower_count desc,
    s.display_name
  limit least(greatest(coalesce(p_limit,8),1),20);
$$;

grant execute on function public.get_suggested_teachers(integer)
to authenticated;

create or replace function public.get_suggested_institutions(
  p_limit integer default 8
)
returns table(
  user_id uuid,
  name text,
  description text,
  avatar_url text,
  follower_count bigint,
  reason text,
  is_following boolean
)
language sql
stable
security definer
set search_path='public'
as $$
  with my_connections as (
    select
      case
        when c.requester_id=auth.uid() then c.addressee_id
        else c.requester_id
      end as user_id
    from public.user_connections c
    where c.status='accepted'
      and (c.requester_id=auth.uid() or c.addressee_id=auth.uid())
  ),
  scores as (
    select
      ip.user_id,
      ip.name,
      ip.description,
      p.avatar_url,
      count(distinct allf.follower_id) as follower_count,
      count(distinct friendf.follower_id) as connection_follow_count
    from public.institution_profiles ip
    join public.profiles p on p.id=ip.user_id
    left join public.institution_followers allf
      on allf.institution_id=ip.user_id
    left join public.institution_followers friendf
      on friendf.institution_id=ip.user_id
      and friendf.follower_id in(select user_id from my_connections)
    where ip.is_public=true
      and ip.verification_status='approved'
      and public.can_view_profile(ip.user_id,auth.uid())
      and not public.has_block_between(auth.uid(),ip.user_id)
      and not exists(
        select 1 from public.institution_followers mine
        where mine.institution_id=ip.user_id
          and mine.follower_id=auth.uid()
      )
      and ip.user_id<>auth.uid()
    group by ip.user_id,ip.name,ip.description,p.avatar_url
  )
  select
    s.user_id,
    s.name,
    s.description,
    s.avatar_url,
    s.follower_count,
    case
      when s.connection_follow_count>0
        then s.connection_follow_count::text||' of your connections follow this institution'
      when s.follower_count>0
        then 'Popular verified institution on Examify'
      else 'Discover a verified institution'
    end,
    false
  from scores s
  order by
    case when s.connection_follow_count>0 then 0 else 1 end,
    s.connection_follow_count desc,
    s.follower_count desc,
    s.name
  limit least(greatest(coalesce(p_limit,8),1),20);
$$;

grant execute on function public.get_suggested_institutions(integer)
to authenticated;

notify pgrst,'reload schema';
