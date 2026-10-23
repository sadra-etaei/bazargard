"""Ready-to-send messages and call checklists for confirming stock before the trip."""
from urllib.parse import quote

from .textnorm import fa_digits


def _toman(v) -> str:
    return fa_digits(f"{v:,}").replace(",", "٬") + " تومان" if v else "—"


def seller_message(shop: dict, product_title: str | None, offer: dict | None, visit_label: str | None,
                   conditions: list[str]) -> dict:
    item = (offer or {}).get("seller_title") or product_title or "این کالا"
    price = (offer or {}).get("listed_price")
    when = visit_label or "امروز"
    lines = ["سلام، وقت بخیر.", f"«{item}» را در ترب دیدم" + (f" با قیمت {_toman(price)}." if price else ".")]
    lines.append("لطفاً موجودی همین مدل و رنگ، تعداد قابل خرید و قیمت نهایی امروز را بفرمایید. گارانتی کدام شرکت و چند ماه است؟")
    if conditions:
        lines.append("امکان " + " و ".join(conditions) + " هم دارید؟")
    lines.append(f"{when} برای خرید حضوری خدمت می‌رسم. ممنون 🙏")
    text = "\n".join(lines)

    questions = ["همین مدل و رنگ دقیق موجود است؟ چند عدد؟", "قیمت نهایی نقدی امروز چند است؟", "گارانتی دارد؟ کدام شرکت و چند ماه؟",
                 "امکان تست کالا در محل هست؟"]
    if "ترب‌پی" in " ".join(conditions):
        questions.append("پرداخت با ترب‌پی حضوری را قبول می‌کنید؟")
    if any("قسط" in c for c in conditions):
        questions.append("خرید قسطی با کدام سرویس؟ پیش‌پرداخت لازم است؟")
    questions.append(f"تا چه ساعتی باز هستید؟ ({when} می‌آیم)")
    if shop.get("mall"):
        questions.append(f"دقیقاً کجای {shop['mall']} هستید؟")

    phone = (shop.get("phone") or "").translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789"))
    encoded = quote(text)
    return {
        "text": text,
        "questions": questions,
        "phone": shop.get("phone"),
        "links": {
            "call": f"tel:{phone}" if phone else None,
            "sms": f"sms:{phone}?body={encoded}" if phone else None,
            "whatsapp": f"https://wa.me/98{phone.lstrip('0')}?text={encoded}" if phone and phone.startswith("09") else None,
        },
        "note": "شماره‌های تماس این نسخه از دیتاست نمایشی‌اند.",
    }
