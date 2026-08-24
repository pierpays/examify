-- Examify Update 68: verified institutions can message all teachers.
-- Institution -> teacher messaging bypasses the teacher's ordinary
-- "everyone/connections" preference, while explicit user blocks still win.
-- Minor/teacher safety restrictions remain unchanged.

create or replace function public.can_message_user(
  p_target uuid,
  p_sender uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path='public'
as $$
  select exists(
    select 1
    from public.profiles target
    left join public.profiles sender on sender.id=p_sender
    where target.id=p_target
      and p_target<>p_sender
      and not public.has_block_between(p_sender,p_target)
      and public.minor_teacher_interaction_allowed(p_sender,p_target)
      and (
        sender.role='admin'

        -- A verified institution may initiate academic communication
        -- with any teacher on Examify. Explicit blocks still override this.
        or (
          sender.role='institution'
          and target.role='teacher'
          and public.is_verified_institution(sender.id)
        )

        or target.message_permission='everyone'

        or (
          target.message_permission='connections'
          and public.are_connected(p_sender,p_target)
        )
      )
  );
$$;

grant execute on function public.can_message_user(uuid,uuid)
to authenticated;

notify pgrst,'reload schema';
