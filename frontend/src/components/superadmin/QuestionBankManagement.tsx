'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Download, Plus, Upload, Pencil, Trash2, Wand2 } from 'lucide-react';
import FilterableDataTable from '@/components/common/FilterableDataTable';
import CompetencySelect from '@/components/common/CompetencySelect';
import { apiService } from '@/lib/api-service';
import { useToast } from '@/hooks/use-toast';

export default function QuestionBankManagement() {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [qtype, setQtype] = useState<'SJT'|'JDT'|'CASE'|'all'>('all');
  const [competencyFilter, setCompetencyFilter] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
  const res = await apiService.listQuestions({ qtype: qtype === 'all' ? undefined as any : qtype, competencies: competencyFilter.length ? competencyFilter : undefined });
      setItems(res.data || []);
    } catch {
      setItems([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [qtype, competencyFilter.join('|')]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return items;
    return items.filter((x) => JSON.stringify(x).toLowerCase().includes(q));
  }, [items, search]);

  const onImportClick = () => fileRef.current?.click();
  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await apiService.importQuestionsCSV(file, { scope: 'system' });
      if (res.error) throw new Error(res.error);
      toast({ title: 'Import complete', description: `Created ${res.data?.created || 0}, skipped ${res.data?.skipped?.length || 0}` });
      fetchData();
    } catch (e:any) {
      toast({ variant:'destructive', title: 'Import failed', description: e.message || 'Unknown error' });
    } finally { e.target.value = ''; }
  };

  const handleDelete = async (row: any) => {
    if (!confirm('This will permanently delete the question. Continue?')) return;
    try {
      const res = await apiService.deleteQuestion(row.id);
      if ((res as any).error) throw new Error((res as any).error);
      toast({ title: 'Deleted', description: `${row.name} removed` });
      fetchData();
    } catch (e:any) {
      toast({ variant:'destructive', title:'Delete failed', description: e.message || 'Unknown error' });
    }
  };

  const onExport = async () => {
    try {
      const res = await apiService.exportQuestionsCSV();
      if (res.error) throw new Error(res.error);
      const blob = new Blob([res.data?.csv || ''], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'question_bank.csv'; a.click(); URL.revokeObjectURL(url);
    } catch (e:any) {
      toast({ variant:'destructive', title:'Export failed', description: e.message || 'Unknown error' });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Question Bank</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <Label className="text-sm">Search</Label>
              <Input value={search} onChange={(e)=> setSearch(e.target.value)} placeholder="Search by text, code, etc."/>
            </div>
            <div>
              <Label className="text-sm">Type</Label>
              <select value={qtype} onChange={(e)=> setQtype(e.target.value as any)} className="border rounded px-3 py-2 w-full">
                <option value="all">All</option>
                <option value="SJT">SJT</option>
                <option value="JDT">JDT</option>
                <option value="CASE">CASE</option>
              </select>
            </div>
            <div>
              <Label className="text-sm">Competencies</Label>
              <CompetencySelect value={competencyFilter} onChange={setCompetencyFilter} placeholder="Filter by competencies" />
            </div>
            <div className="flex items-end gap-2">
              <Button variant="secondary" onClick={onImportClick}><Upload className="h-4 w-4 mr-1"/> Import CSV</Button>
              <input ref={fileRef} type="file" onChange={onImportFile} accept=".csv,text/csv" className="hidden"/>
              <Button variant="outline" onClick={onExport}><Download className="h-4 w-4 mr-1"/> Export CSV</Button>
            </div>
          </div>
          <FilterableDataTable
            rows={filtered}
            columns={[
              { key: 'question_code', header: 'Code' },
              { key: 'name', header: 'Name' },
              { key: 'question_type', header: 'Type' },
              { key: 'actions', header: 'Actions', render: (r: any) => (
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={()=> setEditing(r)}><Pencil className="h-3 w-3 mr-1"/>Edit</Button>
                  <Button size="sm" variant="destructive" onClick={()=> handleDelete(r)}><Trash2 className="h-3 w-3 mr-1"/>Delete</Button>
                </div>
              )},
            ]}
            getRowId={(r)=> r.id}
            search={search}
            onSearchChange={setSearch}
            emptyText={loading ? 'Loading…' : 'No questions found'}
          />
        </CardContent>
      </Card>

      <CreateQuestionPanel onCreated={fetchData} />
      {editing && (
        <EditQuestionPanel question={editing} onClose={()=> setEditing(null)} onUpdated={fetchData} />
      )}
    </div>
  );
}

function tryPretty(jsonStr: string): { ok: boolean; pretty?: string; error?: string } {
  try {
    const obj = JSON.parse(jsonStr);
    return { ok: true, pretty: JSON.stringify(obj, null, 2) };
  } catch (e:any) {
    return { ok: false, error: e.message };
  }
}

function CreateQuestionPanel({ onCreated }: { onCreated: ()=>void }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [questionType, setQuestionType] = useState<'SJT'|'JDT'|'CASE'>('SJT');
  const [competencies, setCompetencies] = useState<string[]>([]);
  // SJT fields
  const [sjtScenarioName, setSjtScenarioName] = useState('');
  const [sjtScenarioDescription, setSjtScenarioDescription] = useState('');
  const [sjtQuestion, setSjtQuestion] = useState('');
  const [sjtBestRationale, setSjtBestRationale] = useState('');
  const [sjtWorstRationale, setSjtWorstRationale] = useState('');
  // JDT fields
  const [jdtRoleName, setJdtRoleName] = useState('');
  const [jdtJobDescription, setJdtJobDescription] = useState('');
  const [jdtAiGuidance, setJdtAiGuidance] = useState('');
  const [jdtQuestions, setJdtQuestions] = useState<string[]>(['']);
  const [jdtPreferredAnswer, setJdtPreferredAnswer] = useState('');
  const [jdtCompetency, setJdtCompetency] = useState<string[]>([]);
  // Advanced JSON fallback (hidden unless CASE)
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || !description.trim()) { toast({ variant:'destructive', title: 'Fill all required fields' }); return; }
    if (competencies.length === 0 && questionType !== 'JDT') { toast({ variant:'destructive', title: 'Select at least one competency' }); return; }
    setSaving(true);
    try {
      let payloadContent: any = {};
      let comps = competencies;
      if (questionType === 'SJT') {
        payloadContent = {
          scenarioName: sjtScenarioName,
          scenarioDescription: sjtScenarioDescription,
          question: sjtQuestion,
          bestResponseRationale: sjtBestRationale,
          worstResponseRationale: sjtWorstRationale,
        };
      } else if (questionType === 'JDT') {
        if (jdtQuestions.filter(q=>q.trim()).length === 0) { throw new Error('Add at least one question'); }
        payloadContent = {
          roleName: jdtRoleName,
          jobDescription: jdtJobDescription,
          aiGuidance: jdtAiGuidance,
          questions: jdtQuestions.filter(Boolean),
          preferredAnswerCharacteristics: jdtPreferredAnswer,
        };
        comps = jdtCompetency;
        if (comps.length === 0) { throw new Error('Select competency assessed'); }
      } else {
        // CASE: use raw JSON content if any
        payloadContent = content ? JSON.parse(content) : {};
      }
      const res = await apiService.createQuestion({ name, description, question_type: questionType, competencies: comps, content: payloadContent, scope: 'system' });
      if (res.error) throw new Error(res.error);
      toast({ title: 'Question created', description: `Added ${name}` });
      setName(''); setDescription(''); setCompetencies([]);
      setSjtScenarioName(''); setSjtScenarioDescription(''); setSjtQuestion(''); setSjtBestRationale(''); setSjtWorstRationale('');
      setJdtRoleName(''); setJdtJobDescription(''); setJdtAiGuidance(''); setJdtQuestions(['']); setJdtPreferredAnswer(''); setJdtCompetency([]);
      onCreated();
    } catch (e:any) {
      toast({ variant:'destructive', title: 'Create failed', description: e.message || 'Unknown error' });
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4"/> Add Question</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <Label className="text-sm">Name</Label>
            <Input value={name} onChange={(e)=> setName(e.target.value)} placeholder="Question name"/>
          </div>
          <div>
            <Label className="text-sm">Type</Label>
            <select className="border rounded px-3 py-2 w-full" value={questionType} onChange={(e)=> setQuestionType(e.target.value as any)}>
              <option value="SJT">SJT</option>
              <option value="JDT">JDT</option>
              <option value="CASE">CASE</option>
            </select>
          </div>
          {questionType !== 'JDT' ? (
            <div>
              <Label className="text-sm">Competencies</Label>
              <CompetencySelect value={competencies} onChange={setCompetencies} placeholder="Select competencies" />
            </div>
          ) : (
            <div>
              <Label className="text-sm">Competency Assessed</Label>
              <CompetencySelect value={jdtCompetency} onChange={setJdtCompetency} placeholder="Select competency" multiple={false} />
            </div>
          )}
        </div>
        <div>
          <Label className="text-sm">Description</Label>
          <Input value={description} onChange={(e)=> setDescription(e.target.value)} placeholder="Question description"/>
        </div>
        {questionType === 'SJT' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Scenario Name</Label>
              <Input value={sjtScenarioName} onChange={(e)=> setSjtScenarioName(e.target.value)} placeholder="Scenario name"/>
            </div>
            <div>
              <Label className="text-sm">Scenario Description</Label>
              <Input value={sjtScenarioDescription} onChange={(e)=> setSjtScenarioDescription(e.target.value)} placeholder="What is happening?"/>
            </div>
            <div className="md:col-span-2">
              <Label className="text-sm">Question for Candidate</Label>
              <Textarea rows={3} value={sjtQuestion} onChange={(e)=> setSjtQuestion(e.target.value)} placeholder="What would you do…?"/>
            </div>
            <div>
              <Label className="text-sm">Best Response Rationale</Label>
              <Textarea rows={3} value={sjtBestRationale} onChange={(e)=> setSjtBestRationale(e.target.value)} placeholder="Why a great response looks like…"/>
            </div>
            <div>
              <Label className="text-sm">Worst Response Rationale</Label>
              <Textarea rows={3} value={sjtWorstRationale} onChange={(e)=> setSjtWorstRationale(e.target.value)} placeholder="Red flags to avoid…"/>
            </div>
          </div>
        )}
        {questionType === 'JDT' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Role Name</Label>
              <Input value={jdtRoleName} onChange={(e)=> setJdtRoleName(e.target.value)} placeholder="e.g., Sales Associate"/>
            </div>
            <div>
              <Label className="text-sm">Preferred Answer Characteristics</Label>
              <Input value={jdtPreferredAnswer} onChange={(e)=> setJdtPreferredAnswer(e.target.value)} placeholder="What the ideal answer includes"/>
            </div>
            <div className="md:col-span-2">
              <Label className="text-sm">Job Description</Label>
              <Textarea rows={3} value={jdtJobDescription} onChange={(e)=> setJdtJobDescription(e.target.value)} placeholder="Key responsibilities and context"/>
            </div>
            <div className="md:col-span-2">
              <Label className="text-sm">AI Guidance</Label>
              <Textarea rows={3} value={jdtAiGuidance} onChange={(e)=> setJdtAiGuidance(e.target.value)} placeholder="Optional guidance for AI interviewer"/>
            </div>
            <div className="md:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Questions</Label>
                <Button type="button" variant="outline" size="sm" onClick={()=> setJdtQuestions((qs)=> [...qs, ''])}>Add another question</Button>
              </div>
              {jdtQuestions.map((q, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input value={q} onChange={(e)=> setJdtQuestions(qs => qs.map((v,i)=> i===idx ? e.target.value : v))} placeholder={`Question ${idx+1}`} />
                  <Button type="button" variant="ghost" size="sm" onClick={()=> setJdtQuestions(qs => qs.filter((_,i)=> i!==idx))}>Remove</Button>
                </div>
              ))}
            </div>
          </div>
        )}
        {questionType === 'CASE' && (
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Content JSON</Label>
              <Button type="button" variant="ghost" size="sm" onClick={()=> {
                const r = tryPretty(content);
                if (r.ok) setContent(r.pretty!); else toast({ variant:'destructive', title:'Invalid JSON', description: r.error });
              }}><Wand2 className="h-4 w-4 mr-1"/>Format JSON</Button>
            </div>
            <Textarea rows={6} value={content} onChange={(e)=> setContent(e.target.value)} placeholder='{"prompt":"..."}'/>
          </div>
        )}
        <div>
          <Button onClick={save} disabled={saving}>Create</Button>
        </div>
      </CardContent>
    </Card>
  );
}

async function handleDelete(row: any) {
  if (!confirm('This will permanently delete the question. Continue?')) return;
  try {
    const res = await apiService.deleteQuestion(row.id);
    if ((res as any).error) throw new Error((res as any).error);
    // Invalidate and refresh list
    // Note: fetchData is not in scope here; we'll rethrow to caller binding if needed
  } catch (e:any) {
    // This helper will be bound via closure in component; placeholder
  }
}

function EditQuestionPanel({ question, onClose, onUpdated }: { question: any; onClose: ()=>void; onUpdated: ()=>void }) {
  const { toast } = useToast();
  const [name, setName] = useState(question.name || '');
  const [description, setDescription] = useState(question.description || '');
  const [questionType, setQuestionType] = useState<'SJT'|'JDT'|'CASE'>(question.question_type || 'SJT');
  const [competencies, setCompetencies] = useState<string[]>(question.competencies || []);
  const [content, setContent] = useState(JSON.stringify(question.content || {}, null, 2));
  const [saving, setSaving] = useState(false);

  const update = async () => {
    if (!name.trim() || !description.trim()) { toast({ variant:'destructive', title: 'Fill all required fields' }); return; }
    setSaving(true);
    try {
  const comps = competencies;
      let contentJson: any = {};
      try { contentJson = JSON.parse(content); } catch { toast({ variant:'destructive', title: 'Content must be valid JSON' }); setSaving(false); return; }
      const res = await apiService.updateQuestion(question.id, { name, description, question_type: questionType, competencies: comps, content: contentJson });
      if (res.error) throw new Error(res.error);
      toast({ title: 'Question updated', description: `Saved ${name}` });
      onUpdated();
      onClose();
    } catch (e:any) {
      toast({ variant:'destructive', title: 'Update failed', description: e.message || 'Unknown error' });
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Pencil className="h-4 w-4"/> Edit Question · {question.question_code}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <Label className="text-sm">Name</Label>
            <Input value={name} onChange={(e)=> setName(e.target.value)} />
          </div>
          <div>
            <Label className="text-sm">Type</Label>
            <select className="border rounded px-3 py-2 w-full" value={questionType} onChange={(e)=> setQuestionType(e.target.value as any)}>
              <option value="SJT">SJT</option>
              <option value="JDT">JDT</option>
              <option value="CASE">CASE</option>
            </select>
          </div>
          <div>
            <Label className="text-sm">Competencies</Label>
            <CompetencySelect value={competencies} onChange={setCompetencies} placeholder="Select competencies" multiple={questionType !== 'JDT'} />
          </div>
        </div>
        <div>
          <Label className="text-sm">Description</Label>
          <Input value={description} onChange={(e)=> setDescription(e.target.value)} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Content JSON</Label>
            <Button type="button" variant="ghost" size="sm" onClick={()=> {
              const r = tryPretty(content);
              if (r.ok) setContent(r.pretty!); else toast({ variant:'destructive', title:'Invalid JSON', description: r.error });
            }}><Wand2 className="h-4 w-4 mr-1"/>Format JSON</Button>
          </div>
          <Textarea rows={6} value={content} onChange={(e)=> setContent(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button onClick={update} disabled={saving}>Save</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

