-- Fix institution relationship request inserts under RLS.
-- The previous INSERT policy queried public.profiles directly from inside the
-- policy. Depending on the caller's profile visibility, that subquery could be
-- filtered by profiles RLS and incorrectly reject otherwise valid requests.

create or replace function public.user_has_profile_role(
  target_user_id uuid,
  target_role text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and p.role = target_role
  );
$$;

revoke all on function public.user_has_profile_role(uuid, text) from public;
grant execute on function public.user_has_profile_role(uuid, text) to authenticated;

drop policy if exists "Institutions send relationship requests"
on public.institution_relationships;

create policy "Institutions send relationship requests"
on public.institution_relationships
for insert
to authenticated
with check (
  institution_id = auth.uid()
  and public.user_has_profile_role(auth.uid(), 'institution')
  and relationship_type in ('teacher', 'student', 'parent')
  and public.user_has_profile_role(member_id, relationship_type)
  and member_id <> auth.uid()
);
