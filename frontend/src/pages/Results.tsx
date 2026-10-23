import { useInfiniteQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight, Info, List, Map as MapIcon, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AfterHoursPanel } from "../components/AfterHours";
import { CategoryShopsBox } from "../components/Alternatives";
import { ContextBar } from "../components/ContextBar";
import { FilterSheet } from "../components/FilterSheet";
import { StoreMap } from "../components/StoreMap";
import { ProductCard } from "../components/ProductCard";
import { SearchBox } from "../components/SearchBox";
import { Button, Empty, Skeleton } from "../components/ui";
import { UnknownConditions } from "../components/UnknownConditions";
import { scopeFromParams, SCOPE_KEYS } from "../lib/shoppingContext";
import { api } from "../lib/api";
import { faNum } from "../lib/format";
import { useCtx, useMinWidth } from "../lib/hooks";
import { usePrefs } from "../lib/store";
import type { Filters } from "../lib/types";

const URL_KEYS = SCOPE_KEYS;
const visitedSearchEntries = new Set<string>();

export default function Results() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const location = useLocation();
  const [restoredEntry] = useState(() => visitedSearchEntries.has(location.key));
  const restoring = useRef(restoredEntry);
  const [initialParams] = useState(() => {
    const next = new URLSearchParams(params);
    if (visitedSearchEntries.has(location.key)) {
      const scope = usePrefs.getState().searchScope;
      for (const key of SCOPE_KEYS) {
        if (key === "q") continue;
        const value = scope[key];
        if (value) next.set(key, String(value)); else next.delete(key);
      }
    }
    return next;
  });
  useEffect(() => {
    if (restoredEntry && initialParams.toString() !== params.toString()) setParams(initialParams, { replace: true });
  }, []);
  useEffect(() => { visitedSearchEntries.add(location.key); }, [location.key]);
  const ctx = useCtx();
  const prefs = usePrefs();
  const [view, setView] = useState<"list" | "map">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const isDesktop = useMinWidth(1024);

  // Revisited search entries inherit edits made on product/comparison screens.
  // New URLs still supply explicit initial constraints, including shared links.
  if (restoring.current && params.toString() === initialParams.toString()) restoring.current = false;
  const effectiveParams = restoring.current ? initialParams : params;
  const urlFilters = useMemo(() => scopeFromParams(effectiveParams, prefs.searchScope), [effectiveParams, prefs.searchScope]);
  useEffect(() => {
    const state = usePrefs.getState();
    const incoming = scopeFromParams(restoring.current ? initialParams : params, state.searchScope);
    if (JSON.stringify(incoming) !== JSON.stringify(state.searchScope)) state.setSearchScope(incoming);
  }, [params]);

  const query = useInfiniteQuery({
    queryKey: ["search", urlFilters, ctx],
    queryFn: ({ pageParam }) => api.search({ ...ctx, ...urlFilters }, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (pages.length * 20 < last.total ? pages.length + 1 : undefined),
  });
  const first = query.data?.pages[0];
  const products = query.data?.pages.flatMap((p) => p.products) || [];

  // What the sentence said (budget, place, time, conditions) becomes real, editable filters.
  useEffect(() => {
    if (!first?.understood?.length || !first.filters) return;
    const f = first.filters;
    const next = new URLSearchParams(params);
    next.set("q", f.q || "");
    if (f.budget_max) next.set("budget_max", String(f.budget_max)); else next.delete("budget_max");
    if (f.budget_min) next.set("budget_min", String(f.budget_min)); else next.delete("budget_min");
    prefs.applyShoppingFilters(f);
    setParams(next, { replace: true });
  }, [first?.understood?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeChip = (key: string) => {
    const next = new URLSearchParams(params);
    if (key === "budget") { next.delete("budget_min"); next.delete("budget_max"); prefs.setSearchScope({ budget_min: null, budget_max: null }); }
    else if (["category", "brand", "mall", "sort"].includes(key)) { next.delete(key); prefs.setSearchScope({ [key]: null }); }
    else if (key === "area") prefs.set({ location: null, radius: null });
    else if (key === "visit") prefs.set({ visitAt: null, visitLabel: null });
    else if (key === "priority") prefs.set({ priority: "balanced" });
    else if (["open", "installments", "torobpay", "warranty", "fast"].includes(key)) prefs.set({ conditions: { ...prefs.conditions, [key]: false } });
    setParams(next, { replace: true });
  };

  const relax = (filter: string, value?: number) => {
    const next = new URLSearchParams(params);
    if (filter === "budget") { next.delete("budget_max"); next.delete("budget_min"); prefs.setSearchScope({ budget_min: null, budget_max: null }); }
    if (filter === "radius") prefs.set({ radius: value ?? null });
    if (filter === "open") prefs.set({ conditions: { ...prefs.conditions, open: false } });
    if (filter === "conditions") prefs.set({ conditions: { installments: false, torobpay: false, warranty: false, fast: false, open: prefs.conditions.open } });
    if (filter === "mall") { next.delete("mall"); prefs.setSearchScope({ mall: null }); }
    setParams(next, { replace: true });
  };

  const applySheet = (f: Filters) => {
    const next = new URLSearchParams();
    for (const k of URL_KEYS) {
      const v = (f as Record<string, unknown>)[k];
      if (v) next.set(k, String(v));
    }
    prefs.setSearchScope(f);
    setParams(next, { replace: true });
  };

  const chips = (first?.chips || []).filter((c) => c.key !== "area" || prefs.location);
  const cats = first?.facets.categories || [];
  const clarify = !urlFilters.category && cats.length >= 3 && first && cats[0].count < first.total * 0.6;
  const sel = products.find((p) => p.product_id === selected);

  const mapShops = [...new Map(products.map((product) => [product.best.shop.shop_id, product.best.shop])).values()];
  const mapOffers = Object.fromEntries([...products].reverse().map((product) => [product.best.shop.shop_id, { productId: product.product_id, offerId: product.best.offer_id }]));
  const selectStore = (shopId: string) => {
    const product = products.find((item) => item.best.shop.shop_id === shopId);
    if (product) setSelected(product.product_id);
  };

  return (
    <div>
      <div className="sticky top-0 z-[1000] space-y-2.5 bg-paper/95 px-4 pt-3 pb-2.5 backdrop-blur lg:top-16 lg:px-0">
        <div className="flex items-center gap-2 lg:hidden">
          <button onClick={() => nav(-1)} className="rounded-full p-1.5 text-slate-600 hover:bg-slate-200" aria-label="بازگشت"><ArrowRight size={20} /></button>
          <div className="flex-1"><SearchBox initial={urlFilters.q || ""} /></div>
        </div>
        <ContextBar compact />
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar lg:flex-wrap">
          <button onClick={() => setFiltersOpen(true)} className="flex shrink-0 items-center gap-1 rounded-full bg-inverse px-3 py-1.5 text-xs font-medium text-white">
            <SlidersHorizontal size={13} /> فیلترها
          </button>
          {chips.map((c) => (
            <button key={c.key + c.label} onClick={() => removeChip(c.key)} className="flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-xs text-brand-800 ring-1 ring-brand-200 hover:bg-brand-100">
              {c.label} <X size={12} />
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-6 lg:px-0">
        <div className="min-w-0">
          {first && (
            <div className="mt-1 flex items-center justify-between">
              <div className="text-sm text-slate-600">
                {first.total ? <><b className="text-slate-900">{faNum(first.total)}{first.total >= 400 ? "+" : ""}</b> کالا با فروشنده در فیلترهای شما</> : "نتیجه‌ای نیست"}
              </div>
              <div className="flex rounded-xl bg-slate-200/70 p-0.5 lg:hidden">
                {(["list", "map"] as const).map((v) => (
                  <button key={v} onClick={() => setView(v)} className={clsx("flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs", view === v ? "bg-surface font-bold shadow-sm" : "text-slate-500")}>
                    {v === "list" ? <><List size={14} /> فهرست</> : <><MapIcon size={14} /> نقشه</>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {first && first.total > 0 && (
            <div className="mt-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
              <span className="shrink-0 text-xs text-slate-500">مرتب‌سازی:</span>
              {([["relevance", "مرتبط‌ترین"], ["price_asc", "ارزان به گران"], ["price_desc", "گران به ارزان"], ["near", "نزدیک‌ترین"]] as const).map(([v, label]) => (
                <button key={v} onClick={() => { const n = new URLSearchParams(params); if (v === "relevance") n.delete("sort"); else n.set("sort", v); prefs.setSearchScope({ sort: v }); setParams(n, { replace: true }); }}
                  className={clsx("shrink-0 rounded-full px-3 py-1.5 text-xs ring-1", (urlFilters.sort || "relevance") === v ? "bg-brand-700 text-white ring-brand-700" : "bg-surface text-slate-700 ring-slate-200")}>
                  {label}
                </button>
              ))}
            </div>
          )}

          <UnknownConditions count={first?.unknown_matches} />

          {first?.after_hours && <AfterHoursPanel data={first.after_hours} />}

          {first?.understood && first.understood.length > 0 && (
            <div className="mt-2 rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-800">فهمیدم: {first.understood.join("، ")} — از چیپ‌های بالا می‌توانید تغییرشان دهید.</div>
          )}

          {clarify && (
            <div className="mt-3 rounded-2xl bg-surface p-3 ring-1 ring-slate-900/[0.06] shadow-card">
              <div className="text-sm font-bold">منظورتان کدام است؟</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {cats.slice(0, 5).map((c) => (
                  <button key={c.name} onClick={() => { const n = new URLSearchParams(params); n.set("category", c.name); setParams(n, { replace: true }); }}
                    className="rounded-full bg-slate-100 px-3 py-1.5 text-xs hover:bg-slate-200">{c.name} <span className="text-slate-400">{faNum(c.count)}</span></button>
                ))}
              </div>
            </div>
          )}

          {first?.notices.map((n) => (
            <div key={n} className="mt-2 flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"><Info size={14} className="mt-0.5 shrink-0" />{n}</div>
          ))}

          {query.isLoading && <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-1">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-52" />)}</div>}
          {query.isError && <Empty icon="⚠️" title="ارتباط با سرور برقرار نشد"><Button onClick={() => query.refetch()} variant="outline" size="sm">تلاش دوباره</Button></Empty>}

          {first && first.total === 0 && (
            <div className="mt-4">
              <Empty icon="🔍" title="با این شرایط چیزی پیدا نشد">
                {first.relax.length ? "یکی از این‌ها را امتحان کنید:" : "عبارت ساده‌تر یا نام برند را امتحان کنید."}
              </Empty>
              <div className="mt-3 space-y-2">
                {first.relax.map((r) => (
                  <button key={r.filter} onClick={() => relax(r.filter, r.value)} className="flex w-full items-center justify-between rounded-xl bg-surface px-4 py-3 text-sm ring-1 ring-brand-200 hover:bg-brand-50">
                    <span>{r.label}</span><span className="text-xs text-brand-700">{faNum(r.products)} کالا ←</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {view === "map" && !isDesktop && products.length > 0 && (
            <div className="mt-3">
              <StoreMap className="h-[58dvh]" shops={mapShops} onSelectStore={selectStore} offers={mapOffers} />
              {sel ? <div className="mt-3"><ProductCard p={sel} /></div>
                : <div className="mt-2 text-center text-xs text-slate-500">روی نشانگر فروشگاه بزنید تا آدرس و دکمه‌های مراجعه را ببینید.</div>}
            </div>
          )}

          <div className={clsx("mt-3", view === "map" && "hidden lg:block")}>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1">
              {products.map((p, i) => (
                <div key={p.product_id} id={`card-${p.product_id}`} onMouseEnter={() => setSelected(p.product_id)}
                  className={clsx("rounded-2xl transition", selected === p.product_id && "lg:ring-2 lg:ring-amber-400")}>
                  <ProductCard p={p} rank={i + 1} />
                </div>
              ))}
            </div>
            {query.hasNextPage && (
              <Button variant="outline" className="mt-3 w-full" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                {query.isFetchingNextPage ? "در حال بارگذاری…" : "نتایج بیشتر"}
              </Button>
            )}
          </div>

          {first?.category_shops && first.category_shops.count > 0 && (
            <div className="mt-5"><CategoryShopsBox data={first.category_shops} /></div>
          )}
          {first && first.total > 0 && (
            <Link to="/chat" className="mt-4 block rounded-2xl bg-surface p-3 text-center text-xs text-slate-600 ring-1 ring-slate-900/[0.06] shadow-card hover:ring-brand-500">
              دنبال چیز خاص‌تری هستید؟ <b className="text-brand-700">با دستیار گفت‌وگو کنید</b>
            </Link>
          )}
        </div>

        {isDesktop && <aside>
          <div className="sticky top-[11rem] mt-1">
            {products.length > 0 ? (
              <>
                <StoreMap className="h-[calc(100dvh-13.5rem)]" shops={mapShops} onSelectStore={selectStore} offers={mapOffers} />
                <div className="mt-2 text-center text-xs text-slate-500">فروشنده‌های پیشنهادی کالاهای این صفحه؛ روی نشانگر بزنید تا فروشگاه را انتخاب کنید.</div>
              </>
            ) : query.isLoading ? <Skeleton className="h-[calc(100dvh-13.5rem)]" /> : null}
          </div>
        </aside>}
      </div>

      <FilterSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} filters={urlFilters} onApply={applySheet} facets={first?.facets} />
    </div>
  );
}
