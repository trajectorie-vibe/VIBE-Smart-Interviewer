'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/auth-context';

type EventItem = {
  id: number;
  scope_type: string;
  scope_id?: string | null;
  event_type: string;
  message: string;
  company_id?: string | null;
  visibility: string;
  created_at: string;
  created_by?: string | null;
};

export default function StatusEventsPanel({ title = 'Status Updates', limit = 50 }: { title?: string; limit?: number }) {
  const { isSuperAdmin } = useAuth();
  const [items, setItems] = useState<EventItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
        const token = (typeof window !== 'undefined' ? sessionStorage.getItem('access_token') : null) || localStorage.getItem('access_token');
        const url = new URL(baseURL + '/api/v1/status-events');
        url.searchParams.set('limit', String(limit));
        const res = await fetch(url.toString(), { headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
        if (!res.ok) {
          const body = await res.json().catch(() => ({} as any));
          throw new Error(body?.detail || `Failed to load (${res.status})`);
        }
        const data = await res.json();
        if (!cancelled) setItems(data as EventItem[]);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load status events');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [limit]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return items;
    return items.filter((ev) => `${ev.scope_type} ${ev.scope_id || ''} ${ev.event_type} ${ev.message}`.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Input placeholder="Search updates" value={search} onChange={(e)=> setSearch(e.target.value)} />
          <div className="text-xs text-muted-foreground">{loading ? 'Loading…' : `${filtered.length} items`}</div>
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>
        )}
        <div className="space-y-2 max-h-[28rem] overflow-auto">
          {filtered.length === 0 && !loading && (
            <div className="text-sm text-muted-foreground">No updates yet.</div>
          )}
          {filtered.map((ev) => (
            <div key={ev.id} className="p-3 border rounded-lg bg-white">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="space-x-2">
                  <span className="font-mono px-1.5 py-0.5 rounded bg-gray-50 border">{ev.scope_type}</span>
                  {ev.scope_id && <span className="font-mono text-gray-500">#{ev.scope_id}</span>}
                  <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border">{ev.event_type}</span>
                  {isSuperAdmin && ev.company_id && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border">[Company: {ev.company_id}]</span>
                  )}
                </div>
                <div>{new Date(ev.created_at).toLocaleString()}</div>
              </div>
              <div className="mt-1 text-sm">{ev.message}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
