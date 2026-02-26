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

# Copy sending_email templates + assets for seeding & attachments
COPY sending_email/templates ./sending_email/templates
COPY sending_email/assets ./sending_email/assets

# Create data directory for SQLite and uploads
RUN mkdir -p /app/data /app/data/uploads

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
