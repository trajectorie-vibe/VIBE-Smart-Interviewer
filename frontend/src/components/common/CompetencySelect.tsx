'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { apiService } from '@/lib/api-service';
import { ChevronDown, Check, X } from 'lucide-react';

export interface CompetencyOption {
  code: string;
  name?: string;
  description?: string;
}

interface CompetencySelectProps {
  value: string[];
  onChange: (codes: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  label?: string;
  multiple?: boolean;
  maxSelected?: number;
}

export default function CompetencySelect({
  value,
  onChange,
  placeholder = 'Select competencies',
  className,
  disabled,
  label,
  multiple = true,
  maxSelected,
}: CompetencySelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<CompetencyOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await apiService.listCompetencies({ include_inactive: false });
        if (res.data && mounted) {
          const list = res.data.map((c: any) => ({ code: c.code || c.competency_code || c.id, name: c.name || c.competency_name, description: c.description }));
          // Deduplicate by code
          const seen = new Set<string>();
          const dedup = list.filter((o: CompetencyOption) => { if (seen.has(o.code)) return false; seen.add(o.code); return true; });
          setOptions(dedup);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return options;
    return options.filter(o => (o.code || '').toLowerCase().includes(q) || (o.name || '').toLowerCase().includes(q));
  }, [options, search]);

  const toggle = (code: string) => {
    if (multiple) {
      let next: string[];
      if (value.includes(code)) next = value.filter((c) => c !== code);
      else next = [...value, code];
      if (typeof maxSelected === 'number' && maxSelected > 0 && next.length > maxSelected) {
        next = next.slice(0, maxSelected);
      }
      onChange(next);
    } else {
      const next = value.includes(code) ? [] : [code];
      onChange(next);
      setOpen(false);
    }
  };

  const clearAll = () => onChange([]);

  const summary = value.length === 0
    ? placeholder
    : value.slice(0, 3).join(', ') + (value.length > 3 ? ` +${value.length - 3}` : '');

  return (
    <div className={className}>
      {label && <div className="mb-1 text-sm text-slate-600">{label}</div>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-between" disabled={disabled}>
            <div className="flex flex-wrap items-center gap-1">
              {value.length === 0 ? (
                <span className="text-slate-500">{placeholder}</span>
              ) : (
                value.slice(0, 3).map((code) => (
                  <Badge key={code} variant="secondary" className="bg-orange-50 text-orange-700 border border-orange-200">{code}</Badge>
                ))
              )}
              {value.length > 3 && <span className="text-xs text-slate-500">+{value.length - 3}</span>}
            </div>
            <ChevronDown className="h-4 w-4 text-slate-500" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3" align="start">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input autoFocus placeholder="Search…" value={search} onChange={(e)=> setSearch(e.target.value)} />
              {value.length > 0 && (
                <Button type="button" variant="ghost" size="icon" onClick={clearAll} title="Clear selection">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="max-h-56 overflow-auto rounded border border-slate-200">
              {loading ? (
                <div className="p-3 text-sm text-slate-500">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="p-3 text-sm text-slate-500">No competencies</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filtered.map((opt) => {
                    const checked = value.includes(opt.code);
                    return (
                      <li key={opt.code} className="flex items-center gap-3 px-3 py-2 hover:bg-orange-50/60">
                        {multiple ? (
                          <Checkbox checked={checked} onCheckedChange={() => toggle(opt.code)} />
                        ) : (
                          <button type="button" className={`h-5 w-5 rounded border ${checked ? 'bg-orange-600 border-orange-600' : 'border-slate-300'}`} onClick={() => toggle(opt.code)}>
                            {checked && <Check className="h-4 w-4 text-white" />}
                          </button>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-900">{opt.name || opt.code}</div>
                          <div className="truncate text-xs text-slate-500">{opt.code}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500">{value.length} selected</div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={clearAll} disabled={value.length === 0}>Clear</Button>
                <Button type="button" size="sm" className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => setOpen(false)}>Done</Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
