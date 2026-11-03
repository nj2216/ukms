import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";
import { StoresPage } from "@/components/workspace-pages";

export default async function Page() {
  const session = await currentSession();
  if (!session) redirect("/");
  return <StoresPage role={session.membership.role} />;
}
