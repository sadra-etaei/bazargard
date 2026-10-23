import os
from pathlib import Path
import secrets
import subprocess
import sys

# Keep the generated signing key with the persistent application database.
data_dir = Path(os.environ.get("DATA_DIR", "/data"))
data_dir.mkdir(parents=True, exist_ok=True)
if not os.environ.get("DJANGO_SECRET_KEY"):
    key_file = data_dir / ".django-secret-key"
    if not key_file.exists():
        key_file.write_text(secrets.token_urlsafe(64), encoding="utf-8")
        key_file.chmod(0o600)
    os.environ["DJANGO_SECRET_KEY"] = key_file.read_text(encoding="utf-8").strip()
subprocess.run([sys.executable, "backend/manage.py", "migrate", "--noinput"], check=True)
os.chdir("backend")
os.execvp("gunicorn", ["gunicorn", "config.wsgi:application", "--bind",
    "0.0.0.0:" + os.environ.get("PORT", "8000"), "--workers", "2",
    "--threads", "2", "--timeout", "120", "--access-logfile", "-",
    "--error-logfile", "-"])
