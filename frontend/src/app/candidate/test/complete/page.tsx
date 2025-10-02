"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/header";
import { ProtectedRoute, useAuth } from "@/contexts/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2, Home, RotateCcw, Trophy, Clock, FileCheck } from "lucide-react";
import { motion } from "framer-motion";
import { apiService } from "@/lib/api-service";
import Confetti from "react-confetti";

function CompleteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  
  const assignmentId = searchParams.get('assignment_id');
  const testType = searchParams.get('test_type');
  
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState<any>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    if (!assignmentId || !testType) {
      router.push('/candidate');
      return;
    }
    
    loadCompletionData();
    
    // Stop confetti after 5 seconds
    const timer = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  const loadCompletionData = async () => {
    console.log('[Complete] Loading completion data...');
    try {
      setLoading(true);

      // Get assignment
      const assignmentsRes = await apiService.getMyAssignments();
      const allAssignments = (assignmentsRes.data as any[]) || [];
      const found = allAssignments.find((a: any) => a.id === assignmentId);
      
      if (!found) {
        console.error('[Complete] Assignment not found');
        router.push('/candidate');
        return;
      }

      console.log('[Complete] Assignment loaded:', found);
      setAssignment(found);

      // Get attempts
      const attemptsRes = await apiService.getTestAttempts({
        user_id: user?.id,
        test_type: found.test_type
      });
      const allAttempts = attemptsRes.data || [];
      console.log('[Complete] Attempts loaded:', allAttempts.length);
      setAttempts(allAttempts);

      setLoading(false);
    } catch (err) {
      console.error('[Complete] Error loading completion data:', err);
      router.push('/candidate');
    }
  };

  const handleRetake = () => {
    console.log('[Complete] Retaking test...');
    router.push(`/candidate/test/details?assignment_id=${assignmentId}&test_type=${testType}`);
  };

  const handleDashboard = () => {
    console.log('[Complete] Returning to dashboard...');
    router.push('/candidate');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-white via-orange-50 to-red-50">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <Loader2 className="h-16 w-16 animate-spin text-orange-600 mx-auto mb-4" />
            <p className="text-xl font-semibold text-gray-700">Loading results...</p>
          </motion.div>
        </main>
      </div>
    );
  }

  if (!assignment) {
    return null;
  }

  const completedAttempts = attempts.filter(a => a.status === 'completed').length;
  const maxAttempts = assignment.max_attempts || 3;
  const canRetake = completedAttempts < maxAttempts;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-white via-orange-50 to-red-50">
      <Header />
      
      {/* Confetti Animation */}
      {showConfetti && (
        <Confetti
          width={typeof window !== 'undefined' ? window.innerWidth : 1920}
          height={typeof window !== 'undefined' ? window.innerHeight : 1080}
          recycle={false}
          numberOfPieces={500}
          gravity={0.3}
        />
      )}
      
      <main className="flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          {/* Success Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ 
              type: "spring",
              stiffness: 260,
              damping: 20,
              delay: 0.1
            }}
            className="flex justify-center mb-8"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-green-200 rounded-full blur-2xl opacity-50 animate-pulse" />
              <div className="relative bg-gradient-to-br from-green-400 to-green-600 p-8 rounded-full">
                <CheckCircle className="h-24 w-24 text-white" />
              </div>
            </div>
          </motion.div>

          {/* Main Message */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="text-center mb-8"
          >
            <h1 className="text-5xl font-bold text-gray-900 mb-4">
              Congratulations! 🎉
            </h1>
            <p className="text-2xl text-gray-700 mb-2">
              You've successfully completed the test
            </p>
            <p className="text-lg text-gray-600">
              {testType === 'JDT' ? 'Job Dialogue Test' : testType === 'SJT' ? 'Situational Judgement Test' : 'Assessment'}
            </p>
          </motion.div>

          {/* Stats Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="grid md:grid-cols-3 gap-6 mb-8"
          >
            <Card className="border-2 border-orange-200 shadow-lg">
              <CardContent className="pt-6 text-center">
                <div className="p-3 bg-orange-100 rounded-full w-fit mx-auto mb-3">
                  <Trophy className="h-8 w-8 text-orange-600" />
                </div>
                <p className="text-sm text-gray-600 mb-1">Attempt Number</p>
                <p className="text-3xl font-bold text-orange-600">
                  {completedAttempts}
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 border-red-200 shadow-lg">
              <CardContent className="pt-6 text-center">
                <div className="p-3 bg-red-100 rounded-full w-fit mx-auto mb-3">
                  <Clock className="h-8 w-8 text-red-600" />
                </div>
                <p className="text-sm text-gray-600 mb-1">Attempts Used</p>
                <p className="text-3xl font-bold text-red-600">
                  {completedAttempts} / {maxAttempts}
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 border-green-200 shadow-lg">
              <CardContent className="pt-6 text-center">
                <div className="p-3 bg-green-100 rounded-full w-fit mx-auto mb-3">
                  <FileCheck className="h-8 w-8 text-green-600" />
                </div>
                <p className="text-sm text-gray-600 mb-1">Status</p>
                <p className="text-xl font-bold text-green-600">
                  Submitted
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Information Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.7 }}
          >
            <Card className="border-2 border-gray-200 shadow-xl">
              <CardContent className="pt-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">What happens next?</h2>
                <ul className="space-y-3 text-gray-700">
                  <li className="flex gap-3">
                    <span className="text-orange-600 font-bold">1.</span>
                    <span>Your responses will be analyzed by our AI system</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-orange-600 font-bold">2.</span>
                    <span>The hiring team will review your performance</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-orange-600 font-bold">3.</span>
                    <span>You'll be notified about the results via email</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-orange-600 font-bold">4.</span>
                    <span>Keep an eye on your inbox for further instructions</span>
                  </li>
                </ul>

                {canRetake && (
                  <div className="mt-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                    <p className="text-orange-900 font-medium">
                      💡 You have {maxAttempts - completedAttempts} attempt(s) remaining. You can retake this test if you'd like to improve your responses.
                    </p>
                  </div>
                )}

                {!canRetake && (
                  <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-gray-700 font-medium">
                      ℹ️ You have used all {maxAttempts} attempts for this test. The hiring team will review your best performance.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.9 }}
            className="mt-8 flex flex-col sm:flex-row gap-4"
          >
            <Button
              onClick={handleDashboard}
              variant="outline"
              size="lg"
              className="flex-1 h-14 text-lg"
            >
              <Home className="mr-2 h-5 w-5" />
              Back to Dashboard
            </Button>
            
            {canRetake ? (
              <Button
                onClick={handleRetake}
                size="lg"
                className="flex-1 h-14 text-lg bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700"
              >
                <RotateCcw className="mr-2 h-5 w-5" />
                Retake Test
              </Button>
            ) : (
              <Button
                disabled
                size="lg"
                className="flex-1 h-14 text-lg bg-gray-300 text-gray-500 cursor-not-allowed"
              >
                <RotateCcw className="mr-2 h-5 w-5" />
                No Attempts Left
              </Button>
            )}
          </motion.div>

          {/* Thank You Note */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.1 }}
            className="mt-12 text-center text-gray-600"
          >
            <p className="text-lg">
              Thank you for taking the time to complete this assessment. We appreciate your effort and wish you the best of luck!
            </p>
          </motion.div>
        </div>
      </main>
    </div>
  );
}

export default function CompletePage() {
  return (
    <ProtectedRoute allowedRoles={['candidate']}>
      <Suspense fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
        </div>
      }>
        <CompleteContent />
      </Suspense>
    </ProtectedRoute>
  );
}
