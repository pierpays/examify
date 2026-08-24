import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AuthenticatedShell from "@/components/navigation/authenticated-shell";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "student") {
    redirect("/feed");
  }

  return (
    <AuthenticatedShell role="student">
      {children}
    </AuthenticatedShell>
  );
}
