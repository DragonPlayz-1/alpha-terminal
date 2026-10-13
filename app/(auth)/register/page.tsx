import { AuthLayout } from "@/components/auth-layout";
import { RegisterForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/server/auth/session";
import { redirect } from "next/navigation";

export default async function RegisterPage() {
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect("/dashboard");
  return <AuthLayout mode="register" title="Open your terminal." subtitle="Choose your starting capital, build your first position, and make every decision count."><RegisterForm /></AuthLayout>;
}
