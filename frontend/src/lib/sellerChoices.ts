import type { Offer } from "./types";

export function sellerChoices(offers: Offer[]) {
  const eligible = offers.filter((o) => o.matches_filters && o.stock.state !== "out" && o.shop.status.state !== "closed");
  const choices: { offer: Offer; labels: string[] }[] = [];
  const add = (offer: Offer | undefined, label: string) => {
    if (!offer) return;
    const existing = choices.find((c) => c.offer.shop.shop_id === offer.shop.shop_id);
    if (existing) existing.labels.push(label); else choices.push({ offer, labels: [label] });
  };
  add(eligible.filter((o) => o.price !== null).sort((a, b) => a.price! - b.price!)[0], "کمترین قیمت ثبت‌شده");
  add(eligible.filter((o) => o.shop.travel_min !== null).sort((a, b) => a.shop.travel_min! - b.shop.travel_min!)[0], "کمترین زمان تقریبی مسیر");
  add(eligible.filter((o) => o.stock.state === "confirmed" && o.stock.at).sort((a, b) => Date.parse(b.stock.at!) - Date.parse(a.stock.at!))[0], "تازه‌ترین تأیید موجودی");
  return choices;
}
