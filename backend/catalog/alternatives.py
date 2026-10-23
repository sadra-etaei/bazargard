"""When the shop doesn't have it: the same product elsewhere, then similar products, then likely shops."""
import re
from dataclasses import replace
from datetime import datetime

from .hours import TEHRAN
from . import db
from .search import (Context, all_shops, category_only_shops, passes, product_detail, product_view, recent_reports,
                     score_offer, shop_view)
from .filters import _short
from .textnorm import fa_digits, tokens

GENERIC = set(tokens("مدل اصلی اورجینال جدید سری نسخه با و برای ظرفیت رنگ سایز عددی بسته طرح کد"))


def _spec_map(specs_json) -> dict:
    return {s.get("key"): str(s.get("value")) for s in (db.loads(specs_json, []) or []) if s.get("key")}


def similarity(a: dict, b: dict) -> float:
    ta, tb = set(tokens(a["title"])) - GENERIC, set(tokens(b["title"])) - GENERIC
    title = len(ta & tb) / max(len(ta | tb), 1)
    sa, sb = _spec_map(a.get("specs")), _spec_map(b.get("specs"))
    shared = set(sa) & set(sb)
    spec = sum(sa[k] == sb[k] for k in shared) / len(shared) if shared else 0
    brand = 0.15 if a.get("brand") and a.get("brand") == b.get("brand") else 0
    return 0.55 * title + 0.3 * spec + brand


def _device_model(title):
    from .textnorm import normalize
    text = normalize(title).replace("آیفون", "iphone").replace("ایفون", "iphone")
    match = re.search(r"(?:iphone|اپل)\s*(?:مدل\s*)?(\d{1,2}|xs|xr|x)(?:\s*(pro|پرو))?(?:\s*(max|مکس|mini|مینی))?(?![a-z0-9])", text, re.I)
    if not match:
        return None
    suffixes = {"پرو": "pro", "مکس": "max", "مینی": "mini"}
    return tuple(suffixes.get(value, value) for value in match.groups())


def compatible_candidate(base, candidate):
    """Reject a definite mismatch; absence of evidence never confirms compatibility."""
    category = base.get("category") or ""
    if any(part in category for part in ("ال سی دی", "باتری گوشی", "کاور گوشی")):
        original, other = _device_model(base["title"]), _device_model(candidate["title"])
        if original and other and original != other:
            return False
    if any(part in category for part in ("فیوز", "کنتاکتور", "رله", "اینورتر")):
        from .textnorm import normalize
        left, right = _spec_map(base.get("specs")), _spec_map(candidate.get("specs"))
        for key in left.keys() & right.keys():
            if any(term in key for term in ("ولتاژ", "آمپر", "جریان نامی", "تعداد پل")) and normalize(left[key]) != normalize(right[key]):
                return False
    return True


def alternatives(product_id: str, ctx: Context, exclude_shop: str | None = None, limit: int = 6, at_shop: bool = False) -> dict | None:
    if at_shop and exclude_shop:
        origin = all_shops().get(exclude_shop)
        if origin:
            ctx = replace(ctx, lat=origin["lat"], lon=origin["lon"], visit_at=datetime.now(TEHRAN))
    detail = product_detail(product_id, ctx)
    if not detail:
        return None
    shops = all_shops()
    base = dict(db.one("SELECT * FROM products WHERE product_id=?", (product_id,)))

    same = [o for o in detail["offers"] if o["shop"]["shop_id"] != exclude_shop and o["stock"]["state"] != "out"
            and o["shop"]["status"]["state"] != "closed" and all(passes(o, ctx).values())]
    excluded_shop = shops.get(exclude_shop) if exclude_shop else None
    same_mall = [o for o in same if excluded_shop and excluded_shop["mall_key"] and o["shop"]["mall_key"] == excluded_shop["mall_key"]]

    # Similar products: same category first, by title tokens, then rank by similarity and price closeness.
    toks = [t for t in tokens(base["title"]) if t not in GENERIC and len(t) > 1][:8]
    rows = []
    if toks:
        expr = " OR ".join(f'"{t}"' for t in toks)
        try:
            rows = db.q("""SELECT p.* FROM product_fts f JOIN products p ON p.pid = f.rowid
                           WHERE product_fts MATCH ? AND p.pid != ? ORDER BY bm25(product_fts, 10.0, 4.0, 3.0, 1.0) LIMIT 250""",
                        (expr, base["pid"]))
        except Exception:
            rows = []
    if base["category"]:
        rows = [r for r in rows if r["category"] == base["category"]] or rows
    ref_price = base["median_price"] or base["min_price"]
    scored = []
    for r in rows:
        r = dict(r)
        if ref_price and r["median_price"] and not 0.4 * ref_price <= r["median_price"] <= 1.8 * ref_price:
            continue
        if not compatible_candidate(base, r):
            continue
        sim = similarity(base, r)
        if sim < 0.12:
            continue
        scored.append((sim, r))
    scored.sort(key=lambda x: -x[0])

    similar = []
    pids = [r["pid"] for _, r in scored[:40]]
    offers_by = {}
    if pids:
        for o in db.q(f"SELECT * FROM offers WHERE pid IN ({','.join('?' * len(pids))})", pids):
            offers_by.setdefault(o["pid"], []).append(o)
    reports = recent_reports({o["shop_id"] for v in offers_by.values() for o in v},
                             {r["product_id"] for _, r in scored[:40]})
    for sim, r in scored[:40]:
        offers = [o for o in offers_by.get(r["pid"], []) if o["shop_id"] in shops]
        valid = [o["price"] for o in offers if o["price"]]
        ref = {"min": min(valid) if valid else None, "max": max(valid) if valid else None, "n": len(valid)}
        cards = [score_offer(o, r, shop_view(shops[o["shop_id"]], ctx), ctx,
                             reports.get((o["shop_id"], r["product_id"])), ref) for o in offers]
        cards = [c for c in cards if c["shop"]["status"]["state"] != "closed" and all(passes(c, ctx).values())]
        if not cards:
            continue
        cards.sort(key=lambda c: -c["score"])
        best = cards[0]
        diff = round((best["price"] - ref_price) / ref_price * 100) if best["price"] and ref_price else None
        why = [f"مشابه در عنوان و مشخصات؛ سازگاری نیازمند بررسی"]
        if r["brand"] and r["brand"] == base["brand"]:
            why.append("همان برند")
        if diff is not None:
            why.append(f"{fa_digits(abs(diff))}٪ {'ارزان‌تر' if diff < 0 else 'گران‌تر'}" if abs(diff) >= 3 else "قیمت مشابه")
        if excluded_shop and best["shop"]["mall_key"] and best["shop"]["mall_key"] == excluded_shop["mall_key"]:
            why.append("در همین پاساژ")
        similar.append({**product_view(r), "similarity": round(sim, 3), "price_diff_pct": diff,
                        "matching_offers": len(cards), "best": best, "why": " · ".join(why),
                        "differences": [{"key": key, "original": _spec_map(base.get("specs")).get(key), "alternative": _spec_map(r.get("specs")).get(key)}
                                        for key in sorted(set(_spec_map(base.get("specs"))) | set(_spec_map(r.get("specs"))))
                                        if _spec_map(base.get("specs")).get(key) != _spec_map(r.get("specs")).get(key)][:4]})
        if len(similar) >= limit:
            break

    best_next = _best_next(detail, excluded_shop, exclude_shop, same_mall, same, similar, ctx, at_shop)

    return {
        "best_next": best_next,
        "product": {k: detail[k] for k in ("product_id", "title", "image", "category", "brand", "median_price")},
        "same_product": same[:limit],
        "same_mall": same_mall[:4],
        "similar": similar,
        "category_shops": category_only_shops([base["category"]], ctx, exclude={o["shop"]["shop_id"] for o in detail["offers"]}, limit=4)
        if base["category"] else None,
    }


def _trade_off(price, ref_price, dist, ref_dist) -> list[str]:
    out = []
    if price and ref_price and abs(price - ref_price) >= max(ref_price * 0.03, 10_000):
        d = price - ref_price
        out.append(f"{_short(abs(d))} تومان {'گران‌تر' if d > 0 else 'ارزان‌تر'}")
    if dist is not None and ref_dist is not None and abs(dist - ref_dist) >= 0.15:
        d = dist - ref_dist
        amount = f"{fa_digits(round(abs(d) * 1000 / 50) * 50)} متر" if abs(d) < 1 else f"{fa_digits(round(abs(d), 1))} کیلومتر"
        out.append(f"{amount} {'دورتر' if d > 0 else 'نزدیک‌تر'}")
    return out


def _best_next(detail, excluded_shop, exclude_shop, same_mall, same, similar, ctx, at_shop) -> dict | None:
    """One clear next move after "they don't have it": same mall > same product elsewhere > similar product."""
    ref_offer = next((o for o in detail["offers"] if o["shop"]["shop_id"] == exclude_shop), None)
    ref_price = (ref_offer["price"] if ref_offer else None) or detail["price_stats"]["median"]
    ref_dist = shop_view(excluded_shop, ctx)["distance_km"] if excluded_shop else None
    if same_mall and at_shop:
        o, kind, head = same_mall[0], "same_mall", "همین پاساژ، بدون جابه‌جایی"
    elif same:
        o, kind, head = same[0], "same_product", "همین کالا با توجه به شرایط شما"
    elif similar:
        o, kind, head = similar[0]["best"], "similar", "کالای مشابه"
    else:
        return None
    s = o["shop"]
    parts = _trade_off(o["price"], ref_price, s["distance_km"], ref_dist if kind != "same_mall" else None)
    if kind == "same_mall":
        where = " · ".join(x for x in (s.get("floor_label"), f"واحد {fa_digits(s['unit'])}" if s.get("unit") else None) if x)
        parts.insert(0, where or "همان ساختمان")
    if kind == "similar":
        parts.insert(0, similar[0]["why"].split(" · ")[0])
    return {"kind": kind, "headline": head, "offer": o, "product": similar[0] if kind == "similar" else None,
            "tradeoff": " · ".join(parts) if parts else "شرایط مشابه"}
