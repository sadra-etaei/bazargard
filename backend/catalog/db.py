"""Read-only access to the catalog SQLite file built by `manage.py build_catalog`."""
import json
import sqlite3
import threading
from functools import lru_cache

from django.conf import settings

_local = threading.local()


def conn() -> sqlite3.Connection:
    c = getattr(_local, "conn", None)
    if c is None:
        uri = f"file:{settings.CATALOG_DB.as_posix()}?mode=ro&immutable=1"
        c = sqlite3.connect(uri, uri=True, check_same_thread=False)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA cache_size=-65536")
        c.execute("PRAGMA mmap_size=1073741824")
        _local.conn = c
    return c


def q(sql: str, params=()) -> list[sqlite3.Row]:
    return conn().execute(sql, params).fetchall()


def one(sql: str, params=()):
    return conn().execute(sql, params).fetchone()


def loads(v, default=None):
    if v is None:
        return default
    try:
        return json.loads(v)
    except (TypeError, ValueError):
        return default


@lru_cache(maxsize=1)
def areas() -> list[dict]:
    return [dict(r) for r in q("SELECT label, norm, lat, lon, shop_count FROM areas ORDER BY shop_count DESC")]


@lru_cache(maxsize=1)
def malls() -> list[dict]:
    return [dict(r) for r in q("SELECT * FROM malls WHERE offer_shop_count > 0 ORDER BY offer_shop_count DESC")]


@lru_cache(maxsize=1)
def categories() -> list[dict]:
    return [dict(r) for r in q("SELECT name, norm, product_count, offer_count FROM categories ORDER BY offer_count DESC")]


@lru_cache(maxsize=1)
def stats() -> dict:
    row = one("""SELECT (SELECT COUNT(*) FROM shops) shops, (SELECT COUNT(*) FROM shops WHERE offer_count > 0) listing_shops,
                 (SELECT COUNT(*) FROM products) products, (SELECT COUNT(*) FROM offers) offers,
                 (SELECT MAX(price_changed_at) FROM offers) latest_price, (SELECT value FROM meta WHERE key='built_at') built_at""")
    return dict(row)
