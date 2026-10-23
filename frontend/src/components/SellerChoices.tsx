import type { Offer } from "../lib/types";
import { faNum, toman } from "../lib/format";
import { sellerChoices } from "../lib/sellerChoices";

export function SellerChoices({ offers, onSelect }: { offers: Offer[]; onSelect: (id: string) => void }) {
  const choices = sellerChoices(offers);
  const cheapest = Math.min(...choices.map((c) => c.offer.price ?? Infinity));
  const fastest = Math.min(...choices.map((c) => c.offer.shop.travel_min ?? Infinity));
  if (!choices.length) return null;
  return <section className="mt-3 rounded-2xl bg-brand-50 p-3 ring-1 ring-brand-100" aria-label="انتخاب سریع فروشنده">
    <div className="text-sm font-bold text-brand-900">کدام مراجعه برای شما مناسب‌تر است؟</div>
    <div className="mt-2 space-y-2">{choices.map(({ offer: o, labels }) => <button key={o.offer_id} onClick={() => onSelect(o.shop.shop_id)}
      className="block w-full rounded-xl bg-surface p-3 text-right ring-1 ring-slate-200 hover:ring-brand-500">
      <div className="text-xs font-bold text-brand-800">{labels.join(" · ")}</div>
      <div className="mt-1 flex flex-wrap justify-between gap-1 text-sm font-bold"><span>{o.shop.name}</span><span>{toman(o.price)}</span></div>
      <div className="mt-1 text-xs leading-5 text-slate-600">{o.stock.label}</div>
      <div className="mt-1 text-[11px] text-slate-500">
        {o.price !== null && Number.isFinite(cheapest) && o.price > cheapest ? `${toman(o.price - cheapest)} بیشتر از ارزان‌ترین گزینه` : ""}
        {o.shop.travel_min !== null && Number.isFinite(fastest) ? ` · حدود ${faNum(o.shop.travel_min)} دقیقه راه${o.shop.travel_min > fastest ? `؛ ${faNum(o.shop.travel_min - fastest)} دقیقه بیشتر از سریع‌ترین گزینه` : ""}` : ""}
      </div>
    </button>)}</div>
  </section>;
}
