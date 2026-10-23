import { useEffect } from "react";
import { usePrefs } from "./store";

export type Theme = "system" | "light" | "dark";

const query = () => window.matchMedia("(prefers-color-scheme: dark)");

export const resolveTheme = (t: Theme): "light" | "dark" => (t === "system" ? (query().matches ? "dark" : "light") : t);

/** Applies the chosen theme to <html data-theme>, and follows the OS while the choice is "system". */
export function useApplyTheme() {
  const theme = usePrefs((s) => s.theme);
  useEffect(() => {
    const apply = () => {
      const r = resolveTheme(theme);
      document.documentElement.dataset.theme = r;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", r === "dark" ? "#0b1220" : "#f5f7fb");
    };
    apply();
    if (theme !== "system") return;
    const mq = query();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
}
