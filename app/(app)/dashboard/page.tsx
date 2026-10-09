import { DashboardClient } from "@/components/dashboard-client";
import { requireUser } from "@/server/auth/session";

export default async function DashboardPage() {
  const user = await requireUser();
  return <DashboardClient username={user.username} />;
}
