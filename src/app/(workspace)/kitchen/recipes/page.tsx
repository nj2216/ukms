import { redirect } from "next/navigation";
import { RecipesPage } from "@/components/kitchen-pages";
import { currentSession } from "@/lib/auth";

export default async function Page() {
  const session = await currentSession();
  if (!session) redirect("/");
  if (session.membership.role === "STOREKEEPER") redirect("/dashboard");
  return <RecipesPage role={session.membership.role} />;
}
