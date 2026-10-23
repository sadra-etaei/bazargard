"""Seller follow-up: ask a shop by SMS, let the seller answer through a one-time link, feed the answer back.

An answer becomes a StockReport with source=seller, which is what turns "unconfirmed" stock into "confirmed by the seller"
on every card, in the trip planner and in the alternatives flow.
"""
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from . import db, sms, voice
from .models import Inquiry, StockReport
from .search import all_shops
from .textnorm import fa_digits


class InquiryError(Exception):
    pass


# Until a real SMS / voice provider is configured, nobody is on the other end: after a short, believable wait
# the shopper is told the seller could not be reached (the seller-side screens are not offered).
SIMULATED_WAIT_S = {Inquiry.Channel.SMS: 4, Inquiry.Channel.CALL: 9}
UNREACHABLE = "به فروشنده دسترسی پیدا نشد؛ شاید مشغول است یا خط او در دسترس نیست."


def _expired(inq: Inquiry) -> bool:
    return inq.status == Inquiry.Status.SENT and timezone.now() - inq.created_at > timedelta(hours=settings.INQUIRY_TTL_HOURS)


def _refresh(inq: Inquiry) -> Inquiry:
    if inq.status == Inquiry.Status.SENT and inq.provider == "simulated" \
            and (timezone.now() - inq.created_at).total_seconds() >= SIMULATED_WAIT_S.get(inq.channel, 5):
        inq.status, inq.error = Inquiry.Status.FAILED, UNREACHABLE
        inq.save(update_fields=["status", "error"])
    if _expired(inq):
        inq.status = Inquiry.Status.EXPIRED
        inq.save(update_fields=["status"])
    return inq


def _product(product_id: str):
    return db.one("SELECT product_id, title, images FROM products WHERE product_id=?", (product_id,)) if product_id else None


def _offer(offer_id: str):
    return db.one("SELECT offer_id, seller_title, price FROM offers WHERE offer_id=?", (offer_id,)) if offer_id else None


def compose(item: str, url: str, visit_label: str, conditions: list[str] | None = None) -> str:
    when = f" {visit_label}" if visit_label else ""
    requirements = " امکان " + " و ".join(conditions) + " دارید؟" if conditions else ""
    return f"سلام، یک مشتری از بازارگرد می‌پرسد «{item}» همین مدل و رنگ موجود است؟ چند عدد؟ قیمت نهایی و گارانتی امروز؟{requirements}{when} برای خرید حضوری می‌آید.\nپاسخ با یک لمس: {url}"


def create(device_id: str, shop_id: str, product_id: str, offer_id: str, visit_label: str, base_url: str,
           channel: str = Inquiry.Channel.SMS, conditions: list[str] | None = None) -> Inquiry:
    shop = all_shops().get(shop_id)
    if not shop:
        raise InquiryError("فروشگاه پیدا نشد")

    since = timezone.now() - timedelta(hours=2)
    recent = Inquiry.objects.filter(device_id=device_id, shop_id=shop_id, product_id=product_id, channel=channel,
                                    status=Inquiry.Status.SENT, created_at__gte=since).first()
    if recent:  # don't text the same seller twice about the same item
        return recent
    day_ago = timezone.now() - timedelta(days=1)
    if Inquiry.objects.filter(device_id=device_id, created_at__gte=day_ago).count() >= settings.INQUIRIES_PER_DEVICE_PER_DAY:
        raise InquiryError("سقف استعلام امروز پر شده است؛ فردا دوباره امتحان کنید یا تماس بگیرید.")

    offer, product = _offer(offer_id), _product(product_id)
    item = (offer and offer["seller_title"]) or (product and product["title"]) or "کالای مورد نظر"
    token = secrets.token_urlsafe(9)
    url = f"{(settings.PUBLIC_BASE_URL or base_url).rstrip('/')}/r/{token}"
    if channel == Inquiry.Channel.CALL:
        requirements = " امکان " + " و ".join(conditions) + " دارید؟" if conditions else ""
        text = "لطفاً مدل و رنگ دقیق، تعداد موجود و گارانتی را هم تأیید کنید." + requirements + " " + voice.script(item, visit_label)
        result = voice.call(shop["phone"], text, token)
    else:
        text = compose(item, url, visit_label, conditions)
        result = sms.send(shop["phone"], text)
    return Inquiry.objects.create(
        device_id=device_id, token=token, channel=channel, shop_id=shop_id, product_id=product_id or "", offer_id=offer_id or "",
        visit_label=visit_label or "", receptor=result.receptor, message=text, provider=result.provider,
        provider_ref=result.ref, error=result.error,
        status=Inquiry.Status.SENT if result.ok else Inquiry.Status.FAILED,
    )


@transaction.atomic
def answer(token: str, status: str, price: int | None, note: str) -> Inquiry:
    inq = Inquiry.objects.select_for_update().filter(token=token).first()
    if not inq:
        raise InquiryError("این لینک معتبر نیست")
    _refresh(inq)
    if inq.provider == "simulated":
        raise InquiryError(UNREACHABLE)
    if inq.status in (Inquiry.Status.EXPIRED, Inquiry.Status.FAILED):
        raise InquiryError("مهلت پاسخ به این استعلام تمام شده است")
    if status not in (StockReport.Status.IN_STOCK, StockReport.Status.OUT_OF_STOCK, StockReport.Status.PRICE_CHANGED):
        raise InquiryError("پاسخ نامعتبر")
    if status == StockReport.Status.PRICE_CHANGED and not price:
        raise InquiryError("قیمت جدید را وارد کنید")

    inq.status = Inquiry.Status.ANSWERED
    inq.answer, inq.answer_price, inq.answer_note = status, price, (note or "")[:300]
    inq.answered_at = timezone.now()
    inq.seen = False
    inq.save()
    StockReport.objects.create(device_id=f"seller:{inq.token}", shop_id=inq.shop_id, product_id=inq.product_id,
                               status=status, source=StockReport.Source.SELLER, price=price, note=inq.answer_note)
    return inq


def shopper_view(inq: Inquiry) -> dict:
    _refresh(inq)
    shop = all_shops().get(inq.shop_id) or {}
    product, offer = _product(inq.product_id), _offer(inq.offer_id)
    images = db.loads(product["images"], []) if product else []
    labels = dict(StockReport.Status.choices)
    if inq.status == Inquiry.Status.ANSWERED:
        summary = labels.get(inq.answer, "")
        if inq.answer_price:
            summary += f" · {fa_digits(f'{inq.answer_price:,}').replace(',', '٬')} تومان"
    elif inq.status == Inquiry.Status.FAILED:
        summary = inq.error or "ارسال نشد"
    elif inq.status == Inquiry.Status.EXPIRED:
        summary = "فروشنده پاسخ نداد؛ تماس بگیرید یا جایگزین ببینید"
    elif inq.channel == Inquiry.Channel.CALL:
        summary = "در حال تماس… منتظر انتخاب فروشنده"
    else:
        summary = "منتظر پاسخ فروشنده…"
    return {
        "id": inq.id,
        "token": inq.token,
        "channel": inq.channel,
        "shop_id": inq.shop_id,
        "shop_name": shop.get("name"),
        "shop_phone": shop.get("phone"),
        "product_id": inq.product_id,
        "product_title": product["title"] if product else None,
        "image": images[0] if images else None,
        "listed_price": offer["price"] if offer else None,
        "status": inq.status,
        "status_label": "در دسترس نبود" if inq.status == Inquiry.Status.FAILED and inq.provider == "simulated" else inq.get_status_display(),
        "answer": inq.answer or None,
        "answer_price": inq.answer_price,
        "answer_note": inq.answer_note,
        "summary": summary,
        "message": inq.message,
        "receptor": inq.receptor,
        "provider": inq.provider,
        "simulated": inq.provider == "simulated",
        "error": inq.error,
        "reply_path": f"/r/{inq.token}",
        "seen": inq.seen,
        "created_at": inq.created_at,
        "answered_at": inq.answered_at,
    }


def seller_view(token: str) -> dict:
    inq = Inquiry.objects.filter(token=token).first()
    if not inq:
        raise InquiryError("این لینک معتبر نیست")
    _refresh(inq)
    shop = all_shops().get(inq.shop_id) or {}
    product, offer = _product(inq.product_id), _offer(inq.offer_id)
    images = db.loads(product["images"], []) if product else []
    return {
        "shop_name": shop.get("name"),
        "item": (offer and offer["seller_title"]) or (product and product["title"]) or "کالای مورد نظر",
        "product_title": product["title"] if product else None,
        "image": images[0] if images else None,
        "listed_price": offer["price"] if offer else None,
        "visit_label": inq.visit_label,
        "channel": inq.channel,
        "script": inq.message if inq.channel == Inquiry.Channel.CALL else None,
        "asked_at": inq.created_at,
        "status": inq.status,
        "answer": inq.answer or None,
        "answer_price": inq.answer_price,
        "can_answer": inq.provider != "simulated" and inq.status in (Inquiry.Status.SENT, Inquiry.Status.ANSWERED),
    }
