"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/header";
import { useAuth } from "@/contexts/auth-context";
import { apiService, type AssignmentSummary } from "@/lib/api-service";
import AssignedTestCard from "@/components/candidate/assigned-test-card";
import { Info } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isAdmin, isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<AssignmentSummary[] | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      // If user is not authenticated, send to login
      if (!isAuthenticated) {
        router.replace('/login');
        return;
      }
      // If authenticated and admin/superadmin, send to their dashboards
      if (isSuperAdmin) {
        router.replace('/superadmin');
        return;
      }
      if (isAdmin) {
        router.replace('/admin');
        return;
      }
      // Candidate - redirect to candidate dashboard
      router.replace('/candidate');
    }
    load();
    return () => { mounted = false; };
  }, [isAuthenticated, isAdmin, isSuperAdmin, router]);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-5xl px-4 py-8">
          <h1 className="text-3xl font-bold text-gray-900">Your Assignments</h1>
          <p className="text-gray-600 mt-1">Assessments assigned to you by your organization.</p>

          {loading ? (
            <div className="mt-10 flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
            </div>
          ) : !assignments || assignments.length === 0 ? (
            <div className="mt-10 rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
              <Info className="mx-auto h-10 w-10 text-gray-400" />
              <h3 className="mt-3 text-lg font-medium text-gray-900">No assignments yet</h3>
              <p className="mt-1 text-gray-600">Please check back later or contact your administrator.</p>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              {assignments.map((a) => (
                <AssignedTestCard
                  key={a.id}
                  assignmentId={a.id}
                  assignmentCode={a.code}
                  name={a.name}
                  testType={a.delivery_mode}
                  languageCode={a.language_code}
                  allowLanguageSwitch={a.metadata?.allow_language_switch}
                  openAt={a.open_at || null}
                  deadlineAt={a.deadline_at || null}
                  canStart={true}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
