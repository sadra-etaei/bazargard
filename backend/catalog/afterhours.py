"""After-hours rescue: everything near you that is on Torob is closed.

We then (1) show the closest Torob listing that is open when you would arrive, and (2) look at the places
around *you* where shops of this category cluster, because a neighbourhood full of such shops is where an
unlisted, still-open shop is most likely to be. The second part is an estimate and is always labelled so.
"""
from collections import Counter, defaultdict

from . import db
from .geo import haversine_km
from .search import Context, all_shops, shop_view
from .textnorm import fa_digits, normalize, tokens

NEAR_KM = 2.0
FAR_KM = 15.0
HUB_KM = 1.5
CELL = 0.005  # ~550 m grid used to find dense pockets of shops
OPEN = ("open", "closing_soon")  # confirmed by registered hours
MAYBE = ("unknown", "open_no_hours")  # no usable hours: could be open


def _price_text(v: int | None) -> str:
    return f"{fa_digits(f'{v:,}')} تومان" if v else "قیمت نامشخص"


def analyze(pool: list[tuple[float, dict, list[dict]]], top_cats: list[str], ctx: Context, keywords: str = "") -> dict | None:
    """pool: [(relevance, product_row, offer_cards ignoring radius and open filters)]."""
    if ctx.lat is None or not pool:
        return None
    near_km = min(ctx.radius_km, NEAR_KM) if ctx.radius_km else NEAR_KM
    pool = sorted(pool, key=lambda x: -x[0])[:25]
    # the categories of the best matches say what kind of shop to look for ("شارژر" → charger shops, not phone shops)
    top_cats = _shop_categories(keywords) or top_cats
    cards = [(p, c) for _, p, cs in pool for c in cs if c["shop"]["distance_km"] is not None]
    near = [(p, c) for p, c in cards if c["shop"]["distance_km"] <= near_km]
    if any(c["shop"]["status"]["state"] in OPEN for _, c in near):
        return None  # something close is open: the normal results already answer the need

    far = [(p, c) for p, c in cards if near_km < c["shop"]["distance_km"] <= FAR_KM and c["shop"]["status"]["state"] in OPEN]
    far.sort(key=lambda x: (x[1]["shop"]["distance_km"], x[1]["price"] or 10**15))
    seen, open_far = set(), []
    for p, c in far:
        if c["shop"]["shop_id"] in seen:
            continue
        seen.add(c["shop"]["shop_id"])
        open_far.append({"product": {"product_id": p["product_id"], "title": p["title"], "image": (db.loads(p["images"], []) or [None])[0]},
                         "offer": c})
        if len(open_far) == 3:
            break

    closed_near, seen = [], set()
    for p, c in sorted(near, key=lambda x: x[1]["shop"]["distance_km"]):
        if c["shop"]["shop_id"] in seen:
            continue
        seen.add(c["shop"]["shop_id"])
        closed_near.append({"shop": c["shop"], "price": c["price"], "product_title": p["title"]})
    listed_ids = {c["shop"]["shop_id"] for _, c in cards}

    hub = _find_hub(top_cats, listed_ids, ctx)
    if not (open_far or hub or closed_near):
        return None

    t = fa_digits(ctx.visit_at.strftime("%H:%M"))
    parts = [f"ساعت {t} است و "
             + (f"{fa_digits(len(closed_near))} فروشنده نزدیک (تا {fa_digits(round(near_km, 1))} کیلومتر) که این کالا را در ترب دارند هنگام رسیدن شما بسته‌اند."
                if closed_near else "فروشنده بازی در نزدیکی شما در ترب ثبت نشده.")]
    if open_far:
        f = open_far[0]["offer"]
        parts.append(f"نزدیک‌ترین گزینه باز در ترب «{f['shop']['name']}» است، {fa_digits(round(f['shop']['distance_km'], 1))} کیلومتر آن‌طرف‌تر "
                     f"(حدود {fa_digits(f['shop']['travel_min'] or 0)} دقیقه راه) با قیمت ثبت‌شده {_price_text(f['price'])}.")
    if hub:
        parts.append(f"ولی به نظر می‌رسد شما نزدیک «{hub['name']}» هستید ({fa_digits(round(hub['distance_km'] * 1000 / 50) * 50)} متر تا مرکز آن)؛ "
                     f"{fa_digits(hub['matching'])} فروشگاه هم‌دسته در آن حوالی هست؛ "
                     + (f"{fa_digits(hub['open_count'])} تایشان طبق ساعت ثبت‌شده باز است" + (f" و ساعت {fa_digits(hub['unknown_count'])} تای دیگر نامشخص است" if hub["unknown_count"] else "")
                        if hub["open_count"] else f"ساعت کاری {fa_digits(hub['unknown_count'])} تایشان ثبت نشده و ممکن است هنوز باز باشند")
                     + ". شاید کسی همین کالا را داشته باشد و در ترب ثبتش نکرده باشد — تأییدشده نیست، قبل از رفتن بپرسید.")
    return {
        "visit_label": t,
        "near_km": near_km,
        "message": " ".join(parts),
        "closed_near": closed_near[:4],
        "closed_near_count": len(closed_near),
        "open_far": open_far,
        "hub": hub,
        "me": {"lat": ctx.lat, "lon": ctx.lon},
    }


def _shop_categories(keywords: str, limit: int = 3) -> list[str]:
    """Shop activity categories that match the product the user typed (all words in the title, most common first)."""
    words = [w for w in tokens(keywords) if len(w) > 1][:3]
    if not words:
        return []
    like = " AND ".join("title LIKE ?" for _ in words)
    rows = db.q(f"SELECT category, COUNT(*) n FROM products WHERE {like} AND category IS NOT NULL GROUP BY category ORDER BY n DESC LIMIT 12",
                [f"%{w}%" for w in words])
    cats = [r["category"] for r in rows]
    if not cats:
        return []
    ph = ",".join("?" * len(cats))
    have = {r[0] for r in db.q(f"SELECT DISTINCT category FROM shop_categories WHERE category IN ({ph})", cats)}
    return [c for c in cats if c in have][:limit]


def _find_hub(top_cats: list[str], listed_ids: set[str], ctx: Context) -> dict | None:
    """The densest pocket of shops in this product's categories around the user, with who is likely open."""
    if not top_cats:
        return None
    ph = ",".join("?" * len(top_cats))
    ids = {r[0] for r in db.q(f"SELECT DISTINCT shop_id FROM shop_categories WHERE category IN ({ph})", top_cats)} | listed_ids
    shops = all_shops()
    cells = defaultdict(list)
    for sid in ids:
        s = shops.get(sid)
        if not s or s["lat"] is None:
            continue
        d = haversine_km(ctx.lat, ctx.lon, s["lat"], s["lon"])
        if d != d or d > HUB_KM + 0.6:
            continue
        cells[(round(s["lat"] / CELL), round(s["lon"] / CELL))].append(sid)

    best, best_score = None, 0.0
    for members in cells.values():
        views = [shop_view(shops[i], ctx) for i in members]
        opens = [v for v in views if v["status"]["state"] in OPEN]
        unknown = [v for v in views if v["status"]["state"] in MAYBE]
        if len(views) < 2 or not (opens or unknown):
            continue
        clat = sum(v["lat"] for v in views) / len(views)
        clon = sum(v["lon"] for v in views) / len(views)
        dist = haversine_km(ctx.lat, ctx.lon, clat, clon)
        if dist > HUB_KM:
            continue
        score = len(opens) + 0.35 * len(unknown) - 0.8 * dist
        if score > best_score:
            best_score, best = score, (views, opens, unknown, clat, clon, dist)
    if not best:
        return None
    views, opens, unknown, clat, clon, dist = best
    label = Counter(v["area"] for v in views if v["area"]).most_common(1)
    mall = Counter(v["mall"] for v in views if v["mall"]).most_common(1)
    name = label[0][0] if label else "این محدوده"
    if mall and mall[0][1] >= 3:
        name = f"{name} ({mall[0][0]})"
    likely = sorted(opens + unknown, key=lambda v: (v["status"]["state"] not in OPEN, v["distance_km"] or 99))
    radius_m = max(150, int(max(haversine_km(clat, clon, v["lat"], v["lon"]) for v in views) * 1000) + 40)
    keep = ("shop_id", "name", "lat", "lon", "distance_km", "status", "mall", "floor_label", "unit", "phone", "nav")
    return {
        "name": name, "lat": clat, "lon": clon, "distance_km": round(dist, 2), "radius_m": min(radius_m, 700),
        "matching": len(views), "open_count": len(opens), "unknown_count": len(unknown),
        "listed_count": sum(1 for v in views if v["shop_id"] in listed_ids),
        "categories": top_cats[:3],
        "shops": [{**{k: v[k] for k in keep}, "on_torob": v["shop_id"] in listed_ids} for v in likely[:8]],
        "note": "برآورد بر پایه ساعت کاری ثبت‌شده و دسته فعالیت فروشگاه‌هاست؛ موجودی این کالا تأیید نشده.",
    }
