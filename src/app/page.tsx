import { currentSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Operations from "@/components/operations";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await currentSession();
  if (session && !session.user.mustChangePassword) redirect("/dashboard");
  const initialized = Boolean(
    await prisma.bootstrapState.findUnique({ where: { key: "complete" } }),
  );
  return (
    <main className="shell">
      <header className="masthead">
        <p className="eyebrow">Hostel Kitchen OS</p>
        <h1>Kitchen operations, in control.</h1>
        <p className="subtitle">Keep campus stock accurate, accountable, and ready for service.</p>
      </header>
      <Operations
        initialized={initialized}
        session={
          session
            ? {
                name: session.user.name,
                email: session.user.email,
                institutionName: session.membership.institution.name,
                institutionSlug: session.membership.institution.slug,
                campusName: session.membership.campus?.name ?? null,
                role: session.membership.role,
                mustChangePassword: session.user.mustChangePassword,
              }
            : null
        }
      />
      <footer>Operational data is isolated by institution and recorded in an audit trail.</footer>
    </main>
  );
}
