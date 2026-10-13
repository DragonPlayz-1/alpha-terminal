"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";
import { withScope } from "@/lib/account-scope";

export function ScopedLink({ href, ...props }: ComponentProps<typeof Link>) {
  const params = useSearchParams();
  return <Link {...props} href={typeof href === "string" ? withScope(href, params.get("scope") ?? "main") : href} />;
}
