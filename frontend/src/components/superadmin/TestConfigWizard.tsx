'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import FilterableDataTable from '@/components/common/FilterableDataTable';
import { apiService } from '@/lib/api-service';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export default function TestConfigWizard() {
  const { toast } = useToast();
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Step 1: metadata
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [testType, setTestType] = useState<'SJT'|'JDT'|'CASE'>('SJT');
  const [createdTest, setCreatedTest] = useState<any | null>(null);
  // Step 1b: basic test-level settings to move global controls to superadmin per test
  const [replyMode, setReplyMode] = useState<'video'|'audio'|'text'>('video');
  const [showReport, setShowReport] = useState<boolean>(true);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(0);
  const [cameraCheckEnabled, setCameraCheckEnabled] = useState<boolean>(true);

  // Step 2: question bank
  const [questions, setQuestions] = useState<any[]>([]);
  const [qSearch, setQSearch] = useState('');
  const [selectedQ, setSelectedQ] = useState<Set<string>>(new Set());

  // Step 3: competency overrides
  const [overrides, setOverrides] = useState<Array<{ competency_code: string; competency_name: string; override_description: string }>>([]);

  useEffect(() => {
    if (step === 2) {
      (async () => {
        const res = await apiService.listQuestions({ qtype: testType });
        setQuestions(res.data || []);
      })();
    }
  }, [step, testType]);

  const filteredQ = useMemo(() => {
    const q = qSearch.toLowerCase();
    if (!q) return questions;
    return questions.filter((x) => JSON.stringify(x).toLowerCase().includes(q));
  }, [questions, qSearch]);

  const toggleQ = (id: string) => setSelectedQ((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAllQ = () => setSelectedQ((prev) => { const n = new Set(prev); const ids = filteredQ.map((r) => r.id); const all = ids.every(id => n.has(id)); if (all) ids.forEach(id => n.delete(id)); else ids.forEach(id => n.add(id)); return n; });

  const nextFromStep1 = async () => {
    if (!name.trim() || !description.trim()) { toast({ variant:'destructive', title:'Name and description required' }); return; }
    const config = {
      replyMode,
      showReport,
      timeLimitMinutes,
      cameraCheckEnabled,
    };
    const res = await apiService.createStructuredTest({ name, description, test_type: testType, scope: 'system', config });
    if (res.error) { toast({ variant:'destructive', title:'Failed to create test', description: res.error }); return; }
    setCreatedTest(res.data);
    setStep(2);
  };

  const saveQuestions = async () => {
    if (!createdTest) { toast({ variant:'destructive', title:'Create test first' }); return; }
    const ids = Array.from(selectedQ);
    if (ids.length === 0) { toast({ variant:'destructive', title:'Pick questions' }); return; }
    const res = await apiService.addQuestionsToTest(createdTest.id, ids);
    if (res.error) { toast({ variant:'destructive', title:'Failed to add questions', description: res.error }); return; }
    toast({ title: 'Questions added', description: `${res.data?.length || 0} items` });
    setStep(3);
  };

  const saveOverrides = async () => {
    if (!createdTest) return;
    const filtered = overrides.filter(o => o.competency_code && o.override_description && o.competency_name);
    const res = await apiService.setTestCompetencyOverrides(createdTest.id, filtered);
    if (res.error) { toast({ variant:'destructive', title:'Failed to save overrides', description: res.error }); return; }
    toast({ title: 'Test configured', description: 'Competency overrides saved' });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Test Config Wizard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm">Name</Label>
                  <Input value={name} onChange={(e)=> setName(e.target.value)} placeholder="e.g., Graduate SJT v1" />
                </div>
                <div>
                  <Label className="text-sm">Test Type</Label>
                  <select className="border rounded px-3 py-2 w-full" value={testType} onChange={(e)=> setTestType(e.target.value as any)}>
                    <option value="SJT">SJT</option>
                    <option value="JDT">JDT</option>
                    <option value="CASE">CASE</option>
                  </select>
                </div>
                <div>
                  <Label className="text-sm">Scope</Label>
                  <Input value="system" readOnly />
                </div>
              </div>
              <div>
                <Label className="text-sm">Description</Label>
                <Input value={description} onChange={(e)=> setDescription(e.target.value)} placeholder="Short description" />
              </div>
              {/* Test-level settings owned by superadmin */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm">Reply Mode</Label>
                  <select className="border rounded px-3 py-2 w-full" value={replyMode} onChange={(e)=> setReplyMode(e.target.value as any)}>
                    <option value="video">Video + Audio</option>
                    <option value="audio">Audio Only</option>
                    <option value="text">Text Only</option>
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <input id="showReport" type="checkbox" className="h-4 w-4" checked={showReport} onChange={(e)=> setShowReport(e.target.checked)} />
                  <Label htmlFor="showReport" className="text-sm">Show report to candidate</Label>
                </div>
                <div>
                  <Label className="text-sm">Total Time Limit (minutes)</Label>
                  <Input type="number" value={timeLimitMinutes} onChange={(e)=> setTimeLimitMinutes(parseInt(e.target.value) || 0)} placeholder="0 for no limit" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input id="cameraCheck" type="checkbox" className="h-4 w-4" checked={cameraCheckEnabled} onChange={(e)=> setCameraCheckEnabled(e.target.checked)} />
                <Label htmlFor="cameraCheck" className="text-sm">Require camera readiness check</Label>
              </div>
              <div className="flex gap-2">
                <Button onClick={nextFromStep1}>Next: Select Questions</Button>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Search questions</Label>
                <Input value={qSearch} onChange={(e)=> setQSearch(e.target.value)} placeholder="Search question bank" />
                <Button type="button" variant="outline" onClick={()=> {
                  // Navigate to superadmin Question Bank to add/edit, then user can come back here
                  router.push('/superadmin?page=question-bank');
                }}>Open Question Bank</Button>
              </div>
              <FilterableDataTable
                rows={questions}
                columns={[{ key: 'question_code', header: 'Code' }, { key: 'name', header: 'Name' }, { key: 'question_type', header: 'Type' }]}
                getRowId={(r)=> r.id}
                search={qSearch}
                onSearchChange={setQSearch}
                selected={selectedQ}
                onToggleRow={toggleQ}
                onToggleAllFiltered={toggleAllQ}
                emptyText="No questions"
              />
              <div className="flex gap-2">
                <Button variant="secondary" onClick={()=> setStep(1)}>Back</Button>
                <Button onClick={saveQuestions}>Next: Competency Overrides</Button>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">Add per-test competency description overrides (optional).</div>
              <OverrideEditor overrides={overrides} setOverrides={setOverrides} />
              <div className="flex gap-2">
                <Button variant="secondary" onClick={()=> setStep(2)}>Back</Button>
                <Button onClick={saveOverrides}>Finish</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OverrideEditor({ overrides, setOverrides }: { overrides: Array<{ competency_code: string; competency_name: string; override_description: string }>; setOverrides: (v: any)=>void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const add = () => {
    if (!code || !name || !desc) return;
    setOverrides([...overrides, { competency_code: code, competency_name: name, override_description: desc }]);
    setCode(''); setName(''); setDesc('');
  };

  const remove = (idx: number) => {
    const next = overrides.slice();
    next.splice(idx, 1);
    setOverrides(next);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Input placeholder="Competency code" value={code} onChange={(e)=> setCode(e.target.value)} />
        <Input placeholder="Competency name" value={name} onChange={(e)=> setName(e.target.value)} />
        <Input placeholder="Override description" value={desc} onChange={(e)=> setDesc(e.target.value)} />
      </div>
      <Button size="sm" onClick={add}>Add</Button>
      <div className="border rounded p-2 text-sm">
        {overrides.length === 0 && <div className="text-muted-foreground">No overrides</div>}
        {overrides.map((o, i) => (
          <div key={i} className="flex items-center justify-between py-1 border-b last:border-b-0">
            <div>
              <div className="font-medium">{o.competency_code} · {o.competency_name}</div>
              <div className="text-muted-foreground">{o.override_description}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={()=> remove(i)}>Remove</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
