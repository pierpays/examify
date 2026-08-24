-- Examify Update 54 (corrected): extend the existing Update 44 Groups / Classes system.
-- Does NOT recreate academic_groups, academic_group_members, or academic_group_posts.

alter table public.academic_groups
  add column if not exists category text not null default 'class'
    check(category in('class','subject','certification','study_group','career','institution','other')),
  add column if not exists is_discoverable boolean not null default false,
  add column if not exists rules text not null default ''
    check(char_length(rules)<=4000);

create index if not exists academic_groups_discoverable_idx
  on public.academic_groups(is_discoverable,is_archived,created_at desc);

create table if not exists public.academic_group_post_comments(
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.academic_group_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check(char_length(btrim(body)) between 1 and 1500),
  created_at timestamptz not null default now()
);

create index if not exists academic_group_post_comments_post_idx
  on public.academic_group_post_comments(post_id,created_at);

alter table public.academic_group_post_comments enable row level security;

-- Existing classes remain private by default. Discoverable communities can be viewed
-- by signed-in users, while membership still controls posting/documents/exams.
drop policy if exists "Members read groups" on public.academic_groups;
create policy "Members or discoverers read groups"
on public.academic_groups
for select
to authenticated
using(
  public.has_group_membership(id)
  or owner_id=auth.uid()
  or is_discoverable=true
  or public.is_examify_admin()
);


drop policy if exists "Members read group posts" on public.academic_group_posts;
create policy "Members or discoverers read group posts"
on public.academic_group_posts
for select
to authenticated
using(
  public.is_group_active_member(group_id,auth.uid())
  or exists(
    select 1
    from public.academic_groups g
    where g.id=group_id and g.is_discoverable=true
  )
  or public.is_examify_admin()
);

drop policy if exists "Users read group comments" on public.academic_group_post_comments;
create policy "Users read group comments"
on public.academic_group_post_comments
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

drop policy if exists "Active members create group comments" on public.academic_group_post_comments;
create policy "Active members create group comments"
on public.academic_group_post_comments
for insert
to authenticated
with check(
  author_id=auth.uid()
  and exists(
    select 1
    from public.academic_group_posts gp
    where gp.id=post_id
      and public.is_group_active_member(gp.group_id,auth.uid())
  )
);

drop policy if exists "Authors managers delete group comments" on public.academic_group_post_comments;
create policy "Authors managers delete group comments"
on public.academic_group_post_comments
for delete
to authenticated
using(
  author_id=auth.uid()
  or exists(
    select 1
    from public.academic_group_posts gp
    where gp.id=post_id
      and public.is_group_manager(gp.group_id,auth.uid())
  )
  or public.is_examify_admin()
);

-- Social academic communities can be created by students, teachers, parents,
-- and verified institutions. Existing class creation RPC remains unchanged.
create or replace function public.create_academic_community(
  p_name text,
  p_description text,
  p_category text,
  p_join_mode text default 'request',
  p_rules text default ''
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_id uuid;
  v_code text;
  v_role text;
  v_verified text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select role into v_role from public.profiles where id=auth.uid();

  if v_role not in('student','teacher','parent','institution') then
    raise exception 'This account cannot create academic communities.';
  end if;

  if v_role='institution' then
    select verification_status into v_verified
    from public.institution_profiles
    where user_id=auth.uid();

    if coalesce(v_verified,'')<>'approved' then
      raise exception 'Institution must be verified.';
    end if;
  end if;

  if p_category not in('subject','certification','study_group','career','institution','other') then
    raise exception 'Invalid community category.';
  end if;

  if p_join_mode not in('request','code','closed') then
    raise exception 'Invalid join mode.';
  end if;

  loop
    v_code:=upper(substr(md5(random()::text||clock_timestamp()::text),1,8));
    exit when not exists(
      select 1 from public.academic_groups where group_code=v_code
    );
  end loop;

  insert into public.academic_groups(
    owner_id,
    name,
    description,
    group_code,
    join_mode,
    category,
    is_discoverable,
    rules
  )
  values(
    auth.uid(),
    btrim(p_name),
    nullif(btrim(coalesce(p_description,'')),''),
    v_code,
    p_join_mode,
    p_category,
    true,
    btrim(coalesce(p_rules,''))
  )
  returning id into v_id;

  insert into public.academic_group_members(
    group_id,user_id,membership_role,status,responded_at
  )
  values(
    v_id,auth.uid(),'owner','active',now()
  );

  return v_id;
end;
$$;

grant execute on function public.create_academic_community(text,text,text,text,text)
to authenticated;

create or replace function public.join_discoverable_academic_group(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_group public.academic_groups%rowtype;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_group
  from public.academic_groups
  where id=p_group_id
    and is_discoverable=true
    and not is_archived;

  if v_group.id is null then
    raise exception 'Community not available.';
  end if;

  if v_group.owner_id=auth.uid() then
    return 'active';
  end if;

  if v_group.join_mode='closed' then
    raise exception 'This community is invitation only.';
  end if;

  v_status:=case when v_group.join_mode='code' then 'active' else 'requested' end;

  insert into public.academic_group_members(
    group_id,user_id,membership_role,status,responded_at
  )
  values(
    p_group_id,
    auth.uid(),
    'member',
    v_status,
    case when v_status='active' then now() else null end
  )
  on conflict(group_id,user_id)
  do update set
    status=excluded.status,
    responded_at=excluded.responded_at;

  return v_status;
end;
$$;

grant execute on function public.join_discoverable_academic_group(uuid)
to authenticated;

create or replace function public.leave_academic_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path='public'
as $$
begin
  if exists(
    select 1
    from public.academic_group_members
    where group_id=p_group_id
      and user_id=auth.uid()
      and membership_role='owner'
  ) then
    raise exception 'The group owner cannot leave the group.';
  end if;

  delete from public.academic_group_members
  where group_id=p_group_id
    and user_id=auth.uid();
end;
$$;

grant execute on function public.leave_academic_group(uuid)
to authenticated;

create or replace function public.get_academic_groups(
  p_scope text default 'discover',
  p_limit integer default 50
)
returns table(
  id uuid,
  name text,
  description text,
  group_code text,
  join_mode text,
  category text,
  is_discoverable boolean,
  owner_id uuid,
  owner_name text,
  member_count bigint,
  membership_status text,
  membership_role text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    g.id,
    g.name,
    g.description,
    g.group_code,
    g.join_mode,
    g.category,
    g.is_discoverable,
    g.owner_id,
    coalesce(
      case when p.role='teacher' then tp.display_name
           when p.role='institution' then ip.name
           else p.full_name end,
      'Examify user'
    ),
    (
      select count(*)
      from public.academic_group_members gm
      where gm.group_id=g.id and gm.status='active'
    ),
    coalesce(m.status,'none'),
    coalesce(m.membership_role,'none'),
    g.created_at
  from public.academic_groups g
  join public.profiles p on p.id=g.owner_id
  left join public.teacher_profiles tp on tp.user_id=g.owner_id
  left join public.institution_profiles ip on ip.user_id=g.owner_id
  left join public.academic_group_members m
    on m.group_id=g.id and m.user_id=auth.uid()
  where not g.is_archived
    and (
      (p_scope='mine' and m.status='active')
      or
      (
        p_scope='discover'
        and g.is_discoverable=true
      )
    )
  order by
    case when m.status='active' then 0
         when m.status in('requested','invited') then 1
         else 2 end,
    (
      select count(*)
      from public.academic_group_members gm
      where gm.group_id=g.id and gm.status='active'
    ) desc,
    g.created_at desc
  limit least(greatest(coalesce(p_limit,50),1),100);
$$;

grant execute on function public.get_academic_groups(text,integer)
to authenticated;

create or replace function public.get_group_post_comments(
  p_post_id uuid,
  p_limit integer default 100
)
returns table(
  id uuid,
  author_id uuid,
  author_name text,
  author_role text,
  author_avatar_url text,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    c.id,
    c.author_id,
    case when p.role='teacher' then coalesce(tp.display_name,p.full_name,'Teacher')
         when p.role='institution' then coalesce(ip.name,p.full_name,'Institution')
         else coalesce(p.full_name,initcap(p.role)) end,
    p.role,
    case when p.role='teacher' then coalesce(tp.profile_image_url,p.avatar_url)
         else p.avatar_url end,
    c.body,
    c.created_at
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

notify pgrst,'reload schema';
