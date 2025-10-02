"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square, Video, VideoOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { InterviewMode } from '@/types';
import { useLanguage } from '@/contexts/language-context';
import { useTranslation } from 'react-i18next';

interface RealTimeMediaCaptureProps {
  onRecordingComplete: (mediaBlob: Blob, mediaDataUri: string) => void;
  onRealtimeTranscription: (transcription: string) => void;
  onFinalTranscription?: (transcription: string) => void; // NEW: Final transcription from audio
  isRecordingExternally: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  disabled?: boolean;
  captureMode: InterviewMode;
  // NEW: external triggers to start/stop recording programmatically
  startTrigger?: number;
  stopTrigger?: number;
}

// Declare the webkitSpeechRecognition interface for TypeScript
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

const RealTimeMediaCapture: React.FC<RealTimeMediaCaptureProps> = ({
  onRecordingComplete,
  onRealtimeTranscription,
  onFinalTranscription,
  isRecordingExternally,
  onStartRecording,
  onStopRecording,
  disabled,
  captureMode,
  startTrigger,
  stopTrigger,
}) => {
  const [isRecordingInternal, setIsRecordingInternal] = useState(false);
  const mediaRecorderRef = useRef<globalThis.MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const speechRecognitionRef = useRef<any>(null);
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasPermission, setHasPermission] = useState(true);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [supportsSpeechRecognition, setSupportsSpeechRecognition] = useState(false);
  const [currentTranscription, setCurrentTranscription] = useState('');
  const { currentLanguage } = useLanguage();
  const { t } = useTranslation();
  const isRecordingRef = useRef(false);
  const liveTranscriptRef = useRef(''); // Store live transcript for final comparison

  // Map BCP-47 codes to SpeechRecognition-preferred locale variants
  const getSpeechLocale = useCallback((langCode: string | undefined) => {
    const code = (langCode || 'en').toLowerCase();
    switch (code) {
      case 'en': return 'en-US';
      case 'es': return 'es-ES';
      case 'fr': return 'fr-FR';
      case 'de': return 'de-DE';
      case 'ar': return 'ar-SA';
      case 'pt': return 'pt-PT';
      case 'hi': return 'hi-IN';
      case 'ru': return 'ru-RU';
      case 'ja': return 'ja-JP';
      case 'zh': return 'zh-CN';
      default: return 'en-US';
    }
  }, []);

  useEffect(() => {
    // Check if browser supports Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupportsSpeechRecognition(!!SpeechRecognition);
  }, []);

  useEffect(() => {
    let activeStream: MediaStream | null = null;
  const getMediaPermission = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setHasPermission(false);
        toast({
          variant: 'destructive',
          title: t('recorder.unsupportedBrowserTitle'),
          description: t('recorder.unsupportedBrowserMsg'),
        });
        return;
      }
      try {
        // First try requested mode
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: captureMode === 'video'
        });
        activeStream = mediaStream;
        setStream(mediaStream);
        setHasPermission(true);
        if (videoRef.current && captureMode === 'video') {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (error) {
        console.warn('Primary getUserMedia failed, attempting audio-only fallback:', error);
        try {
          // Fallback to audio-only if camera is blocked or unavailable
          const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          activeStream = audioOnly;
          setStream(audioOnly);
          setHasPermission(true);
          if (videoRef.current) {
            videoRef.current.srcObject = null;
          }
          toast({
            title: t('recorder.cameraUnavailableTitle') || 'Camera unavailable',
            description: t('recorder.cameraUnavailableMsg') || 'Continuing with microphone only.',
          });
        } catch (fallbackErr) {
          console.error('Audio-only fallback failed:', fallbackErr);
          setHasPermission(false);
          toast({
            variant: 'destructive',
            title: t('recorder.permissionsDeniedTitle'),
            description: t('recorder.permissionsDeniedMsg'),
          });
        }
      }
    };
    getMediaPermission();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [toast, captureMode]);

  const blobToDataURI = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert blob to data URI.'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const startSpeechRecognition = useCallback(() => {
    if (!supportsSpeechRecognition) {
      console.log('[Speech Recognition] Not supported in this browser - will use Gemini for transcription');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = getSpeechLocale(currentLanguage);

    let finalTranscript = '';

    recognition.onresult = (event: any) => {
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      const currentText = finalTranscript + interimTranscript;
      console.log('[Speech Recognition] Live transcription update:', currentText);
      setCurrentTranscription(currentText);
      liveTranscriptRef.current = currentText; // Store for final processing
      onRealtimeTranscription(currentText);
    };

    recognition.onerror = (event: any) => {
      console.warn('[Speech Recognition] Error (non-critical):', event.error);
      
      // Only show error for permission issues, ignore other errors
      if (event.error === 'not-allowed') {
        toast({
          variant: 'destructive',
          title: t('recorder.micDeniedTitle'),
          description: t('recorder.micDeniedMsg'),
        });
      }
      
      // For aborted or other errors, just log and continue
      // Gemini transcription will handle the final accurate transcription
      if (event.error === 'aborted' || event.error === 'no-speech') {
        console.log('[Speech Recognition] Ignoring non-critical error, will use Gemini for final transcription');
      }
    };

    recognition.onend = () => {
      // Auto-restart if still recording (use ref to avoid stale closure)
      if (isRecordingRef.current) {
        try {
          console.log('[Speech Recognition] Session ended, attempting restart...');
          recognition.start();
        } catch (error) {
          console.warn('[Speech Recognition] Could not restart (non-critical):', error);
          // This is not critical - Gemini will handle final transcription
        }
      }
    };

    speechRecognitionRef.current = recognition;
    
    try {
      recognition.start();
      console.log('[Speech Recognition] ✅ Started successfully with language:', getSpeechLocale(currentLanguage));
      console.log('[Speech Recognition] Live transcription is optional - Gemini will provide final accurate transcription');
    } catch (error) {
      console.warn('[Speech Recognition] ⚠️ Could not start (non-critical):', error);
      console.log('[Speech Recognition] Proceeding without live transcription - Gemini will handle transcription after recording');
      // Don't show error toast - this is not critical
      // Gemini transcription will work regardless
    }
  }, [supportsSpeechRecognition, onRealtimeTranscription, toast, getSpeechLocale, currentLanguage, t]);

  const stopSpeechRecognition = useCallback(() => {
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
    }
  }, []);

  // NEW: Transcribe from audio blob using Gemini API after recording stops
  const transcribeFromAudioBlob = useCallback(async (audioBlob: Blob) => {
    if (!onFinalTranscription) {
      console.log('[Final Transcription] Skipped - no callback provided');
      return;
    }

    console.log('[Final Transcription] Starting Gemini API transcription from audio blob...');
    console.log('[Final Transcription] Audio blob size:', audioBlob.size, 'bytes, type:', audioBlob.type);

    try {
      // Convert blob to data URI for Gemini API
      const dataUri = await blobToDataURI(audioBlob);
      console.log('[Final Transcription] Audio data URI created, length:', dataUri.length);
      
      // Send to Gemini transcription API
      const response = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audioDataUri: dataUri,
          languageCode: currentLanguage,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini transcription failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      const geminiTranscript = result.transcription?.trim() || '';
      
      console.log('[Final Transcription] Gemini result received, length:', geminiTranscript.length);
      console.log('[Final Transcription] Gemini transcript preview:', geminiTranscript.substring(0, 100) + '...');
      
      // Compare with live transcript
      const liveText = liveTranscriptRef.current.trim();
      console.log('[Final Transcription] Live transcript length:', liveText.length);
      
      // Use Gemini transcript as it's more accurate, fall back to live if Gemini is empty
      const finalTranscript = geminiTranscript || liveText;
      
      if (finalTranscript) {
        console.log('[Final Transcription] ✅ Using transcript from:', geminiTranscript ? 'Gemini API' : 'Live Speech Recognition');
        onFinalTranscription(finalTranscript);
      } else {
        console.warn('[Final Transcription] ⚠️ Both Gemini and live transcripts are empty!');
      }
      
    } catch (error) {
      console.error('[Final Transcription] ❌ Gemini API error:', error);
      
      // Fall back to live transcript if Gemini fails
      const liveText = liveTranscriptRef.current.trim();
      if (liveText && onFinalTranscription) {
        console.log('[Final Transcription] 🔄 Falling back to live transcript (length:', liveText.length, ')');
        onFinalTranscription(liveText);
      } else {
        console.error('[Final Transcription] ❌ No fallback available - both Gemini and live transcript failed');
        toast({
          variant: 'destructive',
          title: t('recorder.transcriptionFailedTitle') || 'Transcription Failed',
          description: t('recorder.transcriptionFailedMsg') || 'Could not transcribe audio. Please try again.',
        });
      }
    }
  }, [onFinalTranscription, blobToDataURI, currentLanguage, toast, t]);

  const startRecording = async () => {
    if (!hasPermission || !stream) {
      toast({
        variant: "destructive",
        title: t('recorder.cannotRecordTitle'),
        description: t('recorder.cannotRecordMsg'),
      });
      return;
    }
    try {
      onStartRecording();
      setIsRecordingInternal(true);
      isRecordingRef.current = true;
      setCurrentTranscription('');
      liveTranscriptRef.current = ''; // Reset live transcript
      
      console.log('[Recording] Started - Live transcription active');
      
      // Start speech recognition for real-time transcription
      if (supportsSpeechRecognition) {
        startSpeechRecognition();
      } else {
        toast({
          title: t('recorder.rtaUnsupported'),
          description: '',
        });
      }

  // Choose mime type based on available tracks; fallback to audio if no video track
  const hasVideoTrack = stream.getVideoTracks && stream.getVideoTracks().length > 0;
  const mimeType = hasVideoTrack ? 'video/webm' : 'audio/webm';
  mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      mediaChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        mediaChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const completeBlob = new Blob(mediaChunksRef.current, { type: mimeType });
        
        console.log('[Recording] Stopped. Processing final transcription...');
        
        // Trigger final transcription from the audio blob
        // This will use the live transcript as the final version (most reliable)
        await transcribeFromAudioBlob(completeBlob);
        
        try {
          const dataUri = await blobToDataURI(completeBlob);
          onRecordingComplete(completeBlob, dataUri);
        } catch (error) {
          toast({
            variant: "destructive",
            title: t('recorder.convertErrorTitle'),
            description: t('recorder.convertErrorMsg'),
          });
        }
      };

      mediaRecorderRef.current.start();
    } catch (err) {
      console.error("Error starting recording:", err);
      toast({
        variant: "destructive",
        title: t('recorder.recordingErrorTitle'),
        description: t('recorder.recordingErrorMsg'),
      });
      setIsRecordingInternal(false);
      onStopRecording();
    }
  };

  const stopRecording = () => {
    console.log('[Recording] Stopping... Live transcript length:', liveTranscriptRef.current.length);
    
    // Stop speech recognition
    isRecordingRef.current = false;
    stopSpeechRecognition();
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingInternal(false);
    onStopRecording();
  };

  // Respond to external triggers for programmatic control
  useEffect(() => {
    if (typeof startTrigger === 'number') {
      // When startTrigger changes, attempt to start if not already recording
      if (!isRecordingInternal && !disabled) {
        startRecording();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTrigger]);

  useEffect(() => {
    if (typeof stopTrigger === 'number') {
      // When stopTrigger changes, stop if currently recording
      if (isRecordingInternal) {
        stopRecording();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopTrigger]);

  return (
    <div className="flex flex-col items-center space-y-4 w-full">
      <div className="w-full aspect-video bg-black rounded-lg overflow-hidden relative border border-border flex items-center justify-center">
          {captureMode === 'video' ? (
            <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" autoPlay muted playsInline />
          ) : (
            <div className="flex flex-col items-center justify-center text-white">
                <Mic className="h-16 w-16" />
                <p className="mt-4 text-lg font-semibold">{t('recorder.audioMode')}</p>
                {!supportsSpeechRecognition && (
                  <p className="mt-2 text-sm text-yellow-300">
                    {t('recorder.rtaUnsupported')}
                  </p>
                )}
            </div>
          )}
          {!hasPermission && (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white p-4">
                <VideoOff className="h-12 w-12 mb-4" />
                <p className="text-center font-semibold">{t('recorder.mediaDeniedTitle')}</p>
                <p className="text-center text-sm text-muted-foreground">{t('recorder.mediaDeniedMsg')}</p>
             </div>
          )}
          {isRecordingInternal && supportsSpeechRecognition && (
            <div className="absolute bottom-4 left-4 right-4">
              <div className="bg-black/70 text-white p-2 rounded-lg text-sm">
                <span className="text-green-400 animate-pulse">● </span>
                {t('recorder.liveActive')}
              </div>
            </div>
          )}
      </div>

      {isRecordingInternal ? (
        <Button onClick={stopRecording} variant="destructive" size="lg" className="w-full sm:w-auto" disabled={disabled}>
          <Square className="mr-2 h-5 w-5" /> {t('recorder.stop')}
        </Button>
      ) : (
        <Button onClick={startRecording} variant="destructive" size="lg" className="w-full sm:w-auto" disabled={disabled || isRecordingExternally || !hasPermission}>
          {captureMode === 'video' ? <Video className="mr-2 h-5 w-5" /> : <Mic className="mr-2 h-5 w-5" />}
           {t('recorder.record')}
        </Button>
      )}
      {isRecordingInternal && (
        <div className="text-center">
          <p className="text-sm text-primary animate-pulse">{t('recorder.recording')}</p>
          {supportsSpeechRecognition && (
            <p className="text-xs text-gray-500 mt-1">{t('recorder.rtaEnabled')}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default RealTimeMediaCapture;
