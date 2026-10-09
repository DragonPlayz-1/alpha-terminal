import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { workerHealth } from "@/server/worker-health";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    const worker = await workerHealth();
    return NextResponse.json({ status: worker.healthy ? "ready" : "degraded", database: "ok", worker }, { status: worker.healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "degraded", database: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
