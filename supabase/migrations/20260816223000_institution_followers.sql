-- Students, teachers, and parents can follow public institutions.
create table public.institution_followers (
  institution_id uuid not null references public.institution_profiles(user_id) on delete cascade,
  follower_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (institution_id, follower_id)
);

create index institution_followers_follower_idx
  on public.institution_followers(follower_id, created_at desc);

create index institution_followers_institution_idx
  on public.institution_followers(institution_id, created_at desc);

alter table public.institution_followers enable row level security;

create policy "Users can read own institution follows"
on public.institution_followers
for select
to authenticated
using (
  follower_id = auth.uid()
  or institution_id = auth.uid()
);

create policy "Students teachers parents can follow institutions"
on public.institution_followers
for insert
to authenticated
with check (
  follower_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('student', 'teacher', 'parent')
  )
  and exists (
    select 1
    from public.institution_profiles ip
    where ip.user_id = institution_followers.institution_id
      and ip.is_public = true
  )
);

create policy "Users can unfollow institutions"
on public.institution_followers
for delete
to authenticated
using (follower_id = auth.uid());

-- Public follower count without exposing the follower list.
create or replace function public.get_institution_follower_count(
  p_institution_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = 'public'
as $$
  select count(*)::bigint
  from public.institution_followers f
  where f.institution_id = p_institution_id;
$$;

grant execute on function public.get_institution_follower_count(uuid)
to anon, authenticated;
