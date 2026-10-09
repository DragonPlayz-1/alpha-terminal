import { redirect } from "next/navigation";
import { AdminClient } from "@/components/admin-client";
import { getCurrentUser } from "@/server/auth/session";
export default async function AdminPage() { const user = await getCurrentUser(); if (!user || user.role !== "ADMIN") redirect("/dashboard"); return <AdminClient />; }
