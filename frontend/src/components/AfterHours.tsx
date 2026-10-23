import clsx from "clsx";
import { ChevronDown, Clock, MapPinned, Moon, Navigation, Phone, Radar, Store } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { faNum, km } from "../lib/format";
import { usePrefs } from "../lib/store";
import type { AfterHours, HubShop } from "../lib/types";
import { MapView, type Pin, type Zone } from "./MapView";
import { OfferCard } from "./OfferCard";
import { Badge, OpenBadge } from "./ui";

/**
 * Shown when every Torob listing near you is closed at the time you'd arrive.
 * Two honest answers: the nearest listing that IS open (confirmed on Torob), and the shop cluster around you
 * where an unlisted shop may still be open (an estimate, labelled as such).
 */
export function AfterHoursPanel({ data }: { data: AfterHours }) {
  const me = usePrefs((s) => s.location);
  const hasFar = data.open_far.length > 0;
  const hub = data.hub;
  const [focus, setFocus] = useState<"torob" | "hub">(hasFar && !hub ? "torob" : hub ? "hub" : "torob");
  const [showClosed, setShowClosed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  const far = data.open_far[0];
  const { pins, zones, route } = useMemo(() => {
    const pins: Pin[] = [];
    const zones: Zone[] = [];
    let route: [number, number][] | undefined;
    if (focus === "torob" && far) {
      const s = far.offer.shop;
      pins.push({ id: s.shop_id, lat: s.lat, lon: s.lon, label: `${s.name} · ترب`, tone: "torob" });
      route = me ? [[me.lat, me.lon], [s.lat, s.lon]] : undefined;
    }
    if (focus === "hub" && hub) {
      zones.push({ lat: hub.lat, lon: hub.lon, radius: hub.radius_m });
      for (const s of hub.shops) {
        pins.push({ id: s.shop_id, lat: s.lat, lon: s.lon, label: s.name, tone: ["unknown", "open_no_hours"].includes(s.status.state) ? "maybe" : "open", active: s.shop_id === picked });
      }
    }
    return { pins, zones, route };
  }, [focus, far, hub, me, picked]);

  return (
    <div className="mt-3 overflow-hidden rounded-3xl bg-inverse text-white shadow-lg ring-1 ring-white/10">
      <div className="px-4 pt-4">
        <div className="flex items-center gap-2 text-sm font-extrabold">
          <span className="flex size-8 items-center justify-center rounded-full bg-indigo-500/30"><Moon size={16} /></span>
          ساعت {data.visit_label}؛ نزدیک شما چیزی باز نیست
        </div>
        <p className="mt-2 text-[13px] leading-6 text-white/85">{data.message}</p>

        {hasFar && hub && (
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-white/10 p-1 text-xs">
            <button onClick={() => setFocus("torob")} className={clsx("flex items-center justify-center gap-1 rounded-lg py-2", focus === "torob" ? "bg-surface font-bold text-slate-900" : "text-white/70")}>
              <Store size={13} /> باز در ترب
            </button>
            <button onClick={() => setFocus("hub")} className={clsx("flex items-center justify-center gap-1 rounded-lg py-2", focus === "hub" ? "bg-surface font-bold text-slate-900" : "text-white/70")}>
              <Radar size={13} /> اطراف من (احتمالی)
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 px-3">
        <MapView className="h-56" pins={pins} zones={zones} route={route} onSelect={setPicked} />
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-white/55">
          <span className="flex items-center gap-1"><i className="inline-block size-2 rounded-full bg-blue-500" /> شما</span>
          {focus === "torob" ? <span className="flex items-center gap-1"><i className="inline-block size-2 rounded-full bg-slate-100" /> ثبت‌شده در ترب و باز</span>
            : <>
              <span className="flex items-center gap-1"><i className="inline-block size-2 rounded-full border border-emerald-400" /> باز طبق ساعت ثبت‌شده</span>
              <span className="flex items-center gap-1"><i className="inline-block size-2 rounded-full border border-dashed border-amber-400" /> ساعت نامشخص</span>
            </>}
        </div>
      </div>

      <div className="mt-3 space-y-3 bg-paper px-3 pt-3 pb-3 text-slate-900">
        {focus === "torob" && far && (
          <section>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Clock size={13} /> نزدیک‌ترین گزینه باز در ترب
              <Badge tone="green" className="mr-auto">قیمت ثبت‌شده</Badge>
            </div>
            <OfferCard offer={far.offer} productId={far.product.product_id} productTitle={far.product.title} highlight />
            <Link to={`/p/${far.product.product_id}`} className="mt-1.5 block truncate text-center text-[11px] text-brand-700">{far.product.title}</Link>
            {data.open_far.length > 1 && (
              <div className="mt-2 text-[11px] text-slate-500">
                گزینه‌های بعدی: {data.open_far.slice(1).map((o) => `${o.offer.shop.name} (${km(o.offer.shop.distance_km)})`).join("، ")}
              </div>
            )}
          </section>
        )}

        {focus === "hub" && hub && (
          <section>
            <div className="rounded-2xl bg-surface p-3 ring-1 ring-amber-300">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"><MapPinned size={16} /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{hub.name}</div>
                  <div className="text-xs text-slate-600">
                    {faNum(Math.round((hub.distance_km * 1000) / 50) * 50)} متر از شما · {faNum(hub.matching)} فروشگاه در دسته «{hub.categories[0]}»
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge tone="green">{faNum(hub.open_count)} باز طبق ساعت ثبت‌شده</Badge>
                    {hub.unknown_count > 0 && <Badge tone="stone">{faNum(hub.unknown_count)} ساعت نامشخص</Badge>}
                    <Badge tone="amber">در ترب این کالا را ندارند</Badge>
                  </div>
                </div>
              </div>
              <div className="mt-2 rounded-xl bg-amber-50 px-2.5 py-1.5 text-[11px] leading-5 text-amber-900">{hub.note}</div>

              <div className="mt-3 space-y-1.5">
                {hub.shops.map((s) => <HubRow key={s.shop_id} s={s} active={picked === s.shop_id} onPick={() => setPicked(s.shop_id)} />)}
              </div>
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${hub.lat},${hub.lon}`} target="_blank" rel="noreferrer"
                className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-inverse py-2.5 text-sm font-medium text-white">
                <Navigation size={14} /> مسیر تا {hub.name}
              </a>
            </div>
          </section>
        )}

        {data.closed_near.length > 0 && (
          <section>
            <button onClick={() => setShowClosed(!showClosed)} className="flex w-full items-center justify-between text-xs text-slate-600">
              <span>{faNum(data.closed_near_count)} فروشنده نزدیک در ترب هست ولی بسته است</span>
              <ChevronDown size={14} className={clsx("transition", showClosed && "rotate-180")} />
            </button>
            {showClosed && (
              <div className="mt-1.5 space-y-1.5">
                {data.closed_near.map((c) => (
                  <Link key={c.shop.shop_id} to={`/s/${c.shop.shop_id}`} className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2 text-xs ring-1 ring-slate-900/[0.06] shadow-card">
                    <span className="truncate font-medium">{c.shop.name} <span className="text-slate-400">{km(c.shop.distance_km)}</span></span>
                    <span className="shrink-0 text-slate-500">{c.shop.status.next_open ? `باز می‌شود: ${faNum(c.shop.status.next_open)}` : c.shop.status.label}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function HubRow({ s, active, onPick }: { s: HubShop; active: boolean; onPick: () => void }) {
  return (
    <div onClick={onPick} className={clsx("cursor-pointer flex items-center gap-2 rounded-xl px-2.5 py-2 ring-1 transition hover:bg-amber-50", active ? "bg-amber-50 ring-amber-400" : "bg-slate-50 ring-slate-200/60")}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium">{s.name}</span>
          {s.on_torob && <Badge tone="blue">در ترب</Badge>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
          {s.distance_km !== null && <span>{km(s.distance_km)}</span>}
          {s.mall && <span>{s.mall}{s.floor_label ? ` · ${faNum(s.floor_label)}` : ""}{s.unit ? ` · واحد ${faNum(s.unit)}` : ""}</span>}
        </div>
      </div>
      <OpenBadge state={s.status.state} label={s.status.state === "unknown" ? "ساعت نامشخص" : s.status.label.slice(0, 16)} />
      {s.phone && (
        <a href={`tel:${s.phone}`} onClick={(e) => e.stopPropagation()} aria-label={`تماس با ${s.name}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Phone size={14} /></a>
      )}
    </div>
  );
}
