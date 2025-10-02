'use client';

import React from 'react';
import { ProtectedRoute } from '@/contexts/auth-context';
import AdminSubmissionsPage from '@/app/admin/submissions/page';

// Reuse the submissions UI but ensure superadmin routing context/back links are correct.
export default function SuperadminSubmissionsPage() {
  return (
    <ProtectedRoute allowedRoles={["superadmin"]}>
      <AdminSubmissionsPage />
    </ProtectedRoute>
  );
}
