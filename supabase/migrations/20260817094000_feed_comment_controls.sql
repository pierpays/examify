-- Feed comment controls: post owners and admins can disable/enable comments.

alter table public.feed_posts
add column if not exists comments_enabled boolean not null default true;

-- Security-definer helper used by the comment insert policy so clients cannot
-- bypass a disabled-comments post by inserting directly through the API.
create or replace function public.feed_post_comments_are_enabled(
  p_post_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select coalesce((
    select p.comments_enabled
    from public.feed_posts p
    where p.id = p_post_id
  ), false);
$$;

revoke all on function public.feed_post_comments_are_enabled(uuid) from public;
grant execute on function public.feed_post_comments_are_enabled(uuid) to authenticated;

-- Replace the insert policy so disabled comments are enforced at the database
-- layer as well as in the UI.
drop policy if exists "Users can create own feed comments"
on public.feed_post_comments;

create policy "Users can create own feed comments when enabled"
on public.feed_post_comments
for insert
to authenticated
with check (
  author_id = auth.uid()
  and public.feed_post_comments_are_enabled(post_id)
);

-- Keep comment deletion explicitly available to the post owner and admins.
-- A comment author may also remove their own comment.
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

-- Only the post owner or an administrator can change comment availability.
create or replace function public.set_feed_post_comments_enabled(
  p_post_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_author_id uuid;
begin
  select author_id
  into v_author_id
  from public.feed_posts
  where id = p_post_id;

  if v_author_id is null then
    raise exception 'Post not found';
  end if;

  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if v_author_id <> auth.uid() and not public.is_examify_admin() then
    raise exception 'You are not allowed to change comments on this post';
  end if;

  update public.feed_posts
  set comments_enabled = p_enabled
  where id = p_post_id;

  return p_enabled;
end;
$$;

revoke all on function public.set_feed_post_comments_enabled(uuid, boolean) from public;
grant execute on function public.set_feed_post_comments_enabled(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
