import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_POLICY_VERSION } from "@/lib/policy";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "parent") {
    return NextResponse.json({ error: "Only parent accounts can create child accounts." }, { status: 403 });
  }

  const body = await request.json();
  const fullName = String(body.fullName ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const confirmPassword = String(body.confirmPassword ?? "");
  const parentPolicyAccepted = body.parentPolicyAccepted === true;

  if (!fullName || !email || password.length < 8) {
    return NextResponse.json(
      { error: "Name, email, and a password of at least 8 characters are required." },
      { status: 400 },
    );
  }

  if (password !== confirmPassword) {
    return NextResponse.json(
      { error: "Passwords do not match." },
      { status: 400 },
    );
  }

  if (!parentPolicyAccepted) {
    return NextResponse.json(
      {
        error:
          "Parent or guardian policy agreement is required before creating a child account.",
      },
      { status: 400 },
    );
  }

  const serviceKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    return NextResponse.json({ error: "Server admin key is not configured." }, { status: 500 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role: "student",
      policy_accepted: true,
      policy_version: CURRENT_POLICY_VERSION,
      policy_accepted_at: new Date().toISOString(),
      policy_acceptance_type: "parent_on_behalf",
      parent_user_id: user.id,
    },
  });

  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message ?? "Could not create student." }, { status: 400 });
  }

  const { error: linkError } = await admin.from("parent_student_links").insert({
    parent_id: user.id,
    student_id: created.user.id,
  });

  if (linkError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: linkError.message }, { status: 400 });
  }

  return NextResponse.json({
    studentId: created.user.id,
    message: "Student account created and linked.",
  });
}
