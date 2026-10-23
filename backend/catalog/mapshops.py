"""Bounded store-map queries over the local catalog."""
import math

from .textnorm import normalize


def stores_in_bounds(shops, south, west, north, east, term="", limit=250):
    bounds = (south, west, north, east)
    if not all(math.isfinite(value) for value in bounds) or not (-90 <= south < north <= 90 and -180 <= west < east <= 180):
        raise ValueError("محدوده نقشه معتبر نیست")
    term = normalize(term[:100])
    lat, lon = (south + north) / 2, (west + east) / 2
    result = []
    for shop in shops:
        y, x = shop.get("lat"), shop.get("lon")
        if y is None or x is None or not math.isfinite(y) or not math.isfinite(x):
            continue
        if not (south <= y <= north and west <= x <= east):
            continue
        searchable = " ".join(str(shop.get(key) or "") for key in ("name", "address", "mall"))
        if term and term not in normalize(searchable):
            continue
        result.append(shop)
    result.sort(key=lambda shop: ((shop["lat"] - lat) ** 2 + ((shop["lon"] - lon) * math.cos(math.radians(lat))) ** 2, shop["shop_id"]))
    return result[:limit], len(result)
