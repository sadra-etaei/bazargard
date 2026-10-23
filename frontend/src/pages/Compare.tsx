import { ShoppingRequirements } from "../components/ShoppingRequirements";
import { useQueries } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Empty, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { faNum, km, toman } from "../lib/format";
import { useCtx } from "../lib/hooks";
import { usePrefs } from "../lib/store";
import { bestOffer } from "../lib/sellerComparison";
import type { ProductDetail } from "../lib/types";

export default function Compare() {
  const nav = useNavigate();
  const ctx = useCtx();
  const { compare, toggleCompare } = usePrefs();
  const results = useQueries({ queries: compare.map((p) => ({ queryKey: ["product", p.product_id, ctx], queryFn: () => api.product(p.product_id, ctx) })) });
  const items = results.map((r) => r.data).filter(Boolean) as ProductDetail[];

  if (compare.length === 0) return <div className="p-4"><Empty icon="⚖️" title="کالایی برای مقایسه انتخاب نکرده‌اید">در نتایج جست‌وجو دکمه مقایسه را بزنید (تا ۳ کالا).</Empty></div>;

  const best = (o: ProductDetail) => bestOffer(o.offers);
  const minPrice = Math.min(...items.map((i) => best(i)?.price || Infinity));
  // Spec keys shared by at least two products are the ones worth comparing side by side.
  const specCount = new Map<string, number>();
  items.forEach((i) => new Set(i.specs.flatMap((g) => g.items.map((s) => s.key))).forEach((k) => specCount.set(k, (specCount.get(k) || 0) + 1)));
  const specKeys = [...specCount.entries()].filter(([, n]) => n >= Math.min(2, items.length)).map(([k]) => k).slice(0, 12);
  const spec = (i: ProductDetail, k: string) => i.specs.flatMap((g) => g.items).find((s) => s.key === k)?.value ?? "—";

  const rows: { label: string; render: (i: ProductDetail) => React.ReactNode; highlight?: (i: ProductDetail) => boolean }[] = [
    { label: "قیمت پیشنهاد منتخب", render: (i) => best(i) ? toman(best(i)!.price) : "پیشنهاد مطابق شرایط نیست", highlight: (i) => !!best(i)?.price && best(i)?.price === minPrice },
    { label: "بازه منصفانه همه آفرها", render: (i) => i.price_stats.fair_range ? `${faNum(Math.round(i.price_stats.fair_range[0] / 1000))} تا ${faNum(Math.round(i.price_stats.fair_range[1] / 1000))} هزار` : "—" },
    { label: "فروشنده مطابق شرایط", render: (i) => faNum(i.offers.filter((o) => o.matches_filters && o.stock.state !== "out").length) },
    { label: "بهترین پیشنهاد", render: (i) => { const b = best(i); return b ? `${b.shop.name}${b.shop.distance_km !== null ? ` · ${km(b.shop.distance_km)}` : ""}` : "—"; } },
    { label: "وضعیت هنگام رسیدن", render: (i) => best(i)?.shop.status.label ?? "—" },
    { label: "تازگی قیمت", render: (i) => best(i)?.price_age.label.split("—")[0] ?? "—" },
    { label: "گارانتی", render: (i) => best(i)?.warranty?.label ?? "ثبت نشده" },
    { label: "برند", render: (i) => i.brand || "—" },
    ...specKeys.map((k) => ({ label: k, render: (i: ProductDetail) => spec(i, k) })),
  ];

  return (
    <div>
      <div className="sticky top-0 z-[1000] flex items-center gap-2 bg-paper/95 px-3 py-2.5 backdrop-blur lg:top-16 lg:px-0">
        <button onClick={() => nav(-1)} className="rounded-full p-1.5 hover:bg-slate-200" aria-label="بازگشت"><ArrowRight size={20} /></button>
        <div className="text-sm font-bold">مقایسه {faNum(compare.length)} کالا</div>
      </div>
      <ShoppingRequirements />
      <p className="px-3 pb-2 text-xs text-slate-500">قیمت، وضعیت و گارانتی هر ستون مربوط به همان پیشنهاد منتخب است.</p>
      <div className="overflow-x-auto px-3 lg:px-0">
        <table className="w-full min-w-[480px] border-separate border-spacing-0 text-xs lg:text-sm">
          <thead>
            <tr>
              <th className="w-24 lg:w-40" />
              {compare.map((p, idx) => (
                <th key={p.product_id} className="p-1.5 align-top font-normal">
                  {results[idx]?.isLoading ? <Skeleton className="h-28" /> : (
                    <div className="relative rounded-2xl bg-surface p-2 ring-1 ring-slate-900/[0.06] shadow-card">
                      <button onClick={() => toggleCompare(p)} className="absolute top-1 left-1 rounded-full bg-slate-100 p-0.5" aria-label="حذف"><X size={12} /></button>
                      <img src={p.image || ""} alt="" className="mx-auto size-16 object-contain lg:size-28" />
                      <Link to={`/p/${p.product_id}`} className="mt-1 line-clamp-3 text-[11.5px] leading-5 font-bold">{p.title}</Link>
                      {results[idx]?.isError && <button onClick={() => results[idx].refetch()} className="mt-2 text-brand-700">تلاش دوباره</button>}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="border-b border-slate-200 py-2 pl-2 align-top text-slate-500">{r.label}</td>
                {compare.map((p, index) => { const i = results[index]?.data; return (
                  <td key={p.product_id} className={clsx("border-b border-slate-200 p-2 text-center align-top", i && r.highlight?.(i) && "bg-emerald-50 font-bold text-emerald-800")}>
                    {i ? r.render(i) : results[index]?.isError ? "خطا در دریافت؛ دوباره تلاش کنید" : "در حال دریافت…"}
                  </td>
                ); })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">قیمت‌ها «ثبت‌شده در ترب» هستند و موجودی تا استعلام تأیید نشده است. «—» یعنی اطلاعات ثبت نشده.</p>
      </div>
    </div>
  );
}
