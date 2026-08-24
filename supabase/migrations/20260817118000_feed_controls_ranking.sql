-- Examify Update 53: controllable feed ranking and academic-source filters.

create table if not exists public.feed_preferences(
  user_id uuid primary key references public.profiles(id) on delete cascade,
  default_feed text not null default 'recommended'
    check(default_feed in('recommended','latest','connections','teachers','institutions','achievements')),
  updated_at timestamptz not null default now()
);

alter table public.feed_preferences enable row level security;

drop policy if exists "Users read own feed preferences" on public.feed_preferences;
create policy "Users read own feed preferences"
on public.feed_preferences for select to authenticated
using(user_id=auth.uid());

drop policy if exists "Users insert own feed preferences" on public.feed_preferences;
create policy "Users insert own feed preferences"
on public.feed_preferences for insert to authenticated
with check(user_id=auth.uid());

drop policy if exists "Users update own feed preferences" on public.feed_preferences;
create policy "Users update own feed preferences"
on public.feed_preferences for update to authenticated
using(user_id=auth.uid()) with check(user_id=auth.uid());

create or replace function public.get_my_feed_preference()
returns text
language sql stable security definer set search_path='public'
as $$
  select coalesce(
    (select default_feed from public.feed_preferences where user_id=auth.uid()),
    'recommended'
  );
$$;

grant execute on function public.get_my_feed_preference() to authenticated;

create or replace function public.set_my_feed_preference(p_feed text)
returns void
language plpgsql security definer set search_path='public'
as $$
begin
  if p_feed not in('recommended','latest','connections','teachers','institutions','achievements') then
    raise exception 'Invalid feed preference.';
  end if;

  insert into public.feed_preferences(user_id,default_feed,updated_at)
  values(auth.uid(),p_feed,now())
  on conflict(user_id) do update
  set default_feed=excluded.default_feed,updated_at=now();
end;
$$;

grant execute on function public.set_my_feed_preference(text) to authenticated;

create or replace function public.get_ranked_feed_posts(
  p_feed text default 'recommended',
  p_limit integer default 50,
  p_offset integer default 0
)
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
 shared_document_name text,shared_post_type text,shared_created_at timestamptz,
 audience text,edited_at timestamptz,is_pinned boolean,scheduled_at timestamptz
)
language sql
stable
security definer
set search_path='public'
as $$
 with visible as (
  select
   fp.id,fp.author_id,p.role as author_role,
   case when p.role='teacher' then coalesce(tp.display_name,p.full_name,'Teacher')
        when p.role='institution' then coalesce(ip.name,p.full_name,'Institution')
        else coalesce(p.full_name,'Student') end as author_name,
   case when p.role='teacher' then coalesce(tp.profile_image_url,p.avatar_url) else p.avatar_url end as author_avatar_url,
   fp.post_type,fp.body,fp.created_at,fp.achievement_attempt_id,
   a.exam_id as achievement_exam_id,ae.title as achievement_exam_title,
   ae.cover_image_url as achievement_cover_image_url,a.score_percent as achievement_score,
   ae.passing_score as achievement_passing_score,
   fp.feed_exam_id,fe.title as feed_exam_title,fe.category as feed_exam_category,
   fe.cover_image_url as feed_exam_cover_image_url,fe.short_description as feed_exam_short_description,
   fp.image_url,fp.link_url,fp.document_url,fp.document_name,fp.document_size,fp.document_mime_type,
   fp.shared_post_id,sp.author_id as shared_author_id,sp_profile.role as shared_author_role,
   case when sp_profile.role='teacher' then coalesce(sp_tp.display_name,sp_profile.full_name,'Teacher')
        when sp_profile.role='institution' then coalesce(sp_ip.name,sp_profile.full_name,'Institution')
        else coalesce(sp_profile.full_name,'Student') end as shared_author_name,
   sp.body as shared_body,sp.image_url as shared_image_url,sp.link_url as shared_link_url,
   sp.document_url as shared_document_url,sp.document_name as shared_document_name,
   sp.post_type as shared_post_type,sp.created_at as shared_created_at,
   fp.audience,fp.edited_at,fp.is_pinned,fp.scheduled_at,
   public.are_connected(auth.uid(),fp.author_id) as connected_author,
   exists(select 1 from public.teacher_followers tf where tf.teacher_id=fp.author_id and tf.student_id=auth.uid()) as follows_teacher,
   exists(select 1 from public.institution_followers inf where inf.institution_id=fp.author_id and inf.follower_id=auth.uid()) as follows_institution,
   (select count(*) from public.feed_post_reactions r where r.post_id=fp.id) as reaction_count,
   (select count(*) from public.feed_post_comments c where c.post_id=fp.id) as comment_count
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
  where auth.uid() is not null
   and fp.moderation_status='active'
   and not public.has_block_between(auth.uid(),fp.author_id)
   and (fp.author_id=auth.uid() or public.is_examify_admin() or coalesce(fp.scheduled_at,fp.created_at)<=now())
   and (
    fp.author_id=auth.uid() or public.is_examify_admin() or fp.audience='examify'
    or (fp.audience='connections' and public.are_connected(auth.uid(),fp.author_id))
   )
 ),
 filtered as (
  select v.*
  from visible v
  where
   coalesce(p_feed,'recommended') in('recommended','latest')
   or (p_feed='connections' and (v.connected_author or v.author_id=auth.uid()))
   or (p_feed='teachers' and v.author_role='teacher' and (v.follows_teacher or v.connected_author or v.author_id=auth.uid()))
   or (p_feed='institutions' and v.author_role='institution' and (v.follows_institution or v.author_id=auth.uid()))
   or (p_feed='achievements' and v.post_type='achievement')
 )
 select
  f.id,f.author_id,f.author_role,f.author_name,f.author_avatar_url,
  f.post_type,f.body,f.created_at,f.achievement_attempt_id,f.achievement_exam_id,
  f.achievement_exam_title,f.achievement_cover_image_url,f.achievement_score,
  f.achievement_passing_score,f.feed_exam_id,f.feed_exam_title,f.feed_exam_category,
  f.feed_exam_cover_image_url,f.feed_exam_short_description,f.image_url,f.link_url,
  f.document_url,f.document_name,f.document_size,f.document_mime_type,f.shared_post_id,
  f.shared_author_id,f.shared_author_role,f.shared_author_name,f.shared_body,f.shared_image_url,
  f.shared_link_url,f.shared_document_url,f.shared_document_name,f.shared_post_type,
  f.shared_created_at,f.audience,f.edited_at,f.is_pinned,f.scheduled_at
 from filtered f
 order by
  case when f.is_pinned and f.author_id=auth.uid() then 0 else 1 end,
  case
   when coalesce(p_feed,'recommended')='recommended' then
    (
     case when f.connected_author then 25 else 0 end
     + case when f.follows_teacher or f.follows_institution then 20 else 0 end
     + case when f.post_type='achievement' then 8 else 0 end
     + least(f.reaction_count,20)::integer
     + least(f.comment_count*2,20)::integer
     + case
        when f.created_at>=now()-interval '6 hours' then 30
        when f.created_at>=now()-interval '24 hours' then 20
        when f.created_at>=now()-interval '3 days' then 10
        else 0
       end
    )
   else 0
  end desc,
  f.created_at desc
 limit least(greatest(coalesce(p_limit,50),1),100)
 offset greatest(coalesce(p_offset,0),0);
$$;

grant execute on function public.get_ranked_feed_posts(text,integer,integer) to authenticated;

notify pgrst,'reload schema';
