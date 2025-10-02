## Remaining TODOs for Complete Backend Integration

### 1. Questions API Integration

**Current State:** Questions page uses mock data
```typescript
const mockQuestions: Question[] = Array.from({ length: 5 }, (_, i) => ({
  id: `q${i + 1}`,
  question_text: `Sample question ${i + 1}...`,
  ...
}));
```

**Needed:** Connect to backend test questions endpoint

**Backend Endpoint:** 
- `GET /api/v1/tests-structured/{test_id}/questions` (for superadmin/admin)
- Need to create candidate-specific endpoint or use test configuration

**Recommended Solution:**
Create a new endpoint in `backend/app/api/tests.py`:
```python
@router.get("/{test_type}/questions", response_model=List[QuestionResponse])
async def get_test_questions_for_candidate(
    test_type: str,
    assignment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Verify assignment belongs to user
    # Load test from assignment  
    # Return questions from test
```

### 2. Video Upload Endpoint

**Current State:** Simulated upload with setTimeout
```typescript
// Simulated upload for now
await new Promise(resolve => setTimeout(resolve, 1500));
```

**Needed:** Real file upload to backend

**Backend Endpoint:** Already exists!
- `POST /api/v1/submissions/{submission_id}/media`

**Frontend Fix:** Use FormData to upload video blob

### 3. Transcription Service

**Current State:** Simulated phrases
```typescript
const phrases = [
  'Um, so my approach would be to...',
  ...
];
```

**Needed:** Real transcription

**Options:**
1. Web Speech API (browser-based, free)
2. Backend transcription service (Whisper API, Google Speech-to-Text, etc.)

### 4. Submission Creation

**Current State:** Not implemented
**Needed:** Create submission when test starts
**Backend Endpoint:** 
- `POST /api/v1/submissions`

### Integration Steps:

1. **Add API methods to apiService:**
```typescript
// In frontend/src/lib/api-service.ts
async getTestQuestions(test_type: string, assignment_id: string): Promise<ApiResponse<any[]>> {
  return this.request<any[]>(`/api/v1/tests/${test_type}/questions?assignment_id=${assignment_id}`);
}

async uploadMedia(submissionId: string, file: Blob, filename: string): Promise<ApiResponse<any>> {
  const formData = new FormData();
  formData.append('file', file, filename);
  return this.request<any>(`/api/v1/submissions/${submissionId}/media`, {
    method: 'POST',
    body: formData
  });
}

async createSubmission(data: any): Promise<ApiResponse<any>> {
  return this.request<any>('/api/v1/submissions', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}
```

2. **Update questions page to use real APIs**
3. **Add Web Speech API for transcription**
4. **Test end-to-end flow**

---

## Color Theme Applied ✅

All candidate pages now use:
- **Primary:** Orange (#ea580c, #f97316)
- **Secondary:** Red (#dc2626, #ef4444)
- **Background:** White, Light Orange, Light Red
- **Text:** Dark Gray, Medium Gray

## Camera Check Fixed ✅

Camera and microphone detection now works properly with:
- Video load event listener
- Proper timing for lighting/audio checks
- Error handling for permissions
