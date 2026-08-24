-- Examify Update 42: role-aware social connections.
-- Student<->student friendships, teacher<->teacher professional connections,
-- and parent<->parent connections. Adult/student friend connections are intentionally disallowed.

create table if not exists public.user_connections (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  constraint user_connections_not_self check (requester_id <> addressee_id)
);
create index if not exists user_connections_addressee_idx on public.user_connections(addressee_id,status,created_at desc);
create index if not exists user_connections_requester_idx on public.user_connections(requester_id,status,created_at desc);
alter table public.user_connections enable row level security;

create policy "Participants read connections" on public.user_connections for select to authenticated
using (requester_id=auth.uid() or addressee_id=auth.uid());

-- All mutations go through RPCs so role and blocking rules cannot be bypassed.

create or replace function public.connection_roles_compatible(p_a uuid,p_b uuid)
returns boolean language sql stable security definer set search_path='public' as $$
 select exists(
   select 1 from public.profiles a join public.profiles b on b.id=p_b
   where a.id=p_a and a.role=b.role and a.role in ('student','teacher','parent')
 );
$$;
revoke all on function public.connection_roles_compatible(uuid,uuid) from public;
grant execute on function public.connection_roles_compatible(uuid,uuid) to authenticated;

create or replace function public.send_connection_request(p_user_id uuid)
returns void language plpgsql security definer set search_path='public' as $$
declare v_me uuid:=auth.uid(); v_reverse public.user_connections%rowtype;
begin
 if v_me is null then raise exception 'You must be signed in.'; end if;
 if p_user_id is null or p_user_id=v_me then raise exception 'Choose another user.'; end if;
 if not public.connection_roles_compatible(v_me,p_user_id) then
   raise exception 'Connections are only available between students, between teachers, or between parents.';
 end if;
 if public.has_block_between(v_me,p_user_id) then raise exception 'Connection unavailable because one account has blocked the other.'; end if;
 select * into v_reverse from public.user_connections where requester_id=p_user_id and addressee_id=v_me;
 if found then
   if v_reverse.status='accepted' then raise exception 'You are already connected.'; end if;
   update public.user_connections set status='accepted',responded_at=now() where requester_id=p_user_id and addressee_id=v_me;
   insert into public.notifications(user_id,actor_id,notification_type) values(p_user_id,v_me,'connection_accepted');
   return;
 end if;
 insert into public.user_connections(requester_id,addressee_id,status) values(v_me,p_user_id,'pending')
 on conflict(requester_id,addressee_id) do nothing;
 if found then insert into public.notifications(user_id,actor_id,notification_type) values(p_user_id,v_me,'connection_request'); end if;
end;$$;

create or replace function public.respond_connection_request(p_user_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='public' as $$
declare v_me uuid:=auth.uid();
begin
 if p_accept then
   update public.user_connections set status='accepted',responded_at=now()
   where requester_id=p_user_id and addressee_id=v_me and status='pending';
   if not found then raise exception 'Connection request not found.'; end if;
   insert into public.notifications(user_id,actor_id,notification_type) values(p_user_id,v_me,'connection_accepted');
 else
   delete from public.user_connections where requester_id=p_user_id and addressee_id=v_me and status='pending';
 end if;
end;$$;

create or replace function public.remove_connection(p_user_id uuid)
returns void language plpgsql security definer set search_path='public' as $$
begin
 delete from public.user_connections where status='accepted' and
 ((requester_id=auth.uid() and addressee_id=p_user_id) or (requester_id=p_user_id and addressee_id=auth.uid()));
end;$$;

create or replace function public.cancel_connection_request(p_user_id uuid)
returns void language plpgsql security definer set search_path='public' as $$
begin delete from public.user_connections where requester_id=auth.uid() and addressee_id=p_user_id and status='pending'; end;$$;

revoke all on function public.send_connection_request(uuid) from public;
revoke all on function public.respond_connection_request(uuid,boolean) from public;
revoke all on function public.remove_connection(uuid) from public;
revoke all on function public.cancel_connection_request(uuid) from public;
grant execute on function public.send_connection_request(uuid) to authenticated;
grant execute on function public.respond_connection_request(uuid,boolean) to authenticated;
grant execute on function public.remove_connection(uuid) to authenticated;
grant execute on function public.cancel_connection_request(uuid) to authenticated;

-- Blocking behaves like Facebook: it also removes any existing/requested connection.
create or replace function public.block_examify_user(p_user_id uuid)
returns void language plpgsql security definer set search_path='public' as $$
declare v_me uuid:=auth.uid();
begin
 if v_me is null then raise exception 'You must be signed in.'; end if;
 if p_user_id is null or p_user_id=v_me then raise exception 'You cannot block this account.'; end if;
 insert into public.user_blocks(blocker_id,blocked_id) values(v_me,p_user_id) on conflict do nothing;
 delete from public.user_connections where (requester_id=v_me and addressee_id=p_user_id) or (requester_id=p_user_id and addressee_id=v_me);
end;$$;
revoke all on function public.block_examify_user(uuid) from public;
grant execute on function public.block_examify_user(uuid) to authenticated;

alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check(notification_type in(
 'post_reaction','post_comment','child_exam_result','user_safety_report','connection_request','connection_accepted'
));

create or replace function public.get_my_connections()
returns table(user_id uuid,display_name text,role text,avatar_url text,connected_at timestamptz)
language sql stable security definer set search_path='public' as $$
 select p.id,
   case when p.role='teacher' then coalesce(tp.display_name,p.full_name,'Teacher') else coalesce(p.full_name,initcap(p.role)) end,
   p.role,coalesce(tp.profile_image_url,p.avatar_url),coalesce(c.responded_at,c.created_at)
 from public.user_connections c
 join public.profiles p on p.id=case when c.requester_id=auth.uid() then c.addressee_id else c.requester_id end
 left join public.teacher_profiles tp on tp.user_id=p.id
 where c.status='accepted' and (c.requester_id=auth.uid() or c.addressee_id=auth.uid())
 order by 2;
$$;

create or replace function public.get_my_connection_requests()
returns table(user_id uuid,display_name text,role text,avatar_url text,created_at timestamptz)
language sql stable security definer set search_path='public' as $$
 select p.id,case when p.role='teacher' then coalesce(tp.display_name,p.full_name,'Teacher') else coalesce(p.full_name,initcap(p.role)) end,
 p.role,coalesce(tp.profile_image_url,p.avatar_url),c.created_at
 from public.user_connections c join public.profiles p on p.id=c.requester_id left join public.teacher_profiles tp on tp.user_id=p.id
 where c.addressee_id=auth.uid() and c.status='pending' order by c.created_at desc;
$$;

create or replace function public.search_connectable_people(p_query text default '',p_limit integer default 30)
returns table(user_id uuid,display_name text,role text,avatar_url text,career text,studying_at text,connection_status text,mutual_count bigint)
language sql stable security definer set search_path='public' as $$
 with me as(select role from public.profiles where id=auth.uid()), candidates as(
  select p.id,p.full_name,p.role,p.avatar_url,p.career,p.studying_at,tp.display_name,tp.profile_image_url
  from public.profiles p cross join me left join public.teacher_profiles tp on tp.user_id=p.id
  where p.id<>auth.uid() and p.role=me.role and p.role in('student','teacher','parent')
  and not public.has_block_between(auth.uid(),p.id)
  and (coalesce(btrim(p_query),'')='' or coalesce(tp.display_name,p.full_name,'') ilike '%'||btrim(p_query)||'%')
 )
 select c.id,coalesce(c.display_name,c.full_name,initcap(c.role)),c.role,coalesce(c.profile_image_url,c.avatar_url),c.career,c.studying_at,
 case when uc.status='accepted' then 'connected' when uc.requester_id=auth.uid() then 'sent' when uc.addressee_id=auth.uid() then 'received' else 'none' end,
 (select count(*) from public.user_connections mine join public.user_connections theirs on
   (case when mine.requester_id=auth.uid() then mine.addressee_id else mine.requester_id end)=
   (case when theirs.requester_id=c.id then theirs.addressee_id else theirs.requester_id end)
   where mine.status='accepted' and theirs.status='accepted'
   and (mine.requester_id=auth.uid() or mine.addressee_id=auth.uid()) and (theirs.requester_id=c.id or theirs.addressee_id=c.id)) as mutual_count
 from candidates c left join public.user_connections uc on
 ((uc.requester_id=auth.uid() and uc.addressee_id=c.id) or(uc.requester_id=c.id and uc.addressee_id=auth.uid()))
 order by mutual_count desc,2 limit least(greatest(coalesce(p_limit,30),1),100);
$$;

grant execute on function public.get_my_connections() to authenticated;
grant execute on function public.get_my_connection_requests() to authenticated;
grant execute on function public.search_connectable_people(text,integer) to authenticated;

create or replace function public.get_connection_profile(p_user_id uuid)
returns table(user_id uuid,display_name text,role text,avatar_url text,career text,studying_at text,birthday text,connection_status text,mutual_count bigint,connection_count bigint)
language sql stable security definer set search_path='public' as $$
 select p.id,case when p.role='teacher' then coalesce(tp.display_name,p.full_name,'Teacher') else coalesce(p.full_name,initcap(p.role)) end,
 p.role,coalesce(tp.profile_image_url,p.avatar_url),p.career,p.studying_at,
 case when p.show_birthday and p.date_of_birth is not null then to_char(p.date_of_birth,'Month DD') else null end,
 case when p.id=auth.uid() then 'self' when uc.status='accepted' then 'connected' when uc.requester_id=auth.uid() then 'sent' when uc.addressee_id=auth.uid() then 'received' else 'none' end,
 (select count(*) from public.user_connections mine join public.user_connections theirs on
  (case when mine.requester_id=auth.uid() then mine.addressee_id else mine.requester_id end)=
  (case when theirs.requester_id=p.id then theirs.addressee_id else theirs.requester_id end)
  where mine.status='accepted' and theirs.status='accepted' and (mine.requester_id=auth.uid() or mine.addressee_id=auth.uid()) and(theirs.requester_id=p.id or theirs.addressee_id=p.id)),
 (select count(*) from public.user_connections x where x.status='accepted' and(x.requester_id=p.id or x.addressee_id=p.id))
 from public.profiles p left join public.teacher_profiles tp on tp.user_id=p.id left join public.user_connections uc on
 ((uc.requester_id=auth.uid() and uc.addressee_id=p.id)or(uc.requester_id=p.id and uc.addressee_id=auth.uid()))
 where p.id=p_user_id and not public.has_block_between(auth.uid(),p.id);
$$;
grant execute on function public.get_connection_profile(uuid) to authenticated;

-- Refresh notification RPC with connection notification types.
drop function if exists public.get_my_notifications(integer);
create function public.get_my_notifications(p_limit integer default 50)
returns table(id uuid,notification_type text,post_id uuid,comment_id uuid,exam_attempt_id uuid,user_report_id uuid,actor_id uuid,actor_name text,actor_role text,exam_title text,exam_score numeric,exam_passing_score integer,read_at timestamptz,created_at timestamptz)
language sql stable security definer set search_path='public' as $$
 select n.id,n.notification_type,n.post_id,n.comment_id,n.exam_attempt_id,n.user_report_id,n.actor_id,
 case when p.role='teacher' then coalesce(tp.display_name,p.full_name,'Teacher') when p.role='institution' then coalesce(ip.name,p.full_name,'Institution') when p.role='admin' then coalesce(p.full_name,'Examify Admin') when p.role='parent' then coalesce(p.full_name,'Parent') else coalesce(p.full_name,'Student') end,
 p.role,e.title,a.score_percent,e.passing_score,n.read_at,n.created_at
 from public.notifications n left join public.profiles p on p.id=n.actor_id left join public.teacher_profiles tp on tp.user_id=n.actor_id left join public.institution_profiles ip on ip.user_id=n.actor_id left join public.exam_attempts a on a.id=n.exam_attempt_id left join public.exams e on e.id=a.exam_id
 where n.user_id=auth.uid() order by n.created_at desc limit least(greatest(coalesce(p_limit,50),1),100);
$$;
grant execute on function public.get_my_notifications(integer) to authenticated;
notify pgrst,'reload schema';
