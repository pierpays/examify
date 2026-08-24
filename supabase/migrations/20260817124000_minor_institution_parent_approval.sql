-- Examify Update 58e: parent approval for institution requests involving minors.
-- Students under 18 cannot accept/reject an institution membership request themselves.
-- A linked parent must respond on the child's behalf.

create or replace function public.student_requires_parent_institution_approval(
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path='public'
as $$
  select
    p.role='student'
    and p.date_of_birth is not null
    and p.date_of_birth > (current_date - interval '18 years')::date
  from public.profiles p
  where p.id=p_student_id;
$$;

grant execute on function public.student_requires_parent_institution_approval(uuid)
to authenticated;

create or replace function public.send_institution_relationship_request(
  p_member_id uuid,
  p_relationship_type text
)
returns table(
  relationship_id uuid,
  approval_route text
)
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_institution uuid:=auth.uid();
  v_member_role text;
  v_dob date;
  v_id uuid;
  v_route text:='member';
begin
  if not exists(
    select 1
    from public.profiles p
    join public.institution_profiles ip on ip.user_id=p.id
    where p.id=v_institution
      and p.role='institution'
      and ip.verification_status='approved'
  ) then
    raise exception 'Only an approved institution can send membership requests.';
  end if;

  if p_relationship_type not in('teacher','student','parent') then
    raise exception 'Invalid institution relationship type.';
  end if;

  select role,date_of_birth
  into v_member_role,v_dob
  from public.profiles
  where id=p_member_id;

  if v_member_role is null or v_member_role<>p_relationship_type then
    raise exception 'The selected account does not match this relationship type.';
  end if;

  if p_relationship_type='student' then
    if v_dob is null then
      raise exception 'This student must have a date of birth before an institution request can be sent.';
    end if;

    if v_dob > (current_date - interval '18 years')::date then
      if not exists(
        select 1
        from public.parent_student_links l
        where l.student_id=p_member_id
      ) then
        raise exception 'A student under 18 must have a linked parent or guardian before an institution request can be sent.';
      end if;

      v_route:='parent';
    end if;
  end if;

  insert into public.institution_relationships(
    institution_id,
    member_id,
    relationship_type,
    status,
    responded_at
  )
  values(
    v_institution,
    p_member_id,
    p_relationship_type,
    'pending',
    null
  )
  on conflict(institution_id,member_id,relationship_type)
  do update set
    status='pending',
    responded_at=null
  returning id into v_id;

  return query select v_id,v_route;
end;
$$;

grant execute on function public.send_institution_relationship_request(uuid,text)
to authenticated;

create or replace function public.respond_to_institution_relationship(
  p_relationship_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_relationship public.institution_relationships%rowtype;
begin
  if p_status not in('accepted','rejected') then
    raise exception 'Invalid response.';
  end if;

  select *
  into v_relationship
  from public.institution_relationships
  where id=p_relationship_id;

  if v_relationship.id is null then
    raise exception 'Institution request not found.';
  end if;

  if v_relationship.member_id<>auth.uid() then
    raise exception 'You cannot respond to this institution request.';
  end if;

  if v_relationship.status<>'pending' then
    raise exception 'This institution request has already been answered.';
  end if;

  if v_relationship.relationship_type='student'
     and public.student_requires_parent_institution_approval(v_relationship.member_id)
  then
    raise exception 'A linked parent or guardian must respond to this request.';
  end if;

  update public.institution_relationships
  set status=p_status,
      responded_at=now()
  where id=p_relationship_id;
end;
$$;

grant execute on function public.respond_to_institution_relationship(uuid,text)
to authenticated;

create or replace function public.respond_to_child_institution_request(
  p_relationship_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_relationship public.institution_relationships%rowtype;
begin
  if p_status not in('accepted','rejected') then
    raise exception 'Invalid response.';
  end if;

  select *
  into v_relationship
  from public.institution_relationships
  where id=p_relationship_id
    and relationship_type='student';

  if v_relationship.id is null then
    raise exception 'Student institution request not found.';
  end if;

  if v_relationship.status<>'pending' then
    raise exception 'This institution request has already been answered.';
  end if;

  if not public.student_requires_parent_institution_approval(v_relationship.member_id) then
    raise exception 'This student can respond to their own institution request.';
  end if;

  if not exists(
    select 1
    from public.parent_student_links l
    where l.parent_id=auth.uid()
      and l.student_id=v_relationship.member_id
  ) then
    raise exception 'You are not linked to this student as a parent or guardian.';
  end if;

  update public.institution_relationships
  set status=p_status,
      responded_at=now()
  where id=p_relationship_id;
end;
$$;

grant execute on function public.respond_to_child_institution_request(uuid,text)
to authenticated;

create or replace function public.get_parent_child_institution_requests()
returns table(
  relationship_id uuid,
  institution_id uuid,
  institution_name text,
  student_id uuid,
  student_name text,
  status text,
  created_at timestamptz,
  responded_at timestamptz
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    ir.id,
    ir.institution_id,
    coalesce(ip.name,'Institution'),
    ir.member_id,
    coalesce(student.full_name,'Student'),
    ir.status,
    ir.created_at,
    ir.responded_at
  from public.parent_student_links l
  join public.institution_relationships ir
    on ir.member_id=l.student_id
   and ir.relationship_type='student'
  join public.profiles student
    on student.id=l.student_id
  left join public.institution_profiles ip
    on ip.user_id=ir.institution_id
  where l.parent_id=auth.uid()
    and public.student_requires_parent_institution_approval(l.student_id)
  order by
    case when ir.status='pending' then 0 else 1 end,
    ir.created_at desc;
$$;

grant execute on function public.get_parent_child_institution_requests()
to authenticated;

create or replace function public.get_my_student_institution_requests()
returns table(
  relationship_id uuid,
  institution_id uuid,
  institution_name text,
  status text,
  requires_parent_approval boolean,
  created_at timestamptz,
  responded_at timestamptz
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    ir.id,
    ir.institution_id,
    coalesce(ip.name,'Institution'),
    ir.status,
    public.student_requires_parent_institution_approval(auth.uid()),
    ir.created_at,
    ir.responded_at
  from public.institution_relationships ir
  left join public.institution_profiles ip
    on ip.user_id=ir.institution_id
  where ir.member_id=auth.uid()
    and ir.relationship_type='student'
  order by
    case when ir.status='pending' then 0 else 1 end,
    ir.created_at desc;
$$;

grant execute on function public.get_my_student_institution_requests()
to authenticated;

-- Direct client UPDATEs must not be able to bypass the age/guardian checks.
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname='public'
      and tablename='institution_relationships'
      and cmd='UPDATE'
  loop
    execute format(
      'drop policy if exists %I on public.institution_relationships',
      r.policyname
    );
  end loop;
end $$;

notify pgrst,'reload schema';
