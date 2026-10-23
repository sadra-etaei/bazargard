import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Sparkles, Store } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { faNum, km, toman } from "../lib/format";
import { useCtx } from "../lib/hooks";
import { usePrefs } from "../lib/store";
import type { Offer } from "../lib/types";
import type { BestNext, CategoryShops } from "../lib/types";
import { OfferCard } from "./OfferCard";
import { Empty, OpenBadge, Spinner } from "./ui";

export function AlternativesPanel({ productId, excludeShop, compact, replaceVisitId, atShop = false, onReplaced }: { productId: string; excludeShop?: string; compact?: boolean; replaceVisitId?: number; atShop?: boolean; onReplaced?: () => void }) {
  const ctx = useCtx();
  const { pathname } = useLocation();
  const qc = useQueryClient();
  const visits = useQuery({ queryKey: ["visits"], queryFn: api.visits, enabled: !!excludeShop });
  const oldVisit = replaceVisitId ?? visits.data?.find((v) => v.shop_id === excludeShop && v.product_id === productId && v.state === "planned")?.id;
  const recovery = useMutation({
    mutationFn: (offer: Offer) => {
      const target = { shop_id: offer.shop.shop_id, product_id: productId, offer_id: offer.offer_id };
      return oldVisit ? api.replaceVisit(oldVisit, target) : api.addVisit(target);
    },
    onSuccess: (visit) => {
      onReplaced?.();
      const state = usePrefs.getState();
      if (pathname === "/go" || oldVisit === state.journey.activeVisitId) state.set({ journey: { ...state.journey, activeVisitId: visit.id, step: 0, cachedPlan: null, cacheKey: "", savedAt: null } });
      qc.invalidateQueries({ queryKey: ["visits"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
    },
  });
  const q = useQuery({ queryKey: ["alt", productId, excludeShop, ctx, atShop], queryFn: () => api.alternatives(productId, ctx, excludeShop, atShop) });
  if (q.isLoading) return <Spinner label="دنبال جایگزین می‌گردم…" />;
  if (q.isError) return <div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">جایگزین‌ها دریافت نشد. <button className="font-bold underline" onClick={() => q.refetch()}>تلاش دوباره</button></div>;
  if (!q.data) return null;
  const a = q.data;
  const none = !a.same_product.length && !a.similar.length;
  return (
    <div className="space-y-4">
      {recovery.isError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-800">مسیر تغییر نکرد: {recovery.error.message}</p>}
      {recovery.isSuccess && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">مقصد ذخیره شد و مسیر دوباره محاسبه می‌شود. <Link className="font-bold underline" to="/trip">دیدن مسیر</Link></p>}
      {a.best_next && <BestNextCard b={a.best_next} replacing={!!oldVisit} busy={recovery.isPending || (!!excludeShop && !visits.data)} onGo={() => recovery.mutate(a.best_next!.offer)} />}
      {atShop && a.same_mall.length > 0 && (
        <div className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
          <div className="flex items-center gap-1.5 font-bold"><Building2 size={15} /> در همین پاساژ</div>
          <div className="mt-1 text-xs">{faNum(a.same_mall.length)} فروشنده دیگر در همین پاساژ این کالا را ثبت کرده‌اند — لازم نیست جای دیگری بروید.</div>
        </div>
      )}
      {a.same_product.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-bold text-slate-700">همین کالا، فروشنده‌های دیگر</div>
          <div className="space-y-2.5">
            {a.same_product.slice(0, compact ? 2 : 4).map((o) => <OfferCard key={o.offer_id} offer={o} productId={productId} onChoose={oldVisit ? () => recovery.mutate(o) : undefined} choosing={recovery.isPending} />)}
          </div>
        </div>
      )}
      {a.similar.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-bold text-slate-700">کالاهای مشابه — قبل از جایگزینی، مدل و سازگاری را بررسی کنید</div>
          <div className="space-y-2">
            {a.similar.map((p) => (
              <Link key={p.product_id} to={`/p/${p.product_id}`} className="flex gap-3 rounded-2xl bg-surface p-2.5 ring-1 ring-slate-900/[0.06] shadow-card">
                <img src={p.image || ""} alt="" loading="lazy" className="size-16 shrink-0 rounded-xl bg-slate-100 object-contain" />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-[13px] font-medium leading-6">{p.title}</div>
                  <div className="mt-0.5 text-xs text-brand-800">{p.why}</div>
                  <div className="mt-1 text-[11px] leading-5 text-amber-800">{p.differences?.length ? p.differences.slice(0, 3).map((d) => `${d.key}: ${d.original || "نامشخص"} ← ${d.alternative || "نامشخص"}`).join(" · ") : "اطلاعات برای تأیید سازگاری کافی نیست؛ از فروشنده بپرسید."}</div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="font-bold">{toman(p.best.price)}</span>
                    <span className="text-slate-500">{p.best.shop.name}{p.best.shop.distance_km !== null && ` · ${km(p.best.shop.distance_km)}`}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
      {none && <Empty icon="🔎" title="جایگزینی در فیلترهای شما پیدا نشد">محدوده یا زمان مراجعه را تغییر دهید.</Empty>}
      {a.category_shops && a.category_shops.count > 0 && <CategoryShopsBox data={a.category_shops} />}
    </div>
  );
}

export function CategoryShopsBox({ data }: { data: CategoryShops }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-surface p-3">
      <div className="text-sm font-bold text-slate-700">شاید این‌ها هم داشته باشند ({faNum(data.count)} فروشگاه)</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{data.note}</div>
      <div className="mt-2 space-y-1.5">
        {data.shops.slice(0, 4).map((s) => (
          <Link key={s.shop_id} to={`/s/${s.shop_id}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-1.5"><Store size={14} className="shrink-0 text-slate-400" /><span className="truncate">{s.name}</span>
              {s.distance_km !== null && <span className="shrink-0 text-xs text-slate-400">{km(s.distance_km)}</span>}</span>
            <OpenBadge state={s.status.state} label={s.status.state === "unknown" ? "ساعت نامشخص" : s.status.label.slice(0, 18)} />
          </Link>
        ))}
      </div>
    </div>
  );
}


/** One clear next move when the shop doesn't have it, with what you give up by taking it. */
function BestNextCard({ b, onGo, replacing, busy }: { b: BestNext; onGo: () => void; replacing: boolean; busy: boolean }) {
  const s = b.offer.shop;
  return (
    <div className="rounded-2xl bg-brand-50 p-3.5 ring-2 ring-brand-500">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-brand-800"><Sparkles size={13} /> پیشنهاد بعدی ما · {b.headline}</div>
      {b.product && <Link to={`/p/${b.product.product_id}`} className="mt-1 line-clamp-2 block text-[13px] font-medium leading-6">{b.product.title}</Link>}
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{s.name}</div>
          <div className="text-xs text-slate-600">{s.mall ? `${s.mall}${s.floor_label ? ` · ${faNum(s.floor_label)}` : ""}` : s.area}{s.distance_km !== null && ` · ${km(s.distance_km)}`}</div>
        </div>
        <div className="shrink-0 text-sm font-extrabold">{toman(b.offer.price)}</div>
      </div>
      <div className="mt-1.5 rounded-lg bg-surface/70 px-2.5 py-1.5 text-xs text-brand-900">تفاوت با گزینه قبلی: {b.tradeoff}</div>
      {b.kind === "similar" && b.product ? <Link to={`/p/${b.product.product_id}`} className="mt-3 block text-sm font-bold text-brand-800 underline">بررسی مشخصات و سازگاری این کالا</Link> : <button disabled={busy} onClick={onGo} className="mt-2.5 flex w-full items-center justify-center gap-1 rounded-xl bg-brand-700 py-2 text-sm font-medium text-white">
        <Plus size={14} /> {replacing ? "جایگزین مقصد قبلی و محاسبه مسیر" : "افزودن این گزینه به مسیر"}
      </button>}
    </div>
  );
}
