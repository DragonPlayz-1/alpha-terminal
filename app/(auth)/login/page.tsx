import { AuthLayout } from "@/components/auth-layout";
import { LoginForm } from "@/components/auth-forms";

export default function LoginPage() { return <AuthLayout mode="login" title="Welcome back." subtitle="Your simulated markets, positions, and progress are waiting."><LoginForm /></AuthLayout>; }
