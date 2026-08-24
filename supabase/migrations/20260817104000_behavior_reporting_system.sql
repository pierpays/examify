-- Examify behavior/safety reporting.
-- Every authenticated account can submit a report.
-- Reports are always visible to admins.
-- Teacher reports are additionally routed to accepted institutions the teacher belongs to.
-- When an affected student is safely identifiable (self-report by a student or linked-child report
-- by a parent), the student's linked parents and accepted institution(s) receive a safety copy.

create table if not exists public.behavior_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  affected_student_id uuid references public.profiles(id) on delete set null,
  title text not null,
  description text not null,
  category text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  constraint behavior_reports_title_length
    check (char_length(btrim(title)) between 3 and 160),
  constraint behavior_reports_description_length
    check (char_length(btrim(description)) between 10 and 6000),
  constraint behavior_reports_category_check
    check (
      category in (
        'bullying',
        'cyberbullying',
        'verbal_harassment',
        'physical_intimidation',
        'sexual_harassment',
        'discriminatory_harassment',
        'threats',
        'stalking',
        'hazing',
        'social_exclusion_rumors',
        'inappropriate_content',
        'impersonation',
        'privacy_violation',
        'extortion_coercion',
        'other'
      )
    ),
  constraint behavior_reports_status_check
    check (status in ('open', 'reviewing', 'resolved', 'dismissed'))
);

create index if not exists behavior_reports_reporter_idx
  on public.behavior_reports(reporter_id, created_at desc);

create index if not exists behavior_reports_reported_idx
  on public.behavior_reports(reported_user_id, created_at desc);

create index if not exists behavior_reports_student_idx
  on public.behavior_reports(affected_student_id, created_at desc);

create table if not exists public.behavior_report_recipients (
  report_id uuid not null
    references public.behavior_reports(id) on delete cascade,
  recipient_id uuid not null
    references public.profiles(id) on delete cascade,
  recipient_reason text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (report_id, recipient_id, recipient_reason),
  constraint behavior_report_recipient_reason_check
    check (
      recipient_reason in (
        'admin',
        'reported_teacher_institution',
        'affected_student_parent',
        'affected_student_institution'
      )
    )
);

create index if not exists behavior_report_recipients_user_idx
  on public.behavior_report_recipients(recipient_id, read_at, created_at desc);

alter table public.behavior_reports enable row level security;
alter table public.behavior_report_recipients enable row level security;

drop policy if exists "Reporters read own behavior reports"
on public.behavior_reports;

create policy "Reporters read own behavior reports"
on public.behavior_reports
for select
to authenticated
using (
  reporter_id = auth.uid()
  or public.is_examify_admin()
  or exists (
    select 1
    from public.behavior_report_recipients r
    where r.report_id = behavior_reports.id
      and r.recipient_id = auth.uid()
  )
);

drop policy if exists "Recipients read own report routing"
on public.behavior_report_recipients;

create policy "Recipients read own report routing"
on public.behavior_report_recipients
for select
to authenticated
using (
  recipient_id = auth.uid()
  or public.is_examify_admin()
);

drop policy if exists "Recipients update own read state"
on public.behavior_report_recipients;

create policy "Recipients update own read state"
on public.behavior_report_recipients
for update
to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

create or replace function public.search_reportable_accounts(
  p_query text,
  p_limit integer default 20
)
returns table (
  user_id uuid,
  display_name text,
  role text
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
    end as display_name,
    p.role
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

revoke all on function public.search_reportable_accounts(text, integer) from public;
grant execute on function public.search_reportable_accounts(text, integer) to authenticated;

create or replace function public.get_reporter_children()
returns table (
  student_id uuid,
  student_name text
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    p.id,
    coalesce(p.full_name, 'Student')
  from public.parent_student_links l
  join public.profiles p
    on p.id = l.student_id
   and p.role = 'student'
  where l.parent_id = auth.uid()
  order by coalesce(p.full_name, 'Student');
$$;

revoke all on function public.get_reporter_children() from public;
grant execute on function public.get_reporter_children() to authenticated;

create or replace function public.submit_behavior_report(
  p_title text,
  p_description text,
  p_category text,
  p_reported_user_id uuid default null,
  p_affected_student_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_reporter uuid := auth.uid();
  v_reporter_role text;
  v_reported_role text;
  v_affected_student uuid;
  v_report_id uuid;
begin
  if v_reporter is null then
    raise exception 'You must be signed in.';
  end if;

  if char_length(btrim(coalesce(p_title, ''))) < 3 then
    raise exception 'A report title is required.';
  end if;

  if char_length(btrim(coalesce(p_description, ''))) < 10 then
    raise exception 'Please provide more detail about what happened.';
  end if;

  if p_category not in (
    'bullying',
    'cyberbullying',
    'verbal_harassment',
    'physical_intimidation',
    'sexual_harassment',
    'discriminatory_harassment',
    'threats',
    'stalking',
    'hazing',
    'social_exclusion_rumors',
    'inappropriate_content',
    'impersonation',
    'privacy_violation',
    'extortion_coercion',
    'other'
  ) then
    raise exception 'Invalid report category.';
  end if;

  select p.role
  into v_reporter_role
  from public.profiles p
  where p.id = v_reporter;

  if p_reported_user_id = v_reporter then
    raise exception 'You cannot report your own account.';
  end if;

  if p_reported_user_id is not null then
    select p.role
    into v_reported_role
    from public.profiles p
    where p.id = p_reported_user_id;

    if v_reported_role is null then
      raise exception 'Reported account not found.';
    end if;
  end if;

  -- Student reports concern themselves by default.
  if v_reporter_role = 'student' then
    v_affected_student := v_reporter;

  -- Parents may identify only a child actually linked to their account.
  elsif v_reporter_role = 'parent'
    and p_affected_student_id is not null then

    if not exists (
      select 1
      from public.parent_student_links l
      where l.parent_id = v_reporter
        and l.student_id = p_affected_student_id
    ) then
      raise exception 'You can only submit a child safety report for a student linked to your parent account.';
    end if;

    v_affected_student := p_affected_student_id;
  else
    v_affected_student := null;
  end if;

  insert into public.behavior_reports (
    reporter_id,
    reported_user_id,
    affected_student_id,
    title,
    description,
    category
  )
  values (
    v_reporter,
    p_reported_user_id,
    v_affected_student,
    btrim(p_title),
    btrim(p_description),
    p_category
  )
  returning id into v_report_id;

  -- Admins always receive the report.
  insert into public.behavior_report_recipients (
    report_id,
    recipient_id,
    recipient_reason
  )
  select
    v_report_id,
    p.id,
    'admin'
  from public.profiles p
  where p.role = 'admin'
  on conflict do nothing;

  -- If a teacher is reported, alert each accepted institution the teacher belongs to.
  if v_reported_role = 'teacher' then
    insert into public.behavior_report_recipients (
      report_id,
      recipient_id,
      recipient_reason
    )
    select
      v_report_id,
      ir.institution_id,
      'reported_teacher_institution'
    from public.institution_relationships ir
    where ir.member_id = p_reported_user_id
      and ir.relationship_type = 'teacher'
      and ir.status = 'accepted'
    on conflict do nothing;
  end if;

  -- If an affected student is safely known, alert linked parents and accepted institutions.
  if v_affected_student is not null then
    insert into public.behavior_report_recipients (
      report_id,
      recipient_id,
      recipient_reason
    )
    select
      v_report_id,
      l.parent_id,
      'affected_student_parent'
    from public.parent_student_links l
    where l.student_id = v_affected_student
      and l.parent_id <> v_reporter
    on conflict do nothing;

    insert into public.behavior_report_recipients (
      report_id,
      recipient_id,
      recipient_reason
    )
    select
      v_report_id,
      ir.institution_id,
      'affected_student_institution'
    from public.institution_relationships ir
    where ir.member_id = v_affected_student
      and ir.relationship_type = 'student'
      and ir.status = 'accepted'
      and ir.institution_id is distinct from p_reported_user_id
    on conflict do nothing;
  end if;

  return v_report_id;
end;
$$;

revoke all on function public.submit_behavior_report(text, text, text, uuid, uuid) from public;
grant execute on function public.submit_behavior_report(text, text, text, uuid, uuid) to authenticated;

create or replace function public.get_my_submitted_behavior_reports()
returns table (
  report_id uuid,
  title text,
  description text,
  category text,
  status text,
  reported_user_id uuid,
  reported_user_name text,
  affected_student_id uuid,
  affected_student_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    r.id,
    r.title,
    r.description,
    r.category,
    r.status,
    r.reported_user_id,
    coalesce(
      case
        when rp.role = 'teacher' then rtp.display_name
        when rp.role = 'institution' then rip.name
        else rp.full_name
      end,
      'Not specified'
    ),
    r.affected_student_id,
    coalesce(ap.full_name, ''),
    r.created_at
  from public.behavior_reports r
  left join public.profiles rp on rp.id = r.reported_user_id
  left join public.teacher_profiles rtp on rtp.user_id = rp.id
  left join public.institution_profiles rip on rip.user_id = rp.id
  left join public.profiles ap on ap.id = r.affected_student_id
  where r.reporter_id = auth.uid()
  order by r.created_at desc;
$$;

revoke all on function public.get_my_submitted_behavior_reports() from public;
grant execute on function public.get_my_submitted_behavior_reports() to authenticated;

create or replace function public.get_my_received_behavior_reports()
returns table (
  report_id uuid,
  title text,
  description text,
  category text,
  status text,
  reporter_name text,
  reported_user_name text,
  affected_student_name text,
  recipient_reason text,
  read_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    r.id,
    r.title,
    r.description,
    r.category,
    r.status,
    coalesce(reporter.full_name, 'Examify user'),
    coalesce(
      case
        when reported.role = 'teacher' then reported_tp.display_name
        when reported.role = 'institution' then reported_ip.name
        else reported.full_name
      end,
      'Not specified'
    ),
    coalesce(student.full_name, ''),
    rr.recipient_reason,
    rr.read_at,
    r.created_at
  from public.behavior_report_recipients rr
  join public.behavior_reports r on r.id = rr.report_id
  left join public.profiles reporter on reporter.id = r.reporter_id
  left join public.profiles reported on reported.id = r.reported_user_id
  left join public.teacher_profiles reported_tp on reported_tp.user_id = reported.id
  left join public.institution_profiles reported_ip on reported_ip.user_id = reported.id
  left join public.profiles student on student.id = r.affected_student_id
  where rr.recipient_id = auth.uid()
  order by r.created_at desc;
$$;

revoke all on function public.get_my_received_behavior_reports() from public;
grant execute on function public.get_my_received_behavior_reports() to authenticated;

create or replace function public.mark_behavior_report_read(
  p_report_id uuid
)
returns void
language sql
security definer
set search_path = 'public'
as $$
  update public.behavior_report_recipients
  set read_at = coalesce(read_at, now())
  where report_id = p_report_id
    and recipient_id = auth.uid();
$$;

revoke all on function public.mark_behavior_report_read(uuid) from public;
grant execute on function public.mark_behavior_report_read(uuid) to authenticated;

create or replace function public.admin_update_behavior_report_status(
  p_report_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not public.is_examify_admin() then
    raise exception 'Admin access required.';
  end if;

  if p_status not in ('open', 'reviewing', 'resolved', 'dismissed') then
    raise exception 'Invalid status.';
  end if;

  update public.behavior_reports
  set
    status = p_status,
    updated_at = now(),
    resolved_at = case
      when p_status in ('resolved', 'dismissed') then now()
      else null
    end,
    resolved_by = case
      when p_status in ('resolved', 'dismissed') then auth.uid()
      else null
    end
  where id = p_report_id;
end;
$$;

revoke all on function public.admin_update_behavior_report_status(uuid, text) from public;
grant execute on function public.admin_update_behavior_report_status(uuid, text) to authenticated;

notify pgrst, 'reload schema';
