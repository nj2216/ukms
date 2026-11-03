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
    <main className="auth-page">
      <div className="auth-layout">
        <aside className="auth-story" aria-label="Hostel Kitchen OS overview">
          <a className="auth-brand" href="/" aria-label="Hostel Kitchen OS home">
            <span className="auth-brand-mark" aria-hidden="true">H</span>
            <span>Hostel Kitchen OS</span>
          </a>
          <div className="auth-story-copy">
            <p className="auth-kicker"><span aria-hidden="true" /> Built for campus operations</p>
            <h1>Every meal,<br />ready to run.</h1>
            <p className="auth-story-description">
              Bring kitchen planning, stock control, and purchasing together in one clear workspace.
            </p>
          </div>
          <div className="auth-workflow" aria-label="Connected kitchen workflow">
            <div className="auth-workflow-heading">
              <span className="auth-workflow-icon" aria-hidden="true">↗</span>
              <div>
                <strong>From plan to plate</strong>
                <span>One connected workflow</span>
              </div>
            </div>
            <div className="auth-workflow-steps" aria-hidden="true">
              <span><i>01</i> Plan</span><b />
              <span><i>02</i> Stock</span><b />
              <span><i>03</i> Serve</span>
            </div>
          </div>
          <p className="auth-story-footer">Clear records. Confident service. Every campus.</p>
        </aside>
        <section className="auth-panel">
          <div className="auth-panel-mobile-brand">
            <span className="auth-brand-mark" aria-hidden="true">H</span>
            <span>Hostel Kitchen OS</span>
          </div>
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
          <footer className="auth-panel-footer">
            <span className="auth-security-mark" aria-hidden="true">✓</span>
            Institution data is private and access is securely controlled.
          </footer>
        </section>
      </div>
    </main>
  );
}
