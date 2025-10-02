/**
 * FastAPI Service Layer
 * Replaces Firebase with FastAPI backend communication
 */

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface User {
  id: string;
  email: string;
  candidate_name: string;
  candidate_id: string;
  client_name: string;
  role: 'superadmin' | 'admin' | 'candidate';
  language_preference: string;
  tenant_id: string;
  is_active: boolean;
  last_login?: string;
  created_at: string;
  updated_at: string;
  age?: number | null;
  gender?: string | null;
}

export interface Tenant {
  id: string;
  name: string;
  logo_url?: string;
  custom_branding?: any;
  max_test_attempts: number;
  allowed_test_types: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Bulk user generation (superadmin)
export interface GeneratedCredential {
  user_id: string;
  email: string;
  password: string;
}
export interface BulkUserGenerateRequest {
  count: number;
  email_prefix: string;
  email_domain: string;
  name_prefix?: string | null;
  start_from?: number;
  use_fixed_password?: boolean;
  fixed_password?: string | null;
}
export interface BulkUserGenerateResponse {
  created: number;
  credentials: GeneratedCredential[];
}

export interface AssignmentSummary {
  id: string;
  code: string;
  name: string;
  test_id: string;
  test_name?: string | null;
  delivery_mode: string;
  language_code: string;
  status?: string;
  progress_percent?: number | null;
  open_at?: string | null;
  deadline_at?: string | null;
  company_id?: string | null;
  company_name?: string | null;
  metadata?: Record<string, any> | null;
  total_time_limit_minutes?: number | null;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

class FastAPIService {
  private baseURL: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor() {
    this.baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
    
    // Load tokens from sessionStorage (per-tab). Migrate from localStorage if found.
    if (typeof window !== 'undefined') {
      const ss = window.sessionStorage;
      const ls = window.localStorage;

      // Prefer sessionStorage
      this.accessToken = ss.getItem('access_token');
      this.refreshToken = ss.getItem('refresh_token');

      // Migrate from localStorage if sessionStorage empty but localStorage has tokens
      const lsAccess = ls.getItem('access_token');
      const lsRefresh = ls.getItem('refresh_token');
      if (!this.accessToken && lsAccess) {
        this.accessToken = lsAccess;
        ss.setItem('access_token', lsAccess);
      }
      if (!this.refreshToken && lsRefresh) {
        this.refreshToken = lsRefresh;
        ss.setItem('refresh_token', lsRefresh);
      }

      // Clear localStorage tokens to prevent cross-tab auth leakage
      if (lsAccess || lsRefresh) {
        ls.removeItem('access_token');
        ls.removeItem('refresh_token');
      }
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;
    // Diagnostic logging for tracing API calls
    if (typeof window !== 'undefined') {
      console.log(`[apiService] → ${options.method || 'GET'} ${url}`);
    }
    
    const method = (options.method || 'GET').toUpperCase();
    const hasBody = typeof (options as any).body !== 'undefined' && (options as any).body !== null;
    const baseHeaders: Record<string, string> = (options.headers as Record<string,string> || {});
    const headers: Record<string, string> = { ...baseHeaders };
    // Only set Content-Type for JSON payloads. If body is FormData/Blob, let the browser set it.
    if (hasBody && !headers['Content-Type']) {
      const body: any = (options as any).body;
      const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
      const isBlob = typeof Blob !== 'undefined' && body instanceof Blob;
      if (!isFormData && !isBlob) {
        headers['Content-Type'] = 'application/json';
      }
    }

    // Add authorization header if token exists
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });
      if (typeof window !== 'undefined') {
        console.log(`[apiService] ← ${response.status} ${url}`);
      }

      if (response.status === 401 && this.refreshToken) {
        // Try to refresh token
        const refreshResult = await this.refreshAccessToken();
        if (refreshResult.data) {
          // Retry original request with new token
          headers['Authorization'] = `Bearer ${this.accessToken}`;
          const retryResponse = await fetch(url, {
            ...options,
            headers,
          });
          
          if (!retryResponse.ok) {
            throw new Error(`HTTP error! status: ${retryResponse.status}`);
          }
          
          const data = await retryResponse.json();
          return { data };
        } else {
          // Refresh failed, redirect to login
          this.logout();
          // Emit a global error toast on the client
          if (typeof window !== 'undefined') {
            const detail = { status: 401, message: 'Session expired. Please log in again.', endpoint };
            window.dispatchEvent(new CustomEvent('global-api-error', { detail }));
          }
          throw new Error('Session expired');
        }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        if (typeof window !== 'undefined') {
          console.error(`[apiService] ✖ ${response.status} ${url}`, errorData);
        }
        // Derive a user-friendly error message and emit a global error event for toasts
        let message: string = (errorData && (errorData.detail || errorData.error || errorData.message)) || 'Request failed';
        // Normalize FastAPI validation error format
        if (Array.isArray(errorData?.detail)) {
          const first = errorData.detail[0];
          if (first?.msg) message = first.msg;
        }
        // Special-case duplicates
        if (response.status === 409) {
          const text = JSON.stringify(errorData).toLowerCase();
          if (text.includes('email')) message = 'A user with this email already exists.';
          else if (text.includes('candidate_id')) message = 'This candidate ID is already in use.';
          else message = 'Duplicate resource. It already exists.';
        }
        if (typeof window !== 'undefined') {
          const detail = { status: response.status, message, endpoint };
          window.dispatchEvent(new CustomEvent('global-api-error', { detail }));
        }
        return { error: message };
      }

      const data = await response.json();
      return { data };
    } catch (error) {
      console.error(`[apiService] Network/Fetch failed ${url}:`, error);
      const message = error instanceof Error ? error.message : 'Network error';
      if (typeof window !== 'undefined') {
        const detail = { status: 0, message, endpoint };
        window.dispatchEvent(new CustomEvent('global-api-error', { detail }));
      }
      return { error: message };
    }
  }

  // SERVER-ONLY: Set and clear access token for server-side routes (no window/sessionStorage)
  // Use these in Next.js API routes to forward the user's Authorization header.
  public setAccessTokenForServer(token: string) {
    this.accessToken = token;
  }
  public clearAccessTokenForServer() {
    this.accessToken = null;
  }

  // Authentication methods
  async login(credentials: LoginCredentials): Promise<ApiResponse<AuthTokens & { user: User }>> {
    const result = await this.request<AuthTokens & { user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password
      }),
    });

    if (result.data) {
      this.setTokens(result.data.access_token, result.data.refresh_token);
    }

    return result;
  }

  async refreshAccessToken(): Promise<ApiResponse<AuthTokens>> {
    if (!this.refreshToken) {
      return { error: 'No refresh token available' };
    }

    const result = await this.request<AuthTokens>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: this.refreshToken }),
    });

    if (result.data) {
      this.setTokens(result.data.access_token, result.data.refresh_token);
    }

    return result;
  }

  async getCurrentUser(): Promise<ApiResponse<User>> {
    return this.request<User>('/auth/me');
  }

  logout(): void {
    this.accessToken = null;
    this.refreshToken = null;
    
    if (typeof window !== 'undefined') {
      // Clear from both storages defensively
      sessionStorage.removeItem('access_token');
      sessionStorage.removeItem('refresh_token');
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    }
  }

  private setTokens(accessToken: string, refreshToken: string): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    
    if (typeof window !== 'undefined') {
      // Store in sessionStorage for per-tab isolation
      sessionStorage.setItem('access_token', accessToken);
      sessionStorage.setItem('refresh_token', refreshToken);
      // Ensure localStorage copies are removed
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    }
  }

  // User management
  async getUsers(params?: {
    tenant_id?: string;
    role?: string;
    is_active?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<{ users: User[]; total: number; page: number; limit: number }>> {
    const queryString = params ? '?' + new URLSearchParams(
      Object.entries(params).reduce((acc, [key, value]) => {
        if (value !== undefined) {
          acc[key] = String(value);
        }
        return acc;
      }, {} as Record<string, string>)
    ).toString() : '';
    // Backend returns a plain list at GET /users. Normalize to { users, total, page, limit }
  const res = await this.request<User[] | { users: User[]; total: number; page: number; limit: number }>(`/api/v1/users${queryString}`);
    if (res.data) {
      if (Array.isArray(res.data)) {
        return { data: { users: res.data, total: res.data.length, page: 1, limit: res.data.length } };
      }
      return { data: res.data as { users: User[]; total: number; page: number; limit: number } };
    }
    return { error: res.error };
  }

  async createUser(userData: Partial<User> & { password?: string }): Promise<ApiResponse<User>> {
    return this.request<User>('/api/v1/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async updateUser(userId: string, userData: Partial<User>): Promise<ApiResponse<User>> {
    return this.request<User>(`/api/v1/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  }

  async deleteUser(userId: string): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(`/api/v1/users/${userId}`, {
      method: 'DELETE',
    });
  }

  async importUsersCSV(file: File, options?: { tenant_id?: string }): Promise<ApiResponse<{ created: number; skipped: number }>> {
    const form = new FormData();
    form.append('file', file);
    const searchParams = new URLSearchParams();
    if (options?.tenant_id) searchParams.set('tenant_id', options.tenant_id);
    const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request<{ created: number; skipped: number }>(`/api/v1/users/import-csv${suffix}`, {
      method: 'POST',
      body: form,
    } as any);
  }

  // Tenant management
  async getTenants(params?: {
    is_active?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<{ tenants: Tenant[]; total: number; page: number; limit: number }>> {
    const queryString = params ? '?' + new URLSearchParams(
      Object.entries(params).reduce((acc, [key, value]) => {
        if (value !== undefined) {
          acc[key] = String(value);
        }
        return acc;
      }, {} as Record<string, string>)
    ).toString() : '';
    // Tenants API is under /api/v1 and returns a plain list. Normalize to { tenants, total, page, limit }
    const res = await this.request<Tenant[] | { tenants: Tenant[]; total: number; page: number; limit: number }>(`/api/v1/tenants${queryString}`);
    if (res.data) {
      const normalizeTenant = (t: any): Tenant => ({
        ...t,
        allowed_test_types: Array.isArray(t.allowed_test_types)
          ? t.allowed_test_types
          : (typeof t.allowed_test_types === 'string' ? (()=>{ try { return JSON.parse(t.allowed_test_types); } catch { return ['JDT','SJT']; } })() : ['JDT','SJT'])
      });
      if (Array.isArray(res.data)) {
        const tenants = (res.data as any[]).map(normalizeTenant) as Tenant[];
        return { data: { tenants, total: tenants.length, page: 1, limit: tenants.length } };
      }
      const payload = res.data as { tenants: Tenant[]; total: number; page: number; limit: number };
      payload.tenants = payload.tenants.map(normalizeTenant);
      return { data: payload };
    }
    return { error: res.error };
  }

  async createTenant(tenantData: Partial<Tenant>): Promise<ApiResponse<Tenant>> {
    return this.request<Tenant>('/api/v1/tenants', {
      method: 'POST',
      body: JSON.stringify(tenantData),
    });
  }

  async getTenant(tenantId: string): Promise<ApiResponse<Tenant>> {
    return this.request<Tenant>(`/api/v1/tenants/${tenantId}`);
  }

  async updateTenant(tenantId: string, tenantData: Partial<Tenant>): Promise<ApiResponse<Tenant>> {
    return this.request<Tenant>(`/api/v1/tenants/${tenantId}`, {
      method: 'PUT',
      body: JSON.stringify(tenantData),
    });
  }

  async deleteTenant(tenantId: string): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(`/api/v1/tenants/${tenantId}`, {
      method: 'DELETE',
    });
  }

  // Bulk user generation for a tenant (superadmin only)
  async generateTenantUsers(
    tenantId: string,
    payload: BulkUserGenerateRequest
  ): Promise<ApiResponse<BulkUserGenerateResponse>> {
    return this.request<BulkUserGenerateResponse>(`/api/v1/tenants/${tenantId}/users/generate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // User lookup methods
  async getUserByEmail(email: string): Promise<ApiResponse<User>> {
    return this.request<User>(`/api/v1/users/by-email/${encodeURIComponent(email)}`);
  }

  // Submission management
  async getSubmissions(params?: {
    tenant_id?: string;
    user_id?: string;
    test_type?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<any[]>> {
    const queryString = params ? '?' + new URLSearchParams(
      Object.entries(params).reduce((acc, [key, value]) => {
        if (value !== undefined) {
          acc[key] = String(value);
        }
        return acc;
      }, {} as Record<string, string>)
    ).toString() : '';
    console.log('[ApiService getSubmissions] Params:', params, 'Query string:', queryString);
    // Submissions API is under /api/v1
    const url = `/api/v1/submissions${queryString}`;
    console.log('[ApiService getSubmissions] Calling URL:', url);
    const response = await this.request<any[]>(url);
    console.log('[ApiService getSubmissions] Response:', { count: response.data?.length, data: response.data });
    return response;
  }

  async getSubmission(submissionId: string): Promise<ApiResponse<any>> {
    return this.request<any>(`/api/v1/submissions/${submissionId}`);
  }

  async createSubmission(submissionData: any): Promise<ApiResponse<{ id: string }>> {
    return this.request<{ id: string }>('/api/v1/submissions', {
      method: 'POST',
      body: JSON.stringify(submissionData),
    });
  }

  async updateSubmission(submissionId: string, updates: any): Promise<ApiResponse<any>> {
    return this.request<any>(`/api/v1/submissions/${submissionId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteSubmission(submissionId: string): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(`/api/v1/submissions/${submissionId}`, {
      method: 'DELETE',
    });
  }

  // Media listing for a submission
  async listSubmissionMedia(submissionId: string): Promise<ApiResponse<any[]>> {
    return this.request<any[]>(`/api/v1/submissions/${submissionId}/media`);
  }

  // Configuration management
  async getConfiguration(type: string): Promise<ApiResponse<any>> {
    // Use explicit type route to avoid UUID/id route collision
    return this.request<any>(`/api/v1/configurations/type/${type}`);
  }

  // Public (unauthenticated) global settings fetch
  async getPublicGlobalSettings(): Promise<ApiResponse<any>> {
    return this.request<any>(`/api/v1/configurations/public/global`);
  }

  async getConfigurationForTenant(type: string, tenantId: string): Promise<ApiResponse<any>> {
    // Superadmin can fetch config for a specific tenant by passing tenant_id
    const qs = new URLSearchParams({ tenant_id: tenantId }).toString();
    return this.request<any>(`/api/v1/configurations/type/${type}?${qs}`);
  }

  async saveConfiguration(type: string, configData: any): Promise<ApiResponse<any>> {
    // Backend exposes dedicated endpoints /configurations/{type} for POST (sjt, jdt, global)
    return this.request<any>(`/api/v1/configurations/${type}`, {
      method: 'POST',
      body: JSON.stringify(configData),
    });
  }

  // Tenant users
  async listTenantUsers(tenantId: string, params?: { skip?: number; limit?: number; role?: string }): Promise<ApiResponse<User[]>> {
    const query = params ? '?' + new URLSearchParams(
      Object.entries(params).reduce((acc, [k, v]) => { if (v !== undefined && v !== null) acc[k] = String(v); return acc; }, {} as Record<string,string>)
    ).toString() : '';
    return this.request<User[]>(`/api/v1/tenants/${tenantId}/users${query}`);
  }

  // Assignments
  async getTestAssignments(params?: { user_id?: string; test_type?: string; status?: string }): Promise<ApiResponse<any[]>> {
    const query = params ? '?' + new URLSearchParams(
      Object.entries(params).reduce((acc, [k, v]) => { if (v !== undefined && v !== null) acc[k] = String(v); return acc; }, {} as Record<string,string>)
    ).toString() : '';
    return this.request<any[]>(`/api/v1/assignments/tests${query}`);
  }

  async getMyAssignments(): Promise<ApiResponse<AssignmentSummary[]>> {
    return this.request<AssignmentSummary[]>('/api/v1/assignments/my-tests');
  }

  async startMyAssignment(assignmentId: string): Promise<ApiResponse<AssignmentSummary>> {
    return this.request<AssignmentSummary>(`/api/v1/assignments/my-tests/${assignmentId}/start`, {
      method: 'POST',
    });
  }

  async getAssignmentTimeline(assignmentId: string): Promise<ApiResponse<any>> {
    return this.request<any>(`/api/v1/assignments/${assignmentId}/timeline`);
  }

  async bulkAssignTests(payload: {
    user_ids: string[];
    test_id: string;
    // Optional legacy fields are accepted but ignored by backend
    due_date?: string;
    max_attempts?: number;
    notes?: string;
    // New delivery/config fields
    company_id?: string;
    name?: string;
    delivery_mode?: 'video'|'audio'|'text';
    total_time_limit_minutes?: number;
    per_question_time_seconds?: number;
    follow_up_count?: number;
    follow_up_penalty_percent?: number;
    prep_time_seconds?: number;
    answer_time_seconds?: number;
    re_record_limit?: number;
    camera_check_enabled?: boolean;
  }): Promise<ApiResponse<any[]>> {
    return this.request<any[]>(`/api/v1/assignments/tests/bulk`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateTestAssignment(assignmentId: string, updates: any): Promise<ApiResponse<any>> {
    return this.request<any>(`/api/v1/assignments/tests/${assignmentId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteTestAssignment(assignmentId: string): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(`/api/v1/assignments/tests/${assignmentId}`, {
      method: 'DELETE',
    });
  }

  // Configurations
  async getConfigurations(params?: { config_type?: string; tenant_id?: string }): Promise<ApiResponse<any[]>> {
    const query = params ? '?' + new URLSearchParams(
      Object.entries(params).reduce((acc, [k, v]) => { if (v !== undefined && v !== null) acc[k] = String(v); return acc; }, {} as Record<string,string>)
    ).toString() : '';
    return this.request<any[]>(`/api/v1/configurations${query}`);
  }

  // Test attempts
  async getTestAttempts(params?: { user_id?: string; test_type?: string }): Promise<ApiResponse<any[]>> {
    const query = params ? '?' + new URLSearchParams(
      Object.entries(params).reduce((acc, [k, v]) => { if (v !== undefined && v !== null) acc[k] = String(v); return acc; }, {} as Record<string,string>)
    ).toString() : '';
    return this.request<any[]>(`/api/v1/test-attempts${query}`);
  }

  async createTestAttempt(data: { user_id: string; test_type: string; assignment_id: string; status: string }): Promise<ApiResponse<any>> {
    return this.request<any>('/api/v1/test-attempts', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateTestAttempt(attemptId: string, data: { status?: string; [key: string]: any }): Promise<ApiResponse<any>> {
    return this.request<any>(`/api/v1/test-attempts/${attemptId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }



  async importTestAssignmentsCSV(file: File, options?: { test_id?: string; test_type?: string; tenant_id?: string }): Promise<ApiResponse<any[]>> {
    const form = new FormData();
    form.append('file', file);
    const params = new URLSearchParams();
    if (options?.test_id) params.set('test_id', options.test_id);
    if (!options?.test_id && options?.test_type) params.set('test_type', options.test_type);
    if (options?.tenant_id) params.set('tenant_id', options.tenant_id);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<any[]>(`/api/v1/assignments/tests/import-csv${qs}`, {
      method: 'POST',
      body: form,
      // Intentionally omit Content-Type so browser sets multipart boundary
    } as any);
  }

  async exportTestAssignmentsCSV(params?: { user_id?: string; test_type?: string; status?: string }): Promise<ApiResponse<{ csv: string; count: number }>> {
    const query = params ? '?' + new URLSearchParams(
      Object.entries(params).reduce((acc, [k, v]) => { if (v !== undefined && v !== null) acc[k] = String(v); return acc; }, {} as Record<string,string>)
    ).toString() : '';
    return this.request<{ csv: string; count: number }>(`/api/v1/assignments/tests/export${query}`);
  }

  // Structured Tests (superadmin-focused)
  async listStructuredTests(params?: { search?: string; test_type?: string }): Promise<ApiResponse<any[]>> {
    const query = params ? '?' + new URLSearchParams(
      Object.entries(params).reduce((acc, [k, v]) => { if (v !== undefined && v !== null) acc[k] = String(v); return acc; }, {} as Record<string,string>)
    ).toString() : '';
    return this.request<any[]>(`/api/v1/tests-structured${query}`);
  }

  // Fetch a single structured test by ID
  async getStructuredTest(test_id: string): Promise<ApiResponse<any>> {
    return this.request<any>(`/api/v1/tests-structured/${encodeURIComponent(test_id)}`);
  }

  async getStructuredTestQuestions(test_id: string): Promise<ApiResponse<any[]>> {
    return this.request<any[]>(`/api/v1/tests-structured/${encodeURIComponent(test_id)}/questions`);
  }

  async createStructuredTest(payload: { name: string; description: string; test_type: 'SJT'|'JDT'|'CASE'; scope?: 'system'|'tenant'; tenant_id?: string | null; config?: any }): Promise<ApiResponse<any>> {
    return this.request<any>(`/api/v1/tests-structured`, { method: 'POST', body: JSON.stringify(payload) });
  }

  async addQuestionsToTest(test_id: string, question_ids: string[]): Promise<ApiResponse<any[]>> {
    return this.request<any[]>(`/api/v1/tests-structured/${test_id}/questions`, { method: 'POST', body: JSON.stringify({ question_ids }) });
  }

  async setTestCompetencyOverrides(test_id: string, overrides: Array<{ competency_code: string; competency_name: string; override_description: string }>): Promise<ApiResponse<any>> {
    return this.request<any>(`/api/v1/tests-structured/${test_id}/competencies`, { method: 'PUT', body: JSON.stringify({ overrides }) });
  }

  async exportStructuredTestsCSV(params?: { test_type?: string }): Promise<ApiResponse<{ csv: string; count: number }>> {
    const query = params ? '?' + new URLSearchParams(
      Object.entries(params).reduce((acc, [k, v]) => { if (v !== undefined && v !== null) acc[k] = String(v); return acc; }, {} as Record<string,string>)
    ).toString() : '';
    return this.request<{ csv: string; count: number }>(`/api/v1/tests-structured/export${query}`);
  }

  async updateStructuredTest(test_id: string, updates: { name?: string; description?: string; is_active?: boolean; config?: any }): Promise<ApiResponse<any>> {
    return this.request<any>(`/api/v1/tests-structured/${test_id}`, { method: 'PUT', body: JSON.stringify(updates) });
  }

  async removeQuestionFromTest(test_id: string, question_id: string): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(`/api/v1/tests-structured/${test_id}/questions/${question_id}`, { method: 'DELETE' });
  }

  async reorderTestQuestions(test_id: string, question_ids: string[]): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(`/api/v1/tests-structured/${test_id}/questions/reorder`, { method: 'PUT', body: JSON.stringify({ question_ids }) });
  }

  // Platform health
  async getHealth(): Promise<ApiResponse<{ status: string; timestamp: string }>> {
    return this.request<{ status: string; timestamp: string }>('/health');
  }

  // Statistics
  async getOverviewStats(): Promise<ApiResponse<any>> {
    return this.request<any>('/api/v1/statistics/overview');
  }

  // Competencies
  async listCompetencies(params?: { include_inactive?: boolean; tenant_id?: string }): Promise<ApiResponse<any[]>> {
    const query = params ? '?' + new URLSearchParams(Object.entries(params).reduce((a,[k,v])=>{ if(v!==undefined) a[k]=String(v); return a; }, {} as Record<string,string>)).toString() : '';
    return this.request<any[]>(`/api/v1/competencies${query}`);
  }
  async createCompetency(payload: any): Promise<ApiResponse<any>> {
    return this.request<any>(`/api/v1/competencies`, { method: 'POST', body: JSON.stringify(payload) });
  }
  async getCompetency(code: string): Promise<ApiResponse<any>> {
    return this.request<any>(`/api/v1/competencies/${encodeURIComponent(code)}`);
  }
  async updateCompetency(code: string, payload: any): Promise<ApiResponse<any>> {
    return this.request<any>(`/api/v1/competencies/${encodeURIComponent(code)}`, { method: 'PUT', body: JSON.stringify(payload) });
    }
  async deleteCompetency(code: string): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(`/api/v1/competencies/${encodeURIComponent(code)}`, { method: 'DELETE' });
  }

  // Check if authenticated
  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  // Question Bank
  async listQuestions(params?: { qtype?: 'SJT'|'JDT'|'CASE'; search?: string; competencies?: string[] }): Promise<ApiResponse<any[]>> {
    let qs = '';
    if (params) {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        if (Array.isArray(v)) { v.forEach(val => sp.append(k, String(val))); }
        else sp.set(k, String(v));
      }
      const s = sp.toString();
      qs = s ? `?${s}` : '';
    }
    return this.request<any[]>(`/api/v1/question-bank${qs}`);
  }

  async createQuestion(payload: { name: string; description: string; question_type: 'SJT'|'JDT'|'CASE'; competencies: string[]; content: any; scope?: 'system'|'tenant'; tenant_id?: string | null }): Promise<ApiResponse<any>> {
    const body = { ...payload, scope: payload.scope || 'system' };
    return this.request<any>(`/api/v1/question-bank`, { method: 'POST', body: JSON.stringify(body) });
  }

  async updateQuestion(question_id: string, payload: Partial<{ name: string; description: string; question_type: 'SJT'|'JDT'|'CASE'; competencies: string[]; content: any }>): Promise<ApiResponse<any>> {
    return this.request<any>(`/api/v1/question-bank/${question_id}`, { method: 'PUT', body: JSON.stringify(payload) });
  }

  async deleteQuestion(question_id: string): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(`/api/v1/question-bank/${question_id}`, { method: 'DELETE' });
  }

  async importQuestionsCSV(file: File, options?: { scope?: 'system'|'tenant'; tenant_id?: string }): Promise<ApiResponse<{ created: number; skipped: any[] }>> {
    const form = new FormData();
    form.append('file', file);
    form.append('scope', options?.scope || 'system');
    if (options?.tenant_id) form.append('tenant_id', options.tenant_id);
    return this.request<{ created: number; skipped: any[] }>(`/api/v1/question-bank/import`, { method: 'POST', body: form } as any);
  }

  async exportQuestionsCSV(): Promise<ApiResponse<{ csv: string }>> {
    return this.request<{ csv: string }>(`/api/v1/question-bank/export`);
  }
}

// Export singleton instance
export const apiService = new FastAPIService();
export default apiService;