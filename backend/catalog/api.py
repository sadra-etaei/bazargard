from django.db import transaction
from django.shortcuts import get_object_or_404
from ninja import NinjaAPI, Query, Schema
from ninja.errors import HttpError

from . import assistant, db, inquiries, llm, sms, voice
from .alternatives import alternatives
from .filters import BOOL_KEYS, apply_parsed, chips, to_context
from .messages import seller_message
from .mapshops import stores_in_bounds
from .neighbors import neighboring_shops
from .models import Inquiry, ShoppingListItem, StockReport, VisitItem
from .planner import cover_items, plan_trip
from .query_parser import LANDMARKS, parse
from .search import all_shops, product_detail, product_view, recent_reports, score_offer, search, shop_view
from .textnorm import normalize

api = NinjaAPI(title="دستیار خرید حضوری", version="1.0", urls_namespace="api")


class Filters(Schema):
    q: str = ""
    category: str | None = None
    brand: str | None = None
    mall: str | None = None
    budget_min: int | None = None
    budget_max: int | None = None
    area: str | None = None
    lat: float | None = None
    lon: float | None = None
    radius: float | None = None
    open: bool = False
    visit_at: str | None = None
    visit_label: str | None = None
    installments: bool = False
    torobpay: bool = False
    warranty: bool = False
    fast: bool = False
    include_unknown: bool = False
    priority: str | None = None
    mode: str | None = None
    sort: str | None = None


def _device(request) -> str:
    d = request.headers.get("X-Device-Id", "")[:64]
    if not d:
        raise HttpError(400, "X-Device-Id header is required")
    return d


def _f(filters: Filters) -> dict:
    return filters.dict(exclude_none=True)


@api.get("/meta")
def meta(request):
    return {
        "stats": db.stats(),
        "llm": llm.enabled(),
        "llm_hint": llm.misconfigured(),
        "categories": [{"name": c["name"], "offers": c["offer_count"]} for c in db.categories()[:30]],
        "malls": [{"key": m["mall_key"], "name": m["name"], "shops": m["offer_shop_count"], "lat": m["lat"], "lon": m["lon"]}
                  for m in db.malls()[:20]],
        "areas": [{"label": a["label"], "lat": a["lat"], "lon": a["lon"], "shops": a["shop_count"]} for a in db.areas()[:40]],
    }


@api.get("/places")
def places(request, q: str = ""):
    """Autocomplete for the location picker: dataset neighbourhoods, malls and well-known landmarks."""
    n = normalize(q)
    out = []
    for a in db.areas():
        if not n or n in a["norm"]:
            out.append({"label": a["label"], "kind": "area", "lat": a["lat"], "lon": a["lon"], "shops": a["shop_count"]})
    for m in db.malls():
        if n and n in m["mall_key"]:
            out.append({"label": m["name"], "kind": "mall", "lat": m["lat"], "lon": m["lon"], "shops": m["shop_count"]})
    for name, (lat, lon) in LANDMARKS.items():
        if n and n in name:
            out.append({"label": name, "kind": "landmark", "lat": lat, "lon": lon, "shops": None})
    out.sort(key=lambda x: (not x["label"].startswith(q), -(x["shops"] or 0)))
    return out[:12]


@api.get("/search")
def search_view(request, filters: Query[Filters], smart: bool = True, page: int = 1):
    """Search. With smart=1 the free text is also parsed (budget, place, time, conditions) into filters."""
    f = _f(filters)
    understood = []
    if smart and f.get("q"):
        p = parse(f["q"])
        understood = p.spans
        f = apply_parsed(f, p, new_search=False)
        f["q"] = p.keywords or f["q"]
    res = search(f.get("q", ""), to_context(f, request.headers.get("X-Device-Id")), page=page)
    return {**res, "filters": f, "chips": chips(f), "understood": understood}


@api.get("/products/{product_id}")
def product(request, product_id: str, filters: Query[Filters]):
    d = product_detail(product_id, to_context(_f(filters), request.headers.get("X-Device-Id")))
    if not d:
        raise HttpError(404, "product not found")
    return d


@api.get("/products/{product_id}/alternatives")
def product_alternatives(request, product_id: str, filters: Query[Filters], exclude_shop: str | None = None, at_shop: bool = False):
    res = alternatives(product_id, to_context(_f(filters)), exclude_shop=exclude_shop, at_shop=at_shop)
    if not res:
        raise HttpError(404, "product not found")
    return res


@api.get("/map/shops")
def map_shops(request, filters: Query[Filters], south: float = 35.55, west: float = 51.15,
              north: float = 35.85, east: float = 51.65, term: str = ""):
    try:
        rows, total = stores_in_bounds(all_shops().values(), south, west, north, east, term)
    except ValueError as exc:
        raise HttpError(400, str(exc))
    ctx = to_context(_f(filters))
    return {"shops": [shop_view(s, ctx) for s in rows], "total": total, "truncated": total > len(rows)}


@api.get("/shops/{shop_id}")
def shop(request, shop_id: str, filters: Query[Filters], pq: str = "", page: int = 1):
    s = all_shops().get(shop_id)
    if not s:
        raise HttpError(404, "shop not found")
    ctx = to_context(_f(filters))
    view = shop_view(s, ctx, full=True)
    siblings = []
    if s["mall_key"]:
        siblings = [shop_view(o, ctx) for o in all_shops().values() if o["mall_key"] == s["mall_key"] and o["shop_id"] != shop_id]
        siblings.sort(key=lambda v: -v["offer_count"])
    return {"shop": view, "mall_shops": siblings[:20], "mall_shop_count": len(siblings) + 1 if s["mall_key"] else 0,
            "products": shop_products(request, shop_id, filters, pq, page)}


@api.get("/shops/{shop_id}/neighbors")
def shop_neighbors(request, shop_id: str):
    shops = all_shops()
    s = shops.get(shop_id)
    if not s:
        raise HttpError(404, "shop not found")
    return {"shops": neighboring_shops(s, shops.values())}


@api.get("/shops/{shop_id}/products")
def shop_products(request, shop_id: str, filters: Query[Filters], pq: str = "", page: int = 1):
    s = all_shops().get(shop_id)
    if not s:
        raise HttpError(404, "shop not found")
    ctx = to_context(_f(filters))
    sql = "SELECT o.*, p.* FROM offers o JOIN products p ON p.pid=o.pid WHERE o.shop_id=?"
    args = [shop_id]
    if pq:
        sql += " AND o.pid IN (SELECT rowid FROM product_fts WHERE product_fts MATCH ?)"
        args.append(" AND ".join(f'"{t}"*' for t in normalize(pq).split()))
    rows = db.q(sql + " ORDER BY p.offer_count DESC LIMIT 30 OFFSET ?", [*args, (page - 1) * 30])
    reports = recent_reports({shop_id}, {r["product_id"] for r in rows})
    sv = shop_view(s, ctx)
    items = []
    for r in rows:
        ref = {"min": r["min_price"], "max": r["max_price"], "n": r["offer_count"]}
        card = score_offer(r, dict(r), sv, ctx, reports.get((shop_id, r["product_id"])), ref)
        card.pop("shop")
        items.append({"product": product_view(r), "offer": card})
    return {"items": items, "total": s["offer_count"]}


@api.get("/malls/{mall_key}")
def mall(request, mall_key: str, filters: Query[Filters]):
    ctx = to_context(_f(filters))
    shops = [shop_view(s, ctx) for s in all_shops().values() if s["mall_key"] == mall_key]
    if not shops:
        raise HttpError(404, "mall not found")
    shops.sort(key=lambda v: (v["floor_rank"] is None, v["floor_rank"] or 0, -v["offer_count"]))
    return {"key": mall_key, "name": shops[0]["mall"], "shops": shops}


@api.get("/message")
def message(request, shop_id: str, offer_id: str | None = None, visit_label: str | None = None,
            installments: bool = False, torobpay: bool = False):
    s = all_shops().get(shop_id)
    if not s:
        raise HttpError(404, "shop not found")
    offer, title = None, None
    if offer_id:
        o = db.one("SELECT o.*, p.title FROM offers o JOIN products p ON p.pid=o.pid WHERE offer_id=?", (offer_id,))
        if o:
            offer, title = {"seller_title": o["seller_title"], "listed_price": o["price"]}, o["title"]
    conds = (["پرداخت با ترب‌پی"] if torobpay else []) + (["خرید قسطی"] if installments else [])
    return seller_message(s, title, offer, visit_label, conds)


# -------- stock reports (the only source of "confirmed" stock) --------------------------------
class ReportIn(Schema):
    shop_id: str
    product_id: str = ""
    status: str
    source: str = "call"
    price: int | None = None
    note: str = ""


@api.post("/reports")
def create_report(request, data: ReportIn):
    if data.status not in StockReport.Status.values or data.source not in StockReport.Source.values:
        raise HttpError(400, "invalid status/source")
    if data.shop_id not in all_shops():
        raise HttpError(404, "shop not found")
    r = StockReport.objects.create(device_id=_device(request), **data.dict())
    return {"id": r.id, "created_at": r.created_at}


@api.get("/reports/mine")
def my_reports(request):
    shops = all_shops()
    out = []
    for r in StockReport.objects.filter(device_id=_device(request))[:100]:
        p = db.one("SELECT title FROM products WHERE product_id=?", (r.product_id,)) if r.product_id else None
        out.append({"id": r.id, "shop_id": r.shop_id, "shop_name": shops.get(r.shop_id, {}).get("name"),
                    "product_id": r.product_id, "product_title": p["title"] if p else None, "status": r.status,
                    "status_label": r.get_status_display(), "source": r.get_source_display(), "price": r.price,
                    "created_at": r.created_at})
    return out


# -------- visit list & trip plan ---------------------------------------------------------------
class VisitIn(Schema):
    shop_id: str
    product_id: str = ""
    offer_id: str = ""


class VisitPatch(Schema):
    state: str | None = None
    paid_price: int | None = None


def _visit_dict(v: VisitItem) -> dict:
    p = db.one("SELECT title, images FROM products WHERE product_id=?", (v.product_id,)) if v.product_id else None
    o = db.one("SELECT price, seller_title FROM offers WHERE offer_id=?", (v.offer_id,)) if v.offer_id else None
    imgs = db.loads(p["images"], []) if p else []
    return {"id": v.id, "shop_id": v.shop_id, "product_id": v.product_id, "offer_id": v.offer_id, "state": v.state,
            "paid_price": v.paid_price, "product_title": p["title"] if p else None, "image": imgs[0] if imgs else None,
            "listed_price": o["price"] if o else None, "created_at": v.created_at, "updated_at": v.updated_at,
            "shop_name": (all_shops().get(v.shop_id) or {}).get("name")}


@api.get("/visits")
def list_visits(request):
    return [_visit_dict(v) for v in VisitItem.objects.filter(device_id=_device(request))]


@api.post("/visits")
def add_visit(request, data: VisitIn):
    if data.shop_id not in all_shops():
        raise HttpError(404, "shop not found")
    if data.offer_id:
        offer = db.one("SELECT o.shop_id, p.product_id FROM offers o JOIN products p ON p.pid=o.pid WHERE o.offer_id=?", (data.offer_id,))
        if not offer or offer["shop_id"] != data.shop_id or offer["product_id"] != data.product_id:
            raise HttpError(400, "فروشنده این کالا را ثبت نکرده است")
    v = VisitItem.objects.filter(device_id=_device(request), shop_id=data.shop_id, product_id=data.product_id,
                                 state=VisitItem.State.PLANNED).first()
    if v is None:
        v = VisitItem.objects.create(device_id=_device(request), shop_id=data.shop_id, product_id=data.product_id, offer_id=data.offer_id)
    elif data.offer_id:
        v.offer_id = data.offer_id
        v.save()
    return _visit_dict(v)


@api.patch("/visits/{visit_id}")
def update_visit(request, visit_id: int, data: VisitPatch):
    v = get_object_or_404(VisitItem, id=visit_id, device_id=_device(request))
    if data.state:
        if data.state not in VisitItem.State.values:
            raise HttpError(400, "invalid state")
        v.state = data.state
    if data.paid_price is not None:
        v.paid_price = data.paid_price
    v.save()
    return _visit_dict(v)


@api.post("/visits/{visit_id}/complete")
def complete_visit(request, visit_id: int, data: VisitPatch):
    if data.state not in (VisitItem.State.BOUGHT, VisitItem.State.SKIPPED, VisitItem.State.VISITED):
        raise HttpError(400, "invalid completion state")
    if data.paid_price is not None and data.paid_price <= 0:
        raise HttpError(400, "قیمت باید بیشتر از صفر باشد")
    with transaction.atomic():
        v = get_object_or_404(VisitItem, id=visit_id, device_id=_device(request))
        if v.state != VisitItem.State.PLANNED:
            # Repeating a successful request after a lost connection is safe.
            if v.state == data.state and v.paid_price == data.paid_price:
                return _visit_dict(v)
            raise HttpError(400, "این مراجعه قبلاً ثبت شده است")
        v.state, v.paid_price = data.state, data.paid_price
        v.save()
        if v.product_id and v.state == VisitItem.State.BOUGHT:
            StockReport.objects.create(device_id=v.device_id, shop_id=v.shop_id, product_id=v.product_id,
                                       status=StockReport.Status.PRICE_CHANGED if data.paid_price else StockReport.Status.IN_STOCK,
                                       source=StockReport.Source.VISIT, price=data.paid_price)
    return _visit_dict(v)


@api.post("/visits/{visit_id}/replace")
def replace_visit(request, visit_id: int, data: VisitIn):
    device = _device(request)
    with transaction.atomic():
        old = get_object_or_404(VisitItem, id=visit_id, device_id=device)
        if old.state not in (VisitItem.State.PLANNED, VisitItem.State.SKIPPED):
            raise HttpError(400, "این مراجعه تمام شده است؛ یک مقصد تازه اضافه کنید")
        if not old.product_id or data.product_id != old.product_id or data.shop_id == old.shop_id:
            raise HttpError(400, "جایگزینی مسیر باید برای همین کالا در فروشگاهی دیگر باشد")
        if data.shop_id not in all_shops():
            raise HttpError(404, "shop not found")
        offer = db.one("SELECT o.shop_id, p.product_id FROM offers o JOIN products p ON p.pid=o.pid WHERE o.offer_id=?", (data.offer_id,))
        if not offer or offer["shop_id"] != data.shop_id or offer["product_id"] != data.product_id:
            raise HttpError(400, "فروشنده این کالا را ثبت نکرده است")
        existing = VisitItem.objects.filter(device_id=device, shop_id=data.shop_id, product_id=data.product_id,
                                             state=VisitItem.State.PLANNED).first()
        if existing is None:
            existing = VisitItem.objects.create(device_id=device, shop_id=data.shop_id, product_id=data.product_id, offer_id=data.offer_id)
        else:
            existing.offer_id = data.offer_id
            existing.save()
        old.state = VisitItem.State.SKIPPED
        old.save()
    return _visit_dict(existing)


@api.delete("/visits/{visit_id}")
def delete_visit(request, visit_id: int):
    VisitItem.objects.filter(id=visit_id, device_id=_device(request)).delete()
    return {"ok": True}


@api.get("/plan")
def plan(request, filters: Query[Filters], start_visit_id: int | None = None):
    visits = [v for v in VisitItem.objects.filter(device_id=_device(request)) if v.state == VisitItem.State.PLANNED]
    items = [{"visit_id": v.id, **{k: x for k, x in _visit_dict(v).items() if k in ("shop_id", "product_id", "offer_id",
                                                                                     "product_title", "image", "listed_price")}}
             for v in visits]
    return plan_trip(items, to_context(_f(filters)), start_visit_id=start_visit_id)


# -------- shopping list (several items, one trip) ----------------------------------------------
class ListIn(Schema):
    query: str
    product_id: str = ""


@api.get("/list")
def get_list(request):
    out = []
    for it in ShoppingListItem.objects.filter(device_id=_device(request)):
        p = db.one("SELECT * FROM products WHERE product_id=?", (it.product_id,)) if it.product_id else None
        out.append({"id": it.id, "query": it.query, "product_id": it.product_id, "done": it.done,
                    "product": product_view(p) if p else None})
    return out


@api.post("/list")
def add_list(request, data: ListIn):
    it = ShoppingListItem.objects.create(device_id=_device(request), query=data.query[:200], product_id=data.product_id)
    return {"id": it.id}


@api.delete("/list/{item_id}")
def delete_list(request, item_id: int):
    ShoppingListItem.objects.filter(id=item_id, device_id=_device(request)).delete()
    return {"ok": True}


@api.get("/list/cover")
def list_cover(request, filters: Query[Filters]):
    ids = [i.product_id for i in ShoppingListItem.objects.filter(device_id=_device(request), done=False) if i.product_id]
    return cover_items(ids, to_context(_f(filters)))


# -------- assistant ----------------------------------------------------------------------------
class AssistantIn(Schema):
    message: str
    state: dict = {}


@api.post("/assistant")
def assistant_view(request, data: AssistantIn):
    return assistant.handle(data.message[:500], data.state, request.headers.get("X-Device-Id"))


# -------- seller follow-up: SMS reply link / automatic call (simulated without a provider) ------
class InquiryIn(Schema):
    shop_id: str
    product_id: str = ""
    offer_id: str = ""
    visit_label: str = ""
    channel: str = "sms"
    installments: bool = False
    torobpay: bool = False


class SellerAnswerIn(Schema):
    status: str
    price: int | None = None
    note: str = ""


class KeypressIn(Schema):
    token: str
    digits: str


@api.get("/messaging")
def messaging(request):
    s, v = sms.provider_name(), voice.provider_name()
    return {"sms": s, "call": v, "sms_simulated": s == "simulated", "call_simulated": v == "simulated"}


@api.post("/inquiries")
def create_inquiry(request, data: InquiryIn):
    if data.channel not in Inquiry.Channel.values:
        raise HttpError(400, "invalid channel")
    try:
        inq = inquiries.create(_device(request), data.shop_id, data.product_id, data.offer_id, data.visit_label[:60],
                               request.build_absolute_uri("/"), channel=data.channel,
                               conditions=(["ترب‌پی حضوری"] if data.torobpay else []) + (["اقساط حضوری"] if data.installments else []))
    except inquiries.InquiryError as exc:
        raise HttpError(400, str(exc))
    return inquiries.shopper_view(inq)


@api.get("/inquiries")
def list_inquiries(request, unseen: bool = False):
    qs = Inquiry.objects.filter(device_id=_device(request))
    if unseen:
        qs = qs.filter(status=Inquiry.Status.ANSWERED, seen=False)
    return [inquiries.shopper_view(i) for i in qs[:50]]


@api.get("/inquiries/{inquiry_id}")
def get_inquiry(request, inquiry_id: int):
    return inquiries.shopper_view(get_object_or_404(Inquiry, id=inquiry_id, device_id=_device(request)))


@api.post("/inquiries/{inquiry_id}/seen")
def inquiry_seen(request, inquiry_id: int):
    Inquiry.objects.filter(id=inquiry_id, device_id=_device(request)).update(seen=True)
    return {"ok": True}


@api.get("/r/{token}")
def seller_inquiry(request, token: str):
    """Public: what the seller sees after tapping the link in the SMS (or the keypad screen of a simulated call)."""
    try:
        return inquiries.seller_view(token)
    except inquiries.InquiryError as exc:
        raise HttpError(404, str(exc))


@api.post("/r/{token}")
def seller_answer(request, token: str, data: SellerAnswerIn):
    try:
        inquiries.answer(token, data.status, data.price, data.note)
    except inquiries.InquiryError as exc:
        raise HttpError(400, str(exc))
    return inquiries.seller_view(token)


@api.post("/voice/keypress")
def voice_keypress(request, data: KeypressIn):
    """Webhook for any voice provider (and the simulated call): the seller's keypad answer."""
    try:
        status, price = voice.parse_keys(data.digits)
        inquiries.answer(data.token, status, price, "")
    except ValueError:
        raise HttpError(400, "invalid keys")
    except inquiries.InquiryError as exc:
        raise HttpError(400, str(exc))
    return {"ok": True, "status": status, "price": price}


@api.get("/health")
def health(request):
    return {"ok": True, "products": db.stats()["products"]}
