import { redirect } from "next/navigation";
import { SuppliersPage } from "@/components/procurement-pages";
import { currentSession } from "@/lib/auth";

export default async function Page() {
  const session = await currentSession();
  if (!session) redirect("/");
  return <SuppliersPage role={session.membership.role} />;
}
