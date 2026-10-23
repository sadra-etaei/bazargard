"""Quick end-to-end check of parsing + search on the real catalog: python scripts/smoke.py"""
import os
import sys
import time

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django  # noqa: E402

django.setup()
from catalog import db  # noqa: E402
from catalog.filters import apply_parsed, to_context  # noqa: E402
from catalog.query_parser import parse  # noqa: E402
from catalog.search import search  # noqa: E402

QUERIES = sys.argv[1:] or [
    "هندزفری بلوتوث زیر ۲ میلیون نزدیک جمهوری که الان باز باشه",
    "دوربین مداربسته وای فای",
    "ال سی دی آیفون 11 با گارانتی",
    "کلید مینیاتوری اشنایدر فردا عصر",
    "گوشی سامسونگ a55 بین 15 تا 20 میلیون قسطی",
]

print(db.stats())
print([dict(r) for r in db.q("SELECT mall_key, name, offer_shop_count FROM malls ORDER BY offer_shop_count DESC LIMIT 6")])
for text in QUERIES:
    p = parse(text)
    f = apply_parsed({}, p, new_search=True)
    t = time.time()
    r = search(f.get("q", ""), to_context(f))
    print(f"\n>> {text}\n  parsed: { {k: v for k, v in p.to_dict().items() if v not in (None, False, [], '')} }")
    print(f"  total={r['total']} mode={r['match_mode']} {(time.time() - t) * 1000:.0f}ms relax={r['relax']}")
    for x in r["products"][:3]:
        b = x["best"]
        print("   -", x["title"][:55], "|", b["price"], "|", b["shop"]["name"], b["shop"]["distance_km"],
              b["shop"]["status"]["state"], "|", b["reasons"][:3], b["warnings"][:2])
    if r["category_shops"]:
        print("  category-only shops:", r["category_shops"]["count"])
