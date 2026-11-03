import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import { currentSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await currentSession();
  if (!session) redirect("/");
  if (session.user.mustChangePassword) redirect("/");

  return (
    <AppShell
      user={{
        name: session.user.name,
        email: session.user.email,
        role: session.membership.role,
        institutionName: session.membership.institution.name,
        campusName: session.membership.campus?.name ?? null,
      }}
    >
      {children}
    </AppShell>
  );
}
