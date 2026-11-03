import { redirect } from "next/navigation";
import { TeamPage } from "@/components/workspace-pages";
import { currentSession } from "@/lib/auth";

export default async function Page() {
  const session = await currentSession();
  if (!session || session.membership.role !== "INSTITUTION_ADMIN") redirect("/dashboard");
  return <TeamPage actorEmail={session.user.email} />;
}
