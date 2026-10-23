"""Search, ranking and the transparent "why / watch out" explanations shown on every card."""
import math
import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta
from functools import lru_cache

from django.utils import timezone

from . import db
from .geo import floor_label, floor_rank, haversine_km, travel_minutes
from .hours import TEHRAN, status_at, week_table
from .textnorm import fa_digits, normalize, tokens

INSTALLMENT_PROVIDERS = ("اسنپ", "دیجی", "تارا", "ازکی", "لندو", "وام")


@dataclass
class Context:
    lat: float | None = None
    lon: float | None = None
    radius_km: float | None = None
    visit_at: datetime = field(default_factory=lambda: datetime.now(TEHRAN))
    budget_min: int | None = None
    budget_max: int | None = None
    open_at_visit: bool = False
    installments: bool = False
    torobpay: bool = False
    warranty: bool = False
    fast_delivery: bool = False
    include_unknown: bool = False
    category: str | None = None
    brand: str | None = None
    mall_key: str | None = None
    priority: str = "balanced"  # balanced | price | near | reliable
    travel_mode: str = "taxi"
    sort: str = "relevance"  # relevance | price_asc | price_desc | near
    device_id: str | None = None


WEIGHTS = {
    "balanced": {"price": 0.30, "dist": 0.25, "open": 0.20, "fresh": 0.15, "trust": 0.10},
    "price": {"price": 0.55, "dist": 0.12, "open": 0.13, "fresh": 0.12, "trust": 0.08},
    "near": {"price": 0.15, "dist": 0.50, "open": 0.20, "fresh": 0.08, "trust": 0.07},
    "reliable": {"price": 0.15, "dist": 0.15, "open": 0.20, "fresh": 0.25, "trust": 0.25},
}


# ------------------------------------------------------------------------------------------------
# Shops
# ------------------------------------------------------------------------------------------------
@lru_cache(maxsize=1)
def all_shops() -> dict[str, dict]:
    shops = {}
    for r in db.q("SELECT * FROM shops"):
        s = dict(r)
        s["categories"] = db.loads(s["categories"], [])
        s["payments"] = db.loads(s["payments"], [])
        s["hours"] = db.loads(s["hours"])
        shops[s["shop_id"]] = s
    return shops


def payment_summary(payments: list[dict]) -> dict:
    torob = [p for p in payments if p["provider"] and "ترب" in p["provider"]]
    inst = [p for p in payments if p["provider"] and any(k in p["provider"] for k in INSTALLMENT_PROVIDERS)]
    return {
        "torobpay": "in_person" if any(p["channel"] == "in_person" for p in torob) else ("unknown_channel" if torob else None),
        "installments": [{"provider": p["provider"], "in_person": p["channel"] == "in_person"} for p in inst],
        "declared": bool(payments),
    }


def nav_links(lat, lon, name="") -> dict:
    if lat is None:
        return {}
    return {
        "neshan": f"https://neshan.org/maps/@{lat},{lon},18z,0p",
        "balad": f"https://balad.ir/location?latitude={lat}&longitude={lon}&zoom=18",
        "google": f"https://www.google.com/maps/dir/?api=1&destination={lat},{lon}",
    }


def shop_view(s: dict, ctx: Context, *, full: bool = False) -> dict:
    dist = haversine_km(ctx.lat, ctx.lon, s["lat"], s["lon"]) if ctx.lat is not None else None
    if dist is not None and math.isnan(dist):
        dist = None
    arrive = ctx.visit_at + timedelta(minutes=travel_minutes(dist, ctx.travel_mode)) if dist is not None else ctx.visit_at
    v = {
        "shop_id": s["shop_id"],
        "name": s["name"],
        "name_verified": bool(s["name_is_real"]),
        "address": s["address"],
        "area": s["location_label"],
        "lat": s["lat"],
        "lon": s["lon"],
        "mall": s["mall"],
        "mall_key": s["mall_key"],
        "floor": s["floor"],
        "unit": s["unit"],
        "floor_rank": floor_rank(s["floor"]),
        "floor_label": floor_label(s["floor"]),
        "phone": s["phone"],
        "instagram": s["instagram"],
        "website": s["website"],
        "distance_km": round(dist, 2) if dist is not None else None,
        "travel_min": travel_minutes(dist, ctx.travel_mode) if dist is not None else None,
        "status": status_at(s["hours"], arrive),
        "hours_known": s["hours"] is not None,
        "payments": payment_summary(s["payments"]),
        "fast_delivery": None if s["fast_delivery"] is None else bool(s["fast_delivery"]),
        "offer_count": s["offer_count"],
        "nav": nav_links(s["lat"], s["lon"]),
    }
    if full:
        v["week"] = week_table(s["hours"])
        v["categories"] = s["categories"]
    return v


# ------------------------------------------------------------------------------------------------
# Offers
# ------------------------------------------------------------------------------------------------
def price_age(changed_at: str | None) -> dict:
    if not changed_at:
        return {"days": None, "level": "unknown", "label": "زمان ثبت قیمت نامشخص"}
    try:
        dt = datetime.fromisoformat(changed_at)
    except ValueError:
        return {"days": None, "level": "unknown", "label": "زمان ثبت قیمت نامشخص"}
    days = max(0, (timezone.now() - dt).days)
    if days <= 1:
        label, level = "قیمت امروز/دیروز ثبت شده", "fresh"
    elif days <= 14:
        label, level = f"قیمت {fa_digits(days)} روز پیش ثبت شده", "fresh"
    elif days <= 45:
        label, level = f"قیمت {fa_digits(days)} روز پیش ثبت شده", "recent"
    elif days <= 180:
        label, level = f"قیمت {fa_digits(days // 30)} ماه پیش ثبت شده — احتمالاً تغییر کرده", "old"
    else:
        label, level = f"قیمت بیش از {fa_digits(days // 30)} ماه پیش ثبت شده — قابل اتکا نیست", "stale"
    return {"days": days, "level": level, "label": label, "at": changed_at}


FRESH_SCORE = {"fresh": 1.0, "recent": 0.75, "old": 0.4, "stale": 0.1, "unknown": 0.3}
OPEN_SCORE = {"open": 1.0, "open_no_hours": 0.75, "closing_soon": 0.45, "unknown": 0.5, "closed": 0.0}


def warranty_view(o) -> dict | None:
    if not (o["warranty_provider"] or o["warranty_months"] or o["warranty_desc"]):
        return None
    parts = []
    if o["warranty_months"]:
        parts.append(f"{fa_digits(o['warranty_months'])} ماهه")
    if o["warranty_provider"]:
        parts.append(o["warranty_provider"])
    label = "گارانتی " + " ".join(parts) if parts else o["warranty_desc"]
    if o["warranty_provider"] == "بدون گارانتی":
        label = "بدون گارانتی"
    return {"provider": o["warranty_provider"], "months": o["warranty_months"], "description": o["warranty_desc"],
            "label": label, "has": o["warranty_provider"] != "بدون گارانتی"}


def stock_view(report: dict | None) -> dict:
    if not report:
        return {"state": "unconfirmed", "label": "موجودی تأیید نشده — قبل از رفتن تماس بگیرید"}
    ago = _ago(report["created_at"])
    if report.get("source") == "seller":  # answered by the seller via SMS link or automatic call
        labels = {"in_stock": ("confirmed", f"فروشنده {ago} تأیید کرد: موجود است"),
                  "out_of_stock": ("out", f"فروشنده {ago} اعلام کرد: موجود نیست"),
                  "price_changed": ("price_changed", f"فروشنده {ago} قیمت جدید اعلام کرد")}
        if report["status"] in labels:
            state, label = labels[report["status"]]
            return {"state": state, "label": label, "price": report["price"], "at": report["created_at"].isoformat(), "by_seller": True}
    if report["status"] == "in_stock":
        return {"state": "confirmed", "label": f"موجودی {ago} تأیید شده ({report['source_label']})", "at": report["created_at"].isoformat()}
    if report["status"] == "out_of_stock":
        return {"state": "out", "label": f"{ago} گزارش ناموجودی ثبت شده", "at": report["created_at"].isoformat()}
    if report["status"] == "price_changed":
        return {"state": "price_changed", "label": f"{ago} قیمت جدید گزارش شده", "price": report["price"], "at": report["created_at"].isoformat()}
    return {"state": "unconfirmed", "label": "موجودی تأیید نشده"}


def _ago(dt: datetime) -> str:
    mins = int((timezone.now() - dt).total_seconds() // 60)
    if mins < 60:
        return f"{fa_digits(max(mins, 1))} دقیقه پیش"
    if mins < 1440:
        return f"{fa_digits(mins // 60)} ساعت پیش"
    return f"{fa_digits(mins // 1440)} روز پیش"


def recent_reports(shop_ids, product_ids, hours: int = 72) -> dict:
    """Latest stock report per (shop_id, product_id) plus shop-level "closed" reports."""
    from .models import StockReport

    if not shop_ids:
        return {}
    since = timezone.now() - timedelta(hours=hours)
    out = {}
    qs = StockReport.objects.filter(created_at__gte=since, shop_id__in=list(shop_ids)).order_by("-created_at")
    for r in qs[:2000]:
        if r.status == StockReport.Status.SHOP_CLOSED:
            out.setdefault((r.shop_id, "*"), _report_dict(r))
        elif r.product_id in product_ids:
            out.setdefault((r.shop_id, r.product_id), _report_dict(r))
    return out


def _report_dict(r) -> dict:
    return {"status": r.status, "price": r.price, "created_at": r.created_at, "source": r.source, "source_label": r.get_source_display()}


def score_offer(o, product: dict, shop: dict, ctx: Context, report: dict | None, price_ref: dict) -> dict:
    """Build an offer card: score, reasons (why it is suggested) and warnings (what to watch out for)."""
    age = price_age(o["price_changed_at"])
    w = warranty_view(o)
    stock = stock_view(report)
    price = o["price"]
    if stock["state"] == "price_changed" and stock.get("price"):
        price = stock["price"]
    if stock.get("by_seller") and stock["state"] == "price_changed":
        # The seller just stood behind this price, so it is no longer an old listing.
        age = {"days": 0, "level": "fresh", "label": "قیمت جدید را فروشنده اعلام کرده", "at": stock.get("at")}

    reasons, warnings = [], []
    med = product.get("median_price")
    p_score = 0.5
    if price and price_ref.get("min") and price_ref.get("max"):
        lo, hi = price_ref["min"], price_ref["max"]
        p_score = 1.0 if hi == lo else 1 - (price - lo) / (hi - lo)
        if price == lo and price_ref.get("n", 0) > 1:
            reasons.append("ارزان‌ترین فروشنده در نتایج")
    if price and med and price_ref.get("n", 0) >= 3:
        diff = (price - med) / med
        if diff <= -0.05:
            reasons.append(f"{fa_digits(round(-diff * 100))}٪ زیر قیمت میانه تهران")
        elif diff >= 0.15:
            warnings.append(f"{fa_digits(round(diff * 100))}٪ گران‌تر از میانه — جای چانه‌زنی دارد")
    if not price:
        warnings.append("قیمت ثبت نشده — استعلام بگیرید" if o["price_status"] == "missing" else "قیمت ثبت‌شده نامعتبر است — استعلام بگیرید")

    d = shop["distance_km"]
    d_score = 0.5 if d is None else math.exp(-d / 4)
    if d is not None:
        if d < 1:
            reasons.append(f"{fa_digits(int(d * 1000))} متر از شما")
        elif d <= 5:
            reasons.append(f"{fa_digits(round(d, 1))} کیلومتر (حدود {fa_digits(shop['travel_min'])} دقیقه)")

    st = shop["status"]
    o_score = OPEN_SCORE.get(st["state"], 0.5)
    if st["state"] in ("open", "open_no_hours"):
        reasons.append(st["label"])
    elif st["state"] == "closed":
        warnings.append(st["label"] + (f" — {st['next_open']} باز می‌شود" if st.get("next_open") else ""))
    elif st["state"] == "closing_soon":
        warnings.append(st["label"])
    else:
        warnings.append("ساعت کاری نامشخص — قبل از رفتن تماس بگیرید")

    f_score = FRESH_SCORE[age["level"]]
    if age["level"] == "fresh":
        reasons.append(age["label"])
    elif age["level"] in ("old", "stale", "unknown"):
        warnings.append(age["label"])

    t_score = 0.4
    if w and w["has"]:
        t_score += 0.3
        reasons.append(w["label"])
    if shop["payments"]["torobpay"] == "in_person":
        t_score += 0.15
        reasons.append("پذیرنده ترب‌پی حضوری")
    if any(p["in_person"] for p in shop["payments"]["installments"]):
        reasons.append("خرید قسطی حضوری: " + "، ".join(p["provider"] for p in shop["payments"]["installments"] if p["in_person"]))
    if shop["mall"]:
        reasons.append(f"{shop['mall']}" + (f"، طبقه {shop['floor']}" if shop["floor"] else ""))

    # Stock answers are shown by the stock badge on every card, so they don't repeat as reasons/warnings.
    if stock["state"] == "confirmed":
        t_score += 0.3
    elif stock["state"] == "price_changed":  # the seller answered, so the item is there at a known price
        t_score += 0.2

    weights = WEIGHTS.get(ctx.priority, WEIGHTS["balanced"])
    score = (weights["price"] * p_score + weights["dist"] * d_score + weights["open"] * o_score
             + weights["fresh"] * f_score + weights["trust"] * min(t_score, 1))
    if stock["state"] == "out":
        score *= 0.2

    return {
        "offer_id": o["offer_id"],
        "seller_title": o["seller_title"],
        "description": o["description"],
        "price": price,
        "listed_price": o["price"],
        "price_status": o["price_status"],
        "price_vs_median": round((price - med) / med * 100) if price and med else None,
        "price_age": age,
        "warranty": w,
        "stock": stock,
        "score": round(score, 4),
        "reasons": reasons[:5],
        "warnings": warnings[:4],
        "shop": shop,
        "condition_states": condition_states({"shop": shop, "warranty": w}),
    }


def condition_states(offer: dict) -> dict[str, str]:
    shop, warranty = offer["shop"], offer.get("warranty")
    pays = shop["payments"]
    return {
        "installments": "confirmed" if any(p["in_person"] for p in pays["installments"]) else "unknown",
        "torobpay": "confirmed" if pays["torobpay"] == "in_person" else "unknown",
        "warranty": "confirmed" if warranty and warranty["has"] else "rejected" if warranty else "unknown",
        "fast": "unknown" if shop["fast_delivery"] is None else "confirmed" if shop["fast_delivery"] else "rejected",
    }


def passes(offer: dict, ctx: Context) -> dict[str, bool]:
    """Unknown evidence can be included explicitly, never treated as confirmation."""
    shop, price = offer["shop"], offer["price"]
    states = condition_states(offer)
    requested = {"installments": ctx.installments, "torobpay": ctx.torobpay,
                 "warranty": ctx.warranty, "fast": ctx.fast_delivery}
    return {
        "budget": not ((ctx.budget_max and (not price or price > ctx.budget_max)) or (ctx.budget_min and price and price < ctx.budget_min)),
        "radius": not (ctx.radius_km and shop["distance_km"] is not None and shop["distance_km"] > ctx.radius_km),
        "open": not ctx.open_at_visit or shop["status"]["state"] in ("open", "closing_soon", "open_no_hours")
                or (ctx.include_unknown and shop["status"]["state"] == "unknown"),
        "conditions": all(not enabled or states[key] == "confirmed" or (ctx.include_unknown and states[key] == "unknown")
                          for key, enabled in requested.items()),
        "mall": not (ctx.mall_key and shop["mall_key"] != ctx.mall_key),
        "stock": offer["stock"]["state"] != "out",
    }


# ------------------------------------------------------------------------------------------------
# Products
# ------------------------------------------------------------------------------------------------
def product_view(r, *, full: bool = False) -> dict:
    images = db.loads(r["images"], []) or []
    v = {
        "pid": r["pid"],
        "product_id": r["product_id"],
        "title": r["title"],
        "brand": r["brand"],
        "model": r["model"],
        "category": r["category"],
        "image": images[0] if images else None,
        "offer_count": r["offer_count"],
        "min_price": r["min_price"],
        "median_price": r["median_price"],
        "max_price": r["max_price"],
    }
    if full:
        v["images"] = images[:8]
        specs = db.loads(r["specs"], []) or []
        groups = defaultdict(list)
        for s in specs:
            groups[s.get("section") or "مشخصات"].append({"key": s.get("key"), "value": s.get("value")})
        v["specs"] = [{"section": k, "items": items} for k, items in groups.items()]
    return v


def fts_candidates(keywords: str, limit: int = 400) -> tuple[list[tuple[int, float]], str]:
    toks = [t for t in tokens(keywords) if t.replace(".", "")]
    if not toks:
        return [], "none"

    def run(expr):
        try:
            return [(r[0], r[1]) for r in db.q(
                "SELECT rowid, bm25(product_fts, 10.0, 4.0, 3.0, 1.5) FROM product_fts WHERE product_fts MATCH ? ORDER BY 2 LIMIT ?",
                (expr, limit))]
        except Exception:
            return []

    def term(t):
        return f'"{t}"*' if len(t) >= 2 else f'"{t}"'

    # Persian compounds are written both split and joined ("پاور بانک" / "پاوربانک"), so short
    # neighbouring words also match their joined form.
    terms, i = [], 0
    while i < len(toks):
        a = toks[i]
        b = toks[i + 1] if i + 1 < len(toks) else None
        if b and len(a) <= 6 and len(b) <= 6 and not a.isdigit() and not b.isdigit():
            terms.append(f'(({term(a)} AND {term(b)}) OR {term(a + b)})')
            i += 2
        else:
            terms.append(term(a))
            i += 1
    rows = run(" AND ".join(terms))
    if len(rows) >= 5 or len(toks) == 1:
        return rows, "all"
    loose = run(" OR ".join(term(t) for t in toks))
    seen = {pid for pid, _ in rows}
    return rows + [r for r in loose if r[0] not in seen], "partial" if not rows else "all"


def _load_products(pids) -> dict[int, dict]:
    if not pids:
        return {}
    ph = ",".join("?" * len(pids))
    return {r["pid"]: dict(r) for r in db.q(f"SELECT * FROM products WHERE pid IN ({ph})", list(pids))}


def _load_offers(pids) -> dict[int, list]:
    out = defaultdict(list)
    pids = list(pids)
    for i in range(0, len(pids), 500):
        chunk = pids[i:i + 500]
        for r in db.q(f"SELECT * FROM offers WHERE pid IN ({','.join('?' * len(chunk))})", chunk):
            out[r["pid"]].append(r)
    return out


def search(keywords: str, ctx: Context, *, page: int = 1, page_size: int = 20) -> dict:
    """Search products with offers; rank them; explain filters that removed everything."""
    shops = all_shops()
    cands, match_mode = fts_candidates(keywords) if keywords else ([], "none")
    if not cands and ctx.category:
        cands = [(r[0], -1.0) for r in db.q("SELECT pid FROM products WHERE category=? ORDER BY offer_count DESC LIMIT 400", (ctx.category,))]
        match_mode = "category"
    if not cands:
        return _empty(keywords, ctx, match_mode)

    rank_of = dict(cands)
    products = _load_products(rank_of)
    if ctx.category:
        products = {k: v for k, v in products.items() if v["category"] == ctx.category}
    if ctx.brand:
        products = {k: v for k, v in products.items() if (v["brand"] or "") == ctx.brand}
    offers_by_pid = _load_offers(products)

    shop_ids = {o["shop_id"] for offers in offers_by_pid.values() for o in offers}
    reports = recent_reports(shop_ids, {p["product_id"] for p in products.values()})
    sviews = {sid: shop_view(shops[sid], ctx) for sid in shop_ids if sid in shops}

    best_rank = min(abs(r) for r in rank_of.values()) or 1.0
    # The category most top hits fall in is probably what the user means ("هندزفری" → headphones,
    # not headphone cases); products in it get a boost.
    top_hits = [products[pid]["category"] for pid, _ in cands[:60] if pid in products]
    cat_share = {c: n / len(top_hits) for c, n in Counter(top_hits).items()} if top_hits else {}
    max_share = max(cat_share.values(), default=1) or 1
    results, relax, pool = [], Counter(), []
    unknown_matches = 0
    radius_preview = 0
    next_radius = round(ctx.radius_km * 2, 1) if ctx.radius_km else None
    facet_cat, facet_brand, facet_mall = Counter(), Counter(), Counter()
    for pid, p in products.items():
        offers = [o for o in offers_by_pid.get(pid, []) if o["shop_id"] in sviews]
        if not offers:
            continue
        valid = [o["price"] for o in offers if o["price"]]
        ref = {"min": min(valid) if valid else None, "max": max(valid) if valid else None, "n": len(valid)}
        cards = []
        for o in offers:
            rep = reports.get((o["shop_id"], p["product_id"])) or reports.get((o["shop_id"], "*"))
            cards.append(score_offer(o, p, sviews[o["shop_id"]], ctx, rep, ref))
        flags = [passes(c, ctx) for c in cards]
        if not ctx.include_unknown and not any(all(f.values()) for f in flags) and any(all(passes(c, replace(ctx, include_unknown=True)).values()) for c in cards):
            unknown_matches += 1
        pool_cards = [c for c, f in zip(cards, flags) if all(v for k, v in f.items() if k not in ("radius", "open"))]
        if pool_cards:
            pool.append((best_rank / max(abs(rank_of.get(pid, best_rank)), 1e-9) if rank_of.get(pid, -1) != -1 else 0.6, p, pool_cards))
        ok = [c for c, f in zip(cards, flags) if all(f.values())]
        for key in ("budget", "radius", "open", "conditions", "mall"):
            if not ok and any(all(v for k, v in f.items() if k != key) for f in flags):
                relax[key] += 1
        if not ok and next_radius and any(all(passes(c, replace(ctx, radius_km=next_radius)).values()) for c in cards):
            radius_preview += 1
        if not ok:
            continue
        facet_cat[p["category"]] += 1
        if p["brand"]:
            facet_brand[p["brand"]] += 1
        for c in ok:
            if c["shop"]["mall_key"]:
                facet_mall[(c["shop"]["mall_key"], c["shop"]["mall"])] += 1
        ok.sort(key=lambda c: -c["score"])
        rel = best_rank / max(abs(rank_of.get(pid, best_rank)), 1e-9) if rank_of.get(pid, -1) != -1 else 0.6
        coverage = min(math.log1p(len(ok)) / math.log(12), 1)
        cat_fit = cat_share.get(p["category"], 0) / max_share
        pscore = 0.4 * min(rel, 1) + 0.2 * cat_fit + 0.28 * ok[0]["score"] + 0.12 * coverage
        prices = [c["price"] for c in ok if c["price"]]
        dists = [c["shop"]["distance_km"] for c in ok if c["shop"]["distance_km"] is not None]
        results.append({
            **product_view(p),
            "score": round(pscore, 4),
            "matching_offers": len(ok),
            "price_from": min(prices) if prices else None,
            "price_to": max(prices) if prices else None,
            "nearest_km": round(min(dists), 2) if dists else None,
            "open_count": sum(1 for c in ok if c["shop"]["status"]["state"] in ("open", "open_no_hours", "closing_soon")),
            "best": ok[0],
            "why": _product_why(ok, p),
        })

    sorters = {
        "price_asc": lambda r: (r["price_from"] is None, r["price_from"] or 0),
        "price_desc": lambda r: (r["price_from"] is None, -(r["price_from"] or 0)),
        "near": lambda r: (r["nearest_km"] is None, r["nearest_km"] or 0),
    }
    results.sort(key=sorters.get(ctx.sort, lambda r: -r["score"]))
    top_cats = [c for c, _ in facet_cat.most_common(3)]
    start = (page - 1) * page_size
    return {
        "keywords": keywords,
        "match_mode": match_mode,
        "total": len(results),
        "unknown_matches": unknown_matches,
        "products": results[start:start + page_size],
        "facets": {
            "categories": [{"name": n, "count": c} for n, c in facet_cat.most_common(8)],
            "brands": [{"name": n, "count": c} for n, c in facet_brand.most_common(8)],
            "malls": [{"key": k, "name": n, "count": c} for (k, n), c in facet_mall.most_common(6)],
        },
        "relax": _relax_suggestions(relax, ctx, next_radius, radius_preview) if not results else [],
        "category_shops": category_only_shops(top_cats, ctx, exclude=shop_ids) if top_cats else None,
        "notices": _notices(results, ctx, match_mode),
        "after_hours": _after_hours(pool, top_cats, ctx, keywords) if keywords else None,
    }


def _after_hours(pool, top_cats, ctx, keywords):
    from . import afterhours  # imported lazily: afterhours depends on this module

    return afterhours.analyze(pool, top_cats, ctx, keywords)


def _product_why(ok: list[dict], p: dict) -> str:
    n = len(ok)
    parts = [f"{fa_digits(n)} فروشنده در فیلترهای شما"]
    best = ok[0]
    if best["shop"]["distance_km"] is not None:
        parts.append(f"نزدیک‌ترین {fa_digits(round(min(c['shop']['distance_km'] or 99 for c in ok), 1))} کیلومتر")
    malls = Counter(c["shop"]["mall"] for c in ok if c["shop"]["mall"])
    if malls:
        name, cnt = malls.most_common(1)[0]
        if cnt >= 2:
            parts.append(f"{fa_digits(cnt)} فروشنده در {name}")
    return " · ".join(parts)


RELAX_LABELS = {
    "budget": "محدودیت بودجه را بردارید",
    "radius": "محدودیت فاصله را بردارید",
    "open": "زمان دیگری مراجعه کنید (الان بسته‌اند)",
    "conditions": "شرط پرداخت/گارانتی را بردارید",
    "mall": "فیلتر پاساژ را بردارید",
}


def _relax_suggestions(relax: Counter, ctx: Context, next_radius=None, radius_preview=0) -> list[dict]:
    suggestions = [{"filter": k, "label": RELAX_LABELS[k], "products": n} for k, n in relax.most_common()]
    if next_radius and radius_preview:
        suggestions = [s for s in suggestions if s["filter"] != "radius"]
        suggestions.insert(0, {"filter": "radius", "label": f"افزایش محدوده از {fa_digits(ctx.radius_km)} به {fa_digits(next_radius)} کیلومتر",
                               "value": next_radius, "products": radius_preview})
    return suggestions


def _notices(results, ctx: Context, match_mode: str) -> list[str]:
    notes = []
    if match_mode == "partial":
        notes.append("نتیجه دقیقی برای همه کلمات پیدا نشد؛ نزدیک‌ترین موارد را نشان می‌دهیم.")
    if ctx.lat is None:
        notes.append("موقعیت شما مشخص نیست؛ برای فاصله و مسیر، محل را انتخاب کنید.")
    stale = sum(1 for r in results[:20] if r["best"]["price_age"]["level"] in ("old", "stale"))
    if stale >= 5:
        notes.append("قیمت بخشی از نتایج قدیمی است؛ قیمت ثبت‌شده در ترب با قیمت امروز مغازه یکی نیست.")
    return notes


def _empty(keywords, ctx, match_mode):
    return {"keywords": keywords, "match_mode": match_mode, "total": 0, "products": [],
            "facets": {"categories": [], "brands": [], "malls": []}, "relax": [], "category_shops": None,
            "after_hours": None, "notices": ["کالایی با این عنوان در فروشگاه‌های ثبت‌شده پیدا نشد. عبارت ساده‌تر یا نام برند را امتحان کنید."]}


def category_only_shops(categories: list[str], ctx: Context, exclude=(), limit: int = 6) -> dict | None:
    """Shops whose *activity category* matches but that did not list this product: possible, not confirmed."""
    if not categories:
        return None
    ph = ",".join("?" * len(categories))
    ids = {r[0] for r in db.q(f"SELECT DISTINCT shop_id FROM shop_categories WHERE category IN ({ph})", categories)} - set(exclude)
    shops = all_shops()
    views = [shop_view(shops[i], ctx) for i in ids if i in shops]
    if ctx.radius_km and ctx.lat is not None:
        views = [v for v in views if v["distance_km"] is not None and v["distance_km"] <= ctx.radius_km]
    views.sort(key=lambda v: (v["distance_km"] if v["distance_km"] is not None else 999, -v["offer_count"]))
    return {"categories": categories, "count": len(views), "shops": views[:limit],
            "note": "این فروشگاه‌ها در این دسته فعالیت دارند اما این کالا را در ترب ثبت نکرده‌اند؛ موجود بودن تأیید نشده است."}


# ------------------------------------------------------------------------------------------------
# Product detail
# ------------------------------------------------------------------------------------------------
def product_detail(product_id: str, ctx: Context) -> dict | None:
    r = db.one("SELECT * FROM products WHERE product_id=?", (product_id,))
    if not r:
        return None
    p = dict(r)
    shops = all_shops()
    offers = [o for o in db.q("SELECT * FROM offers WHERE pid=?", (p["pid"],)) if o["shop_id"] in shops]
    reports = recent_reports({o["shop_id"] for o in offers}, {product_id})
    valid = [o["price"] for o in offers if o["price"]]
    ref = {"min": min(valid) if valid else None, "max": max(valid) if valid else None, "n": len(valid)}
    cards = []
    for o in offers:
        rep = reports.get((o["shop_id"], product_id)) or reports.get((o["shop_id"], "*"))
        c = score_offer(o, p, shop_view(shops[o["shop_id"]], ctx), ctx, rep, ref)
        c["filters"] = passes(c, ctx)
        # Reported-out offers stay listed (scored low) so the shopper sees what happened.
        c["matches_filters"] = all(v for k, v in c["filters"].items() if k != "stock")
        cards.append(c)
    cards.sort(key=lambda c: (not c["matches_filters"], -c["score"]))
    ages = [c["price_age"]["days"] for c in cards if c["price_age"]["days"] is not None]
    return {
        **product_view(r, full=True),
        "price_stats": {
            "min": ref["min"], "max": ref["max"], "count": ref["n"],
            "median": int(statistics.median(valid)) if valid else None,
            "freshest_days": min(ages) if ages else None,
            "fair_range": _fair_range(valid),
        },
        "offers": cards,
        "category_shops": category_only_shops([p["category"]], ctx, exclude={o["shop_id"] for o in offers}) if p["category"] else None,
    }


def _fair_range(prices: list[int]) -> list[int] | None:
    if len(prices) < 3:
        return None
    qs = statistics.quantiles(sorted(prices), n=4)
    return [int(qs[0]), int(qs[2])]
