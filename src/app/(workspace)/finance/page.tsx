import { redirect } from "next/navigation";
import { FinancePage } from "@/components/extended-workflows";
import { currentSession } from "@/lib/auth";

export default async function Page() {
  const session = await currentSession();
  if (!session || !["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "FINANCE_OFFICER"].includes(session.membership.role)) redirect("/dashboard");
  return <FinancePage role={session.membership.role} assignedCampusId={session.membership.campusId} />;
}
