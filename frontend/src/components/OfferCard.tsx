import { toggleSeller } from "../lib/sellerComparison";
import clsx from "clsx";
import { AlertTriangle, Building2, Check, MessageCircle, Navigation, Plus, ShieldCheck, Store } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { faNum, km, toman } from "../lib/format";
import { usePrefs } from "../lib/store";
import { VisitActions } from "./VisitActions";
import { useAddVisit } from "../lib/hooks";
import type { Offer } from "../lib/types";
import { AskSellerSheet } from "./AskSeller";
import { NavSheet } from "./NavSheet";
import { Badge, FreshBadge, OpenBadge, StockBadge, toast } from "./ui";

export function OfferCard({ offer, productId, productTitle, highlight, dim, onChoose, choosing, anchor = false }: {
  offer: Offer; productId: string; productTitle?: string; highlight?: boolean; dim?: boolean; onChoose?: () => void; choosing?: boolean; anchor?: boolean;
}) {
  const s = offer.shop;
  const selection = usePrefs(state => state.sellerComparison);
  const selected = selection?.productId === productId && selection.sellers.some(item => item.offerId === offer.offer_id);
  const compareSeller = () => {
    const next = toggleSeller(selection, productId, productTitle || "این کالا", offer.offer_id, s.shop_id);
    if (next === selection) { toast.warn("حداکثر ۳ فروشنده؛ ابتدا یکی را حذف کنید."); return; }
    usePrefs.getState().set({ sellerComparison: next.sellers.length ? next : null });
    if (selection && selection.productId !== productId) toast.info("مقایسه فروشنده‌ها برای این کالا شروع شد.");
  };
  const [ask, setAsk] = useState(false);
  const [nav, setNav] = useState(false);
  const add = useAddVisit();
  const vs = offer.price_vs_median;
  const conditions = usePrefs((state) => state.conditions);
  const needsCheck = Object.entries(conditions).some(([key, value]) => value && key !== "open" && offer.condition_states?.[key] !== "confirmed");
  const ready = offer.stock.state === "confirmed" && s.status.state === "open" && !needsCheck && offer.matches_filters !== false;

  return (
    <div id={anchor ? `seller-${s.shop_id}` : undefined} className={clsx("scroll-mt-40 rounded-2xl bg-surface p-3.5 shadow-card ring-1", highlight ? "ring-2 ring-brand-500" : "ring-slate-200", dim && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <Link to={`/s/${s.shop_id}`} className="min-w-0">
          <div className="flex items-center gap-1.5 font-bold text-slate-900">
            <Store size={15} className="shrink-0 text-brand-700" />
            <span className="truncate">{s.name}</span>
            {!s.name_verified && <span className="shrink-0 text-[10px] font-normal text-slate-400">(نام نمایشی)</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            {s.mall && <span className="flex items-center gap-1"><Building2 size={12} />{s.mall}{s.floor_label && ` · ${faNum(s.floor_label)}`}{s.unit && ` · واحد ${faNum(s.unit)}`}</span>}
            {!s.mall && s.area && <span>{s.area}</span>}
            {s.distance_km !== null && <span>· {km(s.distance_km)}{s.travel_min ? ` (~${faNum(s.travel_min)} دقیقه)` : ""}</span>}
          </div>
        </Link>
        <div className="shrink-0 text-left">
          <div className={clsx("text-[15px] font-extrabold", offer.price ? "text-slate-900" : "text-slate-400")}>{offer.price ? toman(offer.price) : "قیمت؟"}</div>
          {vs !== null && Math.abs(vs) >= 3 && (
            <div className={clsx("text-[11px] font-medium", vs < 0 ? "text-emerald-600" : "text-rose-600")}>
              {faNum(Math.abs(vs))}٪ {vs < 0 ? "زیر" : "بالای"} میانه
            </div>
          )}
          {offer.stock.state === "price_changed" && offer.listed_price && (
            <div className="text-[11px] text-slate-400 line-through">{toman(offer.listed_price)}</div>
          )}
        </div>
      </div>

      {offer.seller_title && productTitle && offer.seller_title !== productTitle && (
        <div className="mt-1.5 line-clamp-1 text-xs text-slate-500">عنوان فروشنده: {offer.seller_title}</div>
      )}

      <div className="mt-2.5 rounded-xl bg-slate-50 p-2.5 text-xs leading-6">
        <div className="font-bold text-slate-800">{ready ? "مناسب برای برنامه‌ریزی مراجعه" : offer.stock.state === "out" ? "ناموجود گزارش شده؛ جایگزین‌ها را بررسی کنید" : "قبل از رفتن، موجودی و شرایط را بپرسید"}</div>
        {needsCheck && <div className="text-amber-800">بعضی شرایط موردنیاز شما هنوز تأیید نشده است.</div>}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <OpenBadge state={s.status.state} label={s.status.label} />
        <FreshBadge age={offer.price_age} />
        <StockBadge stock={offer.stock} />
        {conditions.warranty && <Badge tone={offer.warranty?.has ? "blue" : "stone"}>{offer.warranty?.label || "گارانتی نیازمند استعلام"}</Badge>}
        {conditions.torobpay && <Badge tone={s.payments.torobpay === "in_person" ? "brand" : "stone"}>{s.payments.torobpay === "in_person" ? "ترب‌پی حضوری" : "ترب‌پی حضوری نیازمند استعلام"}</Badge>}
        {conditions.installments && <Badge tone={s.payments.installments.some((p) => p.in_person) ? "brand" : "stone"}>{s.payments.installments.some((p) => p.in_person) ? "قسطی حضوری" : "اقساط حضوری نیازمند استعلام"}</Badge>}
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer py-2 font-bold text-brand-700">گارانتی، پرداخت و دلیل پیشنهاد</summary>
        <div className="flex flex-wrap gap-1.5">
        {offer.warranty && (
          <Badge tone={offer.warranty.has ? "blue" : "stone"}><ShieldCheck size={12} />{offer.warranty.label.slice(0, 38)}</Badge>
        )}
        {s.payments.torobpay === "in_person" && <Badge tone="brand">ترب‌پی حضوری</Badge>}
        {s.payments.installments.some((p) => p.in_person) && <Badge tone="brand">قسطی حضوری</Badge>}
        {!offer.warranty && <Badge tone="stone">گارانتی نامشخص</Badge>}
        {offer.condition_states?.installments === "unknown" && <Badge tone="stone">اقساط حضوری نیازمند استعلام</Badge>}
      </div>

      {(offer.reasons.length > 0 || offer.warnings.length > 0) && (
        <div className="mt-2.5 space-y-1 text-xs leading-5">
          {offer.reasons.slice(0, 2).map((r) => (
            <div key={r} className="flex items-start gap-1.5 text-emerald-800"><Check size={13} className="mt-0.5 shrink-0" />{r}</div>
          ))}
          {offer.warnings.slice(0, 2).map((w) => (
            <div key={w} className="flex items-start gap-1.5 text-amber-800"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{w}</div>
          ))}
        </div>
      )}

      </details>
      <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-xl bg-slate-50 p-2 text-xs font-bold text-brand-800">
        <input type="checkbox" checked={!!selected} onChange={compareSeller} className="size-4 accent-emerald-700" />
        {selected ? "انتخاب‌شده برای مقایسه فروشنده‌ها" : "مقایسه این فروشنده"}
      </label>
      {ready && !onChoose && <VisitActions shopId={s.shop_id} productId={productId} offerId={offer.offer_id} />}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button onClick={() => setAsk(true)} className="flex items-center justify-center gap-1 rounded-xl bg-brand-700 py-2 text-xs font-medium text-white active:scale-95">
          <MessageCircle size={14} /> قبل از رفتن بپرس
        </button>
        <button disabled={add.isPending || choosing} onClick={() => onChoose ? onChoose() : add.mutate({ shop_id: s.shop_id, product_id: productId, offer_id: offer.offer_id })}
          className="flex items-center justify-center gap-1 rounded-xl bg-brand-50 py-2 text-xs font-medium text-brand-800 active:scale-95">
          <Plus size={14} /> {onChoose ? "جایگزین مقصد" : "به مسیر"}
        </button>
        <button onClick={() => setNav(true)} className="flex items-center justify-center gap-1 rounded-xl bg-slate-100 py-2 text-xs font-medium text-slate-700 active:scale-95">
          <Navigation size={14} /> مسیریابی
        </button>
      </div>

      <AskSellerSheet open={ask} onClose={() => setAsk(false)} shop={s} offerId={offer.offer_id} productId={productId} />
      <NavSheet open={nav} onClose={() => setNav(false)} shop={s} />
    </div>
  );
}
