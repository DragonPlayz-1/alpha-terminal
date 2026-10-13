export function safeReturnTo(value?: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return "/dashboard";
  const pathname = value.split(/[?#]/)[0];
  if (!/^\/(dashboard|terminal|markets|portfolio|orders|history|futures|challenges|leaderboards|notifications|settings|help|admin|profile)(\/|$)/.test(pathname)) return "/dashboard";
  return value;
}
