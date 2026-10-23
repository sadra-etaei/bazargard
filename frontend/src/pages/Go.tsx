import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight, Building2, Check, ChevronLeft, ChevronRight, Clock, MessageCircle, Navigation, PartyPopper, ShoppingBag, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlternativesPanel } from "../components/Alternatives";
import { AskSellerSheet } from "../components/AskSeller";
import { ContextBar } from "../components/ContextBar";
import { StoreMap } from "../components/StoreMap";
import { StoreNeighbors } from "../components/StoreNeighbors";
import { NavSheet } from "../components/NavSheet";
import { Button, Empty, OpenBadge, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { faNum, km, minutes, toman } from "../lib/format";
import { useCtx, useReport } from "../lib/hooks";
import { usePrefs } from "../lib/store";
import type { Leg } from "../lib/types";

const STEPS = [
  { key: "ask", label: "بپرس", icon: MessageCircle },
  { key: "go", label: "برو", icon: Navigation },
  { key: "find", label: "پیدا کن", icon: Building2 },
  { key: "result", label: "نتیجه", icon: ShoppingBag },
] as const;

interface Outcome {
  title: string;
  shop: string;
  kind: "bought" | "missing" | "skipped";
  paid?: number | null;
}

/** "I'm going now": one stop at a time — ask, travel, find the unit, record the result, then the next stop. */
export default function Go() {
  const nav = useNavigate();
  const ctx = useCtx();
  const location = usePrefs((s) => s.location);
  const journey = usePrefs((state) => state.journey);
  const cacheKey = JSON.stringify(ctx);
  const cacheFresh = journey.savedAt && Date.now() - Date.parse(journey.savedAt) < 24 * 60 * 60 * 1000;
  const cached = cacheFresh && journey.cacheKey === cacheKey ? journey.cachedPlan : null;
  const plan = useQuery({
    queryKey: ["plan", "guide", ctx, journey.activeVisitId],
    queryFn: () => api.plan({ ...ctx, start_visit_id: journey.activeVisitId }),
    initialData: cached ?? undefined,
    initialDataUpdatedAt: cached ? Date.parse(journey.savedAt!) : undefined,
    refetchOnMount: "always", refetchInterval: 60000, retry: 1,
  });
  const legs = plan.data?.legs ?? [];
  const leg = legs.find((item) => item.visit_id === journey.activeVisitId) ?? legs[0];
  const step = leg?.visit_id === journey.activeVisitId ? journey.step : 0;
  const total = Math.max(journey.total, legs.length + journey.outcomes.length);
  const outcomes = journey.outcomes;
  const setStep = (value: number) => {
    const state = usePrefs.getState();
    state.set({ journey: { ...state.journey, activeVisitId: leg?.visit_id ?? null, step: value } });
  };
  useEffect(() => {
    if (!plan.data || !plan.isSuccess || plan.isFetching || plan.fetchStatus !== "idle") return;
    const state = usePrefs.getState();
    const current = plan.data.legs.find((item) => item.visit_id === state.journey.activeVisitId) ?? plan.data.legs[0];
    state.set({ journey: { ...state.journey,
      activeVisitId: current?.visit_id ?? null,
      step: current?.visit_id === state.journey.activeVisitId ? state.journey.step : 0,
      total: Math.max(state.journey.total, plan.data.legs.length + state.journey.outcomes.length),
      cachedPlan: plan.data, cacheKey, savedAt: new Date().toISOString(),
    } });
  }, [plan.data, plan.dataUpdatedAt, plan.isFetching, plan.fetchStatus, plan.isSuccess, cacheKey]);

  const record = (o: Outcome) => {
    const state = usePrefs.getState();
    state.set({ visitAt: null, visitLabel: null,
      location: leg ? { lat: leg.shop.lat, lon: leg.shop.lon, label: leg.shop.name, source: "place" } : state.location,
      journey: { ...state.journey,
        activeVisitId: legs.find((item) => item.visit_id !== leg?.visit_id && item.shop.shop_id === leg?.shop.shop_id)?.visit_id ?? null,
        step: legs.some((item) => item.visit_id !== leg?.visit_id && item.shop.shop_id === leg?.shop.shop_id) ? 3 : 0,
        cachedPlan: null, cacheKey: "", savedAt: null,
        outcomes: [...state.journey.outcomes, o] } });
  };
  const doneCount = outcomes.length;

  if (plan.isPending && plan.fetchStatus === "paused") return <div className="p-4"><Empty icon="📴" title="مسیر ذخیره‌شده‌ای در دسترس نیست">برای دریافت مسیر به اینترنت وصل شوید.</Empty></div>;
  if (plan.isPending) return <div className="w-full space-y-3 p-4"><Skeleton className="h-14" /><Skeleton className="h-72" /></div>;

  if (!leg && plan.isError) return <div className="p-4"><Empty icon="⚠️" title="مسیر دریافت نشد"><Button onClick={() => plan.refetch()}>تلاش دوباره</Button></Empty></div>;
  if (!leg) {
    return outcomes.length > 0 ? <Finished outcomes={outcomes} /> : (
      <div className="mx-auto max-w-lg p-4 pt-10">
        <Empty icon="🧭" title="مسیری برای راهنمایی نیست">اول از صفحه کالا یا فروشگاه، مغازه‌ها را «به مسیر» اضافه کنید.
          <div className="mt-3 flex justify-center gap-2"><Button href="/" variant="soft">جست‌وجو</Button><Button href="/trip" variant="outline">مسیر خرید</Button></div>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh w-full flex-col lg:min-h-[calc(100dvh-4rem)]">
      {(plan.isError || plan.fetchStatus === "paused") && <div role="status" className="bg-amber-50 p-3 text-xs leading-6 text-amber-900">اطلاعات ذخیره‌شده مسیر نمایش داده می‌شود؛ ساعت و موجودی ممکن است تغییر کرده باشد. <button className="font-bold underline" onClick={() => plan.refetch()}>به‌روزرسانی</button></div>}
      <header className="sticky top-0 z-[1000] border-b border-slate-200 bg-surface/95 px-4 pt-3 pb-3 backdrop-blur lg:top-16 lg:rounded-b-3xl lg:border-x">
        <div className="flex items-center gap-2">
          <button onClick={() => nav("/trip")} className="rounded-full p-1.5 text-slate-600 hover:bg-slate-100" aria-label="خروج از حالت راهنما"><ArrowRight size={20} /></button>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-extrabold">مقصد {faNum(doneCount + 1)} از {faNum(total)}</div>
            <div className="truncate text-[11px] text-slate-500">{leg.shop.name}{leg.product_title ? ` · ${leg.product_title}` : ""}</div>
          </div>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-800">{faNum(plan.data?.end_at || "")} پایان</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${((doneCount + (step + 1) / STEPS.length) / total) * 100}%` }} />
        </div>
        <ol className="mt-3 grid grid-cols-4 gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s.key}>
              <button onClick={() => i <= step && setStep(i)} disabled={i > step}
                className={clsx("flex w-full flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] transition",
                  i === step ? "bg-brand-700 font-bold text-white shadow-sm" : i < step ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400")}>
                {i < step ? <Check size={15} /> : <s.icon size={15} />}
                {s.label}
              </button>
            </li>
          ))}
        </ol>
      </header>

      <div className="flex-1 px-4 py-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-6 lg:px-0">
        <div className="min-w-0">
          {step === 0 && <AskStep leg={leg} />}
          {step === 1 && <GoStep leg={leg} />}
          {step === 2 && <FindStep leg={leg} />}
          {step === 3 && <ResultStep key={leg.visit_id} leg={leg} onDone={record} />}

          {step < 3 && (
            <div className="sticky bottom-0 mt-4 flex gap-2 bg-gradient-to-t from-paper via-paper to-transparent pt-3 pb-4 pb-safe">
              {step > 0 && <Button variant="outline" size="lg" onClick={() => setStep(step - 1)}><ChevronRight size={18} /> قبلی</Button>}
              <Button size="lg" className="flex-1" onClick={() => setStep(step + 1)}>
                {["ادامه — راه بیفتیم", "رسیدم", "نتیجه خرید"][step]} <ChevronLeft size={18} />
              </Button>
            </div>
          )}
        </div>

        <aside className="mt-4 lg:mt-0">
          <div className="lg:sticky lg:top-40">
            <StoreMap className="h-56 md:h-72 lg:h-[calc(100dvh-14rem)]"
              route={location ? [[location.lat, location.lon], [leg.shop.lat, leg.shop.lon]] : undefined}
              shops={[leg.shop]} offers={{ [leg.shop.shop_id]: { productId: leg.product_id, offerId: leg.offer_id } }} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("animate-fadein rounded-3xl bg-surface p-4 ring-1 ring-slate-900/[0.06] shadow-card", className)}>{children}</div>;
}

function ItemRow({ leg }: { leg: Leg }) {
  return (
    <div className="flex gap-3">
      {leg.image && <img src={leg.image} alt="" className="size-20 shrink-0 rounded-2xl bg-slate-50 object-contain" />}
      <div className="min-w-0">
        <div className="line-clamp-2 text-sm font-bold leading-6">{leg.product_title || "مراجعه به فروشگاه"}</div>
        {leg.listed_price ? <div className="mt-0.5 text-base font-extrabold">{toman(leg.listed_price)} <span className="text-[11px] font-normal text-slate-400">قیمت ثبت‌شده در ترب</span></div> : null}
      </div>
    </div>
  );
}

/* ---- 1. ask ---------------------------------------------------------------------------------- */
function AskStep({ leg }: { leg: Leg }) {
  const [ask, setAsk] = useState(false);
  const st = leg.status_on_arrival;
  return (
    <div className="space-y-3">
      <Card>
        <div className="text-xs font-bold text-slate-500">قبل از راه افتادن</div>
        <div className="mt-1 text-lg font-extrabold">{leg.shop.name}</div>
        <div className="mt-3"><ItemRow leg={leg} /></div>
        <div className="mt-3"><OpenBadge state={st.state} label={`هنگام رسیدن: ${st.label}`} /></div>
        {st.state === "closed" && <div className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">این مغازه هنگام رسیدن شما بسته است{st.next_open ? `؛ ${st.next_open} باز می‌شود` : ""}. بهتر است اول جای دیگری بروید یا زمان را عوض کنید.</div>}
      </Card>
      <Card className="bg-brand-50 ring-brand-100">
        <div className="flex items-center gap-1.5 text-sm font-bold text-brand-900"><MessageCircle size={16} /> مطمئن شوید موجود است</div>
        <div className="mt-1 text-xs leading-5 text-brand-900/80">قیمت و موجودی ثبت‌شده ممکن است با امروز فرق کند. بازارگرد با پیامک یا تماس از فروشنده می‌پرسد؛ یا اگر عجله دارید، همین حالا راه بیفتید.</div>
        <Button className="mt-3 w-full" onClick={() => setAsk(true)}><MessageCircle size={16} /> استعلام از فروشنده</Button>
      </Card>
      <AskSellerSheet open={ask} onClose={() => setAsk(false)} shop={leg.shop} offerId={leg.offer_id} productId={leg.product_id} />
    </div>
  );
}

/* ---- 2. go ----------------------------------------------------------------------------------- */
function GoStep({ leg }: { leg: Leg }) {
  const [navOpen, setNavOpen] = useState(false);
  const s = leg.shop;
  return (
    <div className="space-y-3">
      <Card>
        <div className="text-xs font-bold text-slate-500">مسیر</div>
        <div className="mt-2"><ContextBar compact /></div>
        <p className="mt-1 text-[11px] leading-5 text-slate-500">برای زمان دقیق‌تر، محل فعلی را به‌روز کنید. ساعت رسیدن تقریبی است.</p>
        {leg.status_on_arrival.state === "closed" && <div className="mt-2 rounded-xl bg-rose-50 p-3 text-xs leading-6 text-rose-800">طبق ساعت ثبت‌شده، هنگام رسیدن بسته است. <Link className="font-bold underline" to="/trip">تغییر زمان یا مقصد</Link></div>}
        <div className="mt-1 grid grid-cols-3 gap-2 text-center">
          <Metric label="مسافت" value={leg.travel_km ? km(leg.travel_km) : "—"} />
          <Metric label="زمان تقریبی" value={leg.travel_known === false ? "مبدأ نامشخص" : leg.travel_min_range ? `${faNum(leg.travel_min_range[0])} تا ${faNum(leg.travel_min_range[1])} دقیقه` : minutes(leg.travel_min)} />
          <Metric label="رسیدن" value={faNum(leg.arrive_label)} />
        </div>
        <div className="mt-3"><OpenBadge state={leg.status_on_arrival.state} label={`هنگام رسیدن: ${leg.status_on_arrival.label}`} /></div>
        {s.address && <div className="mt-3 text-xs leading-6 text-slate-600">{s.address}</div>}
      </Card>
      <Card>
        <div className="mb-2 text-sm font-bold">باز کردن در برنامه مسیریاب</div>
        <div className="grid grid-cols-3 gap-2">
          {s.nav.neshan && <Button href={s.nav.neshan} variant="outline">نشان</Button>}
          {s.nav.balad && <Button href={s.nav.balad} variant="outline">بلد</Button>}
          {s.nav.google && <Button href={s.nav.google} variant="outline">گوگل‌مپ</Button>}
        </div>
        <Button variant="ghost" className="mt-2 w-full" onClick={() => setNavOpen(true)}><Navigation size={15} /> آدرس و کپی</Button>
      </Card>
      <StoreNeighbors shop={s} />
      <NavSheet open={navOpen} onClose={() => setNavOpen(false)} shop={s} />
    </div>
  );
}

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl bg-slate-50 p-2.5"><div className="text-[11px] text-slate-500">{label}</div><div className="text-sm font-extrabold">{value}</div></div>
);

/* ---- 3. find --------------------------------------------------------------------------------- */
function FindStep({ leg }: { leg: Leg }) {
  const { visitLabel, conditions } = usePrefs();
  const s = leg.shop;
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [lost, setLost] = useState(false);
  const [ask, setAsk] = useState(false);
  const msg = useQuery({
    queryKey: ["msg", s.shop_id, leg.offer_id, visitLabel, conditions.installments, conditions.torobpay],
    queryFn: () => api.message({ shop_id: s.shop_id, offer_id: leg.offer_id, visit_label: visitLabel, installments: conditions.installments, torobpay: conditions.torobpay }),
  });
  return (
    <div className="space-y-3">
      <Card className="bg-gradient-to-br from-brand-50 to-surface ring-brand-100">
        <div className="text-xs font-bold text-slate-500">رسیدید؟ اینجا دنبالش بگردید</div>
        {s.mall ? (
          <>
            <div className="mt-1 flex items-center gap-2 text-lg font-extrabold"><Building2 size={20} className="text-brand-700" /> {s.mall}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {s.floor_label && <span className="rounded-2xl bg-brand-700 px-4 py-2 text-base font-extrabold text-white">{faNum(s.floor_label)}</span>}
              {s.unit && <span className="rounded-2xl bg-amber-400 px-4 py-2 text-base font-extrabold text-amber-950">واحد {faNum(s.unit)}</span>}
              {!s.floor_label && !s.unit && <span className="text-sm text-slate-500">طبقه و واحد ثبت نشده؛ نام «{s.name}» را از نگهبان یا تابلوها بپرسید.</span>}
            </div>
          </>
        ) : (
          <div className="mt-1 text-sm leading-7">{s.address || "آدرس ثبت نشده"}<div className="text-xs text-slate-500">نام مغازه: <b>{s.name}</b></div></div>
        )}
      </Card>
      <div className="rounded-2xl bg-surface p-3 ring-1 ring-slate-200">
        <div className="text-lg font-extrabold">{s.name}</div>
        {!s.name_verified && <p className="mt-1 text-xs text-amber-800">نام این فروشگاه نمایشی است؛ برای پیدا کردن محل از آدرس و واحد استفاده کنید.</p>}
        <button onClick={() => setLost(!lost)} aria-expanded={lost} className="mt-2 py-2 text-sm font-bold text-brand-700">فروشگاه را پیدا نکردم</button>
        {lost && <div className="mt-2 space-y-3 text-sm leading-7">
          <p>{s.address || "آدرس کامل ثبت نشده؛ نام و واحد را از اطلاعات پاساژ بپرسید."}</p>
          <Button variant="outline" onClick={() => setAsk(true)}>پرسیدن آدرس از فروشنده</Button>
          {s.mall_key && <Link className="block font-bold text-brand-800 underline" to={`/mall/${encodeURIComponent(s.mall_key)}`}>فهرست فروشگاه‌های این پاساژ بر اساس طبقه</Link>}
        </div>}
      </div>
      <StoreNeighbors shop={s} />
      <AskSellerSheet open={ask} onClose={() => setAsk(false)} shop={s} offerId={leg.offer_id} productId={leg.product_id} />
      <Card>
        <div className="text-sm font-bold">به فروشنده نشان بدهید</div>
        <div className="mt-2"><ItemRow leg={leg} /></div>
      </Card>
      {msg.data && msg.data.questions.length > 0 && (
        <Card>
          <div className="text-sm font-bold">چه چیزهایی بپرسم؟</div>
          <div className="mt-2 space-y-1.5">
            {msg.data.questions.map((q, i) => (
              <button key={q} onClick={() => setChecked((c) => { const n = new Set(c); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                className="flex w-full items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-right text-sm">
                <span className={clsx("flex size-5 shrink-0 items-center justify-center rounded-md ring-1", checked.has(i) ? "bg-brand-700 text-white ring-brand-700" : "bg-surface ring-slate-300")}>
                  {checked.has(i) && <Check size={13} />}
                </span>
                <span className={clsx(checked.has(i) && "text-slate-400 line-through")}>{q}</span>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ---- 4. result ------------------------------------------------------------------------------- */
function ResultStep({ leg, onDone }: { leg: Leg; onDone: (o: Outcome) => void }) {
  const qc = useQueryClient();
  const report = useReport();
  const [mode, setMode] = useState<null | "bought" | "missing">(null);
  const [paid, setPaid] = useState("");
  const s = leg.shop;
  const title = leg.product_title || s.name;
  const update = useMutation({
    mutationFn: async (result: { state: string; kind: Outcome["kind"]; paid?: number | null }) => {
      await api.completeVisit(leg.visit_id, { state: result.state, paid_price: result.paid });
      return result;
    },
    onSuccess: (result) => {
      onDone({ title, shop: s.name, kind: result.kind, paid: result.paid });
      qc.invalidateQueries({ queryKey: ["visits"] }); qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["product"] });
    },
  });
  const error = update.isError ? <p role="alert" className="text-xs text-rose-700">نتیجه ذخیره نشد؛ دوباره تلاش کنید. {update.error.message}</p> : null;


  if (mode === "missing") {
    return (
      <div className="space-y-3">
        <Card className="bg-rose-50 ring-rose-200">
          <div className="text-base font-extrabold text-rose-800">نداشت؟ اشکالی ندارد</div>
          <div className="mt-1 text-xs leading-5 text-rose-900/80">این گزینه‌ها را بررسی کنید. با انتخاب جایگزین، مقصد قبلی در همان مرحله از مسیر کنار گذاشته و مسیر دوباره محاسبه می‌شود.</div>
        </Card>
        {leg.product_id && <AlternativesPanel productId={leg.product_id} excludeShop={s.shop_id} replaceVisitId={leg.visit_id} atShop onReplaced={() => onDone({ title, shop: s.name, kind: "missing" })} />}
        {error}
        <Button disabled={update.isPending} size="lg" className="w-full" onClick={() => update.mutate({ state: "skipped", kind: "missing" })}>
          ادامه به مقصد بعدی <ChevronLeft size={18} />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <div className="text-base font-extrabold">نتیجه چه شد؟</div>
        {error}
        {report.isError && <p role="alert" className="text-xs text-rose-700">گزارش ناموجودی ثبت نشد؛ دوباره تلاش کنید.</p>}
        <div className="mt-0.5 text-xs text-slate-500">با ثبت نتیجه، موجودی و قیمت برای بقیه خریداران هم دقیق‌تر می‌شود.</div>
        <div className="mt-3 grid gap-2">
          <button onClick={() => setMode("bought")}
            className={clsx("flex items-center gap-3 rounded-2xl p-3.5 text-right ring-1 transition", mode === "bought" ? "bg-emerald-600 text-white ring-emerald-600" : "bg-emerald-50 text-emerald-800 ring-emerald-200")}>
            <Check size={22} /><span><b className="block text-base">خریدم 🎉</b><span className="text-xs opacity-80">قیمت پرداختی را ثبت کنید (اختیاری)</span></span>
          </button>
          <button onClick={() => {
            setMode("missing");
            report.mutate({ shop_id: s.shop_id, product_id: leg.product_id, status: "out_of_stock", source: "visit" });
          }} className="flex items-center gap-3 rounded-2xl bg-rose-50 p-3.5 text-right text-rose-800 ring-1 ring-rose-200">
            <X size={22} /><span><b className="block text-base">نداشت</b><span className="text-xs opacity-80">جایگزین پیشنهاد می‌دهیم</span></span>
          </button>
          <button disabled={update.isPending} onClick={() => update.mutate({ state: "visited", kind: "skipped" })}
            className="flex items-center gap-3 rounded-2xl bg-slate-100 p-3.5 text-right text-slate-700">
            <Clock size={22} /><span><b className="block text-base">فعلاً نخریدم</b><span className="text-xs opacity-80">دیدم ولی تصمیم نگرفتم</span></span>
          </button>
        </div>
      </Card>
      {mode === "bought" && (
        <Card className="animate-fadein">
          <div className="text-sm font-bold">چند خریدید؟</div>
          <input inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value.replace(/[^\d۰-۹٠-٩]/g, ""))} placeholder="مبلغ پرداختی (تومان)" dir="ltr"
            className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-right outline-none focus:border-brand-500" />
          <Button disabled={update.isPending} size="lg" className="mt-3 w-full" onClick={() => {
            const normalized = paid.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
            update.mutate({ state: "bought", kind: "bought", paid: normalized ? Number(normalized) : null });
          }}>ثبت خرید و ادامه</Button>
        </Card>
      )}
    </div>
  );
}

/* ---- finished -------------------------------------------------------------------------------- */
function Finished({ outcomes }: { outcomes: Outcome[] }) {
  const bought = outcomes.filter((o) => o.kind === "bought");
  const spent = bought.reduce((n, o) => n + (o.paid || 0), 0);
  return (
    <div className="mx-auto max-w-lg px-4 pt-8 pb-24">
      <div className="animate-fadein text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><PartyPopper size={30} /></span>
        <h1 className="mt-3 text-2xl font-extrabold">مسیر تمام شد!</h1>
        <p className="mt-1 text-sm text-slate-500">{faNum(bought.length)} خرید از {faNum(outcomes.length)} مقصد{spent ? ` · مجموع ${toman(spent)}` : ""}</p>
      </div>
      <div className="mt-5 space-y-2">
        {outcomes.map((o, i) => (
          <div key={i} className="flex items-center justify-between gap-2 rounded-2xl bg-surface p-3 text-sm ring-1 ring-slate-900/[0.06] shadow-card">
            <div className="min-w-0"><div className="truncate font-bold">{o.title}</div><div className="text-[11px] text-slate-500">{o.shop}</div></div>
            <span className={clsx("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", o.kind === "bought" ? "bg-emerald-50 text-emerald-700" : o.kind === "missing" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600")}>
              {{ bought: `خریدم${o.paid ? ` · ${toman(o.paid)}` : ""}`, missing: "نداشت", skipped: "نخریدم" }[o.kind]}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-2">
        <Link to="/" className="rounded-xl bg-brand-700 py-3 text-center text-sm font-bold text-white">جست‌وجوی تازه</Link>
        <Link to="/activity" className="rounded-xl bg-slate-100 py-3 text-center text-sm font-medium text-slate-700">پیگیری‌ها</Link>
      </div>
    </div>
  );
}
