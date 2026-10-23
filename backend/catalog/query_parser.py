"""Rule-based Persian query understanding: budget, place, visit time, purchase conditions, intent.

Used directly when no LLM is configured, and as a safety net that validates/fills LLM output.
"""
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta

from . import db
from .hours import TEHRAN, WEEKDAY_KEYS
from .textnorm import fa_digits, normalize

# Well-known Tehran places that shoppers name but that are not dataset neighbourhood labels.
LANDMARKS = {
    "ونک": (35.7575, 51.4097), "تجریش": (35.8045, 51.4335), "میدان انقلاب": (35.7010, 51.3910),
    "انقلاب": (35.7010, 51.3910), "میدان ازادی": (35.6997, 51.3380), "ازادی": (35.6997, 51.3380),
    "میدان ولیعصر": (35.7111, 51.4070), "ولیعصر": (35.7111, 51.4070), "میدان امام خمینی": (35.6858, 51.4210),
    "توپخانه": (35.6858, 51.4210), "میدان فردوسی": (35.7023, 51.4185), "جمهوری": (35.6960, 51.4080),
    "علاالدین": (35.6955, 51.4072), "علا الدین": (35.6955, 51.4072), "چارسو": (35.6957, 51.4126),
    "لاله زار": (35.6930, 51.4230), "منوچهری": (35.6950, 51.4210), "بازار بزرگ": (35.6730, 51.4230),
    "بازار تهران": (35.6730, 51.4230), "هفت تیر": (35.7155, 51.4260), "صادقیه": (35.7240, 51.3330),
    "ستارخان": (35.7140, 51.3530), "پونک": (35.7620, 51.3300), "نارمک": (35.7400, 51.5030),
    "تهرانپارس": (35.7350, 51.5350), "میرداماد": (35.7590, 51.4330), "پیروزی": (35.6910, 51.4720),
    "نازی اباد": (35.6380, 51.4040), "شهرک غرب": (35.7580, 51.3700), "سعادت اباد": (35.7800, 51.3700),
    "جردن": (35.7700, 51.4180), "ولنجک": (35.8090, 51.4060), "میدان توحید": (35.7040, 51.3720),
    "امیراباد": (35.7260, 51.3920), "یوسف اباد": (35.7300, 51.4050), "جنت اباد": (35.7550, 51.3050),
    "سعدی": (35.6950, 51.4170), "حافظ": (35.6990, 51.4110), "امام خمینی": (35.6858, 51.4210),
    "شریعتی": (35.7400, 51.4430), "رسالت": (35.7380, 51.4870), "پاسداران": (35.7700, 51.4650),
    "مطهری": (35.7240, 51.4250), "کریمخان": (35.7140, 51.4180), "گیشا": (35.7330, 51.3790),
}

STOPWORDS = set(normalize("""
میخوام می خوام میخواهم می خواهم میخواستم دنبال یه یک برای نزدیک نزدیکی نزدیکه کجا بخرم خرید بخرم بگیرم
لطفا لطفاً سلام با که و از در توی تو رو را هست داره دارن دارد باشه باشد قیمت ارزون ارزان خوب بهترین مغازه
فروشگاه فروشنده ای اینجا اونجا جایی حوالی اطراف محدوده چی چه چند کدوم کدام میشه می شه بده بدید پیدا کن کنید
تومن تومان هزار میلیون م زیر تا بین حداکثر حداقل کمتر بیشتر بالای حدود الان امروز فردا امشب عصر صبح ظهر شب ساعت
باز بسته قسطی قسط اقساط گارانتی ضمانت دار اصل نو حضوری حضورا برم برو بریم میرم من ما به هم همین فقط ولی اگه اگر
مدل جدید یکی دونه عدد دستگاه نوع خرید یا رنگ میخوایم بفرمایید لازم دارم احتیاج نیاز
ها های تر ترین ارزونتر ارزانتر نزدیکتر مغازه ها موجود نبود نیست نداشت نداشتن نداره جایگزین مشابه داری دارید
بجاش جاش چیز چیزی دیگه دیگر بهتر مطمئن معتبر میخوام اونو اینو همون فقط
""").split())

_NUM = r"(\d+(?:[.,/]\d+)?)"
_UNIT = r"\s*(میلیون|ملیون|م\b|هزار|ک\b|تومن|تومان|میلیارد)?"
_MONEY = _NUM + _UNIT


def _money(num: str, unit: str | None) -> int:
    n = float(num.replace(",", ".").replace("/", "."))
    unit = (unit or "").strip()
    if unit in ("میلیون", "ملیون", "م"):
        return int(n * 1_000_000)
    if unit == "میلیارد":
        return int(n * 1_000_000_000)
    if unit in ("هزار", "ک"):
        return int(n * 1_000)
    # Bare small numbers in a price context are market slang for millions ("زیر ۲ تومن").
    if n < 1000:
        return int(n * 1_000_000)
    return int(n)


@dataclass
class ParsedQuery:
    intent: str = "search"  # search | refine | alternatives | plan | compare | greeting | help
    keywords: str = ""
    budget_min: int | None = None
    budget_max: int | None = None
    area: str | None = None
    lat: float | None = None
    lon: float | None = None
    visit_at: str | None = None  # ISO datetime (Tehran)
    visit_label: str | None = None
    open_at_visit: bool = False
    installments: bool = False
    torobpay: bool = False
    warranty: bool = False
    fast_delivery: bool = False
    priority: str | None = None  # price | near | reliable
    refine: list[str] = field(default_factory=list)
    spans: list[str] = field(default_factory=list)  # human-readable things we understood

    def to_dict(self):
        return asdict(self)


def parse(text: str, now: datetime | None = None) -> ParsedQuery:
    now = (now or datetime.now(TEHRAN)).astimezone(TEHRAN)
    t = " " + normalize(text) + " "
    p = ParsedQuery()
    consumed: list[str] = []

    if re.fullmatch(r"\s*(سلام|درود|hi|hello)[\s!]*", t):
        p.intent = "greeting"
        return p

    # --- budget ------------------------------------------------------------------------------
    m = re.search(rf"بین\s*{_MONEY}\s*(?:و|تا|-)\s*{_MONEY}", t)
    if m:
        lo_unit = m.group(2) or m.group(4)
        p.budget_min, p.budget_max = _money(m.group(1), lo_unit), _money(m.group(3), m.group(4))
        consumed.append(m.group(0))
    else:
        m = re.search(rf"(زیر|کمتر از|کمتر|تا|حداکثر|ارزانتر از|ارزون تر از|ارزان تر از|نهایتا|سقف)\s*{_MONEY}", t)
        if m:
            p.budget_max = _money(m.group(2), m.group(3))
            consumed.append(m.group(0))
        m2 = re.search(rf"(بالای|بیشتر از|حداقل|از)\s*{_MONEY}\s*(?:به بالا|بالاتر)?", t)
        if m2 and (m2.group(1) != "از" or "بالا" in m2.group(0)):
            p.budget_min = _money(m2.group(2), m2.group(3))
            consumed.append(m2.group(0))
        m3 = re.search(rf"(حدود|حدودا|در حد|تقریبا)\s*{_MONEY}", t)
        if m3 and not p.budget_max:
            v = _money(m3.group(2), m3.group(3))
            p.budget_min, p.budget_max = int(v * 0.8), int(v * 1.2)
            consumed.append(m3.group(0))
        m4 = re.search(rf"{_NUM}\s*(میلیون|ملیون|تومن|تومان|هزار تومن|هزار تومان)\b", t)
        if m4 and not (p.budget_max or p.budget_min) and m4.group(0) not in " ".join(consumed):
            p.budget_max = _money(m4.group(1), m4.group(2).split()[0])
            consumed.append(m4.group(0))
    if p.budget_max or p.budget_min:
        p.spans.append("بودجه")

    # --- place -------------------------------------------------------------------------------
    best = None  # (label, lat, lon, matched text)
    for name, (lat, lon) in LANDMARKS.items():
        if f" {name} " in t and (not best or len(name) > len(best[3])):
            best = (name, lat, lon, name)
    for a in db.areas():
        n = a["norm"]
        if n and len(n) >= 3 and f" {n} " in t and (not best or len(n) > len(best[3])):
            best = (a["label"], a["lat"], a["lon"], n)
    for mall in db.malls()[:400]:
        key = mall["mall_key"]
        if not key or len(key) < 4:
            continue
        for form in (f"پاساژ {key}", f"مجتمع {key}", key):
            # A bare mall name only counts when it is not already a better-known landmark.
            if f" {form} " in t and (not best or len(form) > len(best[3])):
                best = (mall["name"], mall["lat"], mall["lon"], form)
                break
    if best:
        p.area, p.lat, p.lon = best[:3]
        consumed.append(best[3])
        for prefix in ("نزدیک ", "حوالی ", "اطراف ", "توی ", "در "):
            consumed.append(prefix + best[3])
        p.spans.append("محدوده")

    # --- visit time --------------------------------------------------------------------------
    day = now
    day_word = None
    if " پس فردا " in t or " پسفردا " in t:
        day, day_word = now + timedelta(days=2), "پس‌فردا"
    elif " فردا " in t:
        day, day_word = now + timedelta(days=1), "فردا"
    else:
        for i, key in enumerate(["دوشنبه", "سه شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه", "یکشنبه"]):
            if f" {key} " in t:
                target = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"][i]
                delta = (WEEKDAY_KEYS.index(target) - now.weekday()) % 7
                day, day_word = now + timedelta(days=delta or 7), key
                break
    hour, minute = None, 0
    m = re.search(r"ساعت\s*(\d{1,2})(?:\s+([0-5]\d)(?!\d|\s*(?:تومن|تومان|میلیون|هزار)))?", t)
    if m:
        h = int(m.group(1))
        minute = int(m.group(2) or 0)
        consumed.append(m.group(0))
        if " شب " in t or " امشب " in t:
            hour = h + 12 if 5 <= h < 12 else h  # "۱۱:۳۰ شب" is 23:30, "۱ شب" is 01:00
        elif " عصر " in t or " بعدازظهر " in t or (" ظهر " in t and h < 6):
            hour = h + 12 if h < 12 else h
        elif " صبح " in t:
            hour = h
        else:
            hour = h + (12 if h < 9 else 0)
    elif " صبح " in t:
        hour = 10
    elif " ظهر " in t:
        hour = 13
    elif " عصر " in t or " بعدازظهر " in t:
        hour = 17
    elif " امشب " in t or " شب " in t:
        hour = 20
    if day_word or hour is not None:
        if hour is None:
            hour = 11 if day_word else now.hour
        p.visit_at = day.replace(hour=hour % 24, minute=minute, second=0, microsecond=0).isoformat()
        clock = f"{hour % 24}" + (f":{minute:02d}" if minute else "")
        p.visit_label = " ".join(x for x in [day_word or "امروز", f"ساعت {fa_digits(clock)}" if hour else None] if x)
        p.open_at_visit = True
        p.spans.append("زمان مراجعه")
    if re.search(r" (الان|همین الان|فوری|فورا|همین حالا|باز باشه|باز باشد|بازه|باز) ", t):
        p.open_at_visit = True
        if not p.visit_at:
            p.visit_label = "الان"
            p.spans.append("باز بودن")

    # --- conditions --------------------------------------------------------------------------
    if re.search(r"قسط|اقساط|قسطی| وام ", t):
        p.installments = True
        p.spans.append("خرید قسطی")
    if re.search(r"ترب ?پی", t):
        p.torobpay = True
        p.spans.append("ترب‌پی")
    if re.search(r"گارانتی|ضمانت|وارانتی", t):
        p.warranty = True
        p.spans.append("گارانتی")
    if re.search(r"ارسال فوری|پیک|ارسال سریع", t):
        p.fast_delivery = True

    # --- intent & refinements ----------------------------------------------------------------
    if re.search(r"نداشت|ناموجود|تموم کرده|تمام کرده|موجود نبود|موجود نیست|نیست|جایگزین|مشابه|بجاش|به جاش", t):
        p.intent = "alternatives"
    if re.search(r"مسیر|برنامه|ترتیب|کدوم اول|چطوری برم", t):
        p.intent = "plan"
    if re.search(r"مقایسه|فرقش|فرق|کدوم بهتره|کدام بهتر", t):
        p.intent = "compare"
    m = re.search(r"(?:ارزون|ارزان) ?(?:تر(?:ین)?)?(?:ش|ه|ی)?(?= |$)", t)
    if m and re.search(r"ارزون ?تر|ارزان ?تر|ارزونش|ارزانش|ارزانترین|ارزون ترین", t):
        p.refine.append("cheaper")
        p.priority = "price"
        consumed.append(m.group(0).strip())
    m = re.search(r"نزدیک ?تر(?:ین)?(?:ش|ه|ی)?(?= |$)", t)
    if m:
        p.refine.append("closer")
        p.priority = "near"
        consumed.append(m.group(0).strip())
    if re.search(r"مطمئن|معتبر|قابل اعتماد|اصل", t):
        p.priority = p.priority or "reliable"

    # --- keywords: whatever is left ----------------------------------------------------------
    rest = t
    for c in sorted(consumed, key=len, reverse=True):
        rest = rest.replace(c, " ")
    # Numbers left here are model numbers ("آیفون 11", "a55"), not prices — keep them.
    words = [w for w in rest.split() if w not in STOPWORDS and (len(w) > 1 or w.isdigit())]
    p.keywords = " ".join(words)
    if not p.keywords and p.intent == "search" and (p.refine or p.spans):
        p.intent = "refine"
    return p
