'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, Upload } from 'lucide-react';
import { apiService, type User } from '@/lib/api-service';
import FilterableDataTable from '@/components/common/FilterableDataTable';
import { useToast } from '@/hooks/use-toast';

export default function TestAssignments() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [searchUsers, setSearchUsers] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

  const [tests, setTests] = useState<any[]>([]);
  const [selectedTestId, setSelectedTestId] = useState('');
  const [maxAttempts, setMaxAttempts] = useState<number>(1);
  const [dueDate, setDueDate] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load candidate users and structured tests
  useEffect(() => {
    (async () => {
      const [u, t] = await Promise.all([
        apiService.getUsers({ role: 'candidate', is_active: true, limit: 10000 }),
        apiService.listStructuredTests(),
      ]);
      setUsers(u.data?.users || []);
      setTests((t.data as any[]) || []);
    })();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = searchUsers.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u.candidate_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.candidate_id || '').toLowerCase().includes(q)
    );
  }, [users, searchUsers]);

  const toggleUser = (id: string) => {
    setSelectedUsers(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleAllFiltered = () => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      const ids = filteredUsers.map(u => u.id);
      const all = ids.every(id => next.has(id));
      if (all) ids.forEach(id => next.delete(id)); else ids.forEach(id => next.add(id));
      return next;
    });
  };

  const assign = async () => {
    if (!selectedTestId) { toast({ variant:'destructive', title:'Pick a test' }); return; }
    if (selectedUsers.size === 0) { toast({ variant:'destructive', title:'Pick candidates' }); return; }
    setLoading(true);
    try {
      const res = await apiService.bulkAssignTests({
        user_ids: Array.from(selectedUsers),
        test_id: selectedTestId,
        max_attempts: maxAttempts,
        due_date: dueDate || undefined,
        notes,
      });
      if (res.error) throw new Error(res.error);
      toast({ title: 'Assigned', description: `Created ${res.data?.length || 0} assignments.` });
      setSelectedUsers(new Set());
    } catch (e:any) {
      toast({ variant:'destructive', title:'Failed to assign', description: e.message || 'Unknown error' });
    } finally { setLoading(false); }
  };

  const onUploadCSVClick = () => fileInputRef.current?.click();
  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const res = await apiService.importTestAssignmentsCSV(file, { test_id: selectedTestId || undefined });
      if (res.error) throw new Error(res.error);
      toast({ title: 'Imported', description: `Created ${res.data?.length || 0} assignments from CSV.` });
    } catch (e:any) {
      toast({ variant:'destructive', title:'CSV import failed', description: e.message || 'Unknown error' });
    } finally { setLoading(false); e.target.value = ''; }
  };

  const downloadExport = async () => {
    try {
      const res = await apiService.exportTestAssignmentsCSV();
      if (res.error) throw new Error(res.error);
      const blob = new Blob([res.data?.csv || ''], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'test_assignments.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch (e:any) {
      toast({ variant:'destructive', title:'Export failed', description: e.message || 'Unknown error' });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Assign Structured Tests to Candidates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-sm">Pick Test</Label>
              <select value={selectedTestId} onChange={(e)=> setSelectedTestId(e.target.value)} className="border rounded px-3 py-2 w-full">
                <option value="">-- Select test --</option>
                {tests.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.test_type})</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-sm">Max Attempts</Label>
              <Input type="number" min={1} max={5} value={maxAttempts} onChange={(e)=> setMaxAttempts(parseInt(e.target.value||'1'))} />
            </div>
            <div>
              <Label className="text-sm">Due Date</Label>
              <Input type="datetime-local" value={dueDate} onChange={(e)=> setDueDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-sm">Notes</Label>
            <Input value={notes} onChange={(e)=> setNotes(e.target.value)} placeholder="Optional" />
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={assign} disabled={loading || !selectedTestId || selectedUsers.size===0}>Assign Selected Users</Button>
            <Button variant="secondary" onClick={onUploadCSVClick} disabled={loading}><Upload className="h-4 w-4 mr-1"/> Import CSV</Button>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={onFileChosen} className="hidden" />
            <Button variant="outline" onClick={downloadExport}><Download className="h-4 w-4 mr-1"/> Export CSV</Button>
          </div>

          <div className="mt-4">
            <FilterableDataTable
              rows={users}
              columns={[
                { key: 'candidate_name', header: 'Name' },
                { key: 'email', header: 'Email' },
                { key: 'candidate_id', header: 'ID' },
                { key: 'client_name', header: 'Company' },
              ]}
              getRowId={(u)=> u.id}
              search={searchUsers}
              onSearchChange={setSearchUsers}
              selected={selectedUsers}
              onToggleRow={toggleUser}
              onToggleAllFiltered={toggleAllFiltered}
              emptyText="No candidates found"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CSV Format</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Import requires a CSV with header: identifier. Each row's identifier can be user email or candidate_id.</p>
          <p>If you select a test above, type is inferred; otherwise include a column type with values JDT or SJT.</p>
          <div className="font-mono bg-muted p-2 rounded">identifier\nexample@company.com\nCAND123</div>
        </CardContent>
      </Card>
    </div>
  );
}
