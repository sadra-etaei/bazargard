"""Automatic calls to sellers: a Persian voice script, answered with the phone keypad (DTMF).

VOICE_PROVIDER = auto (default) | simulated | <name>
  auto → simulated, until a real provider is added below.

To plug in a real provider (an Iranian voice-call API that supports text-to-speech and keypad input):
  1. add a function `_<name>(receptor, script, token) -> CallResult` that places the call;
  2. register it in PROVIDERS;
  3. point the provider's keypad webhook at  POST /api/voice/keypress  with {"token": ..., "digits": ...}.
The webhook is provider-independent, so nothing else changes.
"""
from dataclasses import dataclass

from django.conf import settings

from .sms import normalize_mobile


@dataclass
class CallResult:
    ok: bool
    provider: str
    receptor: str = ""
    ref: str = ""
    error: str = ""


PROVIDERS: dict = {}  # name -> callable(receptor, script, token) -> CallResult


def provider_name() -> str:
    choice = settings.VOICE_PROVIDER
    if choice == "auto":
        return next(iter(PROVIDERS), "simulated")
    return choice


def script(item: str, visit_label: str) -> str:
    when = f" {visit_label}" if visit_label else ""
    return (
        "سلام، وقت بخیر. این یک تماس خودکار از طرف یکی از مشتری‌های بازارگرد است. "
        f"مشتری می‌خواهد{when} برای خرید حضوری بیاید و می‌پرسد «{item}» موجود است؟ "
        "اگر موجود است عدد یک را بزنید. اگر موجود نیست عدد دو را بزنید. "
        "اگر قیمت تغییر کرده، عدد سه و بعد قیمت جدید را به هزار تومان وارد کنید. ممنون از شما."
    )


def call(shop_phone: str | None, text: str, token: str) -> CallResult:
    name = provider_name()
    receptor = normalize_mobile(settings.SMS_TEST_RECEPTOR) or "".join(ch for ch in (shop_phone or "") if ch.isdigit() or ch in "۰۱۲۳۴۵۶۷۸۹")
    if name == "simulated":
        return CallResult(ok=True, provider=name, receptor=receptor)
    fn = PROVIDERS.get(name)
    if not fn:
        return CallResult(ok=False, provider=name, receptor=receptor, error=f"سرویس تماس «{name}» پیکربندی نشده است")
    if not receptor:
        return CallResult(ok=False, provider=name, error="شماره تماس این فروشنده ثبت نشده است")
    return fn(receptor, text, token)


def parse_keys(digits: str) -> tuple[str, int | None]:
    """Keypad answer → (status, price in Toman). "1" in stock, "2" out of stock, "3" + price in thousands of Toman."""
    d = "".join(ch for ch in (digits or "") if ch.isdigit())
    if d.startswith("1"):
        return "in_stock", None
    if d.startswith("2"):
        return "out_of_stock", None
    if d.startswith("3") and len(d) > 1:
        return "price_changed", int(d[1:]) * 1000
    raise ValueError("invalid keys")
