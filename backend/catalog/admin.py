from django.contrib import admin

from .models import Inquiry, ShoppingListItem, StockReport, VisitItem


@admin.register(StockReport)
class StockReportAdmin(admin.ModelAdmin):
    list_display = ("created_at", "shop_id", "product_id", "status", "source", "price", "device_id")
    list_filter = ("status", "source")
    search_fields = ("shop_id", "product_id", "device_id")


@admin.register(VisitItem)
class VisitItemAdmin(admin.ModelAdmin):
    list_display = ("created_at", "device_id", "shop_id", "product_id", "state", "paid_price")
    list_filter = ("state",)


@admin.register(ShoppingListItem)
class ShoppingListItemAdmin(admin.ModelAdmin):
    list_display = ("created_at", "device_id", "query", "product_id", "done")


@admin.register(Inquiry)
class InquiryAdmin(admin.ModelAdmin):
    list_display = ("created_at", "channel", "provider", "shop_id", "status", "answer", "answer_price", "receptor")
    list_filter = ("channel", "provider", "status", "answer")
    search_fields = ("shop_id", "product_id", "token", "device_id")
    readonly_fields = ("token", "message")
