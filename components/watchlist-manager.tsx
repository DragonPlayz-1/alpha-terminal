"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, ListPlus, Star, Trash2, X } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { Button, Card, EmptyState, IconButton, Skeleton } from "@/components/ui";
import { useWatchlists, watchlistsChanged } from "@/components/use-watchlists";

export function WatchlistManager() {
  const { watchlists, loading, error: loadError } = useWatchlists();
  const [selectedId, setSelectedId] = useState("");
  const [newName, setNewName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const selected = watchlists.find(list => list.id === selectedId) ?? watchlists.find(list => list.isDefault) ?? watchlists[0];
  async function mutate(url: string, method: string, body: unknown, message: string) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(""); setStatus("");
    try {
      const result = await apiRequest<{ watchlist?: { id: string } }>(url, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (result.watchlist) { setSelectedId(result.watchlist.id); setNewName(""); }
      setStatus(message); watchlistsChanged();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update watchlist."); }
    finally { locked.current = false; setBusy(false); }
  }
  function move(index: number, direction: number) {
    if (!selected) return;
    const items = [...selected.items];
    [items[index], items[index + direction]] = [items[index + direction], items[index]];
    void mutate(`/api/watchlists/${selected.id}`, "PATCH", { itemOrder: items.map((item, sortOrder) => ({ id: item.id, sortOrder })) }, "Watchlist reordered.");
  }
  return <Card className="mb-5 overflow-hidden">
    <div className="flex flex-col gap-4 border-b border-white/[.06] p-5 lg:flex-row lg:justify-between">
      <div><h2 className="flex items-center gap-2 text-sm font-semibold text-white"><ListPlus size={17} />Watchlists</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Manage lists and symbols. Market stars use your default list.</p></div>
      <form onSubmit={event => { event.preventDefault(); void mutate("/api/watchlists", "POST", { name: newName }, "Watchlist created."); }} className="flex min-w-0 gap-2"><input aria-label="New watchlist name" required maxLength={40} value={newName} onChange={event => setNewName(event.target.value)} placeholder="New watchlist" className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-xs" /><Button type="submit" disabled={busy || loading}>Create</Button></form>
    </div>
    {(error || loadError) && <p role="alert" className="px-5 py-3 text-xs text-[var(--negative)]">{error || loadError}<Button size="sm" variant="ghost" onClick={watchlistsChanged}>Retry</Button></p>}
    {status && <p role="status" className="px-5 pt-3 text-xs text-[var(--positive)]">{status}</p>}
    {loading ? <div className="p-5"><Skeleton className="h-36" /></div> : !selected ? <EmptyState icon={ListPlus} title="Create your first watchlist" description="Save a named list, then add the symbols you follow." /> : <div className="grid lg:grid-cols-[210px_1fr]">
      <div className="space-y-1 border-b border-white/[.06] p-3 lg:border-r lg:border-b-0">{watchlists.map(list => <button type="button" key={list.id} onClick={() => setSelectedId(list.id)} className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-xs ${selected.id === list.id ? "bg-[var(--accent)]/15 text-white" : "text-[var(--muted)] hover:bg-white/5"}`}><span className="truncate">{list.name}</span><span className="flex items-center gap-2">{list.isDefault && <Star size={12} className="text-amber-300" />} {list.items.length}</span></button>)}</div>
      <div className="min-w-0 p-4">
        <form key={selected.id + selected.name} onSubmit={event => { event.preventDefault(); const name = new FormData(event.currentTarget).get("name"); void mutate(`/api/watchlists/${selected.id}`, "PATCH", { name }, "Watchlist renamed."); }} className="flex flex-wrap items-center gap-2">
          <input name="name" aria-label="Active watchlist name" required maxLength={40} defaultValue={selected.name} className="h-11 min-w-0 flex-1 basis-full rounded-xl border border-white/10 bg-white/5 px-3 text-xs sm:basis-0" /><Button type="submit" size="sm" variant="secondary" disabled={busy}>Rename</Button>
          <Button size="sm" variant="ghost" disabled={busy || selected.isDefault} onClick={() => void mutate(`/api/watchlists/${selected.id}`, "PATCH", { isDefault: true }, "Default watchlist updated.")}>{selected.isDefault ? "Default" : "Set default"}</Button>
          <IconButton label="Delete watchlist" disabled={busy} onClick={() => void mutate(`/api/watchlists/${selected.id}`, "DELETE", undefined, "Watchlist deleted.")}><Trash2 size={15} /></IconButton>
        </form>
        <form onSubmit={event => { event.preventDefault(); void mutate(`/api/watchlists/${selected.id}/items`, "POST", { symbol }, "Symbol added."); }} className="mt-3 flex gap-2"><input aria-label="Add watchlist symbol" required value={symbol} onChange={event => setSymbol(event.target.value)} placeholder="BTC-USD" maxLength={30} className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-xs uppercase" /><Button type="submit" variant="secondary" disabled={busy}>Add symbol</Button></form>
        <div className="mt-4 divide-y divide-white/[.06]">{selected.items.length ? selected.items.map((item, index) => <div key={item.id} className="flex items-center gap-2 py-3"><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{item.instrument.symbol}</div><div className="truncate text-[10px] text-[var(--muted)]">{item.instrument.name}</div></div><IconButton label={`Move ${item.instrument.symbol} up`} disabled={busy || index === 0} onClick={() => move(index, -1)}><ChevronUp size={15} /></IconButton><IconButton label={`Move ${item.instrument.symbol} down`} disabled={busy || index === selected.items.length - 1} onClick={() => move(index, 1)}><ChevronDown size={15} /></IconButton><IconButton label={`Remove ${item.instrument.symbol}`} disabled={busy} onClick={() => void mutate(`/api/watchlists/${selected.id}/items?itemId=${item.id}`, "DELETE", undefined, "Symbol removed.")}><X size={15} /></IconButton></div>) : <EmptyState title="No saved symbols" description="Add a symbol above or use a market’s star button." />}</div>
      </div>
    </div>}
  </Card>;
}
