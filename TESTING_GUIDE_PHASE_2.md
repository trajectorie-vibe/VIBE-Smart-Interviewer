# Quick Testing Guide - Phase 2 Features

## Overview
This guide helps you test all the newly implemented features for analysis generation and download.

---

## Prerequisites

✅ **Backend Running:** http://127.0.0.1:8000
✅ **Frontend Running:** http://localhost:3000

---

## Test Scenario 1: Admin Dashboard - Generate & Download Analysis

### Steps:

1. **Login as Admin**
   ```
   Navigate to: http://localhost:3000/admin
   Login with admin credentials
   ```

2. **View Submissions Table**
   - Scroll down to the "Submissions" tab
   - Look for the table with candidate submissions

3. **Check Progress Bars** ✨ NEW
   - Each submission should show a progress bar in the "Progress" column
   - 0% = Not started
   - 50% = In progress (started)
   - 100% = Completed (green bar)

4. **Test Generate Analysis** ✨ NEW
   - Find a submission with:
     - Status: "completed"
     - Progress: 100%
     - AI analysis: "pending" (amber badge)
   - Look for the **orange "Generate" button** with sparkles icon (✨)
   - Click the button
   - **Expected Result:**
     - Alert: "Analysis generation started! Refresh in a few moments..."
     - Table refreshes automatically
     - AI analysis status changes to "completed" (emerald badge)

5. **Test Download Analysis** ✨ NEW
   - Find a submission with:
     - AI analysis: "completed" (emerald badge)
   - Look for the **emerald "Download" button** with download icon (⬇️)
   - Click the button
   - **Expected Result:**
     - Browser downloads a `.txt` file named: `analysis_report_{id}_{timestamp}.txt`
     - File contains:
       ```
       ================================================================================
       VIBE SMART INTERVIEWER - ANALYSIS REPORT
       ================================================================================
       
       Report ID: {submission_id}
       Test Type: {test_type}
       Status: completed
       Generated At: {timestamp}
       
       --------------------------------------------------------------------------------
       ANALYSIS RESULTS
       --------------------------------------------------------------------------------
       
       SUMMARY:
       {analysis summary text}
       
       OVERALL SCORES:
       {score details}
       
       COMPETENCY BREAKDOWN:
       {competency details}
       ```

---

## Test Scenario 2: Submissions Page - Full Workflow

### Steps:

1. **Navigate to Submissions Page**
   ```
   Go to: http://localhost:3000/admin/submissions
   ```

2. **Check Actions Column**
   - Each submission should have an "Actions" column with multiple buttons:
     - **View** (eye icon) - View detailed report
     - **Media** (download icon) - Download video/audio/text
     - **Generate** (orange, file icon) - Generate analysis ✨ NEW
     - **Analysis** (emerald, file icon) - Download analysis ✨ NEW
     - **Delete** (red, trash icon) - Delete submission

3. **Test Button Visibility** ✨ NEW
   - **Generate button** should ONLY show when:
     - Submission status = "completed"
     - AND no analysis exists yet (report field is null)
   
   - **Analysis button** should ONLY show when:
     - Analysis exists (report field is not null)

4. **Test Generate Flow**
   - Find a completed submission without analysis
   - Click the orange **"Generate"** button
   - **Expected Result:**
     - Toast notification: "Analysis generation started!"
     - Page refreshes
     - Generate button disappears
     - Analysis button appears after refresh

5. **Test Download Flow**
   - Click the emerald **"Analysis"** button
   - **Expected Result:**
     - Browser downloads the analysis report
     - Toast notification: "Analysis report downloaded successfully"
     - File opens with formatted text content

6. **Test Media Download** (Existing Feature)
   - Click the **"Media"** button
   - Select formats: Text, Video, Audio
   - Click download
   - **Expected Result:**
     - Downloads media files as before
     - This button is separate from analysis download

---

## Test Scenario 3: Superadmin Access

### Steps:

1. **Login as Superadmin**
   ```
   Navigate to: http://localhost:3000/superadmin
   ```

2. **Go to Submissions**
   ```
   Click: "View full history" or navigate to /superadmin/submissions
   ```

3. **Verify Same Features**
   - All buttons should work identically to admin view
   - Generate analysis button ✅
   - Download analysis button ✅
   - Progress bars ✅

4. **Test Cross-Tenant Access**
   - Superadmin should see submissions from ALL tenants
   - Should be able to generate/download for any tenant
   - No permission errors

---

## Test Scenario 4: Error Handling

### Test Permission Errors:

1. **Admin Accessing Wrong Tenant**
   - Try to generate analysis for submission from different tenant
   - **Expected:** 403 Forbidden error
   - **Message:** "Access denied - not your tenant's submission"

2. **Missing Analysis**
   - Try to download analysis for submission without one
   - **Expected:** 404 Not Found error
   - **Message:** "Analysis not yet generated for this submission"

### Test Network Errors:

1. **Backend Down**
   - Stop backend server
   - Try to generate/download analysis
   - **Expected:** Error toast with clear message

2. **Invalid Submission ID**
   - Manually call API with fake ID
   - **Expected:** 400 Bad Request or 404 Not Found

---

## API Endpoints to Test Manually

### 1. Generate Analysis
```bash
POST http://127.0.0.1:8000/api/v1/reports/generate/{submission_id}
Headers:
  Authorization: Bearer {access_token}

Response:
{
  "message": "Analysis generated successfully",
  "submission_id": "{submission_id}"
}
```

### 2. Download Analysis
```bash
GET http://127.0.0.1:8000/api/v1/reports/{submission_id}/download
Headers:
  Authorization: Bearer {access_token}

Response:
Content-Type: text/plain
Content-Disposition: attachment; filename="analysis_report_{id}_{timestamp}.txt"
[File content]
```

### 3. Get Analysis (JSON)
```bash
GET http://127.0.0.1:8000/api/v1/reports/{submission_id}
Headers:
  Authorization: Bearer {access_token}

Response:
{
  "submission": {
    "id": "...",
    "status": "completed",
    "analysis_completed": true
  },
  "analysis_result": {
    "generated_at": "...",
    "summary": "...",
    "overall": {...},
    "by_competency": {...}
  }
}
```

---

## Visual Verification Checklist

### Admin Dashboard Table
- [ ] Progress column exists
- [ ] Progress bars show correct percentage
- [ ] Progress bars are color-coded (orange/emerald)
- [ ] Actions column has generate button (orange)
- [ ] Actions column has download button (emerald)
- [ ] Buttons only show in correct conditions

### Submissions Page
- [ ] View button (existing) - still works
- [ ] Media button (renamed from Download) - still works
- [ ] Generate button (new) - shows only when needed
- [ ] Analysis button (new) - shows only when analysis exists
- [ ] Delete button (existing) - still works
- [ ] All buttons have correct icons
- [ ] Color scheme is consistent (orange/emerald)

### Downloaded File
- [ ] File name format: `analysis_report_{id}_{timestamp}.txt`
- [ ] File contains header with equals signs
- [ ] File contains submission metadata
- [ ] File contains analysis sections
- [ ] File contains summary
- [ ] File contains scores
- [ ] File contains competency breakdown
- [ ] File is properly formatted and readable

---

## Common Issues & Solutions

### Issue: Generate button doesn't show
**Solution:** 
- Check submission status = "completed"
- Check submission.report is null/undefined
- Refresh the page

### Issue: Download analysis gives 404
**Solution:**
- Generate the analysis first
- Wait a few seconds for generation to complete
- Refresh the page to update status

### Issue: Permission denied (403)
**Solution:**
- Verify logged in as correct user
- Admin can only access their tenant's submissions
- Superadmin can access all

### Issue: Backend errors (500)
**Solution:**
- Check backend logs in terminal
- Look for detailed error messages with logger output
- Check database permissions
- Verify submission exists

### Issue: Frontend not updating
**Solution:**
- Clear browser cache
- Hard refresh (Ctrl+Shift+R)
- Check browser console for errors
- Verify frontend is running on correct port (3000)

---

## Success Criteria

✅ **All tests pass if:**

1. Generate button appears for completed submissions without analysis
2. Generate button triggers analysis creation
3. Analysis status updates in UI after generation
4. Download button appears for submissions with analysis
5. Download button downloads formatted text file
6. File contains all expected sections
7. Progress bars show correct percentages
8. All features work for both admin and superadmin
9. Error messages are clear and helpful
10. No console errors in browser or backend

---

## Next Steps After Testing

If all tests pass:
- ✅ Mark Phase 2 as complete
- 🔄 Begin Phase 3 (real-time updates, PDF export, etc.)
- 📝 Document any bugs found
- 🎉 Celebrate the successful implementation!

If tests fail:
- 📋 Document the issue
- 🔍 Check browser console for errors
- 📊 Check backend logs for details
- 🐛 Report bugs with steps to reproduce
