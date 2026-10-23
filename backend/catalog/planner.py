"""Visit planning: order stops, check opening hours on arrival, and cover a multi-item list in few places."""
from collections import defaultdict
from datetime import timedelta

from . import db
from .geo import floor_label, haversine_km, travel_minutes
from .hours import status_at
from .search import Context, all_shops, passes, product_view, recent_reports, score_offer, shop_view
from .textnorm import fa_digits

DWELL_MIN = 15
SAME_MALL_WALK_MIN = 4


def _order(stops: list[dict], start: tuple | None) -> list[dict]:
    """Nearest-neighbour ordering; shops in the same mall are always visited back to back."""
    groups = defaultdict(list)
    for s in stops:
        groups[s["shop"]["mall_key"] or s["shop"]["shop_id"]].append(s)
    clusters = list(groups.values())
    ordered = []
    pos = start or (clusters[0][0]["shop"]["lat"], clusters[0][0]["shop"]["lon"])
    for c in clusters:  # inside one mall: lowest floor first, so you climb once and never backtrack
        c.sort(key=lambda s: (s["shop"].get("floor_rank") is None, s["shop"].get("floor_rank") or 0, s["shop"].get("unit") or "", s["shop"]["shop_id"]))
    while clusters:
        clusters.sort(key=lambda c: haversine_km(pos[0], pos[1], c[0]["shop"]["lat"], c[0]["shop"]["lon"]))
        nxt = clusters.pop(0)
        ordered.extend(nxt)
        pos = (nxt[-1]["shop"]["lat"], nxt[-1]["shop"]["lon"])
    return ordered


def _timeline(ordered: list[dict], ctx: Context) -> list[dict]:
    t = ctx.visit_at
    pos = (ctx.lat, ctx.lon) if ctx.lat is not None else None
    prev_mall = None
    legs = []
    for index, s in enumerate(ordered):
        sh = s["shop"]
        same_store = bool(legs and legs[-1]["shop"]["shop_id"] == sh["shop_id"])
        if pos is None:
            km, mins = 0.0, 0
        elif same_store:
            km, mins = 0.0, 0
        elif prev_mall and sh["mall_key"] == prev_mall:
            km, mins = 0.0, SAME_MALL_WALK_MIN
        else:
            km = haversine_km(pos[0], pos[1], sh["lat"], sh["lon"])
            mins = travel_minutes(km, ctx.travel_mode)
        arrive = t + timedelta(minutes=mins)
        status = status_at(all_shops()[sh["shop_id"]]["hours"], arrive)
        prev_leg = legs[-1]["shop"] if legs else None
        floor_move = None
        if prev_mall and sh["mall_key"] == prev_mall and prev_leg and prev_leg.get("floor_label") != sh.get("floor_label")                 and sh.get("floor_label"):
            floor_move = f"بروید {sh['floor_label']}" + (f" (واحد {fa_digits(sh['unit'])})" if sh.get("unit") else "")
        legs.append({**s, "floor_move": floor_move, "travel_km": round(km, 2), "travel_min": mins, "arrive_at": arrive.isoformat(),
                     "arrive_label": arrive.strftime("%H:%M"), "status_on_arrival": status,
                     "same_mall_as_previous": bool(prev_mall and sh["mall_key"] == prev_mall), "same_store_as_previous": same_store,
                     "travel_known": pos is not None,
                     "travel_min_range": [max(0, round(mins * 0.8)), round(mins * 1.3)] if pos is not None else None,
                     "closing_risk": status["state"] in ("open", "closing_soon") and status_at(all_shops()[sh["shop_id"]]["hours"], arrive + timedelta(minutes=DWELL_MIN + 10))["state"] == "closed"})
        next_same_store = index + 1 < len(ordered) and ordered[index + 1]["shop"]["shop_id"] == sh["shop_id"]
        t = arrive + timedelta(minutes=0 if next_same_store else DWELL_MIN)
        pos = (sh["lat"], sh["lon"])
        prev_mall = sh["mall_key"]
    return legs


def plan_trip(items: list[dict], ctx: Context, start_visit_id: int | None = None) -> dict:
    """items: [{shop_id, product_id?, offer_id?, title?}] → ordered legs with arrival-time checks."""
    shops = all_shops()
    stops = []
    for it in items:
        s = shops.get(it["shop_id"])
        if not s:
            continue
        stops.append({**it, "shop": shop_view(s, ctx)})
    if not stops:
        return {"legs": [], "warnings": [], "total_min": 0}
    start = (ctx.lat, ctx.lon) if ctx.lat is not None else None
    ordered = _order(stops, start)
    pinned = next((s for s in ordered if s.get("visit_id") == start_visit_id), None)
    if pinned:
        # All items at the pinned shop remain consecutive.
        ordered = [s for s in ordered if s["shop"]["shop_id"] == pinned["shop"]["shop_id"]] + [s for s in ordered if s["shop"]["shop_id"] != pinned["shop"]["shop_id"]]
        ordered.remove(pinned)
        ordered.insert(0, pinned)
    legs = _timeline(ordered, ctx)

    # If a stop is closed on arrival but opens later the same day, try visiting it last.
    closed = [l for l in legs if l["status_on_arrival"]["state"] == "closed"]
    if closed and len(legs) > 1 and not pinned:
        reordered = [l for l in legs if l not in closed] + closed
        alt = _timeline([{k: v for k, v in l.items() if k not in ("travel_km", "travel_min", "arrive_at", "arrive_label",
                                                                   "status_on_arrival", "same_mall_as_previous", "floor_move")}
                         for l in reordered], ctx)
        if sum(l["status_on_arrival"]["state"] == "closed" for l in alt) < len(closed):
            legs = alt

    warnings = []
    for i, l in enumerate(legs, 1):
        st = l["status_on_arrival"]
        if st["state"] == "closed":
            warnings.append(f"مقصد {fa_digits(i)} ({l['shop']['name']}) هنگام رسیدن بسته است"
                            + (f"؛ {st['next_open']} باز می‌شود" if st.get("next_open") else ""))
        elif st["state"] == "unknown":
            warnings.append(f"ساعت کاری مقصد {fa_digits(i)} ({l['shop']['name']}) نامشخص است؛ قبل از حرکت تماس بگیرید")
        elif st["state"] == "closing_soon":
            warnings.append(f"مقصد {fa_digits(i)} ({l['shop']['name']}) نزدیک بسته شدن است؛ اول آنجا بروید")
        if l.get("closing_risk"):
            warnings.append(f"مقصد {fa_digits(i)} ({l['shop']['name']}) برای خرید و تأخیر احتمالی زمان کمی دارد؛ زودتر مراجعه کنید یا از مسیر حذف کنید")
    stop_count = sum(not l.get("same_store_as_previous") for l in legs)
    total = sum(l["travel_min"] for l in legs) + DWELL_MIN * stop_count
    pts = ([f"{ctx.lat},{ctx.lon}"] if ctx.lat is not None else []) + [f"{l['shop']['lat']},{l['shop']['lon']}" for l in legs]
    malls = {l["shop"]["mall_key"] for l in legs if l["shop"]["mall_key"]}
    return {
        "legs": legs,
        "warnings": warnings,
        "total_min": total,
        "stop_count": stop_count,
        "total_min_range": [max(0, round(total * 0.8)), round(total * 1.3)],
        "assumptions": ("مبدأ مشخص نیست؛ زمان مسیر تا اولین فروشگاه در جمع لحاظ نشده است. " if start is None else "") + "زمان تقریبی است: فاصله مستقیم با ضریب مسیر، بدون ترافیک زنده؛ ۱۵ دقیقه خرید در هر فروشگاه و ۴ دقیقه جابه‌جایی داخل پاساژ.",
        "total_km": round(sum(l["travel_km"] for l in legs), 1),
        "places": len({l["shop"]["mall_key"] or l["shop"]["shop_id"] for l in legs}),
        "malls": len(malls),
        "end_at": (ctx.visit_at + timedelta(minutes=total)).strftime("%H:%M"),
        "route_url": "https://www.google.com/maps/dir/" + "/".join(pts) if len(pts) > 1 else None,
    }


def cover_items(product_ids: list[str], ctx: Context, max_plans: int = 3) -> dict:
    """Find the fewest places (a mall counts as one place) that together sell every item on the list."""
    shops = all_shops()
    products = {r["product_id"]: dict(r) for r in db.q(
        f"SELECT * FROM products WHERE product_id IN ({','.join('?' * len(product_ids))})", product_ids)} if product_ids else {}
    if not products:
        return {"plans": [], "items": []}
    pid_map = {p["pid"]: p for p in products.values()}
    offers = db.q(f"SELECT * FROM offers WHERE pid IN ({','.join('?' * len(pid_map))})", list(pid_map))
    reports = recent_reports({o["shop_id"] for o in offers}, set(products))

    by_place = defaultdict(lambda: defaultdict(list))  # place -> product_id -> [offer cards]
    place_name = {}
    for o in offers:
        s = shops.get(o["shop_id"])
        if not s:
            continue
        p = pid_map[o["pid"]]
        ref = {"min": p["min_price"], "max": p["max_price"], "n": p["offer_count"]}
        card = score_offer(o, p, shop_view(s, ctx), ctx, reports.get((o["shop_id"], p["product_id"])), ref)
        if not all(v for k, v in passes(card, ctx).items() if k != "budget"):
            continue
        place = s["mall_key"] or s["shop_id"]
        place_name[place] = s["mall"] or s["name"]
        by_place[place][p["product_id"]].append(card)

    def place_summary(place, wanted):
        picks = []
        for pid in wanted:
            cards = sorted(by_place[place].get(pid, []), key=lambda c: (c["price"] or 10**15, -c["score"]))
            if cards:
                picks.append({"product_id": pid, "title": products[pid]["title"], "offer": cards[0]})
        return picks

    all_ids = set(products)
    ranked = sorted(by_place, key=lambda pl: (-len(by_place[pl]), _place_dist(by_place[pl])))
    plans = []
    for first in ranked[:15]:
        covered = set(by_place[first])
        places = [first]
        while covered != all_ids:
            rest = all_ids - covered
            nxt = max((pl for pl in by_place if pl not in places), default=None,
                      key=lambda pl: (len(rest & set(by_place[pl])), -_place_dist(by_place[pl])))
            if nxt is None or not rest & set(by_place[nxt]):
                break
            places.append(nxt)
            covered |= set(by_place[nxt])
        picks, assigned = [], set()
        for pl in places:
            for pick in place_summary(pl, (all_ids & set(by_place[pl])) - assigned):
                picks.append({**pick, "place": place_name[pl]})
                assigned.add(pick["product_id"])
        key = tuple(sorted(places))
        if any(tuple(sorted(p["place_keys"])) == key for p in plans):
            continue
        order = {pl: i for i, pl in enumerate(places)}
        picks.sort(key=lambda pk: (order[next(k for k in places if place_name[k] == pk["place"])],
                                   pk["offer"]["shop"].get("floor_rank") is None, pk["offer"]["shop"].get("floor_rank") or 0))
        total = sum(pk["offer"]["price"] or 0 for pk in picks)
        trip = plan_trip([{"shop_id": pk["offer"]["shop"]["shop_id"]} for pk in picks], ctx)
        plans.append({
            "place_keys": places, "places": [place_name[p] for p in places], "covered": len(covered),
            "missing": [products[m]["title"] for m in all_ids - covered], "total_price": total, "picks": picks,
            "total_min": trip["total_min"], "total_km": trip.get("total_km"), "end_at": trip.get("end_at"),
            "order": [{"name": l["shop"]["name"], "mall": l["shop"]["mall"], "floor_label": l["shop"].get("floor_label"),
                       "unit": l["shop"].get("unit"), "arrive_label": l["arrive_label"],
                       "status": l["status_on_arrival"]["state"]} for l in trip["legs"]],
            "warnings": trip["warnings"],
            "summary": f"{fa_digits(len(covered))} از {fa_digits(len(all_ids))} قلم در {fa_digits(len(places))} مکان"
                       + (f" — مجموع حدود {fa_digits(f'{total:,}')} تومان" if total else ""),
        })
    plans.sort(key=lambda p: (-p["covered"], len(p["places"]), p["total_price"] or 10**15, p["total_min"]))
    plans = plans[:max_plans]
    full = [p for p in plans if not p["missing"]]
    if len(full) > 1:  # say what each full-coverage option is best at
        cheapest = min(full, key=lambda p: p["total_price"] or 10**15)
        fastest = min(full, key=lambda p: (p["total_min"], p["total_price"] or 10**15))
        for p in full:
            p["tags"] = (["ارزان‌ترین"] if p is cheapest else []) + (["سریع‌ترین"] if p is fastest else [])
            if p is not cheapest and cheapest["total_price"] and p["total_price"]:
                p["extra_vs_cheapest"] = p["total_price"] - cheapest["total_price"]
    return {"items": [product_view(p) for p in products.values()], "plans": plans}


def _place_dist(cards_by_pid: dict) -> float:
    d = [c["shop"]["distance_km"] for cards in cards_by_pid.values() for c in cards if c["shop"]["distance_km"] is not None]
    return min(d) if d else 999.0
