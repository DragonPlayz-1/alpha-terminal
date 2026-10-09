import { apiError, apiSuccess } from "@/lib/http";
import { db } from "@/lib/db";
import { requireApiUser } from "@/server/auth/session";
export async function GET() { const user = await requireApiUser(); if (!user || user.role !== "ADMIN") return apiError("Admin access required.", 403); const [users, accounts, openOrders, feeds] = await Promise.all([db.user.count(), db.tradingAccount.count(), db.order.count({ where: { status: "OPEN" } }), db.marketQuote.count({ where: { mode: "LIVE" } })]); return apiSuccess({ users, accounts, openOrders, liveFeeds: feeds, checkedAt: new Date().toISOString() }); }
