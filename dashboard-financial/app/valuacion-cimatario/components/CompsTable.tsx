'use client';

import React, { useMemo } from 'react';
import { fmtMoney } from '@/lib/format';

interface Comp {
  id?: number;
  title: string;
  location: string;
  notes: string;
  price: number;
  size_m2: number;
  implied_for_target?: number;
  delta_vs_asking?: number;
  pct_vs_asking?: number;
  link?: string;
}

export default function CompsTable({ data, filter }: { data: Comp[]; filter: string }) {
  const filtered = useMemo(() => {
    const q = filter.toLowerCase().trim();
    if (!q) return data;
    return data.filter((c) =>
      (c.title + c.location + (c.notes ?? '')).toLowerCase().includes(q)
    );
  }, [data, filter]);

  return (
    <div className="space-y-3">
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-[#1e1e2e] bg-[#111118]">
        <table className="w-full text-sm">
          <thead className="bg-[#0a0a0f] text-gray-400">
            <tr>
              <th className="px-3 py-2 text-left">Comparable</th>
              <th className="px-3 py-2 text-right">Precio</th>
              <th className="px-3 py-2 text-right">m²</th>
              <th className="px-3 py-2 text-right">$/m²</th>
              <th className="px-3 py-2 text-right">Implícito 660m²</th>
              <th className="px-3 py-2 text-right">vs Asking</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e2e]">
            {filtered.map((c, i) => {
              const ppm = Math.round(c.price / c.size_m2);
              const implied = c.implied_for_target ?? Math.round(660 * ppm);
              const delta = c.delta_vs_asking ?? (implied - 7000000);
              return (
                <tr key={i} className="hover:bg-[#1a1a22]">
                  <td className="px-3 py-2">
                    <a href={c.link ?? '#'} target="_blank" className="font-medium hover:text-[#a78bfa] underline-offset-2 hover:underline">{c.title}</a>
                    <div className="text-[10px] text-gray-500">{c.location}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[#a78bfa] text-xs">{fmtMoney(c.price)}</td>
                  <td className="px-3 py-2 text-right text-xs">{c.size_m2}m²</td>
                  <td className="px-3 py-2 text-right text-xs">{ppm}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{fmtMoney(implied)}</td>
                  <td className={`px-3 py-2 text-right text-xs font-medium ${delta >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                    {delta >= 0 ? '+' : ''}{(c.pct_vs_asking ?? Math.round((delta / 7000000) * 1000) / 10).toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.map((c, i) => {
          const ppm = Math.round(c.price / c.size_m2);
          const implied = c.implied_for_target ?? Math.round(660 * ppm);
          const delta = c.delta_vs_asking ?? (implied - 7000000);
          return (
            <div key={i} className="glass rounded-2xl p-4 border border-[#1e1e2e]">
              <div className="font-medium text-sm">{c.title}</div>
              <div className="text-xs text-gray-400">{c.location}</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div><span className="text-gray-500">Precio:</span> {fmtMoney(c.price)}</div>
                <div><span className="text-gray-500">m²:</span> {c.size_m2}</div>
                <div><span className="text-gray-500">$/m²:</span> {ppm}</div>
              </div>
              <div className={`text-xs mt-1 font-medium ${delta >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                Implícito: {fmtMoney(implied)} ({delta >= 0 ? '+' : ''}{(c.pct_vs_asking ?? Math.round((delta / 7000000) * 1000) / 10).toFixed(1)}% vs asking)
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
