-- Examify Update 71: native advertising system.
-- Ads are separate from user posts and are always rendered as Sponsored.

create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  advertiser_name text not null check (char_length(advertiser_name) between 1 and 120),
  title text not null check (char_length(title) between 1 and 180),
  body text,
  image_url text,
  destination_url text not null,
  cta_text text not null default 'Learn more',
  placement_feed boolean not null default true,
  placement_right_rail boolean not null default false,
  status text not null default 'draft' check (status in ('draft','active','paused','ended')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create table if not exists public.ad_events (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.ad_campaigns(id) on delete cascade,
  viewer_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('impression','click')),
  placement text not null check (placement in ('feed','right_rail')),
  occurred_at timestamptz not null default now()
);

create index if not exists ad_events_campaign_idx
  on public.ad_events(campaign_id,event_type,occurred_at desc);

alter table public.ad_campaigns enable row level security;
alter table public.ad_events enable row level security;

insert into storage.buckets(id,name,public)
values('ad-images','ad-images',true)
on conflict(id) do update set public=true;

drop policy if exists "admins upload ad images" on storage.objects;
create policy "admins upload ad images"
on storage.objects for insert to authenticated
with check (
  bucket_id='ad-images'
  and exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='admin'
  )
);

drop policy if exists "admins update ad images" on storage.objects;
create policy "admins update ad images"
on storage.objects for update to authenticated
using (
  bucket_id='ad-images'
  and exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='admin'
  )
)
with check (
  bucket_id='ad-images'
  and exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='admin'
  )
);

drop policy if exists "admins delete ad images" on storage.objects;
create policy "admins delete ad images"
on storage.objects for delete to authenticated
using (
  bucket_id='ad-images'
  and exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='admin'
  )
);

create or replace function public.get_active_ads(
  p_placement text,
  p_limit integer default 5
)
returns table(
  id uuid,
  advertiser_name text,
  title text,
  body text,
  image_url text,
  destination_url text,
  cta_text text
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    a.id,a.advertiser_name,a.title,a.body,a.image_url,
    a.destination_url,a.cta_text
  from public.ad_campaigns a
  where auth.uid() is not null
    and a.status='active'
    and (a.starts_at is null or a.starts_at<=now())
    and (a.ends_at is null or a.ends_at>=now())
    and (
      (p_placement='feed' and a.placement_feed)
      or (p_placement='right_rail' and a.placement_right_rail)
    )
  order by random()
  limit least(greatest(coalesce(p_limit,5),1),20);
$$;
grant execute on function public.get_active_ads(text,integer) to authenticated;

create or replace function public.record_ad_event(
  p_campaign_id uuid,
  p_event_type text,
  p_placement text
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
begin
  if auth.uid() is null then return; end if;
  if p_event_type not in('impression','click') then
    raise exception 'Invalid advertising event.';
  end if;
  if p_placement not in('feed','right_rail') then
    raise exception 'Invalid advertising placement.';
  end if;

  if exists(
    select 1 from public.ad_campaigns a
    where a.id=p_campaign_id
  ) then
    insert into public.ad_events(campaign_id,viewer_id,event_type,placement)
    values(p_campaign_id,auth.uid(),p_event_type,p_placement);
  end if;
end;
$$;
grant execute on function public.record_ad_event(uuid,text,text) to authenticated;

create or replace function public.admin_list_ad_campaigns()
returns table(
  id uuid,
  advertiser_name text,
  title text,
  body text,
  image_url text,
  destination_url text,
  cta_text text,
  placement_feed boolean,
  placement_right_rail boolean,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz,
  impressions bigint,
  clicks bigint
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    a.id,a.advertiser_name,a.title,a.body,a.image_url,a.destination_url,
    a.cta_text,a.placement_feed,a.placement_right_rail,a.status,
    a.starts_at,a.ends_at,a.created_at,
    count(e.id) filter(where e.event_type='impression')::bigint,
    count(e.id) filter(where e.event_type='click')::bigint
  from public.ad_campaigns a
  left join public.ad_events e on e.campaign_id=a.id
  where exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='admin'
  )
  group by a.id
  order by a.created_at desc;
$$;
grant execute on function public.admin_list_ad_campaigns() to authenticated;

create or replace function public.admin_save_ad_campaign(
  p_id uuid,
  p_advertiser_name text,
  p_title text,
  p_body text,
  p_image_url text,
  p_destination_url text,
  p_cta_text text,
  p_placement_feed boolean,
  p_placement_right_rail boolean,
  p_status text,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin') then
    raise exception 'Admin access required.';
  end if;
  if p_status not in('draft','active','paused','ended') then raise exception 'Invalid status.'; end if;
  if not coalesce(p_placement_feed,false) and not coalesce(p_placement_right_rail,false) then
    raise exception 'Choose at least one ad placement.';
  end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at<p_starts_at then
    raise exception 'End date cannot be before start date.';
  end if;

  if p_id is null then
    insert into public.ad_campaigns(
      advertiser_name,title,body,image_url,destination_url,cta_text,
      placement_feed,placement_right_rail,status,starts_at,ends_at,created_by
    ) values(
      btrim(p_advertiser_name),btrim(p_title),nullif(btrim(coalesce(p_body,'')),''),
      nullif(btrim(coalesce(p_image_url,'')),''),
      btrim(p_destination_url),coalesce(nullif(btrim(p_cta_text),''),'Learn more'),
      p_placement_feed,p_placement_right_rail,p_status,p_starts_at,p_ends_at,auth.uid()
    ) returning id into v_id;
  else
    update public.ad_campaigns set
      advertiser_name=btrim(p_advertiser_name),
      title=btrim(p_title),
      body=nullif(btrim(coalesce(p_body,'')),''),
      image_url=nullif(btrim(coalesce(p_image_url,'')),''),
      destination_url=btrim(p_destination_url),
      cta_text=coalesce(nullif(btrim(p_cta_text),''),'Learn more'),
      placement_feed=p_placement_feed,
      placement_right_rail=p_placement_right_rail,
      status=p_status,
      starts_at=p_starts_at,
      ends_at=p_ends_at,
      updated_at=now()
    where id=p_id
    returning id into v_id;
    if v_id is null then raise exception 'Campaign not found.'; end if;
  end if;
  return v_id;
end;
$$;
grant execute on function public.admin_save_ad_campaign(
  uuid,text,text,text,text,text,text,boolean,boolean,text,timestamptz,timestamptz
) to authenticated;

create or replace function public.admin_delete_ad_campaign(p_id uuid)
returns void
language plpgsql
security definer
set search_path='public'
as $$
begin
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin') then
    raise exception 'Admin access required.';
  end if;
  delete from public.ad_campaigns where id=p_id;
end;
$$;
grant execute on function public.admin_delete_ad_campaign(uuid) to authenticated;

notify pgrst,'reload schema';
