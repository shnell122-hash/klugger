'use client';

import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, Line,
} from 'recharts';
import terrenosFullRaw from '../terrenos_full.json';
import { dynamicBins, ols } from '@/lib/regression';
import { COMPS_CLEAN } from '../data/comps';
import { fmtMoney } from '@/lib/format';

function parsePositiveNumber(val: unknown): number {
  if (val == null || val === '') return 0;
  // Fast path: value already arrives as a real number (e.g. terrenos_full.json)
  if (typeof val === 'number') return isFinite(val) ? Math.abs(val) : 0;
  const s = String(val)
    .replace(/[^0-9.,-]/g, '')
    .replace(/,/g, '')
    .replace(/\.(?=.*\.)/g, '');
  const n = Number(s);
  return isNaN(n) || !isFinite(n) ? 0 : Math.abs(n);
}

export default function DatabaseTab() {
  const [dbSearch, setDbSearch] = useState('');
  const [showOnlyValid, setShowOnlyValid] = useState(false);
  const [sortBy, setSortBy] = useState<'price' | 'size' | 'ppm'>('ppm');
  const [page, setPage] = useState(1);
  const perPage = 25;

  const fullDB = useMemo(() => {
    const list: any[] = [];
    for (const row of terrenosFullRaw as any[]) {
      let price = parsePositiveNumber(row.price);
      let size = parsePositiveNumber(row.size_m2);
      if (size === 0 && row.title) {
        const m = String(row.title).match(/(\d+[\.,]?\d*)\s*(?:m²|m2|mt2|metros|mts|square meters?)/i);
        if (m) size = parsePositiveNumber(m[1]);
      }
      const isValid = price > 100000 && size > 80;
      const ppm = size > 0 && price > 0 ? Math.round(price / size) : 0;
      const implied = size > 0 && price > 0 ? Math.round(660 * (price / size)) : 0;
      list.push({ ...row, price, size_m2: size, ppm, implied_for_660: implied, isValid });
    }
    return list;
  }, []);

  const cleanList = COMPS_CLEAN.map(c => ({
    ...c, ppm: Math.round(c.price / c.size_m2),
    implied_for_660: Math.round(660 * (c.price / c.size_m2)), isValid: true,
  }));

  const currentList = showOnlyValid ? cleanList : fullDB;

  const processed = useMemo(() => {
    let list = [...currentList];
    const q = dbSearch.toLowerCase().trim();
    if (q) list = list.filter((c: any) => ((c.title || '') + (c.location || '') + (c.notes || '') + (c.link || '')).toLowerCase().includes(q));
    list.sort((a: any, b: any) => {
      if (sortBy === 'price') return (b.price || 0) - (a.price || 0);
      if (sortBy === 'size') return (b.size_m2 || 0) - (a.size_m2 || 0);
      return (b.ppm || 0) - (a.ppm || 0);
    });
    return list;
  }, [dbSearch, sortBy, currentList, showOnlyValid]);

  const totalPages = Math.ceil(processed.length / perPage);
  const pageItems = processed.slice((page - 1) * perPage, page * perPage);
  const entriesWithPrice = fullDB.filter((r: any) => r.price > 0);
  const validForPpm = fullDB.filter((r: any) => r.isValid && r.ppm > 0);
  const fullPpmValues = validForPpm.map((r: any) => r.ppm);
  const fullAvgPpm = fullPpmValues.length > 0 ? Math.round(fullPpmValues.reduce((a: number, b: number) => a + b, 0) / fullPpmValues.length) : 0;
  const fullMedianPpm = fullPpmValues.length > 0 ? [...fullPpmValues].sort((a: number, b: number) => a - b)[Math.floor(fullPpmValues.length / 2)] : 0;
  const cleanPpmValues = [...cleanList.map((c: any) => c.ppm)].sort((a: number, b: number) => a - b);
  const cleanMedianPpm = cleanPpmValues[Math.floor(cleanPpmValues.length / 2)];

  const stats = {
    total: fullDB.length, withPrice: entriesWithPrice.length,
    valid: fullDB.filter((r: any) => r.isValid).length,
    avgPpmFull: fullAvgPpm, medianPpmFull: fullMedianPpm, medianPpmClean: cleanMedianPpm,
  };

  const pricePointsM = entriesWithPrice.map((r: any) => r.price / 1000000);
  const histData = dynamicBins(pricePointsM, 10);

  // Dedup key must be specific to the *listing*, not just its (often generic,
  // repeated) title — e.g. "Lote / Terreno en Venta en Querétaro" appears on
  // 81 different rows with different price/size. Using title alone as the key
  // collapsed 537 real comps down to ~105 distinct points, making the scatter
  // look almost empty. Combine link + price + size + title so real duplicates
  // (same listing re-scraped) still collapse, but distinct comps do not.
  const seen = new Set<string>();
  const scatterData = [
    ...fullDB.filter((r: any) => r.price > 0 && r.size_m2 > 0),
    ...cleanList.filter((c: any) => c.price > 0 && c.size_m2 > 0),
  ].filter((r: any) => {
    const key = `${r.link || ''}|${r.price}|${r.size_m2}|${r.title || r.id || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((r: any) => ({ x: r.size_m2, y: r.price / 1000000, label: String(r.title || '').substring(0, 30) }));

  const modelPpm = cleanMedianPpm > 0 ? cleanMedianPpm : 7705;
  const minX = scatterData.length > 0 ? Math.min(...scatterData.map(p => p.x)) : 100;
  const maxX = scatterData.length > 0 ? Math.max(...scatterData.map(p => p.x)) : 4000;
  const modelLine = [{ x: minX, y: (minX * modelPpm) / 1000000 }, { x: maxX, y: (maxX * modelPpm) / 1000000 }];
  const realPoints = scatterData.filter(p => p.x > 0 && p.y > 0);
  const olsResult = ols(realPoints);
  const { slope, intercept } = olsResult;
  const regressionLine = realPoints.length > 1
    ? [{ x: minX, y: slope * minX + intercept }, { x: maxX, y: slope * maxX + intercept }] : [];

  const exportCSV = () => {
    const listToExport = showOnlyValid ? cleanList : fullDB;
    const headers = ['title', 'location', 'price', 'size_m2', 'ppm', 'link', 'source'];
    const rows = listToExport.map((c: any) => headers.map(h => `"${String(c[h] ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: showOnlyValid ? 'comps_clean_12.csv' : `terrenos_full_${fullDB.length}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  };

  const exportCurrentCSV = () => {
    const headers = ['title', 'location', 'price', 'size_m2', 'ppm', 'implied_660', 'link'];
    const rows = processed.map((c: any) => headers.map(h => `"${String(c[h] ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'base_datos_filtrada.csv' });
    a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Base de Datos Completa (Toda la Base)</h2>
        <p className="text-sm text-gray-400 mt-1">Total scraper: {stats.total} filas. Válidas (precio+m²): {stats.valid}. Toggle para ver 12 limpios o toda la base.</p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <button onClick={() => { setShowOnlyValid(!showOnlyValid); setPage(1); }}
          className={`px-4 py-2 rounded-2xl text-sm font-medium border ${showOnlyValid ? 'bg-[#7c3aed] text-white border-[#7c3aed]' : 'border-[#1e1e2e] hover:bg-[#1a1a22]'}`}>
          {showOnlyValid ? `12 Limpios (click para ver ${fullDB.length} total)` : `Toda la Base ${fullDB.length}`}
        </button>
        <button onClick={exportCSV} className="px-4 py-2 rounded-2xl bg-[#111118] border border-[#1e1e2e] hover:bg-[#1a1a22] text-sm">
          Exportar {showOnlyValid ? 'Clean 12' : `Full ${fullDB.length}`}
        </button>
        <button onClick={exportCurrentCSV} className="px-4 py-2 rounded-2xl bg-[#111118] border border-[#1e1e2e] hover:bg-[#1a1a22] text-sm">Exportar vista filtrada</button>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Distribución de Precios (Histograma)</h3>
        <div className="glass rounded-2xl p-4 border border-[#1e1e2e]">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={histData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis dataKey="range" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#7c3aed" name="Inmuebles" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <h3 className="text-lg font-semibold">Scatter: Precio vs m² + OLS</h3>
        <div className="glass rounded-2xl p-4 border border-[#1e1e2e]">
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis type="number" dataKey="x" name="m²" unit="m²" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis type="number" dataKey="y" name="Precio" unit="M" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Scatter name="Inmuebles" data={scatterData} fill="#7c3aed" />
              {regressionLine.length > 0 && <Line type="linear" dataKey="y" data={regressionLine} stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="OLS" opacity={0.5} />}
              {modelLine.length > 0 && <Line type="linear" dataKey="y" data={modelLine} stroke="#a78bfa" strokeWidth={3} dot={false} name="Modelo ppm" />}
            </ScatterChart>
          </ResponsiveContainer>
          <div className="text-xs text-gray-400 mt-2">
            OLS (n={olsResult.n}): pendiente {slope.toFixed(4)} M/m² · R²={olsResult.r2.toFixed(3)} · Modelo ppm (morado): {modelPpm} $/m² × m²
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-5 border border-[#1e1e2e]">
        <h3 className="text-lg font-semibold mb-3">Estadística Descriptiva</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>Con precio: <strong>{stats.withPrice}</strong></div>
          <div>Con tamaño válido: <strong>{stats.valid}</strong></div>
          <div>Mediana ppm (full): <strong>{stats.medianPpmFull || 'N/D'}</strong></div>
          <div>Mediana ppm (limpios): <strong>{stats.medianPpmClean}</strong></div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <input value={dbSearch} onChange={e => { setDbSearch(e.target.value); setPage(1); }}
          placeholder="Buscar (título, ubicación, link...)"
          className="flex-1 bg-[#111118] border border-[#1e1e2e] rounded-2xl px-4 py-2.5 text-sm" />
        <select value={sortBy} onChange={e => setSortBy(e.target.value as 'price' | 'size' | 'ppm')}
          className="bg-[#111118] border border-[#1e1e2e] rounded-2xl px-3 py-2 text-sm">
          <option value="ppm">$/m² (desc)</option>
          <option value="price">Precio (desc)</option>
          <option value="size">m² (desc)</option>
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'En vista actual', val: processed.length, c: '' },
          { label: 'Con precio >0', val: stats.withPrice, c: '' },
          { label: 'Prom $/m² (full)', val: stats.avgPpmFull || 'N/D', c: 'text-[#a78bfa]' },
          { label: 'Mediana $/m² (full)', val: stats.medianPpmFull || 'N/D', c: 'text-[#10b981]' },
          { label: 'Mediana $/m² (limpios)', val: stats.medianPpmClean, c: 'text-white' },
        ].map(({ label, val, c }) => (
          <div key={label} className="glass p-3 rounded-xl border border-[#1e1e2e]">
            <div className="text-xs text-gray-500">{label}</div>
            <div className={`text-2xl font-mono font-bold ${c}`}>{val}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#1e1e2e] bg-[#111118]">
        <table className="w-full text-sm">
          <thead className="bg-[#0a0a0f] text-gray-400">
            <tr>
              <th className="px-3 py-2 text-left">Título / Ubicación</th>
              <th className="px-3 py-2 text-right">Precio</th>
              <th className="px-3 py-2 text-right">m²</th>
              <th className="px-3 py-2 text-right">$/m²</th>
              <th className="px-3 py-2 text-right">Implied 660m²</th>
              <th className="px-3 py-2">Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e2e]">
            {pageItems.length > 0 ? pageItems.map((c: any, idx: number) => (
              <tr key={idx} className={`${c.isValid ? 'bg-[#0f0f15]' : 'opacity-70'} hover:bg-[#1a1a22]`}>
                <td className="px-3 py-2">
                  <div className="font-medium text-white text-xs">{c.title || 'Sin título'}</div>
                  <div className="text-[10px] text-gray-500">{c.location || ''}</div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-[#a78bfa] text-xs">{c.price ? fmtMoney(c.price) : '-'}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{c.size_m2 || '-'}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{c.ppm > 0 ? c.ppm : 'N/D'}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{c.implied_for_660 > 0 ? fmtMoney(c.implied_for_660) : 'N/D'}</td>
                <td className="px-3 py-2">{c.link ? <a href={c.link} target="_blank" className="text-[#7c3aed] underline text-xs">ver</a> : '-'}</td>
              </tr>
            )) : (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">Sin resultados.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center text-sm">
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded border border-[#1e1e2e] disabled:opacity-50">← Anterior</button>
        <span>Página {page} de {totalPages} — {pageItems.length} de {processed.length}</span>
        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 rounded border border-[#1e1e2e] disabled:opacity-50">Siguiente →</button>
      </div>
    </div>
  );
}
