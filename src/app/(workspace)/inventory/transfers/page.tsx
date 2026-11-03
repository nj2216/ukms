import { redirect } from "next/navigation";
import { TransfersPage } from "@/components/extended-workflows";
import { currentSession } from "@/lib/auth";

export default async function Page() {
  const session = await currentSession();
  if (!session || !["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "STOREKEEPER"].includes(session.membership.role)) redirect("/dashboard");
  return <TransfersPage role={session.membership.role} />;
}
