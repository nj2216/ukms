import { redirect } from "next/navigation";
import { ProductionPage } from "@/components/extended-workflows";
import { currentSession } from "@/lib/auth";

export default async function Page() {
  const session = await currentSession();
  if (!session || !["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "KITCHEN_STAFF"].includes(session.membership.role)) redirect("/dashboard");
  return <ProductionPage role={session.membership.role} assignedCampusId={session.membership.campusId} />;
}
