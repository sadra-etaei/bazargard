import { ShoppingRequirements } from "../components/ShoppingRequirements";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight, ChevronDown, GitCompare, ListPlus, Map as MapIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlternativesPanel, CategoryShopsBox } from "../components/Alternatives";
import { ContextBar } from "../components/ContextBar";
import { StoreMap } from "../components/StoreMap";
import { SellerChoices } from "../components/SellerChoices";
import { UnknownConditions } from "../components/UnknownConditions";
import { OfferCard } from "../components/OfferCard";
import { Button, Empty, Section, Skeleton, toast } from "../components/ui";
import { api } from "../lib/api";
import { faNum, shortToman, toman } from "../lib/format";
import { useCtx } from "../lib/hooks";
import { usePrefs } from "../lib/store";
import type { ProductDetail } from "../lib/types";

export default function Product() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const ctx = useCtx();
  const qc = useQueryClient();
  const { compare, toggleCompare } = usePrefs();
  const [onlyMatching, setOnlyMatching] = useState(true);
  const [showMap, setShowMap] = useState(false);
  const [specsOpen, setSpecsOpen] = useState(false);
  const [activeShop, setActiveShop] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["product", id, ctx], queryFn: () => api.product(id, ctx) });
  const p = q.data;
  useEffect(() => {
    if (!p) return;
    const state = usePrefs.getState();
    state.setSearchScope({ q: p.title });
    const selected = p.offers.find(o => o.matches_filters && o.stock.state !== "out");
    state.set({ chatState: { ...state.chatState, product_id: p.product_id, product_title: p.title, shop_id: selected?.shop.shop_id, best_price: selected?.price } });
  }, [p?.product_id]);

  if (q.isLoading) return <div className="space-y-3 p-4"><Skeleton className="h-64" /><Skeleton className="h-24" /><Skeleton className="h-40" /></div>;
  if (!p) return <div className="p-4"><Empty icon="🤷" title="این کالا پیدا نشد" /></div>;

  const matching = p.offers.filter((o) => o.matches_filters);
  const offers = onlyMatching ? matching : p.offers;
  const inCompare = compare.some((x) => x.product_id === p.product_id);

  const specs = p.specs.length > 0 && (
    <Section title="مشخصات فنی">
      <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-slate-900/[0.06] shadow-card">
        {p.specs.slice(0, specsOpen ? undefined : 1).map((g) => (
          <div key={g.section}>
            <div className="bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600">{g.section}</div>
            {g.items.slice(0, specsOpen ? undefined : 6).map((s) => (
              <div key={s.key} className="flex gap-3 border-t border-slate-100 px-3 py-2 text-xs">
                <span className="w-28 shrink-0 text-slate-500">{s.key}</span><span className="text-slate-800">{s.value}</span>
              </div>
            ))}
          </div>
        ))}
        <button onClick={() => setSpecsOpen(!specsOpen)} className="flex w-full items-center justify-center gap-1 border-t border-slate-100 py-2 text-xs text-brand-700">
          {specsOpen ? "کمتر" : "همه مشخصات"} <ChevronDown size={14} className={clsx(specsOpen && "rotate-180")} />
        </button>
      </div>
    </Section>
  );

  return (
    <div>
      <div className="sticky top-0 z-[1000] flex items-center gap-2 bg-paper/95 px-3 py-2.5 backdrop-blur lg:top-16 lg:px-0">
        <button onClick={() => nav(-1)} className="rounded-full p-1.5 hover:bg-slate-200" aria-label="بازگشت"><ArrowRight size={20} /></button>
        <div className="line-clamp-1 flex-1 text-sm font-bold">{p.title}</div>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div>
          <div className="flex snap-x gap-2 overflow-x-auto bg-surface px-4 py-3 no-scrollbar md:rounded-3xl lg:ring-1 lg:ring-slate-200">
            {(p.images.length ? p.images : [""]).map((src, i) => (
              <img key={i} src={src} alt="" className="h-56 w-full shrink-0 snap-center rounded-2xl bg-slate-50 object-contain md:h-72" />
            ))}
          </div>
          <div className="px-4 lg:px-0">
            <h1 className="mt-3 text-lg leading-8 font-extrabold lg:text-xl lg:leading-9">{p.title}</h1>
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
              {p.brand && <span>برند: {p.brand}</span>}
              {p.category && <span>دسته: {p.category}</span>}
            </div>
            <PriceStats p={p} />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant={inCompare ? "primary" : "outline"} onClick={() => toggleCompare(p)}><GitCompare size={16} /> {inCompare ? "در مقایسه" : "مقایسه"}</Button>
              <Button variant="outline" onClick={async () => {
                await api.addList(p.title, p.product_id);
                qc.invalidateQueries({ queryKey: ["list"] });
                toast.success("به لیست خرید اضافه شد", { action: { label: "دیدن لیست", to: "/trip" } });
              }}><ListPlus size={16} /> لیست خرید</Button>
            </div>
            <div className="hidden lg:block">{specs}</div>
          </div>
        </div>

        <div className="min-w-0 px-4 lg:px-0">
          <Section className="lg:mt-0" title={<>فروشنده‌ها <span className="text-sm font-normal text-slate-500">({faNum(offers.length)})</span></>}
            action={<button onClick={() => setShowMap(!showMap)} className="flex items-center gap-1 text-xs text-brand-700"><MapIcon size={14} />{showMap ? "بستن نقشه" : "روی نقشه"}</button>}>
            <ContextBar compact />
            <ShoppingRequirements />
            <UnknownConditions />
            <SellerChoices offers={p.offers} onSelect={(id) => {
              setActiveShop(id);
              requestAnimationFrame(() => document.getElementById(`seller-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
            }} />
            <div className="mt-2 flex rounded-xl bg-slate-200/70 p-0.5 text-xs">
              <button onClick={() => setOnlyMatching(true)} className={clsx("flex-1 rounded-lg py-1.5", onlyMatching && "bg-surface font-bold shadow-sm")}>
                مطابق شرایط من ({faNum(matching.length)})
              </button>
              <button onClick={() => setOnlyMatching(false)} className={clsx("flex-1 rounded-lg py-1.5", !onlyMatching && "bg-surface font-bold shadow-sm")}>
                همه فروشنده‌ها ({faNum(p.offers.length)})
              </button>
            </div>
            {showMap && (
              <StoreMap className="mt-3 h-72 lg:h-80" onSelectStore={setActiveShop} shops={offers.map((o) => o.shop)}
                offers={Object.fromEntries(offers.map((o) => [o.shop.shop_id, { productId: p.product_id, offerId: o.offer_id }]))} />
            )}
            <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
              {offers.length === 0 && (
                <div className="md:col-span-2 lg:col-span-1 2xl:col-span-2">
                  <Empty icon="🧭" title="هیچ فروشنده‌ای با شرایط فعلی شما جور نیست">
                    «همه فروشنده‌ها» را ببینید یا محدوده/زمان را تغییر دهید.
                  </Empty>
                </div>
              )}
              {[...offers].sort((a, b) => (a.shop.shop_id === activeShop ? -1 : b.shop.shop_id === activeShop ? 1 : 0)).map((o, i) => (
                <OfferCard anchor key={o.offer_id} offer={o} productId={p.product_id} productTitle={p.title}
                  highlight={o.shop.shop_id === activeShop || (i === 0 && !activeShop && o.matches_filters)} dim={!o.matches_filters || o.stock.state === "out"} />
              ))}
            </div>
          </Section>

          {p.category_shops && p.category_shops.count > 0 && <div className="mt-4"><CategoryShopsBox data={p.category_shops} /></div>}

          <Section title="اگر نداشتند: جایگزین‌ها">
            <AlternativesPanel productId={p.product_id} />
          </Section>

          <div className="lg:hidden">{specs}</div>
        </div>
      </div>
    </div>
  );
}

function PriceStats({ p }: { p: ProductDetail }) {
  const s = p.price_stats;
  if (!s.min || !s.max) return <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">قیمت معتبری ثبت نشده؛ از فروشنده استعلام بگیرید.</div>;
  const span = Math.max(s.max - s.min, 1);
  const pos = (v: number) => `${((v - s.min!) / span) * 100}%`;
  return (
    <div className="mt-3 rounded-2xl bg-surface p-3.5 ring-1 ring-slate-900/[0.06] shadow-card">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs text-slate-500">از</div>
          <div className="text-lg font-extrabold text-slate-900">{toman(s.min)}</div>
        </div>
        <div className="text-left">
          <div className="text-xs text-slate-500">میانه {faNum(s.count)} قیمت</div>
          <div className="text-sm font-bold">{s.median ? toman(s.median) : "—"}</div>
        </div>
      </div>
      {s.count > 1 && (
        <div className="mt-3">
          <div className="relative h-2 rounded-full bg-slate-100">
            {s.fair_range && <div className="absolute h-2 rounded-full bg-emerald-200" style={{ right: pos(s.fair_range[0]), width: `${((s.fair_range[1] - s.fair_range[0]) / span) * 100}%` }} />}
            {s.median && <div className="absolute -top-1 h-4 w-1 rounded bg-inverse" style={{ right: pos(s.median) }} />}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>{shortToman(s.min)}</span>
            {s.fair_range && <span className="text-emerald-700">بازه منصفانه: {shortToman(s.fair_range[0])} تا {shortToman(s.fair_range[1])}</span>}
            <span>{shortToman(s.max)}</span>
          </div>
        </div>
      )}
      <div className="mt-2 text-[11px] leading-5 text-slate-500">
        این‌ها قیمت‌های ثبت‌شده فروشنده‌ها در ترب است{s.freshest_days !== null && `؛ تازه‌ترین ${faNum(s.freshest_days)} روز پیش`}. برای چانه‌زنی، بازه منصفانه را مبنا قرار دهید.
      </div>
    </div>
  );
}
