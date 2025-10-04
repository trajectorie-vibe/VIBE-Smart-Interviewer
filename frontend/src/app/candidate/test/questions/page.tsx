"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/header";
import { ProtectedRoute, useAuth } from "@/contexts/auth-context";
import { apiService, type AssignmentSummary } from "@/lib/api-service";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
	Loader2,
	Circle,
	Clock,
	RefreshCcw,
	Save,
	ShieldAlert,
	Video,
	Mic,
	ChevronLeft,
	ChevronRight,
} from "lucide-react";
import RealTimeMediaCapture from "@/components/real-time-audio-recorder";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { InterviewMode } from "@/types";

const DEFAULT_READING_SECONDS = 45;
const DEFAULT_ANSWER_SECONDS = 180;

type Phase =
	| "loading"
	| "reading"
	| "prep"
	| "ready"
	| "recording"
	| "review"
	| "saving"
	| "complete";

interface LoadedQuestion {
	id: string;
	prompt: string;
	readingTime: number;
	answerTime: number;
	competency?: string | null;
}

interface StoredAnswer {
	transcription: string;
	dataUri?: string;
	attemptNumber: number;
}

const formatClock = (value: number) => {
	const safe = Math.max(0, value);
	const minutes = Math.floor(safe / 60);
	const seconds = safe % 60;
	return `${minutes.toString().padStart(2, "0")}:${seconds
		.toString()
		.padStart(2, "0")}`;
};

function QuestionsClient() {
	const router = useRouter();
	const params = useSearchParams();
	const { user } = useAuth();
	const { toast } = useToast();

	const assignmentId = params.get("assignment_id");
	const queryTestType = params.get("test_type") ?? undefined;

	const [assignment, setAssignment] = useState<AssignmentSummary | null>(null);
	const [config, setConfig] = useState<Record<string, any>>({});
	const [questions, setQuestions] = useState<LoadedQuestion[]>([]);
	const [currentIndex, setCurrentIndex] = useState(0);
	const [phase, setPhase] = useState<Phase>("loading");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [attemptId, setAttemptId] = useState<string | null>(null);
	const [submissionId, setSubmissionId] = useState<string | null>(null);
	const [initialWarning, setInitialWarning] = useState<string | null>(null);

	const [readingRemaining, setReadingRemaining] = useState(0);
	const [prepRemaining, setPrepRemaining] = useState(0);
	const [answerRemaining, setAnswerRemaining] = useState(0);
	const [totalTimer, setTotalTimer] = useState(0);

	const [startTrigger, setStartTrigger] = useState<number | undefined>();
	const [stopTrigger, setStopTrigger] = useState<number | undefined>();
	const [currentRecording, setCurrentRecording] = useState<{ blob: Blob; dataUri: string } | null>(null);
	const [liveTranscript, setLiveTranscript] = useState("");
	const [finalTranscript, setFinalTranscript] = useState("");
	const [responses, setResponses] = useState<Record<string, StoredAnswer>>({});

	const readingTimerRef = useRef<NodeJS.Timeout | null>(null);
	const prepTimerRef = useRef<NodeJS.Timeout | null>(null);
	const answerTimerRef = useRef<NodeJS.Timeout | null>(null);
	const totalTimerRef = useRef<NodeJS.Timeout | null>(null);
	const reRecordCountsRef = useRef<Record<string, number>>({});
	const liveTranscriptRef = useRef<string>("");

	const mode: InterviewMode = useMemo(() => {
		const delivered = (assignment?.delivery_mode as InterviewMode) || "video";
		if (delivered === "audio" || delivered === "text") {
			return delivered;
		}
		return "video";
	}, [assignment?.delivery_mode]);

	const autoStartRecording = useMemo(() => config?.auto_start_recording !== false && mode !== "text", [config, mode]);
	const warmupSeconds = useMemo(() => (autoStartRecording ? Number(config?.prep_time_seconds ?? 0) || 0 : 0), [autoStartRecording, config]);
	const reRecordLimit = useMemo(() => {
		const raw = Number(config?.re_record_limit ?? 0);
		return Number.isFinite(raw) && raw > 0 ? raw : 0;
	}, [config]);

	const totalQuestions = questions.length;
	const currentQuestion = questions[currentIndex] ?? null;
	const savedAnswer = currentQuestion ? responses[currentQuestion.id] : undefined;
	const answeredCount = useMemo(() => Object.keys(responses).length, [responses]);
	const progress = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
	const reRecordUsed = currentQuestion ? reRecordCountsRef.current[currentQuestion.id] ?? 0 : 0;

	const clearAllTimers = useCallback(() => {
		if (readingTimerRef.current) {
			clearInterval(readingTimerRef.current);
			readingTimerRef.current = null;
		}
		if (prepTimerRef.current) {
			clearInterval(prepTimerRef.current);
			prepTimerRef.current = null;
		}
		if (answerTimerRef.current) {
			clearInterval(answerTimerRef.current);
			answerTimerRef.current = null;
		}
	}, []);

	const prepareQuestion = useCallback(
		(index: number, options?: { skipReading?: boolean; questionList?: LoadedQuestion[] }) => {
			const list = options?.questionList ?? questions;
			const target = list[index];
			if (!target) {
				return;
			}

			clearAllTimers();
			setCurrentIndex(index);
			const existing = responses[target.id];
			setCurrentRecording(null);
			setLiveTranscript("");
			liveTranscriptRef.current = "";

			if (existing && !options?.skipReading) {
				setPhase("review");
				setReadingRemaining(0);
				setPrepRemaining(0);
				setAnswerRemaining(target.answerTime);
				setFinalTranscript(existing.transcription);
				return;
			}

			if (options?.skipReading) {
				setPhase(autoStartRecording ? (warmupSeconds > 0 ? "prep" : "recording") : "ready");
				setReadingRemaining(0);
				setPrepRemaining(autoStartRecording ? warmupSeconds : 0);
				setAnswerRemaining(target.answerTime);
				setFinalTranscript(existing?.transcription ?? "");
				if (autoStartRecording && warmupSeconds === 0) {
					setStartTrigger(Date.now());
				}
				return;
			}

			setPhase("reading");
			setReadingRemaining(target.readingTime);
			setPrepRemaining(autoStartRecording ? warmupSeconds : 0);
			setAnswerRemaining(target.answerTime);
			setFinalTranscript(existing?.transcription ?? "");
		},
		[autoStartRecording, clearAllTimers, questions, responses, warmupSeconds]
	);

	const bootstrap = useCallback(async () => {
		if (!assignmentId) {
			setError("This assessment link is missing its assignment details.");
			setLoading(false);
			return;
		}

		if (typeof window !== "undefined") {
			const gateKey = `camera-check:${assignmentId}`;
			const passedGate = window.sessionStorage.getItem(gateKey);
			if (!passedGate) {
				router.replace(
					`/candidate/test/camera-check?assignment_id=${assignmentId}` +
						(queryTestType ? `&test_type=${queryTestType}` : "")
				);
				return;
			}
		}

		setLoading(true);
		setError(null);

		try {
			const started = await apiService.startMyAssignment(assignmentId);
			if (started.error || !started.data) {
				throw new Error(started.error || "Unable to start your assignment.");
			}
			const assignmentData = started.data;
			setAssignment(assignmentData);

			const testId = assignmentData.test_id;
			if (!testId) {
				throw new Error("This assignment is not linked to a structured test.");
			}

			let testDetails: any = null;
			// Try to get test details from the list endpoint since getStructuredTest(id) doesn't exist
			const listRes = await apiService.listStructuredTests();
			if (!listRes.error && Array.isArray(listRes.data)) {
				testDetails = listRes.data.find((t: any) => t.id === testId) ?? null;
			}

			const mergedConfig = {
				...(testDetails?.config ?? {}),
				...((assignmentData as any).custom_config ?? {}),
				...((assignmentData as any).metadata ?? {}),
			};
			setConfig(mergedConfig);

			const questionsRes = await apiService.getStructuredTestQuestions(testId);
			if (questionsRes.error || !Array.isArray(questionsRes.data) || questionsRes.data.length === 0) {
				throw new Error(questionsRes.error ?? "No questions were found for this test.");
			}

			const mapped: LoadedQuestion[] = questionsRes.data
				.sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
				.map((q: any, index: number) => {
					// Debug: Log the question data to see what we're receiving
					console.log('[Question Loading] Question', index + 1, ':', {
						type: q.question_type,
						content: q.content,
						name: q.name,
						description: q.description
					});

					// Extract the actual question text from content based on question type
					let promptText = `Question ${index + 1}`;
					if (q.content) {
						if (q.question_type === 'SJT') {
							// For SJT, show labeled sections: SCENARIO: and QUESTION:
							// The correct field names are: scenarioDescription and question
							const scenarioDesc = q.content.scenarioDescription || 
											     q.content.scenario_description || 
											     q.content.scenario || 
											     q.content.scenarioName || // Sometimes just the name
											     '';
							const questionText = q.content.question || 
											     q.content.prompt || 
											     '';
							
							console.log('[SJT Parsing]', { 
								scenarioDesc: scenarioDesc.substring(0, 50), 
								questionText: questionText.substring(0, 50) 
							});
							
							if (scenarioDesc && questionText) {
								promptText = `SCENARIO:\n${scenarioDesc}\n\nQUESTION:\n${questionText}`;
							} else if (scenarioDesc) {
								promptText = `SCENARIO:\n${scenarioDesc}`;
							} else if (questionText) {
								promptText = `QUESTION:\n${questionText}`;
							} else {
								// Ultimate fallback: use the description field
								promptText = `SCENARIO:\n${q.description}`;
							}
						} else if (q.question_type === 'JDT' && q.content.question) {
							promptText = q.content.question;
						} else if (q.question_type === 'CASE' && q.content.prompt) {
							promptText = q.content.prompt;
						} else if (q.content.question_text) {
							promptText = q.content.question_text;
						}
					}
					// Fallback to name or description if content doesn't have the prompt
					if (promptText === `Question ${index + 1}`) {
						promptText = q.name || q.description || q.question_text || q.question || promptText;
					}
					
					console.log('[Question Loading] Final prompt:', promptText.substring(0, 100));
					
					return {
						id: String(q.id ?? q.question_id ?? index),
						prompt: promptText,
						readingTime: Number(q.reading_time_seconds) || DEFAULT_READING_SECONDS,
						answerTime: Number(q.answer_time_seconds) || DEFAULT_ANSWER_SECONDS,
						competency: (Array.isArray(q.competencies) && q.competencies[0]) || q.competency_code || q.assessed_competency || null,
					};
				});

			setQuestions(mapped);
			clearAllTimers();
			setCurrentIndex(0);
			setCurrentRecording(null);
			setLiveTranscript("");
			liveTranscriptRef.current = "";
			setFinalTranscript("");

			if (mapped[0]) {
				setPhase("reading");
				setReadingRemaining(mapped[0].readingTime);
				const shouldAuto = (mergedConfig.auto_start_recording !== false) && mode !== "text";
				const warmup = shouldAuto ? Number(mergedConfig.prep_time_seconds ?? 0) || 0 : 0;
				setPrepRemaining(warmup);
				setAnswerRemaining(mapped[0].answerTime);
				if (shouldAuto && warmup === 0) {
					setStartTrigger(Date.now());
				}
			}

			if (totalTimerRef.current) {
				clearInterval(totalTimerRef.current);
			}
			totalTimerRef.current = setInterval(() => {
				setTotalTimer((prev) => prev + 1);
			}, 1000);

			const testType = (assignmentData as any).test_type ?? queryTestType ?? "JDT";
			const attemptRes = await apiService.createTestAttempt({
				user_id: user?.id ?? "",
				test_type: testType,
				assignment_id: assignmentData.id,
				status: "in_progress",
			});

			if (attemptRes.error) {
				setInitialWarning("We could not create a test attempt record. Your answers will still be saved locally.");
			} else {
				setAttemptId(attemptRes.data?.id ?? null);
			}

			// Create submission for media uploads
			const submissionRes = await apiService.createSubmission({
				candidate_name: (user as any)?.candidate_name ?? user?.email ?? "Unknown",
				candidate_id: (user as any)?.candidate_id ?? user?.id ?? "",
				test_type: testType,
				candidate_language: (user as any)?.preferred_language ?? "en",
				ui_language: (user as any)?.language_code ?? "en",
				conversation_history: [],
			});

			if (submissionRes.error) {
				console.warn("[Bootstrap] Could not create submission:", submissionRes.error);
			} else {
				setSubmissionId(submissionRes.data?.id ?? null);
				console.log("[Bootstrap] ✅ Submission created:", submissionRes.data?.id);
				setInitialWarning(null);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to load your questions.";
			setError(message);
			toast({
				variant: "destructive",
				title: "Unable to begin test",
				description: message,
			});
		} finally {
			setLoading(false);
		}
	}, [assignmentId, clearAllTimers, mode, queryTestType, router, toast, user?.id]);

	const finalizeAssessment = useCallback(async () => {
		try {
			console.log("[Finalize] Marking test as completed...");
			
			// Update test attempt status
			if (attemptId) {
				await apiService.updateTestAttempt(attemptId, { status: "completed" });
				console.log("[Finalize] ✅ Test attempt marked as completed");
			}

			// Update submission status and add conversation history
			if (submissionId) {
				const conversationHistory = Object.entries(responses).map(([questionId, answer], idx) => {
					const q = questions.find(qu => qu.id === questionId);
					return {
						question_id: questionId,
						question: q?.prompt ?? "Unknown question",
						answer: answer.transcription,
						question_index: idx,
						timestamp: new Date().toISOString(),
					};
				});

				await apiService.updateSubmission(submissionId, {
					status: "completed",
					conversation_history: conversationHistory,
					total_questions: totalQuestions,
					base_questions: totalQuestions,
					follow_up_questions: 0,
				});
				console.log("[Finalize] ✅ Submission updated with conversation history");
			}
		} catch (err) {
			console.warn("[Finalize] Failed to update completion status:", err);
		} finally {
			setPhase("complete");
			if (totalTimerRef.current) {
				clearInterval(totalTimerRef.current);
				totalTimerRef.current = null;
			}
			setTimeout(() => {
				const testType = (assignment as any)?.test_type ?? queryTestType;
				router.push(
					`/candidate/test/complete?assignment_id=${assignmentId}` +
						(testType ? `&test_type=${testType}` : "")
				);
			}, 600);
		}
	}, [assignment, assignmentId, attemptId, submissionId, queryTestType, router, responses, questions, totalQuestions]);

	useEffect(() => {
		bootstrap();
	}, [bootstrap]);

	useEffect(() => {
		return () => {
			clearAllTimers();
			if (totalTimerRef.current) {
				clearInterval(totalTimerRef.current);
				totalTimerRef.current = null;
			}
		};
	}, [clearAllTimers]);

	useEffect(() => {
		if (phase !== "reading" || !currentQuestion) {
			return;
		}

		if (readingTimerRef.current) {
			clearInterval(readingTimerRef.current);
		}

		readingTimerRef.current = setInterval(() => {
			setReadingRemaining((prev) => {
				if (prev <= 1) {
					if (readingTimerRef.current) {
						clearInterval(readingTimerRef.current);
						readingTimerRef.current = null;
					}
					if (autoStartRecording) {
						if (warmupSeconds > 0) {
							setPhase("prep");
							setPrepRemaining(warmupSeconds);
						} else {
							setPhase("recording");
							setAnswerRemaining(currentQuestion.answerTime);
							setStartTrigger(Date.now());
						}
					} else {
						setPhase("ready");
					}
					return 0;
				}
				return prev - 1;
			});
		}, 1000);

		return () => {
			if (readingTimerRef.current) {
				clearInterval(readingTimerRef.current);
				readingTimerRef.current = null;
			}
		};
	}, [autoStartRecording, currentQuestion, phase, warmupSeconds]);

	useEffect(() => {
		if (phase !== "prep") {
			return;
		}

		if (prepTimerRef.current) {
			clearInterval(prepTimerRef.current);
		}

		prepTimerRef.current = setInterval(() => {
			setPrepRemaining((prev) => {
				if (prev <= 1) {
					if (prepTimerRef.current) {
						clearInterval(prepTimerRef.current);
						prepTimerRef.current = null;
					}
					if (autoStartRecording && currentQuestion) {
						setPhase("recording");
						setAnswerRemaining(currentQuestion.answerTime);
						setStartTrigger(Date.now());
					} else {
						setPhase("ready");
					}
					return 0;
				}
				return prev - 1;
			});
		}, 1000);

		return () => {
			if (prepTimerRef.current) {
				clearInterval(prepTimerRef.current);
				prepTimerRef.current = null;
			}
		};
	}, [autoStartRecording, currentQuestion, phase]);

	useEffect(() => {
		if (phase !== "recording" || !currentQuestion) {
			return;
		}

		if (answerTimerRef.current) {
			clearInterval(answerTimerRef.current);
		}

		answerTimerRef.current = setInterval(() => {
			setAnswerRemaining((prev) => {
				if (prev <= 1) {
					if (answerTimerRef.current) {
						clearInterval(answerTimerRef.current);
						answerTimerRef.current = null;
					}
					setAnswerRemaining(0);
					setStopTrigger(Date.now());
					return 0;
				}
				return prev - 1;
			});
		}, 1000);

		return () => {
			if (answerTimerRef.current) {
				clearInterval(answerTimerRef.current);
				answerTimerRef.current = null;
			}
		};
	}, [currentQuestion, phase]);

	useEffect(() => {
		if (startTrigger === undefined) {
			return;
		}
		const timer = setTimeout(() => setStartTrigger(undefined), 120);
		return () => clearTimeout(timer);
	}, [startTrigger]);

	useEffect(() => {
		if (stopTrigger === undefined) {
			return;
		}
		const timer = setTimeout(() => setStopTrigger(undefined), 120);
		return () => clearTimeout(timer);
	}, [stopTrigger]);

	const handleRealtimeTranscription = useCallback((value: string) => {
		liveTranscriptRef.current = value;
		setLiveTranscript(value);
		console.log('[Questions Page] Live transcript updated:', value.substring(0, 100) + '...');
	}, []);

	const handleFinalTranscription = useCallback((value: string) => {
		console.log('[Questions Page] Final transcription received:', value.substring(0, 100) + '...');
		if (value.trim()) {
			setFinalTranscript(value.trim());
			// Update the ref as well to ensure it's saved
			liveTranscriptRef.current = value.trim();
		}
	}, []);

	const handleRecordingComplete = useCallback((blob: Blob, dataUri: string) => {
		console.log('[Questions Page] Recording complete');
		setCurrentRecording({ blob, dataUri });
		// Final transcript will be set by handleFinalTranscription callback
		// But ensure we have something from live transcript as fallback
		const captured = liveTranscriptRef.current.trim();
		if (captured && !finalTranscript) {
			console.log('[Questions Page] Using live transcript as fallback');
			setFinalTranscript(captured);
		}
		setPhase("review");
	}, [finalTranscript]);

	const handleRecorderStart = useCallback(() => {
		if (currentQuestion) {
			setAnswerRemaining(currentQuestion.answerTime);
		}
		setPhase("recording");
	}, [currentQuestion]);

	const handleRecorderStopped = useCallback(() => {
		if (phase === "recording") {
			setPhase("review");
		}
		if (answerTimerRef.current) {
			clearInterval(answerTimerRef.current);
			answerTimerRef.current = null;
		}
	}, [phase]);

	const handleRerecord = useCallback(() => {
		if (!currentQuestion) {
			return;
		}

		if (phase === "recording") {
			setStopTrigger(Date.now());
			return;
		}

		if (reRecordLimit > 0) {
			const used = reRecordCountsRef.current[currentQuestion.id] ?? 0;
			if (used >= reRecordLimit) {
				toast({
					variant: "destructive",
					title: "Re-record limit reached",
					description: `You can only re-record ${reRecordLimit} time${reRecordLimit === 1 ? "" : "s"} for this question.`,
				});
				return;
			}
			reRecordCountsRef.current[currentQuestion.id] = used + 1;
		}

		setResponses((prev) => {
			const next = { ...prev };
			delete next[currentQuestion.id];
			return next;
		});
		setCurrentRecording(null);
		setFinalTranscript("");
		setLiveTranscript("");
		liveTranscriptRef.current = "";
		prepareQuestion(currentIndex, { skipReading: true });
	}, [currentIndex, currentQuestion, phase, prepareQuestion, reRecordLimit, toast]);

	const handleSaveAnswer = useCallback(async () => {
		const question = currentQuestion;
		if (!question) {
			return;
		}

		const saved = responses[question.id];
		const transcriptionText = (finalTranscript || liveTranscriptRef.current || saved?.transcription || "").trim();
		if (!transcriptionText) {
			toast({
				variant: "destructive",
				title: "Transcription required",
				description: "We could not capture your answer. Please record your response before continuing.",
			});
			return;
		}

		if (!currentRecording && !saved?.dataUri) {
			toast({
				variant: "destructive",
				title: "Recording required",
				description: "Please record or re-record your answer before continuing.",
			});
			return;
		}

		setPhase("saving");

		try {
			console.log(`[Save Answer] Starting save for question ${currentIndex + 1}/${totalQuestions}`);
			
			// Save answer locally first (immediate feedback)
			const answerData: StoredAnswer = {
				transcription: transcriptionText,
				dataUri: currentRecording?.dataUri ?? saved?.dataUri,
				attemptNumber: (reRecordCountsRef.current[question.id] ?? 0) + 1,
			};
			
			setResponses((prev) => ({
				...prev,
				[question.id]: answerData,
			}));

			// REAL UPLOAD: Upload recording to backend if we have a submission and recording
			if (submissionId && currentRecording) {
				console.log(`[Save Answer] 📤 Uploading media to backend...`);
				
				try {
					// Convert blob to File object
					const fileExtension = currentRecording.blob.type.includes('webm') ? 'webm' : 
										  currentRecording.blob.type.includes('mp4') ? 'mp4' : 
										  currentRecording.blob.type.includes('ogg') ? 'ogg' : 'webm';
					const fileName = `Q${currentIndex + 1}_${mode}.${fileExtension}`;
					const file = new File(
						[currentRecording.blob], 
						fileName,
						{ type: currentRecording.blob.type || 'video/webm' }
					);

					console.log(`[Save Answer] File: ${fileName}, Size: ${(file.size / 1024).toFixed(2)} KB, Type: ${file.type}`);

					// Upload to backend
					const uploadRes = await apiService.uploadSubmissionMedia(
						submissionId,
						file,
						currentIndex,
						mode === 'audio' ? 'audio' : 'video',
						question.id, // scenario_id
						false, // is_follow_up
						0 // follow_up_sequence
					);

					if (uploadRes.error) {
						console.error('[Save Answer] ❌ Upload failed:', uploadRes.error);
						toast({
							variant: "destructive",
							title: "Upload warning",
							description: `Answer saved locally but upload failed: ${uploadRes.error}. Will retry later.`,
						});
					} else {
						console.log('[Save Answer] ✅ Media uploaded successfully:', uploadRes.data);
					}
				} catch (uploadErr) {
					console.error('[Save Answer] ❌ Upload error:', uploadErr);
					toast({
						variant: "destructive",
						title: "Upload warning",
						description: "Answer saved locally but upload failed. Will retry later.",
					});
				}
			} else {
				if (!submissionId) {
					console.warn('[Save Answer] ⚠️ No submission ID - skipping upload');
				}
				if (!currentRecording) {
					console.log('[Save Answer] ℹ️ No new recording - using existing answer');
				}
			}
			
			console.log(`[Save Answer] ✅ Answer saved for question ${question.id}`);
			console.log(`[Save Answer] Transcription length: ${transcriptionText.length} characters`);
			
			// Clear current recording state
			setCurrentRecording(null);
			setFinalTranscript(transcriptionText);
			setLiveTranscript("");
			liveTranscriptRef.current = "";

			// Move to next question or finalize
			if (currentIndex < questions.length - 1) {
				console.log(`[Save Answer] Moving to question ${currentIndex + 2}/${totalQuestions}`);
				prepareQuestion(currentIndex + 1);
			} else {
				console.log(`[Save Answer] All questions answered, finalizing assessment`);
				await finalizeAssessment();
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "We could not save your answer.";
			console.error('[Save Answer] ❌ Error:', err);
			toast({
				variant: "destructive",
				title: "Save failed",
				description: message,
			});
			setPhase("review");
		}
	}, [currentIndex, currentQuestion, currentRecording, finalizeAssessment, prepareQuestion, questions.length, responses, toast, finalTranscript, totalQuestions, submissionId, mode]);

	const handlePrevious = useCallback(() => {
		if (currentIndex === 0) {
			return;
		}
		prepareQuestion(currentIndex - 1);
	}, [currentIndex, prepareQuestion]);

	const canRerecord = !!currentQuestion && (phase === "review" || phase === "ready") && (reRecordLimit === 0 || reRecordUsed < reRecordLimit);
	const hasSavedAnswer = !!savedAnswer;
	const hasNewRecording = !!currentRecording;
	const transcriptionText = (finalTranscript || liveTranscript || savedAnswer?.transcription || "").trim();
	const canSave = phase !== "loading" && phase !== "recording" && phase !== "saving" && transcriptionText.length > 0 && (hasNewRecording || hasSavedAnswer);
	const primaryActionLabel = currentIndex === totalQuestions - 1 ? (hasNewRecording ? "Save & submit" : "Submit assessment") : hasNewRecording ? "Save & continue" : "Continue";

	if (!assignmentId) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-white via-orange-50 to-red-50">
				<Header />
				<main className="mx-auto flex max-w-3xl flex-1 flex-col justify-center px-6 py-12 text-center">
					<ShieldAlert className="mx-auto mb-4 h-12 w-12 text-red-500" />
					<h1 className="text-2xl font-semibold text-gray-900">Missing assignment information</h1>
					<p className="mt-2 text-base text-gray-600">Return to your dashboard and select the assessment again.</p>
				</main>
			</div>
		);
	}

	if (loading) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-white via-orange-50 to-red-50">
				<Header />
				<main className="flex h-full flex-1 items-center justify-center">
					<motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
						<Loader2 className="mx-auto mb-4 h-16 w-16 animate-spin text-orange-600" />
						<p className="text-lg font-medium text-gray-700">Preparing your assessment…</p>
						<p className="text-sm text-gray-500">We&apos;re fetching your assigned questions and verifying prerequisites.</p>
					</motion.div>
				</main>
			</div>
		);
	}

	if (error) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-white via-orange-50 to-red-50">
				<Header />
				<main className="mx-auto flex max-w-3xl flex-1 flex-col justify-center px-6 py-12 text-center">
					<ShieldAlert className="mx-auto mb-4 h-12 w-12 text-red-500" />
					<h1 className="text-2xl font-semibold text-gray-900">We hit a snag</h1>
					<p className="mt-2 text-base text-gray-600">{error}</p>
					<Button onClick={() => bootstrap()} className="mt-6 self-center bg-red-600 hover:bg-red-700">
						Try again
					</Button>
				</main>
			</div>
		);
	}

	if (phase === "complete") {
		return (
			<div className="min-h-screen bg-gradient-to-br from-white via-orange-50 to-red-50">
				<Header />
				<main className="mx-auto flex max-w-3xl flex-1 flex-col justify-center px-6 py-12 text-center">
					<Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-green-600" />
					<h1 className="text-2xl font-semibold text-gray-900">Submitting your assessment</h1>
					<p className="mt-2 text-base text-gray-600">Please hold on while we wrap things up. You&apos;ll be redirected shortly.</p>
				</main>
			</div>
		);
	}

	if (questions.length === 0 || !currentQuestion) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-white via-orange-50 to-red-50">
				<Header />
				<main className="mx-auto flex max-w-3xl flex-1 flex-col justify-center px-6 py-12 text-center">
					<ShieldAlert className="mx-auto mb-4 h-12 w-12 text-red-500" />
					<h1 className="text-2xl font-semibold text-gray-900">No questions available</h1>
					<p className="mt-2 text-base text-gray-600">Please contact your administrator to check the assignment configuration.</p>
				</main>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen flex-col bg-gradient-to-br from-white via-orange-50 to-red-50">
			<Header />
			<main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
				<div className="mx-auto flex max-w-6xl flex-col gap-6">
					<motion.div
						initial={{ opacity: 0, y: -14 }}
						animate={{ opacity: 1, y: 0 }}
						className="rounded-2xl border border-orange-200 bg-white/80 p-6 shadow-sm backdrop-blur"
					>
						<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
							<div>
								<p className="text-sm font-medium uppercase tracking-wider text-orange-600">Assessment progress</p>
								<h1 className="text-2xl font-semibold text-gray-900">
									{assignment?.name || "Structured Interview"}
								</h1>
								<p className="text-sm text-gray-500">
									Question {currentIndex + 1} of {totalQuestions} • {answeredCount} saved
								</p>
							</div>
							<div className="flex items-center gap-2 text-sm text-gray-600">
								<div className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-700">
									Total time: {formatClock(totalTimer)}
								</div>
								<div className="h-10 w-40 overflow-hidden rounded-full bg-gray-200">
									<motion.div
										className="h-full bg-gradient-to-r from-orange-500 to-red-600"
										initial={{ width: 0 }}
										animate={{ width: `${progress}%` }}
										transition={{ duration: 0.6 }}
									/>
								</div>
								<span className="w-12 text-right font-semibold text-gray-700">{progress}%</span>
							</div>
						</div>
						{initialWarning && (
							<div className="mt-4 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
								{initialWarning}
							</div>
						)}
					</motion.div>

					<Card className="border-2 border-red-200/50 bg-white/85 shadow-lg">
						<CardContent className="space-y-4 px-6 py-6 text-center">
							<div className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-700">
								Question {currentIndex + 1}
							</div>
							<div className="text-left text-lg leading-relaxed text-gray-900">
								{currentQuestion.prompt.split("\n").map((line, idx) => (
									<p key={idx} className="mb-3">
										{line.trim()}
									</p>
								))}
							</div>
						</CardContent>
					</Card>

					<div className="grid gap-6 lg:grid-cols-[1.2fr,0.9fr]">
						<Card className="border-2 border-orange-200/60 bg-white/85 shadow-xl">
							<CardContent className="flex flex-col gap-5 px-6 py-6">
								<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
									<div className="flex items-center gap-3">
										<div
											className={cn(
												"flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold",
												phase === "recording"
													? "bg-red-100 text-red-700"
													: phase === "reading"
													? "bg-orange-100 text-orange-700"
													: phase === "review"
													? "bg-green-100 text-green-700"
													: "bg-gray-100 text-gray-600"
											)}
										>
											{phase === "recording" ? <Circle className="h-4 w-4 fill-current" /> : <Clock className="h-4 w-4" />}
										</div>
										<div>
											<p className="text-xs uppercase tracking-wide text-gray-500">Current phase</p>
											<p className="text-base font-semibold text-gray-900">
												{phase === "reading" && "Reading the prompt"}
												{phase === "prep" && "Get ready"}
												{phase === "ready" && "Start recording when ready"}
												{phase === "recording" && "Recording answer"}
												{phase === "review" && "Review answer"}
												{phase === "saving" && "Saving answer"}
												{phase === "complete" && "Assessment complete"}
												{phase === "loading" && "Preparing"}
											</p>
										</div>
									</div>
									<div className="grid grid-cols-3 gap-2 text-center text-sm">
										<div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
											<p className="text-xs font-medium uppercase tracking-wide text-orange-700">Reading</p>
											<p className="text-lg font-semibold text-orange-800">{formatClock(readingRemaining)}</p>
										</div>
										<div className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2">
											<p className="text-xs font-medium uppercase tracking-wide text-purple-700">Warm-up</p>
											<p className="text-lg font-semibold text-purple-800">{formatClock(prepRemaining)}</p>
										</div>
										<div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
											<p className="text-xs font-medium uppercase tracking-wide text-green-700">Answer</p>
											<p className="text-lg font-semibold text-green-800">{formatClock(answerRemaining)}</p>
										</div>
									</div>
								</div>

							<RealTimeMediaCapture
								onRecordingComplete={handleRecordingComplete}
								onRealtimeTranscription={handleRealtimeTranscription}
								onFinalTranscription={handleFinalTranscription}
								isRecordingExternally={phase === "recording"}
								onStartRecording={handleRecorderStart}
								onStopRecording={handleRecorderStopped}
								disabled={phase === "loading" || phase === "reading" || phase === "prep" || phase === "saving" || phase === "complete"}
								captureMode={mode === "text" ? "video" : mode}
								startTrigger={startTrigger}
								stopTrigger={stopTrigger}
							/>								<div className="grid grid-cols-2 gap-3 text-sm text-gray-600">
									<div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
										<Video className="h-4 w-4 text-red-500" />
										<span>{mode === "video" ? "Camera required" : "Camera optional"}</span>
									</div>
									<div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
										<Mic className="h-4 w-4 text-orange-500" />
										<span>{mode === "text" ? "Microphone optional" : "Microphone required"}</span>
									</div>
								</div>
							</CardContent>
						</Card>

						<Card className="border-2 border-red-200/60 bg-white/85 shadow-xl">
							<CardContent className="flex h-full flex-col gap-5 px-6 py-6">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs uppercase tracking-wide text-red-500">Live transcription</p>
										<h2 className="text-lg font-semibold text-gray-900">Captured text</h2>
									</div>
									{reRecordLimit > 0 && (
										<div className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
											Re-records used: {reRecordUsed}/{reRecordLimit}
										</div>
									)}
								</div>
								<div className="flex-1 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-800">
									{transcriptionText ? (
										<p className="whitespace-pre-line">{transcriptionText}</p>
									) : phase === "recording" ? (
										<p className="text-gray-500">We&apos;re transcribing your answer live. Speak clearly and at a steady pace.</p>
									) : (
										<p className="text-gray-400">Your transcription will appear here once you finish recording.</p>
									)}
								</div>
								<div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
									<p className="mb-1 font-semibold text-gray-800">Helpful tips</p>
									<ul className="ml-4 list-disc space-y-1">
										<li>Use the allotted reading time to plan your response before the recording begins.</li>
										<li>If you need another attempt, use the re-record button. Previous takes are replaced when you save.</li>
										<li>Saving will upload your answer; you can review saved questions by navigating with the controls below.</li>
									</ul>
								</div>
							</CardContent>
						</Card>
					</div>

					<div className="rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-sm">
						<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
							<div className="flex flex-wrap items-center gap-2">
								<Button
									size="icon"
									variant="outline"
									className="h-9 w-9"
									onClick={handlePrevious}
									disabled={currentIndex === 0 || phase === "saving"}
								>
									<ChevronLeft className="h-4 w-4" />
								</Button>
								{questions.map((question, idx) => (
									<Button
										key={question.id}
										size="icon"
										variant={idx === currentIndex ? "default" : responses[question.id] ? "outline" : "ghost"}
										className={cn(
											"h-9 w-9",
											idx === currentIndex && "bg-red-600 hover:bg-red-700",
											responses[question.id] && idx !== currentIndex && "border-green-500 text-green-600"
										)}
										onClick={() => prepareQuestion(idx)}
										disabled={phase === "saving"}
									>
										{idx + 1}
									</Button>
								))}
								<Button
									size="icon"
									variant="outline"
									className="h-9 w-9"
									onClick={() => prepareQuestion(Math.min(currentIndex + 1, totalQuestions - 1))}
									disabled={currentIndex === totalQuestions - 1 || phase === "saving"}
								>
									<ChevronRight className="h-4 w-4" />
								</Button>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<Button
									variant="outline"
									onClick={handleRerecord}
									disabled={!canRerecord || phase === "saving"}
									className="border-red-200 text-red-600 hover:bg-red-50"
								>
									<RefreshCcw className="mr-2 h-4 w-4" /> Re-record
								</Button>
								<Button
									onClick={handleSaveAnswer}
									disabled={!canSave}
									className="bg-red-600 text-white hover:bg-red-700"
								>
									<Save className="mr-2 h-4 w-4" /> {primaryActionLabel}
								</Button>
							</div>
						</div>
					</div>
				</div>
			</main>
		</div>
	);
}

export default function QuestionsPage() {
	return (
		<ProtectedRoute allowedRoles={["candidate"]}>
			<Suspense
				fallback={
					<div className="flex min-h-screen items-center justify-center">
						<Loader2 className="h-10 w-10 animate-spin text-orange-600" />
					</div>
				}
			>
				<QuestionsClient />
			</Suspense>
		</ProtectedRoute>
	);
}
