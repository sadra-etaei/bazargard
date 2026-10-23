"""User-side data. The catalog itself (shops/products/offers) is a read-only SQLite file, see catalog.db."""
from django.db import models


class StockReport(models.Model):
    """What a shopper learned by calling or visiting: the only source of "confirmed" stock."""

    class Status(models.TextChoices):
        IN_STOCK = "in_stock", "موجود است"
        OUT_OF_STOCK = "out_of_stock", "موجود نیست"
        PRICE_CHANGED = "price_changed", "قیمت تغییر کرده"
        SHOP_CLOSED = "shop_closed", "مغازه بسته بود"

    class Source(models.TextChoices):
        CALL = "call", "تماس تلفنی"
        VISIT = "visit", "مراجعه حضوری"
        MESSAGE = "message", "پیام"
        SELLER = "seller", "پاسخ خود فروشنده"

    device_id = models.CharField(max_length=64, db_index=True)
    shop_id = models.CharField(max_length=64, db_index=True)
    product_id = models.CharField(max_length=64, db_index=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices)
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.CALL)
    price = models.BigIntegerField(null=True, blank=True)
    note = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "گزارش موجودی"
        verbose_name_plural = "گزارش‌های موجودی"


class VisitItem(models.Model):
    """A shop (optionally for a product) in the shopper's trip list."""

    class State(models.TextChoices):
        PLANNED = "planned", "برنامه‌ریزی‌شده"
        VISITED = "visited", "مراجعه شد"
        BOUGHT = "bought", "خریداری شد"
        SKIPPED = "skipped", "لغو شد"

    device_id = models.CharField(max_length=64, db_index=True)
    shop_id = models.CharField(max_length=64)
    product_id = models.CharField(max_length=64, blank=True)
    offer_id = models.CharField(max_length=64, blank=True)
    state = models.CharField(max_length=10, choices=State.choices, default=State.PLANNED)
    paid_price = models.BigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]
        verbose_name = "مقصد مراجعه"
        verbose_name_plural = "لیست مراجعه"


class ShoppingListItem(models.Model):
    """A need ("هندزفری بلوتوث زیر ۲ میلیون") the shopper wants to buy, possibly with others in one trip."""

    device_id = models.CharField(max_length=64, db_index=True)
    query = models.CharField(max_length=200)
    product_id = models.CharField(max_length=64, blank=True)
    filters = models.JSONField(default=dict, blank=True)
    done = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        verbose_name = "قلم خرید"
        verbose_name_plural = "لیست خرید"


class Inquiry(models.Model):
    """A stock/price question sent to a seller by SMS (reply link) or automatic call (keypad answer)."""

    class Status(models.TextChoices):
        SENT = "sent", "ارسال شد"
        FAILED = "failed", "ارسال نشد"
        ANSWERED = "answered", "فروشنده پاسخ داد"
        EXPIRED = "expired", "بی‌پاسخ ماند"

    class Channel(models.TextChoices):
        SMS = "sms", "پیامک"
        CALL = "call", "تماس خودکار"

    device_id = models.CharField(max_length=64, db_index=True)
    token = models.CharField(max_length=32, unique=True)
    channel = models.CharField(max_length=5, choices=Channel.choices, default=Channel.SMS)
    shop_id = models.CharField(max_length=64, db_index=True)
    product_id = models.CharField(max_length=64, blank=True)
    offer_id = models.CharField(max_length=64, blank=True)
    visit_label = models.CharField(max_length=60, blank=True)
    receptor = models.CharField(max_length=20, blank=True)
    message = models.TextField()
    provider = models.CharField(max_length=20)
    provider_ref = models.CharField(max_length=64, blank=True)
    error = models.CharField(max_length=300, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SENT)
    answer = models.CharField(max_length=20, choices=StockReport.Status.choices, blank=True)
    answer_price = models.BigIntegerField(null=True, blank=True)
    answer_note = models.CharField(max_length=300, blank=True)
    seen = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    answered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "استعلام پیامکی"
        verbose_name_plural = "استعلام‌های پیامکی"
