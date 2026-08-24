-- Institution and parent account types + institution relationships
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student','teacher','parent','institution','admin'));

create table public.institution_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  website_url text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.institution_relationships (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institution_profiles(user_id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  relationship_type text not null check (relationship_type in ('teacher','student','parent')),
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (institution_id, member_id, relationship_type)
);
create index institution_relationships_institution_idx on public.institution_relationships(institution_id,status);
create index institution_relationships_member_idx on public.institution_relationships(member_id,status);

alter table public.institution_profiles enable row level security;
alter table public.institution_relationships enable row level security;

create policy "Public institution profiles readable" on public.institution_profiles
for select to anon, authenticated using (is_public = true or user_id = auth.uid());
create policy "Institutions create own profile" on public.institution_profiles
for insert to authenticated with check (user_id = auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='institution'));
create policy "Institutions update own profile" on public.institution_profiles
for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create policy "Institutions read own relationships" on public.institution_relationships
for select to authenticated using(institution_id=auth.uid() or member_id=auth.uid());
create policy "Institutions send relationship requests" on public.institution_relationships
for insert to authenticated with check(
 institution_id=auth.uid() and exists(select 1 from public.profiles p where p.id=member_id and p.role=relationship_type)
);
create policy "Institutions delete own requests" on public.institution_relationships
for delete to authenticated using(institution_id=auth.uid());
create policy "Members respond to requests" on public.institution_relationships
for update to authenticated using(member_id=auth.uid()) with check(member_id=auth.uid());

-- Accepted teachers are the only members exposed on a public institution profile.
create or replace function public.get_institution_teachers(p_institution_id uuid)
returns table(user_id uuid, display_name text, headline text, profile_image_url text)
language sql stable security definer set search_path='public' as $$
 select tp.user_id,tp.display_name,tp.headline,tp.profile_image_url
 from public.institution_relationships ir
 join public.teacher_profiles tp on tp.user_id=ir.member_id
 where ir.institution_id=p_institution_id and ir.relationship_type='teacher' and ir.status='accepted' and tp.is_public=true
 order by tp.display_name;
$$;
grant execute on function public.get_institution_teachers(uuid) to anon,authenticated;

-- Minimal directory for institutions to find accounts by name. Emails are never exposed.
create or replace function public.search_institution_candidates(p_query text, p_role text)
returns table(id uuid, display_name text, role text)
language sql stable security definer set search_path='public' as $$
 select p.id, coalesce(tp.display_name,p.full_name,'Examify user'), p.role
 from public.profiles p left join public.teacher_profiles tp on tp.user_id=p.id
 where exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='institution')
   and p.role in ('teacher','student','parent') and p.role=p_role
   and coalesce(tp.display_name,p.full_name,'') ilike '%'||coalesce(p_query,'')||'%'
   and p.id<>auth.uid()
 order by 2 limit 25;
$$;
grant execute on function public.search_institution_candidates(text,text) to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path='' as $$
declare requested_role text;
begin
 requested_role := new.raw_user_meta_data ->> 'role';
 if requested_role not in ('student','teacher','parent','institution') then requested_role := 'student'; end if;
 insert into public.profiles(id,full_name,avatar_url,role)
 values(new.id,new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'avatar_url',requested_role);
 return new;
end; $$;
