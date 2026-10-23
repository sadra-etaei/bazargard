import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Store } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { faNum } from "../lib/format";
import type { Shop } from "../lib/types";

export function StoreNeighbors({ shop, enabled = true }: { shop: Shop; enabled?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const query = useQuery({
    queryKey: ["shop-neighbors", shop.shop_id],
    queryFn: () => api.shopNeighbors(shop.shop_id),
    enabled: enabled && !!shop.mall_key,
    staleTime: 5 * 60 * 1000,
  });
  if (!shop.mall_key || !enabled) return null;
  return (
    <section className="mt-3 rounded-2xl bg-slate-50 p-3" aria-label="فروشگاه‌های اطراف مقصد" aria-live="polite">
      <div className="flex items-center gap-2 text-sm font-bold"><Store size={16} className="text-brand-700" /> فروشگاه‌های اطراف مقصد</div>
      {query.isPending ? <p className="mt-2 text-xs text-slate-500">در حال دریافت نام فروشگاه‌ها…</p>
        : query.isError ? <div className="mt-2 text-xs text-slate-500">نام فروشگاه‌های اطراف دریافت نشد. <button className="font-bold text-brand-700 underline" onClick={() => query.refetch()}>تلاش دوباره</button></div>
        : query.data.shops.length === 0 ? <p className="mt-2 text-xs text-slate-500">فروشگاه دیگری در این پاساژ ثبت نشده است.</p>
        : <>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">فروشگاه‌های همین پاساژ؛ اولویت با همین طبقه و شماره واحد نزدیک‌تر است. شماره واحد، همسایگی دقیق را تضمین نمی‌کند.</p>
          <ul className="mt-2 space-y-2">
            {query.data.shops.slice(0, expanded ? undefined : 3).map((other) => (
              <li key={other.shop_id} className="rounded-xl bg-surface p-2.5 text-sm">
                <Link to={`/s/${other.shop_id}`} className="font-bold text-brand-800 underline decoration-dotted">{other.name}</Link>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-slate-500">
                  {other.same_floor && <span className="font-bold text-brand-700">همین طبقه</span>}
                  {other.floor_label && <span>{faNum(other.floor_label)}</span>}
                  {other.unit && <span>واحد {faNum(other.unit)}</span>}
                  {!other.floor_label && !other.unit && <span>طبقه و واحد ثبت نشده</span>}
                </div>
              </li>
            ))}
          </ul>
          {query.data.shops.length > 3 && <button className="mt-2 text-xs font-bold text-brand-700" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "نمایش کمتر" : "نمایش فروشگاه‌های بیشتر"}</button>}
        </>}
    </section>
  );
}
