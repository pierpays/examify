import { createClient } from "@/lib/supabase/server";
import AuthenticatedShell, { type AppRole } from "@/components/navigation/authenticated-shell";

export default async function PublicAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return children;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return children;

  return (
    <AuthenticatedShell role={profile.role as AppRole}>
      {children}
    </AuthenticatedShell>
  );
}
