import { AppShell } from "@/components/app-shell";
import { ScopeSwitcher } from "@/components/scope-switcher";
import { QuickCommandPalette } from "@/components/quick-command-palette";
import { requireUser } from "@/server/auth/session";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell user={{ username: user.username, role: user.role }}><QuickCommandPalette /><ScopeSwitcher />{children}</AppShell>;
}
