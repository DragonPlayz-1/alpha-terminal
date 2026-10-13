export class ApiRequestError extends Error {
  constructor(message: string, public status = 0, public code = "REQUEST_FAILED", public retryAfter?: number, public requestId?: string) {
    super(message);
    this.name = "ApiRequestError";
  }
}

function requestSignal(external: AbortSignal | null | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const abort = () => controller.abort(external?.reason);
  if (external?.aborted) abort();
  else external?.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => { clearTimeout(timer); external?.removeEventListener("abort", abort); },
  };
}

export async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const request = requestSignal(options.signal, 15_000);
  try {
    const response = await fetch(url, { cache: "no-store", ...options, credentials: options.credentials ?? "same-origin", signal: request.signal });
    let body: unknown;
    try { body = await response.json(); }
    catch (error) { if (request.signal.aborted) throw error; }
    const envelope = body && typeof body === "object" ? body as { data?: T; error?: { code?: unknown; message?: unknown } } : null;
    if (!response.ok) {
      const code = typeof envelope?.error?.code === "string" ? envelope.error.code : "REQUEST_FAILED";
      const message = typeof envelope?.error?.message === "string" ? envelope.error.message : "Request failed. Please try again.";
      const retryHeader = response.headers.get("Retry-After");
      const retryAfter = retryHeader ? (/^\d+$/.test(retryHeader) ? Number(retryHeader) : Math.ceil((Date.parse(retryHeader) - Date.now()) / 1000)) : undefined;
      throw new ApiRequestError(message, response.status, code, retryAfter !== undefined && Number.isFinite(retryAfter) ? Math.max(0, retryAfter) : undefined, response.headers.get("X-Request-ID") ?? undefined);
    }
    if (!envelope || !("data" in envelope)) throw new ApiRequestError("The server returned an invalid response.", 0, "INVALID_RESPONSE");
    return envelope.data as T;
  } catch (error) {
    if (options.signal?.aborted) throw new ApiRequestError("Request cancelled.", 0, "REQUEST_CANCELLED");
    if (request.timedOut()) throw new ApiRequestError("The request timed out. Check your connection and try again.", 0, "REQUEST_TIMEOUT");
    if (error instanceof ApiRequestError) throw error;
    throw new ApiRequestError("Connection interrupted. Please try again.");
  } finally {
    request.cleanup();
  }
}
