import { redirect } from "next/navigation";
import { SuppliersPage } from "@/components/procurement-pages";
import { currentSession } from "@/lib/auth";

export default async function Page() {
  const session = await currentSession();
  if (!session || !["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "KITCHEN_STAFF", "STOREKEEPER", "PROCUREMENT_OFFICER"].includes(session.membership.role)) redirect("/dashboard");
  return <SuppliersPage role={session.membership.role} />;
}
