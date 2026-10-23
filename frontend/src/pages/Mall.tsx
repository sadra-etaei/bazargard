import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { StoreMap } from "../components/StoreMap";
import { Empty, OpenBadge, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { faNum } from "../lib/format";
import { useCtx } from "../lib/hooks";
import type { Shop } from "../lib/types";

export default function Mall() {
  const { key = "" } = useParams();
  const nav = useNavigate();
  const ctx = useCtx();
  const [filter, setFilter] = useState("");
  const q = useQuery({ queryKey: ["mall", key, ctx], queryFn: () => api.mall(key, ctx) });

  const floors = useMemo(() => {
    const g = new Map<string, { rank: number; shops: Shop[] }>();
    for (const s of q.data?.shops || []) {
      if (filter && !s.name.includes(filter) && !(s.categories || []).join(" ").includes(filter)) continue;
      const f = s.floor_label || "طبقه نامشخص";
      const cur = g.get(f) || { rank: s.floor_rank ?? -999, shops: [] };
      cur.shops.push(s);
      g.set(f, cur);
    }
    // top floor first reads like the building; basement last
    return [...g.entries()].sort(([, a], [, b]) => b.rank - a.rank).map(([label, v]) => [label, v.shops] as const);
  }, [q.data, filter]);

  if (q.isLoading) return <div className="space-y-3 p-4"><Skeleton className="h-48" /><Skeleton className="h-60" /></div>;
  if (!q.data) return <div className="p-4"><Empty title="پاساژ پیدا نشد" /></div>;
  const first = q.data.shops[0];
  return (
    <div>
      <div className="sticky top-0 z-[1000] flex items-center gap-2 bg-paper/95 px-3 py-2.5 backdrop-blur lg:top-16 lg:px-0">
        <button onClick={() => nav(-1)} className="rounded-full p-1.5 hover:bg-slate-200" aria-label="بازگشت"><ArrowRight size={20} /></button>
        <div className="flex-1 text-sm font-bold">{q.data.name}</div>
      </div>
      <div className="px-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)] lg:items-start lg:gap-8 lg:px-0">
        <div className="lg:sticky lg:top-[7.5rem] lg:order-2">
        <StoreMap className="h-56 lg:h-80" shops={q.data.shops} fitKey={key} />
        <div className="mt-3 text-sm text-slate-600">
          {faNum(q.data.shops.length)} فروشگاه ثبت‌شده در این پاساژ؛ به تفکیک طبقه. {first.address && <span className="text-slate-400">({first.address.split("،").slice(0, 2).join("،")})</span>}
        </div>
        </div>
        <div className="min-w-0 lg:order-1">
        <div className="relative mt-3 lg:mt-0">
          <Search size={15} className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="نام فروشگاه" className="h-10 w-full rounded-xl border border-slate-200 bg-surface pr-9 pl-3 text-sm" />
        </div>
        {floors.length > 1 && (
          <div className="sticky top-12 z-10 -mx-4 mt-3 flex gap-1.5 overflow-x-auto bg-paper/95 px-4 py-1.5 no-scrollbar lg:top-28 lg:mx-0 lg:px-0">
            {floors.map(([floor, shops]) => (
              <a key={floor} href={`#floor-${floor}`} onClick={(e) => { e.preventDefault(); document.getElementById(`floor-${floor}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                className="shrink-0 rounded-full bg-surface px-3 py-1 text-xs ring-1 ring-slate-200">{faNum(floor)} <span className="text-slate-400">{faNum(shops.length)}</span></a>
            ))}
          </div>
        )}
        {floors.map(([floor, shops]) => (
          <div key={floor} id={`floor-${floor}`} className="mt-4 scroll-mt-28">
            <div className="mb-1.5 text-sm font-bold text-slate-700">{faNum(floor)}</div>
            <div className="grid gap-1.5 md:grid-cols-2">
              {shops.map((s) => (
                <Link key={s.shop_id} to={`/s/${s.shop_id}`} className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2.5 ring-1 ring-slate-900/[0.06] shadow-card">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{s.name}</div>
                    <div className="text-[11px] text-slate-500">{s.unit ? `واحد ${faNum(s.unit)} · ` : ""}{faNum(s.offer_count)} کالای ثبت‌شده</div>
                  </div>
                  <OpenBadge state={s.status.state} label={s.status.state === "unknown" ? "ساعت نامشخص" : s.status.label.slice(0, 16)} />
                </Link>
              ))}
            </div>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}
