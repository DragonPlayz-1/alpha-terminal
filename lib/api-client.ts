export class ApiRequestError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}
export async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...options, signal: options.signal ?? AbortSignal.timeout(15000) }); }
  catch { throw new ApiRequestError("Connection interrupted. Please try again."); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiRequestError(body?.error?.message ?? "Request failed. Please try again.", response.status);
  if (!body || !("data" in body)) throw new ApiRequestError("The server returned an invalid response.");
  return body.data as T;
}
