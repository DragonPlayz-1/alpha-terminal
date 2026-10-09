import { apiError, apiSuccess } from "@/lib/http";
import { db } from "@/lib/db";
import { requireApiUser } from "@/server/auth/session";
import { reconcile } from "@/server/trading/ledger";
export async function GET() { const user = await requireApiUser(); if (!user || user.role !== "ADMIN") return apiError("Admin access required.", 403); const accounts = await db.tradingAccount.findMany({ select: { id: true } }); const results = await Promise.all(accounts.map(a => reconcile(a.id))); return apiSuccess({ ok: results.every(r => r.ok), results }); }
