import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { escapeMapLabel } from "../lib/mapPins";
import { faNum, shortToman } from "../lib/format";
import { usePrefs } from "../lib/store";

export interface Pin {
  id: string;
  lat: number;
  lon: number;
  label: string;
  closed?: boolean;
  draggable?: boolean;
  count?: number;
  active?: boolean;
  /** name-style pin instead of a price bubble */
  tone?: "open" | "maybe" | "closed" | "torob" | "pick";
}

export interface MapViewport { south: number; west: number; north: number; east: number; zoom: number }

export interface Zone {
  lat: number;
  lon: number;
  radius: number;
  color?: string;
}

const TEHRAN: [number, number] = [35.6955, 51.4125];

// Tile servers can be slow or filtered on some networks, so maps fall back through these in order.
const PROVIDERS = [
  { name: "OpenStreetMap", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", subdomains: "" },
  { name: "OpenStreetMap DE", url: "https://tile.openstreetmap.de/{z}/{x}/{y}.png", subdomains: "" },
  { name: "Esri", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", subdomains: "" },
];
const TILE_TIMEOUT_MS = 6000;
const ERRORS_BEFORE_SWITCH = 4;

// The provider that last worked; every map on the page starts from it.
let workingProvider = 0;

function Tiles({ onAllFailed }: { onAllFailed: () => void }) {
  const [index, setIndex] = useState(workingProvider);
  const loaded = useRef(false);
  const errors = useRef(0);

  const next = () => {
    if (loaded.current) return;
    if (index + 1 < PROVIDERS.length) setIndex(index + 1);
    else onAllFailed();
  };

  useEffect(() => {
    loaded.current = false;
    errors.current = 0;
    const timer = setTimeout(next, TILE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  const p = PROVIDERS[index];
  return (
    <TileLayer key={p.name} url={p.url} subdomains={p.subdomains || "abc"} maxZoom={19} referrerPolicy="strict-origin-when-cross-origin"
      eventHandlers={{
        tileload: () => {
          loaded.current = true;
          workingProvider = index;
        },
        tileerror: () => {
          errors.current += 1;
          if (errors.current >= ERRORS_BEFORE_SWITCH) next();
        },
      }} />
  );
}

function Fit({ points, fitKey }: { points: [number, number][]; fitKey?: string }) {
  const map = useMap();
  useEffect(() => {
    const fit = () => {
      map.invalidateSize();
      if (points.length === 1) map.setView(points[0], 16);
      else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 17 });
    };
    fit();
    const t = setTimeout(fit, 350); // inside an animating bottom sheet the first measurement is too small
    return () => clearTimeout(t);
  }, [map, fitKey ?? JSON.stringify(points)]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Clicks({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Viewport({ onChange }: { onChange: (bounds: MapViewport) => void }) {
  const map = useMap();
  const report = () => {
    const bounds = map.getBounds();
    onChange({ south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast(), zoom: map.getZoom() });
  };
  useMapEvents({ moveend: report, zoomend: report });
  useEffect(report, [map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Leaflet measures its container once; re-measure when the box is resized (sticky panels, layout changes). */
function KeepSized() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

export function MapView({ pins, onSelect, route, zones, className = "h-[60dvh]", onMapClick, hideMe, fitKey, onViewportChange, onPinMove }: {
  onViewportChange?: (bounds: MapViewport) => void;
  onPinMove?: (id: string, lat: number, lon: number) => void;
  pins: Pin[]; onSelect?: (id: string) => void; route?: [number, number][]; zones?: Zone[]; className?: string;
  /** tapping empty map reports the point (used by the location picker) */
  onMapClick?: (lat: number, lon: number) => void;
  /** hide the blue "you are here" dot (the picker shows its own pin) */
  hideMe?: boolean;
  /** refit the view only when this changes (default: whenever the points change) */
  fitKey?: string;
}) {
  const me = usePrefs((s) => s.location);
  const [failed, setFailed] = useState(false);
  const points = useMemo(() => {
    const pts: [number, number][] = pins.map((p) => [p.lat, p.lon]);
    if (me && !hideMe) pts.push([me.lat, me.lon]);
    for (const z of zones || []) {
      // include the whole circle so the radius is visible, not just its centre
      const dLat = z.radius / 111320;
      const dLon = z.radius / (111320 * Math.cos((z.lat * Math.PI) / 180));
      pts.push([z.lat - dLat, z.lon - dLon], [z.lat + dLat, z.lon + dLon]);
    }
    return pts;
  }, [pins, me, zones, hideMe]);

  return (
    <div className={`relative isolate overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-900/[0.06] shadow-card ${className}`}>
      <MapContainer center={TEHRAN} zoom={15} className="size-full" scrollWheelZoom attributionControl={false}>
        <Tiles onAllFailed={() => setFailed(true)} />
        <KeepSized />
        {onViewportChange && <Viewport onChange={onViewportChange} />}
        <Fit points={points} fitKey={fitKey} />
        {onMapClick && <Clicks onPick={onMapClick} />}
        {route && route.length > 1 && <Polyline positions={route} pathOptions={{ color: "#2563eb", weight: 4, dashArray: "6 8" }} />}
        {zones?.map((z, i) => <Circle key={i} center={[z.lat, z.lon]} radius={z.radius}
          pathOptions={{ color: z.color || "#f59e0b", weight: 2, dashArray: "5 6", fillOpacity: 0.12 }} />)}
        {me && !hideMe && <Marker position={[me.lat, me.lon]} icon={L.divIcon({ className: "", html: '<div class="me-pin"></div>', iconSize: [0, 0] })} />}
        {pins.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lon]} title={p.label || "نقطه انتخابی"} alt={p.label || "نقطه انتخابی"} draggable={p.draggable || false} bubblingMouseEvents={false}
            eventHandlers={{ click: () => onSelect?.(p.id), dragend: (event) => {
              const point = event.target.getLatLng(); onPinMove?.(p.id, point.lat, point.lng);
            } }}
            zIndexOffset={p.active ? 1000 : 0}
            icon={L.divIcon({ className: "", iconSize: p.tone === "pick" ? [40, 48] : p.count ? [44, 44] : [0, 0],
              iconAnchor: p.tone === "pick" ? [20, 48] : p.count ? [22, 22] : [0, 0],
              html: p.count ? `<div class="cluster-pin">${faNum(p.count)}</div>` : p.tone === "pick" ? '<svg class="pick-pin" width="40" height="48" viewBox="0 0 40 48" aria-hidden="true"><path d="M20 46S3 29 3 18a17 17 0 1 1 34 0C37 29 20 46 20 46Z" fill="#e11d48" stroke="white" stroke-width="3"/><circle cx="20" cy="18" r="7" fill="white"/></svg>' : p.tone ? `<div class="shop-pin ${p.tone} ${p.active ? "active" : ""}">${escapeMapLabel(p.label)}</div>`
                : `<div class="price-pin ${p.closed ? "closed" : ""} ${p.active ? "active" : ""}">${escapeMapLabel(p.label)}</div>` })} />
        ))}
      </MapContainer>
      {failed && (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] rounded-xl bg-surface/95 px-3 py-2 text-center text-xs leading-5 text-slate-600 shadow">
          تصویر نقشه بارگذاری نشد (اتصال به سرورهای نقشه برقرار نیست). محل فروشگاه‌ها روی نقشه مشخص است و دکمه «مسیریابی» با نشان/بلد کار می‌کند.
        </div>
      )}
    </div>
  );
}

export const pricePin = (price: number | null) => shortToman(price, false);
