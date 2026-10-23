import { EMPTY_SEARCH_SCOPE, parseBudgetInput } from "../lib/shoppingContext";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { faNum, shortToman } from "../lib/format";
import { usePrefs } from "../lib/store";
import type { Filters, SearchResponse } from "../lib/types";
import { Button, Sheet } from "./ui";

const BUDGETS = [500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 20_000_000, 50_000_000];
const SORTS = [
  { v: "relevance", label: "مرتبط‌ترین" },
  { v: "price_asc", label: "ارزان به گران" },
  { v: "price_desc", label: "گران به ارزان" },
  { v: "near", label: "نزدیک‌ترین" },
] as const;
const PRIORITIES = [
  { v: "balanced", label: "متعادل", hint: "قیمت + فاصله + اطمینان" },
  { v: "price", label: "ارزان‌ترین", hint: "قیمت مهم‌تر است" },
  { v: "near", label: "نزدیک‌ترین", hint: "زودتر برسم" },
  { v: "reliable", label: "مطمئن‌ترین", hint: "قیمت تازه، گارانتی" },
] as const;

/** Filters that belong to this search (budget, category, brand, mall) + standing conditions from prefs. */
export function FilterSheet({ open, onClose, filters, onApply, facets }: {
  open: boolean; onClose: () => void; filters: Filters; onApply: (f: Filters) => void; facets?: SearchResponse["facets"];
}) {
  const prefs = usePrefs();
  const [f, setF] = useState<Filters>(filters);
  const [cond, setCond] = useState(prefs.conditions);
  const [error, setError] = useState("");
  const [priority, setPriority] = useState(prefs.priority);
  useEffect(() => {
    if (open) {
      setF(filters); setError("");
      setCond(prefs.conditions);
      setPriority(prefs.priority);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = () => {
    if (f.budget_min && f.budget_max && f.budget_min > f.budget_max) { setError("حداقل بودجه باید کمتر از حداکثر باشد."); return; }
    const next = { ...EMPTY_SEARCH_SCOPE, ...f, ...cond, priority };
    prefs.applyShoppingFilters(next);
    onApply(next);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="فیلترها و شرایط خرید">
      <Label>بودجه حداکثر</Label>
      <div className="flex flex-wrap gap-2">
        <Pill active={!f.budget_max} onClick={() => setF({ ...f, budget_max: null })}>بدون سقف</Pill>
        {BUDGETS.map((b) => <Pill key={b} active={f.budget_max === b} onClick={() => setF({ ...f, budget_max: b })}>زیر {shortToman(b)}</Pill>)}
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <input inputMode="numeric" aria-label="حداقل بودجه به تومان" placeholder="حداقل (تومان)" value={f.budget_min ?? ""} dir="ltr"
          onChange={(e) => setF({ ...f, budget_min: e.target.value ? parseBudgetInput(e.target.value) : null })}
          className="h-10 w-1/2 rounded-xl border border-slate-200 px-3 text-right" />
        <input inputMode="numeric" aria-label="حداکثر بودجه به تومان" placeholder="حداکثر (تومان)" value={f.budget_max ?? ""} dir="ltr"
          onChange={(e) => setF({ ...f, budget_max: e.target.value ? parseBudgetInput(e.target.value) : null })}
          className="h-10 w-1/2 rounded-xl border border-slate-200 px-3 text-right" />
      </div>

      <Label>مرتب‌سازی نتایج</Label>
      <div className="flex flex-wrap gap-2">
        {SORTS.map((s) => <Pill key={s.v} active={(f.sort || "relevance") === s.v} onClick={() => setF({ ...f, sort: s.v })}>{s.label}</Pill>)}
      </div>

      <Label>اولویت پیشنهاد</Label>
      <div className="grid grid-cols-2 gap-2">
        {PRIORITIES.map((p) => (
          <button key={p.v} onClick={() => setPriority(p.v)}
            className={clsx("rounded-xl p-2.5 text-right ring-1", priority === p.v ? "bg-brand-50 ring-brand-500" : "bg-surface ring-slate-200")}>
            <div className="text-sm font-bold">{p.label}</div>
            <div className="text-[11px] text-slate-500">{p.hint}</div>
          </button>
        ))}
      </div>

      <Label>شرایط خرید</Label>
      <div className="space-y-2">
        <Toggle on={cond.open} onClick={() => setCond({ ...cond, open: !cond.open })} title="فقط مغازه‌هایی که موقع رسیدنم بازند" hint="ساعت نامشخص فقط با انتخاب «شرایط نامشخص» نمایش داده می‌شود" />
        <Toggle on={cond.installments} onClick={() => setCond({ ...cond, installments: !cond.installments })} title="خرید قسطی" hint="اسنپ‌پی، دیجی‌پی، تارا، ازکی‌وام — طبق اعلام فروشنده" />
        <Toggle on={cond.torobpay} onClick={() => setCond({ ...cond, torobpay: !cond.torobpay })} title="پذیرنده ترب‌پی" />
        <Toggle on={cond.warranty} onClick={() => setCond({ ...cond, warranty: !cond.warranty })} title="فقط با گارانتی/ضمانت ثبت‌شده" />
        <Toggle on={cond.fast} onClick={() => setCond({ ...cond, fast: !cond.fast })} title="ارسال فوری" hint="فروشنده‌هایی که ارسال فوری دارند" />
      </div>

      {facets && facets.categories.length > 1 && (
        <>
          <Label>دسته‌بندی</Label>
          <div className="flex flex-wrap gap-2">
            <Pill active={!f.category} onClick={() => setF({ ...f, category: null })}>همه</Pill>
            {facets.categories.map((c) => (
              <Pill key={c.name} active={f.category === c.name} onClick={() => setF({ ...f, category: c.name })}>{c.name} <span className="opacity-60">{faNum(c.count)}</span></Pill>
            ))}
          </div>
        </>
      )}
      {facets && facets.brands.length > 1 && (
        <>
          <Label>برند</Label>
          <div className="flex flex-wrap gap-2">
            <Pill active={!f.brand} onClick={() => setF({ ...f, brand: null })}>همه</Pill>
            {facets.brands.map((c) => <Pill key={c.name} active={f.brand === c.name} onClick={() => setF({ ...f, brand: c.name })}>{c.name}</Pill>)}
          </div>
        </>
      )}
      {facets && facets.malls.length > 0 && (
        <>
          <Label>فقط یک پاساژ (همه را یکجا ببینم)</Label>
          <div className="flex flex-wrap gap-2">
            <Pill active={!f.mall} onClick={() => setF({ ...f, mall: null })}>همه</Pill>
            {facets.malls.map((m) => <Pill key={m.key} active={f.mall === m.key} onClick={() => setF({ ...f, mall: m.key })}>{m.name}</Pill>)}
          </div>
        </>
      )}

      {error && <p role="alert" className="mt-3 text-xs text-rose-700">{error}</p>}
      <div className="sticky bottom-0 mt-6 flex gap-2 bg-surface pt-2">
        <Button className="flex-1" size="lg" onClick={apply}>اعمال فیلترها</Button>
        <Button variant="ghost" size="lg" onClick={() => { setF({ ...EMPTY_SEARCH_SCOPE, q: f.q }); setCond({ installments: false, torobpay: false, warranty: false, open: false, fast: false }); setPriority("balanced"); }}>
          پاک کردن
        </Button>
      </div>
    </Sheet>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => <div className="mt-5 mb-2 text-sm font-bold first:mt-0">{children}</div>;

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={clsx("rounded-full px-3 py-1.5 text-xs ring-1", active ? "bg-brand-700 text-white ring-brand-700" : "bg-surface text-slate-700 ring-slate-200")}>
      {children}
    </button>
  );
}

function Toggle({ on, onClick, title, hint }: { on: boolean; onClick: () => void; title: string; hint?: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-right">
      <div>
        <div className="text-sm">{title}</div>
        {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
      </div>
      <span className={clsx("relative h-6 w-11 shrink-0 rounded-full transition", on ? "bg-brand-600" : "bg-slate-300")}>
        <span className={clsx("absolute top-0.5 size-5 rounded-full bg-surface shadow transition-all", on ? "right-0.5" : "right-[22px]")} />
      </span>
    </button>
  );
}
