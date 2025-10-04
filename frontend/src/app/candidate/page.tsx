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
    <div className="flex min-h-screen flex-col bg-white text-gray-900">
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-6 py-6">
        <section className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="relative grid gap-6 md:grid-cols-[2fr,1fr] md:items-center"
          >
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium uppercase tracking-wider text-gray-700">
                <Sparkles className="h-3 w-3" /> Dashboard
              </span>
              <h1 className="mt-4 text-pretty text-3xl font-semibold leading-tight text-gray-900">
                {user?.candidate_name ? `Welcome back, ${user.candidate_name}` : `Welcome to your dashboard`}
              </h1>
              <p className="mt-3 max-w-2xl text-base text-gray-600">
                Complete your assignments and track your progress. All your tests and results in one place.
              </p>
            </div>

            <Card className="border-gray-200 bg-white shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm font-semibold text-gray-900">
                  Next Assignment
                  <Badge variant="outline" className="border-gray-300 text-gray-700 bg-gray-50 text-xs">
                    {highlight ? statusLabel(highlight) : 'Queued'}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-gray-600">
                  {highlight?.deadline_at
                    ? `Due ${highlight.relativeDeadline}`
                    : highlight
                      ? 'Ready to start'
                      : 'No assignments available'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 pt-0">
                {highlight ? (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                        <div>
                          <p className="text-xs text-gray-500">Assessment</p>
                          <p className="text-sm font-medium text-gray-900">{highlight.name}</p>
                        </div>
                        <Button
                          variant="default"
                          size="sm"
                          className="flex items-center gap-1 bg-gray-900 text-white hover:bg-gray-800"
                          onClick={() => handleStart(highlight.id)}
                          disabled={highlight.isNotYetOpen}
                        >
                          {highlight.isNotYetOpen ? (
                            <CalendarDays className="h-3 w-3" />
                          ) : (
                            <PlayCircle className="h-3 w-3" />
                          )}
                          {highlight.isNotYetOpen ? 'Soon' : 'Start'}
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                        <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1">
                          <Clock3 className="h-3 w-3" />
                          <span>
                            {highlight.metadata?.estimated_minutes
                              ? `${highlight.metadata.estimated_minutes} min`
                              : highlight.total_time_limit_minutes
                                ? `${highlight.total_time_limit_minutes} min`
                                : 'Self-paced'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1">
                          <Globe2 className="h-3 w-3" />
                          <span className="uppercase">{highlight.language_code ?? 'EN'}</span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Loader2 className="h-3 w-3 animate-spin text-gray-600" />
                    Checking for assignments...
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </section>

        <section id="assignments" className="grid gap-6 md:grid-cols-[2fr,1fr]">
          <Card className="border-gray-200 bg-white shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold text-gray-900">Your Assignments</CardTitle>
              <CardDescription className="text-xs text-gray-600">
                All your assigned tests and assessments
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading && (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                  <Loader2 className="h-3 w-3 animate-spin text-gray-600" /> Loading assignments...
                </div>
              )}
              {!loading && error && (
                <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}
              {!loading && !error && !upcoming.length && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-4 text-center text-xs text-gray-600">
                  No assignments available at the moment
                </div>
              )}
              {!loading && !error && upcoming.map((assignment) => (
                <motion.div
                  key={assignment.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: 0.03 }}
                  className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{assignment.name}</h3>
                      <p className="text-xs text-gray-500">
                        {assignment.test_name ? assignment.test_name : 'Structured interview'}
                      </p>
                    </div>
                    <Badge className={`${statusPalette[assignment.status ?? 'pending'] ?? statusPalette.pending} px-2 py-0.5 text-[10px] font-medium uppercase`}> 
                      {statusLabel(assignment)}
                    </Badge>
                  </div>
                  <div className="grid gap-2 text-xs text-gray-600 md:grid-cols-3">
                    <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1">
                      <CalendarDays className="h-3 w-3" />
                      <span className="text-[11px]">
                        {assignment.open_at
                          ? format(parseISO(assignment.open_at), 'MMM d')
                          : 'TBD'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1">
                      <Clock3 className="h-3 w-3" />
                      <span className="text-[11px]">
                        {assignment.deadline_at
                          ? format(parseISO(assignment.deadline_at), 'MMM d')
                          : 'No deadline'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1">
                      <Globe2 className="h-3 w-3" />
                      <span className="text-[11px] uppercase">{assignment.language_code ?? 'EN'}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="text-[10px] text-gray-500">
                      {assignment.delivery_mode?.toUpperCase?.() ?? 'VIDEO'}
                    </div>
                    <Button
                      variant="default"
                      size="sm"
                      className="bg-gray-900 text-white hover:bg-gray-800 text-xs h-7"
                      onClick={() => handleStart(assignment.id)}
                      disabled={assignment.isNotYetOpen}
                    >
                      {assignment.isNotYetOpen ? (
                        <>
                          <Clock3 className="mr-1 h-3 w-3" />
                          Soon
                        </>
                      ) : (
                        <>
                          <PlayCircle className="mr-1 h-3 w-3" />
                          Start
                        </>
                      )}
                    </Button>
                  </div>
                </motion.div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-gray-200 bg-white shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                <CheckCircle2 className="h-4 w-4 text-green-600" /> Completed
              </CardTitle>
              <CardDescription className="text-xs text-gray-600">
                View your completed assessments
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {completed.length === 0 && !loading ? (
                <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-4 text-center text-xs text-gray-600">
                  Completed tests will appear here
                </p>
              ) : null}
              {completed.map((assignment) => (
                <motion.div
                  key={assignment.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: 0.02 }}
                  className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-900"
                >
                  <p className="text-sm font-medium">{assignment.name}</p>
                  <p className="mt-1 text-[10px] text-green-700">
                    Completed {assignment.deadline_at ? format(parseISO(assignment.deadline_at), 'MMM d, yyyy') : 'recently'}
                  </p>
                  <Button
                    asChild
                    size="sm"
                    className="mt-3 bg-gray-900 text-white hover:bg-gray-800 text-xs h-7 w-full"
                    variant="default"
                  >
                    <Link href={`/report/${assignment.test_id}`}>View Report</Link>
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
