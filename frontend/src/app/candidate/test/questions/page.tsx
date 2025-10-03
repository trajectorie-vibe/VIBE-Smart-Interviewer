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
import { getSjtFollowUpCount } from "@/lib/config-service";
import type { InterviewMode } from "@/types";
import type { StartAttemptRequest } from "@/types/database";
import type { EvaluateAnswerQualityInput, EvaluateAnswerQualityOutput } from "@/ai/flows/evaluate-answer-quality";

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
	scenarioText?: string | null;
	questionText?: string | null;
	bestResponseRationale?: string | null;
	worstResponseRationale?: string | null;
	/** Identifier for the base question this item belongs to (self for base questions) */
	baseQuestionId?: string;
	/** 1-based numbering of the base question, used for follow-up labeling */
	baseQuestionNumber?: number;
	/** Index of the follow-up (0-based) when this represents a follow-up question */
	followUpIndex?: number;
	isFollowUp?: boolean;
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
	const [initialWarning, setInitialWarning] = useState<string | null>(null);
	const [testType, setTestType] = useState<"SJT" | "JDT" | string | null>(null);
	const [maxFollowUps, setMaxFollowUps] = useState(0);
	const [followUpCounts, setFollowUpCounts] = useState<Record<string, number>>({});
	const [baseQuestionOrder, setBaseQuestionOrder] = useState<Record<string, number>>({});

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
				...(assignmentData.custom_config ?? {}),
				...(assignmentData.metadata ?? {}),
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
					let scenarioDesc: string | null = null;
					let questionText: string | null = null;
					let bestRationale: string | null = null;
					let worstRationale: string | null = null;
					const resolvedId = String(q.id ?? q.question_id ?? q.questionId ?? index);
					if (q.content) {
						if (q.question_type === 'SJT') {
							// For SJT, show labeled sections: SCENARIO: and QUESTION:
							// The correct field names are: scenarioDescription and question
							scenarioDesc =
								q.content.scenarioDescription ||
								q.content.scenario_description ||
								q.content.scenario ||
								q.content.scenarioName ||
								q.content.situation ||
								null;
							questionText =
								q.content.question ||
								q.content.prompt ||
								q.content.questionText ||
								null;
							bestRationale =
								q.content.bestResponseRationale ||
								q.content.best_response_rationale ||
								q.content.best_response ||
								q.content.bestResponse ||
								null;
							worstRationale =
								q.content.worstResponseRationale ||
								q.content.worst_response_rationale ||
								q.content.worst_response ||
								q.content.worstResponse ||
								null;
							
							console.log('[SJT Parsing]', { 
								scenarioDesc: scenarioDesc?.substring(0, 50), 
								questionText: questionText?.substring(0, 50) 
							});
							
							if (scenarioDesc && questionText) {
								promptText = `SCENARIO:\n${scenarioDesc}\n\nQUESTION:\n${questionText}`;
							} else if (scenarioDesc) {
								promptText = `SCENARIO:\n${scenarioDesc}`;
							} else if (questionText) {
								promptText = `QUESTION:\n${questionText}`;
							} else {
								// Ultimate fallback: use the description field
								const fallbackScenario = q.description ?? q.name ?? '';
								promptText = `SCENARIO:\n${fallbackScenario}`;
								scenarioDesc = fallbackScenario || null;
							}
						} else if (q.question_type === 'JDT' && q.content.question) {
							questionText = q.content.question;
							promptText = q.content.question;
						} else if (q.question_type === 'CASE' && q.content.prompt) {
							questionText = q.content.prompt;
							promptText = q.content.prompt;
						} else if (q.content.question_text) {
							questionText = q.content.question_text;
							promptText = q.content.question_text;
						}
					}
					// Fallback to name or description if content doesn't have the prompt
					if (promptText === `Question ${index + 1}`) {
						const fallback = q.name || q.description || q.question_text || q.question || promptText;
						promptText = fallback;
						if (!questionText) {
							questionText = fallback;
						}
					}
					
					console.log('[Question Loading] Final prompt:', promptText.substring(0, 100));
					
					return {
						id: resolvedId,
						prompt: promptText,
						readingTime: Number(q.reading_time_seconds) || DEFAULT_READING_SECONDS,
						answerTime: Number(q.answer_time_seconds) || DEFAULT_ANSWER_SECONDS,
						competency: (Array.isArray(q.competencies) && q.competencies[0]) || q.competency_code || q.assessed_competency || null,
						scenarioText: scenarioDesc,
						questionText,
						bestResponseRationale: bestRationale,
						worstResponseRationale: worstRationale,
						baseQuestionId: resolvedId,
						baseQuestionNumber: index + 1,
						followUpIndex: 0,
						isFollowUp: false,
					};
				});

			const effectiveTestType = (assignmentData.test_type ?? queryTestType ?? "JDT").toUpperCase() as "JDT" | "SJT";
			const roleCategoryHint =
				(assignmentData.metadata?.role_category as string | undefined) ??
				(assignmentData.metadata?.roleCategory as string | undefined) ??
				(mergedConfig.role_category as string | undefined) ??
				(mergedConfig.roleCategory as string | undefined);

			let attemptIdFromServer: string | null = null;
			let attemptWarning: string | null = null;

			try {
				const startPayload: StartAttemptRequest = {
					test_type: effectiveTestType,
				};
				if (roleCategoryHint) {
					startPayload.role_category = roleCategoryHint;
				}

				const attemptRes = await apiService.startTestAttempt(startPayload);
				if (!attemptRes.error && attemptRes.data?.attempt) {
					attemptIdFromServer = attemptRes.data.attempt.id;
					const attemptQuestions = attemptRes.data.questions;
					if (Array.isArray(attemptQuestions) && attemptQuestions.length > 0) {
						const orderMap = new Map<string, number>();
						attemptQuestions.forEach((item: any, idx: number) => {
							const candidates = [
								item?.id,
								item?.question_id,
								item?.questionId,
								item?.question?.id,
								item?.original_question_id,
							];
							const key = candidates.find((value) => value !== undefined && value !== null);
							if (key !== undefined && key !== null) {
								orderMap.set(String(key), idx);
							}
						});
						if (orderMap.size) {
							mapped.sort((a, b) => {
								const aIndex = orderMap.get(a.id);
								const bIndex = orderMap.get(b.id);
								if (aIndex === undefined && bIndex === undefined) return 0;
								if (aIndex === undefined) return 1;
								if (bIndex === undefined) return -1;
								return aIndex - bIndex;
							});
						}
					}
					attemptWarning = null;
				} else {
					attemptWarning =
						attemptRes.error ||
						attemptRes.message ||
						"We could not create a test attempt record. Your answers will still be saved locally.";
				}
			} catch (attemptErr) {
				attemptWarning = attemptErr instanceof Error ? attemptErr.message : null;
				if (!attemptWarning) {
					attemptWarning = "We could not create a test attempt record. Your answers will still be saved locally.";
				}
			}

			setTestType(effectiveTestType);

			if (effectiveTestType === "SJT") {
				const baseOrderMap: Record<string, number> = {};
				const followCountInit: Record<string, number> = {};
				let baseCounter = 0;
				mapped.forEach((question) => {
					const baseId = question.baseQuestionId ?? question.id;
					if (!question.isFollowUp) {
						baseCounter += 1;
						baseOrderMap[baseId] = baseCounter;
						question.baseQuestionNumber = baseCounter;
					}
					if (!(baseId in followCountInit)) {
						followCountInit[baseId] = 0;
					}
				});
				setBaseQuestionOrder(baseOrderMap);
				setFollowUpCounts(followCountInit);

				const numericCandidates = [
					mergedConfig?.follow_up_count,
					mergedConfig?.followUpCount,
					mergedConfig?.aiGeneratedQuestions,
					mergedConfig?.settings?.followUpCount,
					mergedConfig?.settings?.aiGeneratedQuestions,
				];
				const numericValue = numericCandidates.find((value) => typeof value === "number") as number | undefined;
				let computedMaxFollowUps = 0;
				if (typeof numericValue === "number") {
					computedMaxFollowUps = Math.max(0, Math.min(5, Math.floor(numericValue)));
				} else {
					const settingsSource = typeof mergedConfig?.settings === "object" ? mergedConfig.settings : mergedConfig;
					computedMaxFollowUps = getSjtFollowUpCount(settingsSource as any);
				}
				setMaxFollowUps(computedMaxFollowUps);
			} else {
				setBaseQuestionOrder({});
				setFollowUpCounts({});
				setMaxFollowUps(0);
			}

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

			setAttemptId(attemptIdFromServer);
			setInitialWarning(attemptWarning);
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
			if (attemptId) {
				await apiService.updateTestAttempt(attemptId, { status: "completed" });
			}
		} catch (err) {
			console.warn("[Questions] Failed to update attempt status", err);
		} finally {
			setPhase("complete");
			if (totalTimerRef.current) {
				clearInterval(totalTimerRef.current);
				totalTimerRef.current = null;
			}
			const finalTestType = (testType ?? assignment?.metadata?.test_type ?? queryTestType)?.toString();
			setTimeout(() => {
				router.push(
					`/candidate/test/complete?assignment_id=${assignmentId}` +
						(finalTestType ? `&test_type=${finalTestType}` : "")
				);
			}, 600);
		}
	}, [assignment?.metadata?.test_type, assignmentId, attemptId, queryTestType, router, testType]);

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
			// Placeholder upload hook: replace with real upload endpoint when available.
			await new Promise((resolve) => setTimeout(resolve, 750));

			setResponses((prev) => ({
				...prev,
				[question.id]: {
					transcription: transcriptionText,
					dataUri: currentRecording?.dataUri ?? saved?.dataUri,
					attemptNumber: (reRecordCountsRef.current[question.id] ?? 0) + 1,
				},
			}));

			setCurrentRecording(null);
			setFinalTranscript(transcriptionText);
			setLiveTranscript("");
			liveTranscriptRef.current = "";

			let evaluationSummary: EvaluateAnswerQualityOutput | null = null;
			let followUpInserted = false;

			if (testType === "SJT" && maxFollowUps > 0) {
				const baseId = question.baseQuestionId ?? question.id;
				const baseNumber = question.baseQuestionNumber ?? baseQuestionOrder[baseId] ?? currentIndex + 1;
				const currentFollowUpCount = followUpCounts[baseId] ?? 0;
				const scenarioText = question.scenarioText?.trim() || question.prompt;
				const questionText = question.questionText?.trim() || question.prompt;
				const bestResponse = question.bestResponseRationale?.trim();
				const competency = question.competency || "General Competency";

				if (
					currentFollowUpCount < maxFollowUps &&
					scenarioText &&
					questionText &&
					bestResponse
				) {
					toast({
						title: "Evaluating your answer",
						description: "Checking if a follow-up question is needed...",
						duration: 3000,
					});

					try {
						const evaluationPayload: EvaluateAnswerQualityInput = {
							situation: scenarioText,
							question: questionText,
							bestResponseRationale: bestResponse,
							assessedCompetency: competency,
							candidateAnswer: transcriptionText,
							questionNumber: baseNumber,
							followUpCount: currentFollowUpCount,
							maxFollowUps,
						};

						const response = await fetch('/api/ai/evaluate-answer', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify(evaluationPayload),
						});

						if (!response.ok) {
							throw new Error(`Evaluation failed with status ${response.status}`);
						}

						const evaluation: EvaluateAnswerQualityOutput = await response.json();
						evaluationSummary = evaluation;

						if (!evaluation.isComplete && evaluation.followUpQuestion) {
							const newFollowUpIndex = currentFollowUpCount + 1;
							const followUpId = `${baseId}__followup_${newFollowUpIndex}`;
							const followUpQuestionText = evaluation.followUpQuestion.trim();
							const newQuestion: LoadedQuestion = {
								id: followUpId,
								prompt: `SCENARIO:\n${scenarioText}\n\nFOLLOW-UP:\n${followUpQuestionText}`,
								readingTime: question.readingTime,
								answerTime: question.answerTime,
								competency: question.competency,
								scenarioText,
								questionText: followUpQuestionText,
								bestResponseRationale: question.bestResponseRationale,
								worstResponseRationale: question.worstResponseRationale,
								baseQuestionId: baseId,
								baseQuestionNumber: baseNumber,
								followUpIndex: newFollowUpIndex,
								isFollowUp: true,
							};

							const updatedQuestions = [
								...questions.slice(0, currentIndex + 1),
								newQuestion,
								...questions.slice(currentIndex + 1),
							];

							setQuestions(updatedQuestions);
							setFollowUpCounts((prev) => ({ ...prev, [baseId]: newFollowUpIndex }));
							setBaseQuestionOrder((prev) => ({ ...prev, [baseId]: baseNumber }));

							toast({
								title: "Follow-up question generated",
								description: evaluation.rationale,
								duration: 6000,
								className: "bg-green-50 border border-green-200 text-green-800",
							});

							prepareQuestion(currentIndex + 1, { questionList: updatedQuestions });
							followUpInserted = true;
						}
					} catch (error) {
						console.error('Error evaluating answer quality', error);
						toast({
							variant: "destructive",
							title: "Evaluation unavailable",
							description: "We saved your answer but couldn't run the follow-up check.",
						});
					}
				} else if (currentFollowUpCount < maxFollowUps) {
					console.warn('Skipping follow-up evaluation due to missing scenario or rationale', {
						baseId,
						scenarioAvailable: Boolean(scenarioText),
						questionAvailable: Boolean(questionText),
						hasBestResponse: Boolean(bestResponse),
					});
				}
			}

			if (followUpInserted) {
				return;
			}

			if (evaluationSummary) {
				toast({
					title: "Answer recorded",
					description: evaluationSummary.rationale,
					duration: 5000,
					className: "bg-green-50 border border-green-200 text-green-800",
				});
			}

			if (currentIndex < questions.length - 1) {
				prepareQuestion(currentIndex + 1);
			} else {
				await finalizeAssessment();
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "We could not save your answer.";
			toast({
				variant: "destructive",
				title: "Save failed",
				description: message,
			});
			setPhase("review");
		}
	}, [
		baseQuestionOrder,
		currentIndex,
		currentQuestion,
		currentRecording,
		finalTranscript,
		finalizeAssessment,
		followUpCounts,
		maxFollowUps,
		prepareQuestion,
		questions,
		responses,
		testType,
		toast,
	]);

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
	const isSaving = phase === "saving";
	const followUpLetter = currentQuestion?.isFollowUp && (currentQuestion.followUpIndex ?? 0) > 0
		? String.fromCharCode(96 + (currentQuestion.followUpIndex ?? 0))
		: null;
	const questionBadgeLabel = currentQuestion?.isFollowUp && followUpLetter
		? `Follow-up ${currentQuestion.baseQuestionNumber}.${followUpLetter})`
		: `Question ${currentIndex + 1}`;
	const questionBadgeTone = currentQuestion?.isFollowUp ? "bg-purple-100 text-purple-700" : "bg-red-100 text-red-700";

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
							<div className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold", questionBadgeTone)}>
								{questionBadgeLabel}
							</div>
							<div className="space-y-5 text-left text-lg leading-relaxed text-gray-900">
								{(currentQuestion.scenarioText || currentQuestion.questionText) ? (
									<>
										{currentQuestion.isFollowUp && (
											<p className="text-xs font-semibold uppercase tracking-wide text-purple-600">
												Continuing scenario {currentQuestion.baseQuestionNumber}
											</p>
										)}
										{currentQuestion.scenarioText?.trim() && (
											<div className="space-y-2">
												<p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Scenario</p>
												<p className="whitespace-pre-line text-base text-gray-900">
													{currentQuestion.scenarioText.trim()}
												</p>
											</div>
										)}
										{currentQuestion.scenarioText?.trim() && currentQuestion.questionText?.trim() && (
											<div className="border-t border-dotted border-gray-300" />
										)}
										{currentQuestion.questionText?.trim() && (
											<div className="space-y-2">
												<p className="text-xs font-semibold uppercase tracking-wide text-red-600">Question</p>
												<p className="whitespace-pre-line text-base text-gray-900">
													{currentQuestion.questionText.trim()}
												</p>
											</div>
										)}
									</>
								) : (
									<div>
										{currentQuestion.prompt.split("\n").map((line, idx) => (
											<p key={idx} className="mb-3">
												{line.trim()}
											</p>
										))}
									</div>
								)}
								{(currentQuestion.bestResponseRationale?.trim() || currentQuestion.worstResponseRationale?.trim()) && (
									<div className="rounded-xl border border-orange-200/70 bg-orange-50/70 p-4 text-base text-orange-900">
										<p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Response guidance</p>
										<div className="mt-2 space-y-3 text-sm leading-relaxed">
											{currentQuestion.bestResponseRationale?.trim() && (
												<div>
													<p className="font-semibold text-orange-900">Best response rationale</p>
													<p className="mt-1 text-orange-900/90">
														{currentQuestion.bestResponseRationale.trim()}
													</p>
												</div>
											)}
											{currentQuestion.worstResponseRationale?.trim() && (
												<div>
													<p className="font-semibold text-orange-900">Worst response rationale</p>
													<p className="mt-1 text-orange-900/90">
														{currentQuestion.worstResponseRationale.trim()}
													</p>
												</div>
											)}
										</div>
									</div>
								)}
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
								disabled={phase === "loading" || phase === "reading" || phase === "prep" || isSaving}
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
									disabled={currentIndex === 0 || isSaving}
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
										disabled={isSaving}
									>
										{idx + 1}
									</Button>
								))}
								<Button
									size="icon"
									variant="outline"
									className="h-9 w-9"
									onClick={() => prepareQuestion(Math.min(currentIndex + 1, totalQuestions - 1))}
									disabled={currentIndex === totalQuestions - 1 || isSaving}
								>
									<ChevronRight className="h-4 w-4" />
								</Button>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<Button
									variant="outline"
									onClick={handleRerecord}
									disabled={!canRerecord || isSaving}
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
