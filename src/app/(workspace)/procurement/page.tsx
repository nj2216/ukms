import { redirect } from "next/navigation";
import { ProcurementPage } from "@/components/procurement-pages";
import { currentSession } from "@/lib/auth";

export default async function Page() {
  const session = await currentSession();
  if (!session) redirect("/");
  return (
    <ProcurementPage
      role={session.membership.role}
      assignedCampusId={session.membership.campusId}
    />
  );
}
