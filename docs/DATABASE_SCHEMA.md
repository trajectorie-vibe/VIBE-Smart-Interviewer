# Database Schema Documentation

## Overview
PostgreSQL database with multi-tenant architecture supporting role-based access control (superadmin, admin, candidate).

## Core Tables

### Users
**Table:** `users`

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | String(36) | UUID primary key | PK, auto-generated |
| `email` | String(255) | User email | Unique, required |
| `password_hash` | String(255) | Hashed password | Required |
| `candidate_name` | String(255) | Full name | Required |
| `candidate_id` | String(100) | Business/client ID | Required |
| `client_name` | String(255) | Company/organization | Required |
| `role` | String(50) | User role | Required, one of: superadmin, admin, candidate |
| `tenant_id` | String(36) | FK to tenants | Optional (null for superadmin) |
| `phone_number` | String(30) | Contact number | Optional |
| `user_code` | String(50) | Human-friendly code (C1, C2...) | Unique, optional |
| `age` | Integer | User age | Optional |
| `gender` | String(50) | Gender | Optional |
| `preferred_language` | String(10) | UI language preference | Default: 'en' |
| `language_code` | String(10) | Language code | Default: 'en' |
| `last_login` | DateTime(TZ) | Last login timestamp | Optional |
| `is_active` | Boolean | Account status | Default: true |
| `created_at` | DateTime(TZ) | Creation timestamp | Auto-generated |
| `updated_at` | DateTime(TZ) | Update timestamp | Auto-updated |

**Constraints:**
- `unique_candidate_per_client`: Unique combination of (candidate_id, client_name)

**Relationships:**
- `tenant` → Tenant (many-to-one)
- `submissions` → Submission[] (one-to-many)
- `test_assignments` → TestAssignment[] (one-to-many)

---

### Submissions
**Table:** `submissions`

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | String(36) | UUID primary key | PK, auto-generated |
| `user_id` | String(36) | FK to users | Required, cascade delete |
| `tenant_id` | String(36) | FK to tenants | Required, cascade delete |
| `test_id` | String(36) | FK to tests | Optional, set null on delete |
| `candidate_name` | String(255) | Candidate full name | Required |
| `candidate_id` | String(100) | Business/client ID | Required |
| `test_type` | String(10) | Test type | Required, one of: JDT, SJT |
| `candidate_language` | String(10) | Language used for responses | Default: 'en' |
| `ui_language` | String(10) | UI language | Default: 'en' |
| `conversation_history` | JSON | Full conversation data | Required |
| `analysis_result` | JSON | AI analysis output | Optional |
| `total_questions` | Integer | Total questions answered | Default: 0 |
| `base_questions` | Integer | Original scenario questions | Default: 0 |
| `follow_up_questions` | Integer | AI follow-up questions | Default: 0 |
| `test_configuration` | JSON | Config snapshot | Optional |
| `status` | String(50) | Submission status | Default: 'submitted', one of: submitted, analyzing, completed, failed |
| `analysis_completed` | Boolean | Analysis complete flag | Default: false |
| `analysis_completed_at` | DateTime(TZ) | Analysis completion time | Optional |
| `created_at` | DateTime(TZ) | Creation timestamp | Auto-generated |
| `updated_at` | DateTime(TZ) | Update timestamp | Auto-updated |

**Key Field Mapping:**
- Backend field `candidate_id` contains the business/client ID (NOT the database user.id)
- Backend field `user_id` is the FK to users table (database ID)
- Frontend should use these exact field names without fallbacks

**Relationships:**
- `user` → User (many-to-one)
- `tenant` → Tenant (many-to-one)
- `test` → Test (many-to-one, optional)
- `media_files` → MediaFile[] (one-to-many)

---

### Tenants
**Table:** `tenants`

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | String(36) | UUID primary key | PK, auto-generated |
| `name` | String(255) | Organization name | Required |
| `domain` | String(255) | Domain name | Optional |
| `logo_url` | Text | Logo URL | Optional |
| `custom_branding` | JSON | Branding config | Optional |
| `max_test_attempts` | Integer | Test attempt limit | Default: 3 |
| `allowed_test_types` | Text | JSON array of types | Default: '["JDT", "SJT"]' |
| `is_active` | Boolean | Tenant status | Default: true |
| `created_at` | DateTime(TZ) | Creation timestamp | Auto-generated |
| `updated_at` | DateTime(TZ) | Update timestamp | Auto-updated |

**Relationships:**
- `users` → User[] (one-to-many)
- `submissions` → Submission[] (one-to-many)
- `configurations` → Configuration[] (one-to-many)
- `competency_dictionaries` → CompetencyDictionary[] (one-to-many)
- `test_templates` → TestTemplate[] (one-to-many)

---

### Test Assignments
**Table:** `test_assignments`

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | String(36) | UUID primary key | PK, auto-generated |
| `user_id` | String(36) | FK to users (candidate) | Required, cascade delete |
| `admin_id` | String(36) | FK to users (admin) | Required, cascade delete |
| `tenant_id` | String(36) | FK to tenants | Required, cascade delete |
| `test_type` | String(10) | Test type | Required, one of: JDT, SJT |
| `test_id` | String(36) | FK to tests | Optional, set null on delete |
| `due_date` | DateTime(TZ) | Assignment deadline | Optional |
| `max_attempts` | Integer | Attempt limit | Default: 3 |
| `status` | String(20) | Assignment status | Default: 'assigned', one of: assigned, started, completed, overdue, cancelled |
| `assigned_at` | DateTime(TZ) | Assignment time | Auto-generated |
| `started_at` | DateTime(TZ) | First attempt start | Optional |
| `completed_at` | DateTime(TZ) | Completion time | Optional |
| `custom_config` | JSON | Test-specific config | Optional |
| `notes` | Text | Admin notes | Optional |
| `created_at` | DateTime(TZ) | Creation timestamp | Auto-generated |
| `updated_at` | DateTime(TZ) | Update timestamp | Auto-updated |

**Constraints:**
- `ux_user_test_assignment`: Unique combination of (user_id, test_type)
- One assignment per test type per user

**Relationships:**
- `user` → User (many-to-one)
- `admin` → User (many-to-one)
- `tenant` → Tenant (many-to-one)
- `test` → Test (many-to-one, optional)

---

### User Assignments
**Table:** `user_assignments`

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | String(36) | UUID primary key | PK, auto-generated |
| `user_id` | String(36) | FK to users (candidate) | Required, cascade delete |
| `admin_id` | String(36) | FK to users (admin) | Required, cascade delete |
| `tenant_id` | String(36) | FK to tenants | Required, cascade delete |
| `assigned_by` | String(36) | FK to users (superadmin) | Required |
| `is_active` | Boolean | Assignment status | Default: true |
| `notes` | Text | Assignment notes | Optional |
| `created_at` | DateTime(TZ) | Creation timestamp | Auto-generated |
| `updated_at` | DateTime(TZ) | Update timestamp | Auto-updated |

**Constraints:**
- `ux_user_admin_assignment`: Unique combination of (user_id, admin_id)

---

## Questions & Tests (New Architecture)

### Questions
**Table:** `questions`

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | String(36) | UUID primary key | PK, auto-generated |
| `question_code` | String(50) | Human-friendly code (Q1, Q2...) | Unique, required |
| `name` | String(255) | Question title | Required |
| `description` | Text | Question description | Required |
| `question_type` | String(10) | Type | Required, one of: SJT, JDT, CASE |
| `competencies` | JSON | Array of competency codes | Required |
| `content` | JSON | Question content (varies by type) | Required |
| `scope` | String(50) | Visibility scope | Default: 'system', one of: system, tenant |
| `tenant_id` | String(36) | FK to tenants | Optional, null for system |
| `created_by` | String(36) | FK to users | Optional |
| `created_at` | DateTime(TZ) | Creation timestamp | Auto-generated |
| `updated_at` | DateTime(TZ) | Update timestamp | Auto-updated |

---

### Tests
**Table:** `tests`

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | String(36) | UUID primary key | PK, auto-generated |
| `test_code` | String(50) | Human-friendly code (T1, T2...) | Unique, required |
| `name` | String(255) | Test title | Required |
| `description` | Text | Test description | Required |
| `test_type` | String(10) | Type | Required, one of: SJT, JDT, CASE |
| `scope` | String(50) | Visibility scope | Default: 'system', one of: system, tenant |
| `tenant_id` | String(36) | FK to tenants | Optional, null for system |
| `created_by` | String(36) | FK to users | Optional |
| `is_active` | Boolean | Test status | Default: true |
| `config` | JSON | Test configuration | Optional |
| `created_at` | DateTime(TZ) | Creation timestamp | Auto-generated |
| `updated_at` | DateTime(TZ) | Update timestamp | Auto-updated |

---

### Test Questions
**Table:** `test_questions`

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | String(36) | UUID primary key | PK, auto-generated |
| `test_id` | String(36) | FK to tests | Required, cascade delete |
| `question_id` | String(36) | FK to questions | Required, cascade delete |
| `sort_order` | Integer | Display order | Default: 0 |
| `settings` | JSON | Per-question overrides | Optional |
| `created_at` | DateTime(TZ) | Creation timestamp | Auto-generated |
| `updated_at` | DateTime(TZ) | Update timestamp | Auto-updated |

---

## Supporting Tables

### Media Files
**Table:** `media_files`

| Field | Type | Description |
|-------|------|-------------|
| `id` | String(36) | UUID primary key |
| `submission_id` | String(36) | FK to submissions (cascade delete) |
| `file_name` | String(255) | Original filename |
| `file_path` | Text | Local/remote path |
| `file_type` | String(50) | Type (video, audio) |
| `mime_type` | String(100) | MIME type |
| `file_size` | BigInt | Size in bytes |
| `question_index` | Integer | Question number |
| `scenario_id` | String(100) | SJT scenario ID |
| `is_follow_up` | Boolean | Follow-up flag |
| `follow_up_sequence` | Integer | Follow-up order |
| `storage_provider` | String(50) | Provider (local, s3, firebase) |
| `storage_url` | Text | Firebase/S3 URL |
| `firebase_path` | Text | Firebase path |
| `transcription_status` | String(50) | Status (pending, processing, completed, failed) |
| `transcription_text` | Text | Transcribed text |
| `created_at` | DateTime(TZ) | Creation timestamp |
| `updated_at` | DateTime(TZ) | Update timestamp |

---

### Competency Dictionary
**Table:** `competency_dictionaries`

| Field | Type | Description |
|-------|------|-------------|
| `id` | String(36) | UUID primary key |
| `tenant_id` | String(36) | FK to tenants |
| `competency_code` | String(100) | Code (e.g., COMM, LEAD) |
| `competency_name` | String(255) | Name |
| `competency_description` | Text | Description |
| `meta_competency` | String(255) | Parent competency |
| `translations` | JSON | Multi-language support |
| `category` | String(100) | Category |
| `industry` | String(100) | Industry |
| `role_category` | String(100) | Role category |
| `is_active` | Boolean | Status |
| `created_at` | DateTime(TZ) | Creation timestamp |
| `updated_at` | DateTime(TZ) | Update timestamp |

**Constraints:**
- `ux_competency_tenant_code`: Unique combination of (tenant_id, competency_code)

---

### Configurations
**Table:** `configurations`

| Field | Type | Description |
|-------|------|-------------|
| `id` | String(36) | UUID primary key |
| `tenant_id` | String(36) | FK to tenants |
| `config_type` | String(50) | Type (jdt, sjt, global) |
| `scope` | String(50) | Scope (system, tenant) |
| `config_data` | JSON | Configuration data |
| `version` | Integer | Version number |
| `is_active` | Boolean | Status |
| `created_by` | String(36) | FK to users |
| `created_at` | DateTime(TZ) | Creation timestamp |
| `updated_at` | DateTime(TZ) | Update timestamp |

---

### Test Templates
**Table:** `test_templates`

| Field | Type | Description |
|-------|------|-------------|
| `id` | String(36) | UUID primary key |
| `tenant_id` | String(36) | FK to tenants |
| `template_name` | String(255) | Template name |
| `template_description` | Text | Description |
| `test_type` | String(10) | Type (JDT, SJT) |
| `template_config` | JSON | Configuration |
| `competency_mappings` | JSON | Competency mappings |
| `usage_count` | Integer | Usage counter |
| `last_used` | DateTime(TZ) | Last usage time |
| `created_by` | String(36) | FK to users |
| `is_active` | Boolean | Status |
| `created_at` | DateTime(TZ) | Creation timestamp |
| `updated_at` | DateTime(TZ) | Update timestamp |

---

### Test Attempts
**Table:** `test_attempts`

| Field | Type | Description |
|-------|------|-------------|
| `id` | String(36) | UUID primary key |
| `user_id` | String(36) | FK to users |
| `test_type` | String(10) | Type (JDT, SJT) |
| `assignment_id` | String(36) | FK to test_assignments |
| `attempt_number` | Integer | Attempt sequence |
| `status` | String(20) | Status (in_progress, completed, cancelled) |
| `started_at` | DateTime(TZ) | Start time |
| `completed_at` | DateTime(TZ) | Completion time |
| `max_questions` | Integer | Total questions |
| `questions_snapshot` | JSON | Questions served |
| `attempt_metadata` | JSON | Additional metadata |
| `created_at` | DateTime(TZ) | Creation timestamp |
| `updated_at` | DateTime(TZ) | Update timestamp |

**Constraints:**
- `ux_user_test_attempt_number`: Unique combination of (user_id, test_type, attempt_number)

---

### Audit Logs
**Table:** `audit_logs`

| Field | Type | Description |
|-------|------|-------------|
| `id` | String(36) | UUID primary key |
| `user_id` | String(36) | FK to users |
| `tenant_id` | String(36) | FK to tenants |
| `action` | String(100) | Action performed |
| `resource_type` | String(100) | Resource type |
| `resource_id` | String(36) | Resource ID |
| `old_values` | JSON | Previous values |
| `new_values` | JSON | New values |
| `ip_address` | String(45) | IP address |
| `user_agent` | Text | User agent |
| `created_at` | DateTime(TZ) | Timestamp |

---

### User Sessions
**Table:** `user_sessions`

| Field | Type | Description |
|-------|------|-------------|
| `id` | String(36) | UUID primary key |
| `user_id` | String(36) | FK to users |
| `session_token` | String(512) | JWT token |
| `refresh_token` | String(512) | Refresh token |
| `ip_address` | String(45) | IP address |
| `user_agent` | Text | User agent |
| `device_info` | JSON | Device metadata |
| `expires_at` | DateTime(TZ) | Expiration time |
| `last_activity` | DateTime(TZ) | Last activity |
| `is_active` | Boolean | Session status |
| `revoked_at` | DateTime(TZ) | Revocation time |
| `revoke_reason` | String(255) | Revocation reason |
| `created_at` | DateTime(TZ) | Creation timestamp |
| `updated_at` | DateTime(TZ) | Update timestamp |

---

### Status Events
**Table:** `status_events`

| Field | Type | Description |
|-------|------|-------------|
| `id` | String(36) | UUID primary key |
| `event_type` | String(100) | Event type |
| `message` | Text | Event message |
| `tenant_id` | String(36) | FK to tenants |
| `actor_user_id` | String(36) | FK to users |
| `payload` | JSON | Event data |
| `created_at` | DateTime(TZ) | Timestamp |

---

## Data Flow Patterns

### Submission Creation Flow
1. Candidate takes test via `/interview` or `/sjt` route
2. Frontend creates submission via `POST /api/v1/submissions` with:
   - `user_id`: From auth context (user.id - database UUID)
   - `candidate_id`: From user.candidate_id (business ID string)
   - `candidate_name`: From user.candidate_name
   - `tenant_id`: From user.tenant_id
   - `test_type`: 'JDT' or 'SJT'
   - `conversation_history`: Full conversation array
3. Backend creates submission record with status='submitted'
4. AI analyzes and updates `analysis_result` field
5. Status changes to 'completed' when analysis done

### Admin Report Access
1. Admin navigates to `/admin/report/:submissionId`
2. Frontend calls `GET /api/v1/submissions/:id`
3. Backend returns single submission if:
   - Superadmin (unrestricted)
   - Admin with matching tenant_id
   - Candidate who owns it (user_id match)
4. Report renders from `analysis_result` JSON field

### Superadmin Filtered List
1. Superadmin navigates to `/superadmin/submissions?candidateId=<user_id>`
2. Frontend calls `GET /api/v1/submissions?user_id=<user_id>`
3. Backend filters submissions WHERE user_id = query param
4. Returns array of matching submissions
5. Frontend displays in table

---

## Field Naming Standards

### Backend (Python/PostgreSQL)
- **Snake case:** `user_id`, `candidate_id`, `created_at`, `test_type`
- **UUIDs as strings:** All IDs are String(36) UUID format
- **Timestamps:** DateTime with timezone
- **JSON fields:** Use PostgreSQL JSON type

### Frontend (TypeScript/React)
- **Camel case:** `userId`, `candidateId`, `createdAt`, `testType`
- **Mapping required:** Convert snake_case to camelCase in API responses
- **Type safety:** Use exact TypeScript interfaces matching backend

### Critical Distinction
- `user.id` (database UUID) ≠ `user.candidate_id` (business ID string)
- `submission.user_id` = FK to users.id (database UUID)
- `submission.candidate_id` = copy of users.candidate_id (business ID)

---

## Multi-Tenancy Rules

### Tenant Scoping
- **Superadmin:** No tenant restriction (tenant_id can be null)
- **Admin:** Scoped to single tenant_id
- **Candidate:** Scoped to single tenant_id

### Data Isolation
- All queries auto-filter by tenant_id except for superadmin
- Submissions, users, assignments all include tenant_id
- Cross-tenant access strictly forbidden

### Placeholder Tenant
- ID: `00000000-0000-0000-0000-000000000001`
- Used for testing/development
- Should be filtered out in production queries

---

## Key Indexes

### Performance Indexes
- `users.email` - Unique index for login
- `users.candidate_id, users.client_name` - Unique constraint
- `submissions.user_id` - Foreign key index
- `submissions.tenant_id` - Tenant scoping
- `test_assignments.user_id, test_assignments.test_type` - Assignment lookup
- `test_attempts.user_id, test_attempts.test_type, test_attempts.status` - Attempt tracking

---

## Migration Notes

### From Legacy to Unified Schema
1. Ensure all existing submissions have correct `user_id` (database UUID)
2. Verify `candidate_id` field contains business ID (not database UUID)
3. Remove any placeholder/test tenant data
4. Update all frontend mapping to use exact field names
5. Remove fallback logic (`s.candidate_id || s.candidateId || s.user_id`)

### Breaking Changes
- Frontend must use exact field names from backend
- No more multiple fallbacks for ID fields
- Strict TypeScript types required
- All UUIDs must be strings, not numbers

---

## Security Considerations

### Password Security
- Passwords hashed using bcrypt
- Never return password_hash in API responses
- Minimum 6 character requirement (should be increased to 8+)

### Token Security
- JWT tokens stored in sessionStorage (consider httpOnly cookies)
- Refresh tokens for long-lived sessions
- Session revocation supported via user_sessions table

### Access Control
- Role-based permission checks on all endpoints
- Tenant isolation enforced at database query level
- Audit logs track all data changes

---

## Future Enhancements

### Recommended Improvements
1. Add database constraints for email format validation
2. Implement soft delete (is_deleted flag) instead of hard delete
3. Add created_by and updated_by audit fields to all tables
4. Implement row-level security policies in PostgreSQL
5. Add composite indexes for common query patterns
6. Implement database connection pooling
7. Add backup and replication strategy
8. Consider partitioning submissions table by created_at date

### Performance Optimizations
1. Cache tenant configurations in Redis
2. Index conversation_history JSON fields for faster search
3. Archive old submissions to separate table
4. Implement read replicas for reporting queries
5. Add materialized views for dashboard aggregations
