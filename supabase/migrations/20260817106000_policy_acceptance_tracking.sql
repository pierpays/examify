-- Examify policy acceptance tracking.
-- Current policy version at migration creation: 1.0

create table if not exists public.policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  subject_user_id uuid not null references auth.users(id) on delete cascade,
  accepted_by_user_id uuid not null references auth.users(id) on delete cascade,
  policy_version text not null,
  acceptance_type text not null default 'self',
  accepted_at timestamptz not null default now(),
  role_at_acceptance text,
  source text not null default 'signup',
  created_at timestamptz not null default now(),
  constraint policy_acceptance_type_check
    check (acceptance_type in ('self', 'parent_on_behalf')),
  constraint policy_acceptance_version_not_blank
    check (char_length(btrim(policy_version)) > 0)
);

create index if not exists policy_acceptances_subject_idx
  on public.policy_acceptances(subject_user_id, accepted_at desc);

create index if not exists policy_acceptances_acceptor_idx
  on public.policy_acceptances(accepted_by_user_id, accepted_at desc);

create unique index if not exists policy_acceptances_unique_event_idx
  on public.policy_acceptances(
    subject_user_id,
    accepted_by_user_id,
    policy_version,
    acceptance_type
  );

alter table public.policy_acceptances enable row level security;

drop policy if exists "Users read relevant policy acceptances"
on public.policy_acceptances;

create policy "Users read relevant policy acceptances"
on public.policy_acceptances
for select
to authenticated
using (
  subject_user_id = auth.uid()
  or accepted_by_user_id = auth.uid()
  or public.is_examify_admin()
);

create or replace function public.record_policy_acceptance_from_auth()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_accepted boolean := false;
  v_version text := nullif(btrim(v_meta ->> 'policy_version'), '');
  v_type text := coalesce(nullif(v_meta ->> 'policy_acceptance_type', ''), 'self');
  v_acceptor uuid;
  v_accepted_at timestamptz;
  v_role text := nullif(v_meta ->> 'role', '');
begin
  begin
    v_accepted := coalesce((v_meta ->> 'policy_accepted')::boolean, false);
  exception when others then
    v_accepted := false;
  end;

  if not v_accepted or v_version is null then
    return new;
  end if;

  begin
    v_accepted_at := coalesce(
      nullif(v_meta ->> 'policy_accepted_at', '')::timestamptz,
      now()
    );
  exception when others then
    v_accepted_at := now();
  end;

  if v_type = 'parent_on_behalf' then
    begin
      v_acceptor := nullif(v_meta ->> 'parent_user_id', '')::uuid;
    exception when others then
      v_acceptor := null;
    end;

    if v_acceptor is null then
      return new;
    end if;
  else
    v_type := 'self';
    v_acceptor := new.id;
  end if;

  insert into public.policy_acceptances(
    subject_user_id,
    accepted_by_user_id,
    policy_version,
    acceptance_type,
    accepted_at,
    role_at_acceptance,
    source
  )
  values(
    new.id,
    v_acceptor,
    v_version,
    v_type,
    v_accepted_at,
    v_role,
    case
      when v_type = 'parent_on_behalf' then 'parent_child_creation'
      else 'signup'
    end
  )
  on conflict (
    subject_user_id,
    accepted_by_user_id,
    policy_version,
    acceptance_type
  )
  do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_policy_acceptance on auth.users;

create trigger on_auth_user_policy_acceptance
after insert on auth.users
for each row
execute function public.record_policy_acceptance_from_auth();

notify pgrst, 'reload schema';
