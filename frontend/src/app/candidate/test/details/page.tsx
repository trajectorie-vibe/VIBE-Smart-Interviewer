"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/header";
import { ProtectedRoute, useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, FileText, Video, Loader2, ArrowRight, Info } from "lucide-react";
import { motion } from "framer-motion";
import { apiService } from "@/lib/api-service";

interface TestConfig {
  total_questions?: number;
  base_questions?: number;
  total_time_minutes?: number;
  question_time_seconds?: number;
  reading_time_seconds?: number;
  max_attempts?: number;
}

function TestDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  
  const assignmentId = searchParams.get('assignment_id');
  const testType = searchParams.get('test_type');
  
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState<any>(null);
  const [config, setConfig] = useState<TestConfig | null>(null);
  const [attempts, setAttempts] = useState<any[]>([]);

  useEffect(() => {
    loadTestDetails();
  }, [assignmentId]);

  const loadTestDetails = async () => {
    if (!assignmentId) {
      router.push('/candidate');
      return;
    }

    try {
      setLoading(true);
      
      console.log('[Test Details] Loading assignment:', assignmentId);
      
      // Get assignment from my-tests endpoint
      const assignmentsRes = await apiService.getMyAssignments();
      const allAssignments = (assignmentsRes.data as any[]) || [];
      const found = allAssignments.find((a: any) => a.id === assignmentId);
      
      if (!found) {
        console.error('[Test Details] Assignment not found');
        router.push('/candidate');
        return;
      }
      
      console.log('[Test Details] Assignment loaded:', found);
      setAssignment(found);
      
      // If assignment has test_id, fetch the actual test to get question count
      let actualQuestionCount = null;
      if (found.test_id) {
        try {
          const testRes = await apiService.getStructuredTest(found.test_id);
          if (testRes.data) {
            actualQuestionCount = testRes.data.questions?.length || testRes.data.question_count || null;
            console.log('[Test Details] Actual question count from test:', actualQuestionCount);
          }
        } catch (error) {
          console.error('[Test Details] Failed to load test details:', error);
        }
      }
      
      // Use assignment custom_config if available, otherwise use configuration
      const customConfig = found.custom_config || {};
      
      // Set config from assignment data first, then fallback to configuration
      setConfig({
        total_questions: actualQuestionCount || customConfig.total_questions || found.max_questions || null,
        base_questions: customConfig.base_questions || actualQuestionCount || null,
        total_time_minutes: customConfig.total_time_limit_minutes || found.total_time_minutes || 30,
        question_time_seconds: customConfig.answer_time_seconds || 180,
        reading_time_seconds: customConfig.reading_time_seconds || 30,
        max_attempts: found.max_attempts || 3
      });
      
      // Get attempts - handle 404 gracefully if endpoint doesn't exist yet
      try {
        const attemptsRes = await apiService.getTestAttempts({
          user_id: user?.id,
          test_type: found.test_type
        });
        if (attemptsRes.data) {
          setAttempts(attemptsRes.data);
        } else {
          console.log('[Test Details] Test attempts endpoint returned no data, using empty array');
          setAttempts([]);
        }
      } catch (error: any) {
        // Silently handle 404 - the endpoint may not exist yet
        console.log('[Test Details] Test attempts not available (404), using empty array');
        setAttempts([]);
      }
      
    } catch (error) {
      console.error('Failed to load test details:', error);
      router.push('/candidate');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    router.push(`/candidate/test/gdpr?assignment_id=${assignmentId}&test_type=${testType}`);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-white via-orange-50 to-red-50">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-orange-600 mx-auto" />
            <p className="mt-4 text-gray-600">Loading test details...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!assignment || !config) {
    return null;
  }

  const completedAttempts = attempts.filter((a: any) => a.status === 'completed').length;
  const canStart = completedAttempts < (config.max_attempts ?? 3);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-white via-orange-50 to-red-50">
      <Header />
      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8 text-center"
          >
            <h1 className="text-4xl font-bold text-gray-900">
              {testType === 'JDT' ? 'Job Dialogue Test' : testType === 'SJT' ? 'Situational Judgement Test' : 'Assessment'}
            </h1>
            <p className="mt-3 text-lg text-gray-600">
              Review the test details before you begin
            </p>
          </motion.div>

          {/* Test Details Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Card className="border-2 border-orange-200 shadow-xl">
              <CardHeader className="bg-gradient-to-r from-orange-50 to-red-50">
                <CardTitle className="text-2xl font-bold text-gray-900">
                  Test Overview
                </CardTitle>
                <CardDescription className="text-base text-gray-600">
                  Please read the following information carefully
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                {/* Questions */}
                <div className="flex items-start gap-4 p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <div className="p-3 bg-orange-600 rounded-lg">
                    <FileText className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">Total Questions</h3>
                    <p className="text-3xl font-bold text-orange-600">
                      {config.total_questions || config.base_questions || 'Not set'}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      {config.total_questions ? `${config.total_questions} questions in this assessment` : (config.base_questions ? `${config.base_questions} questions in this assessment` : 'Question count will be determined at test start')}
                    </p>
                  </div>
                </div>

                {/* Time */}
                <div className="flex items-start gap-4 p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="p-3 bg-red-600 rounded-lg">
                    <Clock className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">Total Time</h3>
                    <p className="text-3xl font-bold text-red-600">
                      {config.total_time_minutes} mins
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      Reading: {config.reading_time_seconds ?? 30}s per question • Answering: {Math.floor((config.question_time_seconds ?? 180) / 60)}m {(config.question_time_seconds ?? 180) % 60}s
                    </p>
                  </div>
                </div>

                {/* Format */}
                <div className="flex items-start gap-4 p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="p-3 bg-green-600 rounded-lg">
                    <Video className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">Test Format</h3>
                    <p className="text-lg font-semibold text-green-600 mb-1">
                      Video Recording
                    </p>
                    <p className="text-sm text-gray-600">
                      Your responses will be recorded via camera and microphone
                    </p>
                  </div>
                </div>

                {/* Attempts */}
                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg border border-gray-300">
                  <div className="p-3 bg-gray-600 rounded-lg">
                    <Info className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">Attempts Remaining</h3>
                    <p className="text-3xl font-bold text-gray-900">
                      {completedAttempts} / {config.max_attempts ?? 3}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      {canStart ? `You have ${(config.max_attempts ?? 3) - completedAttempts} attempt(s) remaining` : 'No attempts remaining'}
                    </p>
                  </div>
                </div>

                {/* Important Instructions */}
                <div className="p-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg">
                  <h3 className="font-semibold text-yellow-900 mb-2 flex items-center gap-2">
                    <Info className="h-5 w-5" />
                    Important Instructions
                  </h3>
                  <ul className="space-y-2 text-sm text-yellow-800">
                    <li className="flex items-start gap-2">
                      <span className="text-yellow-600 font-bold">•</span>
                      <span>Ensure you are in a quiet, well-lit environment</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-yellow-600 font-bold">•</span>
                      <span>Your camera and microphone must be enabled</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-yellow-600 font-bold">•</span>
                      <span>Once you start, you cannot pause the test</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-yellow-600 font-bold">•</span>
                      <span>All responses are automatically saved</span>
                    </li>
                  </ul>
                </div>

                {/* Next Button */}
                <div className="pt-4">
                  <Button
                    onClick={handleNext}
                    disabled={!canStart}
                    className={`w-full h-14 text-lg font-semibold ${
                      canStart
                        ? 'bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {canStart ? (
                      <>
                        Continue to GDPR Consent
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </>
                    ) : (
                      'Maximum Attempts Reached'
                    )}
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={() => router.push('/candidate')}
                    className="w-full mt-3 h-12"
                  >
                    Back to Dashboard
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </main>
    </div>
  );
}

export default function TestDetailsPage() {
  return (
    <ProtectedRoute allowedRoles={['candidate']}>
      <Suspense fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-orange-600" />
        </div>
      }>
        <TestDetailsContent />
      </Suspense>
    </ProtectedRoute>
  );
}
