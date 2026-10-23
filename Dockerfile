FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.14-slim-bookworm AS catalog
WORKDIR /app
COPY deploy/prepare_catalog.py deploy/catalog.sqlite3.gz ./deploy/
RUN python deploy/prepare_catalog.py --unpack --output /app/catalog/catalog.sqlite3

FROM python:3.14-slim-bookworm
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    DJANGO_DEBUG=0 DATA_DIR=/data CATALOG_DB=/app/catalog/catalog.sqlite3 \
    SMS_PROVIDER=simulated VOICE_PROVIDER=simulated PORT=8000
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt gunicorn==23.0.0
COPY backend/ ./backend/
COPY --from=frontend /build/dist ./frontend/dist
COPY --from=catalog /app/catalog ./catalog/
COPY deploy/start.py ./deploy/start.py
RUN DJANGO_SECRET_KEY=build-only-static-collection python backend/manage.py collectstatic --noinput
EXPOSE 8000
CMD ["python", "deploy/start.py"]
