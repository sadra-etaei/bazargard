import { usePrefs } from "./store";
import type {
  Alternatives, AssistantReply, CoverPlan, Filters, Meta, Place, ProductDetail, ProductSummary, SearchResponse,
  SellerMessage, Shop, NeighborShop, TripPlan, Visit, Offer, Inquiry, InquiryChannel, SellerInquiry, StockAnswer,
} from "./types";

const BASE = "/api";

export function qs(params: object): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "" || v === false) continue;
    u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "Content-Type": "application/json", "X-Device-Id": usePrefs.getState().deviceId, ...(init?.headers || {}) },
  });
  if (!res.ok) {
    // The API answers errors as {"detail": "<Persian message>"}; surface that message as-is.
    const body = await res.text();
    let detail = "";
    try {
      detail = JSON.parse(body).detail;
    } catch {
      /* not JSON */
    }
    throw new Error(typeof detail === "string" && detail ? detail : `خطای سرور (${res.status})`);
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body: unknown) => call<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  meta: () => call<Meta>("/meta"),
  places: (q: string) => call<Place[]>(`/places${qs({ q })}`),
  search: (f: Filters, page = 1) => call<SearchResponse>(`/search${qs({ ...f, page })}`),
  product: (id: string, f: Filters) => call<ProductDetail>(`/products/${id}${qs(f)}`),
  alternatives: (id: string, f: Filters, excludeShop?: string, atShop = false) =>
    call<Alternatives>(`/products/${id}/alternatives${qs({ ...f, exclude_shop: excludeShop, at_shop: atShop })}`),
  shop: (id: string, f: Filters, pq = "") =>
    call<{ shop: Shop; mall_shops: Shop[]; mall_shop_count: number; products: { items: { product: ProductSummary; offer: Offer }[]; total: number } }>(
      `/shops/${id}${qs({ ...f, pq })}`,
    ),
  mapShops: (bounds: { south: number; west: number; north: number; east: number }, f: Filters, term = "") =>
    call<{ shops: Shop[]; total: number; truncated: boolean }>(`/map/shops${qs({ ...f, ...bounds, term })}`),
  shopNeighbors: (id: string) => call<{ shops: NeighborShop[] }>(`/shops/${encodeURIComponent(id)}/neighbors`),
  shopProducts: (id: string, f: Filters, pq: string) =>
    call<{ items: { product: ProductSummary; offer: Offer }[]; total: number }>(`/shops/${id}/products${qs({ ...f, pq })}`),
  mall: (key: string, f: Filters) => call<{ key: string; name: string; shops: Shop[] }>(`/malls/${encodeURIComponent(key)}${qs(f)}`),
  message: (p: { shop_id: string; offer_id?: string; visit_label?: string | null; installments?: boolean; torobpay?: boolean }) =>
    call<SellerMessage>(`/message${qs(p)}`),
  report: (r: { shop_id: string; product_id?: string; status: string; source?: string; price?: number | null; note?: string }) =>
    post<{ id: number }>("/reports", r),
  myReports: () =>
    call<{ id: number; shop_id: string; shop_name: string; product_id: string; product_title: string | null; status: string;
      status_label: string; source: string; price: number | null; created_at: string }[]>("/reports/mine"),
  visits: () => call<Visit[]>("/visits"),
  addVisit: (v: { shop_id: string; product_id?: string; offer_id?: string }) => post<Visit>("/visits", v),
  updateVisit: (id: number, p: { state?: string; paid_price?: number | null }) =>
    call<Visit>(`/visits/${id}`, { method: "PATCH", body: JSON.stringify(p) }),
  completeVisit: (id: number, p: { state: string; paid_price?: number | null }) => post<Visit>(`/visits/${id}/complete`, p),
  replaceVisit: (id: number, v: { shop_id: string; product_id: string; offer_id: string }) =>
    post<Visit>(`/visits/${id}/replace`, v),
  deleteVisit: (id: number) => call(`/visits/${id}`, { method: "DELETE" }),
  plan: (f: Filters & { start_visit_id?: number | null }) => call<TripPlan>(`/plan${qs(f)}`),
  list: () => call<{ id: number; query: string; product_id: string; done: boolean; product: ProductSummary | null }[]>("/list"),
  addList: (query: string, product_id = "") => post<{ id: number }>("/list", { query, product_id }),
  deleteList: (id: number) => call(`/list/${id}`, { method: "DELETE" }),
  cover: (f: Filters) => call<{ items: ProductSummary[]; plans: CoverPlan[] }>(`/list/cover${qs(f)}`),
  assistant: (message: string, state: Record<string, unknown>) => post<AssistantReply>("/assistant", { message, state }),
  messaging: () => call<{ sms: string; call: string; sms_simulated: boolean; call_simulated: boolean }>("/messaging"),
  ask: (p: { shop_id: string; product_id?: string; offer_id?: string; visit_label?: string | null; channel: InquiryChannel; installments?: boolean; torobpay?: boolean }) =>
    post<Inquiry>("/inquiries", { ...p, visit_label: p.visit_label || "" }),
  inquiry: (id: number) => call<Inquiry>(`/inquiries/${id}`),
  inquiries: (unseen = false) => call<Inquiry[]>(`/inquiries${qs({ unseen })}`),
  inquirySeen: (id: number) => post<{ ok: boolean }>(`/inquiries/${id}/seen`, {}),
  sellerInquiry: (token: string) => call<SellerInquiry>(`/r/${token}`),
  sellerAnswer: (token: string, a: { status: StockAnswer; price?: number | null; note?: string }) => post<SellerInquiry>(`/r/${token}`, a),
  keypress: (token: string, digits: string) => post<{ ok: boolean; status: StockAnswer; price: number | null }>("/voice/keypress", { token, digits }),
};
