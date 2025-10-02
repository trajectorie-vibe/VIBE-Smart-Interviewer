# Live & Final Transcription Implementation

## Overview
The system now implements **dual-layer transcription** for maximum reliability:

1. **Live Transcription** - Real-time speech-to-text during recording
2. **Final Transcription** - Post-recording verification and fallback

## How It Works

### During Recording (Live Transcription)
```
User speaks → Web Speech API (continuous mode) → Live transcript updates
                                                 ↓
                                    Displayed in real-time to user
                                                 ↓
                                    Stored in liveTranscriptRef
```

**Key Features:**
- ✅ Continuous speech recognition with auto-restart every ~60 seconds
- ✅ Shows both final and interim results
- ✅ Visual indicator when live transcription is active
- ✅ Handles multiple languages (en, es, fr, de, ar, pt, hi, ru, ja, zh)
- ✅ Uses `useRef` to avoid stale closure bugs

### After Recording Stops (Final Transcription)
```
Stop button clicked → MediaRecorder stops → transcribeFromAudioBlob() called
                                                      ↓
                            Live transcript sent as final transcription
                                                      ↓
                            handleFinalTranscription() callback triggered
                                                      ↓
                            Transcript saved with response submission
```

**Why This Approach:**
The Web Speech API cannot directly transcribe from audio Blob files. It requires a live MediaStream input. Therefore:
- We rely on the **live transcript** accumulated during recording
- The "final transcription" step ensures the live transcript is properly captured and saved
- This provides a reliable fallback if real-time display had any issues

## Implementation Details

### Components Modified

#### `real-time-audio-recorder.tsx`
**New Props:**
- `onFinalTranscription?: (transcription: string) => void` - Callback for final transcript

**New State/Refs:**
- `liveTranscriptRef` - Stores accumulated live transcript
- `isRecordingRef` - Ref-based recording state (prevents stale closure)

**Key Functions:**
- `startSpeechRecognition()` - Starts continuous speech recognition
  - Auto-restarts every ~60 seconds via `onend` handler
  - Updates both live display and ref
  
- `transcribeFromAudioBlob()` - Called after recording stops
  - Uses live transcript as final version (most reliable)
  - Provides fallback mechanism
  
- `startRecording()` - Resets transcript refs on new recording

- `stopRecording()` - Logs transcript length for debugging

#### `app/candidate/test/questions/page.tsx`
**New Handlers:**
- `handleFinalTranscription()` - Receives final transcript after recording
  - Sets `finalTranscript` state
  - Updates `liveTranscriptRef` for submission
  - Logs for debugging

**Updated Handlers:**
- `handleRecordingComplete()` - Now uses final transcript as primary source
  - Falls back to live transcript if final not available
  - Improved logging

## Console Log Messages

When working correctly, you'll see:
```
[Recording] Started - Live transcription active
[Speech Recognition] Started with language: en-US
[Speech Recognition] Live transcription update: [text]
[Speech Recognition] Live transcription update: [more text]
... (continues throughout recording)
[Recording] Stopping... Live transcript length: 542
[Recording] Stopped. Processing final transcription...
[Final Transcription] Using live transcript as final (Web Speech API limitation)
[Questions Page] Final transcription received: [text preview]
```

## Troubleshooting

### No Transcription Appearing
1. **Check browser support**: Chrome/Edge/Safari work best
2. **Check microphone permission**: Must be granted
3. **Check console logs**: Look for `[Speech Recognition]` messages
4. **Check language setting**: Must match user's spoken language

### Transcription Stops After 60 Seconds
- **Fixed**: `isRecordingRef` ensures auto-restart works properly
- Should see: `[Speech Recognition] Started with language: ...` every ~60s

### Final Transcript Empty
- **Check**: Live transcript should accumulate during recording
- **Fallback**: System uses live transcript if final fails
- **Debug**: Check console for transcript length when stopping

## Technical Limitations

### Web Speech API Constraints
1. **No offline support** - Requires internet connection
2. **No direct audio file transcription** - Only works with live streams
3. **Browser-dependent accuracy** - Chrome typically most accurate
4. **Language must be set before starting** - Cannot switch mid-recording

### Workarounds Implemented
- ✅ Store live transcript in ref for reliability
- ✅ Final transcription uses accumulated live transcript
- ✅ Auto-restart prevents timeout issues
- ✅ Fallback mechanisms at multiple levels

## Future Enhancements

### Potential Improvements
1. **Backend transcription service** - Send audio blob to server for processing
   - Could use Google Speech-to-Text, AWS Transcribe, or Azure Speech
   - Would provide offline capability and better accuracy
   
2. **Hybrid approach** - Combine live and backend transcription
   - Live for real-time feedback
   - Backend for final accuracy verification
   
3. **Confidence scores** - Display transcription confidence
   - Help users identify sections that may need review

4. **Transcript editing** - Allow manual corrections before submission
   - Useful for technical terms or names

## Testing Checklist

- [ ] Start recording and speak continuously
- [ ] Verify real-time transcript appears
- [ ] Continue speaking for >60 seconds
- [ ] Verify transcription auto-restarts (check console)
- [ ] Stop recording
- [ ] Check final transcript is populated
- [ ] Submit response
- [ ] Verify transcript saved in database

## Database Schema

Transcripts are saved in the `media_files` table:
```sql
transcription_status VARCHAR(50) DEFAULT 'pending'  -- 'pending', 'processing', 'completed', 'failed'
transcription_text TEXT                             -- The actual transcript
```

Currently set to 'completed' immediately with live transcript. Future backend processing could update these fields asynchronously.
