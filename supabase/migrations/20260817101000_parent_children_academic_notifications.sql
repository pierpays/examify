-- Parent-created student accounts, parent/child links, academic overview, and mirrored exam notifications.

create table if not exists public.parent_student_links (
  parent_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  relationship_label text not null default 'child',
  created_at timestamptz not null default now(),
  primary key (parent_id, student_id),
  check (parent_id <> student_id)
);

create index if not exists parent_student_links_student_idx
  on public.parent_student_links(student_id);

alter table public.parent_student_links enable row level security;

drop policy if exists "Parents read own child links" on public.parent_student_links;
create policy "Parents read own child links"
on public.parent_student_links for select to authenticated
using (parent_id = auth.uid() or student_id = auth.uid());

-- Links are created by the trusted server route after verifying the caller is a parent.
-- Normal clients may only remove their own parent-side link.
drop policy if exists "Parents remove own child links" on public.parent_student_links;
create policy "Parents remove own child links"
on public.parent_student_links for delete to authenticated
using (parent_id = auth.uid());

alter table public.notifications
  add column if not exists exam_attempt_id uuid references public.exam_attempts(id) on delete cascade;

alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in ('post_reaction', 'post_comment', 'child_exam_result'));

create or replace function public.notify_parents_of_completed_exam()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.status = 'completed'
     and (old.status is distinct from 'completed') then
    insert into public.notifications (
      user_id,
      actor_id,
      notification_type,
      exam_attempt_id
    )
    select
      link.parent_id,
      new.user_id,
      'child_exam_result',
      new.id
    from public.parent_student_links link
    where link.student_id = new.user_id
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists parent_exam_result_notification_trigger on public.exam_attempts;
create trigger parent_exam_result_notification_trigger
after update on public.exam_attempts
for each row execute function public.notify_parents_of_completed_exam();

create or replace function public.get_my_children()
returns table (
  student_id uuid,
  student_name text,
  avatar_url text,
  completed_exams bigint,
  average_score numeric,
  latest_activity timestamptz
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    p.id,
    coalesce(p.full_name, 'Student'),
    p.avatar_url,
    count(a.id) filter (where a.status = 'completed'),
    round(coalesce(avg(a.score_percent) filter (where a.status = 'completed'), 0), 1),
    max(a.completed_at) filter (where a.status = 'completed')
  from public.parent_student_links l
  join public.profiles p on p.id = l.student_id and p.role = 'student'
  left join public.exam_attempts a on a.user_id = l.student_id
  where l.parent_id = auth.uid()
  group by p.id, p.full_name, p.avatar_url
  order by coalesce(p.full_name, 'Student');
$$;

revoke all on function public.get_my_children() from public;
grant execute on function public.get_my_children() to authenticated;

create or replace function public.get_child_academic_overview(p_student_id uuid)
returns table (
  attempt_id uuid,
  exam_id uuid,
  exam_title text,
  score_percent numeric,
  passing_score integer,
  passed boolean,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    a.id,
    a.exam_id,
    e.title,
    a.score_percent,
    e.passing_score,
    (a.score_percent >= e.passing_score),
    a.completed_at
  from public.exam_attempts a
  join public.exams e on e.id = a.exam_id
  where a.user_id = p_student_id
    and a.status = 'completed'
    and exists (
      select 1 from public.parent_student_links l
      where l.parent_id = auth.uid() and l.student_id = p_student_id
    )
  order by a.completed_at desc nulls last;
$$;

revoke all on function public.get_child_academic_overview(uuid) from public;
grant execute on function public.get_child_academic_overview(uuid) to authenticated;

drop function if exists public.get_my_notifications(integer);

create function public.get_my_notifications(p_limit integer default 50)
returns table (
  id uuid,
  notification_type text,
  post_id uuid,
  comment_id uuid,
  exam_attempt_id uuid,
  actor_id uuid,
  actor_name text,
  actor_role text,
  exam_title text,
  exam_score numeric,
  exam_passing_score integer,
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
    n.exam_attempt_id,
    n.actor_id,
    case
      when p.role = 'teacher' then coalesce(tp.display_name, p.full_name, 'Teacher')
      when p.role = 'institution' then coalesce(ip.name, p.full_name, 'Institution')
      when p.role = 'admin' then coalesce(p.full_name, 'Examify Admin')
      when p.role = 'parent' then coalesce(p.full_name, 'Parent')
      else coalesce(p.full_name, 'Student')
    end,
    p.role,
    e.title,
    a.score_percent,
    e.passing_score,
    n.read_at,
    n.created_at
  from public.notifications n
  left join public.profiles p on p.id = n.actor_id
  left join public.teacher_profiles tp on tp.user_id = n.actor_id
  left join public.institution_profiles ip on ip.user_id = n.actor_id
  left join public.exam_attempts a on a.id = n.exam_attempt_id
  left join public.exams e on e.id = a.exam_id
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.get_my_notifications(integer) from public;
grant execute on function public.get_my_notifications(integer) to authenticated;

notify pgrst, 'reload schema';
