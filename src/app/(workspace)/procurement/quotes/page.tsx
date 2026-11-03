import { redirect } from "next/navigation";
import { QuotesPage } from "@/components/extended-workflows";
import { currentSession } from "@/lib/auth";

export default async function Page() {
  const session = await currentSession();
  if (!session || !["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "PROCUREMENT_OFFICER"].includes(session.membership.role)) redirect("/dashboard");
  return <QuotesPage role={session.membership.role} />;
}
