"""Prepare the read-only catalog for the DevOps Agent's 200 MB folder-upload limit."""
import argparse
import gzip
from pathlib import Path
import shutil
import sqlite3
import tempfile

ROOT = Path(__file__).resolve().parent.parent
BUNDLE = ROOT / "deploy" / "catalog.sqlite3.gz"

def validate(path):
    with sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True) as db:
        if db.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise SystemExit("Catalog integrity check failed")
        counts = {table: db.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
                  for table in ("shops", "products", "offers")}
        if not all(counts.values()):
            raise SystemExit("Catalog is empty")
        return counts

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--unpack", action="store_true")
    parser.add_argument("--source", type=Path, default=ROOT / "backend/data/catalog.sqlite3")
    parser.add_argument("--output", type=Path, default=Path("/app/catalog/catalog.sqlite3"))
    args = parser.parse_args()
    if args.unpack:
        if not BUNDLE.is_file():
            raise SystemExit("Missing catalog bundle. Run python deploy/prepare_catalog.py before uploading the project folder.")
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with gzip.open(BUNDLE, "rb") as src, args.output.open("wb") as dst:
            shutil.copyfileobj(src, dst)
        print(validate(args.output), flush=True)
        return
    if not args.source.is_file():
        raise SystemExit(f"Catalog not found: {args.source}. Run manage.py build_catalog first.")
    counts = validate(args.source)
    with tempfile.NamedTemporaryFile(dir=BUNDLE.parent, suffix=".gz", delete=False) as tmp:
        tmp_path = Path(tmp.name)
        with args.source.open("rb") as src, gzip.GzipFile(filename="", mode="wb", fileobj=tmp, mtime=0, compresslevel=6) as dst:
            shutil.copyfileobj(src, dst)
    tmp_path.replace(BUNDLE)
    print(f"Prepared {BUNDLE.name}: {BUNDLE.stat().st_size / 1024**2:.1f} MB; {counts}", flush=True)

if __name__ == "__main__":
    main()
