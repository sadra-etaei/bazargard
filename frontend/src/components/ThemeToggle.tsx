import { Monitor, Moon, Sun } from "lucide-react";
import clsx from "clsx";
import { usePrefs } from "../lib/store";
import type { Theme } from "../lib/theme";

const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Theme, string> = { system: "تم: خودکار (مطابق دستگاه)", light: "تم روشن", dark: "تم تیره" };

/** One tap cycles system → light → dark. */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = usePrefs((s) => s.theme);
  const set = usePrefs((s) => s.set);
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <button onClick={() => set({ theme: NEXT[theme] })} title={LABEL[theme]} aria-label={LABEL[theme]}
      className={clsx("flex size-9 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100", className)}>
      <Icon size={18} />
    </button>
  );
}
