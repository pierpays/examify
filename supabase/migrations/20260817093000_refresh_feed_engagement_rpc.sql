-- Repair/re-register feed engagement RPCs and force PostgREST to refresh its schema cache.

drop function if exists public.get_post_engagement(uuid);

create function public.get_post_engagement(p_post_id uuid)
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
    (
      select count(*)
      from public.feed_post_comments c
      where c.post_id = p_post_id
    ) as comment_count,
    (
      select vr.reaction_type
      from public.feed_post_reactions vr
      where vr.post_id = p_post_id
        and vr.user_id = auth.uid()
      limit 1
    ) as viewer_reaction
  from public.feed_post_reactions r
  where r.post_id = p_post_id;
$$;

revoke all on function public.get_post_engagement(uuid) from public;
grant execute on function public.get_post_engagement(uuid) to anon, authenticated;

-- Explicitly ask PostgREST/Supabase API to refresh function metadata.
notify pgrst, 'reload schema';
