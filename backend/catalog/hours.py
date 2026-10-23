"""Weekly opening hours: normalise the dataset format and answer "open at time t?"."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

TEHRAN = ZoneInfo("Asia/Tehran")
# Python weekday(): Mon=0 … Sun=6
WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DAY_NAMES_FA = {"sat": "شنبه", "sun": "یکشنبه", "mon": "دوشنبه", "tue": "سه‌شنبه",
                "wed": "چهارشنبه", "thu": "پنجشنبه", "fri": "جمعه"}
WEEK_ORDER = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"]


def _minutes(hhmmss: str) -> int:
    h, m, *_ = hhmmss.split(":")
    return int(h) * 60 + int(m)


def normalize_week(raw: dict | None) -> dict | None:
    """Return {day: {"s": "open"|"closed"|"unknown"|"allday", "shifts": [[start, end], ...]}} or None.

    Torob's "declared 00:00-00:00" means the shop is open that day without stated hours,
    so it becomes "allday"-unknown ("unknown" hours, but not closed).
    """
    if not raw:
        return None
    week = {}
    for day in WEEK_ORDER:
        v = raw.get(day)
        if not v or v.get("status") == "unsupported":
            week[day] = {"s": "unknown", "shifts": []}
            continue
        if v.get("status") == "closed":
            week[day] = {"s": "closed", "shifts": []}
            continue
        shifts = []
        for sh in v.get("shifts", []):
            start, end = _minutes(sh["start_time"]), _minutes(sh["end_time"])
            if start == end:
                continue
            if end < start:
                end += 1440
            shifts.append([start, end])
        week[day] = {"s": "open", "shifts": shifts} if shifts else {"s": "allday", "shifts": []}
    return week


def status_at(week: dict | None, when: datetime) -> dict:
    """Open state at `when` (Tehran time), with Persian-digit labels.

    state: open | closed | closing_soon | open_no_hours | unknown
    """
    from .textnorm import fa_digits

    s = _status_at(week, when)
    s["label"] = fa_digits(s["label"])
    if s.get("next_open"):
        s["next_open"] = fa_digits(s["next_open"])
    return s


def _status_at(week: dict | None, when: datetime) -> dict:
    if not week:
        return {"state": "unknown", "label": "ساعت کاری نامشخص"}
    when = when.astimezone(TEHRAN)
    day = WEEKDAY_KEYS[when.weekday()]
    info = week.get(day) or {"s": "unknown"}
    minute = when.hour * 60 + when.minute
    # Shifts from the previous day that run past midnight.
    prev = week.get(WEEKDAY_KEYS[(when.weekday() - 1) % 7]) or {}
    for start, end in prev.get("shifts", []):
        if end > 1440 and minute < end - 1440:
            return _open_label(end - 1440 - minute, end - 1440)
    if info["s"] == "closed":
        return {"state": "closed", "label": f"{DAY_NAMES_FA[day]} تعطیل است", "next_open": next_open(week, when)}
    if info["s"] == "unknown":
        return {"state": "unknown", "label": "ساعت کاری آن روز نامشخص"}
    if info["s"] == "allday":
        return {"state": "open_no_hours", "label": "باز است (ساعت دقیق ثبت نشده)"}
    for start, end in info["shifts"]:
        if start <= minute < end:
            return _open_label(end - minute, end)
    return {"state": "closed", "label": "در این ساعت بسته است", "next_open": next_open(week, when)}


def _open_label(left: int, end: int) -> dict:
    end_txt = f"{(end // 60) % 24:02d}:{end % 60:02d}"
    if left <= 45:
        return {"state": "closing_soon", "label": f"تا {end_txt} باز است ({left} دقیقه دیگر می‌بندد)", "closes": end_txt}
    return {"state": "open", "label": f"باز است تا {end_txt}", "closes": end_txt}


def next_open(week: dict, when: datetime) -> str | None:
    minute = when.hour * 60 + when.minute
    for offset in range(0, 8):
        d = when + timedelta(days=offset)
        info = week.get(WEEKDAY_KEYS[d.weekday()]) or {}
        if info.get("s") == "allday" and offset > 0:
            return f"{_rel_day(offset, d)}"
        for start, _ in info.get("shifts", []):
            if offset > 0 or start > minute:
                return f"{_rel_day(offset, d)} ساعت {start // 60:02d}:{start % 60:02d}"
    return None


def _rel_day(offset: int, d: datetime) -> str:
    if offset == 0:
        return "امروز"
    if offset == 1:
        return "فردا"
    return DAY_NAMES_FA[WEEKDAY_KEYS[d.weekday()]]


def week_table(week: dict | None) -> list[dict]:
    from .textnorm import fa_digits

    if not week:
        return []
    rows = []
    for day in WEEK_ORDER:
        info = week.get(day) or {"s": "unknown", "shifts": []}
        if info["s"] == "open":
            text = " و ".join(f"{s // 60:02d}:{s % 60:02d} تا {(e // 60) % 24:02d}:{e % 60:02d}" for s, e in info["shifts"])
        else:
            text = {"closed": "تعطیل", "allday": "باز (ساعت ثبت نشده)", "unknown": "نامشخص"}[info["s"]]
        rows.append({"day": DAY_NAMES_FA[day], "key": day, "text": fa_digits(text), "state": info["s"]})
    return rows
