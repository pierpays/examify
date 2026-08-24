-- Examify Update 45: reposts/shares, @mentions/tagging, and notifications.

alter table public.feed_posts
  add column if not exists shared_post_id uuid references public.feed_posts(id) on delete cascade;

create index if not exists feed_posts_shared_post_idx
  on public.feed_posts(shared_post_id)
  where shared_post_id is not null;

alter table public.feed_posts drop constraint if exists feed_posts_type_shape;
alter table public.feed_posts add constraint feed_posts_type_shape check (
  (
    post_type='post'
    and achievement_attempt_id is null
    and feed_exam_id is null
    and (
      (body is not null and char_length(btrim(body))>0)
      or image_url is not null
      or link_url is not null
      or document_url is not null
      or shared_post_id is not null
    )
  )
  or (
    post_type='achievement'
    and achievement_attempt_id is not null
    and feed_exam_id is null
    and image_url is null and link_url is null and document_url is null
    and shared_post_id is null
  )
  or (
    post_type='exam'
    and achievement_attempt_id is null
    and feed_exam_id is not null
    and image_url is null and link_url is null and document_url is null
    and shared_post_id is null
  )
);

create table if not exists public.feed_post_mentions (
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(post_id,mentioned_user_id)
);
create index if not exists feed_post_mentions_user_idx
  on public.feed_post_mentions(mentioned_user_id,created_at desc);
alter table public.feed_post_mentions enable row level security;

drop policy if exists "Authenticated users read post mentions" on public.feed_post_mentions;
create policy "Authenticated users read post mentions"
on public.feed_post_mentions for select to authenticated using(true);

drop policy if exists "Authors tag users in own posts" on public.feed_post_mentions;
create policy "Authors tag users in own posts"
on public.feed_post_mentions for insert to authenticated
with check (
  exists(select 1 from public.feed_posts fp where fp.id=post_id and fp.author_id=auth.uid())
  and mentioned_user_id<>auth.uid()
  and not public.has_block_between(auth.uid(),mentioned_user_id)
);

alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check(notification_type in(
 'post_reaction','post_comment','child_exam_result','user_safety_report',
 'connection_request','connection_accepted','post_mention','post_shared'
));

create or replace function public.notify_feed_mention()
returns trigger language plpgsql security definer set search_path='public' as $$
declare v_actor uuid;
begin
 select author_id into v_actor from public.feed_posts where id=new.post_id;
 if new.mentioned_user_id<>v_actor then
   insert into public.notifications(user_id,actor_id,notification_type,post_id)
   values(new.mentioned_user_id,v_actor,'post_mention',new.post_id);
 end if;
 return new;
end $$;

drop trigger if exists feed_post_mention_notification on public.feed_post_mentions;
create trigger feed_post_mention_notification
after insert on public.feed_post_mentions
for each row execute function public.notify_feed_mention();

create or replace function public.notify_feed_share()
returns trigger language plpgsql security definer set search_path='public' as $$
declare v_original_author uuid;
begin
 if new.shared_post_id is null then return new; end if;
 select author_id into v_original_author from public.feed_posts where id=new.shared_post_id;
 if v_original_author is not null and v_original_author<>new.author_id then
   insert into public.notifications(user_id,actor_id,notification_type,post_id)
   values(v_original_author,new.author_id,'post_shared',new.id);
 end if;
 return new;
end $$;

drop trigger if exists feed_post_share_notification on public.feed_posts;
create trigger feed_post_share_notification
after insert on public.feed_posts
for each row when(new.shared_post_id is not null)
execute function public.notify_feed_share();

create or replace function public.search_mentionable_people(p_query text default '',p_limit integer default 12)
returns table(user_id uuid,display_name text,role text,avatar_url text)
language sql stable security definer set search_path='public' as $$
 select p.id,
   case
     when p.role='teacher' then coalesce(tp.display_name,p.full_name,'Teacher')
     when p.role='institution' then coalesce(ip.name,p.full_name,'Institution')
     when p.role='parent' then coalesce(p.full_name,'Parent')
     else coalesce(p.full_name,'Student')
   end,
   p.role,
   coalesce(tp.profile_image_url,p.avatar_url)
 from public.profiles p
 left join public.teacher_profiles tp on tp.user_id=p.id
 left join public.institution_profiles ip on ip.user_id=p.id
 where p.id<>auth.uid()
   and p.role in('student','teacher','parent','institution')
   and not public.has_block_between(auth.uid(),p.id)
   and (p.role<>'institution' or ip.verification_status='approved')
   and (
     coalesce(btrim(p_query),'')=''
     or coalesce(tp.display_name,ip.name,p.full_name,'') ilike '%'||btrim(p_query)||'%'
   )
 order by
   case when coalesce(tp.display_name,ip.name,p.full_name,'') ilike btrim(p_query)||'%' then 0 else 1 end,
   coalesce(tp.display_name,ip.name,p.full_name,'')
 limit least(greatest(coalesce(p_limit,12),1),30);
$$;
grant execute on function public.search_mentionable_people(text,integer) to authenticated;

drop function if exists public.get_feed_posts(integer,integer);
create function public.get_feed_posts(p_limit integer default 50,p_offset integer default 0)
returns table(
 id uuid,author_id uuid,author_role text,author_name text,author_avatar_url text,
 post_type text,body text,created_at timestamptz,
 achievement_attempt_id uuid,achievement_exam_id uuid,achievement_exam_title text,
 achievement_cover_image_url text,achievement_score numeric,achievement_passing_score integer,
 feed_exam_id uuid,feed_exam_title text,feed_exam_category text,feed_exam_cover_image_url text,
 feed_exam_short_description text,image_url text,link_url text,document_url text,
 document_name text,document_size bigint,document_mime_type text,
 shared_post_id uuid,shared_author_id uuid,shared_author_role text,shared_author_name text,
 shared_body text,shared_image_url text,shared_link_url text,shared_document_url text,
 shared_document_name text,shared_post_type text,shared_created_at timestamptz
)
language sql stable security definer set search_path='public' as $$
 select
 fp.id,fp.author_id,p.role,
 case when p.role='teacher' then coalesce(tp.display_name,p.full_name,'Teacher')
      when p.role='institution' then coalesce(ip.name,p.full_name,'Institution')
      else coalesce(p.full_name,'Student') end,
 case when p.role='teacher' then coalesce(tp.profile_image_url,p.avatar_url) else p.avatar_url end,
 fp.post_type,fp.body,fp.created_at,fp.achievement_attempt_id,
 a.exam_id,ae.title,ae.cover_image_url,a.score_percent,ae.passing_score,
 fp.feed_exam_id,fe.title,fe.category,fe.cover_image_url,fe.short_description,
 fp.image_url,fp.link_url,fp.document_url,fp.document_name,fp.document_size,fp.document_mime_type,
 fp.shared_post_id,sp.author_id,sp_profile.role,
 case when sp_profile.role='teacher' then coalesce(sp_tp.display_name,sp_profile.full_name,'Teacher')
      when sp_profile.role='institution' then coalesce(sp_ip.name,sp_profile.full_name,'Institution')
      else coalesce(sp_profile.full_name,'Student') end,
 sp.body,sp.image_url,sp.link_url,sp.document_url,sp.document_name,sp.post_type,sp.created_at
 from public.feed_posts fp
 join public.profiles p on p.id=fp.author_id
 left join public.teacher_profiles tp on tp.user_id=fp.author_id
 left join public.institution_profiles ip on ip.user_id=fp.author_id
 left join public.exam_attempts a on a.id=fp.achievement_attempt_id
 left join public.exams ae on ae.id=a.exam_id
 left join public.exams fe on fe.id=fp.feed_exam_id
 left join public.feed_posts sp on sp.id=fp.shared_post_id and sp.moderation_status='active'
 left join public.profiles sp_profile on sp_profile.id=sp.author_id
 left join public.teacher_profiles sp_tp on sp_tp.user_id=sp.author_id
 left join public.institution_profiles sp_ip on sp_ip.user_id=sp.author_id
 where auth.uid() is not null and fp.moderation_status='active'
 order by fp.created_at desc
 limit least(greatest(coalesce(p_limit,50),1),100)
 offset greatest(coalesce(p_offset,0),0);
$$;
grant execute on function public.get_feed_posts(integer,integer) to authenticated;

-- Refresh notification RPC without changing its public shape.
drop function if exists public.get_my_notifications(integer);
create function public.get_my_notifications(p_limit integer default 50)
returns table(id uuid,notification_type text,post_id uuid,comment_id uuid,exam_attempt_id uuid,user_report_id uuid,actor_id uuid,actor_name text,actor_role text,exam_title text,exam_score numeric,exam_passing_score integer,read_at timestamptz,created_at timestamptz)
language sql stable security definer set search_path='public' as $$
 select n.id,n.notification_type,n.post_id,n.comment_id,n.exam_attempt_id,n.user_report_id,n.actor_id,
 case when p.role='teacher' then coalesce(tp.display_name,p.full_name,'Teacher')
      when p.role='institution' then coalesce(ip.name,p.full_name,'Institution')
      when p.role='admin' then coalesce(p.full_name,'Examify Admin')
      when p.role='parent' then coalesce(p.full_name,'Parent')
      else coalesce(p.full_name,'Student') end,
 p.role,e.title,a.score_percent,e.passing_score,n.read_at,n.created_at
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
grant execute on function public.get_my_notifications(integer) to authenticated;

notify pgrst,'reload schema';
