"""Outgoing SMS. Real delivery through Kavenegar when configured; otherwise a simulation that sends nothing.

SMS_PROVIDER = auto (default) | kavenegar | simulated
  auto → kavenegar if KAVENEGAR_API_KEY is set, else simulated.
SMS_TEST_RECEPTOR: send every real SMS to this number instead of the shop (dataset phone numbers are fake).
"""
import json
import logging
import urllib.parse
import urllib.request
from dataclasses import dataclass

from django.conf import settings

log = logging.getLogger(__name__)
_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


@dataclass
class SendResult:
    ok: bool
    provider: str
    receptor: str = ""
    ref: str = ""
    error: str = ""

    @property
    def simulated(self) -> bool:
        return self.provider == "simulated"


def normalize_mobile(phone: str | None) -> str | None:
    """Iranian mobile in 09xxxxxxxxx form, or None for landlines / missing numbers."""
    if not phone:
        return None
    p = "".join(ch for ch in phone.translate(_DIGITS) if ch.isdigit())
    if p.startswith("98"):
        p = "0" + p[2:]
    if p.startswith("9") and len(p) == 10:
        p = "0" + p
    return p if p.startswith("09") and len(p) == 11 else None


def provider_name() -> str:
    choice = settings.SMS_PROVIDER
    if choice == "auto":
        return "kavenegar" if settings.KAVENEGAR_API_KEY else "simulated"
    return choice


def send(shop_phone: str | None, text: str) -> SendResult:
    name = provider_name()
    if name == "simulated":
        return SendResult(ok=True, provider=name, receptor=normalize_mobile(shop_phone) or (shop_phone or ""))
    receptor = normalize_mobile(settings.SMS_TEST_RECEPTOR) or normalize_mobile(shop_phone)
    if not receptor:
        return SendResult(ok=False, provider=name, error="شماره این فروشنده تلفن ثابت است و پیامک دریافت نمی‌کند؛ تماس بگیرید.")
    if name == "kavenegar":
        return _kavenegar(receptor, text)
    return SendResult(ok=False, provider=name, receptor=receptor, error=f"unknown SMS provider: {name}")


def _kavenegar(receptor: str, text: str) -> SendResult:
    url = f"https://api.kavenegar.com/v1/{settings.KAVENEGAR_API_KEY}/sms/send.json"
    params = {"receptor": receptor, "message": text}
    if settings.KAVENEGAR_SENDER:
        params["sender"] = settings.KAVENEGAR_SENDER
    req = urllib.request.Request(url, data=urllib.parse.urlencode(params).encode(), method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:  # Kavenegar reports errors as HTTP 4xx with a JSON body
        try:
            body = json.loads(exc.read().decode("utf-8"))
        except ValueError:
            return SendResult(ok=False, provider="kavenegar", receptor=receptor, error=f"HTTP {exc.code}")
    except Exception as exc:
        log.warning("Kavenegar send failed: %s", exc)
        return SendResult(ok=False, provider="kavenegar", receptor=receptor, error="ارتباط با سرویس پیامک برقرار نشد.")
    status = (body.get("return") or {}).get("status")
    if status != 200:
        msg = (body.get("return") or {}).get("message") or "خطای سرویس پیامک"
        return SendResult(ok=False, provider="kavenegar", receptor=receptor, error=str(msg)[:300])
    entries = body.get("entries") or [{}]
    return SendResult(ok=True, provider="kavenegar", receptor=receptor, ref=str(entries[0].get("messageid", "")))
