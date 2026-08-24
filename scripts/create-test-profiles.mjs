import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const contents = fs.readFileSync(filePath, "utf8");

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const projectRoot = process.cwd();
loadEnvFile(path.join(projectRoot, ".env.local"));
loadEnvFile(path.join(projectRoot, ".env"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL was not found in .env.local, .env, or the shell environment.");
  process.exit(1);
}

if (!serviceKey) {
  console.error(`ERROR: A Supabase server/admin key is required.

Add ONE of these to .env.local before running this script:
  SUPABASE_SERVICE_ROLE_KEY=...
  SUPABASE_SECRET_KEY=...

Do not paste this secret into ChatGPT or commit it to Git.`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const TEST_PASSWORD = process.env.EXAMIFY_TEST_PASSWORD || "ExamifyTest123!";

const TEST_USERS = [
  {
    key: "institution",
    email: "examify-academy-test@example.com",
    password: TEST_PASSWORD,
    role: "institution",
    fullName: "Examify Academy",
  },
  {
    key: "parent",
    email: "maria.testparent@example.com",
    password: TEST_PASSWORD,
    role: "parent",
    fullName: "Maria Testparent",
  },
];

async function findUserByEmail(email) {
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw error;

    const found = data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );

    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function ensureAuthUser(testUser) {
  let user = await findUserByEmail(testUser.email);

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: testUser.email,
      password: testUser.password,
      email_confirm: true,
      user_metadata: {
        full_name: testUser.fullName,
        role: testUser.role,
        test_account: true,
      },
    });

    if (error) throw error;
    user = data.user;
    console.log(`Created ${testUser.role} auth user: ${testUser.email}`);
  } else {
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
      password: testUser.password,
      email_confirm: true,
      user_metadata: {
        ...(user.user_metadata ?? {}),
        full_name: testUser.fullName,
        role: testUser.role,
        test_account: true,
      },
    });

    if (error) throw error;
    user = data.user;
    console.log(`Updated existing ${testUser.role} test user: ${testUser.email}`);
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: user.id,
    full_name: testUser.fullName,
    role: testUser.role,
  });

  if (profileError) throw profileError;

  return user;
}

async function main() {
  console.log("Creating/updating Examify dummy test profiles...\n");

  const institutionAuth = await ensureAuthUser(TEST_USERS[0]);
  const parentAuth = await ensureAuthUser(TEST_USERS[1]);

  const { error: institutionError } = await supabase
    .from("institution_profiles")
    .upsert({
      user_id: institutionAuth.id,
      name: "Examify Academy",
      description:
        "Examify Academy is a fictional technology-focused learning institution created exclusively for testing Examify features. It offers sample programs in cloud computing, networking, cybersecurity, and IT certification preparation.",
      website_url: "https://example.com/examify-academy",
      is_public: true,
      updated_at: new Date().toISOString(),
    });

  if (institutionError) throw institutionError;

  // Keep the parent profile intentionally generic. At this stage Examify stores
  // the parent's public account information in public.profiles. The auth metadata
  // below gives us extra harmless test information without exposing it publicly.
  const { error: parentMetadataError } = await supabase.auth.admin.updateUserById(
    parentAuth.id,
    {
      user_metadata: {
        ...(parentAuth.user_metadata ?? {}),
        full_name: "Maria Testparent",
        role: "parent",
        test_account: true,
        testing_notes: "Fictional parent profile for Examify QA only",
        preferred_language: "English",
      },
    },
  );

  if (parentMetadataError) throw parentMetadataError;

  console.log("\nDummy profiles are ready.\n");
  console.log("INSTITUTION TEST ACCOUNT");
  console.log(`  Name:     Examify Academy`);
  console.log(`  Email:    ${TEST_USERS[0].email}`);
  console.log(`  Password: ${TEST_PASSWORD}`);
  console.log("  Role:     institution");
  console.log("  Public:   yes");
  console.log("");
  console.log("PARENT TEST ACCOUNT");
  console.log(`  Name:     Maria Testparent`);
  console.log(`  Email:    ${TEST_USERS[1].email}`);
  console.log(`  Password: ${TEST_PASSWORD}`);
  console.log("  Role:     parent");
  console.log("");
  console.log("The script is idempotent: running it again updates these same two test accounts instead of creating duplicates.");
}

main().catch((error) => {
  console.error("\nFailed to create dummy profiles:");
  console.error(error?.message ?? error);
  process.exit(1);
});
