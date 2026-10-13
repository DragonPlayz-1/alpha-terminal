"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";

export type Watchlist = { id: string; name: string; isDefault: boolean; items: Array<{ id: string; sortOrder: number; instrument: { symbol: string; name: string; baseAsset: string } }> };
export function watchlistsChanged() { window.dispatchEvent(new Event("watchlists-changed")); }
export function useWatchlists() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let controller: AbortController;
    function load() {
      controller?.abort(); controller = new AbortController();
      const signal = controller.signal;
      setLoading(true);
      void apiRequest<{ watchlists: Watchlist[] }>("/api/watchlists", { signal }).then(body => { setWatchlists(body.watchlists); setError(""); }).catch(caught => { if (!signal.aborted) setError(caught instanceof Error ? caught.message : "Watchlists unavailable."); }).finally(() => { if (!signal.aborted) setLoading(false); });
    }
    load(); window.addEventListener("watchlists-changed", load);
    return () => { controller.abort(); window.removeEventListener("watchlists-changed", load); };
  }, []);
  return { watchlists, loading, error };
}
