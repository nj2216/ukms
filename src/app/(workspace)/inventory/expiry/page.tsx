import { redirect } from "next/navigation";
import { ExpiryPage } from "@/components/workspace-pages";
import { currentSession } from "@/lib/auth";

export default async function Page() {
  const session = await currentSession();
  if (!session) redirect("/");
  return <ExpiryPage />;
}
