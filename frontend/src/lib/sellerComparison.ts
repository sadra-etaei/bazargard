import type { Offer } from "./types";
export interface SellerSelection { productId: string; title: string; sellers: { offerId: string; shopId: string }[] }
export function toggleSeller(current: SellerSelection | null, productId: string, title: string, offerId: string, shopId: string): SellerSelection {
  const sellers = current?.productId === productId ? current.sellers : [];
  if (sellers.some(s => s.offerId === offerId)) return { productId, title, sellers: sellers.filter(s => s.offerId !== offerId) };
  if (sellers.some(s => s.shopId === shopId)) return { productId, title, sellers: sellers.map(s => s.shopId === shopId ? { offerId, shopId } : s) };
  if (sellers.length >= 3) return current!;
  return { productId, title, sellers: [...sellers, { offerId, shopId }] };
}
/** Resolve exact records, retaining missing columns. Never silently substitute another seller. */
export function resolveSellers(ids: string[], offers: Offer[]): (Offer | undefined)[] {
  return ids.slice(0, 3).map(id => offers.find(o => o.offer_id === id));
}
export function eligibleOffer(o: Offer): boolean {
  return o.matches_filters === true && o.stock.state !== "out" && o.shop.status.state !== "closed";
}
export function bestOffer(offers: Offer[]): Offer | undefined {
  return offers.filter(eligibleOffer).sort((a,b) => b.score - a.score)[0];
}
export function lowestEligiblePrice(offers: Offer[]): number | null {
  const prices = offers.filter(eligibleOffer).flatMap(o => o.price && o.price > 0 ? [o.price] : []);
  return prices.length ? Math.min(...prices) : null;
}
export function sellerCompareUrl(selection: SellerSelection): string {
  return `/p/${selection.productId}/compare-sellers?offers=${selection.sellers.map(s => encodeURIComponent(s.offerId)).join(",")}`;
}
