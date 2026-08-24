-- Examify Update 66: Event images, cancellation, and attendance UX.

alter table public.academic_events
  add column if not exists cover_image_url text,
  add column if not exists status text not null default 'scheduled',
  add column if not exists cancelled_at timestamptz;

update public.academic_events
set status = 'scheduled'
where status is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'academic_events_status_check'
      and conrelid = 'public.academic_events'::regclass
  ) then
    alter table public.academic_events
      add constraint academic_events_status_check
      check (status in ('scheduled', 'cancelled'));
  end if;
end
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-images',
  'event-images',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/gif','image/avif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "event_images_authenticated_insert" on storage.objects;
create policy "event_images_authenticated_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'event-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "event_images_owner_update" on storage.objects;
create policy "event_images_owner_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'event-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'event-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "event_images_owner_delete" on storage.objects;
create policy "event_images_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'event-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.cancel_academic_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.academic_events
  set
    status = 'cancelled',
    cancelled_at = now()
  where id = p_event_id
    and creator_id = auth.uid()
    and status <> 'cancelled';

  if not found then
    if exists (
      select 1
      from public.academic_events
      where id = p_event_id
        and creator_id = auth.uid()
        and status = 'cancelled'
    ) then
      return;
    end if;

    raise exception 'Only the event creator can cancel this event';
  end if;
end;
$$;

revoke all on function public.cancel_academic_event(uuid) from public;
grant execute on function public.cancel_academic_event(uuid) to authenticated;

-- Enforce cancellation at the database layer as well as in the UI.
create or replace function public.prevent_cancelled_event_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.academic_events e
    where e.id = new.event_id
      and e.status = 'cancelled'
  ) then
    raise exception 'This event has been cancelled';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_cancelled_event_responses
on public.academic_event_responses;

create trigger prevent_cancelled_event_responses
before insert or update
on public.academic_event_responses
for each row
execute function public.prevent_cancelled_event_activity();

drop trigger if exists prevent_cancelled_event_invitations
on public.academic_event_invitations;

create trigger prevent_cancelled_event_invitations
before insert or update
on public.academic_event_invitations
for each row
execute function public.prevent_cancelled_event_activity();
