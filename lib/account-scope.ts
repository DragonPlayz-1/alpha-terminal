export function withScope(href: string, scope: string) {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const url = new URL(href, "http://scope.local");
  if (!url.searchParams.has("scope") && scope !== "main") url.searchParams.set("scope", scope);
  return `${url.pathname}${url.search}${url.hash}`;
}
