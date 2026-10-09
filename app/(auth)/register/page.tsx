import { AuthLayout } from "@/components/auth-layout";
import { RegisterForm } from "@/components/auth-forms";

export default function RegisterPage() { return <AuthLayout mode="register" title="Open your terminal." subtitle="Choose your starting capital, build your first position, and make every decision count."><RegisterForm /></AuthLayout>; }
