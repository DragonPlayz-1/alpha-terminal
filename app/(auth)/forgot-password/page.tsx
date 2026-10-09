import { AuthLayout } from "@/components/auth-layout";
import { RecoveryForm } from "@/components/recovery-form";
export default function ForgotPasswordPage() { return <AuthLayout mode="login" title="Reset your password." subtitle="We will send a one-time recovery link if the account exists."><RecoveryForm /></AuthLayout>; }
