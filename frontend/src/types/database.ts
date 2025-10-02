/**
 * Unified TypeScript Types matching PostgreSQL Database Schema
 * 
 * These types represent the EXACT structure returned from the FastAPI backend.
 * Field names use snake_case to match the database schema.
 * 
 * Do NOT add fallback logic or alternative field names.
 * Convert to camelCase in UI components if needed.
 */

// ============================================
// BASE TYPES
// ============================================

export type UUID = string; // String(36) format

export type UserRole = 'superadmin' | 'admin' | 'candidate';

export type TestType = 'JDT' | 'SJT' | 'CASE';

export type SubmissionStatus = 'submitted' | 'analyzing' | 'completed' | 'failed';

export type AssignmentStatus = 'assigned' | 'started' | 'completed' | 'overdue' | 'cancelled';

export type AttemptStatus = 'in_progress' | 'completed' | 'cancelled';

export type FileType = 'video' | 'audio';

export type StorageProvider = 'local' | 's3' | 'firebase';

export type TranscriptionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type ConfigType = 'jdt' | 'sjt' | 'global';

export type Scope = 'system' | 'tenant';

// ============================================
// CORE MODELS
// ============================================

/**
 * User Model
 * Represents all users: superadmin, admin, candidate
 */
export interface User {
  id: UUID;
  email: string;
  candidate_name: string;
  candidate_id: string; // Business/Client ID (NOT database UUID)
  client_name: string;
  role: UserRole;
  tenant_id: UUID | null; // null for superadmin
  phone_number: string | null;
  user_code: string | null; // Human-friendly code like C1, C2
  age: number | null;
  gender: string | null;
  preferred_language: string; // Default: 'en'
  language_code: string; // Default: 'en'
  last_login: string | null; // ISO datetime string
  is_active: boolean;
  created_at: string; // ISO datetime string
  updated_at: string; // ISO datetime string
}

/**
 * Submission Model
 * Represents test submissions and analysis results
 */
export interface Submission {
  id: UUID;
  user_id: UUID; // FK to users.id (database UUID)
  tenant_id: UUID;
  test_id: UUID | null;
  candidate_name: string;
  candidate_id: string; // Copy of users.candidate_id (business ID)
  test_type: TestType;
  candidate_language: string; // Default: 'en'
  ui_language: string; // Default: 'en'
  conversation_history: ConversationMessage[];
  analysis_result: AnalysisResult | null;
  total_questions: number;
  base_questions: number;
  follow_up_questions: number;
  test_configuration: Record<string, any> | null;
  status: SubmissionStatus;
  analysis_completed: boolean;
  analysis_completed_at: string | null; // ISO datetime string
  created_at: string; // ISO datetime string
  updated_at: string; // ISO datetime string
}

/**
 * Tenant Model
 * Organization/Company for multi-tenancy
 */
export interface Tenant {
  id: UUID;
  name: string;
  domain: string | null;
  logo_url: string | null;
  custom_branding: Record<string, any> | null;
  max_test_attempts: number;
  allowed_test_types: string; // JSON string: '["JDT", "SJT"]'
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Test Assignment Model
 * Admin assigns tests to candidates
 */
export interface TestAssignment {
  id: UUID;
  user_id: UUID; // Candidate
  admin_id: UUID; // Admin who assigned
  tenant_id: UUID;
  test_type: TestType;
  test_id: UUID | null; // Optional structured test reference
  due_date: string | null; // ISO datetime string
  max_attempts: number;
  status: AssignmentStatus;
  assigned_at: string; // ISO datetime string
  started_at: string | null;
  completed_at: string | null;
  custom_config: Record<string, any> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * User Assignment Model
 * Superadmin assigns candidates to admins
 */
export interface UserAssignment {
  id: UUID;
  user_id: UUID; // Candidate
  admin_id: UUID; // Admin
  tenant_id: UUID;
  assigned_by: UUID; // Superadmin
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Test Attempt Model
 * Tracks discrete test attempts
 */
export interface TestAttempt {
  id: UUID;
  user_id: UUID;
  test_type: TestType;
  assignment_id: UUID | null;
  attempt_number: number;
  status: AttemptStatus;
  started_at: string; // ISO datetime string
  completed_at: string | null;
  max_questions: number | null;
  questions_snapshot: any[] | null; // Immutable question list
  attempt_metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

/**
 * Media File Model
 * Video/Audio file metadata
 */
export interface MediaFile {
  id: UUID;
  submission_id: UUID;
  file_name: string;
  file_path: string;
  file_type: FileType;
  mime_type: string | null;
  file_size: number | null; // BigInt
  question_index: number;
  scenario_id: string | null;
  is_follow_up: boolean;
  follow_up_sequence: number;
  storage_provider: StorageProvider;
  storage_url: string | null;
  firebase_path: string | null;
  transcription_status: TranscriptionStatus;
  transcription_text: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Configuration Model
 * Test and system configuration
 */
export interface Configuration {
  id: UUID;
  tenant_id: UUID;
  config_type: ConfigType;
  scope: Scope;
  config_data: Record<string, any>;
  version: number;
  is_active: boolean;
  created_by: UUID | null;
  created_at: string;
  updated_at: string;
}

/**
 * Competency Dictionary Model
 * Competency definitions
 */
export interface CompetencyDictionary {
  id: UUID;
  tenant_id: UUID;
  competency_code: string;
  competency_name: string;
  competency_description: string | null;
  meta_competency: string | null;
  translations: Record<string, any> | null;
  category: string | null;
  industry: string | null;
  role_category: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Test Template Model
 * Predefined test configurations
 */
export interface TestTemplate {
  id: UUID;
  tenant_id: UUID;
  template_name: string;
  template_description: string | null;
  test_type: TestType;
  template_config: Record<string, any>;
  competency_mappings: Record<string, any> | null;
  usage_count: number;
  last_used: string | null;
  created_by: UUID | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * User Session Model
 * JWT session management
 */
export interface UserSession {
  id: UUID;
  user_id: UUID;
  session_token: string;
  refresh_token: string | null;
  ip_address: string | null;
  user_agent: string | null;
  device_info: Record<string, any> | null;
  expires_at: string; // ISO datetime string
  last_activity: string;
  is_active: boolean;
  revoked_at: string | null;
  revoke_reason: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Audit Log Model
 * System audit trail
 */
export interface AuditLog {
  id: UUID;
  user_id: UUID | null;
  tenant_id: UUID | null;
  action: string;
  resource_type: string;
  resource_id: UUID | null;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/**
 * Status Event Model
 * Event stream for status panel
 */
export interface StatusEvent {
  id: UUID;
  event_type: string;
  message: string;
  tenant_id: UUID | null;
  actor_user_id: UUID | null;
  payload: Record<string, any> | null;
  created_at: string;
}

// ============================================
// QUESTION BANK & STRUCTURED TESTS
// ============================================

/**
 * Question Model
 * Question bank entries
 */
export interface Question {
  id: UUID;
  question_code: string; // Q1, Q2, etc.
  name: string;
  description: string;
  question_type: TestType;
  competencies: string[]; // Array of competency codes
  content: Record<string, any>; // Varies by question type
  scope: Scope;
  tenant_id: UUID | null;
  created_by: UUID | null;
  created_at: string;
  updated_at: string;
}

/**
 * Test Model
 * Structured test composed of questions
 */
export interface Test {
  id: UUID;
  test_code: string; // T1, T2, etc.
  name: string;
  description: string;
  test_type: TestType;
  scope: Scope;
  tenant_id: UUID | null;
  created_by: UUID | null;
  is_active: boolean;
  config: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

/**
 * Test Question Mapping
 * Links tests to questions
 */
export interface TestQuestion {
  id: UUID;
  test_id: UUID;
  question_id: UUID;
  sort_order: number;
  settings: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

/**
 * Test Competency Override
 * Per-test competency description overrides
 */
export interface TestCompetencyOverride {
  id: UUID;
  test_id: UUID;
  competency_code: string;
  competency_name: string;
  override_description: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// NESTED TYPES (JSON FIELDS)
// ============================================

/**
 * Conversation Message
 * Individual message in conversation_history
 */
export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: string;
  question_index?: number;
  scenario_id?: string;
  is_follow_up?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Analysis Result
 * AI analysis output structure
 */
export interface AnalysisResult {
  scoresSummary?: ScoresSummary;
  competencyQualitativeSummary?: CompetencySummary[];
  questionwiseDetails?: QuestionDetail[];
  strengths?: string;
  weaknesses?: string;
  summary?: string;
  competencyAnalysis?: CompetencyAnalysis[];
  overallScore?: number;
  recommendations?: string[];
}

/**
 * Scores Summary
 * Overall score breakdown
 */
export interface ScoresSummary {
  overallScore?: number;
  competencyScores?: Record<string, number>;
  [key: string]: any;
}

/**
 * Competency Summary
 * Qualitative competency analysis
 */
export interface CompetencySummary {
  competencyCode: string;
  competencyName: string;
  description: string;
  score?: number;
  evidence?: string[];
  strengths?: string[];
  weaknesses?: string[];
}

/**
 * Question Detail
 * Individual question analysis
 */
export interface QuestionDetail {
  questionIndex: number;
  scenarioId?: string;
  questionText?: string;
  userResponse?: string;
  analysis?: string;
  competencies?: string[];
  scores?: Record<string, number>;
  isFollowUp?: boolean;
}

/**
 * Competency Analysis
 * Detailed competency evaluation
 */
export interface CompetencyAnalysis {
  code: string;
  name: string;
  score: number;
  level?: string;
  description?: string;
  evidence?: string[];
  developmentAreas?: string[];
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

/**
 * API Response Wrapper
 * Standard API response format
 */
export interface ApiResponse<T> {
  data: T;
  message?: string;
  error?: string;
  status?: number;
}

/**
 * Paginated Response
 * For list endpoints with pagination
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

/**
 * Login Request
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Login Response
 */
export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

/**
 * User Create Request
 */
export interface UserCreateRequest {
  email: string;
  password: string;
  candidate_name: string;
  candidate_id: string;
  client_name: string;
  role: UserRole;
  tenant_id?: UUID;
  preferred_language?: string;
  language_code?: string;
  phone_number?: string;
  age?: number;
  gender?: string;
}

/**
 * User Update Request
 */
export interface UserUpdateRequest {
  email?: string;
  candidate_name?: string;
  candidate_id?: string;
  client_name?: string;
  role?: UserRole;
  tenant_id?: UUID;
  preferred_language?: string;
  language_code?: string;
  is_active?: boolean;
  age?: number;
  gender?: string;
}

/**
 * Submission Create Request
 */
export interface SubmissionCreateRequest {
  candidate_name: string;
  candidate_id: string;
  test_type: TestType;
  candidate_language?: string;
  ui_language?: string;
  conversation_history: ConversationMessage[];
}

/**
 * Submission Update Request
 */
export interface SubmissionUpdateRequest {
  analysis_result?: AnalysisResult;
  status?: SubmissionStatus;
  analysis_completed?: boolean;
}

/**
 * Bulk User Assignment Request
 */
export interface BulkUserAssignmentRequest {
  user_ids: UUID[];
  admin_id: UUID;
  notes?: string;
}

/**
 * Bulk Test Assignment Request
 */
export interface BulkTestAssignmentRequest {
  user_ids: string[];
  test_types: string[];
  test_id?: string;
  due_date?: string;
  max_attempts?: number;
  notes?: string;
  sjt_scenario_ids?: (string | number)[];
}

/**
 * Test Assignment Create Request
 */
export interface TestAssignmentCreateRequest {
  user_id: UUID;
  test_type: TestType;
  test_id?: UUID;
  due_date?: string;
  max_attempts?: number;
  custom_config?: Record<string, any>;
  notes?: string;
}

/**
 * Start Test Attempt Request
 */
export interface StartAttemptRequest {
  test_type: TestType;
  role_category?: string; // For JDT
}

/**
 * Start Test Attempt Response
 */
export interface StartAttemptResponse {
  attempt: TestAttempt;
  questions: any[];
  can_start: boolean;
  remaining_attempts: number;
}

/**
 * Test Availability Response
 */
export interface TestAvailabilityResponse {
  test_type: TestType;
  assigned: boolean;
  configured: boolean;
  attempts_used: number;
  max_attempts: number;
  can_start: boolean;
  assignment_status: AssignmentStatus | null;
  assigned_question_count: number | null;
}

// ============================================
// UTILITY TYPES
// ============================================

/**
 * Field Mapping Helper
 * Use this to convert snake_case to camelCase in UI
 */
export type CamelCase<S extends string> = S extends `${infer P1}_${infer P2}${infer P3}`
  ? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
  : Lowercase<S>;

/**
 * Partial Update Type
 * For PATCH requests
 */
export type PartialUpdate<T> = Partial<T> & { id: UUID };

/**
 * List Query Params
 * Common query parameters for list endpoints
 */
export interface ListQueryParams {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  search?: string;
  filter?: Record<string, any>;
}

/**
 * Submission Query Params
 * For GET /api/v1/submissions
 */
export interface SubmissionQueryParams {
  user_id?: UUID;
  tenant_id?: UUID;
  test_type?: TestType;
  status?: SubmissionStatus;
  page?: number;
  limit?: number;
}

/**
 * User Query Params
 * For GET /api/v1/users
 */
export interface UserQueryParams {
  role?: UserRole;
  tenant_id?: UUID;
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

// ============================================
// TYPE GUARDS
// ============================================

export function isUser(obj: any): obj is User {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'string' &&
    typeof obj.email === 'string' &&
    typeof obj.role === 'string' &&
    ['superadmin', 'admin', 'candidate'].includes(obj.role)
  );
}

export function isSubmission(obj: any): obj is Submission {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'string' &&
    typeof obj.user_id === 'string' &&
    typeof obj.test_type === 'string' &&
    ['JDT', 'SJT', 'CASE'].includes(obj.test_type)
  );
}

export function isSuperAdmin(user: User | null): boolean {
  return user?.role === 'superadmin';
}

export function isAdmin(user: User | null): boolean {
  return user?.role === 'admin';
}

export function isCandidate(user: User | null): boolean {
  return user?.role === 'candidate';
}

// ============================================
// EXPORT ALL
// ============================================

export default {
  // Types are exported individually above
  // This default export is for convenience
};
