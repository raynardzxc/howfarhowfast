export type Theme = "light" | "dark";

const KEY = "hfhf-theme";

export function initialTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function persistTheme(t: Theme): void {
  localStorage.setItem(KEY, t);
  document.documentElement.dataset.theme = t;
}

export function mapStyleUrl(t: Theme): string {
  return t === "dark"
    ? "https://tiles.openfreemap.org/styles/dark"
    : "https://tiles.openfreemap.org/styles/positron";
}
