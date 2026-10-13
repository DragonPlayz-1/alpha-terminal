import { AuthLayout } from "@/components/auth-layout";
import { LoginForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/server/auth/session";
import { redirect } from "next/navigation";
import { safeReturnTo } from "@/lib/auth-navigation";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const returnTo = safeReturnTo((await searchParams).next);
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect(returnTo);
  return <AuthLayout mode="login" title="Welcome back." subtitle="Your simulated markets, positions, and progress are waiting."><LoginForm returnTo={returnTo} /></AuthLayout>;
}
