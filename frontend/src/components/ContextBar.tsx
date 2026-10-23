import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Bike, Car, Clock, Footprints, LocateFixed, MapPin, Search, TrainFront } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { faNum } from "../lib/format";
import { usePrefs } from "../lib/store";
import type { Place } from "../lib/types";
import { MapView } from "./MapView";
import { Button, Sheet, toast } from "./ui";

/** Tehran wall-clock ISO string (Iran has no DST since 2022: fixed +03:30). */
export function tehranIso(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date(Date.now() + dayOffset * 86400000);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(d);
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+03:30`;
}

const TIME_PRESETS = [
  { label: "الان", at: null as null | (() => string) },
  { label: "امروز عصر", at: () => tehranIso(0, 17) },
  { label: "امشب", at: () => tehranIso(0, 20) },
  { label: "فردا صبح", at: () => tehranIso(1, 10) },
  { label: "فردا عصر", at: () => tehranIso(1, 17) },
];

export function ContextBar({ compact = false }: { compact?: boolean }) {
  const { location, visitLabel, radius, mode } = usePrefs();
  const [open, setOpen] = useState<null | "where" | "when">(null);
  const ModeIcon = { taxi: Car, walk: Footprints, metro: TrainFront }[mode] ?? Bike;
  return (
    <>
      <div className={clsx("flex items-center gap-2 overflow-x-auto no-scrollbar", compact ? "text-xs" : "text-[13px]")}>
        <button onClick={() => setOpen("where")}
          className={clsx("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-medium ring-1",
            location ? "bg-surface text-slate-800 ring-slate-200" : "bg-amber-50 text-amber-900 ring-amber-300")}>
          <MapPin size={15} className="text-brand-700" />
          <span className="max-w-[11rem] truncate">{location ? location.label : "محل شما کجاست؟"}</span>
          {location && <span className="rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-500">{radius ? `${faNum(radius)} km` : "کل تهران"}</span>}
        </button>
        <button onClick={() => setOpen("when")} className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 font-medium text-slate-800 ring-1 ring-slate-900/[0.06] shadow-card">
          <Clock size={15} className="text-brand-700" />
          {visitLabel || "الان"}
          <ModeIcon size={14} className="text-slate-400" />
        </button>
      </div>
      <LocationSheet open={open === "where"} onClose={() => setOpen(null)} />
      <TimeSheet open={open === "when"} onClose={() => setOpen(null)} />
    </>
  );
}

const NEAR_AREA_KM = 1.5;

function nearest(areas: Place[], lat: number, lon: number): Place | null {
  let best: Place | null = null;
  let bestD = Infinity;
  for (const p of areas) {
    if (!p.label?.trim()) continue;
    const d = Math.hypot((p.lat - lat) * 111, (p.lon - lon) * 90);
    if (d < bestD) [best, bestD] = [p, d];
  }
  return best && bestD <= NEAR_AREA_KM ? best : null;
}

interface Pick {
  lat: number;
  lon: number;
  label: string;
  source: "gps" | "place" | "map";
}

/** An exact coordinate is preserved when tapping or dragging; area names only label it. */
export function LocationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { set, radius, location } = usePrefs();
  const [q, setQ] = useState("");
  const [locating, setLocating] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  const [rad, setRad] = useState<number | null>(3);
  const [fitKey, setFitKey] = useState("init");
  const [mode, setMode] = useState<"map" | "areas">("map");
  const [name, setName] = useState("");
  const places = useQuery({ queryKey: ["places", q], queryFn: () => api.places(q), enabled: open && !!q });
  const meta = useQuery({ queryKey: ["meta"], queryFn: api.meta, enabled: open, staleTime: Infinity });
  const areas = (meta.data?.areas || []).map((a) => ({ label: a.label, kind: "area" as const, lat: a.lat, lon: a.lon, shops: a.shops }));
  useEffect(() => {
    if (!open) return;
    setPick(location ? { ...location } : null); setRad(location ? radius : 3);
    setQ(""); setName(""); setMode("map"); setFitKey(`open:${Date.now()}`);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (value: Pick) => { setPick(value); setName(""); setQ(""); setMode("map"); setFitKey(`pick:${value.lat}:${value.lon}`); };
  const gps = () => {
    if (!navigator.geolocation) return toast.warn("مرورگر شما موقعیت‌یابی را پشتیبانی نمی‌کند؛ روی نقشه بزنید.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition((position) => {
      setLocating(false); choose({ lat: position.coords.latitude, lon: position.coords.longitude, label: "موقعیت فعلی من", source: "gps" });
    }, () => { setLocating(false); toast.warn("روی نقشه بزنید یا محله را جست‌وجو کنید", { title: "موقعیت‌یابی انجام نشد" }); }, { enableHighAccuracy: true, timeout: 8000 });
  };
  const pickPoint = (lat: number, lon: number) => {
    const near = nearest(areas, lat, lon);
    setPick({ lat, lon, label: near ? `نقطه انتخابی نزدیک ${near.label}` : "نقطه انتخابی روی نقشه", source: "map" });
    setName("");
  };
  const confirm = () => {
    if (!pick) return;
    set({ location: { ...pick, label: name.trim() || pick.label }, radius: rad }); onClose();
  };
  const pins = pick ? [{ id: "pick", lat: pick.lat, lon: pick.lon, label: "نقطه شروع انتخابی؛ برای اصلاح جابه‌جا کنید", tone: "pick" as const, draggable: true }] : [];
  const zones = pick && rad ? [{ lat: pick.lat, lon: pick.lon, radius: rad * 1000, color: "#2563eb" }] : [];
  return <Sheet open={open} onClose={onClose} title="انتخاب نقطه شروع" wide footer={<div className="flex gap-2">
    <Button className="flex-1" size="lg" disabled={!pick} onClick={confirm}>استفاده از این نقطه</Button>
    {location && <Button variant="ghost" onClick={() => { set({ location: null, radius: null }); onClose(); }}>حذف مبدأ</Button>}
  </div>}>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant={mode === "map" ? "primary" : "outline"} onClick={() => setMode("map")}><MapPin size={14} /> انتخاب دقیق روی نقشه</Button>
      <Button size="sm" variant={mode === "areas" ? "primary" : "outline"} onClick={() => setMode("areas")}><Search size={14} /> جست‌وجوی محله و پاساژ</Button>
      <Button size="sm" variant="soft" disabled={locating} onClick={gps}><LocateFixed size={14} />{locating ? "در حال پیدا کردن…" : "موقعیت فعلی من"}</Button>
    </div>
    {mode === "areas" && <div className="mt-3">
      <label className="block text-xs text-slate-600">محله، خیابان یا پاساژ<input value={q} onChange={(event) => setQ(event.target.value)} placeholder="نام محله یا پاساژ…" className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" /></label>
      {q && places.isError && <p role="alert" className="mt-2 text-xs text-rose-700">جست‌وجو انجام نشد؛ از نقشه استفاده کنید یا دوباره تلاش کنید.</p>}
      <div className="mt-2 grid max-h-44 grid-cols-2 gap-2 overflow-y-auto">
        {(q ? places.data || [] : areas).map((place) => <button key={place.kind + place.label} onClick={() => choose({ lat: place.lat, lon: place.lon, label: place.label, source: "place" })} className="rounded-xl bg-slate-50 p-3 text-right text-xs ring-1 ring-slate-200">{place.label}</button>)}
        {q && places.isFetching && <p className="text-xs text-slate-500">در حال جست‌وجو…</p>}
        {q && !places.isFetching && !places.isError && !places.data?.length && <p className="col-span-2 text-xs text-slate-500">جایی پیدا نشد؛ نقطه دقیق را روی نقشه انتخاب کنید.</p>}
      </div>
    </div>}
    <p className="mt-3 text-xs leading-6 text-slate-600">روی نقطه موردنظر بزنید یا نشانگر را بکشید. انتخاب محله تنها نقطه آغاز است؛ می‌توانید جای دقیق آن را اصلاح کنید.</p>
    <div className="mt-2"><MapView className="h-[34dvh] min-h-52 md:h-80" pins={pins} zones={zones} onMapClick={pickPoint} onPinMove={(_, lat, lon) => pickPoint(lat, lon)} hideMe fitKey={fitKey} /></div>
    <div aria-live="polite" className="mt-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-900">
      <div className="font-bold">{pick ? pick.label : "هنوز نقطه‌ای انتخاب نشده؛ روی نقشه بزنید."}</div>
      {pick && <><div dir="ltr" className="mt-1 text-left font-mono text-xs">{pick.lat.toFixed(6)}, {pick.lon.toFixed(6)}</div><p className="mt-1 text-[11px]">{pick.source === "place" ? "مرکز تقریبی محله یا پاساژ؛ برای تعیین آدرس دقیق، نشانگر را جابه‌جا کنید." : "مختصات همین نقطه ذخیره می‌شود؛ دقت نشانی وابسته به نقشه و GPS است."}</p></>}
    </div>
    {pick && <label className="mt-3 block text-xs text-slate-600">نام دلخواه برای این نقطه (اختیاری)<input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="مثلاً خانه یا محل کار" className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-surface px-3 text-sm" /></label>}
    <div className="mt-3 rounded-xl bg-slate-50 p-3">
      <div className="text-xs font-bold">محدوده جست‌وجو: {rad ? `${faNum(rad)} کیلومتر` : "کل تهران"}</div>
      <input type="range" min={1} max={15} step={1} value={rad ?? 15} disabled={rad === null} dir="ltr" onChange={(event) => setRad(Number(event.target.value))} aria-label="شعاع جست‌وجو" className="mt-3 w-full accent-brand-700 disabled:opacity-40" />
      <label className="mt-2 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={rad === null} onChange={(event) => setRad(event.target.checked ? null : 3)} />فاصله مهم نیست؛ کل تهران</label>
    </div>
  </Sheet>;
}

export function TimeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { set, visitLabel, mode } = usePrefs();
  const [custom, setCustom] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title="کی می‌روید و چطور؟">
      <div className="text-sm text-slate-500">ساعت کاری مغازه‌ها برای زمان رسیدن شما بررسی می‌شود.</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {TIME_PRESETS.map((t) => (
          <button key={t.label} onClick={() => { set({ visitAt: t.at ? t.at() : null, visitLabel: t.at ? t.label : null }); onClose(); }}
            className={clsx("rounded-full px-3.5 py-2 text-sm ring-1", (visitLabel || "الان") === t.label ? "bg-brand-700 text-white ring-brand-700" : "bg-surface ring-slate-200")}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} dir="ltr"
          className="h-10 flex-1 rounded-xl border border-slate-200 px-3 text-sm" />
        <Button variant="outline" disabled={!custom} onClick={() => {
          const d = new Date(custom);
          set({ visitAt: `${custom}:00+03:30`, visitLabel: new Intl.DateTimeFormat("fa-IR", { weekday: "long", hour: "2-digit", minute: "2-digit" }).format(d) });
          onClose();
        }}>تأیید</Button>
      </div>
      <div className="mt-5 text-sm font-bold">وسیله رفت‌وآمد</div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {([["taxi", "تاکسی/ماشین", Car], ["metro", "مترو", TrainFront], ["walk", "پیاده", Footprints]] as const).map(([k, l, Icon]) => (
          <button key={k} onClick={() => set({ mode: k })}
            className={clsx("flex flex-col items-center gap-1 rounded-xl py-2.5 text-xs ring-1", mode === k ? "bg-brand-50 text-brand-800 ring-brand-500" : "bg-surface ring-slate-200")}>
            <Icon size={18} /> {l}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
