# New Platform Architecture Plan

_Date: 2025-09-28_

This document captures the target architecture derived from the latest product prompt. It will guide the backend schema redesign, service layer refactor, and frontend rebuild.

## 1. Role Responsibilities Summary

| Role | Capabilities |
|------|--------------|
| **Superadmin** | Manage companies, admins, candidates; bulk CSV import/export for users/competencies/questions/tests; maintain competency dictionary; curate global question bank; configure tests via multi-step wizard; assign tests to companies/users; monitor global status feed; manage AI prompts; download credential bundles; edit passwords; modify existing tests. |
| **Admin** | Company-scoped status dashboard; view/download submissions and AI reports; trigger analysis; manage candidate CSV imports (strict validation, skip duplicates, reject empty rows); see user updates with % completion. |
| **Candidate** | Fully localized assessment flow (language-driven UI, GDPR consent, camera QA, per-question timers, transcription, follow-up generation). |

## 2. Core Domain Entities

### 2.1 Companies & Users
- `companies` (former tenants)
  - `id` (UUID), `company_code` (auto C1+), `name`, `logo_url`, `branding`, `max_attempts`, `default_reply_mode`, timestamps.
  - Non-null fields: `name`, `max_attempts`, `default_reply_mode`.
- `users`
  - `id` (UUID), `user_code` (C1/C2...), `email` (unique, lowercased), `hashed_password`, `role`, `phone_number`, `date_created`, `company_id` (nullable for system superadmins), `is_active`.
  - Enforce `role` enum (superadmin/admin/candidate), `company_id` required for admins and candidates.
  - Store `temp_password` (encrypted) for credential export, plus `password_last_updated_at`.
- `admin_assignments`
  - Maps admins to companies (one company per admin enforced), includes `assigned_by` and audit info.

### 2.2 Competencies & Questions
- `competencies`
  - `id`, `competency_code` (CMP1+), `name`, `description`, `category`, `industry`, `role_category`, `scope` (system/company), `company_id` (nullable), timestamps.
  - All textual fields non-null except optional classification columns.
- `questions`
  - `id`, `question_code` (Q1+), `name`, `description`, `question_type` (enum: SJT/JDT/CASE), `competency_codes` (ARRAY/JSON list, non-empty), `content` JSON (type-specific shape), `scope`, `company_id`, `created_by`, `is_active`.
  - Add `metadata` JSON for templates (reading time, answer time, etc.).
- `question_media_templates`
  - Optional table for storing template assets per question (prompts, audio cues) to support future media storage abstraction.

### 2.3 Tests & Assignments
- `tests`
  - `id`, `test_code` (T1+), `name`, `description`, `test_type`, `scope`, `company_id`, `created_by`, `config` JSON (timers, delivery mode defaults, camera checks), `is_active`.
- `test_questions`
  - `id`, `test_id`, `question_id`, `sort_order`, `question_config` JSON (per-question overrides), `question_alias` (editable label).
- `test_competency_overrides`
  - `id`, `test_id`, `competency_code`, `competency_name`, `override_description`, timestamps.
- `test_assignments`
  - `id`, `assignment_code` (A1+), `name`, `company_id`, `test_id`, `delivery_mode` enum, `total_time_limit`, `question_time_limit`, `follow_up_limit`, `penalty_percent`, `reading_time`, `consideration_time`, `camera_check_required`, `assigned_by`, `assigned_at`, `notes`.
- `test_assignment_users`
  - Join table between assignments and users; stores `status` (pending/started/completed), `percent_complete`, `due_date`, `max_attempts`, `attempts_used`, `status_updated_at`.

### 2.4 Submissions & Analysis
- `submissions`
  - `id`, `submission_code` (S1+), `user_id`, `assignment_id`, `test_id`, `company_id`, `language`, `ui_language`, `conversation_history` JSON, `analysis_result` JSON, `analysis_status` enum, `analysis_requested_by`, `analysis_requested_at`, `analysis_completed_at`, `ai_model_version`, timestamps.
- `submission_media`
  - `id`, `submission_id`, `question_ref`, `media_type`, `storage_key`, `storage_provider`, `duration`, `transcription_status`, `transcription_text`, `created_at`.
- `ai_question_scores`
  - `id`, `submission_id`, `question_id`, `competency_code`, `score_primary`, `score_secondary`, `ai_explanation`, `metadata` JSON.

### 2.5 Status & Audit
- `status_events`
  - `id`, `event_code` (E1+), `tenant_scope` (company/global), `company_id`, `event_type`, `message`, `entities` JSON (e.g., `{ "candidate": {"id": "...", "name": "..."}, ... }`), `visibility` enum (admin|superadmin|both), `created_by`, `created_at`.
- `audit_logs`
  - Extend existing table with `changeset` diff storage and request metadata.

### 2.6 Utilities
- `code_sequences`
  - `id`, `entity` enum (`company`, `user`, `competency`, `question`, `test`, `assignment`, `submission`, `event`), `prefix`, `last_value` (int), `updated_at`.
  - Used via transactional service to generate gapless codes (C1, C2, ...).
- `csv_import_logs`
  - Track uploaded file metadata, counts of processed/skipped rows, reason arrays, author, timestamps.

## 3. ID & Code Generation
- Introduce `CodeGenerator` service (Python module) that:
  1. Opens transaction.
  2. `SELECT ... FOR UPDATE` on `code_sequences` row.
  3. Increment `last_value`, persist, and return `f"{prefix}{last_value}"`.
- Prefix mapping: `CO` (company), `U` (user), `CMP` (competency), `Q`, `T`, `TA` (test assignment), `S` (submission), `E` (event).
- Enforce code assignment via SQLAlchemy event listeners (before insert) to guarantee non-null codes.

## 4. CSV Import/Export Flows
- Common validation pipeline (`csv_validator.py`):
  - Parse with `pydantic` schema per entity (users, competencies, questions, assignment users).
  - Reject rows with any empty required field.
  - Detect duplicates (by code/email) before hitting DB.
  - Collect row-level errors; skip invalid rows but keep processing others.
  - Return summary (created/skipped/duplicate/excluded) stored in `csv_import_logs` and surfaced to UI.
- Export endpoints stream CSV using `StreamingResponse` with consistent header ordering.

## 5. Status Event Matrix
- **Admin-visible events** (scoped to their company):
  - Candidate started/completed test.
  - AI report generated.
  - Test assigned to candidate(s).
  - CSV import summaries (candidate uploads).
- **Superadmin-only events**:
  - Company created/updated.
  - Admin created/deactivated.
  - Question bank changes.
  - Competency imports.
  - Test created/modified globally.
- Events stored immediately inside service layer transactions to ensure consistency.

## 6. Media Storage Abstraction
- New module `app/services/media_storage.py` with interface:
  ```python
  class MediaStorage:
      async def save(self, *, submission_code: str, question_ref: str, media: MediaPayload) -> MediaRecord: ...
      async def delete(self, storage_key: str) -> None: ...
      async def get_url(self, storage_key: str, expires_in: int = 3600) -> str: ...
  ```
- Default implementation: Local filesystem under `uploads/` with deterministic folder structure (`/submission_code/question_ref/`).
- Future S3/Firebase adapters plug into same interface.

## 7. Frontend Architecture Highlights
- Shared table component with:
  - Column-level search input.
  - Multi-select filter chips (Excel pivot style).
  - Sticky action bar (CSV download/upload, bulk actions).
- Superadmin test wizard (React state machine):
  1. **Metadata** (`name`, `description`, `test type`).
  2. **Question selection** (grid w/ filters, create-question modal, add-to-bank checkbox).
  3. **Competency overrides** (editable table, per-field filters, chip view).
  4. **Question fine-tuning** (accordion editor; previous/next nav).
  5. **Review & assign** (optional immediate assignment).
- Admin dashboard trimmed to:
  - Status feed.
  - Submissions view (tabular with download/report triggers).
  - Candidate CSV uploader leveraging shared validator components.
- Candidate assessment shell restructured to accept locale bundle from context and re-render all UI strings when language changes.

## 8. AI Analysis Enhancements
- Prompt composer collects:
  - Per-test competency overrides.
  - Base definitions for competencies not overridden.
  - For each question: `question text`, `candidate answer`, `competency list`, `override description`.
- Gemini request expects dual scoring output per question (per competency + overall) and aggregated summary.
- Store raw prompt + response JSON in `analysis_result` for auditing.

## 9. Migration Strategy
1. Freeze API branch; apply new schema via Alembic (generate scripts for code sequences, assignments, etc.).
2. Data migration steps:
   - Backfill codes for existing records using new generator service (execute idempotent script).
   - Normalize language fields (`preferred_language` -> `language_code`).
   - Migrate legacy assignments to new `test_assignment_users` format.
3. Update SQLAlchemy models to match new schema.
4. Regenerate Pydantic schemas & API contracts.
5. Run integration tests across FastAPI and Next.js.

## 10. Open Questions / Decisions
- **Credential visibility**: store encrypted temp passwords vs. regenerating on demand.
- **Multi-company admins**: prompt mandates one admin per company; enforce by constraint.
- **Localization assets**: maintain translation JSON files under `public/locales/{lang}`; require content team updates.
- **Camera QA metrics**: re-use existing heuristics or integrate third-party library? (Scope: reuse existing logic, modularize for reuse across test types.)

---

This plan will be refined into concrete tasks for backend migrations, service implementations, and frontend rebuild. Next steps: create Alembic migrations reflecting this schema, update SQLAlchemy models, and scaffold service modules.
