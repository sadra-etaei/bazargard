import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { AlertTriangle, Building2, Check, Footprints, ListChecks, MessageCircle, Navigation, Plus, Route as RouteIcon, ShoppingBag, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { AskSellerSheet } from "../components/AskSeller";
import { AlternativesPanel } from "../components/Alternatives";
import { ContextBar } from "../components/ContextBar";
import { Purchases } from "../components/Purchases";
import { StoreMap } from "../components/StoreMap";
import { NavSheet } from "../components/NavSheet";
import { Button, Empty, OpenBadge, Section, Sheet, Skeleton, toast } from "../components/ui";
import { api } from "../lib/api";
import { faNum, km, minutes, toman } from "../lib/format";
import { useAddVisit, useCtx, useReport } from "../lib/hooks";
import { usePrefs } from "../lib/store";
import type { Leg } from "../lib/types";

export default function Trip() {
  const ctx = useCtx();
  const { journey, set } = usePrefs();
  const location = usePrefs((s) => s.location);
  const [firstVisitId, setFirstVisitId] = useState<number | null>(null);
  const plan = useQuery({ queryKey: ["plan", ctx, firstVisitId], queryFn: () => api.plan({ ...ctx, start_visit_id: firstVisitId }) });
  const visits = useQuery({ queryKey: ["visits"], queryFn: api.visits });
  const done = (visits.data || []).filter((v) => v.state !== "planned");
  const p = plan.data;

  return (
    <div className="px-4 pt-4 lg:px-0 lg:pt-6">
      <h1 className="text-xl font-extrabold lg:text-2xl">مسیر خرید</h1>
      <p className="mt-1 text-xs leading-5 text-slate-500 lg:text-sm">مغازه‌هایی که اضافه کرده‌اید به بهترین ترتیب چیده می‌شوند؛ ساعت رسیدن و باز بودن هر کدام را چک می‌کنیم.</p>
      <div className="mt-3"><ContextBar /></div>
      {!location && <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">برای ترتیب‌دهی و زمان رسیدن، نقطه شروع را انتخاب کنید.</div>}

      {plan.isLoading && <div className="mt-4 space-y-3"><Skeleton className="h-40" /><Skeleton className="h-28" /></div>}
      {p && p.legs.length === 0 && (
        <div className="mt-4">
          <Empty icon="🗺️" title="هنوز مغازه‌ای به مسیر اضافه نکرده‌اید">
            از صفحه هر کالا یا فروشگاه دکمه «به مسیر» را بزنید. <Link to="/" className="text-brand-700">جست‌وجو ←</Link>
          </Empty>
        </div>
      )}

      {p && p.legs.length > 0 && (
        <div className="lg:mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-start lg:gap-8">
          <div className="lg:sticky lg:top-24 lg:order-2">
            <div className="mt-4 grid grid-cols-3 gap-2 text-center lg:mt-0">
              <Stat label="توقف" value={faNum(p.stop_count ?? p.legs.length)} sub={p.malls ? `${faNum(p.places || 0)} مکان` : undefined} />
              <Stat label="زمان تقریبی" value={p.total_min_range ? `${faNum(p.total_min_range[0])}–${faNum(p.total_min_range[1])} دقیقه` : minutes(p.total_min)} />
              <Stat label="پایان حدودی" value={faNum(p.end_at || "")} />
            </div>
            {p.warnings.length > 0 && (
              <div className="mt-3 space-y-1.5 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
                {p.warnings.map((w) => <div key={w} className="flex gap-1.5 text-xs leading-5 text-amber-900"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{w}</div>)}
              </div>
            )}
            <StoreMap className="mt-3 h-56 md:h-72 lg:h-[46dvh]"
              route={[...(location ? [[location.lat, location.lon] as [number, number]] : []), ...p.legs.map((l) => [l.shop.lat, l.shop.lon] as [number, number])]}
              shops={p.legs.map((l) => l.shop)} offers={Object.fromEntries([...p.legs].reverse().map((l) => [l.shop.shop_id, { productId: l.product_id, offerId: l.offer_id }]))} />
            <details className="mt-2 text-xs leading-6 text-slate-500"><summary className="cursor-pointer">این زمان چطور محاسبه شده؟</summary>{p.assumptions}</details>
            <Link to="/go" onClick={() => {
              const continuing = p.legs.some((l) => l.visit_id === journey.activeVisitId);
              set({ visitAt: null, visitLabel: null, journey: continuing ? journey : { activeVisitId: p.legs[0].visit_id, step: 0, total: p.legs.length, outcomes: [], cachedPlan: null, cacheKey: "", savedAt: null } });
            }} className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-brand-600 to-brand-700 py-3.5 text-base font-extrabold text-white shadow-lg shadow-brand-700/25 active:scale-[0.98]">
              <Navigation size={18} /> {p.legs.some((l) => l.visit_id === journey.activeVisitId) ? "ادامه راهنمای خرید" : "همین الان می‌روم — شروع راهنما"}
            </Link>
            {p.route_url && <Button href={p.route_url} variant="soft" className="mt-2 w-full"><RouteIcon size={16} /> کل مسیر در گوگل‌مپ</Button>}
          </div>
          <div className="mt-4 lg:order-1 lg:mt-0">
            {p.legs.map((l, i) => <LegCard key={l.visit_id} leg={l} index={i} onPrioritize={() => setFirstVisitId(l.visit_id)} />)}
          </div>
        </div>
      )}

      <ShoppingList />

      <Purchases items={done.filter((v) => v.state === "bought")} compact />

      {done.some((v) => v.state !== "bought") && (
        <Section title="مراجعه‌شده و ردشده">
          <div className="grid gap-1.5 md:grid-cols-2">
            {done.filter((v) => v.state !== "bought").map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-xs ring-1 ring-slate-900/[0.06] shadow-card">
                <span className="line-clamp-1">{v.product_title || "مراجعه"}</span>
                <span className="shrink-0 text-slate-500">{{ visited: "مراجعه شد", skipped: "نداشت/لغو", planned: "", bought: "" }[v.state]}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-surface p-2.5 ring-1 ring-slate-900/[0.06] shadow-card">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-sm font-extrabold">{value}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}

function LegCard({ leg, index, onPrioritize }: { leg: Leg; index: number; onPrioritize: () => void }) {
  const qc = useQueryClient();
  const report = useReport();
  const [ask, setAsk] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [outcome, setOutcome] = useState<null | "bought" | "missing">(null);
  const [paid, setPaid] = useState("");
  const s = leg.shop;
  const update = useMutation({
    mutationFn: (p: { state?: string; paid_price?: number | null }) => api.updateVisit(leg.visit_id, p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["visits"] }); qc.invalidateQueries({ queryKey: ["plan"] }); },
  });
  const finish = useMutation({
    mutationFn: (price: number | null) => api.completeVisit(leg.visit_id, { state: "bought", paid_price: price }),
    onSuccess: () => {
      setOutcome(null);
      qc.invalidateQueries({ queryKey: ["visits"] }); qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["product"] }); qc.invalidateQueries({ queryKey: ["search"] });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteVisit(leg.visit_id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["visits"] }); qc.invalidateQueries({ queryKey: ["plan"] }); },
  });

  return (
    <div className="relative pr-9 pb-4">
      <div className="absolute top-0 right-0 flex size-7 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">{faNum(index + 1)}</div>
      <div className="absolute top-8 right-3.5 bottom-0 w-0.5 bg-brand-100" />
      <div className="mb-1.5 text-[11px] text-slate-500">
        {leg.same_store_as_previous ? <span>کالای دیگر در همین فروشگاه؛ بدون توقف تازه</span> : leg.same_mall_as_previous ? <span className="flex items-center gap-1"><Footprints size={12} />{faNum(leg.travel_min)} دقیقه پیاده در همین پاساژ{leg.floor_move && ` · ${leg.floor_move}`}</span>
          : leg.travel_min ? `${minutes(leg.travel_min)} راه (${km(leg.travel_km)})` : null}
        {" · "}رسیدن حدود <b className="text-slate-800">{faNum(leg.arrive_label)}</b>
      </div>
      <div className={clsx("rounded-2xl bg-surface p-3 ring-1", leg.status_on_arrival.state === "closed" ? "ring-rose-300" : "ring-slate-200")}>
        <div className="flex gap-3">
          {leg.image && <img src={leg.image} alt="" className="size-14 shrink-0 rounded-xl bg-slate-50 object-contain" />}
          <div className="min-w-0 flex-1">
            <Link to={`/s/${s.shop_id}`} className="block truncate font-bold">{s.name}</Link>
            {leg.product_title && <Link to={`/p/${leg.product_id}`} className="line-clamp-1 text-xs text-slate-600">{leg.product_title}</Link>}
            {leg.listed_price && <div className="text-xs font-bold text-slate-900">قیمت ثبت‌شده: {toman(leg.listed_price)}</div>}
          </div>
        </div>
        {s.mall && (
          <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-brand-900">
            <Building2 size={13} /> {s.mall}{s.floor_label && ` · ${faNum(s.floor_label)}`}{s.unit && ` · واحد ${faNum(s.unit)}`}
          </div>
        )}
        <div className="mt-2"><OpenBadge state={leg.status_on_arrival.state} label={`هنگام رسیدن: ${leg.status_on_arrival.label}`} /></div>
        {(leg.closing_risk || leg.status_on_arrival.state === "closing_soon") && index > 0 && <Button variant="outline" size="sm" className="mt-2 w-full" onClick={onPrioritize}>اول اینجا برو — محاسبه دوباره</Button>}
        <div className="mt-3 grid grid-cols-4 gap-1.5 text-[11px]">
          <LegBtn onClick={() => setAsk(true)} icon={<MessageCircle size={15} />}>استعلام</LegBtn>
          <LegBtn onClick={() => setNavOpen(true)} icon={<Navigation size={15} />}>مسیریابی</LegBtn>
          <LegBtn onClick={() => setOutcome("bought")} icon={<Check size={15} />} tone="green">خریدم</LegBtn>
          <LegBtn onClick={() => {
            setOutcome("missing");
            report.mutate({ shop_id: s.shop_id, product_id: leg.product_id, status: "out_of_stock", source: "visit" });
          }} icon={<X size={15} />} tone="red">نداشت</LegBtn>
        </div>
        <button onClick={() => remove.mutate()} className="mt-2 flex items-center gap-1 text-[11px] text-slate-400"><Trash2 size={12} /> حذف از مسیر</button>
      </div>
      <AskSellerSheet open={ask} onClose={() => setAsk(false)} shop={s} offerId={leg.offer_id} productId={leg.product_id} />
      {remove.isError && <p role="alert" className="text-xs text-rose-700">حذف مقصد انجام نشد؛ دوباره تلاش کنید.</p>}
      <NavSheet open={navOpen} onClose={() => setNavOpen(false)} shop={s} />
      <Sheet open={outcome === "bought"} onClose={() => setOutcome(null)} title="مبارک باشه! 🎉">
        <div className="text-sm text-slate-600">چند خریدید؟ (اختیاری — به بقیه خریداران کمک می‌کند قیمت واقعی را بدانند)</div>
        <input inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value.replace(/[^\d۰-۹٠-٩]/g, ""))} placeholder="مبلغ پرداختی (تومان)" dir="ltr"
          className="mt-3 h-11 w-full rounded-xl border border-slate-200 px-3 text-right" />
        <Button disabled={finish.isPending} className="mt-3 w-full" size="lg" onClick={() => {
          const value = paid.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
          finish.mutate(value ? Number(value) : null);
        }}>ثبت خرید</Button>
        {finish.isError && <p role="alert" className="mt-2 text-xs text-rose-700">خرید ذخیره نشد؛ دوباره تلاش کنید. {finish.error.message}</p>}
      </Sheet>
      <Sheet open={outcome === "missing"} onClose={() => setOutcome(null)} title="نداشت؟ این‌ها را ببینید">
        {leg.product_id ? <AlternativesPanel productId={leg.product_id} excludeShop={s.shop_id} replaceVisitId={leg.visit_id} atShop onReplaced={() => setOutcome(null)} /> : <div className="text-sm">فروشگاه دیگری انتخاب کنید.</div>}
        <Button disabled={update.isPending} variant="outline" className="mt-3 w-full" onClick={() => update.mutate({ state: "skipped" }, { onSuccess: () => setOutcome(null) })}>رد کردن این مقصد بدون جایگزین</Button>
        {update.isError && <p role="alert" className="text-xs text-rose-700">تغییر مسیر ذخیره نشد؛ دوباره تلاش کنید.</p>}
      </Sheet>
    </div>
  );
}

function LegBtn({ children, onClick, icon, tone }: { children: React.ReactNode; onClick: () => void; icon: React.ReactNode; tone?: "green" | "red" }) {
  return (
    <button onClick={onClick} className={clsx("flex flex-col items-center gap-0.5 rounded-xl py-2",
      tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "red" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700")}>
      {icon}{children}
    </button>
  );
}

function ShoppingList() {
  const ctx = useCtx();
  const qc = useQueryClient();
  const add = useAddVisit();
  const [showPlans, setShowPlans] = useState(false);
  const list = useQuery({ queryKey: ["list"], queryFn: api.list });
  const cover = useQuery({ queryKey: ["cover", ctx, list.data?.length], queryFn: () => api.cover(ctx), enabled: showPlans });
  const del = useMutation({ mutationFn: api.deleteList, onSuccess: () => qc.invalidateQueries({ queryKey: ["list"] }) });
  const items = list.data || [];
  const withProduct = items.filter((i) => i.product_id);

  return (
    <Section title={<span className="flex items-center gap-1.5"><ListChecks size={18} /> لیست خرید چندقلمی</span>}>
      {items.length === 0 ? (
        <Empty icon="🧾" title="لیست خرید خالی است">
          چند قلم لازم دارید؟ در صفحه هر کالا «لیست خرید» را بزنید؛ بعد می‌گوییم کدام پاساژ یا مغازه‌ها همه را با هم دارند.
        </Empty>
      ) : (
        <>
          <div className="grid gap-1.5 md:grid-cols-2">
            {items.map((i) => (
              <div key={i.id} className="flex items-center gap-2 rounded-xl bg-surface p-2 ring-1 ring-slate-900/[0.06] shadow-card">
                {i.product?.image ? <img src={i.product.image} alt="" className="size-10 rounded-lg bg-slate-50 object-contain" /> : <ShoppingBag size={20} className="m-2.5 text-slate-400" />}
                <Link to={i.product_id ? `/p/${i.product_id}` : `/search?q=${encodeURIComponent(i.query)}`} className="line-clamp-1 flex-1 text-xs">{i.product?.title || i.query}</Link>
                <button onClick={() => del.mutate(i.id)} className="p-1.5 text-slate-400" aria-label="حذف"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          {withProduct.length >= 1 && (
            <Button className="mt-3 w-full md:w-auto" variant={showPlans ? "soft" : "primary"} onClick={() => setShowPlans(true)}>
              <RouteIcon size={16} /> کجا همه را با هم بخرم؟
            </Button>
          )}
        </>
      )}
      {showPlans && (
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {cover.isLoading && <Skeleton className="h-32" />}
          {cover.data?.plans.length === 0 && <Empty title="فروشنده‌ای در شرایط فعلی پیدا نشد">محدوده یا زمان را تغییر دهید.</Empty>}
          {cover.data?.plans.map((pl, idx) => (
            <div key={pl.place_keys.join()} className={clsx("rounded-2xl bg-surface p-3 ring-1", idx === 0 ? "ring-2 ring-brand-500" : "ring-slate-200")}>
              <div className="mb-1 flex flex-wrap gap-1">
                {idx === 0 && <span className="text-[11px] font-bold text-brand-700">بهترین ترکیب</span>}
                {pl.tags?.map((tg) => <span key={tg} className="rounded-full bg-emerald-50 px-2 text-[11px] text-emerald-700">{tg}</span>)}
              </div>
              <div className="text-sm font-bold">{pl.places.join(" + ")}</div>
              <div className="text-xs text-slate-500">{pl.summary}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-600">
                <span>حدود {minutes(pl.total_min)} با خرید</span>
                {pl.total_km ? <span>{km(pl.total_km)}</span> : null}
                {pl.extra_vs_cheapest ? <span>{toman(pl.extra_vs_cheapest)} گران‌تر از ارزان‌ترین</span> : null}
              </div>
              <div className="mt-2 space-y-1">
                {pl.picks.map((pk) => (
                  <div key={pk.product_id} className="flex justify-between gap-2 text-xs">
                    <span className="line-clamp-1">{pk.title}</span>
                    <span className="shrink-0 text-slate-500">{pk.offer.shop.name}{pk.offer.shop.floor_label ? ` · ${faNum(pk.offer.shop.floor_label)}` : ""} · {toman(pk.offer.price)}</span>
                  </div>
                ))}
                {pl.missing.map((m) => <div key={m} className="text-xs text-rose-600">✕ {m}</div>)}
                {pl.warnings.slice(0, 2).map((w) => <div key={w} className="text-[11px] text-amber-700">⚠ {w}</div>)}
              </div>
              <Button size="sm" variant="soft" className="mt-2.5 w-full" onClick={() => {
                pl.picks.forEach((pk) => add.mutate({ shop_id: pk.offer.shop.shop_id, product_id: pk.product_id, offer_id: pk.offer.offer_id }));
                toast.success("همه به مسیر اضافه شدند");
              }}><Plus size={14} /> افزودن همه به مسیر</Button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
