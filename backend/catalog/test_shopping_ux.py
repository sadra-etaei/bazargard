import json
import sqlite3
from datetime import datetime
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase

from .hours import TEHRAN
from .models import StockReport, VisitItem
from .planner import plan_trip
from .search import Context, passes


def offer(**changes):
    value = {"price": 1000, "stock": {"state": "unconfirmed"}, "warranty": None,
             "shop": {"distance_km": 1, "status": {"state": "unknown"}, "mall_key": "mall", "fast_delivery": None,
                      "payments": {"torobpay": "unknown_channel", "installments": [{"provider": "test", "in_person": False}]}}}
    value.update(changes)
    return value


class ConditionTests(SimpleTestCase):
    def test_unknown_channel_does_not_confirm_in_person_payment(self):
        self.assertFalse(passes(offer(), Context(torobpay=True))["conditions"])
        self.assertFalse(passes(offer(), Context(installments=True))["conditions"])
        self.assertTrue(passes(offer(), Context(installments=True, include_unknown=True))["conditions"])

    def test_explicit_rejection_is_not_relaxed(self):
        self.assertFalse(passes(offer(warranty={"has": False}), Context(warranty=True, include_unknown=True))["conditions"])
        value = offer()
        value["shop"]["fast_delivery"] = False
        self.assertFalse(passes(value, Context(fast_delivery=True, include_unknown=True))["conditions"])

    def test_unknown_hours_are_explicitly_opted_in(self):
        self.assertFalse(passes(offer(), Context(open_at_visit=True))["open"])
        self.assertTrue(passes(offer(), Context(open_at_visit=True, include_unknown=True))["open"])
        value = offer()
        value["shop"]["status"]["state"] = "closed"
        self.assertFalse(passes(value, Context(open_at_visit=True, include_unknown=True))["open"])


class RecoveryTests(TestCase):
    def setUp(self):
        self.old = VisitItem.objects.create(device_id="ux-test", shop_id="old", product_id="p", offer_id="old-offer")
        self.shops = patch("catalog.api.all_shops", return_value={"old": {"name": "Old"}, "new": {"name": "New"}})
        connection = sqlite3.connect(":memory:")
        connection.row_factory = sqlite3.Row
        connection.executescript("""
            CREATE TABLE products (pid INTEGER, product_id TEXT, title TEXT, images TEXT);
            CREATE TABLE offers (offer_id TEXT, shop_id TEXT, pid INTEGER, price INTEGER, seller_title TEXT);
            INSERT INTO products VALUES (1, 'p', 'Product', '[]');
            INSERT INTO offers VALUES ('valid', 'new', 1, 5000, 'Product');
            INSERT INTO offers VALUES ('old-offer', 'old', 1, 5000, 'Product');
        """)
        self.catalog = patch("catalog.api.db.one", side_effect=lambda sql, args: connection.execute(sql, args).fetchone())
        self.shops.start(); self.catalog.start()
        self.addCleanup(self.shops.stop); self.addCleanup(self.catalog.stop); self.addCleanup(connection.close)

    def post(self, suffix, payload, device="ux-test"):
        return self.client.post(f"/api/visits/{self.old.id}/{suffix}", data=json.dumps(payload), content_type="application/json", HTTP_X_DEVICE_ID=device)

    def test_replace_reuses_existing_stop_and_is_retry_safe(self):
        existing = VisitItem.objects.create(device_id="ux-test", shop_id="new", product_id="p", offer_id="valid")
        data = {"shop_id": "new", "product_id": "p", "offer_id": "valid"}
        self.assertEqual(self.post("replace", data).json()["id"], existing.id)
        self.assertEqual(self.post("replace", data).status_code, 200)
        self.old.refresh_from_db()
        self.assertEqual(self.old.state, "skipped")
        self.assertEqual(VisitItem.objects.filter(device_id="ux-test", state="planned").count(), 1)

    def test_invalid_offer_preserves_original_route(self):
        response = self.post("replace", {"shop_id": "new", "product_id": "p", "offer_id": "wrong"})
        self.assertEqual(response.status_code, 400)
        self.old.refresh_from_db()
        self.assertEqual(self.old.state, "planned")
        self.assertEqual(VisitItem.objects.count(), 1)

    def test_different_product_cannot_silently_replace(self):
        self.assertEqual(self.post("replace", {"shop_id": "new", "product_id": "different", "offer_id": "valid"}).status_code, 400)
        self.old.refresh_from_db()
        self.assertEqual(self.old.state, "planned")

    def test_other_device_cannot_replace_or_complete(self):
        self.assertEqual(self.post("replace", {"shop_id": "new", "product_id": "p", "offer_id": "valid"}, "another").status_code, 404)
        self.assertEqual(self.post("complete", {"state": "bought"}, "another").status_code, 404)

    def test_purchase_completion_records_evidence_once(self):
        data = {"state": "bought", "paid_price": 5000}
        self.assertEqual(self.post("complete", data).status_code, 200)
        self.assertEqual(self.post("complete", data).status_code, 200)
        self.assertEqual(StockReport.objects.count(), 1)
        self.old.refresh_from_db()
        self.assertEqual(self.old.paid_price, 5000)

    def test_failed_report_rolls_back_purchase(self):
        with patch("catalog.api.StockReport.objects.create", side_effect=RuntimeError("write failed")):
            with self.assertRaises(RuntimeError):
                self.post("complete", {"state": "bought"})
        self.old.refresh_from_db()
        self.assertEqual(self.old.state, "planned")

    def test_rebuy_creates_new_visit_without_changing_history(self):
        self.old.state = "bought"; self.old.save()
        response = self.client.post("/api/visits", data=json.dumps({"shop_id": "old", "product_id": "p"}), content_type="application/json", HTTP_X_DEVICE_ID="ux-test")
        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(response.json()["id"], self.old.id)
        self.old.refresh_from_db()
        self.assertEqual(self.old.state, "bought")


class PlannerTests(SimpleTestCase):
    def shops(self):
        return {key: {"shop_id": key, "name": key, "mall_key": "mall", "floor_rank": 0, "floor_label": "همکف", "unit": "10",
                      "lat": 35.7, "lon": 51.4, "hours": {}} for key in ("a", "b")}

    def test_multiple_items_share_one_store_stop(self):
        shops = self.shops()
        items = [{"visit_id": 1, "shop_id": "a"}, {"visit_id": 2, "shop_id": "b"}, {"visit_id": 3, "shop_id": "a"}]
        with patch("catalog.planner.all_shops", return_value=shops), patch("catalog.planner.shop_view", side_effect=lambda s, ctx: s), patch("catalog.planner.status_at", return_value={"state": "open"}):
            plan = plan_trip(items, Context())
        self.assertEqual([leg["shop_id"] for leg in plan["legs"]], ["a", "a", "b"])
        self.assertEqual(plan["stop_count"], 2)
        self.assertEqual(plan["total_min"], 34)
        self.assertEqual(plan["legs"][1]["travel_min"], 0)

    def test_active_destination_stays_first(self):
        shops = self.shops()
        with patch("catalog.planner.all_shops", return_value=shops), patch("catalog.planner.shop_view", side_effect=lambda s, ctx: s), patch("catalog.planner.status_at", return_value={"state": "closed"}):
            plan = plan_trip([{"visit_id": 1, "shop_id": "a"}, {"visit_id": 2, "shop_id": "b"}], Context(), start_visit_id=2)
        self.assertEqual(plan["legs"][0]["visit_id"], 2)

    def test_closing_buffer_includes_time_for_purchase(self):
        shops = self.shops()
        visit = datetime(2026, 10, 23, 17, 0, tzinfo=TEHRAN)
        def status(hours, at):
            return {"state": "open" if at.minute < 20 else "closed"}
        with patch("catalog.planner.all_shops", return_value=shops), patch("catalog.planner.shop_view", side_effect=lambda s, ctx: s), patch("catalog.planner.status_at", side_effect=status):
            plan = plan_trip([{"visit_id": 1, "shop_id": "a"}], Context(visit_at=visit))
        self.assertTrue(plan["legs"][0]["closing_risk"])
        self.assertTrue(plan["warnings"])


class AlternativeTests(SimpleTestCase):
    def test_known_iphone_part_mismatch_is_rejected(self):
        from .alternatives import compatible_candidate
        base = {"title": "تاچ و ال سی دی آیفون 11", "category": "تاچ و ال سی دی گوشی و تبلت"}
        self.assertFalse(compatible_candidate(base, {"title": "ال سی دی iPhone 11 Pro"}))
        self.assertFalse(compatible_candidate(base, {"title": "LCD iPhone XS"}))
        self.assertTrue(compatible_candidate(base, {"title": "LCD iPhone 11 GX"}))

    def test_conflicting_electrical_specification_is_rejected(self):
        from .alternatives import compatible_candidate
        base = {"title": "فیوز", "category": "کلید و فیوز مینیاتوری", "specs": '[{"key":"جریان نامی","value":"16A"}]'}
        candidate = {"title": "فیوز", "specs": '[{"key":"جریان نامی","value":"32A"}]'}
        self.assertFalse(compatible_candidate(base, candidate))

    @patch("catalog.alternatives.shop_view", return_value={"distance_km": 1})
    def test_same_mall_priority_depends_on_shopper_being_there(self, shop_view):
        from .alternatives import _best_next
        def option(shop_id):
            return {"price": 1000, "shop": {"shop_id": shop_id, "distance_km": 1}}
        nearby, mall = option("nearby"), option("mall")
        detail = {"offers": [], "price_stats": {"median": 1000}}
        home = _best_next(detail, {}, None, [mall], [nearby, mall], [], Context(), False)
        there = _best_next(detail, {}, None, [mall], [nearby, mall], [], Context(), True)
        self.assertEqual(home["offer"]["shop"]["shop_id"], "nearby")
        self.assertEqual(there["offer"]["shop"]["shop_id"], "mall")


class InquiryMessageTests(SimpleTestCase):
    def test_automatic_message_preserves_exact_model_and_conditions(self):
        from .inquiries import compose
        item = "دوربین با مشخصات و نام مدل دقیق بسیار طولانی ABC-1234"
        message = compose(item, "https://example.test/reply", "فردا", ["ترب‌پی حضوری", "اقساط حضوری"])
        self.assertIn(item, message)
        self.assertIn("ترب‌پی حضوری", message)
        self.assertIn("اقساط حضوری", message)
        self.assertIn("گارانتی", message)
