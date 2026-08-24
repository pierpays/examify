-- User behavior reporting with guardian/institution safety routing.

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid not null references public.profiles(id) on delete cascade,
  affected_student_id uuid references public.profiles(id) on delete set null,
  reason text not null check (
    reason in ('harassment','inappropriate','bullying','spam','impersonation','safety','other')
  ),
  details text not null,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  constraint user_reports_not_self check (reporter_id <> reported_user_id),
  constraint user_reports_details_length check (char_length(btrim(details)) between 10 and 2000)
);

create index if not exists user_reports_reported_idx on public.user_reports(reported_user_id, created_at desc);
create index if not exists user_reports_status_idx on public.user_reports(status, created_at desc);
create index if not exists user_reports_affected_student_idx on public.user_reports(affected_student_id, created_at desc);

create table if not exists public.user_report_recipients (
  report_id uuid not null references public.user_reports(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  recipient_kind text not null check (recipient_kind in ('parent','institution')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  primary key (report_id, recipient_id)
);

create index if not exists user_report_recipients_recipient_idx
  on public.user_report_recipients(recipient_id, read_at, created_at desc);

alter table public.user_reports enable row level security;
alter table public.user_report_recipients enable row level security;

create policy "Reporters read own user reports"
on public.user_reports for select to authenticated
using (reporter_id = auth.uid() or public.is_examify_admin());

create policy "Admins update user reports"
on public.user_reports for update to authenticated
using (public.is_examify_admin())
with check (public.is_examify_admin());

create policy "Recipients read report routing"
on public.user_report_recipients for select to authenticated
using (recipient_id = auth.uid() or public.is_examify_admin());

create policy "Recipients mark report routing read"
on public.user_report_recipients for update to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

alter table public.notifications
  add column if not exists user_report_id uuid references public.user_reports(id) on delete cascade;

alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
check (notification_type in (
  'post_reaction','post_comment','child_exam_result','user_safety_report'
));

create or replace function public.get_reportable_user(p_user_id uuid)
returns table(user_id uuid, display_name text, role text, avatar_url text)
language sql stable security definer set search_path='public' as $$
  select p.id,
    case when p.role='teacher' then coalesce(tp.display_name,p.full_name,'Teacher')
         when p.role='institution' then coalesce(ip.name,p.full_name,'Institution')
         else coalesce(p.full_name,'Examify user') end,
    p.role,
    coalesce(tp.profile_image_url,p.avatar_url)
  from public.profiles p
  left join public.teacher_profiles tp on tp.user_id=p.id
  left join public.institution_profiles ip on ip.user_id=p.id
  where p.id=p_user_id and p.id<>auth.uid()
    and (p.role<>'institution' or ip.verification_status='approved');
$$;
revoke all on function public.get_reportable_user(uuid) from public;
grant execute on function public.get_reportable_user(uuid) to authenticated;

create or replace function public.submit_user_report(
  p_reported_user_id uuid,
  p_reason text,
  p_details text,
  p_affected_student_id uuid default null
)
returns uuid
language plpgsql security definer set search_path='public' as $$
declare
  v_me uuid := auth.uid();
  v_reporter_role text;
  v_reported_role text;
  v_affected_student uuid := p_affected_student_id;
  v_report_id uuid;
begin
  if v_me is null then raise exception 'You must be signed in.'; end if;
  if p_reported_user_id is null or p_reported_user_id=v_me then raise exception 'You cannot report your own account.'; end if;
  if p_reason not in ('harassment','inappropriate','bullying','spam','impersonation','safety','other') then raise exception 'Invalid report reason.'; end if;
  if char_length(btrim(coalesce(p_details,''))) < 10 then raise exception 'Please provide at least 10 characters of detail.'; end if;
  if char_length(btrim(p_details)) > 2000 then raise exception 'Report details are too long.'; end if;

  select role into v_reporter_role from public.profiles where id=v_me;
  select role into v_reported_role from public.profiles where id=p_reported_user_id;
  if v_reported_role is null then raise exception 'Account not found.'; end if;

  -- A student reporting harassment/bullying/safety is automatically the affected student.
  if v_reporter_role='student' and p_reason in ('harassment','bullying','safety') then
    v_affected_student := v_me;
  end if;

  -- A parent may only identify one of their linked children as the affected student.
  if v_affected_student is not null and v_affected_student<>v_me then
    if not (v_reporter_role='parent' and exists(
      select 1 from public.parent_student_links l
      where l.parent_id=v_me and l.student_id=v_affected_student
    )) then
      raise exception 'You cannot submit a safety report for that student.';
    end if;
  end if;

  if v_affected_student is not null and not exists(
    select 1 from public.profiles p where p.id=v_affected_student and p.role='student'
  ) then
    raise exception 'Affected account must be a student.';
  end if;

  insert into public.user_reports(reporter_id,reported_user_id,affected_student_id,reason,details)
  values(v_me,p_reported_user_id,v_affected_student,p_reason,btrim(p_details))
  returning id into v_report_id;

  -- If a teacher is reported, alert every accepted institution the teacher belongs to.
  if v_reported_role='teacher' then
    insert into public.user_report_recipients(report_id,recipient_id,recipient_kind)
    select v_report_id, ir.institution_id, 'institution'
    from public.institution_relationships ir
    where ir.member_id=p_reported_user_id
      and ir.relationship_type='teacher'
      and ir.status='accepted'
    on conflict do nothing;
  end if;

  -- If a student is the affected party, alert linked parents and accepted institutions.
  if v_affected_student is not null then
    insert into public.user_report_recipients(report_id,recipient_id,recipient_kind)
    select v_report_id, l.parent_id, 'parent'
    from public.parent_student_links l
    where l.student_id=v_affected_student
      and l.parent_id<>v_me
    on conflict do nothing;

    insert into public.user_report_recipients(report_id,recipient_id,recipient_kind)
    select v_report_id, ir.institution_id, 'institution'
    from public.institution_relationships ir
    where ir.member_id=v_affected_student
      and ir.relationship_type='student'
      and ir.status='accepted'
      and ir.institution_id<>p_reported_user_id
    on conflict do nothing;
  end if;

  insert into public.notifications(user_id,actor_id,notification_type,user_report_id)
  select rr.recipient_id, v_me, 'user_safety_report', v_report_id
  from public.user_report_recipients rr
  where rr.report_id=v_report_id
  on conflict do nothing;

  return v_report_id;
end;
$$;
revoke all on function public.submit_user_report(uuid,text,text,uuid) from public;
grant execute on function public.submit_user_report(uuid,text,text,uuid) to authenticated;

create or replace function public.get_my_received_user_reports()
returns table(
  report_id uuid, reporter_id uuid, reporter_name text,
  reported_user_id uuid, reported_name text, reported_role text,
  affected_student_id uuid, affected_student_name text,
  reason text, details text, status text, recipient_kind text,
  read_at timestamptz, created_at timestamptz
)
language sql stable security definer set search_path='public' as $$
  select r.id,r.reporter_id,
    coalesce(rp.full_name,rtp.display_name,rip.name,'Examify user'),
    r.reported_user_id,
    case when reported.role='teacher' then coalesce(t.display_name,reported.full_name,'Teacher')
         when reported.role='institution' then coalesce(i.name,reported.full_name,'Institution')
         else coalesce(reported.full_name,'Examify user') end,
    reported.role,
    r.affected_student_id,
    affected.full_name,
    r.reason,r.details,r.status,rr.recipient_kind,rr.read_at,r.created_at
  from public.user_report_recipients rr
  join public.user_reports r on r.id=rr.report_id
  join public.profiles reported on reported.id=r.reported_user_id
  left join public.teacher_profiles t on t.user_id=reported.id
  left join public.institution_profiles i on i.user_id=reported.id
  left join public.profiles rp on rp.id=r.reporter_id
  left join public.teacher_profiles rtp on rtp.user_id=r.reporter_id
  left join public.institution_profiles rip on rip.user_id=r.reporter_id
  left join public.profiles affected on affected.id=r.affected_student_id
  where rr.recipient_id=auth.uid()
  order by r.created_at desc;
$$;
revoke all on function public.get_my_received_user_reports() from public;
grant execute on function public.get_my_received_user_reports() to authenticated;

create or replace function public.mark_user_report_received_read(p_report_id uuid)
returns void language sql security definer set search_path='public' as $$
  update public.user_report_recipients set read_at=coalesce(read_at,now())
  where report_id=p_report_id and recipient_id=auth.uid();
$$;
revoke all on function public.mark_user_report_received_read(uuid) from public;
grant execute on function public.mark_user_report_received_read(uuid) to authenticated;

create or replace function public.get_admin_user_reports()
returns table(
  report_id uuid, reporter_id uuid, reporter_name text,
  reported_user_id uuid, reported_name text, reported_role text,
  affected_student_id uuid, affected_student_name text,
  reason text, details text, status text, created_at timestamptz
)
language sql stable security definer set search_path='public' as $$
  select r.id,r.reporter_id,
    coalesce(rp.full_name,rtp.display_name,rip.name,'Examify user'),
    r.reported_user_id,
    case when reported.role='teacher' then coalesce(t.display_name,reported.full_name,'Teacher')
         when reported.role='institution' then coalesce(i.name,reported.full_name,'Institution')
         else coalesce(reported.full_name,'Examify user') end,
    reported.role,r.affected_student_id,affected.full_name,
    r.reason,r.details,r.status,r.created_at
  from public.user_reports r
  join public.profiles reported on reported.id=r.reported_user_id
  left join public.teacher_profiles t on t.user_id=reported.id
  left join public.institution_profiles i on i.user_id=reported.id
  left join public.profiles rp on rp.id=r.reporter_id
  left join public.teacher_profiles rtp on rtp.user_id=r.reporter_id
  left join public.institution_profiles rip on rip.user_id=r.reporter_id
  left join public.profiles affected on affected.id=r.affected_student_id
  where public.is_examify_admin()
  order by r.created_at desc;
$$;
revoke all on function public.get_admin_user_reports() from public;
grant execute on function public.get_admin_user_reports() to authenticated;

create or replace function public.review_user_report(p_report_id uuid,p_status text)
returns void language plpgsql security definer set search_path='public' as $$
begin
  if not public.is_examify_admin() then raise exception 'Admin access required.'; end if;
  if p_status not in ('open','resolved','dismissed') then raise exception 'Invalid status.'; end if;
  update public.user_reports
  set status=p_status,
      reviewed_at=case when p_status='open' then null else now() end,
      reviewed_by=case when p_status='open' then null else auth.uid() end
  where id=p_report_id;
end;
$$;
revoke all on function public.review_user_report(uuid,text) from public;
grant execute on function public.review_user_report(uuid,text) to authenticated;

-- Extend notification fetch to include safety reports.
drop function if exists public.get_my_notifications(integer);
create function public.get_my_notifications(p_limit integer default 50)
returns table (
  id uuid, notification_type text, post_id uuid, comment_id uuid,
  exam_attempt_id uuid, user_report_id uuid, actor_id uuid,
  actor_name text, actor_role text, exam_title text, exam_score numeric,
  exam_passing_score integer, read_at timestamptz, created_at timestamptz
)
language sql stable security definer set search_path='public' as $$
  select n.id,n.notification_type,n.post_id,n.comment_id,n.exam_attempt_id,n.user_report_id,n.actor_id,
    case when p.role='teacher' then coalesce(tp.display_name,p.full_name,'Teacher')
         when p.role='institution' then coalesce(ip.name,p.full_name,'Institution')
         when p.role='admin' then coalesce(p.full_name,'Examify Admin')
         when p.role='parent' then coalesce(p.full_name,'Parent')
         else coalesce(p.full_name,'Student') end,
    p.role,e.title,a.score_percent,e.passing_score,n.read_at,n.created_at
  from public.notifications n
  left join public.profiles p on p.id=n.actor_id
  left join public.teacher_profiles tp on tp.user_id=n.actor_id
  left join public.institution_profiles ip on ip.user_id=n.actor_id
  left join public.exam_attempts a on a.id=n.exam_attempt_id
  left join public.exams e on e.id=a.exam_id
  where n.user_id=auth.uid()
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit,50),1),100);
$$;
revoke all on function public.get_my_notifications(integer) from public;
grant execute on function public.get_my_notifications(integer) to authenticated;

notify pgrst, 'reload schema';
