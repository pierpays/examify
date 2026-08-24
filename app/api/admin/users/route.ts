import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const ALLOWED_ROLES = new Set(["student", "teacher", "parent", "institution", "admin"]);

function cleanAdminKey(raw: string | undefined) {
  if (!raw) return "";

  // Be defensive against values accidentally pasted into Vercel as
  // KEY=value or as multiple env assignments on separate lines.
  const firstMeaningfulLine = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";

  const withoutAssignment = firstMeaningfulLine.replace(
    /^SUPABASE_(?:SECRET_KEY|SERVICE_ROLE_KEY)\s*=\s*/i,
    "",
  );

  // A valid Supabase key itself never contains whitespace. If another
  // assignment was accidentally appended, only use the key token.
  return withoutAssignment.trim().split(/\s+/)[0] ?? "";
}

function safeAdminError(context: string, error?: unknown, status = 500) {
  console.error(`[admin/users] ${context}`, error);
  return NextResponse.json(
    { error: "Unable to complete the admin user request. Check the server configuration and try again." },
    { status },
  );
}

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const secret = cleanAdminKey(
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  if (!secret) {
    return { error: NextResponse.json({ error: "Server admin key is not configured" }, { status: 500 }) };
  }

  try {
    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    return { user, admin };
  } catch (error) {
    return { error: safeAdminError("Unable to create Supabase admin client", error) };
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { admin } = auth;

  try {
    const [{ data: profiles, error: profileError }, { data: authData, error: authError }] = await Promise.all([
      admin
        .from("profiles")
        .select("id,full_name,username,role,created_at,is_disabled,disabled_reason,disabled_at")
        .order("created_at", { ascending: false }),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    if (profileError) return safeAdminError("Unable to load profiles", profileError);
    if (authError) return safeAdminError("Unable to load auth users", authError);

    const emails = new Map(authData.users.map((u) => [u.id, u.email ?? null]));
    return NextResponse.json({
      users: (profiles ?? []).map((p) => ({ ...p, email: emails.get(p.id) ?? null })),
    });
  } catch (error) {
    return safeAdminError("Unexpected GET failure", error);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { user: adminUser, admin } = auth;
  const body = await request.json();
  const userId = String(body.userId ?? "");
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof body.full_name === "string" || body.full_name === null) updates.full_name = body.full_name;
  if (typeof body.username === "string" || body.username === null) updates.username = body.username;

  if (typeof body.role === "string") {
    if (!ALLOWED_ROLES.has(body.role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    if (userId === adminUser.id && body.role !== "admin") {
      return NextResponse.json({ error: "You cannot remove your own admin role" }, { status: 400 });
    }
    updates.role = body.role;
  }

  if (typeof body.is_disabled === "boolean") {
    if (userId === adminUser.id && body.is_disabled) {
      return NextResponse.json({ error: "You cannot disable your own account" }, { status: 400 });
    }
    updates.is_disabled = body.is_disabled;
    updates.disabled_reason = body.is_disabled ? (String(body.disabled_reason ?? "").trim() || "Account temporarily disabled by an administrator.") : null;
    updates.disabled_at = body.is_disabled ? new Date().toISOString() : null;
  } else if (typeof body.disabled_reason === "string") {
    updates.disabled_reason = body.disabled_reason.trim() || null;
  }

  try {
    if (typeof body.email === "string" && body.email.trim()) {
      const { error } = await admin.auth.admin.updateUserById(userId, { email: body.email.trim() });
      if (error) return safeAdminError("Unable to update auth email", error, 400);
    }

    if (Object.keys(updates).length) {
      const { error } = await admin.from("profiles").update(updates).eq("id", userId);
      if (error) return safeAdminError("Unable to update profile", error, 400);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return safeAdminError("Unexpected PATCH failure", error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { user: adminUser, admin } = auth;
  const body = await request.json();
  const userId = String(body.userId ?? "");
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  if (userId === adminUser.id) return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });

  try {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return safeAdminError("Unable to delete auth user", error, 400);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return safeAdminError("Unexpected DELETE failure", error);
  }
}
