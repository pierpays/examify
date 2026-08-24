import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AuthenticatedShell, { type AppRole } from "@/components/navigation/authenticated-shell";

export default async function NotificationsLayout({
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

  if (!profile) redirect("/login");

  return (
    <AuthenticatedShell role={profile.role as AppRole}>
      {children}
    </AuthenticatedShell>
  );
}
