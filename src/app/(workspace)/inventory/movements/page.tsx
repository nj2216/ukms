import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";
import { MovementsPage } from "@/components/workspace-pages";

export default async function Page() {
  const session = await currentSession();
  if (!session) redirect("/");
  return <MovementsPage role={session.membership.role} />;
}
