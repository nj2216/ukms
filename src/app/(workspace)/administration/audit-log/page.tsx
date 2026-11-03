import { redirect } from "next/navigation";
import { AuditLogPage } from "@/components/extended-workflows";
import { currentSession } from "@/lib/auth";

export default async function Page() {
  const session = await currentSession();
  if (!session || session.membership.role !== "INSTITUTION_ADMIN") redirect("/dashboard");
  return <AuditLogPage />;
}
