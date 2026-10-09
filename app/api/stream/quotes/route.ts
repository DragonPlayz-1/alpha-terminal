import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiUser } from "@/server/auth/session";
import { apiError } from "@/lib/http";
import { subscribeQuotes } from "@/server/market-data/broadcast";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
  const requested = request.nextUrl.searchParams.get("symbols")?.split(",").map(s => s.trim().toUpperCase()).filter(Boolean) ?? [];
  if (requested.length > 30 || requested.some(s => !/^[A-Z0-9-]{3,30}$/.test(s))) return apiError("Invalid quote symbols.");
  const instruments = await db.instrument.findMany({ where: requested.length ? { symbol: { in: requested } } : { tradingStatus: "ACTIVE" }, select: { symbol: true }, take: 30 });
  if (!instruments.length) return apiError("No supported symbols.");
  const symbols = instruments.map(i => i.symbol);
  const encoder = new TextEncoder();
  let closed = false;
  let unsubscribe: (() => void) | undefined;
  let lifetime: ReturnType<typeof setTimeout> | undefined;
  let end: () => void = () => undefined;
  const clean = () => {
    closed = true; unsubscribe?.();
    if (lifetime) clearTimeout(lifetime);
    request.signal.removeEventListener("abort", end);
  };
  try {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        end = () => { clean(); try { controller.close(); } catch { /* already closed */ } };
        if (request.signal.aborted) { end(); return; }
        unsubscribe = subscribeQuotes({ userId: user.id, symbols, send(event, data) {
          if (closed) return;
          // Drop an update for a slow reader instead of growing an unbounded queue.
          if ((controller.desiredSize ?? 0) <= 0) return;
          try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); }
          catch { end(); }
        } });
        request.signal.addEventListener("abort", end, { once: true });
        // Periodic reconnection revalidates the session and releases resources.
        lifetime = setTimeout(end, 60000);
      },
      cancel() { clean(); },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "private, no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
  } catch { clean(); return apiError("Quote stream limit reached. Please retry shortly.", 429, "STREAM_LIMIT"); }
}
