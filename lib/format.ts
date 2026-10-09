export function formatCurrency(value: number | string, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits,
  }).format(Number(value));
}

export function formatNumber(value: number | string, maximumFractionDigits = 4) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(Number(value));
}

export function formatPercent(value: number | string, maximumFractionDigits = 2) {
  return `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(maximumFractionDigits)}%`;
}

export function formatRelativeTime(date: string | Date) {
  const delta = Date.now() - new Date(date).getTime();
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(date));
}
