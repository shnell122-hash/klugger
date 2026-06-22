'use client';
import { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getExpandedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ExpandedState,
} from '@tanstack/react-table';
import { format, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import type { Operation } from '@/lib/api';
import { fmt, TIPO_COLORS, ESTADO_COLORS } from '@/lib/api';

const helper = createColumnHelper<Operation>();

interface TablaPago {
  nombre?: string;
  clabe?: string;
  banco?: string;
  monto?: number;
  monto_neto?: number;
  monto_bruto?: number;
  pct?: number;
}

interface Props {
  data: Operation[];
  onMarcarRetorno?: (id: number) => Promise<void>;
}

export default function OperationsTable({ data, onMarcarRetorno }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [loading, setLoading] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const columns = useMemo(() => [
    helper.display({
      id: 'expander',
      size: 32,
      cell: ({ row }) => {
        const op = row.original;
        if (!op.subtabla_json) return null;
        return (
          <button
            onClick={() => row.toggleExpanded()}
            className="text-gray-500 hover:text-accent transition text-xs w-5 h-5 flex items-center justify-center"
          >
            {row.getIsExpanded() ? '▼' : '▶'}
          </button>
        );
      },
    }),
    helper.accessor('id', {
      header: '#',
      size: 60,
      cell: info => <span className="font-mono text-gray-500 text-xs">#{info.getValue()}</span>,
    }),
    helper.accessor('telegram_username', {
      header: 'Cliente',
      cell: info => (
        <div>
          <div className="font-medium text-sm">{info.row.original.client_nombre ?? '—'}</div>
          <div className="text-xs text-gray-500">@{info.getValue() ?? '—'}</div>
        </div>
      ),
    }),
    helper.accessor('tipo_operacion', {
      header: 'Tipo',
      cell: info => (
        <span
          className="px-2 py-0.5 rounded text-xs font-semibold"
          style={{
            background: `${TIPO_COLORS[info.getValue()] ?? '#6b7280'}20`,
            color: TIPO_COLORS[info.getValue()] ?? '#9ca3af',
          }}
        >
          {info.getValue()}
        </span>
      ),
    }),
    helper.accessor('monto_bruto', {
      header: 'Bruto',
      cell: info => <span className="font-mono text-sm">${fmt(info.getValue())}</span>,
    }),
    helper.accessor('monto_neto', {
      header: 'Neto',
      cell: info => <span className="font-mono text-sm font-semibold">${fmt(info.getValue())}</span>,
    }),
    helper.accessor('comision_pct', {
      header: 'Comisión',
      cell: info => (
        <span className="text-xs text-success font-mono">{(info.getValue() * 100).toFixed(1)}%</span>
      ),
    }),
    helper.display({
      id: 'margen',
      header: 'Margen',
      cell: ({ row }) => {
        const op = row.original;
        if (op.costo_pct == null) return <span className="text-gray-700 text-xs">—</span>;
        const margenPct = op.comision_pct - op.costo_pct;
        const margenMonto = margenPct * op.monto_bruto;
        return (
          <div className="text-xs font-mono">
            <span className="text-yellow-400">${fmt(margenMonto)}</span>
            <span className="block text-gray-500">{(margenPct * 100).toFixed(1)}%</span>
          </div>
        );
      },
    }),
    helper.accessor('es_entrada', {
      header: 'Dirección',
      cell: info => (
        <span className={`text-xs px-2 py-0.5 rounded ${info.getValue() ? 'bg-success/10 text-success' : 'bg-info/10 text-info'}`}>
          {info.getValue() ? '↓ Entrada' : '↑ Salida'}
        </span>
      ),
    }),
    helper.accessor('estado', {
      header: 'Estado',
      cell: info => (
        <span
          className="text-xs px-2 py-0.5 rounded font-medium"
          style={{
            background: `${ESTADO_COLORS[info.getValue()] ?? '#6b7280'}20`,
            color: ESTADO_COLORS[info.getValue()] ?? '#9ca3af',
          }}
        >
          {info.getValue()}
        </span>
      ),
    }),
    helper.accessor('created_at', {
      header: 'Fecha',
      cell: info => (
        <span className="text-xs text-gray-500 font-mono">
          {format(parseISO(info.getValue()), 'dd/MM HH:mm')}
        </span>
      ),
    }),
    helper.display({
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => {
        const op = row.original;
        if (op.estado === 'confirmada' && op.es_entrada && !op.retorno_pagado && onMarcarRetorno) {
          return (
            <button
              disabled={loading === op.id}
              onClick={async () => {
                setLoading(op.id);
                try { await onMarcarRetorno(op.id); }
                finally { setLoading(null); }
              }}
              className="text-xs px-2 py-1 rounded bg-warning/10 text-warning border border-warning/20 hover:bg-warning/20 transition disabled:opacity-50"
            >
              {loading === op.id ? '...' : 'Retorno pagado'}
            </button>
          );
        }
        return null;
      },
    }),
  ], [loading, onMarcarRetorno]);

  const table = useReactTable({
    data,
    columns,
    state:       { sorting, globalFilter, expanded },
    onSortingChange:       setSorting,
    onGlobalFilterChange:  setGlobalFilter,
    onExpandedChange:      setExpanded,
    getCoreRowModel:       getCoreRowModel(),
    getFilteredRowModel:   getFilteredRowModel(),
    getSortedRowModel:     getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel:   getExpandedRowModel(),
    getRowCanExpand:       row => !!row.original.subtabla_json,
    initialState: { pagination: { pageSize: 15 } },
  });

  return (
    <div className="space-y-3">
      {/* Search */}
      <input
        value={globalFilter}
        onChange={e => setGlobalFilter(e.target.value)}
        placeholder="Buscar por cliente, tipo, estado..."
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent/50"
      />

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} className="border-b border-border">
                {hg.headers.map(h => (
                  <th
                    key={h.id}
                    className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-300 transition"
                    style={{ width: h.column.getSize() }}
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === 'asc' ? ' ↑' : h.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, i) => (
              <>
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className="border-b border-border/50 hover:bg-surface/80 transition-colors"
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-3 py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </motion.tr>
                <AnimatePresence>
                  {row.getIsExpanded() && row.original.subtabla_json && (
                    <motion.tr
                      key={`${row.id}-expanded`}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-b border-border/30 bg-surface/40"
                    >
                      <td colSpan={columns.length} className="px-6 py-3">
                        <SubtablaDetail raw={row.original.subtabla_json} />
                      </td>
                    </motion.tr>
                  )}
                </AnimatePresence>
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{table.getFilteredRowModel().rows.length} operaciones</span>
        <div className="flex gap-2">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="px-2 py-1 rounded border border-border hover:border-accent/50 disabled:opacity-30 transition"
          >←</button>
          <span className="px-2 py-1">
            Pág. {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
          </span>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="px-2 py-1 rounded border border-border hover:border-accent/50 disabled:opacity-30 transition"
          >→</button>
        </div>
      </div>
    </div>
  );
}

function SubtablaDetail({ raw }: { raw: string }) {
  let rows: TablaPago[] = [];
  try { rows = JSON.parse(raw); } catch { return <span className="text-xs text-red-400">JSON inválido</span>; }
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const total = rows.reduce((s, r) => s + (r.monto_neto ?? r.monto ?? 0), 0);

  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Distribución de pagos</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-border/40">
              <th className="text-left pb-1 pr-4">Nombre</th>
              <th className="text-left pb-1 pr-4">CLABE / Banco</th>
              <th className="text-right pb-1 pr-4">Neto</th>
              <th className="text-right pb-1">Bruto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border/20 last:border-0">
                <td className="py-1 pr-4 text-white">{r.nombre ?? '—'}</td>
                <td className="py-1 pr-4 text-gray-400 font-mono">
                  {r.clabe ?? '—'}{r.banco ? ` · ${r.banco}` : ''}
                </td>
                <td className="py-1 pr-4 text-right font-mono text-success">
                  ${fmt(r.monto_neto ?? r.monto ?? 0)}
                </td>
                <td className="py-1 text-right font-mono text-gray-300">
                  {r.monto_bruto != null ? `$${fmt(r.monto_bruto)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border/50">
              <td colSpan={2} className="pt-1 text-gray-500">Total</td>
              <td className="pt-1 text-right font-mono font-semibold text-success">${fmt(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
