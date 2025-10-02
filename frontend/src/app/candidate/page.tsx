'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Globe2,
  Loader2,
  PlayCircle,
  Sparkles,
  Target,
} from 'lucide-react';
import { format, formatDistanceToNowStrict, isAfter, isBefore, parseISO } from 'date-fns';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AssignmentSummary, apiService } from '@/lib/api-service';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Header from '@/components/header';

interface HydratedAssignment extends AssignmentSummary {
  isOverdue: boolean;
  isNotYetOpen: boolean;
  relativeDeadline?: string | null;
}

const statusPalette: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 border border-amber-300',
  started: 'bg-blue-100 text-blue-700 border border-blue-300',
  completed: 'bg-emerald-100 text-emerald-700 border border-emerald-300',
  ready: 'bg-orange-100 text-orange-700 border border-orange-300',
};

const NBSP = '\u00a0';

function enhanceAssignment(assignment: AssignmentSummary): HydratedAssignment {
  const openAt = assignment.open_at ? parseISO(assignment.open_at) : null;
  const deadline = assignment.deadline_at ? parseISO(assignment.deadline_at) : null;
  const now = new Date();
  const isNotYetOpen = !!openAt && isAfter(openAt, now);
  const isOverdue = !!deadline && isBefore(deadline, now) && (assignment.status ?? 'pending') !== 'completed';
  let relativeDeadline: string | null = null;
  if (deadline) {
    const diff = formatDistanceToNowStrict(deadline, { addSuffix: true });
    relativeDeadline = diff;
  }
  return {
    ...assignment,
    isOverdue,
    isNotYetOpen,
    relativeDeadline,
  };
}

function statusLabel(assignment: HydratedAssignment): string {
  if (assignment.isNotYetOpen) return 'Opens soon';
  if (assignment.isOverdue && (assignment.status ?? 'pending') !== 'completed') return 'Past due';
  if (!assignment.status) return 'Pending';
  return assignment.status.charAt(0).toUpperCase() + assignment.status.slice(1).replace('_', ' ');
}

export default function CandidateExperience() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<HydratedAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('[Candidate Dashboard] Fetching test assignments...');
      // Get test assignments for the current candidate user
      const assignmentsRes = await apiService.getMyAssignments();
      const myAssignments = (assignmentsRes.data as any[]) || [];
      console.log('[Candidate Dashboard] Received assignments:', myAssignments.length);
      
      // Convert to AssignmentSummary format
      const converted: AssignmentSummary[] = myAssignments.map((a: any) => ({
        id: a.id,
        code: a.test_type,
        name: a.test_type === 'JDT' ? 'Job Dialogue Test' : a.test_type === 'SJT' ? 'Situational Judgement Test' : a.test_type,
        test_name: a.test_type,
        test_id: a.test_id,
        delivery_mode: a.test_type,
        language_code: 'en',
        open_at: a.assigned_at || null,
        deadline_at: a.due_date || null,
        status: a.status || 'pending',
        metadata: a.custom_config || {},
        company_name: user?.client_name || null,
        total_time_limit_minutes: null
      }));
      
      setAssignments(converted.map(enhanceAssignment));
    } catch (err: any) {
      console.error('Failed to fetch assignments:', err);
      setError(err.message || 'Failed to load assignments');
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const highlight = useMemo(() => {
    if (!assignments.length) return null;
    const started = assignments.find((a) => (a.status ?? '').startsWith('started'));
    if (started) return started;
    const ready = assignments
      .filter((a) => !a.isNotYetOpen && (a.status === 'pending' || a.status === 'ready' || !a.status))
      .sort((a, b) => {
        if (a.deadline_at && b.deadline_at) return a.deadline_at.localeCompare(b.deadline_at);
        if (a.deadline_at) return -1;
        if (b.deadline_at) return 1;
        return (a.metadata?.priority as number | undefined ?? 99) - (b.metadata?.priority as number | undefined ?? 99);
      });
    return ready.length ? ready[0] : assignments[0];
  }, [assignments]);

  const upcoming = useMemo(() => assignments.filter((assignment) => !assignment.isNotYetOpen && (assignment.status ?? 'pending') !== 'completed'), [assignments]);
  const completed = useMemo(() => assignments.filter((assignment) => (assignment.status ?? '').toLowerCase().includes('completed')), [assignments]);

  const handleStart = async (assignmentId: string) => {
    // Navigate to test details page
    const assignment = assignments.find(a => a.id === assignmentId);
    if (!assignment) return;
    
    router.push(`/candidate/test/details?assignment_id=${assignmentId}&test_type=${assignment.delivery_mode}`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-white via-orange-50 to-red-50 text-gray-900">
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10">
        <section className="relative overflow-hidden rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-red-50 p-10 shadow-2xl">
          <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-orange-200/40 blur-3xl" />
          <div className="absolute bottom-0 right-0 hidden h-60 w-60 translate-x-24 translate-y-16 rotate-12 rounded-full bg-red-200/40 blur-3xl md:block" />
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="relative grid gap-6 md:grid-cols-[2fr,1fr] md:items-center"
          >
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-orange-700">
                <Sparkles className="h-4 w-4" /> Your hiring story starts here
              </span>
              <h1 className="mt-6 text-pretty text-4xl font-semibold leading-tight text-gray-900 md:text-5xl">
                {user?.candidate_name ? `Welcome back, ${user.candidate_name}.` : `Ready to show what${NBSP}you can do?`}
              </h1>
              <p className="mt-4 max-w-2xl text-lg text-gray-700">
                We stitched every assessment into one seamless journey. Breeze through structured prompts, capture your thinking clearly, and get tailored feedback the moment you finish.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-gray-700">
                <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-orange-300">
                  <Clock3 className="mr-1 h-3 w-3" /> Adaptive pacing
                </Badge>
                <Badge variant="secondary" className="bg-red-100 text-red-700 border-red-300">
                  <Target className="mr-1 h-3 w-3" /> Competency-aligned
                </Badge>
                <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-orange-300">
                  <Globe2 className="mr-1 h-3 w-3" /> Multilingual ready
                </Badge>
              </div>
            </div>

            <Card className="border-orange-200 bg-white/90 backdrop-blur-xl shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base font-medium text-gray-900">
                  Next checkpoint
                  <Badge variant="outline" className="border-orange-300 text-orange-700 bg-orange-50">
                    {highlight ? statusLabel(highlight) : 'Queued'}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-gray-600">
                  {highlight?.deadline_at
                    ? `Submit ${highlight.name} ${highlight.relativeDeadline}`
                    : highlight
                      ? 'Your assignment is ready when you are.'
                      : 'We will notify you when your next assignment unlocks.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                {highlight ? (
                  <>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.34em] text-gray-600">Assessment</p>
                          <p className="text-lg font-medium text-gray-900">{highlight.name}</p>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex items-center gap-2 bg-gradient-to-r from-orange-600 to-red-600 text-white hover:from-orange-700 hover:to-red-700"
                          onClick={() => handleStart(highlight.id)}
                          disabled={highlight.isNotYetOpen}
                        >
                          {highlight.isNotYetOpen ? (
                            <CalendarDays className="h-4 w-4" />
                          ) : (
                            <PlayCircle className="h-4 w-4" />
                          )}
                          {highlight.isNotYetOpen ? 'Opens soon' : 'Resume'}
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm text-gray-700">
                        <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-white px-3 py-2">
                          <Clock3 className="h-4 w-4" />
                          <span>
                            {highlight.metadata?.estimated_minutes
                              ? `${highlight.metadata.estimated_minutes} min`
                              : highlight.total_time_limit_minutes
                                ? `${highlight.total_time_limit_minutes} min`
                                : 'Self-paced'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-white px-3 py-2">
                          <Globe2 className="h-4 w-4" />
                          <span className="uppercase">{highlight.language_code ?? 'EN'}</span>
                        </div>
                      </div>
                    </div>
                    <Button asChild variant="ghost" className="group justify-start gap-2 px-0 text-sm text-gray-600 hover:text-orange-600">
                      <Link href="#assignments">
                        View full assignment list
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </Link>
                    </Button>
                  </>
                ) : (
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin text-orange-600" />
                    Checking for assignments linked to your profile…
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </section>

        <section id="assignments" className="grid gap-6 md:grid-cols-[2fr,1fr]">
          <Card className="border-orange-200 bg-white shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl text-gray-900">Your assignments</CardTitle>
              <CardDescription className="text-sm text-gray-600">
                We organize everything chronologically. Launch from here or preview key details at a glance.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading && (
                <div className="flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-gray-700">
                  <Loader2 className="h-4 w-4 animate-spin text-orange-600" /> Fetching assignments…
                </div>
              )}
              {!loading && error && (
                <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              {!loading && !error && !upcoming.length && (
                <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-6 text-center text-sm text-gray-700">
                  You\u00a0have no assignments right now. We\u00a0will ping you as soon as the next experience unlocks.
                </div>
              )}
              {!loading && !error && upcoming.map((assignment) => (
                <motion.div
                  key={assignment.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: 0.03 }}
                  className="flex flex-col gap-4 rounded-3xl border border-orange-200 bg-white p-5 shadow-lg"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{assignment.name}</h3>
                      <p className="text-sm text-gray-600">
                        {assignment.test_name ? assignment.test_name : 'Structured interview module'}
                      </p>
                    </div>
                    <Badge className={`${statusPalette[assignment.status ?? 'pending'] ?? statusPalette.pending} px-3 py-1 text-xs font-semibold uppercase tracking-wide`}> 
                      {statusLabel(assignment)}
                    </Badge>
                  </div>
                  <div className="grid gap-3 text-sm text-gray-700 md:grid-cols-3">
                    <div className="flex items-center gap-2 rounded-2xl border border-orange-200 bg-orange-50 px-3 py-2">
                      <CalendarDays className="h-4 w-4" />
                      <span>
                        {assignment.open_at
                          ? `Opened ${format(parseISO(assignment.open_at), 'MMM d, h:mm a')}`
                          : 'Opens on assignment'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 rounded-2xl border border-orange-200 bg-orange-50 px-3 py-2">
                      <Clock3 className="h-4 w-4" />
                      <span>
                        {assignment.deadline_at
                          ? `Due ${format(parseISO(assignment.deadline_at), 'MMM d, h:mm a')}`
                          : 'No hard deadline'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 rounded-2xl border border-orange-200 bg-orange-50 px-3 py-2">
                      <Globe2 className="h-4 w-4" />
                      <span className="uppercase">{assignment.language_code ?? 'EN'}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.32em] text-gray-600">
                      <span>Mode: {assignment.delivery_mode?.toUpperCase?.() ?? 'VIDEO'}</span>
                      {assignment.company_name && <span>Company: {assignment.company_name}</span>}
                    </div>
                    <Button
                      variant="outline"
                      className="group border-orange-300 text-orange-700 hover:border-orange-600 hover:bg-gradient-to-r hover:from-orange-600 hover:to-red-600 hover:text-white"
                      onClick={() => handleStart(assignment.id)}
                      disabled={assignment.isNotYetOpen}
                    >
                      {assignment.isNotYetOpen ? (
                        <>
                          <Clock3 className="mr-2 h-4 w-4" />
                          Opens soon
                        </>
                      ) : (
                        <>
                          <PlayCircle className="mr-2 h-4 w-4" />
                          Start now
                        </>
                      )}
                    </Button>
                  </div>
                </motion.div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-orange-200 bg-white shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900">
                <CheckCircle2 className="h-5 w-5 text-green-600" /> Completed
              </CardTitle>
              <CardDescription className="text-gray-600">
                Access reports instantly once an analysis finishes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {completed.length === 0 && !loading ? (
                <p className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-6 text-center text-sm text-gray-600">
                  Your reports will live here when you finish an assessment.
                </p>
              ) : null}
              {completed.map((assignment) => (
                <motion.div
                  key={assignment.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: 0.02 }}
                  className="rounded-2xl border border-green-300 bg-green-50 p-4 text-sm text-green-900"
                >
                  <p className="text-base font-medium">{assignment.name}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.32em] text-green-700">
                    Completed {assignment.deadline_at ? format(parseISO(assignment.deadline_at), 'MMM d, yyyy') : 'recently'}
                  </p>
                  <Button
                    asChild
                    size="sm"
                    className="mt-4 bg-gradient-to-r from-orange-600 to-red-600 text-white hover:from-orange-700 hover:to-red-700"
                    variant="secondary"
                  >
                    <Link href={`/report/${assignment.test_id}`}>Open AI report</Link>
                  </Button>
                </motion.div>
              ))}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
