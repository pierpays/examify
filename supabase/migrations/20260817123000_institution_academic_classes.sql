-- Examify Update 58: Institution-owned academic years, classes, teacher assignments and rosters.

create table if not exists public.institution_academic_years(
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check(char_length(btrim(name)) between 2 and 40),
  starts_on date,
  ends_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(institution_id,name),
  check(starts_on is null or ends_on is null or starts_on<=ends_on)
);

alter table public.academic_groups
  add column if not exists institution_id uuid references public.profiles(id) on delete cascade,
  add column if not exists academic_year_id uuid references public.institution_academic_years(id) on delete restrict,
  add column if not exists group_kind text not null default 'community'
    check(group_kind in('community','institution_class'));

create table if not exists public.academic_group_teachers(
  group_id uuid not null references public.academic_groups(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(group_id,teacher_id)
);

create index if not exists institution_academic_years_institution_idx
  on public.institution_academic_years(institution_id,is_active,created_at desc);
create index if not exists academic_groups_institution_year_idx
  on public.academic_groups(institution_id,academic_year_id,is_archived);
create index if not exists academic_group_teachers_teacher_idx
  on public.academic_group_teachers(teacher_id,group_id);

alter table public.institution_academic_years enable row level security;
alter table public.academic_group_teachers enable row level security;

create or replace function public.is_group_assigned_teacher(
  p_group_id uuid,p_user_id uuid default auth.uid()
)
returns boolean language sql stable security definer set search_path='public' as $$
  select exists(
    select 1 from public.academic_group_teachers
    where group_id=p_group_id and teacher_id=p_user_id
  );
$$;
grant execute on function public.is_group_assigned_teacher(uuid,uuid) to authenticated;

drop policy if exists "Relevant users read academic years" on public.institution_academic_years;
create policy "Relevant users read academic years"
on public.institution_academic_years for select to authenticated
using(
  institution_id=auth.uid()
  or public.is_examify_admin()
  or exists(
    select 1 from public.institution_relationships ir
    where ir.institution_id=public.institution_academic_years.institution_id
      and ir.member_id=auth.uid()
      and ir.status='accepted'
  )
);

drop policy if exists "Institution manages academic years" on public.institution_academic_years;
create policy "Institution manages academic years"
on public.institution_academic_years for all to authenticated
using(institution_id=auth.uid())
with check(institution_id=auth.uid());

drop policy if exists "Relevant users read class teachers" on public.academic_group_teachers;
create policy "Relevant users read class teachers"
on public.academic_group_teachers for select to authenticated
using(
  teacher_id=auth.uid()
  or public.is_group_active_member(group_id)
  or exists(
    select 1 from public.academic_groups g
    where g.id=group_id and g.institution_id=auth.uid()
  )
  or public.is_examify_admin()
);

create or replace function public.create_institution_academic_year(
  p_name text,p_starts_on date default null,p_ends_on date default null
)
returns uuid language plpgsql security definer set search_path='public' as $$
declare v_id uuid;
begin
  if not exists(
    select 1 from public.profiles p
    join public.institution_profiles ip on ip.user_id=p.id
    where p.id=auth.uid() and p.role='institution'
      and ip.verification_status='approved'
  ) then raise exception 'Only an approved institution can create academic years.'; end if;

  insert into public.institution_academic_years(institution_id,name,starts_on,ends_on)
  values(auth.uid(),btrim(p_name),p_starts_on,p_ends_on)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.create_institution_academic_year(text,date,date) to authenticated;

create or replace function public.create_institution_class(
  p_year_id uuid,p_name text,p_description text default null
)
returns uuid language plpgsql security definer set search_path='public' as $$
declare v_id uuid;v_code text;
begin
  if not exists(
    select 1 from public.institution_academic_years y
    where y.id=p_year_id and y.institution_id=auth.uid()
  ) then raise exception 'Academic year does not belong to this institution.'; end if;

  loop
    v_code:=upper(substr(md5(random()::text||clock_timestamp()::text),1,8));
    exit when not exists(select 1 from public.academic_groups where group_code=v_code);
  end loop;

  insert into public.academic_groups(
    owner_id,name,description,group_code,join_mode,
    institution_id,academic_year_id,group_kind
  ) values(
    auth.uid(),btrim(p_name),nullif(btrim(coalesce(p_description,'')),''),
    v_code,'closed',auth.uid(),p_year_id,'institution_class'
  ) returning id into v_id;

  insert into public.academic_group_members(group_id,user_id,membership_role,status,responded_at)
  values(v_id,auth.uid(),'owner','active',now())
  on conflict(group_id,user_id) do update set status='active',membership_role='owner';

  return v_id;
end $$;
grant execute on function public.create_institution_class(uuid,text,text) to authenticated;

create or replace function public.assign_teacher_to_institution_class(
  p_group_id uuid,p_teacher_id uuid
)
returns void language plpgsql security definer set search_path='public' as $$
declare v_institution uuid;
begin
  select institution_id into v_institution from public.academic_groups
  where id=p_group_id and group_kind='institution_class' and not is_archived;

  if v_institution is null or v_institution<>auth.uid() then
    raise exception 'Only the institution can assign teachers to this class.';
  end if;

  if not exists(
    select 1 from public.institution_relationships ir
    where ir.institution_id=v_institution
      and ir.member_id=p_teacher_id
      and ir.relationship_type='teacher'
      and ir.status='accepted'
  ) then raise exception 'Teacher must be registered with this institution.'; end if;

  insert into public.academic_group_teachers(group_id,teacher_id,assigned_by)
  values(p_group_id,p_teacher_id,auth.uid())
  on conflict(group_id,teacher_id) do nothing;

  insert into public.academic_group_members(group_id,user_id,membership_role,status,invited_by,responded_at)
  values(p_group_id,p_teacher_id,'moderator','active',auth.uid(),now())
  on conflict(group_id,user_id) do update
    set membership_role='moderator',status='active',responded_at=now();
end $$;
grant execute on function public.assign_teacher_to_institution_class(uuid,uuid) to authenticated;

create or replace function public.remove_teacher_from_institution_class(
  p_group_id uuid,p_teacher_id uuid
)
returns void language plpgsql security definer set search_path='public' as $$
begin
  if not exists(
    select 1 from public.academic_groups
    where id=p_group_id and institution_id=auth.uid()
      and group_kind='institution_class'
  ) then raise exception 'Only the institution can remove assigned teachers.'; end if;

  delete from public.academic_group_teachers
  where group_id=p_group_id and teacher_id=p_teacher_id;
  delete from public.academic_group_members
  where group_id=p_group_id and user_id=p_teacher_id and membership_role='moderator';
end $$;
grant execute on function public.remove_teacher_from_institution_class(uuid,uuid) to authenticated;

create or replace function public.search_institution_teachers(
  p_query text default '',p_limit integer default 50
)
returns table(user_id uuid,display_name text,avatar_url text)
language sql stable security definer set search_path='public' as $$
  select p.id,coalesce(tp.display_name,p.full_name,'Teacher'),
         coalesce(tp.profile_image_url,p.avatar_url)
  from public.institution_relationships ir
  join public.profiles p on p.id=ir.member_id and p.role='teacher'
  left join public.teacher_profiles tp on tp.user_id=p.id
  where ir.institution_id=auth.uid()
    and ir.relationship_type='teacher'
    and ir.status='accepted'
    and (
      coalesce(btrim(p_query),'')=''
      or coalesce(tp.display_name,p.full_name,'') ilike '%'||btrim(p_query)||'%'
    )
  order by 2
  limit least(greatest(coalesce(p_limit,50),1),100);
$$;
grant execute on function public.search_institution_teachers(text,integer) to authenticated;

create or replace function public.search_students_for_assigned_class(
  p_group_id uuid,p_query text default '',p_limit integer default 50
)
returns table(user_id uuid,display_name text,avatar_url text,membership_status text)
language plpgsql stable security definer set search_path='public' as $$
declare v_institution uuid;
begin
  select institution_id into v_institution from public.academic_groups
  where id=p_group_id and group_kind='institution_class' and not is_archived;

  if v_institution is null then raise exception 'Class not found.'; end if;
  if auth.uid()<>v_institution
     and not public.is_group_assigned_teacher(p_group_id,auth.uid())
     and not public.is_examify_admin()
  then raise exception 'You are not authorized to manage this class roster.'; end if;

  return query
  select p.id,coalesce(p.full_name,'Student'),p.avatar_url,agm.status
  from public.institution_relationships ir
  join public.profiles p on p.id=ir.member_id and p.role='student'
  left join public.academic_group_members agm
    on agm.group_id=p_group_id and agm.user_id=p.id
  where ir.institution_id=v_institution
    and ir.relationship_type='student'
    and ir.status='accepted'
    and (
      coalesce(btrim(p_query),'')=''
      or coalesce(p.full_name,'') ilike '%'||btrim(p_query)||'%'
    )
  order by 2
  limit least(greatest(coalesce(p_limit,50),1),100);
end $$;
grant execute on function public.search_students_for_assigned_class(uuid,text,integer) to authenticated;

create or replace function public.add_student_to_institution_class(
  p_group_id uuid,p_student_id uuid
)
returns void language plpgsql security definer set search_path='public' as $$
declare v_institution uuid;
begin
  select institution_id into v_institution from public.academic_groups
  where id=p_group_id and group_kind='institution_class' and not is_archived;

  if v_institution is null then raise exception 'Class not found.'; end if;
  if auth.uid()<>v_institution
     and not public.is_group_assigned_teacher(p_group_id,auth.uid())
  then raise exception 'You are not authorized to add students to this class.'; end if;

  if not exists(
    select 1 from public.institution_relationships ir
    join public.profiles p on p.id=ir.member_id and p.role='student'
    where ir.institution_id=v_institution
      and ir.member_id=p_student_id
      and ir.relationship_type='student'
      and ir.status='accepted'
  ) then raise exception 'Student must be registered with this institution.'; end if;

  insert into public.academic_group_members(
    group_id,user_id,membership_role,status,invited_by,responded_at
  ) values(p_group_id,p_student_id,'member','active',auth.uid(),now())
  on conflict(group_id,user_id) do update
    set membership_role='member',status='active',responded_at=now();
end $$;
grant execute on function public.add_student_to_institution_class(uuid,uuid) to authenticated;

create or replace function public.remove_student_from_institution_class(
  p_group_id uuid,p_student_id uuid
)
returns void language plpgsql security definer set search_path='public' as $$
declare v_institution uuid;
begin
  select institution_id into v_institution from public.academic_groups
  where id=p_group_id and group_kind='institution_class';
  if auth.uid()<>v_institution
     and not public.is_group_assigned_teacher(p_group_id,auth.uid())
  then raise exception 'You are not authorized to remove students from this class.'; end if;
  delete from public.academic_group_members
  where group_id=p_group_id and user_id=p_student_id and membership_role='member';
end $$;
grant execute on function public.remove_student_from_institution_class(uuid,uuid) to authenticated;

create or replace function public.get_my_assigned_institution_classes()
returns table(
  group_id uuid,class_name text,academic_year text,institution_id uuid,institution_name text
)
language sql stable security definer set search_path='public' as $$
  select g.id,g.name,y.name,g.institution_id,coalesce(ip.name,'Institution')
  from public.academic_group_teachers gt
  join public.academic_groups g on g.id=gt.group_id
  join public.institution_academic_years y on y.id=g.academic_year_id
  left join public.institution_profiles ip on ip.user_id=g.institution_id
  where gt.teacher_id=auth.uid() and not g.is_archived
  order by y.starts_on desc nulls last,y.name desc,g.name;
$$;
grant execute on function public.get_my_assigned_institution_classes() to authenticated;

notify pgrst,'reload schema';
