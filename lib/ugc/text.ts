export function clampText(text: string, max: number): string {
  const clean = String(text || "").replace(/\s+/g, " ").trim();

  return clean.length > max ? `${clean.slice(0, max - 1).trim()}...` : clean;
}

export function titleCase(value: string): string {
  const clean = String(value || "").replace(/[-_]/g, " ").trim();

  if (!clean) return "The Product";

  return clean
    .split(/\s+/)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

export function cleanSearchQuery(value: string): string {
  return String(value || "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export function unique(
  values: Array<string | undefined | null>
): string[] {
  return [
    ...new Set(
      values.filter(Boolean).map((value) => String(value).trim())
    ),
  ];
}
