"""Mall landmarks ranked using recorded floors and units, not an indoor map."""
import re

from .geo import floor_label, floor_rank
from .textnorm import normalize


def _unit_number(unit):
    value = normalize(unit or "")
    return int(value) if re.fullmatch(r"[0-9]+", value) else None


def neighboring_shops(shop, shops, limit=6):
    if not shop.get("mall_key"):
        return []
    target_floor = floor_rank(shop.get("floor"))
    target_unit = _unit_number(shop.get("unit"))
    rows = []
    for other in shops:
        if other["shop_id"] == shop["shop_id"] or other.get("mall_key") != shop["mall_key"]:
            continue
        rank = floor_rank(other.get("floor"))
        same_floor = target_floor is not None and rank == target_floor
        unit = _unit_number(other.get("unit"))
        unit_gap = abs(unit - target_unit) if same_floor and unit is not None and target_unit is not None else None
        row = {"shop_id": other["shop_id"], "name": other["name"],
               "floor_label": floor_label(other.get("floor")) or other.get("floor"),
               "unit": other.get("unit"), "same_floor": same_floor}
        # Same floor first; numeric units are only a rough ordering within it.
        order = (not same_floor, rank is None,
                 abs(rank - target_floor) if rank is not None and target_floor is not None else 0,
                 unit_gap is None, unit_gap or 0, normalize(other["name"]), other["shop_id"])
        rows.append((order, row))
    rows.sort(key=lambda item: item[0])
    return [row for _, row in rows[:limit]]
