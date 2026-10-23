import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight, Building2, Globe, Instagram, MessageCircle, Navigation, Phone, Plus, Search } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AskSellerSheet } from "../components/AskSeller";
import { NavSheet } from "../components/NavSheet";
import { Badge, Button, Empty, FreshBadge, OpenBadge, Section, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { faNum, km, toman } from "../lib/format";
import { useAddVisit, useCtx } from "../lib/hooks";

export default function ShopPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const ctx = useCtx();
  const [pq, setPq] = useState("");
  const [term, setTerm] = useState("");
  const [ask, setAsk] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const add = useAddVisit();
  const q = useQuery({ queryKey: ["shop", id, ctx], queryFn: () => api.shop(id, ctx) });
  const products = useQuery({ queryKey: ["shop-products", id, term], queryFn: () => api.shopProducts(id, ctx, term), enabled: !!term });

  if (q.isLoading) return <div className="space-y-3 p-4"><Skeleton className="h-40" /><Skeleton className="h-60" /></div>;
  if (!q.data) return <div className="p-4"><Empty icon="🤷" title="فروشگاه پیدا نشد" /></div>;
  const { shop: s, mall_shops, mall_shop_count } = q.data;
  const items = term ? products.data?.items || [] : q.data.products.items;
  const pays = s.payments;

  return (
    <div>
      <div className="sticky top-0 z-[1000] flex items-center gap-2 bg-paper/95 px-3 py-2.5 backdrop-blur lg:top-16 lg:px-0">
        <button onClick={() => nav(-1)} className="rounded-full p-1.5 hover:bg-slate-200" aria-label="بازگشت"><ArrowRight size={20} /></button>
        <div className="flex-1 truncate text-sm font-bold">{s.name}</div>
      </div>
      <div className="px-4 lg:grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] lg:items-start lg:gap-8 lg:px-0">
        <div>
        <div className="rounded-2xl bg-surface p-4 ring-1 ring-slate-900/[0.06] shadow-card">
          <div className="text-lg font-extrabold">{s.name}</div>
          {!s.name_verified && <div className="text-[11px] text-slate-400">نام این فروشگاه در نسخه نمایشی دیتاست تغییر داده شده است.</div>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <OpenBadge state={s.status.state} label={s.status.label} />
            {s.distance_km !== null && <Badge>{km(s.distance_km)} · ~{faNum(s.travel_min || 0)} دقیقه</Badge>}
            <Badge tone="brand">{faNum(s.offer_count)} کالای ثبت‌شده</Badge>
          </div>
          {s.mall && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 p-2.5 text-sm font-bold text-brand-900">
              <Building2 size={16} /> {s.mall_key ? <Link to={`/mall/${encodeURIComponent(s.mall_key)}`} className="underline decoration-dotted">{s.mall}</Link> : s.mall}
              {s.floor_label && <span className="rounded-lg bg-surface px-2">{faNum(s.floor_label)}</span>}
              {s.unit && <span className="rounded-lg bg-surface px-2">واحد {faNum(s.unit)}</span>}
            </div>
          )}
          <div className="mt-2 text-sm leading-7 text-slate-600">{s.address || "آدرس ثبت نشده"}</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button onClick={() => setAsk(true)} size="sm"><MessageCircle size={14} /> استعلام</Button>
            <Button variant="soft" size="sm" onClick={() => setNavOpen(true)}><Navigation size={14} /> مسیریابی</Button>
            <Button variant="outline" size="sm" onClick={() => add.mutate({ shop_id: s.shop_id })}><Plus size={14} /> به مسیر</Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
            {s.phone && <a href={`tel:${s.phone}`} className="flex items-center gap-1" dir="ltr"><Phone size={12} />{s.phone}</a>}
            {s.instagram && <a href={s.instagram.startsWith("http") ? s.instagram : `https://instagram.com/${s.instagram}`} target="_blank" rel="noreferrer" className="flex items-center gap-1"><Instagram size={12} />اینستاگرام</a>}
            {s.website && <a href={s.website} target="_blank" rel="noreferrer" className="flex items-center gap-1"><Globe size={12} />وب‌سایت</a>}
          </div>
        </div>

        <Section title="ساعت کاری">
          {s.week && s.week.length ? (
            <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-slate-900/[0.06] shadow-card">
              {s.week.map((d) => (
                <div key={d.key} className="flex justify-between border-b border-slate-100 px-3 py-2 text-sm last:border-0">
                  <span className="text-slate-600">{d.day}</span>
                  <span className={clsx(d.state === "closed" && "text-rose-600", d.state === "unknown" && "text-slate-400")}>{d.text}</span>
                </div>
              ))}
            </div>
          ) : <Empty title="ساعت کاری ثبت نشده">قبل از رفتن تماس بگیرید.</Empty>}
        </Section>

        <Section title="شرایط خرید">
          <div className="space-y-1.5 rounded-2xl bg-surface p-3 text-sm ring-1 ring-slate-900/[0.06] shadow-card">
            <Row label="ترب‌پی" value={pays.torobpay === "in_person" ? "پذیرنده حضوری ✓" : pays.torobpay ? "دارد (حضوری بودن نامشخص)" : "اعلام نشده"} />
            <Row label="خرید قسطی" value={pays.installments.length ? pays.installments.map((i) => `${i.provider}${i.in_person ? " (حضوری)" : ""}`).join("، ") : "اعلام نشده"} />
            <Row label="ارسال فوری" value={s.fast_delivery === null ? "نامشخص" : s.fast_delivery ? "دارد" : "ندارد"} />
          </div>
          {!pays.declared && <div className="mt-1.5 px-1 text-[11px] text-slate-400">«اعلام نشده» یعنی فروشنده در ترب ثبت نکرده، نه این‌که حتماً ندارد.</div>}
        </Section>

        </div>
        <div className="min-w-0">
        <Section className="lg:mt-0" title={`کالاهای این فروشگاه (${faNum(q.data.products.total)})`}>
          <form onSubmit={(e) => { e.preventDefault(); setTerm(pq.trim()); }} className="relative mb-2">
            <Search size={15} className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400" />
            <input value={pq} onChange={(e) => setPq(e.target.value)} placeholder="جست‌وجو در همین مغازه" className="h-10 w-full rounded-xl border border-slate-200 bg-surface pr-9 pl-3 text-sm" />
          </form>
          <div className="grid gap-2 md:grid-cols-2">
            {items.length === 0 && <Empty title="کالایی پیدا نشد" />}
            {items.map(({ product, offer }) => (
              <Link key={offer.offer_id} to={`/p/${product.product_id}`} className="flex gap-3 rounded-2xl bg-surface p-2.5 ring-1 ring-slate-900/[0.06] shadow-card">
                <img src={product.image || ""} alt="" loading="lazy" className="size-16 shrink-0 rounded-xl bg-slate-50 object-contain" />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-[13px] leading-6">{product.title}</div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-sm font-bold">{toman(offer.price)}</span>
                    <FreshBadge age={offer.price_age} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Section>

        {mall_shops.length > 0 && (
          <Section title={`همسایه‌ها در ${s.mall} (${faNum(mall_shop_count)})`}>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
              {mall_shops.map((m) => (
                <Link key={m.shop_id} to={`/s/${m.shop_id}`} className="w-40 shrink-0 rounded-2xl bg-surface p-3 text-sm ring-1 ring-slate-900/[0.06] shadow-card">
                  <div className="truncate font-bold">{m.name}</div>
                  <div className="text-[11px] text-slate-500">{m.floor_label ? faNum(m.floor_label) : ""}{m.unit ? ` · واحد ${m.unit}` : ""}</div>
                  <div className="mt-1 text-[11px] text-brand-700">{faNum(m.offer_count)} کالا</div>
                </Link>
              ))}
            </div>
          </Section>
        )}
        </div>
      </div>
      <AskSellerSheet open={ask} onClose={() => setAsk(false)} shop={s} />
      <NavSheet open={navOpen} onClose={() => setNavOpen(false)} shop={s} />
    </div>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3"><span className="text-slate-500">{label}</span><span className="text-left">{value}</span></div>
);
