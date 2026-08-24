import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(".env.local"));
loadEnvFile(path.resolve(".env"));

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL;

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(`
Missing Supabase admin credentials.

Required:
  NEXT_PUBLIC_SUPABASE_URL=...
  SUPABASE_SERVICE_ROLE_KEY=...

Do not commit the service-role key to Git.
`);
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const ACCOUNTS = [
  {
    "key": "institution1",
    "role": "institution",
    "email": "demo.northbridge@examify.test",
    "password": "Northbridge!2026",
    "name": "Northbridge Academy"
  },
  {
    "key": "institution2",
    "role": "institution",
    "email": "demo.riverside@examify.test",
    "password": "Riverside!2026",
    "name": "Riverside Technical Institute"
  },
  {
    "key": "institution3",
    "role": "institution",
    "email": "demo.horizon@examify.test",
    "password": "Horizon!2026",
    "name": "Horizon Learning Center"
  },
  {
    "key": "teacher1",
    "role": "teacher",
    "email": "demo.daniel.carter@examify.test",
    "password": "DanielTeacher!26",
    "name": "Daniel Carter"
  },
  {
    "key": "teacher2",
    "role": "teacher",
    "email": "demo.sofia.rivera@examify.test",
    "password": "SofiaTeacher!26",
    "name": "Sofia Rivera"
  },
  {
    "key": "teacher3",
    "role": "teacher",
    "email": "demo.michael.chen@examify.test",
    "password": "MichaelTeacher!26",
    "name": "Michael Chen"
  },
  {
    "key": "parent1",
    "role": "parent",
    "email": "demo.laura.bennett@examify.test",
    "password": "LauraParent!2026",
    "name": "Laura Bennett"
  },
  {
    "key": "parent2",
    "role": "parent",
    "email": "demo.carlos.mendez@examify.test",
    "password": "CarlosParent!2026",
    "name": "Carlos Mendez"
  },
  {
    "key": "parent3",
    "role": "parent",
    "email": "demo.priya.shah@examify.test",
    "password": "PriyaParent!2026",
    "name": "Priya Shah"
  },
  {
    "key": "student1a",
    "role": "student",
    "email": "demo.emma.bennett@examify.test",
    "password": "EmmaStudent!2026",
    "name": "Emma Bennett"
  },
  {
    "key": "student1b",
    "role": "student",
    "email": "demo.ethan.bennett@examify.test",
    "password": "EthanStudent!2026",
    "name": "Ethan Bennett"
  },
  {
    "key": "student2a",
    "role": "student",
    "email": "demo.sofia.mendez@examify.test",
    "password": "SofiaStudent!2026",
    "name": "Sofia Mendez"
  },
  {
    "key": "student2b",
    "role": "student",
    "email": "demo.lucas.mendez@examify.test",
    "password": "LucasStudent!2026",
    "name": "Lucas Mendez"
  },
  {
    "key": "student3a",
    "role": "student",
    "email": "demo.anika.shah@examify.test",
    "password": "AnikaStudent!2026",
    "name": "Anika Shah"
  },
  {
    "key": "student3b",
    "role": "student",
    "email": "demo.aarav.shah@examify.test",
    "password": "AaravStudent!2026",
    "name": "Aarav Shah"
  }
];

const PROFILE_EXTRAS = {
  institution1: {
    bio: "A fictional secondary school focused on technology, academic achievement, and student safety."
  },
  institution2: {
    bio: "A fictional technical institute specializing in applied technology, engineering, and career readiness."
  },
  institution3: {
    bio: "A fictional learning center focused on STEM, digital skills, and collaborative education."
  },
  teacher1: {
    career: "Computer Science Teacher",
    studying_at: "Northbridge Academy",
    bio: "Computer Science instructor focused on networking, cloud fundamentals, and digital literacy."
  },
  teacher2: {
    career: "Mathematics Teacher",
    studying_at: "Riverside Technical Institute",
    bio: "Mathematics instructor focused on algebra, applied mathematics, and problem solving."
  },
  teacher3: {
    career: "Science & Technology Teacher",
    studying_at: "Horizon Learning Center",
    bio: "STEM instructor focused on science, technology, robotics, and project-based learning."
  },
  parent1: {
    bio: "Demo parent account used to present parental oversight and minor-safety features."
  },
  parent2: {
    bio: "Demo parent account used to present institution requests, child oversight, and safety controls."
  },
  parent3: {
    bio: "Demo parent account used to present read-only child message review and teacher safety controls."
  },
  student1a: {
    career: "Student",
    studying_at: "Northbridge Academy",
    date_of_birth: "2011-03-14",
    show_birthday: false,
    bio: "Grade 10 student interested in computer science and networking."
  },
  student1b: {
    career: "Student",
    studying_at: "Northbridge Academy",
    date_of_birth: "2012-08-09",
    show_birthday: false,
    bio: "Grade 9 student interested in coding, cybersecurity, and technology."
  },
  student2a: {
    career: "Student",
    studying_at: "Riverside Technical Institute",
    date_of_birth: "2010-11-22",
    show_birthday: false,
    bio: "Grade 11 student interested in mathematics, engineering, and data analysis."
  },
  student2b: {
    career: "Student",
    studying_at: "Riverside Technical Institute",
    date_of_birth: "2012-01-18",
    show_birthday: false,
    bio: "Grade 9 student interested in robotics, mathematics, and technical design."
  },
  student3a: {
    career: "Student",
    studying_at: "Horizon Learning Center",
    date_of_birth: "2011-06-30",
    show_birthday: false,
    bio: "Grade 10 student interested in science, robotics, and environmental technology."
  },
  student3b: {
    career: "Student",
    studying_at: "Horizon Learning Center",
    date_of_birth: "2013-02-05",
    show_birthday: false,
    bio: "Grade 8 student interested in coding, science projects, and digital creativity."
  },
};

const INSTITUTION_DETAILS = {
  institution1: {
    name: "Northbridge Academy",
    description:
      "A fictional verified academy created for Examify proof-of-concept presentations. Focus areas include technology, academic excellence, and student safety.",
    website_url: "https://example.com/northbridge",
    physical_address: "100 Learning Way, Demo City",
    contact_email: "demo.northbridge@examify.test",
    phone_number: "+1 555 010 1101",
  },
  institution2: {
    name: "Riverside Technical Institute",
    description:
      "A fictional verified technical institute used to demonstrate institution management, classes, teachers, students, and academic communities.",
    website_url: "https://example.com/riverside",
    physical_address: "225 Innovation Avenue, Demo City",
    contact_email: "demo.riverside@examify.test",
    phone_number: "+1 555 010 2202",
  },
  institution3: {
    name: "Horizon Learning Center",
    description:
      "A fictional verified learning center used to demonstrate STEM classes, parent oversight, events, groups, and social learning.",
    website_url: "https://example.com/horizon",
    physical_address: "310 Discovery Road, Demo City",
    contact_email: "demo.horizon@examify.test",
    phone_number: "+1 555 010 3303",
  },
};

const TEACHER_DETAILS = {
  teacher1: {
    display_name: "Daniel Carter",
    headline: "Computer Science Teacher · Networking & Cloud Fundamentals",
    bio: "Computer Science instructor focused on networking, cloud fundamentals, digital literacy, and certification readiness.",
    website_url: "https://example.com/daniel-carter",
  },
  teacher2: {
    display_name: "Sofia Rivera",
    headline: "Mathematics Teacher · Algebra & Applied Mathematics",
    bio: "Mathematics instructor focused on algebra, applied mathematics, problem solving, and technical education.",
    website_url: "https://example.com/sofia-rivera",
  },
  teacher3: {
    display_name: "Michael Chen",
    headline: "Science & Technology Teacher · STEM & Robotics",
    bio: "STEM instructor focused on science, robotics, technology, and project-based learning.",
    website_url: "https://example.com/michael-chen",
  },
};

const DEMO_GROUPS = [
  {
    institutionKey: "institution1",
    teacherKey: "teacher1",
    parentKey: "parent1",
    studentKeys: ["student1a", "student1b"],
    year: "2026–2027",
    className: "Computer Science 10-A",
    description: "Demo class for networking, cloud fundamentals, and computer science.",
  },
  {
    institutionKey: "institution2",
    teacherKey: "teacher2",
    parentKey: "parent2",
    studentKeys: ["student2a", "student2b"],
    year: "2026–2027",
    className: "Applied Mathematics 11-B",
    description: "Demo class for algebra, applied mathematics, and engineering foundations.",
  },
  {
    institutionKey: "institution3",
    teacherKey: "teacher3",
    parentKey: "parent3",
    studentKeys: ["student3a", "student3b"],
    year: "2026–2027",
    className: "STEM & Robotics 10-C",
    description: "Demo class for robotics, STEM projects, science, and technology.",
  },
];

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;

    const found = data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase()
    );

    if (found) return found;
    if (data.users.length < 1000) break;
  }

  return null;
}

async function ensureAuthUser(def) {
  let user = await findUserByEmail(def.email);

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: def.email,
      password: def.password,
      email_confirm: true,
      user_metadata: {
        full_name: def.name,
        role: def.role,
        demo_account: true,
      },
    });

    if (error) throw error;
    user = data.user;
    console.log(`Created Auth user: ${def.email}`);
  } else {
    const { data, error } =
      await supabase.auth.admin.updateUserById(user.id, {
        password: def.password,
        email_confirm: true,
        user_metadata: {
          ...(user.user_metadata ?? {}),
          full_name: def.name,
          role: def.role,
          demo_account: true,
        },
      });

    if (error) throw error;
    user = data.user;
    console.log(`Updated Auth user: ${def.email}`);
  }

  return user;
}

async function upsert(table, row, conflict) {
  const { error } = await supabase
    .from(table)
    .upsert(row, { onConflict: conflict });

  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }
}

async function ensureProfile(id, def) {
  await upsert(
    "profiles",
    {
      id,
      full_name: def.name,
      role: def.role,
      profile_visibility: "examify",
      message_permission: "everyone",
      connection_request_permission: "everyone",
      ...(PROFILE_EXTRAS[def.key] ?? {}),
    },
    "id"
  );
}

async function ensureInstitutionProfile(id, key) {
  const info = INSTITUTION_DETAILS[key];

  await upsert(
    "institution_profiles",
    {
      user_id: id,
      name: info.name,
      description: info.description,
      website_url: info.website_url,
      is_public: true,
      physical_address: info.physical_address,
      contact_email: info.contact_email,
      phone_number: info.phone_number,
      verification_status: "approved",
      verification_submitted_at: new Date().toISOString(),
      verified_at: new Date().toISOString(),
      verification_notes:
        "Fictional Examify proof-of-concept institution.",
    },
    "user_id"
  );
}

async function ensureTeacherProfile(id, key) {
  const info = TEACHER_DETAILS[key];

  await upsert(
    "teacher_profiles",
    {
      user_id: id,
      display_name: info.display_name,
      headline: info.headline,
      bio: info.bio,
      website_url: info.website_url,
      is_verified: true,
      is_public: true,
    },
    "user_id"
  );
}

async function ensureRelationship(
  institutionId,
  memberId,
  type
) {
  await upsert(
    "institution_relationships",
    {
      institution_id: institutionId,
      member_id: memberId,
      relationship_type: type,
      status: "accepted",
      responded_at: new Date().toISOString(),
    },
    "institution_id,member_id,relationship_type"
  );
}

async function getOrCreateAcademicYear(institutionId, yearName) {
  const { data: existing, error: readError } = await supabase
    .from("institution_academic_years")
    .select("id")
    .eq("institution_id", institutionId)
    .eq("name", yearName)
    .maybeSingle();

  if (readError) throw readError;
  if (existing?.id) return existing.id;

  const { data, error } = await supabase
    .from("institution_academic_years")
    .insert({
      institution_id: institutionId,
      name: yearName,
      starts_on: "2026-08-01",
      ends_on: "2027-06-30",
      is_active: true,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function getOrCreateClass(
  institutionId,
  yearId,
  className,
  description
) {
  const { data: existing, error: readError } = await supabase
    .from("academic_groups")
    .select("id")
    .eq("institution_id", institutionId)
    .eq("academic_year_id", yearId)
    .eq("group_kind", "institution_class")
    .eq("name", className)
    .maybeSingle();

  if (readError) throw readError;
  if (existing?.id) return existing.id;

  const groupCode =
    `POC${Date.now().toString(36).slice(-6).toUpperCase()}`;

  const { data, error } = await supabase
    .from("academic_groups")
    .insert({
      owner_id: institutionId,
      name: className,
      description,
      group_code: groupCode,
      join_mode: "closed",
      institution_id: institutionId,
      academic_year_id: yearId,
      group_kind: "institution_class",
      category: "class",
      is_discoverable: false,
      is_archived: false,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function seedConversation(studentId, teacherId, studentName, teacherName) {
  const [one, two] =
    studentId < teacherId
      ? [studentId, teacherId]
      : [teacherId, studentId];

  const { data: existing, error: readError } = await supabase
    .from("direct_conversations")
    .select("id")
    .eq("user_one_id", one)
    .eq("user_two_id", two)
    .maybeSingle();

  if (readError) throw readError;

  let conversationId = existing?.id;

  if (!conversationId) {
    const { data, error } = await supabase
      .from("direct_conversations")
      .insert({
        user_one_id: one,
        user_two_id: two,
      })
      .select("id")
      .single();

    if (error) throw error;
    conversationId = data.id;
  }

  const { count, error: countError } = await supabase
    .from("direct_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  if (countError) throw countError;

  if ((count ?? 0) === 0) {
    const now = Date.now();

    const messages = [
      {
        conversation_id: conversationId,
        sender_id: teacherId,
        body: `Hi ${studentName.split(" ")[0]}. I posted the review material for our next class.`,
        created_at: new Date(now - 50 * 60 * 1000).toISOString(),
      },
      {
        conversation_id: conversationId,
        sender_id: studentId,
        body: `Thank you, ${teacherName}. Which section should I review first?`,
        created_at: new Date(now - 45 * 60 * 1000).toISOString(),
      },
      {
        conversation_id: conversationId,
        sender_id: teacherId,
        body: "Start with the first practice module, then complete the questions in our class group.",
        created_at: new Date(now - 40 * 60 * 1000).toISOString(),
      },
      {
        conversation_id: conversationId,
        sender_id: studentId,
        body: "Got it. I will work on that today.",
        created_at: new Date(now - 35 * 60 * 1000).toISOString(),
      },
    ];

    const { error } = await supabase
      .from("direct_messages")
      .insert(messages);

    if (error) throw error;
  }
}

async function seedPost(authorId, body) {
  const { data: existing, error: readError } = await supabase
    .from("feed_posts")
    .select("id")
    .eq("author_id", authorId)
    .eq("body", body)
    .maybeSingle();

  if (readError) throw readError;
  if (existing) return;

  const { error } = await supabase
    .from("feed_posts")
    .insert({
      author_id: authorId,
      post_type: "post",
      body,
      audience: "examify",
      moderation_status: "active",
    });

  if (error) throw error;
}

async function main() {
  console.log("\nCreating Examify multi-account proof-of-concept data...\n");

  const authUsers = {};

  for (const def of ACCOUNTS) {
    authUsers[def.key] = await ensureAuthUser(def);
    await ensureProfile(authUsers[def.key].id, def);
  }

  const ids = Object.fromEntries(
    Object.entries(authUsers).map(([key, user]) => [key, user.id])
  );

  for (const key of ["institution1", "institution2", "institution3"]) {
    await ensureInstitutionProfile(ids[key], key);
  }

  for (const key of ["teacher1", "teacher2", "teacher3"]) {
    await ensureTeacherProfile(ids[key], key);
  }

  const parentChildPairs = [
    ["parent1", "student1a"],
    ["parent1", "student1b"],
    ["parent2", "student2a"],
    ["parent2", "student2b"],
    ["parent3", "student3a"],
    ["parent3", "student3b"],
  ];

  for (const [parentKey, studentKey] of parentChildPairs) {
    await upsert(
      "parent_student_links",
      {
        parent_id: ids[parentKey],
        student_id: ids[studentKey],
        relationship_label: "parent",
      },
      "parent_id,student_id"
    );
  }

  for (const demo of DEMO_GROUPS) {
    await ensureRelationship(
      ids[demo.institutionKey],
      ids[demo.teacherKey],
      "teacher"
    );

    await ensureRelationship(
      ids[demo.institutionKey],
      ids[demo.parentKey],
      "parent"
    );

    for (const studentKey of demo.studentKeys) {
      await ensureRelationship(
        ids[demo.institutionKey],
        ids[studentKey],
        "student"
      );
    }

    const yearId = await getOrCreateAcademicYear(
      ids[demo.institutionKey],
      demo.year
    );

    const classId = await getOrCreateClass(
      ids[demo.institutionKey],
      yearId,
      demo.className,
      demo.description
    );

    await upsert(
      "academic_group_members",
      {
        group_id: classId,
        user_id: ids[demo.institutionKey],
        membership_role: "owner",
        status: "active",
        responded_at: new Date().toISOString(),
      },
      "group_id,user_id"
    );

    await upsert(
      "academic_group_teachers",
      {
        group_id: classId,
        teacher_id: ids[demo.teacherKey],
        assigned_by: ids[demo.institutionKey],
      },
      "group_id,teacher_id"
    );

    await upsert(
      "academic_group_members",
      {
        group_id: classId,
        user_id: ids[demo.teacherKey],
        membership_role: "moderator",
        status: "active",
        invited_by: ids[demo.institutionKey],
        responded_at: new Date().toISOString(),
      },
      "group_id,user_id"
    );

    for (const studentKey of demo.studentKeys) {
      await upsert(
        "academic_group_members",
        {
          group_id: classId,
          user_id: ids[studentKey],
          membership_role: "member",
          status: "active",
          invited_by: ids[demo.institutionKey],
          responded_at: new Date().toISOString(),
        },
        "group_id,user_id"
      );

      await upsert(
        "teacher_followers",
        {
          teacher_id: ids[demo.teacherKey],
          student_id: ids[studentKey],
        },
        "teacher_id,student_id"
      );

      const studentDef = ACCOUNTS.find((a) => a.key === studentKey);
      const teacherDef = ACCOUNTS.find(
        (a) => a.key === demo.teacherKey
      );

      await seedConversation(
        ids[studentKey],
        ids[demo.teacherKey],
        studentDef.name,
        teacherDef.name
      );
    }
  }

  await seedPost(
    ids.institution1,
    "Welcome to Northbridge Academy on Examify. Our 2026–2027 academic community is active."
  );
  await seedPost(
    ids.institution2,
    "Riverside Technical Institute is using Examify for academic classes, practice exams, and family engagement."
  );
  await seedPost(
    ids.institution3,
    "Horizon Learning Center welcomes students, parents, and teachers to our STEM learning community."
  );
  await seedPost(
    ids.teacher1,
    "Computer Science students: this week we are reviewing networking fundamentals and IP addressing."
  );
  await seedPost(
    ids.teacher2,
    "Applied Mathematics students: remember to complete the algebra practice set before our next class."
  );
  await seedPost(
    ids.teacher3,
    "STEM students: our next robotics activity will focus on sensors and simple automation."
  );

  console.log(`
============================================================
EXAMIFY MULTI-ACCOUNT POC DATA READY
============================================================

Created/updated:
  3 institutions
  3 teachers
  3 parents
  6 minor students (2 children per parent)
  3 academic years
  3 institution classes
  6 parent-child relationships
  6 student-teacher class relationships
  sample message histories
  sample feed posts

See DEMO-ACCOUNTS.md for every username and password.
============================================================
`);
}

main().catch((error) => {
  console.error("\nPOC account creation failed:\n", error);
  process.exit(1);
});
