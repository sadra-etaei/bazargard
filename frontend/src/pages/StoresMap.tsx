import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { ContextBar, LocationSheet } from "../components/ContextBar";
import type { MapViewport } from "../components/MapView";
import { StoreMap } from "../components/StoreMap";
import { Button } from "../components/ui";
import { api } from "../lib/api";
import { faNum } from "../lib/format";
import { useCtx } from "../lib/hooks";
import { usePrefs } from "../lib/store";

export default function StoresMap() {
  const ctx = useCtx();
  const me = usePrefs((s) => s.location);
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const updateViewport = useCallback((bounds: MapViewport) => setViewport((previous) => previous && JSON.stringify(previous) === JSON.stringify(bounds) ? previous : bounds), []);
  const stores = useQuery({ queryKey: ["map-shops", viewport, ctx, term], queryFn: () => api.mapShops(viewport!, ctx, term), enabled: !!viewport });
  return <div className="px-4 pt-4 lg:px-0">
    <h1 className="text-xl font-extrabold">فروشگاه‌ها روی نقشه</h1>
    <p className="mt-1 text-xs leading-6 text-slate-500">روی نام یا تعداد فروشگاه‌ها بزنید؛ سپس فروشگاه، طبقه و مسیر را انتخاب کنید. این نقشه همه فروشگاه‌های ثبت‌شده را نشان می‌دهد و موجودی کالای خاصی را تأیید نمی‌کند.</p>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><ContextBar compact /><Button variant="outline" size="sm" onClick={() => setPickOpen(true)}><MapPin size={14} /> انتخاب نقطه دقیق مبدأ</Button></div>
    <form onSubmit={(event) => { event.preventDefault(); setTerm(query.trim()); }} className="mt-3 flex gap-2">
      <label className="relative min-w-0 flex-1"><span className="sr-only">نام فروشگاه یا پاساژ در محدوده نقشه</span><Search size={15} className="absolute right-3 top-3 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="فروشگاه یا پاساژ در این محدوده…" className="h-10 w-full rounded-xl border border-slate-200 bg-surface pr-9 pl-3 text-sm" /></label>
      <Button type="submit" size="md">جست‌وجو</Button>
      {term && <Button variant="ghost" onClick={() => { setQuery(""); setTerm(""); }}>پاک کردن</Button>}
    </form>
    <div className="mt-3"><StoreMap className="h-[56dvh] min-h-72 lg:h-[65dvh]" shops={stores.data?.shops || []} onViewportChange={updateViewport} fitKey={`explore:${me?.lat}:${me?.lon}`} /></div>
    <div aria-live="polite" className="mt-2 text-xs leading-6 text-slate-600">
      {stores.isFetching ? "در حال دریافت فروشگاه‌های محدوده نقشه…" : stores.isError ? <span role="alert">فروشگاه‌ها دریافت نشد. <button onClick={() => stores.refetch()} className="font-bold underline">تلاش دوباره</button></span> : stores.data && <>
        {faNum(stores.data.shops.length)} فروشگاه در این نما{stores.data.truncated && ` از ${faNum(stores.data.total)} فروشگاه؛ برای دیدن بقیه نزدیک‌تر شوید یا نقشه را جابه‌جا کنید.`}
        {!stores.data.total && "؛ نقشه را جابه‌جا کنید، بزرگ‌نمایی را کمتر کنید یا عبارت جست‌وجو را تغییر دهید."}
      </>}
    </div>
    <p className="mt-1 mb-4 text-[11px] leading-5 text-slate-500">عدد روی نشانگر یعنی چند فروشگاه در آن محدوده. نشانگر خط‌چین: اطلاعات کالا یا ساعت نیازمند بررسی؛ خاکستری: طبق ساعت ثبت‌شده بسته است.</p>
    <LocationSheet open={pickOpen} onClose={() => setPickOpen(false)} />
  </div>;
}
