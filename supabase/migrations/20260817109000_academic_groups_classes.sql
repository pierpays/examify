-- Examify Update 44: academic Groups / Classes.
-- Teachers and verified institutions can create groups.
-- Students join by code, request membership, or accept an invitation.

create table if not exists public.academic_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  group_code text not null unique,
  join_mode text not null default 'request'
    check (join_mode in ('request','code','closed')),
  cover_image_url text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_groups_name_length check (char_length(btrim(name)) between 2 and 120),
  constraint academic_groups_description_length check (description is null or char_length(description) <= 2000)
);

create table if not exists public.academic_group_members (
  group_id uuid not null references public.academic_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  membership_role text not null default 'member'
    check (membership_role in ('owner','moderator','member')),
  status text not null default 'active'
    check (status in ('active','requested','invited')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (group_id,user_id)
);

create table if not exists public.academic_group_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.academic_groups(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  post_type text not null default 'discussion'
    check (post_type in ('discussion','announcement')),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_group_post_body check (char_length(btrim(body)) between 1 and 4000)
);

create table if not exists public.academic_group_documents (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.academic_groups(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  file_name text not null,
  file_url text not null,
  file_size bigint,
  created_at timestamptz not null default now(),
  constraint academic_group_document_title check (char_length(btrim(title)) between 1 and 180)
);

create table if not exists public.academic_group_exams (
  group_id uuid not null references public.academic_groups(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  shared_by uuid not null references public.profiles(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  primary key (group_id,exam_id)
);

create index if not exists academic_groups_owner_idx on public.academic_groups(owner_id,created_at desc);
create index if not exists academic_group_members_user_idx on public.academic_group_members(user_id,status);
create index if not exists academic_group_posts_group_idx on public.academic_group_posts(group_id,created_at desc);
create index if not exists academic_group_documents_group_idx on public.academic_group_documents(group_id,created_at desc);

alter table public.academic_groups enable row level security;
alter table public.academic_group_members enable row level security;
alter table public.academic_group_posts enable row level security;
alter table public.academic_group_documents enable row level security;
alter table public.academic_group_exams enable row level security;

create or replace function public.is_group_active_member(p_group_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='public' as $$
  select exists(
    select 1 from public.academic_group_members
    where group_id=p_group_id and user_id=p_user_id and status='active'
  );
$$;

create or replace function public.is_group_manager(p_group_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='public' as $$
  select exists(
    select 1 from public.academic_group_members
    where group_id=p_group_id and user_id=p_user_id
      and status='active' and membership_role in ('owner','moderator')
  );
$$;

grant execute on function public.is_group_active_member(uuid,uuid) to authenticated;
grant execute on function public.is_group_manager(uuid,uuid) to authenticated;

create or replace function public.has_group_membership(p_group_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='public' as $$
  select exists(
    select 1 from public.academic_group_members
    where group_id=p_group_id and user_id=p_user_id
  );
$$;
grant execute on function public.has_group_membership(uuid,uuid) to authenticated;

drop policy if exists "Members read groups" on public.academic_groups;
create policy "Members read groups" on public.academic_groups for select to authenticated
using (
  public.has_group_membership(id)
  or owner_id=auth.uid()
  or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
);

drop policy if exists "Creators insert groups" on public.academic_groups;
create policy "Creators insert groups" on public.academic_groups for insert to authenticated
with check (
  owner_id=auth.uid()
  and exists(
    select 1 from public.profiles p
    left join public.institution_profiles ip on ip.user_id=p.id
    where p.id=auth.uid()
      and (
        p.role='teacher'
        or (p.role='institution' and ip.verification_status='approved')
      )
  )
);

drop policy if exists "Managers update groups" on public.academic_groups;
create policy "Managers update groups" on public.academic_groups for update to authenticated
using (public.is_group_manager(id)) with check (public.is_group_manager(id));

drop policy if exists "Owner deletes groups" on public.academic_groups;
create policy "Owner deletes groups" on public.academic_groups for delete to authenticated
using (owner_id=auth.uid());

drop policy if exists "Relevant users read memberships" on public.academic_group_members;
create policy "Relevant users read memberships" on public.academic_group_members for select to authenticated
using (
  user_id=auth.uid()
  or public.is_group_active_member(group_id)
  or public.is_group_manager(group_id)
);

drop policy if exists "Members read group posts" on public.academic_group_posts;
create policy "Members read group posts" on public.academic_group_posts for select to authenticated
using (public.is_group_active_member(group_id));

drop policy if exists "Active members create group posts" on public.academic_group_posts;
create policy "Active members create group posts" on public.academic_group_posts for insert to authenticated
with check (
  author_id=auth.uid()
  and public.is_group_active_member(group_id)
  and (
    post_type='discussion'
    or (post_type='announcement' and public.is_group_manager(group_id))
  )
);

drop policy if exists "Authors or managers delete group posts" on public.academic_group_posts;
create policy "Authors or managers delete group posts" on public.academic_group_posts for delete to authenticated
using (author_id=auth.uid() or public.is_group_manager(group_id));

drop policy if exists "Members read group documents" on public.academic_group_documents;
create policy "Members read group documents" on public.academic_group_documents for select to authenticated
using (public.is_group_active_member(group_id));

drop policy if exists "Managers upload group documents" on public.academic_group_documents;
create policy "Managers upload group documents" on public.academic_group_documents for insert to authenticated
with check (uploaded_by=auth.uid() and public.is_group_manager(group_id));

drop policy if exists "Managers delete group documents" on public.academic_group_documents;
create policy "Managers delete group documents" on public.academic_group_documents for delete to authenticated
using (public.is_group_manager(group_id));

drop policy if exists "Members read group exams" on public.academic_group_exams;
create policy "Members read group exams" on public.academic_group_exams for select to authenticated
using (public.is_group_active_member(group_id));

drop policy if exists "Managers share group exams" on public.academic_group_exams;
create policy "Managers share group exams" on public.academic_group_exams for insert to authenticated
with check (shared_by=auth.uid() and public.is_group_manager(group_id));

drop policy if exists "Managers remove group exams" on public.academic_group_exams;
create policy "Managers remove group exams" on public.academic_group_exams for delete to authenticated
using (public.is_group_manager(group_id));

insert into storage.buckets(id,name,public,file_size_limit)
values('group-documents','group-documents',false,26214400)
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;

drop policy if exists "Group managers upload documents" on storage.objects;
create policy "Group managers upload documents" on storage.objects for insert to authenticated
with check (
  bucket_id='group-documents'
  and public.is_group_manager(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "Group members download documents" on storage.objects;
create policy "Group members download documents" on storage.objects for select to authenticated
using (
  bucket_id='group-documents'
  and public.is_group_active_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "Group managers delete document files" on storage.objects;
create policy "Group managers delete document files" on storage.objects for delete to authenticated
using (
  bucket_id='group-documents'
  and public.is_group_manager(((storage.foldername(name))[1])::uuid)
);

create or replace function public.create_academic_group(
  p_name text,p_description text default null,p_join_mode text default 'request'
)
returns uuid language plpgsql security definer set search_path='public' as $$
declare v_id uuid; v_code text; v_role text; v_verified text;
begin
  select role into v_role from public.profiles where id=auth.uid();
  if v_role not in ('teacher','institution') then
    raise exception 'Only teachers and institutions can create groups.';
  end if;
  if v_role='institution' then
    select verification_status into v_verified from public.institution_profiles where user_id=auth.uid();
    if coalesce(v_verified,'')<>'approved' then raise exception 'Institution must be verified.'; end if;
  end if;
  if p_join_mode not in ('request','code','closed') then raise exception 'Invalid join mode.'; end if;

  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text),1,8));
    exit when not exists(select 1 from public.academic_groups where group_code=v_code);
  end loop;

  insert into public.academic_groups(owner_id,name,description,group_code,join_mode)
  values(auth.uid(),btrim(p_name),nullif(btrim(p_description),''),v_code,p_join_mode)
  returning id into v_id;

  insert into public.academic_group_members(group_id,user_id,membership_role,status,responded_at)
  values(v_id,auth.uid(),'owner','active',now());

  return v_id;
end $$;
grant execute on function public.create_academic_group(text,text,text) to authenticated;

create or replace function public.join_group_by_code(p_code text)
returns uuid language plpgsql security definer set search_path='public' as $$
declare v_group public.academic_groups%rowtype; v_role text;
begin
  select * into v_group from public.academic_groups
  where upper(group_code)=upper(btrim(p_code)) and not is_archived;
  if v_group.id is null then raise exception 'Group code not found.'; end if;

  select role into v_role from public.profiles where id=auth.uid();
  if v_role<>'student' then raise exception 'Only students can join classes by code.'; end if;
  if v_group.join_mode='closed' then raise exception 'This group is invitation only.'; end if;

  insert into public.academic_group_members(group_id,user_id,membership_role,status,responded_at)
  values(
    v_group.id,auth.uid(),'member',
    case when v_group.join_mode='code' then 'active' else 'requested' end,
    case when v_group.join_mode='code' then now() else null end
  )
  on conflict(group_id,user_id) do update
    set status=excluded.status, responded_at=excluded.responded_at;

  return v_group.id;
end $$;
grant execute on function public.join_group_by_code(text) to authenticated;

create or replace function public.respond_group_membership(
  p_group_id uuid,p_user_id uuid,p_action text
)
returns void language plpgsql security definer set search_path='public' as $$
begin
  if p_user_id=auth.uid() and p_action='accept_invite' then
    update public.academic_group_members
      set status='active',responded_at=now()
      where group_id=p_group_id and user_id=auth.uid() and status='invited';
    return;
  end if;

  if not public.is_group_manager(p_group_id) then raise exception 'Not authorized.'; end if;

  if p_action='approve' then
    update public.academic_group_members set status='active',responded_at=now()
      where group_id=p_group_id and user_id=p_user_id and status='requested';
  elsif p_action in ('decline','remove') then
    delete from public.academic_group_members
      where group_id=p_group_id and user_id=p_user_id and membership_role<>'owner';
  else raise exception 'Invalid action.';
  end if;
end $$;
grant execute on function public.respond_group_membership(uuid,uuid,text) to authenticated;

create or replace function public.invite_student_to_group(p_group_id uuid,p_student_id uuid)
returns void language plpgsql security definer set search_path='public' as $$
begin
  if not public.is_group_manager(p_group_id) then raise exception 'Not authorized.'; end if;
  if not exists(select 1 from public.profiles where id=p_student_id and role='student') then
    raise exception 'Only student accounts can be invited.';
  end if;
  insert into public.academic_group_members(group_id,user_id,membership_role,status,invited_by)
  values(p_group_id,p_student_id,'member','invited',auth.uid())
  on conflict(group_id,user_id) do update set status='invited',invited_by=auth.uid(),responded_at=null;
end $$;
grant execute on function public.invite_student_to_group(uuid,uuid) to authenticated;

create or replace function public.search_students_for_group(p_group_id uuid,p_query text default '')
returns table(user_id uuid,display_name text,avatar_url text,membership_status text)
language sql stable security definer set search_path='public' as $$
 select p.id,coalesce(p.full_name,'Student'),p.avatar_url,m.status
 from public.profiles p
 left join public.academic_group_members m on m.group_id=p_group_id and m.user_id=p.id
 where public.is_group_manager(p_group_id)
   and p.role='student'
   and (coalesce(btrim(p_query),'')='' or coalesce(p.full_name,'') ilike '%'||btrim(p_query)||'%')
 order by p.full_name nulls last
 limit 30;
$$;
grant execute on function public.search_students_for_group(uuid,text) to authenticated;

notify pgrst,'reload schema';
