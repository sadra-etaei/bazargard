const nf = new Intl.NumberFormat("fa-IR");

export const faNum = (n: number | string | null | undefined) =>
  n === null || n === undefined ? "—" : typeof n === "number" ? nf.format(n) : n.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);

export function toman(n: number | null | undefined): string {
  if (!n) return "قیمت نامشخص";
  return `${nf.format(n)} تومان`;
}

/** "۲٫۵ میلیون" style short price for chips and map pins. */
export function shortToman(n: number | null | undefined, unit = true): string {
  if (!n) return "؟";
  if (n >= 1_000_000_000) return `${nf.format(+(n / 1_000_000_000).toFixed(1))}${unit ? " میلیارد" : "B"}`;
  if (n >= 1_000_000) return `${nf.format(+(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1))}${unit ? " میلیون" : "M"}`;
  if (n >= 1000) return `${nf.format(Math.round(n / 1000))}${unit ? " هزار" : "K"}`;
  return nf.format(n);
}

export function km(d: number | null | undefined): string {
  if (d === null || d === undefined) return "";
  if (d < 1) return `${nf.format(Math.round(d * 1000 / 10) * 10)} متر`;
  return `${nf.format(+d.toFixed(1))} کیلومتر`;
}

export function minutes(m: number | null | undefined): string {
  if (!m) return "";
  if (m < 60) return `${nf.format(m)} دقیقه`;
  return `${nf.format(Math.floor(m / 60))} ساعت${m % 60 ? ` و ${nf.format(m % 60)} دقیقه` : ""}`;
}

export function timeAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${faNum(mins)} دقیقه پیش`;
  if (mins < 1440) return `${faNum(Math.round(mins / 60))} ساعت پیش`;
  return `${faNum(Math.round(mins / 1440))} روز پیش`;
}

/** Torob image URLs are full size; the CDN serves the same path. */
export const img = (url: string | null | undefined) => url || "";
