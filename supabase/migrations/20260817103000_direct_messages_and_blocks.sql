-- Examify direct messaging and user blocking.
-- All authenticated account roles may message each other.
-- A block in either direction prevents new direct messages while preserving history.

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx
  on public.user_blocks(blocked_id, blocker_id);

create table if not exists public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  user_one_id uuid not null references public.profiles(id) on delete cascade,
  user_two_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint direct_conversations_different_users
    check (user_one_id <> user_two_id),
  constraint direct_conversations_unique_pair
    unique (user_one_id, user_two_id)
);

create index if not exists direct_conversations_user_one_idx
  on public.direct_conversations(user_one_id, updated_at desc);

create index if not exists direct_conversations_user_two_idx
  on public.direct_conversations(user_two_id, updated_at desc);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.direct_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint direct_messages_body_length
    check (char_length(btrim(body)) between 1 and 5000)
);

create index if not exists direct_messages_conversation_idx
  on public.direct_messages(conversation_id, created_at desc);

create index if not exists direct_messages_unread_idx
  on public.direct_messages(conversation_id, read_at, created_at desc);

alter table public.user_blocks enable row level security;
alter table public.direct_conversations enable row level security;
alter table public.direct_messages enable row level security;

drop policy if exists "Users manage own blocks"
on public.user_blocks;

create policy "Users read own blocks"
on public.user_blocks
for select
to authenticated
using (blocker_id = auth.uid());

create policy "Users create own blocks"
on public.user_blocks
for insert
to authenticated
with check (
  blocker_id = auth.uid()
  and blocked_id <> auth.uid()
);

create policy "Users remove own blocks"
on public.user_blocks
for delete
to authenticated
using (blocker_id = auth.uid());

drop policy if exists "Participants read conversations"
on public.direct_conversations;

create policy "Participants read conversations"
on public.direct_conversations
for select
to authenticated
using (
  user_one_id = auth.uid()
  or user_two_id = auth.uid()
);

drop policy if exists "Participants read messages"
on public.direct_messages;

create policy "Participants read messages"
on public.direct_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.direct_conversations c
    where c.id = direct_messages.conversation_id
      and (
        c.user_one_id = auth.uid()
        or c.user_two_id = auth.uid()
      )
  )
);

create or replace function public.has_block_between(
  p_user_a uuid,
  p_user_b uuid
)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1
    from public.user_blocks b
    where
      (b.blocker_id = p_user_a and b.blocked_id = p_user_b)
      or
      (b.blocker_id = p_user_b and b.blocked_id = p_user_a)
  );
$$;

revoke all on function public.has_block_between(uuid, uuid) from public;
grant execute on function public.has_block_between(uuid, uuid) to authenticated;

create or replace function public.get_or_create_direct_conversation(
  p_other_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_me uuid := auth.uid();
  v_one uuid;
  v_two uuid;
  v_conversation_id uuid;
  v_other_role text;
begin
  if v_me is null then
    raise exception 'You must be signed in.';
  end if;

  if p_other_user_id is null or p_other_user_id = v_me then
    raise exception 'Choose another Examify user.';
  end if;

  select p.role
  into v_other_role
  from public.profiles p
  where p.id = p_other_user_id;

  if v_other_role is null then
    raise exception 'User not found.';
  end if;

  if v_other_role = 'institution'
     and not public.is_verified_institution(p_other_user_id) then
    raise exception 'This institution is not available for messaging.';
  end if;

  if public.has_block_between(v_me, p_other_user_id) then
    raise exception 'Messaging is unavailable because one of these accounts has blocked the other.';
  end if;

  if v_me::text < p_other_user_id::text then
    v_one := v_me;
    v_two := p_other_user_id;
  else
    v_one := p_other_user_id;
    v_two := v_me;
  end if;

  insert into public.direct_conversations(user_one_id, user_two_id)
  values(v_one, v_two)
  on conflict (user_one_id, user_two_id)
  do update set updated_at = public.direct_conversations.updated_at
  returning id into v_conversation_id;

  return v_conversation_id;
end;
$$;

revoke all on function public.get_or_create_direct_conversation(uuid) from public;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

create or replace function public.send_direct_message(
  p_conversation_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_me uuid := auth.uid();
  v_other uuid;
  v_message_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_me is null then
    raise exception 'You must be signed in.';
  end if;

  if char_length(v_body) < 1 then
    raise exception 'Message cannot be empty.';
  end if;

  if char_length(v_body) > 5000 then
    raise exception 'Message is too long.';
  end if;

  select
    case
      when c.user_one_id = v_me then c.user_two_id
      when c.user_two_id = v_me then c.user_one_id
      else null
    end
  into v_other
  from public.direct_conversations c
  where c.id = p_conversation_id;

  if v_other is null then
    raise exception 'Conversation not found.';
  end if;

  if public.has_block_between(v_me, v_other) then
    raise exception 'Messaging is unavailable because one of these accounts has blocked the other.';
  end if;

  insert into public.direct_messages(
    conversation_id,
    sender_id,
    body
  )
  values(
    p_conversation_id,
    v_me,
    v_body
  )
  returning id into v_message_id;

  update public.direct_conversations
  set updated_at = now()
  where id = p_conversation_id;

  return v_message_id;
end;
$$;

revoke all on function public.send_direct_message(uuid, text) from public;
grant execute on function public.send_direct_message(uuid, text) to authenticated;

create or replace function public.mark_direct_conversation_read(
  p_conversation_id uuid
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_me uuid := auth.uid();
begin
  if not exists (
    select 1
    from public.direct_conversations c
    where c.id = p_conversation_id
      and (c.user_one_id = v_me or c.user_two_id = v_me)
  ) then
    raise exception 'Conversation not found.';
  end if;

  update public.direct_messages m
  set read_at = coalesce(m.read_at, now())
  where m.conversation_id = p_conversation_id
    and m.sender_id <> v_me
    and m.read_at is null;
end;
$$;

revoke all on function public.mark_direct_conversation_read(uuid) from public;
grant execute on function public.mark_direct_conversation_read(uuid) to authenticated;

create or replace function public.block_examify_user(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'You must be signed in.';
  end if;

  if p_user_id is null or p_user_id = v_me then
    raise exception 'You cannot block your own account.';
  end if;

  if not exists (
    select 1 from public.profiles p where p.id = p_user_id
  ) then
    raise exception 'User not found.';
  end if;

  insert into public.user_blocks(blocker_id, blocked_id)
  values(v_me, p_user_id)
  on conflict do nothing;
end;
$$;

revoke all on function public.block_examify_user(uuid) from public;
grant execute on function public.block_examify_user(uuid) to authenticated;

create or replace function public.unblock_examify_user(
  p_user_id uuid
)
returns void
language sql
security definer
set search_path = 'public'
as $$
  delete from public.user_blocks
  where blocker_id = auth.uid()
    and blocked_id = p_user_id;
$$;

revoke all on function public.unblock_examify_user(uuid) from public;
grant execute on function public.unblock_examify_user(uuid) to authenticated;

create or replace function public.search_message_people(
  p_query text,
  p_limit integer default 20
)
returns table (
  user_id uuid,
  display_name text,
  role text,
  avatar_url text,
  is_blocked_by_me boolean,
  has_blocked_me boolean
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    p.id as user_id,
    case
      when p.role = 'teacher'
        then coalesce(tp.display_name, p.full_name, 'Teacher')
      when p.role = 'institution'
        then coalesce(ip.name, p.full_name, 'Institution')
      else coalesce(p.full_name, 'Examify user')
    end as display_name,
    p.role,
    coalesce(tp.profile_image_url, p.avatar_url) as avatar_url,
    exists (
      select 1
      from public.user_blocks b
      where b.blocker_id = auth.uid()
        and b.blocked_id = p.id
    ) as is_blocked_by_me,
    exists (
      select 1
      from public.user_blocks b
      where b.blocker_id = p.id
        and b.blocked_id = auth.uid()
    ) as has_blocked_me
  from public.profiles p
  left join public.teacher_profiles tp
    on tp.user_id = p.id
  left join public.institution_profiles ip
    on ip.user_id = p.id
  where auth.uid() is not null
    and p.id <> auth.uid()
    and (
      p.role <> 'institution'
      or ip.verification_status = 'approved'
    )
    and (
      coalesce(
        case
          when p.role = 'teacher' then tp.display_name
          when p.role = 'institution' then ip.name
          else p.full_name
        end,
        ''
      ) ilike '%' || btrim(coalesce(p_query, '')) || '%'
    )
  order by display_name
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.search_message_people(text, integer) from public;
grant execute on function public.search_message_people(text, integer) to authenticated;

create or replace function public.get_my_direct_conversations()
returns table (
  conversation_id uuid,
  other_user_id uuid,
  display_name text,
  role text,
  avatar_url text,
  last_message text,
  last_message_at timestamptz,
  unread_count bigint,
  is_blocked_by_me boolean,
  has_blocked_me boolean
)
language sql
stable
security definer
set search_path = 'public'
as $$
  with mine as (
    select
      c.id,
      c.updated_at,
      case
        when c.user_one_id = auth.uid() then c.user_two_id
        else c.user_one_id
      end as other_user_id
    from public.direct_conversations c
    where c.user_one_id = auth.uid()
       or c.user_two_id = auth.uid()
  )
  select
    m.id as conversation_id,
    m.other_user_id,
    case
      when p.role = 'teacher'
        then coalesce(tp.display_name, p.full_name, 'Teacher')
      when p.role = 'institution'
        then coalesce(ip.name, p.full_name, 'Institution')
      else coalesce(p.full_name, 'Examify user')
    end as display_name,
    p.role,
    coalesce(tp.profile_image_url, p.avatar_url) as avatar_url,
    lm.body as last_message,
    lm.created_at as last_message_at,
    (
      select count(*)
      from public.direct_messages unread
      where unread.conversation_id = m.id
        and unread.sender_id <> auth.uid()
        and unread.read_at is null
    ) as unread_count,
    exists (
      select 1 from public.user_blocks b
      where b.blocker_id = auth.uid()
        and b.blocked_id = m.other_user_id
    ) as is_blocked_by_me,
    exists (
      select 1 from public.user_blocks b
      where b.blocker_id = m.other_user_id
        and b.blocked_id = auth.uid()
    ) as has_blocked_me
  from mine m
  join public.profiles p
    on p.id = m.other_user_id
  left join public.teacher_profiles tp
    on tp.user_id = p.id
  left join public.institution_profiles ip
    on ip.user_id = p.id
  left join lateral (
    select dm.body, dm.created_at
    from public.direct_messages dm
    where dm.conversation_id = m.id
    order by dm.created_at desc
    limit 1
  ) lm on true
  order by coalesce(lm.created_at, m.updated_at) desc;
$$;

revoke all on function public.get_my_direct_conversations() from public;
grant execute on function public.get_my_direct_conversations() to authenticated;

create or replace function public.get_direct_messages(
  p_conversation_id uuid,
  p_limit integer default 100
)
returns table (
  message_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
begin
  if not exists (
    select 1
    from public.direct_conversations c
    where c.id = p_conversation_id
      and (
        c.user_one_id = auth.uid()
        or c.user_two_id = auth.uid()
      )
  ) then
    raise exception 'Conversation not found.';
  end if;

  return query
  select
    m.id,
    m.sender_id,
    m.body,
    m.created_at,
    m.read_at
  from public.direct_messages m
  where m.conversation_id = p_conversation_id
  order by m.created_at asc
  limit least(greatest(coalesce(p_limit, 100), 1), 300);
end;
$$;

revoke all on function public.get_direct_messages(uuid, integer) from public;
grant execute on function public.get_direct_messages(uuid, integer) to authenticated;

create or replace function public.get_my_blocked_users()
returns table (
  user_id uuid,
  display_name text,
  role text,
  avatar_url text,
  blocked_at timestamptz
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    p.id,
    case
      when p.role = 'teacher'
        then coalesce(tp.display_name, p.full_name, 'Teacher')
      when p.role = 'institution'
        then coalesce(ip.name, p.full_name, 'Institution')
      else coalesce(p.full_name, 'Examify user')
    end,
    p.role,
    coalesce(tp.profile_image_url, p.avatar_url),
    b.created_at
  from public.user_blocks b
  join public.profiles p on p.id = b.blocked_id
  left join public.teacher_profiles tp on tp.user_id = p.id
  left join public.institution_profiles ip on ip.user_id = p.id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

revoke all on function public.get_my_blocked_users() from public;
grant execute on function public.get_my_blocked_users() to authenticated;

create or replace function public.get_my_unread_message_count()
returns bigint
language sql
stable
security definer
set search_path = 'public'
as $$
  select count(*)
  from public.direct_messages m
  join public.direct_conversations c
    on c.id = m.conversation_id
  where (
      c.user_one_id = auth.uid()
      or c.user_two_id = auth.uid()
    )
    and m.sender_id <> auth.uid()
    and m.read_at is null;
$$;

revoke all on function public.get_my_unread_message_count() from public;
grant execute on function public.get_my_unread_message_count() to authenticated;

-- Enable realtime delivery for direct messages when the table is not already
-- part of the Supabase realtime publication.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end
$$;

notify pgrst, 'reload schema';
