import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";
import { IngredientsPage } from "@/components/workspace-pages";

export default async function Page() {
  const session = await currentSession();
  if (!session) redirect("/");
  return <IngredientsPage canManage={session.membership.role === "INSTITUTION_ADMIN"} />;
}
