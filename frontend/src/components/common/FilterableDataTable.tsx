"use client";

import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';

export type Column<T> = {
  key: keyof T | string;
  header: string;
  render?: (row: T) => React.ReactNode;
  width?: string;
};

export interface FilterableDataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  search?: string;
  onSearchChange?: (v: string) => void;
  selected?: Set<string>;
  onToggleRow?: (id: string) => void;
  onToggleAllFiltered?: () => void;
  actionsRight?: React.ReactNode;
  emptyText?: string;
  enableColumnFilters?: boolean;
}

export function FilterableDataTable<T extends object>({
  rows,
  columns,
  getRowId,
  search,
  onSearchChange,
  selected,
  onToggleRow,
  onToggleAllFiltered,
  actionsRight,
  emptyText = 'No data',
}: FilterableDataTableProps<T>) {
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const q = (search || '').toLowerCase();
    let base = rows;
    if (q) {
      base = base.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
    }
    // Apply per-column filters (contains match on stringified cell)
    const keys = Object.keys(columnFilters).filter((k) => (columnFilters[k] || '').trim().length > 0);
    if (keys.length === 0) return base;
    return base.filter((row) => {
      for (const k of keys) {
        const needle = (columnFilters[k] || '').toLowerCase();
        const val = (row as any)[k];
        const hay = (val === undefined || val === null) ? '' : String(val).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, search, columnFilters]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {onSearchChange && (
          <Input placeholder="Search..." value={search || ''} onChange={(e)=> onSearchChange(e.target.value)} />
        )}
        <div className="ml-auto">{actionsRight}</div>
      </div>
      <div className="border rounded-md overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {selected && onToggleAllFiltered && (
                <TableHead className="w-10">
                  <Button variant="ghost" size="sm" onClick={onToggleAllFiltered}>All</Button>
                </TableHead>
              )}
              {columns.map((c) => (
                <TableHead key={String(c.key)} style={{ width: c.width }}>{c.header}</TableHead>
              ))}
            </TableRow>
            {/* Column filter inputs */}
            <TableRow>
              {selected && onToggleAllFiltered && (
                <TableHead className="w-10"></TableHead>
              )}
              {columns.map((c) => (
                <TableHead key={String(c.key)}>
                  <Input
                    placeholder="filter"
                    className="h-7 text-xs"
                    value={columnFilters[String(c.key)] || ''}
                    onChange={(e)=> setColumnFilters((prev) => ({ ...prev, [String(c.key)]: e.target.value }))}
                  />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => {
              const id = getRowId(r);
              return (
                <TableRow key={id} className="hover:bg-muted/50">
                  {selected && onToggleRow && (
                    <TableCell className="w-10">
                      <input type="checkbox" checked={selected.has(id)} onChange={()=> onToggleRow(id)} />
                    </TableCell>
                  )}
                  {columns.map((c) => (
                    <TableCell key={String(c.key)}>
                      {c.render ? c.render(r) : (r as any)[c.key as any]}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={(selected?1:0) + columns.length} className="text-center text-sm text-muted-foreground">
                  {emptyText}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default FilterableDataTable;
