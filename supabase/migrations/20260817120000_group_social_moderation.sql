-- Examify Update 55: mature group social features, moderation, and safety.

alter table public.academic_group_post_comments
  add column if not exists parent_comment_id uuid
    references public.academic_group_post_comments(id) on delete cascade;

create index if not exists academic_group_post_comments_parent_idx
  on public.academic_group_post_comments(parent_comment_id,created_at);

create table if not exists public.academic_group_post_reactions(
  post_id uuid not null references public.academic_group_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null default 'like'
    check(reaction_type in('like','helpful','insightful','celebrate')),
  created_at timestamptz not null default now(),
  primary key(post_id,user_id)
);

create index if not exists academic_group_post_reactions_post_idx
  on public.academic_group_post_reactions(post_id,reaction_type);

alter table public.academic_group_post_reactions enable row level security;

drop policy if exists "Members read group reactions" on public.academic_group_post_reactions;
create policy "Members read group reactions"
on public.academic_group_post_reactions
for select
to authenticated
using(
  exists(
    select 1
    from public.academic_group_posts gp
    join public.academic_groups g on g.id=gp.group_id
    where gp.id=post_id
      and (
        public.is_group_active_member(gp.group_id,auth.uid())
        or g.is_discoverable=true
        or public.is_examify_admin()
      )
  )
);

drop policy if exists "Members react to group posts" on public.academic_group_post_reactions;
create policy "Members react to group posts"
on public.academic_group_post_reactions
for insert
to authenticated
with check(
  user_id=auth.uid()
  and exists(
    select 1
    from public.academic_group_posts gp
    where gp.id=post_id
      and public.is_group_active_member(gp.group_id,auth.uid())
  )
);

drop policy if exists "Users change own group reactions" on public.academic_group_post_reactions;
create policy "Users change own group reactions"
on public.academic_group_post_reactions
for update
to authenticated
using(user_id=auth.uid())
with check(user_id=auth.uid());

drop policy if exists "Users remove own group reactions" on public.academic_group_post_reactions;
create policy "Users remove own group reactions"
on public.academic_group_post_reactions
for delete
to authenticated
using(user_id=auth.uid());

create table if not exists public.academic_group_content_reports(
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.academic_groups(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_author_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.academic_group_posts(id) on delete cascade,
  comment_id uuid references public.academic_group_post_comments(id) on delete cascade,
  category text not null
    check(category in('harassment','bullying','threats','hate','sexual_content','spam','impersonation','unsafe_behavior','non_academic','other')),
  details text not null
    check(char_length(btrim(details)) between 10 and 2000),
  status text not null default 'open'
    check(status in('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  constraint academic_group_content_report_target check(
    (post_id is not null and comment_id is null)
    or
    (post_id is null and comment_id is not null)
  )
);

create index if not exists academic_group_content_reports_group_idx
  on public.academic_group_content_reports(group_id,status,created_at desc);
create index if not exists academic_group_content_reports_author_idx
  on public.academic_group_content_reports(reported_author_id,created_at desc);

alter table public.academic_group_content_reports enable row level security;

drop policy if exists "Reporters managers admins read group reports" on public.academic_group_content_reports;
create policy "Reporters managers admins read group reports"
on public.academic_group_content_reports
for select
to authenticated
using(
  reporter_id=auth.uid()
  or public.is_group_manager(group_id,auth.uid())
  or public.is_examify_admin()
);

drop policy if exists "Users submit group reports" on public.academic_group_content_reports;
create policy "Users submit group reports"
on public.academic_group_content_reports
for insert
to authenticated
with check(
  reporter_id=auth.uid()
  and reported_author_id<>auth.uid()
);

drop policy if exists "Managers admins update group reports" on public.academic_group_content_reports;
create policy "Managers admins update group reports"
on public.academic_group_content_reports
for update
to authenticated
using(
  public.is_group_manager(group_id,auth.uid())
  or public.is_examify_admin()
)
with check(
  public.is_group_manager(group_id,auth.uid())
  or public.is_examify_admin()
);

alter table public.notifications
  add column if not exists group_id uuid references public.academic_groups(id) on delete cascade,
  add column if not exists group_post_id uuid references public.academic_group_posts(id) on delete cascade,
  add column if not exists group_comment_id uuid references public.academic_group_post_comments(id) on delete cascade;

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
    'group_content_report'
  ));

create or replace function public.set_group_post_reaction(
  p_post_id uuid,
  p_reaction_type text
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_group_id uuid;
  v_author_id uuid;
begin
  if p_reaction_type not in('like','helpful','insightful','celebrate') then
    raise exception 'Invalid reaction.';
  end if;

  select group_id,author_id
  into v_group_id,v_author_id
  from public.academic_group_posts
  where id=p_post_id;

  if v_group_id is null then
    raise exception 'Post not found.';
  end if;

  if not public.is_group_active_member(v_group_id,auth.uid()) then
    raise exception 'Join the group to react.';
  end if;

  insert into public.academic_group_post_reactions(
    post_id,user_id,reaction_type
  )
  values(
    p_post_id,auth.uid(),p_reaction_type
  )
  on conflict(post_id,user_id)
  do update set
    reaction_type=excluded.reaction_type,
    created_at=now();

  if v_author_id<>auth.uid() then
    insert into public.notifications(
      user_id,actor_id,notification_type,group_id,group_post_id
    )
    values(
      v_author_id,auth.uid(),'group_reaction',v_group_id,p_post_id
    );
  end if;
end;
$$;

grant execute on function public.set_group_post_reaction(uuid,text)
to authenticated;

create or replace function public.clear_group_post_reaction(p_post_id uuid)
returns void
language sql
security definer
set search_path='public'
as $$
  delete from public.academic_group_post_reactions
  where post_id=p_post_id
    and user_id=auth.uid();
$$;

grant execute on function public.clear_group_post_reaction(uuid)
to authenticated;

create or replace function public.get_group_post_reaction_summary(p_post_ids uuid[])
returns table(
  post_id uuid,
  reaction_type text,
  reaction_count bigint,
  viewer_reacted boolean
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    r.post_id,
    r.reaction_type,
    count(*),
    bool_or(r.user_id=auth.uid())
  from public.academic_group_post_reactions r
  where r.post_id=any(p_post_ids)
  group by r.post_id,r.reaction_type
  order by r.post_id,r.reaction_type;
$$;

grant execute on function public.get_group_post_reaction_summary(uuid[])
to authenticated;

create or replace function public.add_group_comment(
  p_post_id uuid,
  p_body text,
  p_parent_comment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_group_id uuid;
  v_post_author uuid;
  v_comment_id uuid;
  v_parent_author uuid;
begin
  select group_id,author_id
  into v_group_id,v_post_author
  from public.academic_group_posts
  where id=p_post_id;

  if v_group_id is null then
    raise exception 'Post not found.';
  end if;

  if not public.is_group_active_member(v_group_id,auth.uid()) then
    raise exception 'Join the group to comment.';
  end if;

  if char_length(btrim(coalesce(p_body,'')))<1 then
    raise exception 'Comment cannot be empty.';
  end if;

  if p_parent_comment_id is not null then
    select author_id
    into v_parent_author
    from public.academic_group_post_comments
    where id=p_parent_comment_id
      and post_id=p_post_id;

    if v_parent_author is null then
      raise exception 'Reply target not found.';
    end if;
  end if;

  insert into public.academic_group_post_comments(
    post_id,author_id,body,parent_comment_id
  )
  values(
    p_post_id,auth.uid(),btrim(p_body),p_parent_comment_id
  )
  returning id into v_comment_id;

  if v_parent_author is not null and v_parent_author<>auth.uid() then
    insert into public.notifications(
      user_id,actor_id,notification_type,group_id,group_post_id,group_comment_id
    )
    values(
      v_parent_author,auth.uid(),'group_comment',v_group_id,p_post_id,v_comment_id
    );
  elsif v_post_author<>auth.uid() then
    insert into public.notifications(
      user_id,actor_id,notification_type,group_id,group_post_id,group_comment_id
    )
    values(
      v_post_author,auth.uid(),'group_comment',v_group_id,p_post_id,v_comment_id
    );
  end if;

  return v_comment_id;
end;
$$;

grant execute on function public.add_group_comment(uuid,text,uuid)
to authenticated;

drop function if exists public.get_group_post_comments(uuid,integer);

create function public.get_group_post_comments(
  p_post_id uuid,
  p_limit integer default 100
)
returns table(
  id uuid,
  parent_comment_id uuid,
  author_id uuid,
  author_name text,
  author_role text,
  author_avatar_url text,
  body text,
  created_at timestamptz,
  can_delete boolean
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    c.id,
    c.parent_comment_id,
    c.author_id,
    case when p.role='teacher' then coalesce(tp.display_name,p.full_name,'Teacher')
         when p.role='institution' then coalesce(ip.name,p.full_name,'Institution')
         else coalesce(p.full_name,initcap(p.role)) end,
    p.role,
    case when p.role='teacher' then coalesce(tp.profile_image_url,p.avatar_url)
         else p.avatar_url end,
    c.body,
    c.created_at,
    (
      c.author_id=auth.uid()
      or public.is_examify_admin()
      or exists(
        select 1
        from public.academic_group_posts gp
        where gp.id=c.post_id
          and public.is_group_manager(gp.group_id,auth.uid())
      )
    )
  from public.academic_group_post_comments c
  join public.profiles p on p.id=c.author_id
  left join public.teacher_profiles tp on tp.user_id=c.author_id
  left join public.institution_profiles ip on ip.user_id=c.author_id
  where c.post_id=p_post_id
    and not public.has_block_between(auth.uid(),c.author_id)
  order by c.created_at
  limit least(greatest(coalesce(p_limit,100),1),200);
$$;

grant execute on function public.get_group_post_comments(uuid,integer)
to authenticated;

create or replace function public.search_group_members(
  p_group_id uuid,
  p_query text default '',
  p_limit integer default 50
)
returns table(
  user_id uuid,
  display_name text,
  role text,
  avatar_url text,
  membership_role text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    p.id,
    case when p.role='teacher' then coalesce(tp.display_name,p.full_name,'Teacher')
         when p.role='institution' then coalesce(ip.name,p.full_name,'Institution')
         else coalesce(p.full_name,initcap(p.role)) end,
    p.role,
    coalesce(tp.profile_image_url,p.avatar_url),
    gm.membership_role,
    gm.created_at
  from public.academic_group_members gm
  join public.profiles p on p.id=gm.user_id
  left join public.teacher_profiles tp on tp.user_id=p.id
  left join public.institution_profiles ip on ip.user_id=p.id
  where gm.group_id=p_group_id
    and gm.status='active'
    and public.is_group_active_member(p_group_id,auth.uid())
    and (
      coalesce(btrim(p_query),'')=''
      or coalesce(tp.display_name,ip.name,p.full_name,'')
        ilike '%'||btrim(p_query)||'%'
    )
  order by
    case when gm.membership_role='owner' then 0
         when gm.membership_role='moderator' then 1
         else 2 end,
    coalesce(tp.display_name,ip.name,p.full_name,'')
  limit least(greatest(coalesce(p_limit,50),1),100);
$$;

grant execute on function public.search_group_members(uuid,text,integer)
to authenticated;

create or replace function public.set_group_member_role(
  p_group_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_me_role text;
  v_target_role text;
begin
  if p_role not in('member','moderator') then
    raise exception 'Invalid member role.';
  end if;

  select membership_role into v_me_role
  from public.academic_group_members
  where group_id=p_group_id
    and user_id=auth.uid()
    and status='active';

  if v_me_role<>'owner' and not public.is_examify_admin() then
    raise exception 'Only the group owner can change moderator roles.';
  end if;

  select membership_role into v_target_role
  from public.academic_group_members
  where group_id=p_group_id
    and user_id=p_user_id
    and status='active';

  if v_target_role is null then
    raise exception 'Member not found.';
  end if;

  if v_target_role='owner' then
    raise exception 'Owner role cannot be changed here.';
  end if;

  update public.academic_group_members
  set membership_role=p_role
  where group_id=p_group_id
    and user_id=p_user_id;
end;
$$;

grant execute on function public.set_group_member_role(uuid,uuid,text)
to authenticated;

create or replace function public.search_group_invitees(
  p_group_id uuid,
  p_query text default '',
  p_limit integer default 30
)
returns table(
  user_id uuid,
  display_name text,
  role text,
  avatar_url text,
  membership_status text
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    p.id,
    case when p.role='teacher' then coalesce(tp.display_name,p.full_name,'Teacher')
         when p.role='institution' then coalesce(ip.name,p.full_name,'Institution')
         else coalesce(p.full_name,initcap(p.role)) end,
    p.role,
    coalesce(tp.profile_image_url,p.avatar_url),
    gm.status
  from public.profiles p
  left join public.teacher_profiles tp on tp.user_id=p.id
  left join public.institution_profiles ip on ip.user_id=p.id
  left join public.academic_group_members gm
    on gm.group_id=p_group_id
    and gm.user_id=p.id
  where public.is_group_manager(p_group_id,auth.uid())
    and p.id<>auth.uid()
    and p.role in('student','teacher','parent','institution')
    and not public.has_block_between(auth.uid(),p.id)
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
    case when gm.status is null then 0 else 1 end,
    coalesce(tp.display_name,ip.name,p.full_name,'')
  limit least(greatest(coalesce(p_limit,30),1),50);
$$;

grant execute on function public.search_group_invitees(uuid,text,integer)
to authenticated;

create or replace function public.invite_user_to_group(
  p_group_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
begin
  if not public.is_group_manager(p_group_id,auth.uid()) then
    raise exception 'Not authorized.';
  end if;

  if p_user_id=auth.uid() then
    raise exception 'You are already in this group.';
  end if;

  if public.has_block_between(auth.uid(),p_user_id) then
    raise exception 'This user cannot be invited.';
  end if;

  insert into public.academic_group_members(
    group_id,user_id,membership_role,status,invited_by,responded_at
  )
  values(
    p_group_id,p_user_id,'member','invited',auth.uid(),null
  )
  on conflict(group_id,user_id)
  do update set
    status='invited',
    invited_by=auth.uid(),
    responded_at=null;

  insert into public.notifications(
    user_id,actor_id,notification_type,group_id
  )
  values(
    p_user_id,auth.uid(),'group_invite',p_group_id
  );
end;
$$;

grant execute on function public.invite_user_to_group(uuid,uuid)
to authenticated;

create or replace function public.notify_group_membership_change()
returns trigger
language plpgsql
security definer
set search_path='public'
as $$
begin
  if tg_op='INSERT' and new.status='requested' then
    insert into public.notifications(
      user_id,actor_id,notification_type,group_id
    )
    select
      gm.user_id,new.user_id,'group_join_request',new.group_id
    from public.academic_group_members gm
    where gm.group_id=new.group_id
      and gm.status='active'
      and gm.membership_role in('owner','moderator')
      and gm.user_id<>new.user_id;
  end if;

  if tg_op='UPDATE'
     and old.status='requested'
     and new.status='active'
     and new.user_id<>auth.uid() then
    insert into public.notifications(
      user_id,actor_id,notification_type,group_id
    )
    values(
      new.user_id,auth.uid(),'group_join_approved',new.group_id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists academic_group_membership_notifications
on public.academic_group_members;

create trigger academic_group_membership_notifications
after insert or update on public.academic_group_members
for each row execute function public.notify_group_membership_change();

create or replace function public.submit_group_content_report(
  p_group_id uuid,
  p_post_id uuid default null,
  p_comment_id uuid default null,
  p_category text default 'other',
  p_details text default ''
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_author uuid;
  v_report_id uuid;
begin
  if p_category not in(
    'harassment','bullying','threats','hate','sexual_content',
    'spam','impersonation','unsafe_behavior','non_academic','other'
  ) then
    raise exception 'Invalid report category.';
  end if;

  if char_length(btrim(coalesce(p_details,'')))<10 then
    raise exception 'Please provide at least 10 characters of detail.';
  end if;

  if (p_post_id is null and p_comment_id is null)
     or (p_post_id is not null and p_comment_id is not null) then
    raise exception 'Choose either a post or a comment.';
  end if;

  if p_post_id is not null then
    select author_id
    into v_author
    from public.academic_group_posts
    where id=p_post_id
      and group_id=p_group_id;
  else
    select c.author_id
    into v_author
    from public.academic_group_post_comments c
    join public.academic_group_posts gp on gp.id=c.post_id
    where c.id=p_comment_id
      and gp.group_id=p_group_id;
  end if;

  if v_author is null then
    raise exception 'Reported content not found.';
  end if;

  if v_author=auth.uid() then
    raise exception 'You cannot report your own content.';
  end if;

  insert into public.academic_group_content_reports(
    group_id,reporter_id,reported_author_id,
    post_id,comment_id,category,details
  )
  values(
    p_group_id,auth.uid(),v_author,
    p_post_id,p_comment_id,p_category,btrim(p_details)
  )
  returning id into v_report_id;

  insert into public.notifications(
    user_id,actor_id,notification_type,group_id,group_post_id,group_comment_id
  )
  select
    gm.user_id,
    auth.uid(),
    'group_content_report',
    p_group_id,
    p_post_id,
    p_comment_id
  from public.academic_group_members gm
  where gm.group_id=p_group_id
    and gm.status='active'
    and gm.membership_role in('owner','moderator')
    and gm.user_id<>auth.uid();

  insert into public.notifications(
    user_id,actor_id,notification_type,group_id,group_post_id,group_comment_id
  )
  select
    p.id,
    auth.uid(),
    'group_content_report',
    p_group_id,
    p_post_id,
    p_comment_id
  from public.profiles p
  where p.role='admin'
    and p.id<>auth.uid();

  -- Serious group behavior also enters Examify's platform-wide safety network,
  -- preserving the parent/institution routing rules already established there.
  if p_category in(
    'harassment','bullying','threats','hate',
    'sexual_content','impersonation','unsafe_behavior'
  ) then
    perform public.submit_user_report(
      v_author,
      case
        when p_category='harassment' then 'harassment'
        when p_category='bullying' then 'bullying'
        when p_category in('threats','unsafe_behavior') then 'safety'
        when p_category='impersonation' then 'impersonation'
        else 'inappropriate'
      end,
      'Reported from an academic group: '||btrim(p_details),
      null
    );
  end if;

  return v_report_id;
end;
$$;

grant execute on function public.submit_group_content_report(uuid,uuid,uuid,text,text)
to authenticated;

create or replace function public.get_group_content_reports(
  p_group_id uuid,
  p_limit integer default 100
)
returns table(
  report_id uuid,
  reporter_id uuid,
  reporter_name text,
  reported_author_id uuid,
  reported_author_name text,
  post_id uuid,
  comment_id uuid,
  category text,
  details text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    r.id,
    r.reporter_id,
    coalesce(rp.full_name,'Reporter'),
    r.reported_author_id,
    coalesce(ap.full_name,'Examify user'),
    r.post_id,
    r.comment_id,
    r.category,
    r.details,
    r.status,
    r.created_at
  from public.academic_group_content_reports r
  join public.profiles rp on rp.id=r.reporter_id
  join public.profiles ap on ap.id=r.reported_author_id
  where r.group_id=p_group_id
    and (
      public.is_group_manager(p_group_id,auth.uid())
      or public.is_examify_admin()
    )
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit,100),1),200);
$$;

grant execute on function public.get_group_content_reports(uuid,integer)
to authenticated;

create or replace function public.review_group_content_report(
  p_report_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_group_id uuid;
begin
  if p_status not in('reviewing','resolved','dismissed') then
    raise exception 'Invalid report status.';
  end if;

  select group_id into v_group_id
  from public.academic_group_content_reports
  where id=p_report_id;

  if v_group_id is null then
    raise exception 'Report not found.';
  end if;

  if not public.is_group_manager(v_group_id,auth.uid())
     and not public.is_examify_admin() then
    raise exception 'Not authorized.';
  end if;

  update public.academic_group_content_reports
  set
    status=p_status,
    reviewed_at=now(),
    reviewed_by=auth.uid()
  where id=p_report_id;
end;
$$;

grant execute on function public.review_group_content_report(uuid,text)
to authenticated;

-- Group activity obeys Social Engagement notification preferences.
create or replace function public.apply_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_preferences public.notification_preferences%rowtype;
begin
  if new.notification_type in('user_safety_report','group_content_report') then
    return new;
  end if;

  select * into v_preferences
  from public.notification_preferences
  where user_id=new.user_id;

  if not found then
    return new;
  end if;

  if new.notification_type in(
    'post_reaction','post_comment','post_mention','post_shared',
    'birthday_congrats','anniversary_congrats','achievement_congrats',
    'group_invite','group_join_request','group_join_approved',
    'group_comment','group_reaction'
  ) and not v_preferences.social_engagement then
    return null;
  end if;

  if new.notification_type in('connection_request','connection_accepted')
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
