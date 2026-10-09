export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function initials(value: string) {
  return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
