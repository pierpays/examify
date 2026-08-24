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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function arg(name) {
  const prefix = `--${name}=`;
  const item = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : null;
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
const email = arg("email") || process.env.EXAMIFY_ADMIN_EMAIL;
const password = arg("password") || process.env.EXAMIFY_ADMIN_PASSWORD;
const name = arg("name") || process.env.EXAMIFY_ADMIN_NAME || "Examify Admin";

if (!url || !key) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL and a Supabase server/admin key are required in .env.local.");
  process.exit(1);
}
if (!email || !password) {
  console.error(`Usage:\n  npm run create:admin -- --email=you@example.com --password='StrongPassword!' --name='Examify Admin'`);
  process.exit(1);
}
if (password.length < 8) {
  console.error("ERROR: Use an admin password with at least 8 characters.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function findUserByEmail(targetEmail) {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === targetEmail.toLowerCase());
    if (found) return found;
    if (data.users.length < 1000) return null;
    page += 1;
  }
}

async function main() {
  let user = await findUserByEmail(email);
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name, role: "admin" },
    });
    if (error) throw error;
    user = data.user;
    console.log(`Created admin auth user: ${email}`);
  } else {
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { ...(user.user_metadata ?? {}), full_name: name, role: "admin" },
    });
    if (error) throw error;
    user = data.user;
    console.log(`Updated existing auth user: ${email}`);
  }

  const { error: profileError } = await supabase.from("profiles").upsert({ id: user.id, full_name: name, role: "admin" });
  if (profileError) throw profileError;

  console.log("\nExamify admin account is ready.");
  console.log(`Name:  ${name}`);
  console.log(`Email: ${email}`);
  console.log("Role:  admin");
}

main().catch((error) => {
  console.error("\nFailed to create admin account:");
  console.error(error?.message ?? error);
  process.exit(1);
});
