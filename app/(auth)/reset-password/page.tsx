import { AuthLayout } from "@/components/auth-layout";
import { RecoveryForm } from "@/components/recovery-form";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; kind?: string }> }) {
  const params = await searchParams;
  const verify = params.kind === "verify";
  return <AuthLayout mode="login" title={verify ? "Verify your email." : "Set a new password."} subtitle="This link can only be used once and expires after one hour."><RecoveryForm reset={!verify} verify={verify} token={params.token ?? ""} /></AuthLayout>;
}
