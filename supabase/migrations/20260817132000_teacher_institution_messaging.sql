-- Examify Update 68a: two-way teacher <-> verified institution messaging.
-- Verified institutions may message teachers, and teachers may message
-- verified institutions. Explicit user blocks still override this permission.

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

        or (
          sender.role='institution'
          and target.role='teacher'
          and public.is_verified_institution(sender.id)
        )

        or (
          sender.role='teacher'
          and target.role='institution'
          and public.is_verified_institution(target.id)
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
