'use client';

import React from 'react';
import { ProtectedRoute } from '@/contexts/auth-context';
import AdminReportDetailPage from '@/app/admin/report/[id]/page';

export default function SuperadminReportDetailPage() {
  return (
    <ProtectedRoute allowedRoles={["superadmin"]}>
      <AdminReportDetailPage />
    </ProtectedRoute>
  );
}
