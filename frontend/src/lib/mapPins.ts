export interface MapPoint { id: string; lat: number; lon: number; label: string }
export interface MapGroup { id: string; lat: number; lon: number; items: MapPoint[] }

export function escapeMapLabel(label: string) {
  return label.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

/** Group overlapping markers without inventing distinct locations for stores in a mall. */
export function groupMapPoints(points: MapPoint[], zoom: number): MapGroup[] {
  const groups: { x: number; y: number; group: MapGroup }[] = [];
  const scale = 256 * 2 ** zoom;
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
    const sin = Math.sin(Math.max(-85, Math.min(85, point.lat)) * Math.PI / 180);
    const x = (point.lon + 180) / 360 * scale;
    const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
    const existing = groups.find((item) => Math.hypot(item.x - x, item.y - y) < 64);
    if (existing) existing.group.items.push(point);
    else groups.push({ x, y, group: { id: `group:${point.id}`, lat: point.lat, lon: point.lon, items: [point] } });
  }
  return groups.map((item) => item.group);
}

export function normalizeMapText(value: string) {
  return value.trim().replace(/ك/g, "ک").replace(/ي/g, "ی")
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}
