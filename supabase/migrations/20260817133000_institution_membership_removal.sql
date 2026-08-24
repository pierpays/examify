-- Examify Update 69: institution membership removal and family leave controls.
-- Active history (messages, exams, reports, prior relationship rows) is preserved.
-- Institution-class assignments are removed when active institution membership ends.

create or replace function public.get_institution_member_directory()
returns table(
  relationship_id uuid,
  member_id uuid,
  display_name text,
  relationship_type text,
  status text
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    ir.id,
    ir.member_id,
    case
      when p.role='teacher' then coalesce(tp.display_name,p.full_name,'Teacher')
      when p.role='parent' then coalesce(p.full_name,'Parent')
      else coalesce(p.full_name,'Student')
    end,
    ir.relationship_type,
    ir.status
  from public.institution_relationships ir
  join public.profiles p on p.id=ir.member_id
  left join public.teacher_profiles tp on tp.user_id=p.id
  where ir.institution_id=auth.uid()
  order by
    case ir.status when 'accepted' then 0 when 'pending' then 1 else 2 end,
    ir.relationship_type,
    3;
$$;
grant execute on function public.get_institution_member_directory() to authenticated;

create or replace function public.remove_institution_member(
  p_relationship_id uuid
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_rel public.institution_relationships%rowtype;
begin
  select * into v_rel
  from public.institution_relationships
  where id=p_relationship_id
    and institution_id=auth.uid();

  if not found then
    raise exception 'Institution relationship not found.';
  end if;

  if v_rel.status='accepted' then
    if v_rel.relationship_type='teacher' then
      delete from public.academic_group_teachers gt
      using public.academic_groups g
      where gt.group_id=g.id
        and g.institution_id=auth.uid()
        and g.group_kind='institution_class'
        and gt.teacher_id=v_rel.member_id;

      delete from public.academic_group_members gm
      using public.academic_groups g
      where gm.group_id=g.id
        and g.institution_id=auth.uid()
        and g.group_kind='institution_class'
        and gm.user_id=v_rel.member_id;
    elsif v_rel.relationship_type='student' then
      delete from public.academic_group_members gm
      using public.academic_groups g
      where gm.group_id=g.id
        and g.institution_id=auth.uid()
        and g.group_kind='institution_class'
        and gm.user_id=v_rel.member_id;
    end if;
  end if;

  -- Keep the relationship row as historical evidence rather than deleting it.
  update public.institution_relationships
  set status='rejected', responded_at=now()
  where id=v_rel.id;
end;
$$;
grant execute on function public.remove_institution_member(uuid) to authenticated;

create or replace function public.get_parent_institution_memberships()
returns table(
  institution_id uuid,
  institution_name text,
  member_id uuid,
  member_name text,
  relationship_type text,
  is_parent boolean
)
language sql
stable
security definer
set search_path='public'
as $$
  select
    ir.institution_id,
    coalesce(ip.name,'Institution'),
    ir.member_id,
    coalesce(p.full_name,case when ir.relationship_type='parent' then 'Parent' else 'Student' end),
    ir.relationship_type,
    ir.member_id=auth.uid()
  from public.institution_relationships ir
  join public.institution_profiles ip on ip.user_id=ir.institution_id
  join public.profiles p on p.id=ir.member_id
  where ir.status='accepted'
    and (
      ir.member_id=auth.uid()
      or (
        ir.relationship_type='student'
        and exists(
          select 1 from public.parent_student_links l
          where l.parent_id=auth.uid()
            and l.student_id=ir.member_id
        )
      )
    )
  order by ip.name,ir.relationship_type,4;
$$;
grant execute on function public.get_parent_institution_memberships() to authenticated;

create or replace function public.parent_leave_institution(
  p_institution_id uuid,
  p_member_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_member uuid;
begin
  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='parent'
  ) then
    raise exception 'Only a parent account can use this action.';
  end if;

  if p_member_ids is null or cardinality(p_member_ids)=0 then
    raise exception 'Choose at least one family member to remove.';
  end if;

  foreach v_member in array p_member_ids loop
    if v_member<>auth.uid()
       and not exists(
         select 1 from public.parent_student_links l
         where l.parent_id=auth.uid() and l.student_id=v_member
       )
    then
      raise exception 'You can only remove yourself or a linked child.';
    end if;

    if exists(
      select 1 from public.institution_relationships ir
      where ir.institution_id=p_institution_id
        and ir.member_id=v_member
        and ir.status='accepted'
        and (
          (v_member=auth.uid() and ir.relationship_type='parent')
          or
          (v_member<>auth.uid() and ir.relationship_type='student')
        )
    ) then
      if v_member<>auth.uid() then
        delete from public.academic_group_members gm
        using public.academic_groups g
        where gm.group_id=g.id
          and g.institution_id=p_institution_id
          and g.group_kind='institution_class'
          and gm.user_id=v_member;
      end if;

      update public.institution_relationships
      set status='rejected',responded_at=now()
      where institution_id=p_institution_id
        and member_id=v_member
        and status='accepted'
        and relationship_type=case when v_member=auth.uid() then 'parent' else 'student' end;
    end if;
  end loop;
end;
$$;
grant execute on function public.parent_leave_institution(uuid,uuid[]) to authenticated;

notify pgrst,'reload schema';
