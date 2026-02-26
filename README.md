# 📧 ChuChuBe Emails

A full-stack personalized email campaign management platform for sending outreach emails at scale. Built with FastAPI, React, and PostgreSQL.

![Stack](https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white)
![Stack](https://img.shields.io/badge/React_19-61DAFB?style=flat&logo=react&logoColor=black)
![Stack](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Stack](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white)
![Stack](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Features](#features)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Frontend Pages](#frontend-pages)
- [Email Sending Flow](#email-sending-flow)
- [Background Job System](#background-job-system)
- [Consent & Legal System](#consent--legal-system)
- [Project Structure](#project-structure)
- [License](#license)
- [Contact](#contact)

---

## Overview

ChuChuBe Emails is a self-hosted tool for managing recruiter outreach and email campaigns. It provides a spreadsheet-like UI for campaign management, HTML template editing with live preview, multi-sender email support, scheduled/recurring sends, document attachments, and a clipboard paste import system with fuzzy column matching.

---

## Tech Stack

| Layer                | Technology                              | Version               |
| -------------------- | --------------------------------------- | --------------------- |
| **Backend**          | Python + FastAPI                        | Python 3.13           |
| **ASGI Server**      | Uvicorn                                 | latest (`[standard]`) |
| **ORM / Migrations** | SQLAlchemy + Alembic                    | latest                |
| **Database**         | PostgreSQL (Supabase) / SQLite fallback | psycopg2-binary       |
| **Auth**             | Clerk (JWT/JWKS RS256)                  | PyJWT + cryptography  |
| **Frontend**         | React 19 + TypeScript 5.8               | Vite 6.3              |
| **UI Framework**     | Tailwind CSS 4.1 + shadcn/ui            | —                     |
| **Data Grid**        | AG Grid Community                       | 35.1                  |
| **Code Editor**      | Monaco Editor                           | 4.7                   |
| **HTTP Client**      | Axios                                   | 1.13                  |
| **Routing**          | React Router Dom                        | 7.13                  |
| **Icons**            | Lucide React                            | 0.564                 |
| **Notifications**    | Sonner 2.0 + react-hot-toast 2.6        | —                     |
| **Reverse Proxy**    | Nginx (Alpine)                          | —                     |
| **Containerization** | Docker Compose                          | 2-service             |
| **Data Processing**  | Pandas + openpyxl                       | —                     |

---

## Features

- **Multi-sender support** — Up to 9 sender email accounts with per-sender resume attachments
- **HTML template engine** — `{placeholder}` variables, value proposition framework (passion/known_for/mission), inline image embedding, Monaco editor with live preview
- **Campaign generation** — Auto-generate campaign rows from selected recruiters with configurable defaults
- **Clipboard paste import** — Fuzzy column matching for CSV/TSV pasted from spreadsheets (recruiters & campaigns)
- **Excel import/export** — Import recruiters and campaigns from `.xlsx`, export campaigns to Excel
- **Document management** — Three-tier attachment system: global (all emails), per-sender (resume), per-campaign-row (specific)
- **Email scheduling** — One-time and recurring scheduling with timezone support
- **Background job tracking** — Persistent job records survive server restarts with real-time status polling
- **Clerk authentication** — JWT-based auth with JWKS verification and per-user data isolation
- **User consent management** — Versioned consent tracking for ToS, Privacy Policy, and send-on-behalf authorization
- **AG Grid spreadsheet** — Inline editing, multi-select, bulk operations, custom columns
- **Failed email retry** — Filter, view, and retry/reset failed emails from the Send page
- **Auto-seeding** — Templates seeded from HTML files on first run, settings seeded with env-var overrides
- **SMTP test** — Test SMTP connection directly from the Settings page

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Docker Compose                       │
│                                                          │
│  ┌──────────────┐        ┌────────────────────────────┐ │
│  │   Frontend    │        │         Backend             │ │
│  │   (Nginx)     │───────▶│   FastAPI + Uvicorn         │ │
│  │   Port 80     │ /api/* │   Port 8000                 │ │
│  │               │        │                             │ │
│  │  React SPA    │        │  ┌───────────┐ ┌─────────┐ │ │
│  │  served as    │        │  │  Alembic   │ │ SMTP/   │ │ │
│  │  static files │        │  │  Migrations│ │ Gmail   │ │ │
│  └──────────────┘        │  └───────────┘ └─────────┘ │ │
│                           │         │                   │ │
│                           │    ┌────▼────┐              │ │
│                           │    │PostgreSQL│              │ │
│                           │    │(Supabase)│              │ │
│                           │    └─────────┘              │ │
│                           └────────────────────────────┘ │
│                                                          │
│  Volume: uploads-data (persistent file storage)          │
└─────────────────────────────────────────────────────────┘
```

Nginx serves the React SPA and reverse-proxies all `/api/*` requests to the FastAPI backend. Uploaded files are persisted via a Docker volume.

---

## Getting Started

### Prerequisites

- Python 3.13+
- Node.js 18+
- PostgreSQL (or use SQLite for local dev)
- Docker & Docker Compose (for production)
- [Clerk](https://clerk.com) account for authentication

### Development (local)

```bash
# 1. Clone and configure
cp .env.example .env
# Edit .env with your credentials

# 2. Install backend dependencies
cd backend && pip install -r requirements.txt && cd ..

# 3. Install frontend dependencies
cd frontend && npm install && cd ..

# 4. Start both servers
./dev.sh
# Backend:  http://localhost:8000 (with --reload)
# Frontend: http://localhost:5173
# API docs: http://localhost:8000/docs
```

### Docker Compose (production)

```bash
# Ensure .env exists with all required variables
./run.sh              # Build & start
./run.sh start        # Start without rebuild
./run.sh stop         # Stop containers
./run.sh restart      # Stop → rebuild → start
./run.sh rebuild      # Full clean rebuild (no cache)
./run.sh logs         # Follow live logs
./run.sh logs:be      # Backend logs only
./run.sh migrate      # Run Alembic migrations
./run.sh status       # Container status
```

---

## Environment Variables

| Variable                     | Description                                          | Default                 |
| ---------------------------- | ---------------------------------------------------- | ----------------------- |
| `DATABASE_URL`               | Database connection string                           | `sqlite:///data.db`     |
| `UPLOADS_DIR`                | Directory for uploaded files                         | `data/uploads`          |
| `YOUR_NAME`                  | Sender's full name (seeded into settings)            | `""`                    |
| `YOUR_PHONE`                 | Sender's phone number                                | `""`                    |
| `YOUR_CITY_STATE`            | Sender's city & state                                | `""`                    |
| `SENDER_EMAIL_{1-9}`         | Multi-sender email addresses (up to 9)               | —                       |
| `SENDER_PASSWORD_{1-9}`      | Gmail App Passwords for each sender                  | —                       |
| `SENDER_RESUME_{1-9}`        | Resume file path per sender                          | —                       |
| `SMTP_SERVER`                | SMTP server hostname                                 | `smtp.gmail.com`        |
| `SMTP_PORT`                  | SMTP server port                                     | `465`                   |
| `CLERK_SECRET_KEY`           | Clerk backend secret key                             | `""`                    |
| `CLERK_JWKS_URL`             | Clerk JWKS endpoint for JWT verification             | `""`                    |
| `FRONTEND_URL`               | Allowed CORS origin                                  | `http://localhost:5173` |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (baked into frontend at build) | —                       |

---

## Database Schema

Seven migrations managed via Alembic.

### Recruiter (`recruiters`)

| Field                       | Type        | Notes           |
| --------------------------- | ----------- | --------------- |
| `id`                        | UUID (PK)   | auto-generated  |
| `name`                      | String(200) | required        |
| `email`                     | String(320) | unique, indexed |
| `company`                   | String(200) | indexed         |
| `title`                     | String(200) | —               |
| `location`                  | String(200) | indexed         |
| `notes`                     | Text        | —               |
| `created_at` / `updated_at` | DateTime    | auto-managed    |

### EmailColumn (`email_columns`) — Campaign Rows

| Field                                | Type                 | Notes                                               |
| ------------------------------------ | -------------------- | --------------------------------------------------- |
| `id`                                 | UUID (PK)            | auto-generated                                      |
| `sender_email`                       | String(320)          | —                                                   |
| `recipient_name` / `recipient_email` | String               | —                                                   |
| `company`                            | String(200)          | indexed                                             |
| `position`                           | String(200)          | —                                                   |
| `template_file`                      | String(200)          | —                                                   |
| `framework`                          | String(50)           | `passion` / `known_for` / `mission`                 |
| `my_strength` / `audience_value`     | Text                 | —                                                   |
| `custom_fields`                      | JSON                 | custom template placeholders                        |
| `sent_status`                        | String(20)           | `pending` / `sent` / `failed` / `response`, indexed |
| `sent_at` / `scheduled_at`           | DateTime             | nullable                                            |
| `recruiter_id`                       | UUID FK → recruiters | SET NULL on delete                                  |
| `user_id`                            | String(200)          | Clerk user ID, indexed                              |

### Template (`templates`)

| Field          | Type        | Notes                             |
| -------------- | ----------- | --------------------------------- |
| `id`           | UUID (PK)   | auto-generated                    |
| `name`         | String(200) | unique per user_id                |
| `user_id`      | String(200) | nullable (null = system template) |
| `subject_line` | Text        | —                                 |
| `body_html`    | Text        | —                                 |

### Document (`documents`)

| Field                        | Type         | Notes                                |
| ---------------------------- | ------------ | ------------------------------------ |
| `id`                         | UUID (PK)    | auto-generated                       |
| `filename` / `original_name` | String       | stored vs user-facing name           |
| `file_path`                  | String(1000) | absolute path on disk                |
| `mime_type`                  | String(200)  | —                                    |
| `size_bytes`                 | Integer      | —                                    |
| `scope`                      | String(20)   | `global` / `sender` / `campaign_row` |
| `scope_ref`                  | String(320)  | sender email or row ID               |

### JobResult (`job_results`)

| Field                       | Type       | Notes                                                      |
| --------------------------- | ---------- | ---------------------------------------------------------- |
| `id`                        | UUID (PK)  | auto-generated                                             |
| `status`                    | String(20) | `queued` / `scheduled` / `running` / `completed` / `error` |
| `total` / `sent` / `failed` | Integer    | counts                                                     |
| `row_ids`                   | JSON       | list of campaign row UUIDs                                 |
| `errors`                    | JSON       | list of error strings                                      |

### Setting (`settings`)

Key-value store with seeded defaults: `default_position`, `default_framework`, `default_my_strength`, `default_audience_value`, `your_name`, `your_phone`, `your_city_state`, `smtp_server`, `smtp_port`, `sleep_between_emails`.

### UserConsent (`user_consents`)

| Field          | Type        | Notes                                                    |
| -------------- | ----------- | -------------------------------------------------------- |
| `id`           | UUID (PK)   | auto-generated                                           |
| `user_id`      | String(200) | indexed                                                  |
| `consent_type` | String(50)  | `terms_of_service` / `privacy_policy` / `send_on_behalf` |
| `version`      | String(20)  | current: `1.0`                                           |
| `accepted_at`  | DateTime    | —                                                        |
| `ip_address`   | String(50)  | nullable                                                 |

Unique constraint on (`user_id`, `consent_type`, `version`).

### Migration History

| #   | File                                | Description                         |
| --- | ----------------------------------- | ----------------------------------- |
| 001 | `001_initial.py`                    | Initial schema                      |
| 002 | `002_add_scheduled_at.py`           | Add `scheduled_at` to email_columns |
| 003 | `003_add_job_results.py`            | Add `job_results` table             |
| 004 | `004_add_user_id.py`                | Add `user_id` to email_columns      |
| 005 | `005_convert_to_uuid.py`            | Convert integer PKs to UUIDs        |
| 006 | `006_add_row_ids_to_job_results.py` | Add `row_ids` JSON to job_results   |
| 007 | `007_add_user_consent.py`           | Add `user_consents` table           |

---

## API Endpoints

All protected routes require Clerk JWT: `Authorization: Bearer <token>`.

### Health & Dashboard

| Method | Path             | Description                                    |
| ------ | ---------------- | ---------------------------------------------- |
| `GET`  | `/api/health`    | Health check (no auth)                         |
| `GET`  | `/api/dashboard` | Stats: counts, status breakdown, upcoming jobs |

### Recruiters — `/api/recruiters`

| Method   | Path     | Description                                                   |
| -------- | -------- | ------------------------------------------------------------- |
| `GET`    | `/`      | List (paginated, filterable by company/location/title/search) |
| `GET`    | `/count` | Total count                                                   |
| `GET`    | `/{id}`  | Get single                                                    |
| `POST`   | `/`      | Create single                                                 |
| `PUT`    | `/{id}`  | Update                                                        |
| `DELETE` | `/{id}`  | Delete                                                        |
| `POST`   | `/bulk`  | Bulk create                                                   |

### Campaigns — `/api/campaigns`

| Method   | Path                        | Description                            |
| -------- | --------------------------- | -------------------------------------- |
| `GET`    | `/custom-columns`           | Distinct custom field column names     |
| `GET`    | `/`                         | List (paginated, filterable)           |
| `GET`    | `/count`                    | Count for current user                 |
| `POST`   | `/`                         | Create                                 |
| `PUT`    | `/{id}`                     | Update                                 |
| `PUT`    | `/bulk/update`              | Bulk update                            |
| `DELETE` | `/{id}`                     | Delete                                 |
| `DELETE` | `/bulk/delete`              | Bulk delete                            |
| `POST`   | `/generate-from-recruiters` | Auto-generate from selected recruiters |
| `POST`   | `/bulk-paste`               | Bulk paste with optional position      |

### Templates — `/api/templates`

| Method   | Path            | Description              |
| -------- | --------------- | ------------------------ |
| `GET`    | `/`             | List all (system + user) |
| `GET`    | `/{id}`         | Get single               |
| `POST`   | `/`             | Create                   |
| `PUT`    | `/{id}`         | Update                   |
| `DELETE` | `/{id}`         | Delete                   |
| `POST`   | `/{id}/preview` | Preview with sample data |

### Emails — `/api/emails`

| Method   | Path                       | Description                            |
| -------- | -------------------------- | -------------------------------------- |
| `POST`   | `/send`                    | Send immediately (background thread)   |
| `GET`    | `/status/{job_id}`         | Job status                             |
| `GET`    | `/jobs`                    | List all jobs (paginated)              |
| `GET`    | `/senders`                 | List configured senders                |
| `POST`   | `/schedule`                | Schedule one-time send                 |
| `POST`   | `/schedule/recurring`      | Schedule recurring sends with interval |
| `GET`    | `/scheduled-jobs`          | List scheduled + finished jobs         |
| `DELETE` | `/scheduled-jobs/{job_id}` | Cancel scheduled job                   |

### Import/Export — `/api/import-export`

| Method | Path                      | Description                                     |
| ------ | ------------------------- | ----------------------------------------------- |
| `POST` | `/import-campaigns`       | Import from Excel                               |
| `POST` | `/import-recruiters`      | Import single Excel file                        |
| `POST` | `/import-recruiters-bulk` | Import multiple Excel files                     |
| `POST` | `/parse-clipboard`        | Parse clipboard CSV/TSV (fuzzy column matching) |
| `POST` | `/commit-clipboard`       | Commit parsed clipboard data                    |
| `GET`  | `/export-campaigns`       | Export to Excel download                        |

### Documents — `/api/documents`

| Method   | Path               | Description                          |
| -------- | ------------------ | ------------------------------------ |
| `GET`    | `/`                | List (filtered by scope & scope_ref) |
| `POST`   | `/upload`          | Upload single                        |
| `POST`   | `/upload-multiple` | Upload multiple                      |
| `GET`    | `/{id}/download`   | Download                             |
| `DELETE` | `/{id}`            | Delete                               |

### Settings — `/api/settings`

| Method | Path         | Description          |
| ------ | ------------ | -------------------- |
| `GET`  | `/`          | List all settings    |
| `GET`  | `/{key}`     | Get by key           |
| `PUT`  | `/{key}`     | Update single        |
| `PUT`  | `/`          | Bulk update          |
| `POST` | `/test-smtp` | Test SMTP connection |

### Consent — `/api/consent`

| Method | Path          | Description                  |
| ------ | ------------- | ---------------------------- |
| `GET`  | `/status`     | Current consent status       |
| `POST` | `/accept`     | Accept single consent type   |
| `POST` | `/accept-all` | Accept all required consents |
| `GET`  | `/history`    | Consent acceptance history   |

---

## Frontend Pages

| Route             | Page             | Description                                                                                                                                                      |
| ----------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`          | Login            | Clerk sign-in; redirects when authenticated                                                                                                                      |
| `/`               | Dashboard        | Overview cards (totals, status breakdown), upcoming jobs, quick actions                                                                                          |
| `/recruiters`     | Recruiters       | CRUD table with search, filters, pagination, Excel/clipboard import, drag-and-drop                                                                               |
| `/campaigns`      | Campaigns        | AG Grid spreadsheet: inline editing, auto-save, bulk ops, generate from recruiters, clipboard paste, Excel import/export, custom columns, sender/template picker |
| `/templates`      | Templates        | Monaco HTML editor with live preview, system vs user templates                                                                                                   |
| `/documents`      | Documents        | File management with 3 scopes, upload/download/delete, drag-and-drop, multi-file                                                                                 |
| `/send`           | Send             | Email control center: select campaigns, send/schedule (one-time/recurring), timezone, job progress, consent gate, retry failed, reset status                     |
| `/scheduled-jobs` | Scheduled Jobs   | View/cancel jobs, auto-refresh (30s), expandable finished job details                                                                                            |
| `/settings`       | Settings         | Grouped settings editor (Campaign Defaults, Personal Info, SMTP), SMTP test                                                                                      |
| `/consent`        | Consent          | Accept ToS, Privacy Policy, send-on-behalf; consent history                                                                                                      |
| `/terms`          | Terms of Service | Legal terms content                                                                                                                                              |
| `/privacy`        | Privacy Policy   | Privacy policy content                                                                                                                                           |

---

## Email Sending Flow

1. **Select campaigns** on the Send page (filtered by `sent_status=pending`) and click Send or Schedule
2. **Consent check** — frontend verifies all consents accepted; backend enforces via `require_consent` dependency (returns 403 if missing)
3. **Job created** — `JobResult` record with `row_ids` and status `queued` (immediate) or `scheduled` (deferred)
4. **`send_email_batch()` runs in background thread**:
   - Sorts rows by `sender_email` to minimize SMTP reconnections
   - Logs into SMTP via `smtplib.SMTP_SSL` with stored credentials
   - Loads template from DB, personalizes via `template_handler.personalize_template()` — replaces `{first_name}`, `{company}`, `{position}`, `{value_prop_sentence}`, `{your_name}`, `{your_email}`, custom fields, etc.
   - Gathers attachments: global docs → sender-scoped docs → row-scoped docs
   - Optionally embeds inline images
   - Sends using `EmailMessage` with HTML body + attachments
   - Updates `sent_status` to `sent` with `sent_at` timestamp
   - Sleeps `sleep_between_emails` seconds between sends (configurable, default 2s)
   - On failure: marks row `failed`, logs error in `JobResult.errors`
5. **Job finalized** — `JobResult.status` → `completed`, `sent`/`failed` counts recorded

### Template Placeholders

| Placeholder             | Source                                             |
| ----------------------- | -------------------------------------------------- |
| `{first_name}`          | Recipient's first name (from `recipient_name`)     |
| `{company}`             | Company name                                       |
| `{position}`            | Position/role                                      |
| `{value_prop_sentence}` | Auto-generated from `framework` + `audience_value` |
| `{your_name}`           | From settings                                      |
| `{your_email}`          | Sender email                                       |
| `{your_phone}`          | From settings                                      |
| `{your_city_state}`     | From settings                                      |
| `{my_strength}`         | Custom strength pitch                              |
| `{custom_*}`            | Any key from `custom_fields` JSON                  |

### Value Proposition Framework

Three framework options for `{value_prop_sentence}`:

- **passion** — "I'm drawn to {company} because {audience_value}"
- **known_for** — "{company} is known for {audience_value}, and I'd love to contribute"
- **mission** — "Your mission around {audience_value} aligns with my goals"

---

## Background Job System

- **No external broker** — uses Python `asyncio` + `threading.Thread` (no Celery/Redis required)
- **Scheduler loop** — asyncio task created at app startup, polls DB every **60 seconds** for `JobResult` rows with `status="scheduled"` where associated campaign rows have `scheduled_at <= now`
- **Immediate sends** — `POST /api/emails/send` creates a `JobResult` (status=`queued`), spawns background thread
- **Scheduled sends** — `POST /api/emails/schedule` sets `scheduled_at` on campaign rows, creates `JobResult` with `status="scheduled"`; scheduler picks up when due
- **Recurring sends** — `POST /api/emails/schedule/recurring` distributes rows across time intervals (e.g., every 30 min) with staggered `scheduled_at`
- **Job lifecycle** — `queued` → `running` → `completed` / `error`; counts and error logs persisted in `JobResult`

---

## Consent & Legal System

Before sending emails, users must accept three consent agreements:

1. **Terms of Service** — Usage terms for the platform
2. **Privacy Policy** — Data handling and privacy practices
3. **Send on Behalf Of** — Authorization to send emails through configured accounts

Consent is versioned (current: `1.0` for all types). The backend `require_consent` dependency blocks send/schedule endpoints with HTTP 403 if any consent is missing. The frontend displays a banner and disables send buttons until all consents are accepted. Full audit history is viewable on the Consent page.

---

## Project Structure

```
├── dev.sh                      # Start both servers for development
├── run.sh                      # Docker Compose management script
├── docker-compose.yml          # 2-service deployment (frontend + backend)
├── nginx.conf                  # Nginx reverse proxy config
├── .env.example                # Environment variable template
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/          # 7 migration scripts
│   └── app/
│       ├── main.py            # FastAPI app, router mounts, startup events
│       ├── config.py          # Environment variable loading
│       ├── auth.py            # Clerk JWT verification
│       ├── database.py        # SQLAlchemy engine & session
│       ├── logging_config.py  # Logging setup
│       ├── models/            # SQLAlchemy models (7 tables)
│       ├── routers/           # API route handlers
│       ├── schemas/           # Pydantic request/response models
│       └── services/          # Business logic (email, Excel, templates, clipboard)
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── App.tsx            # Routes & auth provider
│       ├── main.tsx           # Entry point
│       ├── api/
│       │   └── client.ts      # Axios API client with all endpoints
│       ├── components/        # Shared UI components
│       ├── hooks/             # Custom hooks (useAuth)
│       └── pages/             # 12 page components
│
└── sending_email/             # Legacy standalone email scripts
    ├── config.py
    ├── email_sender.py
    ├── excel_handler.py
    ├── template_handler.py
    └── templates/             # HTML email templates
```

---

## License

This project is licensed under the MIT License. See the LICENSE file for details.

## Contact

For any questions or issues, please contact anhlamtruong1012@gmail.com.
