'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { fmtMoney } from '@/lib/format';

interface Comp {
  id?: number;
  title: string;
  location: string;
  notes?: string;
  price: number;
  size_m2: number;
  implied_for_target?: number;
  delta_vs_asking?: number;
  pct_vs_asking?: number;
  link?: string;
}

const DEFAULT_ASKING_PRICE = 7000000;
const PER_PAGE = 20;

type SortKey = 'relevance' | 'price' | 'size' | 'ppm' | 'delta';

const IMPLIED_EXPLANATION =
  '"Implícito 660 m²" = precio de este comp normalizado al tamaño de tu predio (660 m²): $/m² del comp × 660. ' +
  'No es el precio real al que se vendió — es una proyección para poder comparar terrenos de tamaños distintos en pie de igualdad.';

const VS_ASKING_EXPLANATION =
  '"% vs Asking" = qué tan barato (−) o caro (+) resulta ese comp, normalizado a 660 m², frente a tu asking de $7,000,000. ' +
  'Negativo (−): el comp sale más barato que tu asking → tu precio luce caro frente a él. ' +
  'Positivo (+): el comp sale más caro que tu asking → tu precio luce barato frente a él. ' +
  'Nota: es una extrapolación lineal de $/m²; en comps de tamaño muy distinto a 660 m² el % puede ser extremo y menos representativo.';

export default function CompsTable({ data, filter, askingPrice = DEFAULT_ASKING_PRICE }: { data: Comp[]; filter: string; askingPrice?: number }) {
  const shouldReduceMotion = useReducedMotion();
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortKey>('relevance');

  const filtered = useMemo(() => {
    const q = filter.toLowerCase().trim();
    if (!q) return data;
    return data.filter((c) =>
      (c.title + c.location + (c.notes ?? '')).toLowerCase().includes(q)
    );
  }, [data, filter]);

  // Pre-compute derived fields once so both sorting and rendering reuse them
  // instead of recomputing ppm/implied/delta per cell on every render.
  const enriched = useMemo(() => {
    return filtered.map((c) => {
      const ppm = Math.round(c.price / c.size_m2);
      const implied = c.implied_for_target ?? Math.round(660 * ppm);
      const delta = c.delta_vs_asking ?? (implied - askingPrice);
      const pct = c.pct_vs_asking ?? Math.round((delta / askingPrice) * 1000) / 10;
      return { ...c, ppm, implied, delta, pct };
    });
  }, [filtered, askingPrice]);

  // Default order ("relevance") surfaces the comps whose implied value at
  // 660 m² is closest to the asking price first — those are the most useful
  // reference points for judging whether the asking price is reasonable,
  // instead of an arbitrary/alphabetical dump of all 537 rows.
  const sorted = useMemo(() => {
    const list = [...enriched];
    switch (sortBy) {
      case 'price':
        list.sort((a, b) => b.price - a.price);
        break;
      case 'size':
        list.sort((a, b) => Math.abs(a.size_m2 - 660) - Math.abs(b.size_m2 - 660));
        break;
      case 'ppm':
        list.sort((a, b) => b.ppm - a.ppm);
        break;
      case 'delta':
        list.sort((a, b) => b.delta - a.delta);
        break;
      case 'relevance':
      default:
        list.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
    }
    return list;
  }, [enriched, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageItems = sorted.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  // Any change to the filtered/sorted set invalidates the current page.
  useEffect(() => {
    setPage(1);
  }, [filter, sortBy, data]);

  // A single `transition` object with per-property timing lets the same
  // element use a staggered fade/slide-in on mount (opacity + y) and a
  // separate, non-staggered 150ms transition for the hover-triggered
  // translateX — framer-motion picks whichever sub-config matches the
  // property being animated, whether the trigger is `animate` or `whileHover`.
  const rowTransition = (idx: number) =>
    shouldReduceMotion
      ? { duration: 0 }
      : {
          opacity: { duration: 0.2, ease: 'easeOut' as const, delay: idx * 0.02 },
          y: { duration: 0.2, ease: 'easeOut' as const, delay: idx * 0.02 },
          x: { duration: 0.15, ease: 'easeOut' as const },
        };

  const rowInitial = shouldReduceMotion ? false : { opacity: 0, y: 6 };
  const hoverAnim = shouldReduceMotion ? undefined : { x: 3 };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-gray-500">
          Ordenado por relevancia (más cercanos a tu asking primero). {sorted.length} comparables encontrados.
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="bg-[#111118] border border-[#1e1e2e] rounded-2xl px-3 py-1.5 text-xs"
        >
          <option value="relevance">Relevancia (vs Asking)</option>
          <option value="delta">vs Asking (desc)</option>
          <option value="price">Precio (desc)</option>
          <option value="size">m² (cercano a 660)</option>
          <option value="ppm">$/m² (desc)</option>
        </select>
      </div>

      <div className="hidden md:block overflow-x-auto rounded-2xl border border-[#1e1e2e] bg-[#111118]">
        <table className="w-full text-sm">
          <thead className="bg-[#0a0a0f] text-gray-400">
            <tr>
              <th className="px-3 py-2 text-left">Comparable</th>
              <th className="px-3 py-2 text-right">Precio</th>
              <th className="px-3 py-2 text-right">m²</th>
              <th className="px-3 py-2 text-right">$/m²</th>
              <th className="px-3 py-2 text-right">
                <span className="inline-flex items-center gap-1 cursor-help border-b border-dotted border-gray-500" title={IMPLIED_EXPLANATION}>
                  Implícito 660m²
                  <span aria-hidden="true" className="text-[10px] text-gray-500">ⓘ</span>
                </span>
              </th>
              <th className="px-3 py-2 text-right">
                <span className="inline-flex items-center gap-1 cursor-help border-b border-dotted border-gray-500" title={VS_ASKING_EXPLANATION}>
                  % vs Asking
                  <span aria-hidden="true" className="text-[10px] text-gray-500">ⓘ</span>
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e2e]">
            {pageItems.length > 0 ? pageItems.map((c, i) => (
              <motion.tr
                key={`${safePage}-${i}-${c.link ?? c.title}`}
                initial={rowInitial}
                animate={{ opacity: 1, y: 0 }}
                transition={rowTransition(i)}
                whileHover={hoverAnim}
                className="hover:bg-[#1a1a22] transition-colors duration-150 ease-out"
              >
                <td className="px-3 py-2">
                  <a href={c.link ?? '#'} target="_blank" className="font-medium hover:text-[#a78bfa] underline-offset-2 hover:underline">{c.title}</a>
                  <div className="text-[10px] text-gray-500">{c.location}</div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-[#a78bfa] text-xs">{fmtMoney(c.price)}</td>
                <td className="px-3 py-2 text-right text-xs">{c.size_m2}m²</td>
                <td className="px-3 py-2 text-right text-xs">{c.ppm}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{fmtMoney(c.implied)}</td>
                <td className={`px-3 py-2 text-right text-xs font-medium ${c.delta >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`} title={VS_ASKING_EXPLANATION}>
                  {c.delta >= 0 ? '+' : ''}{c.pct.toFixed(1)}%
                </td>
              </motion.tr>
            )) : (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">Sin resultados.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {pageItems.length > 0 ? pageItems.map((c, i) => (
          <motion.div
            key={`${safePage}-${i}-${c.link ?? c.title}`}
            initial={rowInitial}
            animate={{ opacity: 1, y: 0 }}
            transition={rowTransition(i)}
            whileHover={hoverAnim}
            className="glass rounded-2xl p-4 border border-[#1e1e2e] transition-colors duration-150 ease-out hover:bg-[#1a1a22]"
          >
            <div className="font-medium text-sm">{c.title}</div>
            <div className="text-xs text-gray-400">{c.location}</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div><span className="text-gray-500">Precio:</span> {fmtMoney(c.price)}</div>
              <div><span className="text-gray-500">m²:</span> {c.size_m2}</div>
              <div><span className="text-gray-500">$/m²:</span> {c.ppm}</div>
            </div>
            <div className={`text-xs mt-1 font-medium ${c.delta >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
              Implícito: {fmtMoney(c.implied)} ({c.delta >= 0 ? '+' : ''}{c.pct.toFixed(1)}% vs asking)
            </div>
          </motion.div>
        )) : (
          <div className="text-center text-gray-500 text-sm py-6">Sin resultados.</div>
        )}
      </div>

      <div className="flex justify-between items-center text-sm">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={safePage === 1}
          className="px-3 py-1 rounded border border-[#1e1e2e] disabled:opacity-50"
        >
          ← Anterior
        </button>
        <span className="text-xs text-gray-400">
          Página {safePage} de {totalPages} — {pageItems.length} de {sorted.length}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={safePage === totalPages}
          className="px-3 py-1 rounded border border-[#1e1e2e] disabled:opacity-50"
        >
          Siguiente →
        </button>
      </div>

      <p className="text-[11px] text-gray-500 px-1 leading-relaxed">
        <strong className="text-gray-400">Implícito 660 m²:</strong> {IMPLIED_EXPLANATION}
      </p>
      <p className="text-[11px] text-gray-500 px-1 leading-relaxed">
        <strong className="text-gray-400">% vs Asking:</strong> {VS_ASKING_EXPLANATION}
      </p>
    </div>
  );
}
