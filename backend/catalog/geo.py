import math
import re

from .textnorm import normalize


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    if None in (lat1, lon1, lat2, lon2):
        return float("nan")
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# Rough door-to-door speeds in Tehran traffic (km/h); distances are straight-line × 1.3.
SPEEDS = {"walk": 4.5, "metro": 18, "taxi": 16}


def travel_minutes(km: float, mode: str = "taxi") -> int:
    if math.isnan(km):
        return 0
    road = km * 1.3
    if road < 1.2:  # short hops are walked whatever the chosen mode
        mode = "walk"
    base = 0 if mode == "walk" else 6
    return int(round(base + road / SPEEDS.get(mode, 16) * 60)) if km > 0.05 else 1


_MALL_RE = re.compile(r"((?:پاساژ|مجتمع(?:\s+تجاری)?|مرکز\s+خرید|سرای|تیمچه|بازار|برج|ساختمان)\s+[^،,()]+)")
_FLOOR_RE = re.compile(r"طبقه\s*([^،,]+?)(?=\s*[،,]|\s+(?:واحد|پلاک|غرفه)|$)")
_UNIT_RE = re.compile(r"(?:واحد|غرفه)\s*([A-Za-z0-9۰-۹٠-٩\-/]+)")
_PLATE_RE = re.compile(r"پلاک\s*([A-Za-z0-9۰-۹٠-٩\-/]+)")


def parse_address(address: str | None) -> dict:
    """Pull mall / floor / unit out of a free-text Tehran address."""
    if not address:
        return {"mall": None, "floor": None, "unit": None}
    mall = _MALL_RE.search(address)
    floor = _FLOOR_RE.search(address)
    unit = _UNIT_RE.search(address) or _PLATE_RE.search(address)
    mall_name = mall.group(1).strip() if mall else None
    # A plain "ساختمان" is only a mall when a floor/unit is also given.
    if mall_name and mall_name.startswith("ساختمان") and not floor:
        mall_name = None
    return {
        "mall": mall_name,
        "floor": floor.group(1).strip() if floor else None,
        "unit": unit.group(1).strip() if unit else None,
    }


_ORDINALS = {"همکف": 0, "اول": 1, "دوم": 2, "سوم": 3, "چهارم": 4, "پنجم": 5, "ششم": 6, "هفتم": 7, "هشتم": 8, "نهم": 9, "دهم": 10}
_BASEMENT = ("زیرزمین", "زیر زمین", "زیرهمکف", "زیر همکف", "زیرین")


def floor_rank(floor: str | None) -> int | None:
    """Comparable floor number: همکف=0, اول/۱=1, زیرزمین/منفی یک/-۱ = -1. None when unknown."""
    if not floor:
        return None
    f = normalize(floor)
    if any(b in f for b in _BASEMENT):
        m = re.search(r"\d+", f)
        return -int(m.group()) if m else -1
    if f.startswith("منفی"):
        m = re.search(r"\d+", f)
        if m:
            return -int(m.group())
        return -(_ORDINALS.get(f.split()[-1], 1) or 1) if len(f.split()) > 1 else -1
    if re.fullmatch(r"-\s*\d+|\d+\s*-", f):
        return -int(re.search(r"\d+", f).group())
    if f in _ORDINALS:
        return _ORDINALS[f]
    m = re.fullmatch(r"\d+", f.strip())
    return int(m.group()) if m else None


def floor_label(floor: str | None) -> str | None:
    r = floor_rank(floor)
    if r is None:
        return None
    return "همکف" if r == 0 else f"زیرزمین {abs(r)}" if r < 0 else f"طبقه {r}"


def mall_key(mall: str | None) -> str | None:
    """Canonical key so "پاساژ علالدین 2" and "پاساژ علاءالدین ٢" group together."""
    if not mall:
        return None
    key = normalize(mall).replace("ء", "").replace("علا الدین", "علاالدین").replace("علالدین", "علاالدین")
    key = re.sub(r"^(پاساژ|مجتمع تجاری|مجتمع|مرکز خرید|سرای|تیمچه|بازار|برج|ساختمان)\s+", "", key)
    return key.strip() or None
