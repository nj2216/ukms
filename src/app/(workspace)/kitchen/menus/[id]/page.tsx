import { redirect } from "next/navigation";
import { MenuRequirementsPage } from "@/components/kitchen-pages";
import { currentSession } from "@/lib/auth";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await currentSession();
  if (!session) redirect("/");
  if (session.membership.role === "STOREKEEPER") redirect("/dashboard");
  const { id } = await params;
  return <MenuRequirementsPage menuPlanId={id} role={session.membership.role} />;
}
