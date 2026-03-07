# 📧 ChuChuBe Emails

A full-stack personalized email campaign management platform for sending outreach emails at scale. Built with FastAPI, React, and PostgreSQL — featuring AI-powered bounce detection, role-based access control, real-time SSE streaming, and encrypted credential storage via Supabase Vault.

![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white)
![React 19](https://img.shields.io/badge/React_19-61DAFB?style=flat&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-000000?style=flat&logo=ollama&logoColor=white)

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Features](#features)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Authentication & Authorization](#authentication--authorization)
- [Database Schema](#database-schema)
- [Migration History](#migration-history)
- [API Endpoints](#api-endpoints)
- [Frontend Pages](#frontend-pages)
- [Email Sending Flow](#email-sending-flow)
- [Background Job System](#background-job-system)
- [Bounce Detection & AI Classification](#bounce-detection--ai-classification)
- [Security](#security)
- [Consent & Legal System](#consent--legal-system)
- [Service Layer](#service-layer)
- [Project Structure](#project-structure)
- [Operational Scripts](#operational-scripts)
- [License](#license)
- [Contact](#contact)

---

## Overview

ChuChuBe Emails is a self-hosted tool for managing recruiter/referral outreach and email campaigns. It provides:

- A spreadsheet-like UI (AG Grid) for campaign management with inline editing and bulk operations
- An HTML template editor (Monaco) with live preview and variable substitution
- Multi-sender email support with per-sender SMTP or Resend API credentials stored in Supabase Vault
- Scheduled and immediate email sends with real-time progress via Server-Sent Events
- AI-powered bounce detection using Ollama LLM classification with IMAP inbox scanning
- Role-based access control (master admin / admin / user) with Clerk authentication and access key gating
- Document attachments at three scopes: global, per-sender, and per-campaign-row
- Clipboard paste import with fuzzy column matching, plus Excel import/export
- Out-of-office tracking with automatic return-date expiration
- Admin approval workflows for user-submitted contacts
- Full audit logging and Row-Level Security on sensitive tables

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| **Backend** | Python + FastAPI | Python 3.13 |
| **ASGI Server** | Uvicorn | latest (`[standard]`) |
| **ORM / Migrations** | SQLAlchemy + Alembic | 25 migration versions |
| **Database** | PostgreSQL (Supabase) / SQLite fallback | psycopg2-binary |
| **Auth** | Clerk (JWT / JWKS RS256) | PyJWT + cryptography |
| **Credential Storage** | Supabase Vault | Encrypted via RPC |
| **File Storage** | Supabase Storage | Private bucket |
| **AI / LLM** | Ollama | llama3.2:3b / deepseek-r1:1.5b |
| **Rate Limiting** | slowapi | limits library backend |
| **Real-time** | SSE (sse-starlette) | Server-Sent Events |
| **HTML Sanitization** | nh3 | Rust-based sanitizer |
| **Frontend** | React 19 + TypeScript 5.8 | Vite 6.3 |
| **UI Framework** | Tailwind CSS 4.1 + shadcn/ui (Radix UI) | — |
| **Data Grid** | AG Grid Community | 35.x |
| **Code Editor** | Monaco Editor | 4.7 |
| **Calendar** | FullCalendar | daygrid + timegrid |
| **HTTP Client** | Axios | 1.13 |
| **Routing** | React Router Dom | 7.x |
| **Icons** | Lucide React | 0.564 |
| **Notifications** | Sonner | 2.0 |
| **Reverse Proxy** | Nginx (Alpine) | — |
| **Containerization** | Docker Compose | 3-service stack |
| **Data Processing** | Pandas + openpyxl | — |
| **Email Providers** | SMTP (smtplib) + Resend HTTP API | httpx |

---

## Features

### Core Email Campaign
- **Multi-sender support** — Unlimited sender accounts with SMTP or Resend API credentials, encrypted in Supabase Vault
- **HTML template engine** — `{placeholder}` variables, value proposition framework (passion/known_for/mission), inline image embedding, Monaco editor with live preview
- **Campaign generation** — Auto-generate campaign rows from selected recruiters or referrals with configurable defaults
- **Custom columns** — User-defined fields with drag-and-drop reordering, available as template placeholders
- **Email scheduling** — One-time scheduling with timezone support; scheduler polls every 60 seconds
- **Real-time progress** — Server-Sent Events stream per-email send status to the browser in real-time
- **Failed email retry** — Filter, view, and retry/reset failed emails from the Send page

### Contacts & Data
- **Recruiter + Referral management** — Separate CRUD lists with search, filters, pagination, and admin approval workflows
- **Clipboard paste import** — Fuzzy column matching for CSV/TSV pasted from spreadsheets
- **Excel import/export** — Import recruiters and campaigns from `.xlsx`, export campaigns to Excel
- **Document management** — Three-tier attachment system (global, per-sender, per-campaign-row) with Supabase Storage
- **AG Grid spreadsheet** — Inline editing, multi-select with shift-click, bulk operations, custom columns

### Intelligence & Monitoring
- **AI bounce detection** — IMAP inbox scanning with rule-based patterns + Ollama LLM fallback classification
- **Out-of-office tracking** — Detects OOO replies, extracts return dates, auto-expires when due
- **Bounce logging** — Categorized as hard/soft/ooo/unknown with full audit trail
- **Dashboard analytics** — Recruiter counts, campaign status breakdown, upcoming scheduled jobs

### Security & Access Control
- **Clerk authentication** — JWT-based auth with RS256 JWKS verification and per-user data isolation
- **Access key gating** — Bcrypt-hashed invite keys required before app access; single-use, bound to user on first use
- **Role-based access control** — Three roles: `master_admin`, `admin`, `user` with granular endpoint restrictions
- **Row-Level Security** — PostgreSQL RLS policies on 7 sensitive tables
- **Audit logging** — Append-only event log for credential access, email sends, account changes
- **Encrypted credentials** — SMTP passwords stored in Supabase Vault, never in plaintext
- **SMTP allowlist** — Prevents SSRF by restricting outbound SMTP to known providers
- **HTML sanitization** — Template content sanitized via nh3 before storage

### Legal & Consent
- **Versioned consent** — Five policy types (ToS, Privacy, Send-on-behalf, Data Security, Audit Monitoring) with version tracking
- **Consent gate** — Email send/schedule endpoints blocked until all consents accepted
- **Full audit trail** — IP-stamped consent acceptance history

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Docker Compose                               │
│                                                                      │
│  ┌──────────────┐        ┌──────────────────────────────────────┐   │
│  │   Frontend    │        │              Backend                  │   │
│  │   (Nginx)     │───────▶│       FastAPI + Uvicorn               │   │
│  │   Port 80     │ /api/* │       Port 8000                       │   │
│  │               │        │                                       │   │
│  │  React SPA    │        │  ┌──────────┐  ┌──────────────────┐  │   │
│  │  TypeScript   │  SSE   │  │ Scheduler│  │  Bounce Scanner  │  │   │
│  │  AG Grid +    │◀ ─ ─ ─ │  │  Loop    │  │  Loop (IMAP +    │  │   │
│  │  Monaco       │ events │  │ (60s)    │  │   AI classify)   │  │   │
│  └──────────────┘        │  └──────────┘  └──────────────────┘  │   │
│                           │       │                │              │   │
│                           │  ┌────▼────────────────▼─────┐       │   │
│                           │  │   PostgreSQL (Supabase)    │       │   │
│                           │  │   + Vault (credentials)    │       │   │
│                           │  │   + Storage (documents)    │       │   │
│                           │  │   + RLS policies           │       │   │
│                           │  └───────────────────────────┘       │   │
│                           │                                       │   │
│                           │  ┌──────────────────┐                │   │
│                           │  │ SSE Event Bus    │                │   │
│                           │  │ (in-memory       │                │   │
│                           │  │  pub/sub)        │                │   │
│                           │  └──────────────────┘                │   │
│                           └──────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────┐                                                    │
│  │   Ollama      │  ◀── HTTP API calls from bounce scanner          │
│  │   (LLM)       │      llama3.2:3b model                           │
│  │   Port 11434  │      Circuit breaker (3 failures)                │
│  │   2GB memory   │                                                  │
│  └──────────────┘                                                    │
│                                                                      │
│  Volumes: ollama_data (model persistence)                            │
│           sending_email/assets (mount)                               │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Browser** → Nginx (port 80) — serves React SPA static files
2. **`/api/*` requests** → Nginx proxies to FastAPI (port 8000) with SSE buffering disabled
3. **FastAPI** → Clerk JWKS (JWT verification) → Access Key check → Rate limiter → Router
4. **SMTP/Resend sends** — credentials fetched from Supabase Vault per-request, decrypted in-memory
5. **Bounce detection** — IMAP login → scan inbox → rule-based classification → Ollama AI fallback → update contact `email_status`
6. **SSE** — In-memory event bus with per-job and global subscribers; uses `call_soon_threadsafe` for thread safety
7. **Scheduler** — `SELECT ... FOR UPDATE SKIP LOCKED` polling for due jobs every 60s

---

## Getting Started

### Prerequisites

- Python 3.13+
- Node.js 18+
- PostgreSQL (or use SQLite for quick local dev)
- Docker & Docker Compose (for production)
- [Clerk](https://clerk.com) account for authentication
- [Supabase](https://supabase.com) project (for Vault + Storage)
- Ollama (optional, for AI bounce classification)

### Development (local)

```bash
# 1. Clone and configure
git clone https://github.com/anhlamtruong/chuchube-emails.git
cd chuchube-emails
cp .env.example .env
# Edit .env with your credentials

# 2. Install backend dependencies
cd backend && pip install -r requirements.txt && cd ..

# 3. Run database migrations
cd backend && alembic upgrade head && cd ..

# 4. Install frontend dependencies
cd frontend && npm install && cd ..

# 5. Start both servers
./dev.sh
# Backend:  http://localhost:8000 (with --reload)
# Frontend: http://localhost:5173
# API docs: http://localhost:8000/docs
```

### Docker Compose (production)

```bash
# Ensure .env exists with all required variables

# Quick start — build, migrate, pull AI model, health check
./redeploy.sh

# Or use the management script
./run.sh up           # Build & start all 3 services
./run.sh down         # Stop containers
./run.sh logs         # Follow live logs
./run.sh migrate      # Run Alembic migrations
./run.sh shell        # Shell into backend container
./run.sh lint         # TypeScript + ESLint check
./run.sh test         # Run backend pytest
```

### Docker Services

| Service | Image | Port | Memory | Health Check |
|---|---|---|---|---|
| `backend` | `python:3.13-slim` (custom) | 8000 (internal) | 512 MB | `GET /api/health` every 30s |
| `frontend` | `nginx:alpine` (multi-stage) | 80 (published) | 256 MB | `wget localhost:80` every 30s |
| `ollama` | `ollama/ollama:latest` | 11434 (internal) | 2 GB | `/api/tags` every 30s |

---

## Environment Variables

| Variable | Description | Default | Required |
|---|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `sqlite:///data.db` | **Yes** |
| `CLERK_SECRET_KEY` | Clerk backend secret key | `""` | **Yes** |
| `CLERK_JWKS_URL` | Clerk JWKS endpoint for JWT verification | `""` | **Yes** |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:5173` | **Yes** |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (baked into frontend build) | — | **Yes** |
| `SUPABASE_URL` | Supabase project URL | `""` | Recommended |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (for Vault + Storage) | `""` | Recommended |
| `SUPABASE_BUCKET` | Supabase Storage bucket name | `"documents"` | No |
| `ACCESS_KEY_ENABLED` | Enable access key gate | `true` | No |
| `ACCESS_MASTER_KEY` | Master access key (bypass gate) | `""` | If gate enabled |
| `ADMIN_USER_ID` | Master admin Clerk user ID (used in migrations) | `""` | For migrations |
| `YOUR_NAME` | Sender's full name (seeded into settings) | `""` | No |
| `YOUR_PHONE` | Sender's phone number | `""` | No |
| `YOUR_CITY_STATE` | Sender's city & state | `""` | No |
| `SENDER_EMAIL_{1-9}` | Legacy multi-sender email addresses (up to 9) | — | No |
| `SENDER_PASSWORD_{1-9}` | Gmail App Passwords for each sender | — | No |
| `SENDER_RESUME_{1-9}` | Resume file path per sender | — | No |
| `SMTP_SERVER` | Default SMTP server hostname | `smtp.gmail.com` | No |
| `SMTP_PORT` | Default SMTP server port | `465` | No |
| `OLLAMA_URL` | Ollama AI service URL | `http://ollama:11434` | No |
| `OLLAMA_MODEL` | Ollama model for classification | `llama3.2:3b` | No |
| `BOUNCE_CHECK_INTERVAL` | Seconds between bounce scan cycles | `300` | No |
| `BOUNCE_CHECK_ENABLED` | Enable automatic bounce scanning | `true` | No |
| `SESSION_TIMEOUT_SECONDS` | JWT session timeout | `86400` (24h) | No |
| `UPLOADS_DIR` | Directory for uploaded files (non-Supabase) | `data/uploads` | No |

---

## Authentication & Authorization

### 1. Clerk JWT (RS256)

All protected routes use `require_auth` which verifies JWTs via Clerk's JWKS endpoint. The JWKS response is cached for 5 minutes with thread-safe retry. Session timeout defaults to 24 hours (configurable via `SESSION_TIMEOUT_SECONDS`).

```
Authorization: Bearer <clerk-jwt-token>
```

### 2. Access Key Gate

When `ACCESS_KEY_ENABLED=true`, the `AccessKeyMiddleware` validates an `X-Access-Key` header on every authenticated request:

- Keys are **bcrypt-hashed** in the database with an 8-character prefix for efficient lookup
- Keys are **single-use** — bound to a specific Clerk user on first use
- **Master admin** users are exempt from the access key requirement
- Exempt paths: `/api/health`, `/api/auth/validate-access-key`, `/api/admin/`

```
X-Access-Key: <32-char-access-key>
```

### 3. Role-Based Access Control (RBAC)

| Role | Permissions |
|---|---|
| `master_admin` | Full access. Manage user roles. Cannot be removed. |
| `admin` | Manage shared resources: access keys, approve contacts, bounce scanning, view all jobs. |
| `user` | Default role. Scoped to own resources only. |

Roles are cached in-memory for 60 seconds. The `require_admin` and `require_master_admin` dependencies enforce role checks.

### 4. SSE Authentication

`EventSource` cannot set HTTP headers, so SSE endpoints authenticate via a query parameter token:

```
GET /api/emails/jobs/{id}/stream?token=<clerk-jwt>
```

### 5. Consent Gate

The `require_consent` dependency blocks `POST /api/emails/send` and `POST /api/emails/schedule` with HTTP 403 if any required consent is missing.

---

## Database Schema

14 tables managed via SQLAlchemy ORM with Alembic migrations. PostgreSQL (Supabase) in production; SQLite fallback for local development.

### `recruiters`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | `gen_random_uuid()` |
| `name` | String(200) | Required |
| `email` | String(320) | Unique, indexed |
| `company` | String(200) | Indexed |
| `title` | String(200) | — |
| `location` | String(200) | Indexed |
| `notes` | Text | — |
| `email_status` | String(20) | `valid` / `bounced` / `risky` / `ooo`, indexed |
| `ooo_return_date` | Date | Nullable, indexed |
| `user_id` | String(200) | Nullable, indexed |
| `approval_status` | String(20) | `approved` / `pending` / `rejected`, indexed |
| `created_at` / `updated_at` | DateTime | Auto-managed |

### `referrals`

Same schema as `recruiters` — generated from the shared `ContactColumns` mixin.

### `email_columns` (Campaign Rows)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | `gen_random_uuid()` |
| `sender_email` | String(320) | — |
| `recipient_name` | String(200) | — |
| `recipient_email` | String(320) | Indexed |
| `company` | String(200) | — |
| `position` | String(200) | — |
| `template_file` | String(200) | — |
| `framework` | String(50) | `passion` / `known_for` / `mission` |
| `my_strength` / `audience_value` | Text | Personalization fields |
| `custom_fields` | JSON | User-defined template placeholders |
| `sent_status` | String(20) | `pending` / `sent` / `failed` / `response`, indexed |
| `sent_at` / `scheduled_at` | DateTime | Nullable |
| `recruiter_id` | UUID FK → `recruiters.id` | SET NULL on delete |
| `referral_id` | UUID FK → `referrals.id` | SET NULL on delete |
| `user_id` | String(200) | Indexed; composite index `(user_id, sent_status)` |
| `created_at` / `updated_at` | DateTime | Auto-managed |

### `templates`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | `gen_random_uuid()` |
| `name` | String(200) | Unique per `(name, user_id)` |
| `user_id` | String(200) | Nullable (NULL = system template), indexed |
| `subject_line` | Text | — |
| `body_html` | Text | HTML sanitized via nh3 |
| `is_default` | Boolean | Partial unique index per user |
| `created_at` / `updated_at` | DateTime | Auto-managed |

### `documents`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | `gen_random_uuid()` |
| `filename` / `original_name` | String | Stored vs. user-facing name |
| `file_path` | String(1000) | — |
| `mime_type` | String(200) | — |
| `size_bytes` | Integer | — |
| `scope` | String(20) | `global` / `sender` / `campaign_row`, indexed |
| `scope_ref` | String(320) | Sender email or row ID, indexed |
| `user_id` | String(200) | Indexed |
| `created_at` | DateTime | Auto-managed |

### `job_results`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | `gen_random_uuid()` |
| `celery_task_id` | String(255) | Legacy, nullable, indexed |
| `status` | String(20) | `queued` / `scheduled` / `running` / `completed` / `error` / `cancelled`, indexed |
| `total` / `sent` / `failed` | Integer | Counters |
| `row_ids` | JSON | Array of campaign row UUIDs |
| `errors` | JSON | Array of error strings |
| `user_id` | String(200) | Indexed |
| `scheduled_at` | DateTime | Indexed |
| `created_at` / `completed_at` | DateTime | Auto-managed |

### `settings`

Per-user key-value store.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | `gen_random_uuid()` |
| `user_id` | String(255) | Composite unique with `key` |
| `key` | String(100) | Indexed |
| `value` | Text | — |
| `description` | String(500) | — |
| `updated_at` | DateTime | Auto-managed |

**Default keys:** `default_position`, `default_framework`, `default_my_strength`, `default_audience_value`, `your_name`, `your_phone`, `your_city_state`, `smtp_server`, `smtp_port`, `sleep_between_emails`, `bounce_check_enabled`

### `sender_accounts`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | `gen_random_uuid()` |
| `user_id` | String(200) | Indexed |
| `email` | String(320) | — |
| `display_name` | String(200) | — |
| `provider` | String(20) | `smtp` or `resend` |
| `smtp_host` / `smtp_port` | String / Integer | Nullable (Resend has no SMTP) |
| `vault_secret_name` | String(300) | Unique — links to Supabase Vault |
| `is_default` | Boolean | — |
| `organization_name` | String(300) | Nullable |
| `organization_type` | String(20) | `school` / `company` |
| `title` | String(200) | Nullable |
| `city` | String(200) | Nullable |
| `last_bounce_check_at` | DateTime | Last IMAP scan time |
| `created_at` / `updated_at` | DateTime | Auto-managed |

### `access_keys`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | `gen_random_uuid()` |
| `key_hash` | String(200) | Bcrypt hash |
| `key_prefix` | String(8) | First 8 chars, indexed for lookup |
| `label` | String(200) | Admin-assigned label |
| `used_by_user_id` | String(200) | Bound on first use |
| `used_at` | DateTime | — |
| `is_active` | Boolean | — |
| `key` | String(64) | Legacy, nullable (cleared in migration 024) |
| `created_at` | DateTime | Auto-managed |

### `audit_logs`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | `gen_random_uuid()` |
| `user_id` | String(255) | Indexed |
| `event_type` | String(50) | e.g. `credential.accessed`, `email.sent`, indexed |
| `resource_type` | String(50) | e.g. `sender_account`, `vault_secret` |
| `resource_id` | String(255) | — |
| `detail` | JSONB | — |
| `ip_address` | String(50) | — |
| `user_agent` | String(500) | — |
| `created_at` | DateTime | Indexed |

### `bounce_logs`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | `gen_random_uuid()` |
| `sender_email` | String(320) | Indexed |
| `recipient_email` | String(320) | Indexed |
| `bounce_type` | String(30) | `hard` / `soft` / `ooo` / `unknown` |
| `classification` | String(30) | `rule` or `ai` |
| `raw_subject` / `raw_snippet` | Text | Original email content |
| `error_code` | String(50) | — |
| `detail` | JSONB | — |
| `action_taken` | String(50) | — |
| `created_at` | DateTime | Auto-managed |

### `custom_column_definitions`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | `gen_random_uuid()` |
| `user_id` | String(255) | Composite unique with `name`, indexed |
| `name` | String(100) | — |
| `default_value` | Text | — |
| `sort_order` | Integer | Drag-and-drop ordering |
| `created_at` / `updated_at` | DateTime | Auto-managed |

### `user_consents`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | `gen_random_uuid()` |
| `user_id` | String(200) | Indexed |
| `consent_type` | String(50) | `terms_of_service` / `privacy_policy` / `send_on_behalf` / `data_security` / `audit_monitoring` |
| `version` | String(20) | Current: 3.0, 3.0, 3.0, 2.0, 1.0 |
| `accepted_at` | DateTime | — |
| `ip_address` | String(50) | Nullable |

Unique constraint on `(user_id, consent_type, version)`.

### `user_roles`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | `gen_random_uuid()` |
| `user_id` | String(200) | Unique, indexed |
| `email` | String(500) | — |
| `role` | String(20) | `master_admin` / `admin` / `user` |
| `assigned_by` | String(200) | — |
| `created_at` / `updated_at` | DateTime | Auto-managed |

### `user_profiles`

Cache of Clerk user data for display purposes.

| Column | Type | Notes |
|---|---|---|
| `user_id` | String(200) | **PK** |
| `email` | String(500) | Indexed |
| `name` | String(500) | — |
| `last_seen_at` | DateTime | — |

### Entity Relationships

```
recruiters ──────┐
                 │  recruiter_id (FK, SET NULL)
                 ▼
referrals ───── email_columns (campaigns)
          referral_id (FK, SET NULL)

sender_accounts.vault_secret_name → Supabase Vault (external)
documents.scope_ref → sender_accounts.email OR email_columns.id
```

**Row-Level Security** enabled on 7 tables: `settings`, `email_columns`, `sender_accounts`, `documents`, `templates`, `user_consents`, `audit_logs`.

---

## Migration History

25 migrations managed via Alembic.

| # | File | Description |
|---|---|---|
| 001 | `001_initial.py` | Baseline: `recruiters`, `templates`, `email_columns`, `documents`, `settings` (INTEGER PKs) |
| 002 | `002_add_scheduled_at.py` | Add `scheduled_at` + index on `email_columns` |
| 003 | `003_add_job_results.py` | Create `job_results` table with `celery_task_id` |
| 004 | `004_add_user_id.py` | Add `user_id` to `templates` & `email_columns`; composite unique on template name |
| 005 | `005_convert_to_uuid.py` | Convert ALL integer PKs to UUID using `gen_random_uuid()` |
| 006 | `006_add_row_ids_to_job_results.py` | Add `row_ids` JSON column to `job_results` |
| 007 | `007_add_user_consent.py` | Create `user_consents` table |
| 008 | `008_add_referrals.py` | Create `referrals` table + FK `email_columns.referral_id` |
| 009 | `009_add_user_id_to_documents.py` | Add `user_id` to `documents` |
| 010 | `010_create_sender_accounts.py` | Create `sender_accounts` table with Vault-based secret storage |
| 011 | `011_user_scoped_settings.py` | Add `user_id` to `settings`, backfill to admin, composite unique key |
| 012 | `012_security_hardening.py` | Create `audit_logs`, enable RLS on 7 tables with CRUD policies |
| 013 | `013_custom_column_definitions.py` | Create `custom_column_definitions`, auto-migrate existing JSON keys |
| 014 | `014_add_template_is_default.py` | Add `is_default` to `templates` with partial unique index per user |
| 015 | `015_add_sender_org_fields.py` | Add org fields to `sender_accounts` (organization, type, title, city) |
| 016 | `016_add_access_keys.py` | Create `access_keys` table for invite key system |
| 017 | `017_bounce_detection.py` | Add `email_status` to contacts, `last_bounce_check_at` to sender accounts, create `bounce_logs` |
| 018 | `018_ooo_return_date.py` | Add `ooo_return_date` (Date) to `recruiters` & `referrals` |
| 019 | `019_admin_approval_and_job_user.py` | Add `user_id` + `approval_status` to contacts; `user_id` to `job_results`; backfill to admin |
| 020 | `020_bcrypt_access_keys.py` | Add `key_hash` + `key_prefix`, bcrypt-hash existing plaintext keys |
| 021 | `021_user_roles.py` | Create `user_roles` table for RBAC, seed `master_admin` |
| 022 | `022_add_scheduled_at_to_job_results.py` | Add `scheduled_at` + index to `job_results` |
| 023 | `023_user_profiles.py` | Create `user_profiles` table (PK = `user_id`) |
| 024 | `024_cleanup_plaintext_keys.py` | Hash remaining plaintext access keys, NULL out legacy `key` column |
| 025 | `025_index_ooo_return_date.py` | Add indexes on `ooo_return_date` for `recruiters` & `referrals` |

**Key evolution themes:** Integer → UUID PKs, multi-tenancy via `user_id`, RLS security policies, RBAC roles, bcrypt key hashing, bounce detection, OOO tracking, admin approval workflows.

---

## API Endpoints

All protected routes require: `Authorization: Bearer <clerk-jwt>` + `X-Access-Key: <key>` (when enabled).

Default rate limit: **200 requests/minute** per user (falls back to IP for unauthenticated).

### Health & Auth

| Method | Path | Auth | Rate Limit | Description |
|---|---|---|---|---|
| GET | `/api/health` | None | — | Health check → `{"status": "ok"}` |
| POST | `/api/auth/validate-access-key` | None | **5/min** | Validate an access key (bcrypt) |
| GET | `/api/dashboard` | JWT | 200/min | Dashboard stats (counts, status breakdown, upcoming jobs) |

### Recruiters — `/api/recruiters`

| Method | Path | Auth | Rate Limit | Description |
|---|---|---|---|---|
| GET | `/` | JWT | 200/min | List (paginated, filterable: search/company/location/title/approval_status) |
| GET | `/count` | JWT | 200/min | Total count |
| GET | `/{id}` | JWT | 200/min | Get single recruiter |
| POST | `/` | JWT | **30/min** | Create (admin=auto-approved, user=pending) |
| PUT | `/{id}` | Admin | 200/min | Update |
| DELETE | `/{id}` | Admin | 200/min | Delete |
| POST | `/bulk` | JWT | **10/min** | Bulk create |

### Referrals — `/api/referrals`

Same endpoints as Recruiters (generated from shared factory). Replace `recruiters` with `referrals` in all paths.

### Campaigns — `/api/campaigns`

| Method | Path | Auth | Rate Limit | Description |
|---|---|---|---|---|
| GET | `/custom-columns` | JWT | 200/min | Distinct custom field key names |
| GET | `/` | JWT | 200/min | List (paginated, filterable) |
| GET | `/count` | JWT | 200/min | Count by status |
| GET | `/{row_id}` | JWT | 200/min | Get single campaign row |
| POST | `/` | JWT | **60/min** | Create campaign row |
| PUT | `/{row_id}` | JWT | 200/min | Update campaign row |
| PUT | `/bulk/update` | JWT | **20/min** | Bulk update campaigns |
| DELETE | `/{row_id}` | JWT | 200/min | Delete campaign row |
| POST | `/bulk/delete` | JWT | **20/min** | Bulk delete campaigns |
| POST | `/generate-from-recruiters` | JWT | **10/min** | Generate from selected recruiter IDs |
| POST | `/generate-from-referrals` | JWT | **10/min** | Generate from selected referral IDs |
| POST | `/bulk-paste` | JWT | **10/min** | Paste CSV → upsert recruiters + create campaigns |

### Templates — `/api/templates`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | JWT | List templates (own + system) |
| GET | `/{id}` | JWT | Get template |
| POST | `/` | JWT | Create template (HTML sanitized via nh3) |
| PUT | `/{id}` | JWT | Update template |
| PUT | `/{id}/set-default` | JWT | Toggle default template |
| DELETE | `/{id}` | JWT | Delete template (not system) |
| POST | `/{id}/preview` | JWT | Preview template with sample data |

### Emails — `/api/emails`

| Method | Path | Auth | Rate Limit | Description |
|---|---|---|---|---|
| POST | `/send` | JWT + Consent | **30/min** | Queue batch email send |
| GET | `/status/{job_id}` | JWT | 200/min | Check job status |
| GET | `/jobs` | JWT | 200/min | List recent jobs |
| GET | `/senders` | JWT | 200/min | List sender accounts |
| POST | `/schedule` | JWT + Consent | **30/min** | Schedule emails for specific time |
| GET | `/scheduled-jobs` | JWT | 200/min | List active + finished jobs |
| DELETE | `/scheduled-jobs/{job_id}` | JWT | 200/min | Cancel a scheduled job |
| GET | `/jobs/{job_id}/detail` | JWT | 200/min | Full job detail with per-email status |
| GET | `/ooo-resendable` | JWT | 200/min | OOO re-send suggestions |
| GET | `/jobs/{job_id}/stream` | SSE (query token) | — | Per-job SSE stream |
| GET | `/jobs/stream` | SSE (query token) | — | Global job SSE stream |

### Import/Export — `/api/import-export`

| Method | Path | Auth | Rate Limit | Description |
|---|---|---|---|---|
| POST | `/import-campaigns` | JWT | **20/min** | Import campaigns from Excel |
| POST | `/import-recruiters` | JWT | **20/min** | Import single Excel file |
| POST | `/import-recruiters-bulk` | JWT | **10/min** | Import multiple Excel files |
| POST | `/parse-clipboard` | JWT | 200/min | Parse CSV/TSV clipboard (fuzzy column matching) |
| POST | `/commit-clipboard` | JWT | **20/min** | Commit parsed clipboard rows to DB |
| GET | `/export-campaigns` | JWT | 200/min | Export campaigns to Excel download |

### Documents — `/api/documents`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | JWT | List (filterable by scope & scope_ref) |
| POST | `/upload` | JWT | Upload single document to Supabase Storage |
| POST | `/upload-multiple` | JWT | Upload multiple documents (max 20) |
| GET | `/{id}/download` | JWT | Download document |
| DELETE | `/{id}` | JWT | Delete document |

### Settings — `/api/settings`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | JWT | List all user settings |
| GET | `/{key}` | JWT | Get single setting |
| PUT | `/{key}` | JWT | Update single setting |
| PUT | `/` | JWT | Bulk update settings |
| POST | `/test-smtp` | JWT | Test SMTP connection |

### Sender Accounts — `/api/sender-accounts`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | JWT | List sender accounts |
| POST | `/` | JWT | Create (credential encrypted to Vault) |
| PUT | `/{id}` | JWT | Update sender account |
| DELETE | `/{id}` | JWT | Delete sender account + vault secret |
| POST | `/{id}/test` | JWT | Test SMTP/Resend connection |
| POST | `/test-credential` | JWT | Test credential before saving |

### Custom Columns — `/api/custom-columns`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | JWT | List custom column definitions |
| POST | `/` | JWT | Create custom column |
| PUT | `/{id}` | JWT | Update custom column |
| DELETE | `/{id}` | JWT | Delete custom column |
| PUT | `/reorder/bulk` | JWT | Reorder columns |

### Consent — `/api/consent`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/status` | JWT | Current consent status |
| POST | `/accept` | JWT | Accept a specific policy |
| POST | `/accept-all` | JWT | Accept all required consents |
| GET | `/history` | JWT | Full consent audit trail |

### Audit Logs — `/api/audit-logs`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | JWT | List user's own audit logs (paginated, filterable) |

### Bounces — `/api/bounces`

| Method | Path | Auth | Rate Limit | Description |
|---|---|---|---|---|
| GET | `/stats` | JWT | 200/min | Bounce detection summary stats |
| GET | `/logs` | Admin | 200/min | List bounce log entries |
| POST | `/scan` | Admin | **5/min** | Trigger full bounce scan |
| GET | `/scan/status` | Admin | 200/min | Scan progress |
| GET | `/scan/stream` | Admin (SSE) | — | SSE stream of per-email classification events |
| GET | `/scan-config` | Admin | 200/min | Get scan config params |
| PUT | `/scan-config` | Admin | 200/min | Update scan config |
| GET | `/ooo-contacts` | Admin | 200/min | List OOO contacts |
| POST | `/ooo-clear` | Admin | 200/min | Clear OOO notes |
| POST | `/ooo-expire` | Admin | 200/min | Auto-expire past-due OOO contacts |
| GET | `/ollama-status` | Admin | 200/min | Check Ollama/AI availability |
| POST | `/ollama-pull` | Admin | 200/min | Pull Ollama model |
| POST | `/ollama-test` | Admin | 200/min | Run AI classification test samples |
| GET | `/toggle` | Admin | 200/min | Get bounce scanning enabled state |
| POST | `/toggle` | Admin | 200/min | Toggle bounce scanning on/off |
| POST | `/reset-status/{email}` | Admin | 200/min | Reset contact email_status to "valid" |

### Admin — `/api/admin`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/check` | JWT | Check if current user is admin (returns role) |
| GET | `/access-keys` | Admin | List all access keys |
| POST | `/access-keys` | Admin | Generate new bcrypt-hashed access key |
| DELETE | `/access-keys/{id}` | Admin | Revoke access key |
| GET | `/org-accounts` | Admin | List all org sender accounts (cross-user) |
| GET | `/pending-recruiters` | Admin | List pending-approval recruiters |
| GET | `/pending-referrals` | Admin | List pending-approval referrals |
| POST | `/approve-recruiters` | Admin | Approve/reject recruiters |
| POST | `/approve-referrals` | Admin | Approve/reject referrals |
| GET | `/users` | Master Admin | List all user roles |
| POST | `/users` | Master Admin | Assign role to user |
| PUT | `/users/{user_id}` | Master Admin | Update user role |
| DELETE | `/users/{user_id}` | Master Admin | Remove user role (can't remove master_admin) |
| GET | `/jobs` | Admin | List all jobs (cross-user, paginated, filterable) |
| DELETE | `/jobs/{job_id}` | Admin | Cancel any job |

---

## Frontend Pages

All pages are **lazy-loaded**. Auth flow: Clerk sign-in → Access key gate → Main app.

### Main Pages

| Route | Page | Description |
|---|---|---|
| `/login` | LoginPage | Clerk sign-in UI; redirects to `/` when authenticated |
| (gate) | AccessKeyPage | Access key entry before main app; stored in `sessionStorage`, synced across tabs via `BroadcastChannel` |
| `/` | DashboardPage | Overview cards: totals, status breakdown, upcoming scheduled jobs, quick actions |
| `/recruiters` | RecruitersPage | CRUD table with search, company/location/title filters, pagination, bulk import, admin approval |
| `/referrals` | ReferralsPage | Same as Recruiters for referral contacts |
| `/campaigns` | CampaignsPage | AG Grid spreadsheet: inline editing, auto-save, bulk ops, generate from contacts, clipboard paste, Excel I/O, custom columns |
| `/templates` | TemplatesPage | Monaco HTML editor with live preview, system vs user templates, set default |
| `/documents` | DocumentsPage | File management with 3 scopes (global/sender/campaign-row), upload/download/delete, multi-file |
| `/send` | SendPage | Email control center: select campaigns, send/schedule, timezone, job progress via SSE, retry failed |
| `/scheduled-jobs` | ScheduledJobsPage | View/cancel jobs, auto-refresh (30s), expandable finished job details |
| `/scheduled-jobs/:id` | JobDetailPage | Per-job detail with live SSE progress stream + per-email result table |
| `/settings` | SettingsPage | Email accounts, custom columns, bounce detection summary, settings groups |
| `/terms` | TermsPage | Terms of Service content |
| `/privacy` | PrivacyPage | Privacy Policy content |
| `/consent` | ConsentPage | Consent acceptance flow + history |
| `/admin` | AdminPage | Admin panel with role-gated sub-tabs |

### Admin Sub-tabs

| Tab | Description |
|---|---|
| AccessKeysTab | Generate/revoke access keys |
| OrgAccountsTab | View organization-wide sender accounts |
| BounceMonitorTab | Bounce/OOO scan trigger, logs, stats |
| OllamaTab | Ollama LLM status, model pull, classification testing |
| OooManagementTab | Manage Out-of-Office contacts, clear/expire |
| AdminJobsTab | View/cancel all users' jobs |
| UsersRolesTab | Assign admin/user roles (master_admin only) |

### Settings Sub-sections

| Section | Description |
|---|---|
| EmailAccountsSection | Sender account CRUD (SMTP/Resend) + SMTP test |
| CustomColumnsSection | Define/reorder custom campaign columns |
| BounceDetectionSummary | Bounce scan toggle + summary stats |
| SettingsGroupsSection | Key/value settings editor (Campaign Defaults, Personal Info, SMTP) |

### State Management

No global state library (no Redux/Zustand). State is managed via local `useState`/`useEffect` and custom hooks:

| Hook | Purpose |
|---|---|
| `useContactList` | Shared CRUD + pagination + filter logic for Recruiters/Referrals |
| `useJobSSE` | Server-Sent Events for real-time job progress |
| `useDebounce` | Debounced search input |
| `useShiftSelect` | Multi-select with shift-click for AG Grid |
| `useUnsavedChangesWarning` | Prompt before navigating away from unsaved edits |
| `usePageTitle` | Dynamic document title |
| `useScrollToTop` | Scroll to top on route change |

---

## Email Sending Flow

1. **Select campaigns** on the Send page (filtered by `sent_status=pending`) and click **Send** or **Schedule**
2. **Consent check** — frontend verifies all consents accepted; backend enforces via `require_consent` (returns HTTP 403 if missing)
3. **Job created** — `JobResult` record with `row_ids` and status `queued` (immediate) or `scheduled` (deferred)
4. **`send_email_batch()` runs in background thread** (via `ThreadPoolExecutor`, max 5 workers):
   - Sorts rows by `sender_email` to minimize SMTP reconnections
   - Fetches sender credentials from **Supabase Vault** (decrypted in-memory)
   - Logs into SMTP via `smtplib.SMTP_SSL` **or** sends via Resend HTTP API (`httpx`)
   - Loads template from DB, personalizes via variable substitution
   - Gathers attachments: global docs → sender-scoped docs → row-scoped docs
   - Optionally embeds inline images (CID)
   - Sends email with HTML body + attachments
   - **Publishes SSE events** per email (success/failure) to the in-memory event bus
   - Updates `sent_status` to `sent` with `sent_at` timestamp
   - Sleeps `sleep_between_emails` seconds between sends (configurable, default 2s)
   - On failure: marks row `failed`, logs error in `JobResult.errors`
5. **Job finalized** — `JobResult.status` → `completed`, `sent`/`failed` counts recorded

### Template Placeholders

| Placeholder | Source |
|---|---|
| `{first_name}` | Recipient's first name (extracted from `recipient_name`) |
| `{company}` | Company name |
| `{position}` | Position/role |
| `{value_prop_sentence}` | Auto-generated from `framework` + `audience_value` |
| `{your_name}` | From user settings |
| `{your_email}` | Sender email address |
| `{your_phone}` | From user settings |
| `{your_city_state}` | From user settings |
| `{my_strength}` | Custom strength pitch |
| `{organization_name}` | From sender account |
| `{organization_type}` | `school` or `company` |
| `{title}` | From sender account |
| `{city}` | From sender account |
| `{custom_*}` | Any key from `custom_fields` JSON |

### Value Proposition Framework

Three framework options for `{value_prop_sentence}`:

- **passion** — "I'm drawn to {company} because {audience_value}"
- **known_for** — "{company} is known for {audience_value}, and I'd love to contribute"
- **mission** — "Your mission around {audience_value} aligns with my goals"

---

## Background Job System

No external broker required — uses Python `asyncio` + `threading.Thread` + `ThreadPoolExecutor(max_workers=5)`.

### Scheduler Loop

- Runs as an `asyncio` task created at app startup via `start_scheduler()`
- Polls the database every **60 seconds** for `JobResult` rows where `status="scheduled"` and `scheduled_at <= now`
- Uses `SELECT ... FOR UPDATE SKIP LOCKED` to prevent duplicate execution
- Dispatches due jobs to the thread pool for email sending

### Bounce Check Loop

- `_bounce_check_loop()` runs periodically (default every 300 seconds, configurable via `BOUNCE_CHECK_INTERVAL`)
- Scans IMAP inboxes of all sender accounts
- Classifies emails via rule-based patterns + Ollama AI fallback
- Updates contact `email_status` accordingly
- Only runs when `BOUNCE_CHECK_ENABLED=true`

### OOO Expiration Loop

- `_ooo_expire_loop()` uses a priority-queue approach
- Sleeps until the nearest `ooo_return_date`, then resets those contacts' `email_status` back to `valid`
- Automatically resets OOO contacts when their return date passes

### SSE Event Bus

- In-memory pub/sub with per-job and global subscribers
- Thread-safe via `asyncio.get_event_loop().call_soon_threadsafe()`
- **Single-process only** — not suitable for multi-worker deployment (one Uvicorn worker required)

### Job Lifecycle

```
queued ──▶ running ──▶ completed
              │
              ▼
            error

scheduled ──▶ (scheduler picks up when due) ──▶ running ──▶ completed/error

running ──▶ cancelled (admin cancellation)
```

---

## Bounce Detection & AI Classification

### How It Works

1. **IMAP Scan** — Connects to each sender account's IMAP inbox, fetches recent unread emails
2. **Rule-Based Classification** — Pattern matching on subject line and body:
   - Hard bounce: "undeliverable", "delivery failed", "550 5.1.1", etc.
   - Soft bounce: "mailbox full", "temporarily deferred", etc.
   - OOO: "out of office", "on vacation", "automatic reply", etc.
3. **AI Fallback** — If rules are inconclusive, sends the email snippet to Ollama for LLM classification
4. **Contact Update** — Sets `email_status` on `recruiters`/`referrals` to `bounced`, `risky`, or `ooo`
5. **OOO Date Extraction** — AI extracts return dates from OOO replies → sets `ooo_return_date`
6. **Logging** — Every classification creates a `bounce_logs` entry with type, method, and raw content

### Circuit Breaker

The Ollama client implements a circuit breaker: after **3 consecutive failures**, AI classification is bypassed and falls back to rule-based-only for a cooldown period.

### Admin Controls

- Toggle bounce scanning on/off via `/api/bounces/toggle`
- Trigger manual scan via `/api/bounces/scan`
- Monitor via SSE stream: `/api/bounces/scan/stream`
- Pull and manage Ollama models
- Test AI classification with sample inputs
- View/clear OOO contacts and auto-expire past-due entries

---

## Security

### Credential Protection
- **Supabase Vault** — SMTP passwords and Resend API keys are encrypted at rest via Vault RPC calls; never stored in plaintext in the database
- **Bcrypt access keys** — Access keys are hashed with bcrypt; plaintext keys were purged in migration 024
- **Audit logging** — All credential access events (`credential.accessed`, `vault_secret.*`) are logged with user ID, IP, and user agent

### Network Security
- **SMTP allowlist** — Outbound SMTP connections restricted to known providers to prevent SSRF:
  ```
  smtp.gmail.com, smtp.office365.com, smtp.outlook.com, smtp-mail.outlook.com,
  smtp.mail.yahoo.com, smtp.zoho.com, smtp.fastmail.com, mail.icloud.com,
  smtp.aol.com, smtp.mailgun.org, smtp.sendgrid.net, smtp.postmarkapp.com,
  email-smtp.{region}.amazonaws.com (4 regions)
  ```
- **CORS** — Restricted to `FRONTEND_URL` + localhost dev origins
- **Rate limiting** — 200/min default; stricter limits on auth, send, and import endpoints

### Database Security
- **Row-Level Security** — PostgreSQL RLS policies on 7 tables ensure users can only access their own data
- **Parameterized queries** — SQLAlchemy ORM prevents SQL injection
- **Connection pooling** — 5 base + 10 overflow connections with `pool_recycle=270s` for PgBouncer compatibility

### Frontend Security
- **Content Security Policy** — `default-src 'self'`; scripts only from self + Clerk; frame-ancestors `'none'`
- **Security headers** — `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- **HTML sanitization** — Template content sanitized via nh3 (Rust-based) before storage
- **File upload validation** — 25 MB max, magic-byte validation, extension allowlist

### Authentication Security
- **JWT verification** — RS256 with JWKS endpoint; cached 5 min with thread-safe retry
- **Session timeout** — 24h default, configurable
- **Access key binding** — Keys are single-use and bound to a user on first validation

---

## Consent & Legal System

Before sending emails, users must accept **five consent agreements**:

| Consent Type | Version | Description |
|---|---|---|
| Terms of Service | 3.0 | Platform usage terms |
| Privacy Policy | 3.0 | Data handling and privacy practices |
| Send on Behalf Of | 3.0 | Authorization to send emails through configured accounts |
| Data Security | 2.0 | Acknowledgment of data security practices |
| Audit Monitoring | 1.0 | Consent to audit trail recording |

- Consent is **versioned** — new versions require re-acceptance
- Backend `require_consent` dependency blocks send/schedule endpoints with **HTTP 403** if any consent is missing
- Frontend displays a banner and disables send buttons until all consents are accepted
- Full IP-stamped audit history is viewable on the Consent page

---

## Service Layer

| Service | File | Purpose |
|---|---|---|
| Email Sender | `backend/app/services/email_sender.py` | SMTP sending (`smtplib.SMTP_SSL`) + Resend HTTP API (`httpx`) |
| Template Handler | `backend/app/services/template_handler.py` | Template personalization with variable substitution |
| Vault | `backend/app/services/vault.py` | Supabase Vault integration — encrypted credential CRUD via raw SQL RPC |
| Storage | `backend/app/services/storage.py` | Supabase Storage — upload/download/delete files from private bucket |
| Settings Service | `backend/app/services/settings_service.py` | Per-user settings helper — lazy seeding, campaign defaults, SMTP settings |
| Audit Service | `backend/app/services/audit_service.py` | Append-only audit logging (sync + background thread variants) |
| Bounce Scanner | `backend/app/services/bounce_scanner.py` | IMAP inbox scanning + rule-based/AI bounce classification |
| LLM Client | `backend/app/services/llm_client.py` | Ollama REST API wrapper — generate, classify, extract; circuit breaker after 3 failures |
| Excel Handler | `backend/app/services/excel_handler.py` | Excel import/export via pandas/openpyxl |
| Clipboard Parser | `backend/app/services/clipboard_parser.py` | CSV/TSV parsing with fuzzy header detection |
| SSE Auth | `backend/app/services/sse_auth.py` | Shared SSE query-param token verification |

---

## Project Structure

```
├── dev.sh                      # Start backend + frontend for local development
├── run.sh                      # Docker Compose management CLI (up/down/logs/migrate/test/…)
├── redeploy.sh                 # Full redeployment: build → migrate → pull AI model → health check
├── migrate_data.py             # One-time SQLite → PostgreSQL migration utility
├── main.py                     # Legacy CLI email sender entry point
├── docker-compose.yml          # 3-service stack: backend + frontend + ollama
├── nginx.conf                  # Reverse proxy, SPA fallback, SSE support, security headers
├── requirements.txt            # Top-level Python deps (legacy CLI)
│
├── backend/
│   ├── Dockerfile              # Python 3.13-slim, non-root user, healthcheck
│   ├── requirements.txt        # FastAPI, SQLAlchemy, PyJWT, bcrypt, nh3, httpx, pandas, …
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/           # 25 migration scripts (001–025)
│   └── app/
│       ├── main.py             # FastAPI app: 16 routers, middleware, lifespan, inline endpoints
│       ├── config.py           # Environment variable loading + validation
│       ├── auth.py             # Clerk JWT verification (RS256 JWKS)
│       ├── database.py         # SQLAlchemy engine, session factory, connection pooling
│       ├── background.py       # Scheduler, bounce check, OOO expiry loops
│       ├── rate_limit.py       # slowapi rate limiter (200/min default, user-ID keyed)
│       ├── smtp_allowlist.py   # SSRF prevention: allowed SMTP hosts
│       ├── logging_config.py   # Structured logging setup
│       ├── models/             # 14 SQLAlchemy models
│       │   ├── recruiter.py / referral.py   # Contact models (shared mixin)
│       │   ├── email_column.py              # Campaign rows
│       │   ├── template.py                  # Email templates
│       │   ├── document.py                  # File attachments
│       │   ├── job_result.py                # Background job tracking
│       │   ├── setting.py                   # Per-user key-value settings
│       │   ├── sender_account.py            # Sender email accounts
│       │   ├── access_key.py                # Bcrypt-hashed access keys
│       │   ├── audit_log.py                 # Audit trail entries
│       │   ├── bounce_log.py                # Bounce classification logs
│       │   ├── custom_column_definition.py  # User-defined columns
│       │   ├── user_consent.py              # Consent records
│       │   ├── user_role.py                 # RBAC roles
│       │   └── user_profile.py              # Cached Clerk user data
│       ├── routers/             # 14 router modules
│       │   ├── contact_router.py            # Generic factory for recruiter/referral endpoints
│       │   ├── campaigns.py / templates.py / emails.py
│       │   ├── import_export.py / documents.py / settings.py
│       │   ├── sender_accounts.py / consent.py / audit_logs.py
│       │   ├── custom_columns.py / admin.py / bounces.py
│       │   └── recruiters.py / referrals.py (factory instances)
│       ├── schemas/             # Pydantic request/response models
│       └── services/            # 11 service modules (see Service Layer section)
│
├── frontend/
│   ├── Dockerfile              # Multi-stage: node:22-alpine → nginx:alpine
│   ├── package.json            # React 19, Vite 6.3, TypeScript 5.8, AG Grid, Monaco, …
│   ├── vite.config.ts          # Tailwind CSS plugin, /api proxy to :8000
│   ├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
│   ├── eslint.config.js
│   ├── index.html
│   └── src/
│       ├── App.tsx             # Routes (17), Clerk provider, access key gate, lazy loading
│       ├── main.tsx            # Entry point, ClerkProvider
│       ├── index.css           # Tailwind CSS imports
│       ├── api/
│       │   ├── client.ts       # All API endpoint functions
│       │   └── instance.ts     # Axios instance with JWT + access key interceptor
│       ├── components/
│       │   └── ui/             # shadcn/ui primitives (button, dialog, table, tabs, …)
│       ├── hooks/              # useContactList, useJobSSE, useDebounce, useShiftSelect, …
│       ├── lib/
│       │   └── accessKeyStore.ts  # SessionStorage + BroadcastChannel sync
│       └── pages/
│           ├── DashboardPage.tsx / RecruitersPage.tsx / ReferralsPage.tsx
│           ├── CampaignsPage.tsx / TemplatesPage.tsx / DocumentsPage.tsx
│           ├── SendPage.tsx / ScheduledJobsPage.tsx / JobDetailPage.tsx
│           ├── SettingsPage.tsx / AdminPage.tsx / AccessKeyPage.tsx
│           ├── ConsentPage.tsx / TermsPage.tsx / PrivacyPage.tsx / LoginPage.tsx
│           ├── admin/          # 7 admin sub-tab components
│           └── settings/       # 4 settings sub-section components
│
├── sending_email/              # Legacy standalone CLI email sender
│   ├── config.py               # .env loading, sender email/password pairs
│   ├── email_sender.py         # SMTP_SSL login + EmailMessage builder
│   ├── excel_handler.py        # Pandas Excel read/write
│   ├── template_handler.py     # Regex-based template personalization
│   ├── assets/selfie/          # Inline image assets
│   └── templates/              # HTML email templates (7 templates)
│
└── scripts/
    ├── cleanup_invalid_emails.py              # Audit/fix invalid email addresses
    ├── 012_security_hardening.sql             # Manual RLS setup for Supabase SQL Editor
    └── 012_security_hardening_rollback.sql    # RLS rollback script
```

---

## Operational Scripts

| Script | Purpose | Usage |
|---|---|---|
| `dev.sh` | Starts backend (Uvicorn `--reload` on :8000) + frontend (Vite on :5173) for local dev; traps Ctrl+C to kill both | `./dev.sh` |
| `run.sh` | Docker Compose management CLI | `./run.sh <command>` |
| `redeploy.sh` | Full redeployment: `docker compose up -d --build` → `alembic upgrade head` → `ollama pull` → health check | `./redeploy.sh` |
| `migrate_data.py` | One-time SQLite→PostgreSQL migration with datetime parsing, JSON handling, sequence resets | `python migrate_data.py` |

### `run.sh` subcommands

| Command | Action |
|---|---|
| `dev` | Start backend + frontend in parallel (non-Docker) |
| `build` | `docker compose build` |
| `up` | `docker compose up -d` |
| `down` | `docker compose down` |
| `logs` | `docker compose logs -f` |
| `migrate` | `cd backend && alembic upgrade head` |
| `lint` | TypeScript type-check + ESLint |
| `test` | `cd backend && pytest -x -q` |
| `shell` | `docker compose exec backend bash` |

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contact

For any questions or issues, please contact anhlamtruong1012@gmail.com.
