"""Persian text normalisation shared by indexing and query time."""
import re

_CHAR_MAP = str.maketrans({
    "ي": "ی", "ى": "ی", "ئ": "ی", "ك": "ک", "ة": "ه", "ۀ": "ه", "أ": "ا", "إ": "ا", "آ": "ا", "ؤ": "و",
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    "‌": " ", "‏": "", "‎": "", "ـ": "",
})
_DIACRITICS = re.compile(r"[ً-ٰٟ]")
_NON_WORD = re.compile(r"[^\w\s.\-/]", re.UNICODE)
_SPACES = re.compile(r"\s+")


def to_latin_digits(text: str) -> str:
    return text.translate(_CHAR_MAP) if text else ""


def normalize(text: str | None) -> str:
    """Lower-case, unify Arabic/Persian letters and digits, drop punctuation."""
    if not text:
        return ""
    text = _DIACRITICS.sub("", text.translate(_CHAR_MAP)).lower()
    text = _NON_WORD.sub(" ", text)
    return _SPACES.sub(" ", text).strip()


def tokens(text: str | None) -> list[str]:
    return [t for t in normalize(text).replace("/", " ").replace("-", " ").split() if t]


_FA_DIGITS = str.maketrans("0123456789.", "۰۱۲۳۴۵۶۷۸۹٫")


def fa_digits(text) -> str:
    return str(text).translate(_FA_DIGITS)
