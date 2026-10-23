import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { shortToman } from "../lib/format";
import { useCtx } from "../lib/hooks";
import { usePrefs } from "../lib/store";
import { FilterSheet } from "./FilterSheet";
export function ShoppingRequirements() {
  const ctx = useCtx();
  const apply = usePrefs(s => s.applyShoppingFilters);
  const [open, setOpen] = useState(false);
  const labels = [ctx.budget_min && `از ${shortToman(ctx.budget_min)}`, ctx.budget_max && `تا ${shortToman(ctx.budget_max)}`, ctx.brand, ctx.mall && "همین پاساژ", ctx.installments && "قسطی", ctx.torobpay && "ترب‌پی", ctx.warranty && "گارانتی", ctx.open && "باز هنگام رسیدن", ctx.fast && "ارسال فوری"].filter(Boolean);
  return <div className="my-2 rounded-xl border border-slate-200 bg-surface p-2.5">
    <button onClick={() => setOpen(true)} className="flex w-full items-center justify-between gap-3 text-right text-xs"><span className="leading-6 text-slate-600">{labels.length ? labels.join(" · ") : "بودجه و شرایط خرید دلخواه"}</span><span className="flex shrink-0 items-center gap-1 font-bold text-brand-700"><SlidersHorizontal size={14} /> تغییر شرایط</span></button>
    <FilterSheet open={open} onClose={() => setOpen(false)} filters={ctx} onApply={apply} />
  </div>;
}
