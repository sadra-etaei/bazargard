import { BadgeCheck, ReceiptText, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { faNum, timeAgo, toman } from "../lib/format";
import type { Visit } from "../lib/types";

/** What you actually bought: each item with what you paid, how that compares to the listed price, and a running total. */
export function Purchases({ items, compact }: { items: Visit[]; compact?: boolean }) {
  if (items.length === 0) return null;
  const bought = [...items].sort((a, b) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at));
  const spent = bought.reduce((n, v) => n + (v.paid_price ?? v.listed_price ?? 0), 0);
  const saved = bought.reduce((n, v) => n + (v.listed_price && v.paid_price && v.paid_price < v.listed_price ? v.listed_price - v.paid_price : 0), 0);

  return (
    <section className="mt-5">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-4 text-white shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-extrabold"><ReceiptText size={18} /> خریدهای من</div>
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold">{faNum(bought.length)} مورد</span>
        </div>
        <div className="mt-2 text-xs text-white/80">مجموع پرداختی</div>
        <div className="text-2xl font-extrabold tracking-tight">{toman(spent)}</div>
        {saved > 0 && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold">
            <TrendingDown size={13} /> {toman(saved)} کمتر از قیمت ثبت‌شده
          </div>
        )}
      </div>

      <div className={compact ? "mt-3 space-y-2" : "mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3"}>
        {bought.map((v) => {
          const diff = v.listed_price && v.paid_price ? v.paid_price - v.listed_price : null;
          return (
            <div key={v.id} className="flex gap-3 rounded-2xl bg-surface p-3 ring-1 ring-emerald-200 shadow-card">
              <div className="relative shrink-0">
                {v.image ? <img src={v.image} alt="" className="size-20 rounded-xl bg-slate-50 object-contain" /> : <div className="size-20 rounded-xl bg-slate-100" />}
                <span className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full bg-emerald-600 text-white ring-2 ring-surface"><BadgeCheck size={15} /></span>
              </div>
              <div className="min-w-0 flex-1">
                <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">خریداری شد</span>
                {v.product_id ? (
                  <Link to={`/p/${v.product_id}`} className="mt-0.5 line-clamp-2 block text-[13px] leading-5 font-bold">{v.product_title || "کالا"}</Link>
                ) : <div className="mt-0.5 line-clamp-2 text-[13px] leading-5 font-bold">{v.product_title || "مراجعه به فروشگاه"}</div>}
                <Link to={`/s/${v.shop_id}`} className="block truncate text-[11px] text-slate-500">{v.shop_name || "فروشگاه"}</Link>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-base font-extrabold text-emerald-700">{toman(v.paid_price ?? v.listed_price)}</span>
                  {diff !== null && diff !== 0 && (
                    <span className={diff < 0 ? "flex items-center gap-0.5 text-[11px] font-bold text-emerald-600" : "flex items-center gap-0.5 text-[11px] font-bold text-amber-600"}>
                      {diff < 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                      {toman(Math.abs(diff))} {diff < 0 ? "کمتر" : "بیشتر"} از ثبت‌شده
                    </span>
                  )}
                  {diff === 0 && <span className="text-[11px] text-slate-400">طبق قیمت ثبت‌شده</span>}
                </div>
                <div className="text-[10px] text-slate-400">{timeAgo(v.updated_at || v.created_at)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
