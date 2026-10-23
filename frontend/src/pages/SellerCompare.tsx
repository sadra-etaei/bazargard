import { useQuery } from "@tanstack/react-query";
import { ArrowRight, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { UnknownConditions } from "../components/UnknownConditions";
import { ContextBar } from "../components/ContextBar";
import { ShoppingRequirements } from "../components/ShoppingRequirements";
import { AskSellerSheet } from "../components/AskSeller";
import { NavSheet } from "../components/NavSheet";
import { Button, Empty, FreshBadge, OpenBadge, Skeleton, StockBadge } from "../components/ui";
import { api } from "../lib/api";
import { faNum, km, toman } from "../lib/format";
import { useAddVisit, useCtx } from "../lib/hooks";
import { eligibleOffer, lowestEligiblePrice, resolveSellers } from "../lib/sellerComparison";
import { usePrefs } from "../lib/store";
import type { Offer } from "../lib/types";

export default function SellerCompare() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const ctx = useCtx();
  const selection = usePrefs(s => s.sellerComparison);
  const ids = [...new Set((params.get("offers") || "").split(",").filter(Boolean))].slice(0, 3);
  const q = useQuery({ queryKey: ["product", id, ctx], queryFn: () => api.product(id, ctx) });
  const offers = resolveSellers(ids, q.data?.offers || []);
  const cheapest = lowestEligiblePrice(offers.filter((o): o is Offer => !!o));
  const remove = (offerId: string) => {
    const next = ids.filter(value => value !== offerId);
    setParams({ offers: next.join(",") }, { replace: true });
    if (selection?.productId === id) {
      const sellers = selection.sellers.filter(s => s.offerId !== offerId);
      usePrefs.getState().set({ sellerComparison: sellers.length ? { ...selection, sellers } : null });
    }
  };
  const rows: { label: string; render: (o: Offer) => React.ReactNode }[] = [
    { label: "قیمت این پیشنهاد", render: o => <div className={eligibleOffer(o) && o.price === cheapest ? "font-extrabold text-emerald-700" : "font-bold"}>{toman(o.price)}{eligibleOffer(o) && o.price === cheapest && <div className="mt-1 text-[10px]">کمترین قیمت مطابق شرایط در این مقایسه</div>}</div> },
    { label: "قیمت ثبت‌شده در ترب", render: o => toman(o.listed_price) },
    { label: "آخرین تغییر قیمت ثبت‌شده", render: o => <><FreshBadge age={o.price_age} /><div className="mt-1 text-[10px] text-slate-500">{o.price_age.at ? new Date(o.price_age.at).toLocaleString("fa-IR") : "زمان نامشخص"}</div></> },
    { label: "موجودی", render: o => <><StockBadge stock={o.stock} /><div className="mt-1 text-[10px] text-slate-500">{o.stock.by_seller ? "پاسخ فروشنده" : o.stock.state === "unconfirmed" ? "ثبت آفر به معنی موجودی نیست" : "گزارش کاربر"}{o.stock.at && ` · ${new Date(o.stock.at).toLocaleString("fa-IR")}`}</div></> },
    { label: "مطابقت با شرایط شما", render: o => o.matches_filters ? "مطابق فیلترهای فعلی" : "خارج از شرایط فعلی شما" },
    { label: "وضعیت هنگام رسیدن", render: o => <OpenBadge state={o.shop.status.state} label={o.shop.status.label} /> },
    { label: "فاصله و زمان تقریبی", render: o => o.shop.distance_km === null ? "ابتدا مبدأ را انتخاب کنید" : `${km(o.shop.distance_km)}${o.shop.travel_min !== null ? ` · حدود ${faNum(o.shop.travel_min)} دقیقه` : ""}` },
    { label: "آدرس و واحد", render: o => <>{o.shop.address || "ثبت نشده"}<div className="mt-1">{[o.shop.mall, o.shop.floor_label, o.shop.unit && `واحد ${faNum(o.shop.unit)}`].filter(Boolean).join(" · ")}</div></> },
    { label: "عنوان ثبت‌شده فروشنده", render: o => o.seller_title || "ثبت نشده" },
    { label: "گارانتی همین پیشنهاد", render: o => o.warranty?.label || "ثبت نشده؛ نیازمند استعلام" },
    { label: "ترب‌پی حضوری", render: o => o.shop.payments.torobpay === "in_person" ? "اعلام شده برای خرید حضوری" : o.shop.payments.torobpay === "unknown_channel" ? "پذیرندگی ثبت شده؛ حضوری بودن نامشخص" : "اطلاعات ثبت نشده" },
    { label: "اقساط حضوری", render: o => o.shop.payments.installments.filter(p => p.in_person).map(p => p.provider).join("، ") || "اطلاعات حضوری ثبت نشده" },
    { label: "ارسال فوری", render: o => o.shop.fast_delivery === null ? "نامشخص" : o.shop.fast_delivery ? "اعلام شده" : "ندارد" },
    { label: "دلیل پیشنهاد / هشدار", render: o => <div className="space-y-1">{o.reasons.map(r => <div key={r} className="text-emerald-800">{r}</div>)}{o.warnings.map(w => <div key={w} className="text-amber-800">{w}</div>)}</div> },
    { label: "قدم بعدی", render: o => <SellerActions offer={o} productId={id} /> },
  ];
  return <div className="mx-auto max-w-6xl px-3 pb-12">
    <div className="flex items-center gap-2 py-3"><button onClick={() => nav(-1)} aria-label="بازگشت" className="p-2"><ArrowRight size={20} /></button><h1 className="text-base font-extrabold">مقایسه فروشنده‌های یک کالا</h1></div>
    <Link to={`/p/${id}`} className="text-sm font-bold text-brand-700">{q.data?.title || "بازگشت به کالا و انتخاب فروشنده"}</Link>
    <div className="mt-3"><ContextBar compact /><ShoppingRequirements /><UnknownConditions /></div>
    <p className="my-3 text-xs leading-6 text-slate-500">۲ تا ۳ فروشنده را کنار هم ببینید. هر ستون مربوط به همان آفر است. با تغییر شرایط، فروشنده انتخاب‌شده عوض نمی‌شود. جدول را به طرفین بکشید.</p>
    {q.isLoading ? <Skeleton className="h-64" /> : q.isError ? <Empty title="دریافت مقایسه انجام نشد"><Button onClick={() => q.refetch()}>تلاش دوباره</Button></Empty> : !ids.length ? <Empty title="فروشنده‌ای انتخاب نشده"><Link to={`/p/${id}`} className="text-brand-700">انتخاب فروشنده‌ها</Link></Empty> : <>
      {ids.length < 2 && <div className="mb-3 rounded-xl bg-amber-50 p-3 text-xs">برای مقایسه، حداقل یک فروشنده دیگر از <Link to={`/p/${id}`} className="underline">صفحه کالا</Link> انتخاب کنید.</div>}
      <div className="mb-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${ids.length}, minmax(0, 1fr))` }}>
        {ids.map((offerId, i) => { const offer = offers[i]; return <div key={offerId} className="rounded-2xl border border-slate-200 bg-surface p-3">
          <div className="line-clamp-2 min-h-10 text-xs font-bold">{offer?.shop.name || "آفر در دسترس نیست"}</div>
          <div className="mt-2 text-sm font-extrabold">{offer ? toman(offer.price) : "—"}</div>
          <div className="mt-1 text-[10px] leading-5 text-slate-500">{offer?.stock.label || "اطلاعات نامشخص"}</div>
          {offer && <div className={`mt-1 text-[10px] leading-5 ${offer.matches_filters ? "text-emerald-700" : "text-amber-700"}`}>{offer.matches_filters ? "مطابق فیلترهای شما" : "خارج از شرایط شما"}</div>}
        </div>; })}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-surface"><table className="w-full border-separate border-spacing-0 text-xs" style={{ minWidth: 140 + ids.length * 230 }}>
        <thead><tr><th className="sticky right-0 z-10 w-36 bg-slate-50 p-3 text-right">{faNum(ids.length)} فروشنده</th>{ids.map((offerId, i) => <th key={offerId} className="min-w-[230px] border-r border-slate-200 p-3 text-right"><div className="flex items-start justify-between gap-3"><div>{offers[i]?.shop.name || "این آفر دیگر در دسترس نیست"}{offers[i] && !offers[i]!.shop.name_verified && <div className="mt-1 text-[10px] font-normal text-slate-400">نام نمایشی دیتاست</div>}</div><button aria-label="حذف فروشنده" onClick={() => remove(offerId)} className="rounded-full bg-slate-100 p-1"><X size={14} /></button></div></th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.label}><th className="sticky right-0 z-10 border-t border-slate-200 bg-slate-50 p-3 text-right align-top font-normal text-slate-500">{row.label}</th>{ids.map((offerId, i) => <td key={offerId} className="border-t border-r border-slate-200 p-3 align-top leading-6">{offers[i] ? row.render(offers[i]!) : "آفر پیدا نشد؛ فروشنده دیگری انتخاب کنید"}</td>)}</tr>)}</tbody>
      </table></div>
    </>}
  </div>;
}
function SellerActions({ offer, productId }: { offer: Offer; productId: string }) {
  const [ask, setAsk] = useState(false);
  const [nav, setNav] = useState(false);
  const add = useAddVisit();
  return <div className="flex flex-col gap-2"><Button onClick={() => setAsk(true)}>پیش از رفتن بپرس</Button><Button variant="outline" disabled={add.isPending || offer.stock.state === "out"} onClick={() => add.mutate({ shop_id: offer.shop.shop_id, product_id: productId, offer_id: offer.offer_id })}>افزودن به مسیر</Button><Button variant="ghost" onClick={() => setNav(true)}>مسیریابی</Button>
    <AskSellerSheet open={ask} onClose={() => setAsk(false)} shop={offer.shop} offerId={offer.offer_id} productId={productId} /><NavSheet open={nav} onClose={() => setNav(false)} shop={offer.shop} /></div>;
}
