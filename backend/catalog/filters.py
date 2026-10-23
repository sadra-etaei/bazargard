"""The single filter state shared by the search screen and the assistant chat.

{q, category, brand, mall, budget_min, budget_max, area, lat, lon, radius, open, visit_at, visit_label,
 installments, torobpay, warranty, fast, priority, mode}
"""
from datetime import datetime

from .hours import TEHRAN
from .query_parser import ParsedQuery
from .search import Context
from .textnorm import fa_digits

BOOL_KEYS = ("open", "installments", "torobpay", "warranty", "fast")


def to_context(f: dict, device_id: str | None = None) -> Context:
    visit = datetime.now(TEHRAN)
    if f.get("visit_at"):
        try:
            visit = datetime.fromisoformat(f["visit_at"])
            if visit.tzinfo is None:
                visit = visit.replace(tzinfo=TEHRAN)
        except ValueError:
            pass
    return Context(
        lat=_num(f.get("lat")), lon=_num(f.get("lon")), radius_km=_num(f.get("radius")),
        visit_at=visit, budget_min=_int(f.get("budget_min")), budget_max=_int(f.get("budget_max")),
        open_at_visit=bool(f.get("open")), installments=bool(f.get("installments")), torobpay=bool(f.get("torobpay")),
        warranty=bool(f.get("warranty")), fast_delivery=bool(f.get("fast")), include_unknown=bool(f.get("include_unknown")), category=f.get("category") or None,
        brand=f.get("brand") or None, mall_key=f.get("mall") or None, priority=f.get("priority") or "balanced",
        travel_mode=f.get("mode") or "taxi", sort=f.get("sort") or "relevance", device_id=device_id,
    )


def apply_parsed(f: dict, p: ParsedQuery, *, new_search: bool) -> dict:
    """Merge what we understood from a sentence into the current filters."""
    out = dict(f)
    if new_search:
        for k in ("category", "brand"):
            out[k] = None
        out["q"] = p.keywords
    if p.budget_min is not None or p.budget_max is not None:
        out["budget_min"], out["budget_max"] = p.budget_min, p.budget_max
    if p.lat is not None:
        out.update(area=p.area, lat=p.lat, lon=p.lon, radius=out.get("radius") or 3)
    if p.visit_at:
        out.update(visit_at=p.visit_at, visit_label=p.visit_label)
    if p.open_at_visit:
        out["open"] = True
    for attr, key in (("installments", "installments"), ("torobpay", "torobpay"), ("warranty", "warranty"),
                      ("fast_delivery", "fast")):
        if getattr(p, attr):
            out[key] = True
    if p.priority:
        out["priority"] = p.priority
    return out


def chips(f: dict) -> list[dict]:
    """Human-readable, removable filter chips."""
    c = []
    if f.get("category"):
        c.append({"key": "category", "label": f["category"]})
    if f.get("brand"):
        c.append({"key": "brand", "label": f"برند {f['brand']}"})
    if f.get("budget_max") and f.get("budget_min"):
        c.append({"key": "budget", "label": f"{_short(f['budget_min'])} تا {_short(f['budget_max'])}"})
    elif f.get("budget_max"):
        c.append({"key": "budget", "label": f"زیر {_short(f['budget_max'])}"})
    elif f.get("budget_min"):
        c.append({"key": "budget", "label": f"بالای {_short(f['budget_min'])}"})
    if f.get("lat") is not None:
        label = f.get("area") or "موقعیت من"
        radius = f.get("radius")
        if radius:
            radius = int(radius) if float(radius).is_integer() else round(float(radius), 1)
        c.append({"key": "area", "label": label + (f" · {fa_digits(radius)} کیلومتر" if radius else "")})
    if f.get("open"):
        c.append({"key": "open", "label": f"باز در {f.get('visit_label') or 'زمان مراجعه'}"})
    elif f.get("visit_label"):
        c.append({"key": "visit", "label": f.get("visit_label")})
    for key, label in (("installments", "قسطی"), ("torobpay", "ترب‌پی"), ("warranty", "گارانتی‌دار"), ("fast", "ارسال فوری")):
        if f.get(key):
            c.append({"key": key, "label": label})
    if f.get("sort") and f["sort"] != "relevance":
        c.append({"key": "sort", "label": {"price_asc": "ارزان‌ترین", "price_desc": "گران‌ترین", "near": "نزدیک‌ترین"}.get(f["sort"], f["sort"])})
    if f.get("mall"):
        c.append({"key": "mall", "label": "فقط همین پاساژ"})
    if f.get("priority") and f["priority"] != "balanced":
        c.append({"key": "priority", "label": {"price": "اولویت: قیمت", "near": "اولویت: نزدیکی", "reliable": "اولویت: اطمینان"}[f["priority"]]})
    return c


def _short(v: int) -> str:
    if v >= 1_000_000:
        n = v / 1_000_000
        return f"{fa_digits(int(n) if n == int(n) else round(n, 1))} میلیون"
    if v >= 1000:
        return f"{fa_digits(v // 1000)} هزار"
    return fa_digits(v)


def _num(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _int(v):
    n = _num(v)
    return int(n) if n is not None else None
