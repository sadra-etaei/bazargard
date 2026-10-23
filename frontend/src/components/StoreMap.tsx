import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, MapPin, Navigation, Plus } from "lucide-react";
import { groupMapPoints, normalizeMapText } from "../lib/mapPins";
import { faNum, km } from "../lib/format";
import { useAddVisit } from "../lib/hooks";
import { usePrefs } from "../lib/store";
import type { Shop } from "../lib/types";
import { MapView, type MapViewport } from "./MapView";
import { Button, OpenBadge, Sheet, toast } from "./ui";

export function StoreMap({ shops: inputShops, className, fitKey, onViewportChange, onSelectStore, offers = {}, route }: {
  route?: [number, number][];
  shops: Shop[]; className?: string; fitKey?: string; onViewportChange?: (bounds: MapViewport) => void;
  onSelectStore?: (id: string) => void; offers?: Record<string, { productId: string; offerId: string }>;
}) {
  const shops = useMemo(() => [...new Map(inputShops.map((shop) => [shop.shop_id, shop])).values()], [inputShops]);
  const [zoom, setZoom] = useState(15);
  const [selection, setSelection] = useState<Shop[]>([]);
  const [groupFilter, setGroupFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const add = useAddVisit();
  const groups = useMemo(() => groupMapPoints(shops.map((s) => ({ id: s.shop_id, lat: s.lat, lon: s.lon, label: s.name })), zoom), [shops, zoom]);
  const matchingSelection = selection.filter((s) => !groupFilter || normalizeMapText([s.name, s.mall, s.floor_label, s.unit].filter(Boolean).join(" ")).includes(normalizeMapText(groupFilter)));
  const shop = selection.find((s) => s.shop_id === selectedId);
  const choose = (s: Shop) => { setSelectedId(s.shop_id); onSelectStore?.(s.shop_id); };
  return <>
    <MapView className={className} route={route} fitKey={fitKey ?? JSON.stringify(shops.map((s) => [s.shop_id, s.lat, s.lon]))} onViewportChange={(bounds) => { setZoom(bounds.zoom); onViewportChange?.(bounds); }}
      pins={groups.map((group) => {
        const first = shops.find((s) => s.shop_id === group.items[0].id)!;
        return { id: group.id, count: group.items.length > 1 ? group.items.length : undefined, lat: group.lat, lon: group.lon, label: group.items.length > 1 ? `${faNum(group.items.length)} فروشگاه` : first.name,
          active: group.items.some((item) => item.id === selectedId), tone: group.items.length > 1 ? "torob" as const : first.offer_count === 0 ? "maybe" as const : first.status.state === "closed" ? "closed" as const : first.status.state === "unknown" ? "maybe" as const : "open" as const };
      })} onSelect={(id) => {
        const group = groups.find((g) => g.id === id);
        if (!group) return;
        const selected = group.items.map((item) => shops.find((s) => s.shop_id === item.id)!).filter(Boolean);
        setSelection(selected); setGroupFilter(""); setSelectedId(selected.length === 1 ? selected[0].shop_id : null);
        if (selected.length === 1) onSelectStore?.(selected[0].shop_id);
      }} />
    <Sheet open={selection.length > 0} onClose={() => { setSelection([]); setSelectedId(null); }} title={shop?.name || `فروشگاه‌های این نقطه (${faNum(selection.length)})`}>
      {shop ? <div className="space-y-3">
        {selection.length > 1 && <button onClick={() => setSelectedId(null)} className="text-xs font-bold text-brand-700">بازگشت به فروشگاه‌های این نقطه</button>}
        {!shop.name_verified && <p className="text-xs text-slate-500">نام فروشگاه در این نسخه نمایشی است.</p>}
        <OpenBadge state={shop.status.state} label={shop.status.label} />
        {shop.mall && <p className="flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 p-3 text-sm font-bold text-brand-900"><Building2 size={16} />{shop.mall}{shop.floor_label && ` · ${faNum(shop.floor_label)}`}{shop.unit && ` · واحد ${faNum(shop.unit)}`}</p>}
        <p className="text-sm leading-7 text-slate-600">{shop.address || "آدرس ثبت نشده"}</p>
        <p className="text-xs text-slate-500">{shop.offer_count > 0 ? `${faNum(shop.offer_count)} کالای ثبت‌شده؛ موجودی نیازمند استعلام است.` : "فقط فعالیت فروشگاه ثبت شده؛ کالای مشخصی تأیید نشده است."}{shop.distance_km !== null && ` · ${km(shop.distance_km)} از مبدأ انتخابی`}</p>
        <Link className="block rounded-xl bg-brand-700 px-3 py-3 text-center text-sm font-bold text-white" to={`/s/${shop.shop_id}`}>مشاهده فروشگاه و کالاها</Link>
        <Button disabled={add.isPending} className="w-full" variant="outline" onClick={() => add.mutate({ shop_id: shop.shop_id, product_id: offers[shop.shop_id]?.productId, offer_id: offers[shop.shop_id]?.offerId })}><Plus size={15} /> افزودن به مسیر خرید</Button>
        <div className="flex items-center gap-1 text-xs font-bold text-slate-600"><Navigation size={14} /> مسیریابی به فروشگاه</div>
        <div className="grid grid-cols-3 gap-2">
          {shop.nav.neshan && <Button variant="soft" href={shop.nav.neshan}>نشان</Button>}
          {shop.nav.balad && <Button variant="soft" href={shop.nav.balad}>بلد</Button>}
          {shop.nav.google && <Button variant="soft" href={shop.nav.google}>گوگل‌مپ</Button>}
        </div>
        <Button variant="ghost" className="w-full" onClick={() => {
          usePrefs.getState().set({ location: { lat: shop.lat, lon: shop.lon, label: shop.name, source: "place" } });
          setSelection([]); setSelectedId(null); toast.success("این فروشگاه به‌عنوان نقطه شروع انتخاب شد");
        }}><MapPin size={15} /> مبدأ من اینجاست</Button>
      </div> : <>
        <p className="mb-3 text-xs leading-6 text-slate-500">این فروشگاه‌ها روی نقشه نزدیک به هم هستند یا در یک ساختمان قرار دارند؛ نام فروشگاه و طبقه را انتخاب کنید. نقشه جایگزین نقشه داخلی پاساژ نیست.</p>
        <label className="mb-3 block text-xs text-slate-600">پیدا کردن فروشگاه در این نقطه<input value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} placeholder="نام، پاساژ، طبقه یا واحد" className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" /></label>
        <ul className="space-y-2">{matchingSelection.map((s) => <li key={s.shop_id}><button onClick={() => choose(s)} className="w-full rounded-xl bg-slate-50 p-3 text-right ring-1 ring-slate-200">
          <div className="text-sm font-bold">{s.name}</div><div className="mt-1 text-xs text-slate-500">{[s.mall, s.floor_label && faNum(s.floor_label), s.unit && `واحد ${faNum(s.unit)}`].filter(Boolean).join(" · ") || s.area || "آدرس نامشخص"}</div>
        </button></li>)}</ul>
        {!matchingSelection.length && <p className="mt-3 text-sm text-slate-500">فروشگاهی با این نام یا واحد در این نقطه پیدا نشد.</p>}
      </>}
    </Sheet>
  </>;
}
