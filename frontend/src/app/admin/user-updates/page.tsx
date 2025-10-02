"use client";

import React from 'react';
import { ProtectedRoute } from '@/contexts/auth-context';
import UserUpdatesPanel from '@/components/admin/UserUpdatesPanel';

export default function Page() {
  return (
    <ProtectedRoute allowedRoles={['admin','superadmin']}>
      <UserUpdatesPanel />
    </ProtectedRoute>
  );
}
