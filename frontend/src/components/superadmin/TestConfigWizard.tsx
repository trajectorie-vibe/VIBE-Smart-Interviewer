"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import FilterableDataTable from '@/components/common/FilterableDataTable';
import { apiService } from '@/lib/api-service';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';

export default function TestConfigWizard({ onOpenQuestionBank }: { onOpenQuestionBank?: () => void }) {
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
  // Company (tenant) selection
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');

  // Step 2: question bank
  const [questions, setQuestions] = useState<any[]>([]);
  const [qSearch, setQSearch] = useState('');
  const [selectedQ, setSelectedQ] = useState<Set<string>>(new Set());
  const [competencyOptions, setCompetencyOptions] = useState<string[]>([]);
  const [selectedCompetencies, setSelectedCompetencies] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newQName, setNewQName] = useState('');
  const [newQDescription, setNewQDescription] = useState('');
  const [newQCompetencies, setNewQCompetencies] = useState<string[]>([]);
  // Structured content fields per type
  const [newQPrompt, setNewQPrompt] = useState('');
  const [newQOptionsCSV, setNewQOptionsCSV] = useState(''); // for SJT multi options
  const [newQPreferredAnswer, setNewQPreferredAnswer] = useState(''); // for JDT preferred
  const [newQRawJSON, setNewQRawJSON] = useState<string>(JSON.stringify({ prompt: 'Describe a time…' }, null, 2));
  const [newQAddToBank, setNewQAddToBank] = useState<boolean>(true);
  // Inline edit modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingQ, setEditingQ] = useState<any | null>(null);
  const [editQName, setEditQName] = useState('');
  const [editQDescription, setEditQDescription] = useState('');
  const [editQCompetencies, setEditQCompetencies] = useState<string[]>([]);
  const [editQContent, setEditQContent] = useState<string>('');

  // Step 3: competency overrides
  const [overrides, setOverrides] = useState<Array<{ competency_code: string; competency_name: string; override_description: string }>>([]);
  const [step4Questions, setStep4Questions] = useState<any[]>([]);

  // Load companies for dropdown
  useEffect(() => {
    (async () => {
      const t = await apiService.getTenants({ is_active: true, limit: 10000 });
      const list = t.data?.tenants || [];
      setCompanies(list.map((x:any) => ({ id: x.id, name: x.name })));
    })();
  }, []);

  useEffect(() => {
    if (step === 2) {
      (async () => {
        const [qRes, cRes] = await Promise.all([
          apiService.listQuestions({ qtype: testType }),
          apiService.listCompetencies(),
        ]);
        setQuestions(qRes.data || []);
        const codes = (cRes.data || []).map((c: any) => c.competency_code).filter(Boolean);
        setCompetencyOptions(codes);
      })();
    }
  }, [step, testType]);

  const compFilteredQ = useMemo(() => {
    let base = questions;
    if (selectedCompetencies.length > 0) {
      base = base.filter((x: any) => {
        const comps: string[] = (x.competencies || []) as string[];
        return selectedCompetencies.every((c) => comps?.includes(c));
      });
    }
    return base;
  }, [questions, selectedCompetencies]);

  const searchFilteredQ = useMemo(() => {
    const q = qSearch.toLowerCase();
    if (!q) return compFilteredQ;
    return compFilteredQ.filter((x) => JSON.stringify(x).toLowerCase().includes(q));
  }, [compFilteredQ, qSearch]);

  const toggleQ = (id: string) => setSelectedQ((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAllQ = () => setSelectedQ((prev) => { const n = new Set(prev); const ids = searchFilteredQ.map((r) => r.id); const all = ids.every(id => n.has(id)); if (all) ids.forEach(id => n.delete(id)); else ids.forEach(id => n.add(id)); return n; });

  const nextFromStep1 = async () => {
    if (!name.trim() || !description.trim()) { toast({ variant:'destructive', title:'Name and description required' }); return; }
    const config = {
      replyMode,
      showReport,
      timeLimitMinutes,
      cameraCheckEnabled,
    };
    const scope = selectedCompanyId ? 'tenant' : 'system';
    const res = await apiService.createStructuredTest({ name, description, test_type: testType, scope, tenant_id: selectedCompanyId || null, config });
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
    const selectedObjs = questions.filter((q) => selectedQ.has(q.id));
    setStep4Questions(selectedObjs);
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
                  <Label className="text-sm">Company</Label>
                  <select className="border rounded px-3 py-2 w-full" value={selectedCompanyId} onChange={(e)=> setSelectedCompanyId(e.target.value)}>
                    <option value="">System (global)</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
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
                  if (onOpenQuestionBank) onOpenQuestionBank(); else router.push('/superadmin?page=question-bank');
                }}>Open Question Bank</Button>
                <Button type="button" onClick={()=> setShowCreateModal(true)}>Create Question</Button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Label className="text-sm">Filter by Competencies</Label>
                <div className="flex items-center gap-2">
                  <select className="border rounded px-2 py-1" onChange={(e)=>{
                    const val = e.target.value;
                    if (!val) return;
                    setSelectedCompetencies((prev)=> prev.includes(val) ? prev : [...prev, val]);
                  }} value="">
                    <option value="">-- add competency --</option>
                    {competencyOptions.map((c)=> (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {selectedCompetencies.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      {selectedCompetencies.map((c)=> (
                        <span key={c} className="px-2 py-1 bg-gray-100 rounded border text-xs flex items-center gap-1">
                          {c}
                          <button className="text-red-600" onClick={()=> setSelectedCompetencies((prev)=> prev.filter(x=> x!==c))}>×</button>
                        </span>
                      ))}
                      <button className="text-xs underline" onClick={()=> setSelectedCompetencies([])}>clear</button>
                    </div>
                  )}
                </div>
              </div>
              <FilterableDataTable
                rows={compFilteredQ}
                columns={[
                  { key: 'question_code', header: 'Code' },
                  { key: 'name', header: 'Name' },
                  { key: 'question_type', header: 'Type' },
                  { key: 'actions', header: 'Actions', render: (row: any) => (
                    <button
                      className="text-orange-600 hover:text-orange-700 inline-flex items-center gap-1"
                      title="Edit"
                      onClick={() => {
                        setEditingQ(row);
                        setEditQName(row.name || '');
                        setEditQDescription(row.description || '');
                        setEditQCompetencies(Array.isArray(row.competencies) ? row.competencies : []);
                        setEditQContent(JSON.stringify(row.content || {}, null, 2));
                        setEditModalOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" /> Edit
                    </button>
                  ) },
                ]}
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

              {showCreateModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded shadow-lg max-w-2xl w-full p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">Create Question ({testType})</div>
                      <button onClick={()=> setShowCreateModal(false)} className="text-gray-500">×</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <Label className="text-sm">Name</Label>
                        <Input value={newQName} onChange={(e)=> setNewQName(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-sm">Competencies</Label>
                        <div className="flex items-center gap-2">
                          <select className="border rounded px-2 py-1 w-full" onChange={(e)=>{
                            const val = e.target.value;
                            if (!val) return;
                            setNewQCompetencies(prev => prev.includes(val) ? prev : [...prev, val]);
                          }} value="">
                            <option value="">-- add competency --</option>
                            {competencyOptions.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                        {newQCompetencies.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap mt-1">
                            {newQCompetencies.map(c => (
                              <span key={c} className="px-2 py-1 bg-gray-100 rounded border text-xs flex items-center gap-1">
                                {c}
                                <button className="text-red-600" onClick={()=> setNewQCompetencies(prev => prev.filter(x => x !== c))}>×</button>
                              </span>
                            ))}
                            <button className="text-xs underline" onClick={()=> setNewQCompetencies([])}>clear</button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm">Description</Label>
                      <Input value={newQDescription} onChange={(e)=> setNewQDescription(e.target.value)} />
                    </div>
                    {testType === 'CASE' ? (
                      <div>
                        <Label className="text-sm">Content JSON</Label>
                        <textarea className="border rounded w-full p-2 font-mono" rows={6} value={newQRawJSON} onChange={(e)=> setNewQRawJSON(e.target.value)} />
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <Label className="text-sm">Prompt / Scenario</Label>
                          <Input value={newQPrompt} onChange={(e)=> setNewQPrompt(e.target.value)} placeholder={testType==='SJT'?'Scenario text':'Question text'} />
                        </div>
                        {testType === 'SJT' ? (
                          <div>
                            <Label className="text-sm">Options (comma separated)</Label>
                            <Input value={newQOptionsCSV} onChange={(e)=> setNewQOptionsCSV(e.target.value)} placeholder="Option A, Option B, Option C" />
                          </div>
                        ) : (
                          <div>
                            <Label className="text-sm">Preferred Answer</Label>
                            <Input value={newQPreferredAnswer} onChange={(e)=> setNewQPreferredAnswer(e.target.value)} placeholder="Ideal answer (JDT)" />
                          </div>
                        )}
                      </div>
                    )}
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={newQAddToBank} onChange={(e)=> setNewQAddToBank(e.target.checked)} />
                      <span>Add to Question Bank</span>
                    </label>
                    <div className="flex gap-2 justify-end">
                      <Button variant="secondary" onClick={()=> setShowCreateModal(false)}>Cancel</Button>
                      <Button onClick={async ()=>{
                        if (!newQName.trim() || !newQDescription.trim()) { toast({ variant:'destructive', title:'Fill required fields' }); return; }
                        let content: any = {};
                        if (testType === 'CASE') {
                          try { content = JSON.parse(newQRawJSON); } catch { toast({ variant:'destructive', title:'Content must be valid JSON' }); return; }
                        } else if (testType === 'SJT') {
                          const options = newQOptionsCSV.split(',').map(s => s.trim()).filter(Boolean);
                          if (!newQPrompt.trim() || options.length === 0) { toast({ variant:'destructive', title:'Provide scenario and at least one option' }); return; }
                          content = { type: 'SJT', scenario: newQPrompt, options };
                        } else { // JDT
                          if (!newQPrompt.trim() || !newQPreferredAnswer.trim()) { toast({ variant:'destructive', title:'Provide question and preferred answer' }); return; }
                          content = { type: 'JDT', question: newQPrompt, preferred_answer: newQPreferredAnswer };
                        }
                        const comps = newQCompetencies;
                        const r = await apiService.createQuestion({
                          name: newQName,
                          description: newQDescription,
                          question_type: testType,
                          competencies: comps,
                          content,
                          scope: newQAddToBank ? 'system' : 'tenant',
                          tenant_id: newQAddToBank ? undefined : (createdTest?.tenant_id || selectedCompanyId || null)
                        });
                        if (r.error) { toast({ variant:'destructive', title:'Failed to create', description: r.error }); return; }
                        const qRes = await apiService.listQuestions({ qtype: testType });
                        const list = qRes.data || [];
                        setQuestions(list);
                        const created = list.find((x:any)=> x.name === newQName);
                        if (created) setSelectedQ((prev)=> new Set(prev).add(created.id));
                        setShowCreateModal(false);
                        setNewQName(''); setNewQDescription(''); setNewQCompetencies([]); setNewQRawJSON(JSON.stringify({ prompt: 'Describe a time…' }, null, 2)); setNewQPrompt(''); setNewQOptionsCSV(''); setNewQPreferredAnswer('');
                        toast({ title:'Question created', description:'Added and selected' });
                      }}>Create</Button>
                    </div>
                  </div>
                </div>
              )}

              {editModalOpen && editingQ && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded shadow-lg max-w-2xl w-full p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">Edit Question</div>
                      <button onClick={()=> setEditModalOpen(false)} className="text-gray-500">×</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <Label className="text-sm">Name</Label>
                        <Input value={editQName} onChange={(e)=> setEditQName(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-sm">Competencies</Label>
                        <div className="flex items-center gap-2">
                          <select className="border rounded px-2 py-1 w-full" onChange={(e)=>{
                            const val = e.target.value; if (!val) return;
                            setEditQCompetencies(prev => prev.includes(val) ? prev : [...prev, val]);
                          }} value="">
                            <option value="">-- add competency --</option>
                            {competencyOptions.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                        {editQCompetencies.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap mt-1">
                            {editQCompetencies.map(c => (
                              <span key={c} className="px-2 py-1 bg-gray-100 rounded border text-xs flex items-center gap-1">
                                {c}
                                <button className="text-red-600" onClick={()=> setEditQCompetencies(prev => prev.filter(x => x !== c))}>×</button>
                              </span>
                            ))}
                            <button className="text-xs underline" onClick={()=> setEditQCompetencies([])}>clear</button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm">Description</Label>
                      <Input value={editQDescription} onChange={(e)=> setEditQDescription(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-sm">Content JSON</Label>
                      <textarea className="border rounded w-full p-2 font-mono" rows={8} value={editQContent} onChange={(e)=> setEditQContent(e.target.value)} />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="secondary" onClick={()=> setEditModalOpen(false)}>Cancel</Button>
                      <Button onClick={async ()=>{
                        if (!editQName.trim()) { toast({ variant:'destructive', title:'Name required' }); return; }
                        let content: any = {};
                        try { content = JSON.parse(editQContent || '{}'); } catch { toast({ variant:'destructive', title:'Content must be valid JSON' }); return; }
                        const res = await apiService.updateQuestion(editingQ.id, {
                          name: editQName,
                          description: editQDescription,
                          competencies: editQCompetencies,
                          content,
                        });
                        if (res.error) { toast({ variant:'destructive', title:'Update failed', description: res.error }); return; }
                        // refresh list and close
                        const qRes = await apiService.listQuestions({ qtype: testType });
                        setQuestions(qRes.data || []);
                        setEditModalOpen(false);
                        toast({ title:'Updated', description:'Question saved' });
                      }}>Save</Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">Add per-test competency description overrides (optional).</div>
              <OverrideEditor overrides={overrides} setOverrides={setOverrides} />
              <div className="flex gap-2">
                <Button variant="secondary" onClick={()=> setStep(2)}>Back</Button>
                <Button onClick={async ()=> { await saveOverrides(); setStep(4); }}>Next: Edit Questions</Button>
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">Review and fine-tune question details.</div>
              <QuestionEditorList items={step4Questions} onChangeItem={async (idx, updates)=> {
                const q = step4Questions[idx];
                const res = await apiService.updateQuestion(q.id, updates);
                if (!res.error) {
                  const next = step4Questions.slice();
                  next[idx] = { ...q, ...updates };
                  setStep4Questions(next);
                }
              }} onRemoveItem={(idx)=>{
                setStep4Questions(step4Questions.filter((_,i)=> i!==idx));
              }} />
              <div className="flex gap-2">
                <Button variant="secondary" onClick={()=> setStep(3)}>Back</Button>
                <Button onClick={()=> toast({ title:'Test saved', description:'Configuration finalized' })}>Finish</Button>
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

function QuestionEditorList({ items, onChangeItem, onRemoveItem }: { items: any[]; onChangeItem: (index:number, updates:any)=>void | Promise<void>; onRemoveItem: (index:number)=>void }) {
  return (
    <div className="space-y-3">
      {items.length === 0 && <div className="text-sm text-muted-foreground">No questions selected.</div>}
      {items.map((q, idx) => (
        <div key={q.id} className="border rounded p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-medium">{q.question_code} · {q.name}</div>
            <button className="text-red-600 text-sm" onClick={()=> onRemoveItem(idx)}>Remove</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <Label className="text-sm">Name</Label>
              <Input defaultValue={q.name} onBlur={(e)=> onChangeItem(idx, { name: e.target.value })} />
            </div>
            <div>
              <Label className="text-sm">Type</Label>
              <select className="border rounded px-2 py-1" defaultValue={q.question_type} onChange={(e)=> onChangeItem(idx, { question_type: e.target.value })}>
                <option value="SJT">SJT</option>
                <option value="JDT">JDT</option>
                <option value="CASE">CASE</option>
              </select>
            </div>
          </div>
          <div>
            <Label className="text-sm">Description</Label>
            <Input defaultValue={q.description || ''} onBlur={(e)=> onChangeItem(idx, { description: e.target.value })} />
          </div>
        </div>
      ))}
    </div>
  );
}
