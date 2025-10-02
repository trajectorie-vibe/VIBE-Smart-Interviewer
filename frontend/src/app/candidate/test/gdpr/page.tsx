"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/header";
import { ProtectedRoute } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Shield, ArrowRight, Loader2, Lock, Eye, UserCheck } from "lucide-react";
import { motion } from "framer-motion";

function GDPRConsentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const assignmentId = searchParams.get('assignment_id');
  const testType = searchParams.get('test_type');
  
  const [accepted, setAccepted] = useState(false);

  const handleAccept = () => {
    if (!accepted) return;
    router.push(`/candidate/test/camera-check?assignment_id=${assignmentId}&test_type=${testType}`);
  };

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
            <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-600 rounded-full mb-4">
              <Shield className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900">
              Data Privacy & Consent
            </h1>
            <p className="mt-3 text-lg text-gray-600">
              Please review and accept our terms before proceeding
            </p>
          </motion.div>

          {/* GDPR Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Card className="border-2 border-orange-200 shadow-xl">
              <CardHeader className="bg-gradient-to-r from-orange-50 to-red-50">
                <CardTitle className="text-2xl font-bold text-gray-900">
                  Privacy Notice & Terms of Use
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                {/* Key Points */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col items-center text-center p-4 bg-orange-50 rounded-lg border border-orange-200">
                    <div className="p-3 bg-orange-600 rounded-full mb-3">
                      <Lock className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-1">Secure Storage</h3>
                    <p className="text-sm text-gray-600">
                      Your data is encrypted and stored securely
                    </p>
                  </div>
                  
                  <div className="flex flex-col items-center text-center p-4 bg-red-50 rounded-lg border border-red-200">
                    <div className="p-3 bg-red-600 rounded-full mb-3">
                      <Eye className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-1">Limited Access</h3>
                    <p className="text-sm text-gray-600">
                      Only authorized personnel can view your responses
                    </p>
                  </div>
                  
                  <div className="flex flex-col items-center text-center p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="p-3 bg-green-600 rounded-full mb-3">
                      <UserCheck className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-1">GDPR Compliant</h3>
                    <p className="text-sm text-gray-600">
                      We follow all data protection regulations
                    </p>
                  </div>
                </div>

                {/* Terms Text */}
                <div className="p-6 bg-gray-50 rounded-lg border border-gray-300 max-h-96 overflow-y-auto">
                  <h3 className="font-semibold text-gray-900 mb-4 text-lg">
                    Terms & Conditions
                  </h3>
                  
                  <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">1. Data Collection</h4>
                      <p>
                        During this assessment, we will collect the following information:
                      </p>
                      <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                        <li>Video and audio recordings of your responses</li>
                        <li>Text transcriptions of your spoken answers</li>
                        <li>Timing data (reading time, response time, completion time)</li>
                        <li>Device and browser information</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">2. Purpose of Processing</h4>
                      <p>
                        Your data will be used exclusively for:
                      </p>
                      <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                        <li>Assessing your skills and competencies for the role</li>
                        <li>Generating AI-powered analysis and feedback</li>
                        <li>Sharing results with authorized hiring managers</li>
                        <li>Improving our assessment platform (anonymized)</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">3. Data Storage & Security</h4>
                      <p>
                        Your information is stored securely using industry-standard encryption. 
                        We implement administrative, technical, and physical security measures to 
                        protect your data from unauthorized access, disclosure, or destruction.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">4. Data Retention</h4>
                      <p>
                        Your assessment data will be retained for the duration of the hiring process 
                        plus an additional period as required by law or company policy. After this 
                        period, your data will be securely deleted.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">5. Your Rights</h4>
                      <p>
                        Under GDPR and applicable data protection laws, you have the right to:
                      </p>
                      <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                        <li>Access your personal data</li>
                        <li>Correct inaccurate data</li>
                        <li>Request deletion of your data</li>
                        <li>Object to processing</li>
                        <li>Data portability</li>
                        <li>Withdraw consent at any time</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">6. Recording Consent</h4>
                      <p>
                        By proceeding, you explicitly consent to being recorded via video and audio 
                        during this assessment. These recordings will be used solely for the purposes 
                        outlined above.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">7. Third-Party Services</h4>
                      <p>
                        We may use third-party services (such as cloud storage and AI analysis tools) 
                        to process your data. All third-party processors are contractually bound to 
                        comply with GDPR and maintain appropriate security measures.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">8. Contact Information</h4>
                      <p>
                        For any questions regarding data privacy or to exercise your rights, please 
                        contact your hiring organization or administrator.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Consent Checkbox */}
                <div className="p-4 bg-orange-50 border-2 border-orange-400 rounded-lg">
                  <div className="flex items-start gap-4">
                    <Checkbox
                      id="consent"
                      checked={accepted}
                      onCheckedChange={(checked) => setAccepted(checked as boolean)}
                      className="mt-1"
                    />
                    <label
                      htmlFor="consent"
                      className="text-sm font-medium text-gray-900 leading-relaxed cursor-pointer"
                    >
                      I have read and understood the terms and conditions outlined above. 
                      I consent to the collection, processing, and storage of my personal data 
                      (including video and audio recordings) for the purposes described. 
                      I understand that I can withdraw my consent at any time by contacting 
                      the organization.
                    </label>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => router.push('/candidate')}
                    className="flex-1 h-12"
                  >
                    Decline & Exit
                  </Button>
                  
                  <Button
                    onClick={handleAccept}
                    disabled={!accepted}
                    className={`flex-1 h-12 text-lg font-semibold ${
                      accepted
                        ? 'bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    Accept & Continue
                    <ArrowRight className="ml-2 h-5 w-5" />
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

export default function GDPRConsentPage() {
  return (
    <ProtectedRoute allowedRoles={['candidate']}>
      <Suspense fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-orange-600" />
        </div>
      }>
        <GDPRConsentContent />
      </Suspense>
    </ProtectedRoute>
  );
}
