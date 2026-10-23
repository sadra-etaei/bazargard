"""Conversational layer. It only ever *uses* search/alternatives/planner results; it never invents products or prices.

Flow: understand (rules + optional LLM) → act (search / refine / alternatives / plan) → answer as cards + chips.
"""
import json

from . import db, llm
from .alternatives import alternatives
from .filters import apply_parsed, chips, to_context
from .query_parser import LANDMARKS, parse
from .search import search
from .textnorm import fa_digits, normalize

PARSE_SYSTEM = """تو «بازارگرد» هستی: یک دستیار گفت‌وگوی صمیمی و کمک‌کننده که در خرید حضوری از بازار تهران (با داده‌های ترب) تخصص دارد، ولی هر موضوعی را می‌توانی با کاربر صحبت کنی.
کاربر با تو «گپ» می‌زند؛ جست‌وجوی کالا فقط یکی از کارهای توست و فقط وقتی باید انجامش بدهی که کاربر واقعاً کالا یا فروشگاه می‌خواهد.
فقط یک JSON برگردان با این کلیدها:
intent: یکی از search|refine|alternatives|plan|compare|greeting|help|chat
  chat = هر چیزی که درخواست مستقیم «پیدا کردن کالا/مغازه» نیست: سؤال، توضیح، مقایسه‌ی مفهومی، مشورت، تردید در انتخاب، گپ، تشکر، و همین‌طور درخواست‌های مبهم خرید.
  برای درخواست مبهم («یه هدیه برای مادرم می‌خوام»، «گوشی خوب می‌خوام») اول یک یا دو سؤال کوتاه شفاف‌کننده بپرس (کاربرد، بودجه، برند، سلیقه) و intent=chat بگذار؛ وقتی اطلاعات کافی شد، intent=search.
  search = کاربر کالای مشخصی می‌خواهد و می‌شود جست‌وجو کرد.
  سؤال درباره‌ی خود محصول (مشخصات، «خوبه؟»، مقایسه‌ی دو مدل، «برای عکاسی بهتره؟»، تفاوت‌ها، عمر باتری، مزایا و معایب) = chat؛ آن را از دانش خودت جواب بده، نه با جست‌وجو.
  دانش خودت درباره‌ی محصولات (مشخصات فنی، مقایسه، نقاط قوت و ضعف، کیفیت، مناسب بودن برای یک کاربرد، مدل‌های جایگزین، نکات خرید) را آزادانه و دقیق به کار ببر؛ لازم نیست جواب فقط از داده‌ی فروشگاه‌ها بیاید. فقط قیمت، موجودی، فروشگاه، آدرس و ساعت کاری باید حتماً از داده بیاید و نباید حدس زده شود.
reply: اگر intent از نوع chat/greeting/help بود، پاسخ کامل خودت به فارسی، دوستانه و طبیعی (کوتاه؛ بیشتر از چند جمله فقط اگر کاربر توضیح خواسته). هیچ قیمت، موجودی یا فروشگاه مشخصی از خودت نساز. اگر مطمئن نیستی بگو. برای intent دیگر خالی بگذار.
product: اگر کاربر درباره‌ی یک یا چند محصول مشخص می‌پرسد، نام/مدل آن(ها) را کوتاه بنویس (مثلاً «Nothing Phone 2a»)؛ سیستم موجودی و قیمت آن را در ترب هم نگاه می‌کند. اگر محصول مشخصی نیست خالی.
suggestions: ۲ تا ۳ پیشنهاد کوتاه (حداکثر ۶ کلمه) که کاربر می‌تواند بعد از پاسخ بزند؛ مثل ادامه‌ی طبیعی گفت‌وگو.
keywords: عبارت کوتاه جست‌وجوی کالا همان‌طور که در عنوان محصول می‌آید (نوع کالا، برند، مدل) — بدون محله، قیمت و زمان. اگر فقط جست‌وجوی قبلی را اصلاح می‌کند خالی.
budget_min, budget_max: عدد تومان یا null («۲ میلیون» = 2000000)
area: نام محله/مکان تهران یا null
open_now: true اگر مغازه باید در زمان مراجعه باز باشد
installments, torobpay, warranty: boolean
refine: فهرستی از cheaper|closer اگر کاربر نتایج قبلی را اصلاح می‌کند
اگر کاربر درباره‌ی «آخرین کالا» یا نتایج قبلی می‌پرسد از context و تاریخچه استفاده کن."""

ANSWER_SYSTEM = """تو دستیار خرید حضوری در تهران هستی. قیمت، موجودی، فروشگاه، آدرس و ساعت کاری را فقط از داده‌های JSON داده‌شده بگو و هیچ‌کدام را از خودت نساز؛ ولی درباره‌ی خود کالاها (ویژگی‌ها، کیفیت، مقایسه، نکته‌های انتخاب) از دانش خودت هم کمک بگیر و آن را با داده ترکیب کن.
۲ تا ۳ جمله کوتاه و صمیمی فارسی بنویس: بهترین گزینه و دلیلش، یک نکته احتیاط (مثلاً قدیمی بودن قیمت، تأییدنشده بودن موجودی یا ساعت کاری)، و قدم بعدی (تماس، افزودن به لیست مراجعه یا مقایسه).
قیمت ثبت‌شده را «قیمت ثبت‌شده در ترب» بنام، نه قیمت قطعی. موجودی را قطعی نگو مگر stock=confirmed باشد.
اگر after_hours در داده بود، اول بگو نزدیک کاربر همه‌چیز بسته است، بعد نزدیک‌ترین گزینه باز در ترب (اگر هست) و بعد محدوده‌ای که ممکن است فروشگاه باز و ثبت‌نشده داشته باشد؛ بگو این آخری برآورد است و تأیید نشده.
در پایان، اگر لازم بود، یک سؤال کوتاه برای دقیق‌تر شدن انتخاب بپرس (کاربرد، بودجه، برند یا زمان رفتن) تا مثل یک فروشنده‌ی باتجربه گفت‌وگو کنی نه یک موتور جست‌وجو.
اگر history داده شد، مثل ادامه‌ی همان گفت‌وگو جواب بده و جمله‌های قبلی را تکرار نکن. هر بار طبیعی و متفاوت بنویس، نه قالب ثابت."""

HELP_TEXT = ("می‌تونم کالا رو در مغازه‌های تهران پیدا کنم، قیمت‌ها و فاصله رو مقایسه کنم، بگم کدوم مغازه موقع رسیدنت بازه، "
             "قبل از رفتن پیام استعلام موجودی آماده کنم و اگه نداشتن، جایگزین پیشنهاد بدم. مثلاً بنویس: "
             "«هندزفری بلوتوث زیر ۲ میلیون نزدیک جمهوری که الان باز باشه»")


def _llm_parse(message: str, state: dict) -> dict | None:
    if not llm.enabled():
        return None
    ctx = {"previous_keywords": state.get("filters", {}).get("q"), "previous_product": state.get("product_title"),
           "area": state.get("filters", {}).get("area")}
    hist = []
    for h in (state.get("history") or [])[-6:]:
        hist += [{"role": "user", "content": h["user"]}, {"role": "assistant", "content": h["assistant"]}]
    return llm.chat_json(PARSE_SYSTEM, f"context: {json.dumps(ctx, ensure_ascii=False)}\nmessage: {message}", max_tokens=700,
                         temperature=0.5, history=hist)


def _merge_llm(p, data: dict | None):
    if not data:
        return p
    kw = (data.get("keywords") or "").strip()
    if kw:
        p.keywords = normalize(kw)
    if data.get("intent") in ("search", "refine", "alternatives", "plan", "compare", "greeting", "help", "chat"):
        if not (p.intent == "alternatives" and data["intent"] == "search"):
            p.intent = data["intent"]
    for k in ("budget_min", "budget_max"):
        if getattr(p, k) is None and isinstance(data.get(k), (int, float)) and data[k] > 0:
            setattr(p, k, int(data[k]))
    if p.lat is None and data.get("area"):
        name = normalize(data["area"])
        hit = LANDMARKS.get(name) or next(((a["lat"], a["lon"]) for a in db.areas() if a["norm"] == name), None)
        if hit:
            p.area, (p.lat, p.lon) = data["area"], hit
    p.open_at_visit = p.open_at_visit or bool(data.get("open_now"))
    p.installments = p.installments or bool(data.get("installments"))
    p.torobpay = p.torobpay or bool(data.get("torobpay"))
    p.warranty = p.warranty or bool(data.get("warranty"))
    for r in data.get("refine") or []:
        if r in ("cheaper", "closer") and r not in p.refine:
            p.refine.append(r)
    if p.intent == "search" and not p.keywords and p.refine:
        p.intent = "refine"
    return p


def handle(message: str, state: dict, device_id: str | None = None) -> dict:
    state = dict(state or {})
    filters = dict(state.get("filters") or {})
    p = parse(message)
    # The rules already understand most requests; only ask the model to parse when they found nothing usable
    # (saves a slow round trip per message).
    decision = None
    if llm.enabled() and _needs_router(message, p):
        decision = _llm_parse(message, state)
        p = _merge_llm(p, decision)

    if p.intent in ("chat", "greeting", "help") and llm.enabled():
        text = ((decision or {}).get("reply") or "").strip()
        res = None
        product = ((decision or {}).get("product") or "").strip()
        if product and p.intent == "chat":
            # The model answers from its own knowledge; what Tehran shops actually list is added from the data.
            res = search(normalize(product), to_context(apply_parsed(filters, p, new_search=False), device_id), page_size=4)
            if res["total"]:
                text = _llm_chat(message, state, market=_market_data(res)) or text
            else:
                res = None
        text = text or _llm_chat(message, state)
        if text:
            sugg = [x for x in ((decision or {}).get("suggestions") or []) if isinstance(x, str)][:3]
            if product:  # a knowledge answer stays a conversation; searching is one tap away
                sugg = ([f"«{product}» را در بازار تهران پیدا کن"] + sugg)[:3]
            return _reply(state, filters, text, suggestions=sugg or _chat_suggestions(state), user=message)

    if p.intent == "greeting" or (p.intent == "help" and not p.keywords):
        return _reply(state, filters, "سلام! " + HELP_TEXT, suggestions=_starter_suggestions())

    if p.intent == "alternatives" and state.get("product_id") and not p.keywords:
        filters = apply_parsed(filters, p, new_search=False)
        ctx = to_context(filters, device_id)
        alt = alternatives(state["product_id"], ctx, exclude_shop=state.get("shop_id"))
        if alt:
            n_same, n_sim = len(alt["same_product"]), len(alt["similar"])
            text = (f"اشکالی نداره! همین کالا رو {fa_digits(n_same)} فروشنده دیگه هم ثبت کردن" if n_same else
                    "فروشنده دیگه‌ای همین کالا رو در فیلترهای شما نداره")
            text += f" و {fa_digits(n_sim)} کالای مشابه هم پیدا کردم." if n_sim else "."
            if alt["same_mall"]:
                text += f" {fa_digits(len(alt['same_mall']))} تاشون توی همین پاساژن، لازم نیست جای دیگه بری."
            text = _llm_say(message, "alternatives", {"same_product_shops": n_same, "similar_products": n_sim,
                                                                     "same_mall": len(alt["same_mall"]), "best_next": (alt.get("best_next") or {}).get("tradeoff")}, state.get("history")) or text
            return _reply(state, filters, text, alternatives=alt, user=message,
                          suggestions=["ارزون‌تر", "نزدیک‌تر", "فقط گارانتی‌دار"])

    if p.intent == "plan":
        return _reply(state, filters, "مغازه‌هایی که به «لیست مراجعه» اضافه کردی رو به ترتیب بهینه می‌چینم و ساعت رسیدن و باز بودن هر کدوم رو چک می‌کنم.",
                      action="open_visits")

    new_search = bool(p.keywords) and p.intent != "refine"
    if not new_search and not filters.get("q"):
        return _reply(state, filters, "چی می‌خوای بخری؟ اسم کالا (و اگه بخوای برند، بودجه و محدوده) رو بنویس.",
                      suggestions=_starter_suggestions())
    filters = apply_parsed(filters, p, new_search=new_search)
    if "cheaper" in p.refine and state.get("best_price"):
        filters["budget_max"] = int(state["best_price"] * 0.95)
    if "closer" in p.refine:
        filters["radius"] = max(1, (filters.get("radius") or 6) / 2)
        filters["priority"] = "near"

    ctx = to_context(filters, device_id)
    res = search(filters.get("q", ""), ctx, page_size=6)
    state["filters"] = filters

    if res["total"] == 0:
        if res["relax"]:
            r = res["relax"][0]
            text = f"با این شرایط چیزی پیدا نشد. اگه {r['label']}، {fa_digits(r['products'])} کالا پیدا می‌شه."
        else:
            text = res["notices"][-1]
        text = _llm_say(message, "no_results", {"suggestions": [x["label"] for x in res["relax"][:3]], "fallback": text}, state.get("history")) or text
        return _reply(state, filters, text, search=res, suggestions=[x["label"] for x in res["relax"][:3]], user=message)

    top = res["products"][0]
    state.update(product_id=top["product_id"], product_title=top["title"], shop_id=top["best"]["shop"]["shop_id"],
                 best_price=top["best"]["price"])

    clarify = []
    cats = res["facets"]["categories"]
    if not filters.get("category") and len(cats) >= 3 and cats[0]["count"] < 0.6 * res["total"]:
        clarify = [c["name"] for c in cats[:4]]

    text = _llm_answer(message, res, state.get("history")) or _template_answer(res, filters)
    suggestions = ["ارزون‌تر", "نزدیک‌تر", "فقط مغازه‌های باز"]
    if not filters.get("warranty"):
        suggestions.append("فقط گارانتی‌دار")
    return _reply(state, filters, text, search=res, clarify=clarify, suggestions=suggestions, user=message)


def _template_answer(res: dict, filters: dict) -> str:
    top = res["products"][0]
    best = top["best"]
    shop = best["shop"]
    price = f"{fa_digits(f'{best['price']:,}')} تومان" if best["price"] else "قیمت نامشخص"
    where = shop["mall"] or shop["area"] or ""
    s = f"{fa_digits(res['total'])} کالا پیدا کردم. پیشنهاد اول: «{top['title']}» از {shop['name']}"
    s += f" ({where})" if where else ""
    s += f" با قیمت ثبت‌شده {price}."
    if best["reasons"]:
        s += " دلیل: " + "، ".join(best["reasons"][:2]) + "."
    if best["warnings"]:
        s += " توجه: " + best["warnings"][0] + "."
    if best["stock"]["state"] in ("confirmed", "price_changed"):
        s += f" {best['stock']['label']}."
    else:
        s += " قبل از رفتن «استعلام» بزن تا بازارگرد با پیامک یا تماس خودکار از فروشنده بپرسد."
    return s


def _llm_answer(message: str, res: dict, history: list | None = None) -> str | None:
    if not llm.enabled():
        return None
    compact = []
    for p in res["products"][:3]:
        b = p["best"]
        compact.append({"title": p["title"], "shops_matching": p["matching_offers"], "price_toman": b["price"],
                        "price_age": b["price_age"]["label"], "shop": b["shop"]["name"], "mall": b["shop"]["mall"],
                        "distance_km": b["shop"]["distance_km"], "open": b["shop"]["status"]["label"],
                        "stock": b["stock"]["state"], "warranty": (b["warranty"] or {}).get("label"),
                        "reasons": b["reasons"], "warnings": b["warnings"]})
    data = {"user": message, "total_products": res["total"], "top": compact, "history": (history or [])[-4:]}
    ah = res.get("after_hours")
    if ah:
        data["after_hours"] = {"time": ah["visit_label"], "closed_nearby": ah["closed_near_count"],
                               "open_on_torob_farther": [{"shop": o["offer"]["shop"]["name"], "km": o["offer"]["shop"]["distance_km"],
                                                          "price_toman": o["offer"]["price"]} for o in ah["open_far"][:2]],
                               "nearby_cluster": ah["hub"] and {"name": ah["hub"]["name"], "shops": ah["hub"]["matching"],
                                                                "open": ah["hub"]["open_count"], "unknown_hours": ah["hub"]["unknown_count"]}}
    return llm.chat(ANSWER_SYSTEM, json.dumps(data, ensure_ascii=False), max_tokens=380, temperature=0.6)


CHAT_CUES = ("فکر می‌کنم", "فکر میکنم", "نظرت", "کمکم کن", "کمک کن", "نمی‌دونم", "نمیدونم", "مطمئن نیستم", "تردید", "هدیه",
             "بهترین", "کدوم", "کدام", "برای مادر", "برای پدر", "برای همسر", "برای بچه", "پیشنهاد")

QUESTION_WORDS = ("چرا", "چطور", "چگونه", "چیه", "چی هست", "چیست", "کیه", "کی هستی", "آیا", "یعنی چی", "توضیح", "فرق", "تفاوت",
                  "بهتره", "پیشنهاد", "راهنمایی", "چند سال", "مزایا", "معایب", "کمک", "مرسی", "ممنون", "سپاس", "خداحافظ")

CHAT_SYSTEM = """تو «بازارگرد» هستی؛ دستیار خرید حضوری در بازار تهران که با داده‌های ترب کار می‌کند و یک دستیار گفت‌وگوی عمومی هم هستی.
به هر پرسشی (خرید، فنی، آموزشی، عمومی، حتی گپ دوستانه) صمیمی و روشن به فارسی جواب بده؛ کوتاه بنویس مگر اینکه کاربر توضیح بیشتری بخواهد.
دانش خودت درباره‌ی محصولات را آزادانه به کار ببر (مشخصات، مقایسه، نقاط قوت و ضعف، توصیه‌ی انتخاب)؛ با اعتماد به نفس و دقیق جواب بده و اگر درباره‌ی یک مدل مطمئن نیستی همان را بگو.
قواعد: هیچ قیمت، موجودی، آدرس یا فروشگاه مشخصی از خودت نساز. اگر market_data در context بود (ممکن است شامل لوازم جانبی یا قطعه‌ی همان مدل باشد، نه خود کالا؛ در این صورت از آن استفاده نکن)، قیمت و دسترسی در بازار تهران را فقط از آن بگو (به‌صورت «قیمت ثبت‌شده در ترب») و آن را با دانش خودت درباره‌ی محصول ترکیب کن؛ اگر نبود، بگو موجودی و قیمت را باید جست‌وجو یا استعلام کرد.
اگر مطمئن نیستی بگو مطمئن نیستی. اگر سؤال ربطی به خرید دارد، در یک جمله آخر پیشنهاد بده که اگر خواست، کالای موردنظرش را بنویسد تا در مغازه‌های اطراف پیدا کنی.
اگر کاربر درباره‌ی «آخرین کالا» یا نتایج قبلی می‌پرسد، از context استفاده کن."""


def _needs_router(message: str, p) -> bool:
    """Only a short, unmistakable product search or a one-word refinement skips the model; everything else is a conversation."""
    m = message.strip()
    words = m.split()
    if p.refine and not p.keywords and len(words) <= 3:
        return False  # "ارزون‌ترش" / "نزدیک‌تر"
    clear_search = bool(p.keywords) and len(words) <= 6 and not ("?" in m or "؟" in m) \
        and not any(w in m for w in QUESTION_WORDS) and not any(w in m for w in CHAT_CUES)
    return not clear_search


def _chat_context(state: dict) -> str:
    bits = []
    if state.get("product_title"):
        bits.append(f"آخرین کالایی که کاربر دید: {state['product_title']}")
    f = state.get("filters") or {}
    if f.get("q"):
        bits.append(f"آخرین جست‌وجو: {f['q']}")
    if f.get("area"):
        bits.append(f"محدوده: {f['area']}")
    return "context: " + ("؛ ".join(bits) if bits else "ندارد")


def _llm_chat(message: str, state: dict, market: dict | None = None) -> str | None:
    """Free conversation with the model, using the running history so follow-ups work."""
    hist = []
    for h in (state.get("history") or [])[-8:]:
        hist += [{"role": "user", "content": h["user"]}, {"role": "assistant", "content": h["assistant"]}]
    ctx = _chat_context(state)
    if market:
        ctx += "\nmarket_data: " + json.dumps(market, ensure_ascii=False)
    return llm.chat(CHAT_SYSTEM + "\n" + ctx, message, max_tokens=700, temperature=0.7, history=hist)


def _chat_suggestions(state: dict) -> list[str]:
    if state.get("product_title"):
        return ["نزدیک‌ترین فروشنده‌اش کجاست؟", "ارزون‌ترش رو می‌خوام", "یه جایگزین پیشنهاد بده"]
    return _starter_suggestions()[:3]


def _market_data(res: dict) -> dict:
    """What Tehran shops list right now for the product being discussed (prices are registered, not confirmed)."""
    out = []
    for p in res["products"][:4]:
        b = p["best"]
        out.append({"title": p["title"], "shops_listing": p["matching_offers"], "lowest_registered_price_toman": b["price"],
                    "price_age": b["price_age"]["label"], "shop": b["shop"]["name"], "mall": b["shop"]["mall"],
                    "distance_km": b["shop"]["distance_km"], "open": b["shop"]["status"]["label"]})
    return {"found": res["total"], "top": out}


def _llm_say(message: str, kind: str, data: dict, history: list | None) -> str | None:
    """Let the model phrase non-search answers too (alternatives, nothing found) from facts we computed."""
    if not llm.enabled():
        return None
    payload = {"kind": kind, "user": message, "facts": data, "history": (history or [])[-4:]}
    return llm.chat(ANSWER_SYSTEM + "\nفقط از facts استفاده کن.", json.dumps(payload, ensure_ascii=False), max_tokens=220, temperature=0.6)


def _starter_suggestions():
    return ["دوربین مداربسته وای‌فای زیر ۳ میلیون", "هندزفری بلوتوث نزدیک جمهوری", "ال سی دی آیفون ۱۱ با گارانتی",
            "کلید مینیاتوری اشنایدر"]


def _reply(state, filters, text, *, search=None, alternatives=None, clarify=None, suggestions=None, action=None, user=None):
    state["filters"] = filters
    if user:  # short memory so follow-ups ("ارزون‌ترش") read as one conversation
        state["history"] = [*(state.get("history") or []), {"user": user, "assistant": text[:400]}][-6:]
    return {"reply": text, "state": state, "filters": filters, "chips": chips(filters), "search": search,
            "alternatives": alternatives, "clarify": clarify or [], "suggestions": suggestions or [], "action": action,
            "llm": llm.enabled()}
