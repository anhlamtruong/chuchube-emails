# Backend Dockerfile — FastAPI + Uvicorn
FROM python:3.13-slim

WORKDIR /app

# Install dependencies first (cache layer)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/app ./app

# Copy Alembic migrations
COPY backend/alembic ./alembic
COPY backend/alembic.ini .

# Copy sending_email templates + assets for seeding & attachments (archived)
COPY archive/sending_email/templates ./sending_email/templates
COPY archive/sending_email/assets ./sending_email/assets

# Create data directory and non-root user
RUN mkdir -p /app/data \
    && addgroup --system appgroup \
    && adduser --system --ingroup appgroup appuser \
    && chown -R appuser:appgroup /app

USER appuser

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
