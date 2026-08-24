-- ============================================================
-- Examify - Initial Database Schema
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1. PROFILES
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  username text unique,
  full_name text,
  avatar_url text,

  role text not null default 'student'
    check (role in ('student', 'teacher', 'admin')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles(role);
create index profiles_username_idx on public.profiles(username);


-- ============================================================
-- 2. TEACHER PROFILES
-- ============================================================

create table public.teacher_profiles (
  user_id uuid primary key
    references public.profiles(id) on delete cascade,

  display_name text not null,
  headline text,
  bio text,

  website_url text,
  profile_image_url text,
  banner_image_url text,

  is_verified boolean not null default false,
  is_public boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index teacher_profiles_public_idx
  on public.teacher_profiles(is_public);

create index teacher_profiles_verified_idx
  on public.teacher_profiles(is_verified);


-- ============================================================
-- 3. CERTIFICATIONS
-- ============================================================

create table public.certifications (
  id uuid primary key default gen_random_uuid(),

  slug text not null unique,
  provider text not null,
  name text not null,
  code text,

  description text,
  logo_url text,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index certifications_provider_idx
  on public.certifications(provider);

create index certifications_active_idx
  on public.certifications(is_active);


-- ============================================================
-- 4. EXAMS
-- ============================================================

create table public.exams (
  id uuid primary key default gen_random_uuid(),

  teacher_id uuid not null
    references public.teacher_profiles(user_id) on delete cascade,

  certification_id uuid
    references public.certifications(id) on delete set null,

  title text not null,
  slug text not null,

  short_description text,
  description text,
  cover_image_url text,

  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),

  visibility text not null default 'public'
    check (visibility in ('public', 'unlisted', 'private')),

  passing_score integer not null default 70
    check (passing_score between 0 and 100),

  time_limit_minutes integer
    check (
      time_limit_minutes is null
      or time_limit_minutes > 0
    ),

  published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint exams_teacher_slug_unique
    unique (teacher_id, slug)
);

create index exams_teacher_idx
  on public.exams(teacher_id);

create index exams_certification_idx
  on public.exams(certification_id);

create index exams_status_idx
  on public.exams(status);

create index exams_public_discovery_idx
  on public.exams(status, visibility, published_at desc);


-- ============================================================
-- 5. QUESTIONS
-- ============================================================

create table public.questions (
  id uuid primary key default gen_random_uuid(),

  teacher_id uuid not null
    references public.teacher_profiles(user_id) on delete cascade,

  certification_id uuid
    references public.certifications(id) on delete set null,

  question_text text not null,

  question_type text not null default 'single_choice'
    check (
      question_type in (
        'single_choice',
        'multiple_choice'
      )
    ),

  difficulty text not null default 'medium'
    check (
      difficulty in (
        'easy',
        'medium',
        'hard'
      )
    ),

  explanation text,

  status text not null default 'draft'
    check (
      status in (
        'draft',
        'published',
        'archived'
      )
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index questions_teacher_idx
  on public.questions(teacher_id);

create index questions_certification_idx
  on public.questions(certification_id);

create index questions_status_idx
  on public.questions(status);

create index questions_difficulty_idx
  on public.questions(difficulty);


-- ============================================================
-- 6. QUESTION OPTIONS
-- ============================================================

create table public.question_options (
  id uuid primary key default gen_random_uuid(),

  question_id uuid not null
    references public.questions(id) on delete cascade,

  option_key text not null,
  option_text text not null,

  is_correct boolean not null default false,
  display_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint question_options_key_unique
    unique (question_id, option_key)
);

create index question_options_question_idx
  on public.question_options(question_id);

create index question_options_order_idx
  on public.question_options(question_id, display_order);


-- ============================================================
-- 7. EXAM QUESTIONS
-- Questions are reusable across multiple exams.
-- ============================================================

create table public.exam_questions (
  id uuid primary key default gen_random_uuid(),

  exam_id uuid not null
    references public.exams(id) on delete cascade,

  question_id uuid not null
    references public.questions(id) on delete cascade,

  display_order integer not null default 0,

  points numeric(8,2) not null default 1
    check (points > 0),

  created_at timestamptz not null default now(),

  constraint exam_questions_unique
    unique (exam_id, question_id)
);

create index exam_questions_exam_idx
  on public.exam_questions(exam_id);

create index exam_questions_question_idx
  on public.exam_questions(question_id);

create index exam_questions_order_idx
  on public.exam_questions(exam_id, display_order);


-- ============================================================
-- 8. UPDATED_AT FUNCTION + TRIGGERS
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger teacher_profiles_set_updated_at
before update on public.teacher_profiles
for each row execute function public.set_updated_at();

create trigger certifications_set_updated_at
before update on public.certifications
for each row execute function public.set_updated_at();

create trigger exams_set_updated_at
before update on public.exams
for each row execute function public.set_updated_at();

create trigger questions_set_updated_at
before update on public.questions
for each row execute function public.set_updated_at();

create trigger question_options_set_updated_at
before update on public.question_options
for each row execute function public.set_updated_at();


-- ============================================================
-- 9. AUTOMATIC PROFILE CREATION
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    avatar_url
  )
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();


-- ============================================================
-- 10. TEACHER HELPER
-- ============================================================

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('teacher', 'admin')
  );
$$;

revoke all on function public.is_teacher() from public;
grant execute on function public.is_teacher() to authenticated;


-- ============================================================
-- 11. ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.teacher_profiles enable row level security;
alter table public.certifications enable row level security;
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.exam_questions enable row level security;


-- ============================================================
-- 12. PROFILE POLICIES
-- ============================================================

create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());


-- ============================================================
-- 13. TEACHER PROFILE POLICIES
-- ============================================================

create policy "Public teacher profiles are readable"
on public.teacher_profiles
for select
to anon, authenticated
using (
  is_public = true
  or user_id = auth.uid()
);

create policy "Teachers can create own teacher profile"
on public.teacher_profiles
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_teacher()
);

create policy "Teachers can update own teacher profile"
on public.teacher_profiles
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and public.is_teacher()
);

create policy "Teachers can delete own teacher profile"
on public.teacher_profiles
for delete
to authenticated
using (user_id = auth.uid());


-- ============================================================
-- 14. CERTIFICATION POLICIES
-- ============================================================

create policy "Active certifications are public"
on public.certifications
for select
to anon, authenticated
using (is_active = true);


-- ============================================================
-- 15. EXAM POLICIES
-- ============================================================

create policy "Published exams are public"
on public.exams
for select
to anon, authenticated
using (
  (
    status = 'published'
    and visibility in ('public', 'unlisted')
  )
  or teacher_id = auth.uid()
);

create policy "Teachers can create exams"
on public.exams
for insert
to authenticated
with check (
  teacher_id = auth.uid()
  and public.is_teacher()
);

create policy "Teachers can update own exams"
on public.exams
for update
to authenticated
using (teacher_id = auth.uid())
with check (
  teacher_id = auth.uid()
  and public.is_teacher()
);

create policy "Teachers can delete own exams"
on public.exams
for delete
to authenticated
using (teacher_id = auth.uid());


-- ============================================================
-- 16. QUESTION POLICIES
-- ============================================================

create policy "Teachers can read own or published questions"
on public.questions
for select
to anon, authenticated
using (
  teacher_id = auth.uid()
  or exists (
    select 1
    from public.exam_questions eq
    join public.exams e on e.id = eq.exam_id
    where eq.question_id = questions.id
      and e.status = 'published'
      and e.visibility in ('public', 'unlisted')
  )
);

create policy "Teachers can create questions"
on public.questions
for insert
to authenticated
with check (
  teacher_id = auth.uid()
  and public.is_teacher()
);

create policy "Teachers can update own questions"
on public.questions
for update
to authenticated
using (teacher_id = auth.uid())
with check (
  teacher_id = auth.uid()
  and public.is_teacher()
);

create policy "Teachers can delete own questions"
on public.questions
for delete
to authenticated
using (teacher_id = auth.uid());


-- ============================================================
-- 17. QUESTION OPTION POLICIES
-- ============================================================

create policy "Question options follow question visibility"
on public.question_options
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.questions q
    where q.id = question_options.question_id
      and (
        q.teacher_id = auth.uid()
        or exists (
          select 1
          from public.exam_questions eq
          join public.exams e on e.id = eq.exam_id
          where eq.question_id = q.id
            and e.status = 'published'
            and e.visibility in ('public', 'unlisted')
        )
      )
  )
);

create policy "Teachers can create options for own questions"
on public.question_options
for insert
to authenticated
with check (
  exists (
    select 1
    from public.questions q
    where q.id = question_options.question_id
      and q.teacher_id = auth.uid()
  )
);

create policy "Teachers can update options on own questions"
on public.question_options
for update
to authenticated
using (
  exists (
    select 1
    from public.questions q
    where q.id = question_options.question_id
      and q.teacher_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.questions q
    where q.id = question_options.question_id
      and q.teacher_id = auth.uid()
  )
);

create policy "Teachers can delete options on own questions"
on public.question_options
for delete
to authenticated
using (
  exists (
    select 1
    from public.questions q
    where q.id = question_options.question_id
      and q.teacher_id = auth.uid()
  )
);


-- ============================================================
-- 18. EXAM QUESTION POLICIES
-- ============================================================

create policy "Published exam question mappings are public"
on public.exam_questions
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.exams e
    where e.id = exam_questions.exam_id
      and (
        (
          e.status = 'published'
          and e.visibility in ('public', 'unlisted')
        )
        or e.teacher_id = auth.uid()
      )
  )
);

create policy "Teachers can add questions to own exams"
on public.exam_questions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.exams e
    where e.id = exam_questions.exam_id
      and e.teacher_id = auth.uid()
  )
  and exists (
    select 1
    from public.questions q
    where q.id = exam_questions.question_id
      and q.teacher_id = auth.uid()
  )
);

create policy "Teachers can update own exam questions"
on public.exam_questions
for update
to authenticated
using (
  exists (
    select 1
    from public.exams e
    where e.id = exam_questions.exam_id
      and e.teacher_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.exams e
    where e.id = exam_questions.exam_id
      and e.teacher_id = auth.uid()
  )
);

create policy "Teachers can remove questions from own exams"
on public.exam_questions
for delete
to authenticated
using (
  exists (
    select 1
    from public.exams e
    where e.id = exam_questions.exam_id
      and e.teacher_id = auth.uid()
  )
);
