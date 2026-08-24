-- Social engagement: reactions, comments, and notifications for feed posts.

create table if not exists public.feed_post_reactions (
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('like', 'celebrate', 'helpful')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists feed_post_reactions_post_idx
  on public.feed_post_reactions(post_id, created_at desc);

alter table public.feed_post_reactions enable row level security;

create policy "Authenticated users can read feed reactions"
on public.feed_post_reactions
for select
to authenticated
using (true);

create policy "Users can add own feed reaction"
on public.feed_post_reactions
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own feed reaction"
on public.feed_post_reactions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can remove own feed reaction"
on public.feed_post_reactions
for delete
to authenticated
using (user_id = auth.uid());

create table if not exists public.feed_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feed_post_comments_post_idx
  on public.feed_post_comments(post_id, created_at asc);

alter table public.feed_post_comments enable row level security;

create policy "Authenticated users can read feed comments"
on public.feed_post_comments
for select
to authenticated
using (true);

create policy "Users can create own feed comments"
on public.feed_post_comments
for insert
to authenticated
with check (author_id = auth.uid());

create policy "Users can update own feed comments"
on public.feed_post_comments
for update
to authenticated
using (author_id = auth.uid())
with check (author_id = auth.uid());

create or replace function public.can_delete_feed_comment(
  p_comment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1
    from public.feed_post_comments c
    join public.feed_posts p on p.id = c.post_id
    where c.id = p_comment_id
      and (
        c.author_id = auth.uid()
        or p.author_id = auth.uid()
        or public.is_examify_admin()
      )
  );
$$;

revoke all on function public.can_delete_feed_comment(uuid) from public;
grant execute on function public.can_delete_feed_comment(uuid) to authenticated;

create policy "Comment author post author or admin can delete comment"
on public.feed_post_comments
for delete
to authenticated
using (public.can_delete_feed_comment(id));

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  notification_type text not null check (
    notification_type in ('post_reaction', 'post_comment')
  ),
  post_id uuid references public.feed_posts(id) on delete cascade,
  comment_id uuid references public.feed_post_comments(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, read_at, created_at desc);

alter table public.notifications enable row level security;

create policy "Users can read own notifications"
on public.notifications
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can update own notifications"
on public.notifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own notifications"
on public.notifications
for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.notify_feed_reaction()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_post_author uuid;
begin
  select author_id into v_post_author
  from public.feed_posts
  where id = new.post_id;

  if v_post_author is not null and v_post_author <> new.user_id then
    insert into public.notifications (
      user_id,
      actor_id,
      notification_type,
      post_id
    ) values (
      v_post_author,
      new.user_id,
      'post_reaction',
      new.post_id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists feed_reaction_notification_trigger
on public.feed_post_reactions;

create trigger feed_reaction_notification_trigger
after insert on public.feed_post_reactions
for each row execute function public.notify_feed_reaction();

create or replace function public.notify_feed_comment()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_post_author uuid;
begin
  select author_id into v_post_author
  from public.feed_posts
  where id = new.post_id;

  if v_post_author is not null and v_post_author <> new.author_id then
    insert into public.notifications (
      user_id,
      actor_id,
      notification_type,
      post_id,
      comment_id
    ) values (
      v_post_author,
      new.author_id,
      'post_comment',
      new.post_id,
      new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists feed_comment_notification_trigger
on public.feed_post_comments;

create trigger feed_comment_notification_trigger
after insert on public.feed_post_comments
for each row execute function public.notify_feed_comment();

create or replace function public.get_post_engagement(p_post_id uuid)
returns table (
  like_count bigint,
  celebrate_count bigint,
  helpful_count bigint,
  comment_count bigint,
  viewer_reaction text
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    count(*) filter (where r.reaction_type = 'like') as like_count,
    count(*) filter (where r.reaction_type = 'celebrate') as celebrate_count,
    count(*) filter (where r.reaction_type = 'helpful') as helpful_count,
    (select count(*) from public.feed_post_comments c where c.post_id = p_post_id) as comment_count,
    (select reaction_type from public.feed_post_reactions vr where vr.post_id = p_post_id and vr.user_id = auth.uid()) as viewer_reaction
  from public.feed_post_reactions r
  where r.post_id = p_post_id;
$$;

revoke all on function public.get_post_engagement(uuid) from public;
grant execute on function public.get_post_engagement(uuid) to anon, authenticated;

create or replace function public.get_post_comments(p_post_id uuid)
returns table (
  id uuid,
  post_id uuid,
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
set search_path = 'public'
as $$
  select
    c.id,
    c.post_id,
    c.author_id,
    case
      when p.role = 'teacher' then coalesce(tp.display_name, p.full_name, 'Teacher')
      when p.role = 'institution' then coalesce(ip.name, p.full_name, 'Institution')
      when p.role = 'admin' then coalesce(p.full_name, 'Examify Admin')
      else coalesce(p.full_name, 'Student')
    end as author_name,
    p.role as author_role,
    case
      when p.role = 'teacher' then coalesce(tp.profile_image_url, p.avatar_url)
      else p.avatar_url
    end as author_avatar_url,
    c.body,
    c.created_at
  from public.feed_post_comments c
  join public.feed_posts fp on fp.id = c.post_id
  join public.profiles p on p.id = c.author_id
  left join public.teacher_profiles tp on tp.user_id = c.author_id
  left join public.institution_profiles ip on ip.user_id = c.author_id
  where c.post_id = p_post_id
    and fp.moderation_status = 'active'
  order by c.created_at asc;
$$;

revoke all on function public.get_post_comments(uuid) from public;
grant execute on function public.get_post_comments(uuid) to anon, authenticated;

create or replace function public.get_my_notifications(p_limit integer default 50)
returns table (
  id uuid,
  notification_type text,
  post_id uuid,
  comment_id uuid,
  actor_id uuid,
  actor_name text,
  actor_role text,
  read_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    n.id,
    n.notification_type,
    n.post_id,
    n.comment_id,
    n.actor_id,
    case
      when p.role = 'teacher' then coalesce(tp.display_name, p.full_name, 'Teacher')
      when p.role = 'institution' then coalesce(ip.name, p.full_name, 'Institution')
      when p.role = 'admin' then coalesce(p.full_name, 'Examify Admin')
      else coalesce(p.full_name, 'Student')
    end as actor_name,
    p.role as actor_role,
    n.read_at,
    n.created_at
  from public.notifications n
  left join public.profiles p on p.id = n.actor_id
  left join public.teacher_profiles tp on tp.user_id = n.actor_id
  left join public.institution_profiles ip on ip.user_id = n.actor_id
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.get_my_notifications(integer) from public;
grant execute on function public.get_my_notifications(integer) to authenticated;
