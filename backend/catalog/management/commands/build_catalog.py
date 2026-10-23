"""Build the read-only catalog database (shops, products, offers + FTS index) from the Torob CSVs.

    python manage.py build_catalog --src ../dataset
"""
import csv
import json
import os
import sqlite3
import statistics
import time
from collections import Counter, defaultdict
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from catalog.geo import mall_key, parse_address
from catalog.hours import normalize_week
from catalog.textnorm import normalize

csv.field_size_limit(10**9)

SCHEMA = """
CREATE TABLE shops (
    shop_id TEXT PRIMARY KEY, name TEXT, name_is_real INTEGER, categories TEXT, address TEXT,
    location_label TEXT, lat REAL, lon REAL, mall TEXT, mall_key TEXT, floor TEXT, unit TEXT,
    phone TEXT, instagram TEXT, website TEXT, fast_delivery INTEGER, payments TEXT, hours TEXT,
    offer_count INTEGER DEFAULT 0
);
CREATE TABLE shop_categories (shop_id TEXT, category TEXT);
CREATE TABLE products (
    pid INTEGER PRIMARY KEY, product_id TEXT UNIQUE, title TEXT, brand TEXT, model TEXT, category TEXT,
    specs TEXT, images TEXT, offer_count INTEGER DEFAULT 0, min_price INTEGER, median_price INTEGER,
    max_price INTEGER
);
CREATE TABLE offers (
    offer_id TEXT PRIMARY KEY, shop_id TEXT, pid INTEGER, seller_title TEXT, description TEXT,
    price INTEGER, price_raw REAL, price_status TEXT, price_changed_at TEXT,
    warranty_provider TEXT, warranty_months INTEGER, warranty_desc TEXT
);
CREATE TABLE areas (label TEXT PRIMARY KEY, norm TEXT, lat REAL, lon REAL, shop_count INTEGER);
CREATE TABLE malls (mall_key TEXT PRIMARY KEY, name TEXT, lat REAL, lon REAL, shop_count INTEGER, offer_shop_count INTEGER);
CREATE TABLE categories (name TEXT PRIMARY KEY, norm TEXT, product_count INTEGER, offer_count INTEGER);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
CREATE VIRTUAL TABLE product_fts USING fts5(title, brand, category, sellers, tokenize='unicode61 remove_diacritics 2', prefix='2 3');
"""

INDEXES = """
CREATE INDEX ix_offers_pid ON offers(pid);
CREATE INDEX ix_offers_shop ON offers(shop_id);
CREATE INDEX ix_products_cat ON products(category);
CREATE INDEX ix_shopcat_cat ON shop_categories(category);
CREATE INDEX ix_shops_mall ON shops(mall_key);
"""


def _json(v):
    return None if v in (None, "", "null") else json.loads(v)


def _rows(path: Path):
    with open(path, encoding="utf-8", newline="") as fh:
        yield from csv.DictReader(fh)


class Command(BaseCommand):
    help = "Build the catalog SQLite database from the Torob dataset CSVs."

    def add_arguments(self, parser):
        parser.add_argument("--src", default=str(settings.DATASET_DIR))
        parser.add_argument("--out", default=str(settings.CATALOG_DB))

    def handle(self, *args, src, out, **opts):
        t0 = time.time()
        src, out = Path(src), Path(out)
        tmp = out.with_suffix(".building")
        out.parent.mkdir(parents=True, exist_ok=True)
        if tmp.exists():
            tmp.unlink()
        db = sqlite3.connect(tmp)
        db.executescript("PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;" + SCHEMA)

        shops = self._load_shops(db, src / "shops.csv")
        self.stdout.write(f"shops: {len(shops)}  ({time.time() - t0:.0f}s)")
        pid_of = self._load_products(db, src / "products.csv")
        self.stdout.write(f"products: {len(pid_of)}  ({time.time() - t0:.0f}s)")
        self._load_offers(db, src / "offers.csv", pid_of)
        self.stdout.write(f"offers loaded  ({time.time() - t0:.0f}s)")
        db.executescript(INDEXES)
        self._aggregate(db)
        self.stdout.write(f"aggregates + FTS built  ({time.time() - t0:.0f}s)")
        db.execute("INSERT INTO meta VALUES ('built_at', datetime('now'))")
        db.commit()
        db.execute("VACUUM")
        db.close()
        os.replace(tmp, out)
        self.stdout.write(self.style.SUCCESS(f"catalog written to {out} in {time.time() - t0:.0f}s"))

    def _load_shops(self, db, path):
        shops, cats = [], []
        for r in _rows(path):
            addr = parse_address(r["address"])
            payments = [
                {"provider": p.get("provider_name"), "channel": p.get("channel") or "unknown",
                 "min": p.get("min_price_toman"), "max": p.get("max_price_toman")}
                for p in (_json(r["payment_options"]) or [])
            ]
            contacts = _json(r["contacts"]) or []
            phone = next((c.get("display_number") for c in contacts if c.get("channel") == "phone"), None)
            fast = {"true": 1, "false": 0}.get(r["supports_fast_delivery"])
            categories = _json(r["category_names"]) or []
            instagram, website = _json_str(r["instagram"]), _json_str(r["website_url"])
            shops.append((
                r["shop_id"], r["name"], int(bool(instagram or website)), json.dumps(categories, ensure_ascii=False),
                None if r["address"] == "null" else r["address"], None if r["location_label"] == "null" else r["location_label"],
                _float(r["lat"]), _float(r["lon"]), addr["mall"], mall_key(addr["mall"]), addr["floor"], addr["unit"],
                phone, instagram, website, fast, json.dumps(payments, ensure_ascii=False),
                json.dumps(normalize_week(_json(r["weekly_hours"])), ensure_ascii=False),
            ))
            cats.extend((r["shop_id"], c) for c in categories)
        db.executemany(f"INSERT INTO shops VALUES ({','.join('?' * 18)}, 0)", shops)
        db.executemany("INSERT INTO shop_categories VALUES (?, ?)", cats)
        return shops

    def _load_products(self, db, path):
        pid_of, batch = {}, []
        for i, r in enumerate(_rows(path), start=1):
            pid_of[r["product_id"]] = i
            batch.append((i, r["product_id"], r["persian_title"] if r["persian_title"] != "null" else "",
                          _nullable(r["brand_name"]), _nullable(r["model"]), _nullable(r["category_name"]),
                          _nullable(r["specs"]), _nullable(r["image_urls"])))
            if len(batch) >= 20000:
                db.executemany("INSERT INTO products (pid, product_id, title, brand, model, category, specs, images) VALUES (?,?,?,?,?,?,?,?)", batch)
                batch.clear()
        db.executemany("INSERT INTO products (pid, product_id, title, brand, model, category, specs, images) VALUES (?,?,?,?,?,?,?,?)", batch)
        return pid_of

    def _load_offers(self, db, path, pid_of):
        rows, prices = [], defaultdict(list)
        for r in _rows(path):
            pid = pid_of.get(r["product_id"])
            if pid is None:
                continue
            raw = _float(r["price_toman"])
            w = _json(r["warranty"]) or {}
            rows.append([r["offer_id"], r["shop_id"], pid, r["seller_title"], r["description"] or None, raw,
                         _nullable(r["last_price_changed_at"]), w.get("provider"), w.get("period_months"), w.get("description")])
            if raw and 1000 <= raw <= 5e10:
                prices[pid].append(raw)
        medians = {pid: statistics.median(v) for pid, v in prices.items() if len(v) >= 3}
        out = []
        for offer_id, shop_id, pid, title, desc, raw, changed, wp, wm, wd in rows:
            if raw is None:
                price, status = None, "missing"
            elif not 1000 <= raw <= 5e10:
                price, status = None, "invalid"
            elif pid in medians and not medians[pid] / 8 <= raw <= medians[pid] * 8:
                price, status = None, "outlier"
            else:
                price, status = int(raw), "ok"
            out.append((offer_id, shop_id, pid, title, desc, price, raw, status, changed, wp, wm, wd))
        db.executemany("INSERT INTO offers VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", out)

    def _aggregate(self, db):
        # Per-product price stats from valid prices only.
        stats = defaultdict(list)
        counts = Counter()
        sellers = defaultdict(set)
        for pid, price, title in db.execute("SELECT pid, price, seller_title FROM offers"):
            counts[pid] += 1
            if price:
                stats[pid].append(price)
            if title and len(sellers[pid]) < 6:
                sellers[pid].add(normalize(title))
        db.executemany(
            "UPDATE products SET offer_count=?, min_price=?, median_price=?, max_price=? WHERE pid=?",
            [(counts[pid], min(v) if v else None, int(statistics.median(v)) if v else None, max(v) if v else None, pid)
             for pid in counts for v in [stats.get(pid, [])]],
        )
        fts = []
        for pid, title, brand, model, cat in db.execute("SELECT pid, title, brand, model, category FROM products"):
            fts.append((pid, normalize(title), normalize(f"{brand or ''} {model or ''}"), normalize(cat),
                        " ".join(sellers.get(pid, ()))))
        db.executemany("INSERT INTO product_fts (rowid, title, brand, category, sellers) VALUES (?,?,?,?,?)", fts)
        db.execute("UPDATE shops SET offer_count = (SELECT COUNT(*) FROM offers o WHERE o.shop_id = shops.shop_id)")
        db.execute("""
            INSERT INTO areas SELECT location_label, NULL, AVG(lat), AVG(lon), COUNT(*) FROM shops
            WHERE location_label IS NOT NULL AND lat IS NOT NULL GROUP BY location_label""")
        db.executemany("UPDATE areas SET norm=? WHERE label=?",
                       [(normalize(l), l) for (l,) in db.execute("SELECT label FROM areas").fetchall()])
        malls = defaultdict(list)
        for key, name, lat, lon, oc in db.execute("SELECT mall_key, mall, lat, lon, offer_count FROM shops WHERE mall_key IS NOT NULL"):
            malls[key].append((name, lat, lon, oc))
        db.executemany("INSERT INTO malls VALUES (?,?,?,?,?,?)", [
            (k, Counter(n for n, *_ in v).most_common(1)[0][0],
             statistics.median(x[1] for x in v), statistics.median(x[2] for x in v), len(v), sum(1 for x in v if x[3]))
            for k, v in malls.items() if all(x[1] is not None for x in v)
        ])
        db.execute("""
            INSERT INTO categories SELECT category, NULL, COUNT(*), SUM(offer_count) FROM products
            WHERE category IS NOT NULL GROUP BY category""")
        db.executemany("UPDATE categories SET norm=? WHERE name=?",
                       [(normalize(c), c) for (c,) in db.execute("SELECT name FROM categories").fetchall()])


def _float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _nullable(v):
    return None if v in ("null", "") else v


def _json_str(v):
    v = _nullable(v)
    if v and v.startswith(("[", "{", '"')):
        try:
            parsed = json.loads(v)
            if isinstance(parsed, list):
                return parsed[0] if parsed else None
            return parsed if isinstance(parsed, str) else json.dumps(parsed, ensure_ascii=False)
        except json.JSONDecodeError:
            return v
    return v
