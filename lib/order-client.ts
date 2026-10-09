import { apiRequest, ApiRequestError } from "./api-client";

type Pending = { signature: string; clientOrderId: string; createdAt: number };
export async function submitPaperOrder(payload: Record<string, unknown>) {
  const signature = JSON.stringify(payload);
  const storageKey = "alpha-pending-order";
  let pending: Pending | null = null;
  try { pending = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as Pending | null; } catch { /* unavailable storage */ }
  if (!pending || pending.signature !== signature) pending = { signature, clientOrderId: crypto.randomUUID(), createdAt: Date.now() };
  try { sessionStorage.setItem(storageKey, JSON.stringify(pending)); } catch { /* storage quota */ }
  try {
    const result = await apiRequest<{ order: { id: string; status: string } }>("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, clientOrderId: pending.clientOrderId }) });
    try { sessionStorage.removeItem(storageKey); } catch { /* unavailable storage */ }
    return result;
  } catch (error) {
    // A lost response can follow a committed fill. Keep the key for a retry.
    if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) {
      try { sessionStorage.removeItem(storageKey); } catch { /* unavailable storage */ }
    }
    throw error;
  }
}
