from unittest.mock import patch
from django.test import SimpleTestCase
from .mapshops import stores_in_bounds


def store(shop_id, lat=35.7, lon=51.4, name="فروشگاه", **extra):
    return {"shop_id": shop_id, "lat": lat, "lon": lon, "name": name, "mall": "پاساژ نمونه", "address": "واحد ۱۲", "offer_count": 0, **extra}


class StoreMapTests(SimpleTestCase):
    def test_bounds_include_edges_and_exclude_unknown_coordinates(self):
        shops = [store("edge", lat=35.6, lon=51.3), store("inside"), store("outside", lat=36), store("missing", lat=None)]
        result, total = stores_in_bounds(shops, 35.6, 51.3, 35.8, 51.5)
        self.assertEqual({s["shop_id"] for s in result}, {"edge", "inside"})
        self.assertEqual(total, 2)
        self.assertEqual(result[0]["offer_count"], 0)

    def test_persian_store_and_address_search(self):
        shops = [store("yes", name="فروشگاه کیان"), store("no", address="واحد ۲۰", mall="دیگر", name="آراد")]
        self.assertEqual(stores_in_bounds(shops, 35.6, 51.3, 35.8, 51.5, "كيان")[1], 1)
        self.assertEqual(stores_in_bounds(shops, 35.6, 51.3, 35.8, 51.5, "واحد 12")[1], 1)

    def test_limit_reports_total_without_mutating_coordinates(self):
        shops = [store(str(index)) for index in range(300)]
        result, total = stores_in_bounds(shops, 35.6, 51.3, 35.8, 51.5)
        self.assertEqual(len(result), 250)
        self.assertEqual(total, 300)
        self.assertTrue(all(s["lat"] == 35.7 and s["lon"] == 51.4 for s in result))

    def test_invalid_bounds_are_rejected(self):
        for bounds in [(36, 51, 35, 52), (35, 52, 36, 51), (float("nan"), 51, 36, 52), (35, -181, 36, 52)]:
            with self.subTest(bounds=bounds), self.assertRaises(ValueError):
                stores_in_bounds([], *bounds)

    @patch("catalog.api.shop_view", side_effect=lambda s, ctx: s)
    @patch("catalog.api.all_shops", return_value={"one": store("one")})
    def test_api_returns_store_records_and_validation_errors(self, shops, view):
        response = self.client.get("/api/map/shops", {"south": 35.6, "west": 51.3, "north": 35.8, "east": 51.5})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["shops"][0]["shop_id"], "one")
        self.assertFalse(response.json()["truncated"])
        self.assertEqual(self.client.get("/api/map/shops", {"south": 40, "north": 30}).status_code, 400)
