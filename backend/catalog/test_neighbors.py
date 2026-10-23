from unittest.mock import patch

from django.test import SimpleTestCase

from .neighbors import neighboring_shops


def store(shop_id, floor="اول", unit="10", mall="mall"):
    return {"shop_id": shop_id, "name": shop_id, "floor": floor, "unit": unit, "mall_key": mall}


class NeighborTests(SimpleTestCase):
    def test_same_floor_and_closest_numeric_units_first(self):
        target = store("target", unit="۱۰")
        shops = [target, store("far", unit="30"), store("near", floor="۱", unit="١١"),
                 store("upstairs", floor="دوم", unit="10"), store("elsewhere", mall="other")]
        rows = neighboring_shops(target, shops)
        self.assertEqual([s["shop_id"] for s in rows], ["near", "far", "upstairs"])
        self.assertTrue(rows[0]["same_floor"])
        self.assertFalse(rows[-1]["same_floor"])

    def test_unknown_floors_are_not_claimed_to_be_same_floor(self):
        rows = neighboring_shops(store("target", floor=None), [store("unknown", floor=None)])
        self.assertFalse(rows[0]["same_floor"])

    def test_missing_and_complex_units_and_limit(self):
        rows = neighboring_shops(store("target"), [store("complex", unit="12-A"),
                                 store("missing", floor=None, unit=None), store("numeric", unit="11")], limit=2)
        self.assertEqual([s["shop_id"] for s in rows], ["numeric", "complex"])

    def test_standalone_store_and_empty_mall(self):
        self.assertEqual(neighboring_shops(store("target", mall=None), [store("other", mall=None)]), [])
        self.assertEqual(neighboring_shops(store("target"), [store("target")]), [])

    @patch("catalog.api.all_shops")
    def test_endpoint(self, all_shops):
        all_shops.return_value = {s["shop_id"]: s for s in [store("target"), store("near", unit="11")]}
        response = self.client.get("/api/shops/target/neighbors")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["shops"][0]["name"], "near")
        self.assertEqual(self.client.get("/api/shops/missing/neighbors").status_code, 404)
