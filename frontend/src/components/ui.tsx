import clsx from "clsx";
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { create } from "zustand";
import type { OpenState, PriceAge, Stock } from "../lib/types";

export function Badge({ tone = "stone", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-5", TONES[tone], className)}>
      {children}
    </span>
  );
}

type Tone = "green" | "amber" | "red" | "stone" | "blue" | "brand";
const TONES: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  red: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  stone: "bg-slate-100 text-slate-600 ring-1 ring-slate-900/[0.06] shadow-card",
  blue: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  brand: "bg-brand-50 text-brand-800 ring-1 ring-brand-200",
};

export const openTone = (s: OpenState): Tone =>
  ({ open: "green", open_no_hours: "green", closing_soon: "amber", closed: "red", unknown: "stone" } as const)[s];

export function OpenBadge({ state, label }: { state: OpenState; label: string }) {
  return (
    <Badge tone={openTone(state)}>
      <span className={clsx("size-1.5 rounded-full", { open: "bg-emerald-500", open_no_hours: "bg-emerald-400", closing_soon: "bg-amber-500", closed: "bg-rose-500", unknown: "bg-slate-400" }[state])} />
      {label}
    </Badge>
  );
}

export function FreshBadge({ age }: { age: PriceAge }) {
  const tone: Tone = { fresh: "green", recent: "blue", old: "amber", stale: "red", unknown: "stone" }[age.level] as Tone;
  const short = age.days === null ? "تاریخ قیمت نامشخص" : age.label.split("—")[0].replace("ثبت شده", "").trim();
  return <Badge tone={tone}>🕒 {short}</Badge>;
}

export function StockBadge({ stock }: { stock: Stock }) {
  if (stock.state === "confirmed") return <Badge tone="green">✓ {stock.label}</Badge>;
  if (stock.state === "out") return <Badge tone="red">✕ {stock.label}</Badge>;
  if (stock.state === "price_changed") return <Badge tone="amber">{stock.label}</Badge>;
  return <Badge tone="stone">موجودی تأییدنشده</Badge>;
}

export function Button({
  children, onClick, variant = "primary", size = "md", className, disabled, type = "button", href,
}: {
  children: ReactNode; onClick?: () => void; variant?: "primary" | "ghost" | "outline" | "soft" | "danger";
  size?: "sm" | "md" | "lg"; className?: string; disabled?: boolean; type?: "button" | "submit"; href?: string;
}) {
  const cls = clsx(
    "inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition active:scale-[0.98] disabled:opacity-50",
    { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-5 text-base" }[size],
    {
      primary: "bg-gradient-to-b from-brand-600 to-brand-700 text-white shadow-sm shadow-brand-700/25 hover:from-brand-700 hover:to-brand-800",
      ghost: "text-slate-700 hover:bg-slate-100",
      outline: "border border-slate-300 bg-surface text-slate-800 hover:bg-slate-50",
      soft: "bg-brand-50 text-brand-800 hover:bg-brand-100",
      danger: "bg-rose-50 text-rose-700 hover:bg-rose-100",
    }[variant],
    className,
  );
  if (href) return <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className={cls}>{children}</a>;
  return <button type={type} className={cls} onClick={onClick} disabled={disabled}>{children}</button>;
}

export function Sheet({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  // Rendered on <body>: inside a sticky/blurred header a `fixed` dialog is positioned against that header
  // (backdrop-filter makes it the containing block), which pinned dialogs to the top of the screen.
  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-end justify-center md:items-center md:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} className={`animate-rise relative max-h-[88dvh] w-full ${footer ? "flex flex-col overflow-hidden" : "overflow-y-auto"} ${wide ? "max-w-lg md:max-w-4xl" : "max-w-lg"} rounded-t-3xl bg-surface pb-safe shadow-2xl md:max-h-[85dvh] md:rounded-3xl`}>
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-slate-100 bg-surface/95 px-4 py-3 backdrop-blur">
          <div className="text-base font-bold">{title}</div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label="بستن">
            <X size={20} />
          </button>
        </div>
        <div className={footer ? "min-h-0 overflow-y-auto p-4" : "p-4"}>{children}</div>
        {footer && <div className="shrink-0 border-t border-slate-100 bg-surface p-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-slate-500">
      <div className="size-7 animate-spin rounded-full border-[3px] border-brand-200 border-t-brand-700" />
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-xl bg-slate-200/70", className)} />;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-surface px-6 py-8 text-center">
      {icon && <div className="text-3xl">{icon}</div>}
      <div className="font-bold text-slate-800">{title}</div>
      {children && <div className="text-sm leading-7 text-slate-500">{children}</div>}
    </div>
  );
}

export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("mt-5", className)}>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-[15px] font-bold text-slate-800">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// ---- notifications --------------------------------------------------------------------------
export type NoticeTone = "success" | "info" | "warn" | "error";
export interface Notice {
  id: number;
  tone: NoticeTone;
  title?: string;
  text: string;
  action?: { label: string; to?: string; onClick?: () => void };
  duration: number;
}
type NoticeInput = Omit<Notice, "id" | "tone" | "duration"> & { tone?: NoticeTone; duration?: number };

interface ToastState {
  items: Notice[];
  push: (n: NoticeInput) => number;
  dismiss: (id: number) => void;
}
export const useToast = create<ToastState>((set, get) => ({
  items: [],
  push: (n) => {
    const id = Date.now() + Math.random();
    // The same message twice in a row replaces itself instead of stacking.
    const rest = get().items.filter((t) => t.text !== n.text);
    const item: Notice = { tone: "info", duration: 4200, ...n, id };
    set({ items: [...rest, item].slice(-3) });
    return id;
  },
  dismiss: (id) => set({ items: get().items.filter((t) => t.id !== id) }),
}));

/** toast("text") keeps working; toast.success / .warn / .error / .info add a tone, optional title and action. */
export const toast = Object.assign(
  (text: string, o: Partial<NoticeInput> = {}) => useToast.getState().push({ text, ...o }),
  {
    success: (text: string, o: Partial<NoticeInput> = {}) => useToast.getState().push({ text, tone: "success", ...o }),
    info: (text: string, o: Partial<NoticeInput> = {}) => useToast.getState().push({ text, tone: "info", ...o }),
    warn: (text: string, o: Partial<NoticeInput> = {}) => useToast.getState().push({ text, tone: "warn", duration: 6000, ...o }),
    error: (text: string, o: Partial<NoticeInput> = {}) => useToast.getState().push({ text, tone: "error", duration: 7000, ...o }),
  },
);

const NOTICE_STYLE: Record<NoticeTone, { icon: ReactNode; ring: string; chip: string; bar: string }> = {
  success: { icon: <CheckCircle2 size={18} />, ring: "ring-emerald-200", chip: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500" },
  info: { icon: <Info size={18} />, ring: "ring-sky-200", chip: "bg-sky-100 text-sky-700", bar: "bg-sky-500" },
  warn: { icon: <TriangleAlert size={18} />, ring: "ring-amber-200", chip: "bg-amber-100 text-amber-700", bar: "bg-amber-500" },
  error: { icon: <CircleAlert size={18} />, ring: "ring-rose-200", chip: "bg-rose-100 text-rose-700", bar: "bg-rose-500" },
};

/** A notification card: icon chip, optional title, action button, close, and a shrinking timer bar (paused on hover). */
export function NoticeCard({ n, onClose, className }: { n: Pick<Notice, "tone" | "title" | "text" | "action" | "duration">; onClose: () => void; className?: string }) {
  const st = NOTICE_STYLE[n.tone];
  const nav = useNavigate();
  const [paused, setPaused] = useState(false);
  const left = useRef(n.duration);
  useEffect(() => {
    if (paused || !n.duration) return;
    const started = Date.now();
    const t = setTimeout(onClose, left.current);
    return () => {
      left.current -= Date.now() - started;
      clearTimeout(t);
    };
  }, [paused]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div role="status" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      className={clsx("pointer-events-auto animate-notice relative w-full max-w-sm overflow-hidden rounded-2xl bg-surface shadow-float ring-1", st.ring, className)}>
      <div className="flex items-start gap-3 p-3 pr-3.5">
        <span className={clsx("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl", st.chip)}>{st.icon}</span>
        <div className="min-w-0 flex-1 py-0.5">
          {n.title && <div className="text-[13px] font-extrabold text-slate-900">{n.title}</div>}
          <div className={clsx("text-[13px] leading-6", n.title ? "text-slate-600" : "font-medium text-slate-800")}>{n.text}</div>
          {n.action && (
            <button onClick={() => { n.action?.onClick?.(); if (n.action?.to) nav(n.action.to); onClose(); }}
              className="mt-1.5 rounded-lg bg-inverse px-3 py-1 text-xs font-medium text-white hover:opacity-80">{n.action.label}</button>
          )}
        </div>
        <button onClick={onClose} aria-label="بستن" className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={15} /></button>
      </div>
      {n.duration > 0 && (
        <div className="h-[3px] w-full bg-slate-100">
          <div className={clsx("notice-bar h-full origin-right", st.bar)} style={{ animationDuration: `${n.duration}ms`, animationPlayState: paused ? "paused" : "running" }} />
        </div>
      )}
    </div>
  );
}

export function Toasts() {
  const items = useToast((s) => s.items);
  const dismiss = useToast((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[3000] flex flex-col items-center gap-2 px-3 lg:top-20">
      {items.map((t) => <NoticeCard key={t.id} n={t} onClose={() => dismiss(t.id)} />)}
    </div>
  );
}
