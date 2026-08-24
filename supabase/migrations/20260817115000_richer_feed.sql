-- Examify Update 50: richer academic feed.
-- Adds multiple images, polls, edited indicators, pinning, and scheduled posts.

alter table public.feed_posts
  add column if not exists edited_at timestamptz,
  add column if not exists is_pinned boolean not null default false,
  add column if not exists scheduled_at timestamptz;

create index if not exists feed_posts_schedule_idx
  on public.feed_posts(scheduled_at)
  where scheduled_at is not null;

create index if not exists feed_posts_pinned_idx
  on public.feed_posts(is_pinned,created_at desc);

create table if not exists public.feed_post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  image_url text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(post_id,display_order)
);

create index if not exists feed_post_images_post_idx
  on public.feed_post_images(post_id,display_order);

alter table public.feed_post_images enable row level security;

drop policy if exists "Users read visible feed post images" on public.feed_post_images;
create policy "Users read visible feed post images"
on public.feed_post_images for select to authenticated
using (
  exists(
    select 1
    from public.feed_posts fp
    where fp.id=post_id
      and fp.moderation_status='active'
      and (
        fp.author_id=auth.uid()
        or public.is_examify_admin()
        or (
          coalesce(fp.scheduled_at,fp.created_at)<=now()
          and (
            fp.audience='examify'
            or (
              fp.audience='connections'
              and public.are_connected(auth.uid(),fp.author_id)
            )
          )
        )
      )
  )
);

drop policy if exists "Authors add images to own posts" on public.feed_post_images;
create policy "Authors add images to own posts"
on public.feed_post_images for insert to authenticated
with check (
  exists(
    select 1 from public.feed_posts fp
    where fp.id=post_id and fp.author_id=auth.uid()
  )
);

drop policy if exists "Authors delete images from own posts" on public.feed_post_images;
create policy "Authors delete images from own posts"
on public.feed_post_images for delete to authenticated
using (
  exists(
    select 1 from public.feed_posts fp
    where fp.id=post_id and fp.author_id=auth.uid()
  )
);

create table if not exists public.feed_polls (
  post_id uuid primary key references public.feed_posts(id) on delete cascade,
  question text not null,
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  constraint feed_poll_question_length
    check(char_length(btrim(question)) between 3 and 300)
);

create table if not exists public.feed_poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_polls(post_id) on delete cascade,
  option_text text not null,
  display_order integer not null,
  created_at timestamptz not null default now(),
  unique(post_id,display_order),
  constraint feed_poll_option_length
    check(char_length(btrim(option_text)) between 1 and 160)
);

create table if not exists public.feed_poll_votes (
  post_id uuid not null references public.feed_polls(post_id) on delete cascade,
  option_id uuid not null references public.feed_poll_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(post_id,user_id)
);

create index if not exists feed_poll_votes_option_idx
  on public.feed_poll_votes(option_id);

alter table public.feed_polls enable row level security;
alter table public.feed_poll_options enable row level security;
alter table public.feed_poll_votes enable row level security;

drop policy if exists "Users read visible feed polls" on public.feed_polls;
create policy "Users read visible feed polls"
on public.feed_polls for select to authenticated
using (
  exists(
    select 1 from public.feed_posts fp
    where fp.id=post_id
      and fp.moderation_status='active'
      and (
        fp.author_id=auth.uid()
        or public.is_examify_admin()
        or (
          coalesce(fp.scheduled_at,fp.created_at)<=now()
          and (
            fp.audience='examify'
            or (
              fp.audience='connections'
              and public.are_connected(auth.uid(),fp.author_id)
            )
          )
        )
      )
  )
);

drop policy if exists "Users read visible poll options" on public.feed_poll_options;
create policy "Users read visible poll options"
on public.feed_poll_options for select to authenticated
using (
  exists(select 1 from public.feed_polls p where p.post_id=feed_poll_options.post_id)
);

drop policy if exists "Users read visible poll votes" on public.feed_poll_votes;
create policy "Users read visible poll votes"
on public.feed_poll_votes for select to authenticated
using (
  exists(select 1 from public.feed_polls p where p.post_id=feed_poll_votes.post_id)
);

create or replace function public.create_feed_poll(
  p_post_id uuid,
  p_question text,
  p_options text[],
  p_closes_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_author uuid;
  v_role text;
  v_option text;
  v_order integer:=0;
begin
  select fp.author_id,p.role
  into v_author,v_role
  from public.feed_posts fp
  join public.profiles p on p.id=fp.author_id
  where fp.id=p_post_id;

  if v_author<>auth.uid() then
    raise exception 'You can only add a poll to your own post.';
  end if;

  if v_role not in ('teacher','institution') then
    raise exception 'Polls can be created by teachers and institutions.';
  end if;

  if array_length(p_options,1) is null or array_length(p_options,1)<2
     or array_length(p_options,1)>6 then
    raise exception 'A poll must contain between 2 and 6 options.';
  end if;

  insert into public.feed_polls(post_id,question,closes_at)
  values(p_post_id,btrim(p_question),p_closes_at);

  foreach v_option in array p_options loop
    if char_length(btrim(v_option))<1 then
      raise exception 'Poll options cannot be empty.';
    end if;

    insert into public.feed_poll_options(
      post_id,option_text,display_order
    )
    values(
      p_post_id,btrim(v_option),v_order
    );

    v_order:=v_order+1;
  end loop;
end;
$$;

grant execute on function public.create_feed_poll(uuid,text,text[],timestamptz)
to authenticated;

create or replace function public.vote_feed_poll(
  p_post_id uuid,
  p_option_id uuid
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_closes_at timestamptz;
begin
  select closes_at into v_closes_at
  from public.feed_polls
  where post_id=p_post_id;

  if not found then
    raise exception 'Poll not found.';
  end if;

  if v_closes_at is not null and v_closes_at<=now() then
    raise exception 'This poll is closed.';
  end if;

  if not exists(
    select 1 from public.feed_poll_options
    where id=p_option_id and post_id=p_post_id
  ) then
    raise exception 'Poll option not found.';
  end if;

  insert into public.feed_poll_votes(post_id,option_id,user_id)
  values(p_post_id,p_option_id,auth.uid())
  on conflict(post_id,user_id)
  do update set option_id=excluded.option_id,created_at=now();
end;
$$;

grant execute on function public.vote_feed_poll(uuid,uuid) to authenticated;

create or replace function public.get_feed_poll_details(p_post_ids uuid[])
returns table(
  post_id uuid,
  question text,
  closes_at timestamptz,
  option_id uuid,
  option_text text,
  display_order integer,
  vote_count bigint,
  viewer_voted boolean
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    p.post_id,
    p.question,
    p.closes_at,
    o.id,
    o.option_text,
    o.display_order,
    count(v.user_id),
    bool_or(v.user_id=auth.uid())
  from public.feed_polls p
  join public.feed_poll_options o on o.post_id=p.post_id
  left join public.feed_poll_votes v on v.option_id=o.id
  where p.post_id=any(p_post_ids)
  group by
    p.post_id,p.question,p.closes_at,
    o.id,o.option_text,o.display_order
  order by p.post_id,o.display_order;
$$;

grant execute on function public.get_feed_poll_details(uuid[]) to authenticated;

create or replace function public.edit_feed_post(
  p_post_id uuid,
  p_body text,
  p_audience text
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
begin
  if p_audience not in ('examify','connections') then
    raise exception 'Invalid audience.';
  end if;

  update public.feed_posts
  set
    body=nullif(btrim(p_body),''),
    audience=p_audience,
    edited_at=now()
  where id=p_post_id
    and author_id=auth.uid()
    and post_type='post';

  if not found then
    raise exception 'Post not found or cannot be edited.';
  end if;
end;
$$;

grant execute on function public.edit_feed_post(uuid,text,text) to authenticated;

create or replace function public.toggle_feed_post_pin(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_value boolean;
begin
  update public.feed_posts
  set is_pinned=not is_pinned
  where id=p_post_id
    and (
      author_id=auth.uid()
      or public.is_examify_admin()
    )
  returning is_pinned into v_value;

  if v_value is null then
    raise exception 'Post not found or not authorized.';
  end if;

  return v_value;
end;
$$;

grant execute on function public.toggle_feed_post_pin(uuid) to authenticated;

create or replace function public.schedule_feed_post(
  p_post_id uuid,
  p_scheduled_at timestamptz
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_role text;
begin
  select p.role into v_role
  from public.feed_posts fp
  join public.profiles p on p.id=fp.author_id
  where fp.id=p_post_id
    and fp.author_id=auth.uid();

  if v_role not in ('teacher','institution') then
    raise exception 'Scheduled posts are available to teachers and institutions.';
  end if;

  if p_scheduled_at<=now() then
    raise exception 'Scheduled time must be in the future.';
  end if;

  update public.feed_posts
  set scheduled_at=p_scheduled_at
  where id=p_post_id and author_id=auth.uid();
end;
$$;

grant execute on function public.schedule_feed_post(uuid,timestamptz) to authenticated;

-- Refresh feed RPC with richer-feed metadata and scheduling rules.
drop function if exists public.get_feed_posts(integer,integer);

create function public.get_feed_posts(
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
 sp.body,sp.image_url,sp.link_url,sp.document_url,sp.document_name,sp.post_type,sp.created_at,
 fp.audience,fp.edited_at,fp.is_pinned,fp.scheduled_at
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
   and (
     fp.author_id=auth.uid()
     or public.is_examify_admin()
     or coalesce(fp.scheduled_at,fp.created_at)<=now()
   )
   and (
     fp.author_id=auth.uid()
     or public.is_examify_admin()
     or fp.audience='examify'
     or (
       fp.audience='connections'
       and public.are_connected(auth.uid(),fp.author_id)
     )
   )
 order by
   case when fp.is_pinned then 0 else 1 end,
   fp.created_at desc
 limit least(greatest(coalesce(p_limit,50),1),100)
 offset greatest(coalesce(p_offset,0),0);
$$;

grant execute on function public.get_feed_posts(integer,integer) to authenticated;


-- Enforce audience and scheduling at the table RLS layer too, so direct table
-- reads cannot bypass the Feed RPC.
drop policy if exists "Authenticated users can read feed posts" on public.feed_posts;
create policy "Authenticated users can read visible feed posts"
on public.feed_posts
for select
to authenticated
using (
  moderation_status='active'
  and not public.has_block_between(auth.uid(),author_id)
  and (
    author_id=auth.uid()
    or public.is_examify_admin()
    or (
      coalesce(scheduled_at,created_at)<=now()
      and (
        audience='examify'
        or (
          audience='connections'
          and public.are_connected(auth.uid(),author_id)
        )
      )
    )
  )
);

-- Profile timelines also respect scheduled publication time.
drop function if exists public.get_profile_feed_posts(uuid,integer);

create function public.get_profile_feed_posts(
  p_author_id uuid,
  p_limit integer default 50
)
returns table(
  id uuid,
  author_id uuid,
  post_type text,
  body text,
  created_at timestamptz,
  feed_exam_id uuid,
  feed_exam_title text,
  feed_exam_category text,
  feed_exam_cover_image_url text,
  feed_exam_short_description text,
  image_url text,
  link_url text,
  document_url text,
  document_name text,
  document_size bigint,
  document_mime_type text
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    fp.id,
    fp.author_id,
    fp.post_type,
    fp.body,
    fp.created_at,
    fp.feed_exam_id,
    e.title,
    e.category,
    e.cover_image_url,
    e.short_description,
    fp.image_url,
    fp.link_url,
    fp.document_url,
    fp.document_name,
    fp.document_size,
    fp.document_mime_type
  from public.feed_posts fp
  join public.profiles p on p.id=fp.author_id
  left join public.exams e on e.id=fp.feed_exam_id
  left join public.teacher_profiles tp
    on tp.user_id=fp.author_id and p.role='teacher'
  left join public.institution_profiles ip
    on ip.user_id=fp.author_id and p.role='institution'
  where fp.author_id=p_author_id
    and fp.moderation_status='active'
    and public.can_view_profile(p_author_id,auth.uid())
    and not public.has_block_between(auth.uid(),p_author_id)
    and (
      fp.author_id=auth.uid()
      or public.is_examify_admin()
      or coalesce(fp.scheduled_at,fp.created_at)<=now()
    )
    and (
      fp.author_id=auth.uid()
      or public.is_examify_admin()
      or fp.audience='examify'
      or (
        fp.audience='connections'
        and public.are_connected(auth.uid(),fp.author_id)
      )
    )
    and (
      p.role in('student','parent')
      or (p.role='teacher' and tp.is_public=true)
      or (
        p.role='institution'
        and ip.is_public=true
        and ip.verification_status='approved'
      )
    )
  order by
    case when fp.is_pinned then 0 else 1 end,
    fp.created_at desc
  limit least(greatest(coalesce(p_limit,50),1),100);
$$;

revoke all on function public.get_profile_feed_posts(uuid,integer) from public;
grant execute on function public.get_profile_feed_posts(uuid,integer)
to authenticated;

notify pgrst,'reload schema';
