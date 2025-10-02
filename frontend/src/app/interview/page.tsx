"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Header from '@/components/header';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '@/contexts/auth-context';
import { apiService, type AssignmentSummary } from '@/lib/api-service';
import Flashcard from '@/components/flashcard';
import type { ConversationEntry, InterviewMode } from '@/types';
import { Button } from '@/components/ui/button';
import { useProgressive } from '@/contexts/progressive-context';
import { useTranslation } from 'react-i18next';

type LoadedTest = {
  id: string;
  name: string;
  description?: string;
  config?: any;
  questions?: Array<{ id: string; text?: string; situation?: string; question?: string; competency?: string }>;
};

function formatQuestion(q: any): string {
  // Normalize question content into the Flashcard-friendly format
  const parts: string[] = [];
  const situation = q.situation || q.content?.situation || '';
  const question = q.question || q.text || q.content?.question || '';
  if (situation) parts.push(`Situation: ${situation}`);
  if (question) parts.push(`Question: ${question}`);
  return parts.join('\n\n') || String(q.text || '');
}

function InterviewClient() {
  const params = useSearchParams();
  const router = useRouter();
  const assignmentId = params.get('assignment_id');
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<AssignmentSummary | null>(null);
  const [test, setTest] = useState<LoadedTest | null>(null);

  // Interview state
  const [mode, setMode] = useState<InterviewMode>('video');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [conversationHistory, setConversationHistory] = useState<ConversationEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const progressive = useProgressive();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Gating state
  const [gatingStage, setGatingStage] = useState<'init'|'gdpr'|'media'|'done'>('init');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [cameraOk, setCameraOk] = useState<boolean | null>(null);
  const [micOk, setMicOk] = useState<boolean | null>(null);
  const [checkingMedia, setCheckingMedia] = useState(false);

  const questions = useMemo(() => test?.questions ?? [], [test]);
  const meta = assignment?.metadata || {} as any;
  const perQuestionSeconds = Number(meta?.per_question_time_seconds) || 0;
  const prepTimeSeconds = Number(meta?.prep_time_seconds) || 0;
  const answerTimeSeconds = Number(meta?.answer_time_seconds) || 0;
  const reRecordLimit = Number(meta?.re_record_limit) || 0;
  const ttsEnabled = Boolean(meta?.tts_enabled);
  const ttsVoice = typeof meta?.tts_voice === 'string' ? meta.tts_voice : undefined;
  const autoStartRecording = Boolean(meta?.auto_start_recording);
  const cameraCheckEnabled = meta?.camera_check_enabled !== false; // default true
  const gdprRequired = meta?.gdpr_required !== false; // default true

  const bootstrap = useCallback(async () => {
    if (!assignmentId) return;
    setLoading(true);
    setError(null);
    // 1) Start assignment (idempotent on backend). Returns AssignmentSummary
    const started = await apiService.startMyAssignment(assignmentId);
    if (started.error || !started.data) {
      setError(started.error || 'Failed to start assignment');
      setLoading(false);
      return;
    }
    const a = started.data;
    setAssignment(a);

    // 2) Load test definition to get questions
    const testId = a.test_id;
    if (!testId) {
      setError('This assignment has no linked test.');
      setLoading(false);
      return;
    }
    const tRes = await apiService.getStructuredTest(testId);
    if (tRes.error || !tRes.data) {
      setError(tRes.error || 'Could not load test');
      setLoading(false);
      return;
    }
    const tData = tRes.data;
    const normalized: LoadedTest = {
      id: tData.id || testId,
      name: tData.name || 'Assessment',
      description: tData.description,
      config: tData.config,
      questions: Array.isArray(tData.questions)
        ? tData.questions.map((q: any) => ({
            id: String(q.id ?? q._id ?? Math.random()),
            text: formatQuestion(q),
            situation: q.situation,
            question: q.question ?? q.text,
            competency: q.assessedCompetency || q.competency,
          }))
        : [],
    };
    setTest(normalized);

    // 3) Initialize conversation history
    setConversationHistory(
      (normalized.questions || []).map((q) => ({
        question: q.text || formatQuestion(q),
        answer: null,
        competency: q.competency,
      }))
    );

    // 4) Set mode from assignment delivery_mode if provided
    const m = (a.delivery_mode as InterviewMode) || 'video';
    setMode(m === 'audio' || m === 'text' ? m : 'video');

    // Initialize gating stage after we know mode and metadata
    try {
      // Restore prior consent if present for this assignment
      const consentKey = `gdpr-consent:${a.id}`;
      const priorConsent = typeof window !== 'undefined' ? window.sessionStorage.getItem(consentKey) : null;
      if (priorConsent === '1') setConsentAccepted(true);

      const needsMedia = (cameraCheckEnabled && (m !== 'text'));
      const needsConsent = gdprRequired;
      if (!needsMedia && !needsConsent) {
        setGatingStage('done');
      } else if (needsConsent) {
        setGatingStage('gdpr');
      } else {
        setGatingStage('media');
      }
    } catch {}

    setLoading(false);
  }, [assignmentId]);

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  const handleSubmitAnswer = async (answer: string, videoDataUri?: string) => {
    setIsSaving(true);
    try {
      setConversationHistory((prev) => {
        const next = [...prev];
        next[currentQuestionIndex] = {
          ...next[currentQuestionIndex],
          answer,
          videoDataUri,
        };
        return next;
      });
      // Progressive save/upload (feature-flagged)
      try {
        if (progressive.isProgressiveUploadEnabled) {
          if (!progressive.currentSessionId) {
            progressive.startNewSession('JDT');
          }
          await progressive.saveQuestionWithUpload(
            currentQuestionIndex,
            {
              question: conversationHistory[currentQuestionIndex]?.question || formatQuestion(questions[currentQuestionIndex]),
              answer,
              videoDataUri,
              competency: questions[currentQuestionIndex]?.competency,
            },
            'JDT',
            conversationHistory.length
          );
        } else if (progressive.isProgressiveSaveEnabled) {
          if (!progressive.currentSessionId) {
            progressive.startNewSession('JDT');
          }
          await progressive.saveQuestionProgress(
            currentQuestionIndex,
            {
              question: conversationHistory[currentQuestionIndex]?.question || formatQuestion(questions[currentQuestionIndex]),
              answer,
              videoDataUri,
              competency: questions[currentQuestionIndex]?.competency,
            },
            'JDT',
            conversationHistory.length
          );
        }
      } catch (e) {
        console.warn('Progressive save skipped/failed:', e);
      }
    } finally {
      setIsSaving(false);
      // Move to next unanswered question if available
      setCurrentQuestionIndex((idx) => Math.min(idx + 1, (questions?.length || 1) - 1));
    }
  };

  const answeredCount = useMemo(() => conversationHistory.filter((c) => !!c.answer)?.length ?? 0, [conversationHistory]);
  const allAnswered = useMemo(() => conversationHistory.length > 0 && answeredCount === conversationHistory.length, [answeredCount, conversationHistory.length]);

  const handleFinish = async () => {
    if (!assignment) return router.push('/');
    setIsSubmitting(true);
    try {
      // Option A: If backend expects assignment submission, call that once available.
      // Option B: Use submissions API as a placeholder with essential fields.
      const payload = {
        assignment_id: assignment.id,
        test_id: assignment.test_id,
        delivery_mode: assignment.delivery_mode,
        language_code: assignment.language_code,
        answers: conversationHistory.map((c, idx) => ({
          index: idx,
          question: c.question,
          answer: c.answer,
          competency: c.competency,
          video_data_uri: c.videoDataUri,
        })),
        completed_at: new Date().toISOString(),
        metadata: assignment.metadata || {},
      } as any;

      // Try an assignments timeline mark if available (no-op result used)
      try { await apiService.getAssignmentTimeline(assignment.id); } catch {}

      // Submit via generic submissions endpoint for now
      await apiService.createSubmission(payload);

      // Progressive: mark session complete
      try { if (progressive.currentSessionId) await progressive.markSessionComplete(); } catch {}

      setSubmitted(true);
      // Short delay then go home
      setTimeout(() => router.push('/'), 900);
    } catch (e) {
      console.error('Submit failed:', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Media checks
  const runMediaChecks = async () => {
    setCheckingMedia(true);
    try {
      const needVideo = mode === 'video';
      const needAudio = mode === 'video' || mode === 'audio';
      if (!needVideo && !needAudio) {
        setCameraOk(true);
        setMicOk(true);
        setGatingStage('done');
        return;
      }
      const constraints: MediaStreamConstraints = {
        video: needVideo,
        audio: needAudio,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      try {
        if (needVideo) setCameraOk(stream.getVideoTracks().length > 0);
        else setCameraOk(true);
        if (needAudio) setMicOk(stream.getAudioTracks().length > 0);
        else setMicOk(true);
      } finally {
        // stop tracks
        stream.getTracks().forEach(t => t.stop());
      }
    } catch (e) {
      // On failure, mark whichever were required as false
      setCameraOk(prev => (mode === 'video' ? false : (prev ?? true)));
      setMicOk(prev => ((mode === 'video' || mode === 'audio') ? false : (prev ?? true)));
    } finally {
      setCheckingMedia(false);
    }
  };

  const onConsentContinue = () => {
    if (!assignment) return;
    if (!consentAccepted) return;
    try {
      const consentKey = `gdpr-consent:${assignment.id}`;
      if (typeof window !== 'undefined') window.sessionStorage.setItem(consentKey, '1');
    } catch {}
    // Move to media checks if needed, else done
    const needMedia = (cameraCheckEnabled && (mode !== 'text'));
    setGatingStage(needMedia ? 'media' : 'done');
  };

  if (!assignmentId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="mx-auto w-full max-w-3xl px-4 py-10">
          <h1 className="text-2xl font-bold text-gray-900">Missing assignment</h1>
          <p className="mt-2 text-gray-600">No assignment_id provided. Please launch from your dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{assignment?.name || 'Interview'}</h1>
            <p className="text-gray-600 mt-1">
              Assignment: {assignment?.code ?? assignment?.id ?? assignmentId}
              {assignment?.deadline_at ? (
                <span className="ml-2 text-gray-500">• Due {new Date(assignment.deadline_at).toLocaleString()}</span>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{answeredCount}/{conversationHistory.length} answered</span>
            <Button onClick={handleFinish} disabled={!allAnswered || isSubmitting} className="bg-green-600 text-white hover:bg-green-700">
              {isSubmitting ? 'Submitting…' : allAnswered ? 'Finish' : 'Finish (answers pending)'}
            </Button>
          </div>
        </div>

        {submitted ? (
          <div className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-emerald-700">Submission received. Redirecting…</div>
        ) : loading ? (
          <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 text-gray-700">Loading test…</div>
        ) : error ? (
          <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>
        ) : questions.length === 0 ? (
          <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 text-gray-700">No questions configured for this test.</div>
        ) : (
          <div className="mt-6">
            {/* Gating overlays before showing Flashcard */}
            {gatingStage !== 'done' ? (
              <div className="rounded-lg border border-gray-200 bg-white p-6 text-gray-800 space-y-4">
                {gatingStage === 'gdpr' && (
                  <div>
                    <h2 className="text-xl font-semibold mb-2">{t('gdpr.title')}</h2>
                    <div className="space-y-2 text-sm text-gray-700">
                      <p>{t('gdpr.p1')}</p>
                      <p>{t('gdpr.p2')}</p>
                      <h3 className="font-medium mt-2">{t('gdpr.dataTitle')}</h3>
                      <p>{t('gdpr.p3')}</p>
                      <p>{t('gdpr.p4')}</p>
                      <p>{t('gdpr.p5')}</p>
                      <h3 className="font-medium mt-2">{t('gdpr.consentTitle')}</h3>
                      <p>{t('gdpr.p6')}</p>
                      <p>{t('gdpr.p7')}</p>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <input id="gdpr-consent" type="checkbox" className="h-4 w-4" checked={consentAccepted} onChange={(e)=> setConsentAccepted(e.target.checked)} />
                      <label htmlFor="gdpr-consent" className="text-sm">{t('gdpr.checkbox')}</label>
                    </div>
                    <div className="mt-4">
                      <Button onClick={onConsentContinue} disabled={!consentAccepted}>{t('gdpr.continue')}</Button>
                    </div>
                  </div>
                )}
                {gatingStage === 'media' && (
                  <div>
                    <h2 className="text-xl font-semibold mb-1">{t('facecheck.title')}</h2>
                    <p className="text-sm text-gray-600 mb-4">{t('facecheck.description')}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {mode !== 'text' && (
                        <div className="rounded border p-3">
                          <h3 className="text-sm font-medium mb-1">{t('facecheck.camera.title')}</h3>
                          <p className={`text-sm ${cameraOk ? 'text-emerald-600' : cameraOk===false ? 'text-red-600' : 'text-gray-600'}`}>
                            {cameraOk ? t('facecheck.camera.pass') : cameraOk===false ? t('facecheck.camera.fail') : t('common.loading')}
                          </p>
                        </div>
                      )}
                      {(mode === 'video' || mode === 'audio') && (
                        <div className="rounded border p-3">
                          <h3 className="text-sm font-medium mb-1">{t('facecheck.mic.title')}</h3>
                          <p className={`text-sm ${micOk ? 'text-emerald-600' : micOk===false ? 'text-red-600' : 'text-gray-600'}`}>
                            {micOk ? t('facecheck.mic.pass') : micOk===false ? t('facecheck.mic.fail') : t('common.loading')}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <Button variant="secondary" onClick={runMediaChecks} disabled={checkingMedia}>{t('facecheck.retry')}</Button>
                      <Button onClick={()=> setGatingStage('done')} disabled={mode !== 'text' && !(cameraOk && micOk)}>
                        {t('facecheck.start')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Flashcard
              question={conversationHistory[currentQuestionIndex]?.question || formatQuestion(questions[currentQuestionIndex])}
              questionNumber={currentQuestionIndex + 1}
              totalQuestions={conversationHistory.length}
              onAnswerSubmit={handleSubmitAnswer}
              isProcessing={isSaving}
              isVisible={true}
              mode={mode}
              isAnswered={!!conversationHistory[currentQuestionIndex]?.answer}
              onFinishInterview={handleFinish}
              answeredQuestionsCount={answeredCount}
              timeLimitInMinutes={assignment?.total_time_limit_minutes ?? 0}
              questionTimeLimitInMinutes={perQuestionSeconds ? Math.floor(perQuestionSeconds / 60) : 0}
              onTimeUp={handleFinish}
              currentQuestionIndex={currentQuestionIndex}
              setCurrentQuestionIndex={setCurrentQuestionIndex}
              conversationHistory={conversationHistory}
              questionTimes={[]}
              setQuestionTimes={() => {}}
              // Derived from assignment.metadata
              prepTimeSeconds={prepTimeSeconds}
              autoStartRecording={autoStartRecording}
              answerTimeSeconds={answerTimeSeconds}
              reRecordLimit={reRecordLimit}
              ttsEnabled={ttsEnabled}
              ttsVoice={ttsVoice}
            />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function InterviewPage() {
  return (
    <ProtectedRoute allowedRoles={["candidate"]}>
      <Suspense fallback={<div className="p-6 text-gray-600">Loading…</div>}>
        <InterviewClient />
      </Suspense>
    </ProtectedRoute>
  );
}
