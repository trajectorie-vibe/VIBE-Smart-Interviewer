'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  DownloadCloud,
  LineChart,
  Loader2,
  Sparkles,
  UploadCloud,
  Users,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { apiService } from '@/lib/api-service';
import Header from '@/components/header';
import StatusEventsPanel from '@/components/status/StatusEventsPanel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TestAssignmentManagement from '@/components/admin/TestAssignmentManagement';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface SubmissionRow {
  id: string;
  candidateName: string;
  candidateEmail?: string;
  testType?: string;
  status?: string;
  analysisStatus?: string;
  createdAt?: string;
  completedAt?: string;
  language?: string;
}

const NBSP = '\u00a0';

function mapSubmission(raw: any): SubmissionRow {
  return {
    id: raw.id,
    candidateName: raw.candidate_name ?? raw.candidateName ?? 'Unknown candidate',
    candidateEmail: raw.email ?? raw.candidate_email ?? undefined,
    testType: raw.test_type ?? raw.testType ?? undefined,
    status: raw.status ?? raw.progress_status ?? undefined,
    analysisStatus: raw.analysis_status ?? raw.analysisStatus ?? undefined,
    createdAt: raw.created_at ?? raw.createdAt ?? undefined,
    completedAt: raw.analysis_completed_at ?? raw.completed_at ?? undefined,
    language: raw.ui_language ?? raw.candidate_language ?? undefined,
  };
}

export default function AdminDashboard() {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const tenantScoped = !isSuperAdmin && user?.tenant_id && user.tenant_id !== '00000000-0000-0000-0000-000000000001' ? user.tenant_id : undefined;
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [subsError, setSubsError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [tenantOverride, setTenantOverride] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingSubs(true);
      setSubsError(null);
      const res = await apiService.getSubmissions(tenantScoped ? { tenant_id: tenantScoped } : undefined);
      if (cancelled) return;
      if (res.error) {
        setSubsError(res.error);
        setSubmissions([]);
      } else {
        setSubmissions(Array.isArray(res.data) ? res.data.map(mapSubmission) : []);
      }
      setLoadingSubs(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantScoped]);

  const metrics = useMemo(() => {
    const total = submissions.length;
    const completed = submissions.filter((row) => (row.analysisStatus ?? '').includes('completed')).length;
    const inProgress = submissions.filter((row) => (row.status ?? '').toLowerCase().includes('started')).length;
    const waitingAnalysis = submissions.filter((row) => !row.analysisStatus || row.analysisStatus === 'pending').length;
    return {
      total,
      completed,
      inProgress,
      waitingAnalysis,
    };
  }, [submissions]);

  const uniqueCandidates = useMemo(() => new Set(submissions.map((row) => row.candidateEmail || row.candidateName)).size, [submissions]);

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    const response = await apiService.importUsersCSV(file, isSuperAdmin ? { tenant_id: tenantOverride || undefined } : undefined);
    if (response.error) {
      setUploadResult(response.error);
    } else {
      setUploadResult(`Imported ${response.data?.created ?? 0} users. Skipped ${response.data?.skipped ?? 0}.`);
    }
    setUploading(false);
    event.target.value = '';
  };

  // Removed automatic redirect from /admin to /admin/user-updates

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-10">
        <section className="relative overflow-hidden rounded-3xl border border-orange-200 bg-white p-10 shadow">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="relative z-10 grid gap-6 md:grid-cols-[1.35fr,1fr] md:items-center"
          >
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-orange-700">
                <Sparkles className="h-4 w-4 text-orange-700" /> Real-time hiring operations
              </span>
              <h1 className="mt-6 text-pretty text-4xl font-semibold leading-tight md:text-5xl text-slate-900">
                {user?.client_name ? `${user.client_name} hiring cockpit` : 'Admin control room'}
              </h1>
              <p className="mt-4 max-w-2xl text-lg text-slate-600">
                Monitor live assessments, download AI-backed reports, and keep your candidate pipeline flowing without ever leaving this dashboard.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-slate-700">
                <Badge variant="secondary" className="bg-orange-50 text-orange-700">
                  <LineChart className="mr-1 h-3 w-3 text-orange-700" /> Live analytics
                </Badge>
                <Badge variant="secondary" className="bg-orange-50 text-orange-700">
                  <Users className="mr-1 h-3 w-3 text-orange-700" /> Candidate-first
                </Badge>
              </div>
            </div>
            <Card className="border-orange-200 bg-white">
              <CardHeader>
                <CardTitle className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-500">Snapshot</CardTitle>
                <CardDescription className="text-slate-500">
                  Auto-refreshing view of your interview funnel.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm text-slate-700">
                <div className="flex items-center justify-between rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3">
                  <span className="text-slate-700">Total submissions</span>
                  <span className="text-lg font-semibold text-slate-900">{metrics.total}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3">
                  <span className="text-slate-700">Active candidates</span>
                  <span className="text-lg font-semibold text-slate-900">{uniqueCandidates}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3">
                  <span className="text-slate-700">Waiting for AI analysis</span>
                  <span className="text-lg font-semibold text-slate-900">{metrics.waitingAnalysis}</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </section>

        <section>
          <Tabs defaultValue="submissions" className="w-full">
            <TabsList className="grid w-full grid-cols-3 lg:grid-cols-4">
              <TabsTrigger value="submissions">Submissions</TabsTrigger>
              <TabsTrigger value="live">Live Feed</TabsTrigger>
              <TabsTrigger value="bulk">Bulk Upload</TabsTrigger>
              {isSuperAdmin && <TabsTrigger value="assignments">Assignments</TabsTrigger>}
            </TabsList>

            <TabsContent value="submissions" className="mt-6">
              <Card className="border-orange-200 bg-white">
                <CardHeader className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl text-slate-900">Candidate submissions</CardTitle>
                    <CardDescription className="text-slate-600">
                      Export ready-to-share reports or jump into detailed transcripts.
                    </CardDescription>
                  </div>
                  <Button className="bg-orange-600 text-white hover:bg-orange-700" onClick={() => window.open('/api/v1/submissions/export', '_blank')}>
                    <DownloadCloud className="mr-2 h-4 w-4" /> Export CSV
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loadingSubs ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-slate-700">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading submissions…
                    </div>
                  ) : subsError ? (
                    <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{subsError}</div>
                  ) : (
                    <Table className="text-slate-800">
                      <TableHeader>
                        <TableRow className="border-slate-200">
                          <TableHead className="text-slate-600">Candidate</TableHead>
                          <TableHead className="text-slate-600">Assessment</TableHead>
                          <TableHead className="text-slate-600">Status</TableHead>
                          <TableHead className="text-slate-600">AI analysis</TableHead>
                          <TableHead className="text-slate-600">Created</TableHead>
                          <TableHead className="text-slate-600">Language</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {submissions.slice(0, 12).map((row) => (
                          <TableRow key={row.id} className="border-slate-200">
                            <TableCell className="font-medium text-slate-900">{row.candidateName}</TableCell>
                            <TableCell>{row.testType ?? 'Structured assessment'}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="border-slate-300 text-slate-700">
                                {(row.status ?? 'pending').replace(/_/g, ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={`px-3 py-1 text-xs ${row.analysisStatus?.includes('completed') ? 'bg-emerald-50 text-emerald-700 border border-emerald-300' : 'bg-amber-50 text-amber-700 border border-amber-300'}`}>
                                {row.analysisStatus ?? 'pending'}
                              </Badge>
                            </TableCell>
                            <TableCell>{row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}</TableCell>
                            <TableCell>{row.language?.toUpperCase?.() ?? 'EN'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableCaption className="text-slate-500">
                        Showing latest {Math.min(submissions.length, 12)} submissions.{' '}
                        <Button variant="link" className="text-orange-600" onClick={() => window.open('/admin/submissions', '_blank')}>
                          View full history
                        </Button>
                      </TableCaption>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="live" className="mt-6">
              <StatusEventsPanel title="Live status feed" limit={50} />
            </TabsContent>

            <TabsContent value="bulk" className="mt-6">
              <Card className="border-orange-200 bg-white">
                <CardHeader>
                  <CardTitle className="text-slate-900">Bulk candidate upload</CardTitle>
                  <CardDescription className="text-slate-600">
                    Drop a CSV to create candidate accounts in seconds. We{NBSP}skip duplicates automatically.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isSuperAdmin && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">Tenant ID</label>
                      <Input
                        value={tenantOverride}
                        onChange={(event) => setTenantOverride(event.target.value)}
                        placeholder="Required for superadmin uploads"
                        className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400"
                      />
                    </div>
                  )}
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-dashed border-orange-300 bg-orange-50 px-5 py-4 text-sm text-slate-700 hover:border-orange-400">
                    <div className="flex items-center gap-3">
                      <UploadCloud className="h-5 w-5 text-orange-700" />
                      <div>
                        <p className="font-medium text-slate-900">Upload candidate CSV</p>
                        <p className="text-xs text-slate-600">Headers: email, password, candidate_name, candidate_id, client_name, role</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4" />
                    <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={uploading || (isSuperAdmin && !tenantOverride)} />
                  </label>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    <Button variant="link" className="p-0 text-orange-600" onClick={() => window.open('/templates/candidate-upload.csv', '_blank')}>
                      Download template
                    </Button>
                    {uploading && (
                      <span className="flex items-center gap-2 text-amber-700">
                        <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                      </span>
                    )}
                    {uploadResult && <span className="text-emerald-700">{uploadResult}</span>}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {isSuperAdmin && (
              <TabsContent value="assignments" className="mt-6">
                <TestAssignmentManagement />
              </TabsContent>
            )}
          </Tabs>
        </section>
      </main>
    </div>
  );
}
