'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { apiService, type User } from '@/lib/api-service';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';

type Assignment = {
  id: string;
  user_id: string;
  test_id?: string;
  test_type?: 'JDT'|'SJT'|'CASE';
  status?: 'assigned'|'in_progress'|'completed'|'expired'|string;
  due_date?: string | null;
};

export default function UserUpdatesPanel({ context = 'admin' as 'admin'|'superadmin' }) {
  const { toast } = useToast();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [subsByUser, setSubsByUser] = useState<Map<string, any[]>>(new Map());
  const [search, setSearch] = useState('');
  // Column filters
  const [nameFilter, setNameFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [adminFilter, setAdminFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [uRes, aRes, adminsRes, sRes] = await Promise.all([
          apiService.getUsers({ role: 'candidate', is_active: true, limit: 10000 }),
          apiService.getTestAssignments(),
          apiService.getUsers({ role: 'admin', is_active: true, limit: 10000 }),
          apiService.getSubmissions()
        ]);
        setUsers((uRes.data?.users || []).filter(u => u.role === 'candidate'));
        setAssignments((aRes.data as any[]) as Assignment[] || []);
        setAdmins(adminsRes.data?.users || []);
        // Group submissions by user (candidate)
        const grouped = new Map<string, any[]>();
        const rawSubs = (sRes.data as any[]) || [];
        for (const s of rawSubs) {
          const uid = s.candidate_id || s.user_id || s.candidateId || '';
          if (!uid) continue;
          const list = grouped.get(uid) || [];
          list.push(s);
          grouped.set(uid, list);
        }
        setSubsByUser(grouped);
      } catch (e:any) {
        toast({ variant:'destructive', title:'Failed to load', description: e.message || 'Unknown error' });
      } finally { setLoading(false); }
    })();
  }, [toast]);

  const [admins, setAdmins] = useState<User[]>([]);

  const getAssignedAdmin = (userId: string): User | undefined => {
    const list = byUser.get(userId) || [];
    const a = list.find(x => !!(x as any).admin_id);
    if (!a) return undefined;
    return admins.find(ad => ad.id === (a as any).admin_id);
  };

  const filtered = useMemo(() => {
    // global quick search across key fields + column-level filters
    const q = search.trim().toLowerCase();
    return users
      .filter(u => u.role === 'candidate')
      .filter(u => !q || [u.candidate_name, u.email, u.candidate_id, u.client_name].some(v => (v||'').toLowerCase().includes(q)))
      .filter(u => !nameFilter || (u.candidate_name||'').toLowerCase().includes(nameFilter.toLowerCase()))
      .filter(u => !emailFilter || (u.email||'').toLowerCase().includes(emailFilter.toLowerCase()))
      .filter(u => !companyFilter || (u.client_name||'').toLowerCase().includes(companyFilter.toLowerCase()))
      .filter(u => {
        if (!adminFilter) return true;
        const ad = getAssignedAdmin(u.id);
        return ad ? (ad.candidate_name||ad.email||'').toLowerCase().includes(adminFilter.toLowerCase()) : false;
      });
  }, [users, search, nameFilter, emailFilter, companyFilter, adminFilter, admins, assignments]);

  const byUser = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of assignments) {
      if (!map.has(a.user_id)) map.set(a.user_id, []);
      map.get(a.user_id)!.push(a);
    }
    return map;
  }, [assignments]);

  const computePercent = (userId: string) => {
    const assignmentsList = byUser.get(userId) || [];
    
    // If there are assignments, calculate based on completed / total assigned
    if (assignmentsList.length > 0) {
      const completedCount = assignmentsList.filter(a => (a.status || '').toLowerCase() === 'completed').length;
      return Math.round((completedCount / assignmentsList.length) * 100);
    }
    
    // If no assignments, check submissions to see if user has completed any tests
    const subs = subsByUser.get(userId) || [];
    if (subs.length === 0) return 0;
    
    // Check if any submission has a completed analysis
    const hasCompletedSubmission = subs.some((s:any) => {
      const report = s.analysis_result ?? s.report ?? null;
      const status = (s.status || '').toString().toLowerCase();
      // Consider completed if it has an analysis_result or status is completed
      return !!report || status === 'completed';
    });
    
    // If they have completed submissions but no assignments, show 100%
    // Otherwise 0% (they haven't completed anything)
    return hasCompletedSubmission ? 100 : 0;
  };

  // Removed Generate AI Report action here per requirement

  const basePath = context === 'superadmin' ? '/superadmin' : '/admin';

  return (
    <div className="container mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-center justify-between mb-4">
        <Link href={`${basePath}`} className="text-orange-600 hover:underline text-sm">← Back to Dashboard</Link>
        <Link href="/" className="text-gray-600 hover:underline text-sm">Home</Link>
      </div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">User Updates</h1>
        <p className="text-muted-foreground">Track assigned tests and completion percentage per user.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <Input placeholder="Search users" value={search} onChange={(e)=> setSearch(e.target.value)} />
            <Link href={`${basePath}/submissions`} className="ml-auto">
              <Button variant="outline">Go to Submissions</Button>
            </Link>
          </div>

          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">
                    <div className="flex flex-col">
                      <span>Name</span>
                      <Input placeholder="filter" value={nameFilter} onChange={(e)=> setNameFilter(e.target.value)} className="h-7 text-xs" />
                    </div>
                  </th>
                  <th className="text-left p-2">
                    <div className="flex flex-col">
                      <span>Email</span>
                      <Input placeholder="filter" value={emailFilter} onChange={(e)=> setEmailFilter(e.target.value)} className="h-7 text-xs" />
                    </div>
                  </th>
                  <th className="text-left p-2">
                    <div className="flex flex-col">
                      <span>Company</span>
                      <Input placeholder="filter" value={companyFilter} onChange={(e)=> setCompanyFilter(e.target.value)} className="h-7 text-xs" />
                    </div>
                  </th>
                  <th className="text-left p-2">
                    <div className="flex flex-col">
                      <span>Assigned Admin</span>
                      <Input placeholder="filter" value={adminFilter} onChange={(e)=> setAdminFilter(e.target.value)} className="h-7 text-xs" />
                    </div>
                  </th>
                  <th className="text-left p-2">Assignments</th>
                  <th className="text-left p-2">% Complete</th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td className="p-3" colSpan={5}>Loading...</td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><td className="p-3 text-muted-foreground" colSpan={5}>No users</td></tr>
                )}
                {!loading && filtered.map(u => {
                  const list = byUser.get(u.id) || [];
                  const pct = computePercent(u.id);
                  const assignedAdmin = getAssignedAdmin(u.id);
                  return (
                    <tr key={u.id} className="border-t">
                      <td className="p-2">{u.candidate_name || u.email}</td>
                      <td className="p-2">{u.email}</td>
                      <td className="p-2">{u.client_name || '-'}</td>
                      <td className="p-2">{assignedAdmin ? (assignedAdmin.candidate_name || assignedAdmin.email) : '-'}</td>
                      <td className="p-2">{list.length}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <div className="w-40 h-2 bg-gray-200 rounded">
                            <div className="h-2 bg-green-500 rounded" style={{ width: `${pct}%` }} />
                          </div>
                          <span>{pct}%</span>
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <Link href={`${basePath}/submissions?candidateId=${encodeURIComponent(u.id)}`}>
                            <Button size="sm" variant="outline">View</Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
