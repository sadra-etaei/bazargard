from django.test import SimpleTestCase
from .filters import apply_parsed, to_context
from .query_parser import ParsedQuery

class ShoppingContextTests(SimpleTestCase):
    def setUp(self):
        self.filters = {"q": "phone", "budget_min": 100, "budget_max": 500, "mall": "mall", "lat": 35.7, "lon": 51.4, "radius": 3, "visit_at": "2026-10-24T14:00:00+03:30", "installments": True, "category": "phones", "brand": "Apple"}

    def test_new_product_preserves_shopping_requirements(self):
        result = apply_parsed(self.filters, ParsedQuery(keywords="charger"), new_search=True)
        for key in ("budget_min", "budget_max", "mall", "lat", "lon", "radius", "visit_at", "installments"):
            self.assertEqual(result[key], self.filters[key])
        self.assertEqual(result["q"], "charger")
        self.assertIsNone(result["category"])
        self.assertIsNone(result["brand"])
        self.assertEqual(self.filters["brand"], "Apple")

    def test_explicit_budget_replaces_old_range(self):
        result = apply_parsed(self.filters, ParsedQuery(budget_max=300), new_search=False)
        self.assertEqual(result["budget_max"], 300)
        self.assertIsNone(result["budget_min"])
        self.assertEqual(result["q"], "phone")

    def test_cleared_conditions_do_not_reappear(self):
        result = apply_parsed({**self.filters, "budget_max": None, "installments": False}, ParsedQuery(), new_search=False)
        ctx = to_context(result)
        self.assertIsNone(ctx.budget_max)
        self.assertFalse(ctx.installments)
        self.assertEqual(ctx.lat, 35.7)

    def test_alternatives_return_updated_requirements(self):
        from unittest.mock import patch
        from .assistant import handle
        alternative = {"same_product": [], "similar": [], "same_mall": [], "best_next": None}
        with patch("catalog.assistant.llm.enabled", return_value=False), patch("catalog.assistant.parse", return_value=ParsedQuery(intent="alternatives", budget_max=300)), patch("catalog.assistant.alternatives", return_value=alternative) as find:
            reply = handle("جایگزین زیر ۳۰۰", {"product_id": "p", "filters": self.filters}, "test-device")
        self.assertEqual(reply["filters"]["budget_max"], 300)
        self.assertEqual(reply["state"]["filters"]["budget_max"], 300)
        self.assertEqual(find.call_args.args[1].budget_max, 300)
        self.assertEqual(find.call_args.args[1].lat, 35.7)

    def test_literal_budget_and_location_override_relative_model_hints(self):
        from unittest.mock import patch
        from .assistant import handle
        parsed = ParsedQuery(intent="refine", keywords="charger", budget_max=2000000, lat=35.696, lon=51.408, area="جمهوری", refine=["cheaper", "closer"])
        empty = {"total": 0, "relax": [], "notices": ["No result"]}
        state = {"best_price": 1544100, "filters": {"q": "charger", "radius": 3, "budget_max": 1000000}}
        with patch("catalog.assistant.llm.enabled", return_value=False), patch("catalog.assistant.parse", return_value=parsed), patch("catalog.assistant.search", return_value=empty) as find:
            result = handle("شارژر زیر ۲ میلیون نزدیک جمهوری", state, "test")
        self.assertEqual(result["filters"]["budget_max"], 2000000)
        self.assertEqual(result["filters"]["radius"], 3)
        self.assertEqual(find.call_args.args[1].budget_max, 2000000)

    def test_relative_followup_still_can_reduce_price_and_radius(self):
        from unittest.mock import patch
        from .assistant import handle
        parsed = ParsedQuery(intent="refine", refine=["cheaper", "closer"])
        state = {"best_price": 1000000, "filters": {"q": "charger", "radius": 4}}
        with patch("catalog.assistant.llm.enabled", return_value=False), patch("catalog.assistant.parse", return_value=parsed), patch("catalog.assistant.search", return_value={"total": 0, "relax": [], "notices": ["No result"]}):
            result = handle("ارزون‌تر و نزدیک‌تر", state, "test")
        self.assertEqual(result["filters"]["budget_max"], 950000)
        self.assertEqual(result["filters"]["radius"], 2)
