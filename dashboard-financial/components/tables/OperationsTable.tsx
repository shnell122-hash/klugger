'use client';
import { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { format, parseISO } from 'date-fns';
import { motion } from 'framer-motion';
import type { Operation } from '@/lib/api';
import { fmt, TIPO_COLORS, ESTADO_COLORS } from '@/lib/api';

const helper = createColumnHelper<Operation>();

interface Props {
  data: Operation[];
  onMarcarRetorno?: (id: number) => Promise<void>;
}

export default function OperationsTable({ data, onMarcarRetorno }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [loading, setLoading] = useState<number | null>(null);

  const columns = useMemo(() => [
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
    state:       { sorting, globalFilter },
    onSortingChange:       setSorting,
    onGlobalFilterChange:  setGlobalFilter,
    getCoreRowModel:       getCoreRowModel(),
    getFilteredRowModel:   getFilteredRowModel(),
    getSortedRowModel:     getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
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
