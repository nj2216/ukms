import { redirect } from "next/navigation";
import DashboardPage from "@/components/dashboard-page";
import { currentSession } from "@/lib/auth";

export default async function Page() {
  const session = await currentSession();
  if (!session) redirect("/");
  return <DashboardPage role={session.membership.role} />;
}
