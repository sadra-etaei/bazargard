import clsx from "clsx";
import { AlertTriangle, Check, GitCompare, MapPin, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { faNum, km, shortToman, toman } from "../lib/format";
import { useAddVisit } from "../lib/hooks";
import { usePrefs } from "../lib/store";
import type { ProductResult } from "../lib/types";
import { FreshBadge, OpenBadge, StockBadge } from "./ui";

export function ProductCard({ p, rank }: { p: ProductResult; rank?: number }) {
  const b = p.best;
  const { compare, toggleCompare } = usePrefs();
  const inCompare = compare.some((x) => x.product_id === p.product_id);
  const add = useAddVisit();
  return (
    <div className="card-hover animate-fadein overflow-hidden rounded-3xl bg-surface shadow-card ring-1 ring-slate-900/[0.05]">
      <Link to={`/p/${p.product_id}`} className="flex gap-3 p-3">
        <div className="relative shrink-0">
          <img src={p.image || ""} alt="" loading="lazy" className="size-24 rounded-2xl bg-gradient-to-b from-slate-50 to-slate-100/70 object-contain p-1" />
          {rank === 1 && <span className="absolute -top-1.5 -right-1.5 rounded-full bg-gradient-to-l from-amber-400 to-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-950 shadow-sm">★ پیشنهاد اول</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[14px] font-bold leading-6 text-slate-900">{p.title}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">{[p.brand, p.category].filter(Boolean).join(" · ")}</div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-[17px] font-extrabold tracking-tight text-slate-900">{toman(b.price)}</span>
            {p.price_to && p.price_from && p.price_to > p.price_from && (
              <span className="text-[11px] text-slate-400">تا {shortToman(p.price_to)}</span>
            )}
          </div>
          <div className="mt-1 text-[12px] text-slate-600">{p.why}</div>
        </div>
      </Link>

      <div className="border-t border-slate-100 bg-gradient-to-b from-slate-50/80 to-surface px-3.5 py-3">
        <div className="flex items-center gap-1.5 text-xs text-slate-700">
          <MapPin size={13} className="shrink-0 text-brand-700" />
          <Link to={`/s/${b.shop.shop_id}`} className="truncate font-medium">{b.shop.name}</Link>
          <span className="truncate text-slate-400">
            {b.shop.mall ? `· ${b.shop.mall}${b.shop.floor ? `، ط ${b.shop.floor}` : ""}` : b.shop.area ? `· ${b.shop.area}` : ""}
            {b.shop.distance_km !== null && ` · ${km(b.shop.distance_km)}`}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <OpenBadge state={b.shop.status.state} label={b.shop.status.label} />
          <FreshBadge age={b.price_age} />
          <StockBadge stock={b.stock} />
        </div>
        {(b.reasons[0] || b.warnings[0]) && (
          <div className="mt-2 space-y-0.5 text-[11.5px] leading-5">
            {b.reasons.slice(0, 1).map((r) => <div key={r} className="flex gap-1 text-emerald-800"><Check size={12} className="mt-1 shrink-0" />{r}</div>)}
            {b.warnings.slice(0, 1).map((w) => <div key={w} className="flex gap-1 text-amber-800"><AlertTriangle size={12} className="mt-1 shrink-0" />{w}</div>)}
          </div>
        )}
        <div className="mt-2.5 flex gap-2">
          <Link to={`/p/${p.product_id}`} className="flex-1 rounded-xl bg-gradient-to-b from-brand-600 to-brand-700 py-2.5 text-center text-xs font-bold text-white shadow-sm shadow-brand-700/30 active:scale-[0.98]">
            {faNum(p.matching_offers)} فروشنده · مقایسه
          </Link>
          <button onClick={() => add.mutate({ shop_id: b.shop.shop_id, product_id: p.product_id, offer_id: b.offer_id })}
            className="flex items-center gap-1 rounded-xl bg-brand-50 px-3 text-xs font-medium text-brand-800">
            <Plus size={14} /> مسیر
          </button>
          <button onClick={() => toggleCompare(p)} aria-label="مقایسه"
            className={clsx("flex items-center gap-1 rounded-xl px-3 text-xs font-medium", inCompare ? "bg-amber-400 text-amber-950" : "bg-slate-100 text-slate-700")}>
            <GitCompare size={14} /> {inCompare ? "✓" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
