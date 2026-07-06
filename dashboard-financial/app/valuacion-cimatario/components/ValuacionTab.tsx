'use client';

import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend, Cell, Line,
} from 'recharts';
import { VALUATION, SELL_TIME_DATA, TARGET_SELL_EST } from '../data/comps';
import { fmtMoney, fmtMX } from '@/lib/format';
import KPICard from './KPICard';
import CompsTable from './CompsTable';
import ScorecardPredio from './ScorecardPredio';
import terrenosFullRaw from '../terrenos_full.json';

interface RawTerreno {
  price: number;
  size_m2: number;
  title: string;
  location: string;
  address?: string;
  lat: number | null;
  lng: number | null;
  link: string;
  source?: string;
  portal?: string;
  scraped_at?: string;
}

const FULL_DB_COUNT = (terrenosFullRaw as RawTerreno[]).length || 1000;

// Linear-interpolated percentile over a pre-sorted (ascending) numeric array.
// Used to derive the headline market stats (median, p25, p75) straight from
// the 537 real comps instead of the 12 hand-curated ones.
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

export default function ValuacionTab() {
  const [search, setSearch] = useState('');

  const target = VALUATION.target;
  const models = VALUATION.models;
  const stats = VALUATION.comps_stats;

  // Real comps vector (537 scraped Lamudi listings), each projected to the
  // target's 660 m² at its own $/m² rate. This feeds both the distribution
  // chart below and the comps table — replacing the previous 12-item
  // synthetic dataset from data/comps.ts for these two views.
  const realComps = useMemo(() => {
    return (terrenosFullRaw as RawTerreno[])
      .filter((c) => c && Number.isFinite(c.price) && Number.isFinite(c.size_m2) && c.price > 0 && c.size_m2 > 0)
      .map((c) => {
        const ppm = c.price / c.size_m2;
        const implied = Math.round(ppm * target.m2);
        const delta = implied - target.asking_price;
        return {
          title: c.title || c.location || 'Comparable',
          location: c.location,
          notes: '',
          price: c.price,
          size_m2: c.size_m2,
          link: c.link,
          implied_for_target: implied,
          delta_vs_asking: delta,
          pct_vs_asking: Math.round((delta / target.asking_price) * 1000) / 10,
        };
      })
      .sort((a, b) => a.implied_for_target - b.implied_for_target);
  }, [target.m2, target.asking_price]);

  // Bucket the 537 real comps into 1M-MXN-wide "implied value @ 660m²"
  // ranges. A per-comp bar chart with 537 bars was unreadable (and the
  // previous version silently rendered nothing meaningful because it read
  // from the 12-item synthetic VALUATION.price_vector instead of the real
  // dataset) — a histogram is the honest way to show where the market
  // actually sits relative to the $7M asking once every comp is normalized
  // to 660 m².
  const priceDistribution = useMemo(() => {
    const binSize = 1_000_000;
    const capBins = 15; // buckets 0-1M .. 14-15M, plus a 15M+ overflow bucket
    const overflowLabel = '15M+';
    const labels: string[] = [];
    const counts = new Map<string, number>();
    for (let i = 0; i < capBins; i++) {
      const label = `${i}-${i + 1}M`;
      labels.push(label);
      counts.set(label, 0);
    }
    labels.push(overflowLabel);
    counts.set(overflowLabel, 0);

    realComps.forEach((c) => {
      const v = c.implied_for_target;
      const idx = Math.floor(v / binSize);
      const label = idx >= capBins ? overflowLabel : labels[idx];
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });

    return labels.map((label) => ({ label, count: counts.get(label) ?? 0 }));
  }, [realComps]);

  const askingBucketIndex = Math.min(Math.floor(target.asking_price / 1_000_000), 15);
  const askingBucketLabel = priceDistribution[askingBucketIndex]?.label ?? '15M+';

  const sellChartData = SELL_TIME_DATA.map(d => ({
    rango: d.precio_label,
    meses: d.meses_base,
    min: d.meses_min,
    max: d.meses_max,
  }));

  const askingPpmVsMedian = Math.round(((target.asking_ppm - stats.median_ppm) / stats.median_ppm) * 100);

  // Headline market model: derived from all 537 real Lamudi comps, not the
  // 12 hand-curated ones. `implied_for_target` on each real comp is already
  // ppm × 660, so its median/p25/p75 IS the 660m²-base median/p25/p75 ppm ×
  // 660 — no separate ppm array needed. This feeds the titular KPI cards;
  // the 12-comp "curado" numbers (stats/models above) are kept and shown
  // alongside for reconciliation, not replaced.
  const market537 = useMemo(() => {
    const impliedAsc = realComps.map((c) => c.implied_for_target).sort((a, b) => a - b);
    const n = impliedAsc.length;
    const base = percentile(impliedAsc, 0.5);
    const p25Base = percentile(impliedAsc, 0.25);
    const p75Base = percentile(impliedAsc, 0.75);
    const adjust = (v: number) => Math.round(v * models.potential_multiplier * models.zone_premium);
    const adjusted = adjust(base);
    const deltaPct = ((adjusted - models.adjusted_median) / models.adjusted_median) * 100;
    return {
      n,
      base: Math.round(base),
      medianPpm: Math.round(base / target.m2),
      p25Ppm: Math.round(p25Base / target.m2),
      p75Ppm: Math.round(p75Base / target.m2),
      adjusted,
      p25Adjusted: adjust(p25Base),
      p75Adjusted: adjust(p75Base),
      deltaPct,
    };
  }, [realComps, target.m2, models.potential_multiplier, models.zone_premium, models.adjusted_median]);

  const askingPpmVsMedian537 = Math.round(((target.asking_ppm - market537.medianPpm) / market537.medianPpm) * 100);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Precio Asking" value={target.asking_price} icon="🏷️" color="warning" isMonetary />
        <KPICard title={`Mediana Mercado $/m² (n=${market537.n})`} value={market537.medianPpm} suffix=" /m²" icon="📏" color="info" />
        <KPICard title={`Estimado Ajustado CUS (n=${market537.n})`} value={market537.adjusted} icon="🚀" color="accent" isMonetary />
        <KPICard title={`Banda Mercado p25–p75 (n=${market537.n})`} value={`${fmtMX(market537.p25Adjusted / 1e6, 1)}M - ${fmtMX(market537.p75Adjusted / 1e6, 1)}M`} icon="📊" color="success" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KPICard title={`Mediana Comps Curados $/m² (n=${stats.n})`} value={stats.median_ppm} suffix=" /m²" icon="🎯" color="info" />
        <KPICard title={`Estimado Ajustado Curado CUS (n=${stats.n})`} value={models.adjusted_median} icon="🧮" color="accent" isMonetary />
        <KPICard title={`Rango Consenso Curado ±8% (n=${stats.n})`} value={`${fmtMX(models.consensus_low / 1e6, 1)}M - ${fmtMX(models.consensus_high / 1e6, 1)}M`} icon="📐" color="success" />
      </div>
      <div className="text-xs text-gray-500 px-1 -mt-1">
        Fila 1 (titular): modelo sobre los {market537.n} comps reales scrapeados de Lamudi — mercado amplio, incluye dispersión de zonas/condiciones fuera de Cimatario. Fila 2 (referencia fina): mismo modelo sobre los {stats.n} comps curados a mano (solo terrenos sin construcción en Cimatario) — ver reconciliación abajo.
      </div>

      <div className="glass rounded-3xl p-6 border border-[#1e1e2e]">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="text-sm text-gray-400">Tu asking vs modelo mercado amplio (n={market537.n})</div>
            <div className="text-4xl font-bold font-mono tracking-tighter mt-1">
              {fmtMoney(target.asking_price)} <span className="text-base align-super text-gray-500">vs ~{fmtMoney(market537.adjusted)}</span>
            </div>
            <div className="text-xs text-gray-500 mt-1">Modelo fino curado (n={stats.n}): ~{fmtMoney(models.adjusted_median)}</div>
          </div>
          <div className="text-right">
            <div className={`inline-block px-4 py-1 rounded-2xl text-sm font-semibold ${target.asking_price <= market537.adjusted ? 'bg-[#10b981]/15 text-[#10b981]' : 'bg-[#ef4444]/15 text-[#ef4444]'}`}>
              {target.asking_price <= market537.adjusted ? '✓ ALINEADO O LIGERAMENTE SUBVALORADO' : 'SOBRE PRECIO'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Asking ${fmtMX(target.asking_ppm)}/m² • Mercado amplio mediana ${fmtMX(market537.medianPpm)}/m² ({askingPpmVsMedian537 >= 0 ? '+' : ''}{askingPpmVsMedian537}%) • Curado mediana ${fmtMX(stats.median_ppm)}/m² ({askingPpmVsMedian >= 0 ? '+' : ''}{askingPpmVsMedian}%)
            </div>
          </div>
        </div>
        <div className="mt-4 text-xs leading-relaxed text-gray-400">
          Modelo mercado amplio (titular): <span className="font-mono text-[#a78bfa]">660 × mediana_ppm_{market537.n} × {models.potential_multiplier} × {models.zone_premium}</span> • Modelo curado (referencia): <span className="font-mono text-[#a78bfa]">{models.formula}</span><br />
          +40% por alto potencial densificación (CUS 2.4 permite ~12 aptos vs lotes típicos 1-2 viviendas en los comps).
        </div>
      </div>

      <ScorecardPredio />

      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Cómo se obtiene la valuación (fórmulas + números)</h2>
          <div className="text-xs px-2 py-0.5 bg-[#1e1e2e] rounded">Fuente: comps_clean.json (n=12) + terrenos_full.json (n={market537.n})</div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass rounded-2xl p-5 border border-[#1e1e2e] space-y-3 text-sm">
            <div className="font-semibold text-[#a78bfa]">1a. Mediana de comps curados a mano (sin construcción)</div>
            <div className="font-mono text-lg">mediana_ppm = {fmtMX(stats.median_ppm)} $/m² <span className="text-xs text-gray-500">(n={stats.n})</span></div>
            <div className="text-gray-400">Base = 660 m² × {fmtMX(stats.median_ppm)} = <span className="text-white font-medium">{fmtMoney(models.base_median)}</span></div>
          </div>
          <div className="glass rounded-2xl p-5 border border-[#1e1e2e] space-y-3 text-sm">
            <div className="font-semibold text-[#a78bfa]">1b. Mediana de mercado amplio (comps reales scrapeados Lamudi)</div>
            <div className="font-mono text-lg">mediana_ppm = {fmtMX(market537.medianPpm)} $/m² <span className="text-xs text-gray-500">(n={market537.n}, p25={fmtMX(market537.p25Ppm)} – p75={fmtMX(market537.p75Ppm)})</span></div>
            <div className="text-gray-400">Base = 660 m² × {fmtMX(market537.medianPpm)} = <span className="text-white font-medium">{fmtMoney(market537.base)}</span></div>
          </div>
          <div className="glass rounded-2xl p-5 border border-[#1e1e2e] space-y-3 text-sm">
            <div className="font-semibold text-[#a78bfa]">2. Ajuste CUS / potencial desarrollo (roadmap) — mismo ajuste para ambos modelos</div>
            <div>multiplicador_CUS = {models.potential_multiplier}× (12 unidades vs densidad baja de comps)</div>
            <div>multiplicador_zona = {models.zone_premium}× (plusvalía Cimatario)</div>
            <div className="font-mono text-sm">curado (n={stats.n}): {fmtMoney(models.base_median)} × {models.potential_multiplier} × {models.zone_premium} = <span className="text-[#10b981] font-semibold">{fmtMoney(models.adjusted_median)}</span></div>
            <div className="font-mono text-sm">mercado amplio (n={market537.n}): {fmtMoney(market537.base)} × {models.potential_multiplier} × {models.zone_premium} = <span className="text-[#a78bfa] font-semibold">{fmtMoney(market537.adjusted)}</span></div>
          </div>
          <div className={`glass rounded-2xl p-5 border space-y-2 text-sm ${Math.abs(market537.deltaPct) >= 10 ? 'border-[#f59e0b]/50' : 'border-[#1e1e2e]'}`}>
            <div className="font-semibold mb-1">3. Reconciliación: curado (n={stats.n}) vs mercado amplio (n={market537.n})</div>
            <div className="text-xs md:text-sm text-gray-300">
              El estimado ajustado de mercado amplio (<span className="font-mono">{fmtMoney(market537.adjusted)}</span>) es{' '}
              <span className={`font-semibold ${market537.deltaPct >= 0 ? 'text-[#f59e0b]' : 'text-[#3b82f6]'}`}>{market537.deltaPct >= 0 ? '+' : ''}{market537.deltaPct.toFixed(1)}%</span>{' '}
              vs. el modelo fino curado (<span className="font-mono">{fmtMoney(models.adjusted_median)}</span>).
            </div>
            <div className="text-[11px] text-gray-500 leading-relaxed pt-1">
              Los {market537.n} comps de mercado amplio incluyen terrenos heterogéneos (distintas zonas de Querétaro, algunos con condición/ubicación no verificada a mano) — por eso el modelo curado de {stats.n} lotes vacantes en Cimatario se mantiene como referencia fina, pero la divergencia se muestra sin filtrar para que la valuación sea trazable a toda la data disponible, no solo a la muestra pequeña.
            </div>
          </div>
          <div className="glass rounded-2xl p-5 border border-[#1e1e2e] space-y-2 text-sm lg:col-span-2">
            <div className="font-semibold mb-1">Referencias adicionales del modelo</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs md:text-sm">
              <div>Promedio comps curados (ajustado): <span className="font-medium text-white">{fmtMoney(models.adjusted_mean)}</span></div>
              <div>Lamudi area avg 6,433 $/m² (ajustado): <span className="font-medium text-white">{fmtMoney(models.lamudi_adjusted)}</span></div>
              <div>Rango consenso curado (ajustado ±8%): <span className="font-medium text-[#10b981]">{fmtMoney(models.consensus_low)} — {fmtMoney(models.consensus_high)}</span></div>
            </div>
            <div className="pt-2 text-[11px] text-gray-500">Nota: Este es prototipo inicial. Próximos pasos (roadmap): sklearn regression, features de vision (vistas, topografía), ajuste por tamaño y tiempo en mercado.</div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Vector de precios: distribución de {realComps.length} comps reales vs asking</h2>
        <p className="text-sm text-gray-400">Cada uno de los {realComps.length} comparables reales scrapeados de Lamudi se lleva a su valor implícito a 660 m² (price/size_m2 × 660) y se agrupa en rangos de $1M. La barra ámbar marca el rango donde cae tu asking de {fmtMoney(target.asking_price)}.</p>
        <div className="glass rounded-2xl p-5 border border-[#1e1e2e]">
          <div className="h-[280px] -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={priceDistribution} margin={{ top: 24, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} angle={-45} textAnchor="end" height={70} />
                <YAxis
                  allowDecimals={false}
                  width={40}
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  tickFormatter={(v: number) => fmtMX(v, 0)}
                  label={{ value: '# comps', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{ background: '#111118', border: '1px solid #1e1e2e', borderRadius: 8, color: '#e2e2f0' }}
                  formatter={(value: number) => [`${value} comps`, 'Cantidad']}
                  labelFormatter={(label) => `Valor implícito a 660m²: $${label}`}
                />
                <Legend />
                <Bar dataKey="count" name={`Comps por rango de valor implícito a 660m² (n=${realComps.length})`} radius={3}>
                  {priceDistribution.map((d) => (
                    <Cell key={d.label} fill={d.label === askingBucketLabel ? '#f59e0b' : '#7c3aed'} />
                  ))}
                </Bar>
                <ReferenceLine x={askingBucketLabel} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: `Asking ${fmtMX(target.asking_price / 1e6, 1)}M`, fill: '#f59e0b', fontSize: 11, position: 'top' }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-3 mb-3">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar comps (ej. Biznaga, Encino...)"
              className="flex-1 bg-[#111118] border border-[#1e1e2e] rounded-2xl px-4 py-2.5 text-sm placeholder:text-gray-600 focus:outline-none focus:border-[#7c3aed]/60" />
            <button onClick={() => setSearch('')} className="text-xs px-3 py-2 rounded-2xl border border-[#1e1e2e] hover:bg-[#1a1a22]">Limpiar</button>
          </div>
          <CompsTable data={realComps} filter={search} askingPrice={target.asking_price} />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">¿En cuánto tiempo estimamos vender?</h2>
          <p className="text-sm text-gray-400 mt-1">Panel basado en investigación web (Lamudi Reporte Inmobiliario 2026, Inmuebles24 dinamismo Querétaro 2026, benchmarks generales de absorción de terrenos vacantes en mercados MX secundarios).</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 glass rounded-3xl p-6 border border-[#1e1e2e] flex flex-col">
            <div className="uppercase tracking-widest text-xs text-gray-500">Escenario actual (asking $7M)</div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-5xl font-bold tracking-[-2px] text-white tabular-nums">{TARGET_SELL_EST.base}</span>
              <span className="text-lg font-medium text-gray-400">meses</span>
            </div>
            <div className="text-sm mt-1">Rango probable: <span className="font-medium text-[#10b981]">{TARGET_SELL_EST.min} — {TARGET_SELL_EST.max}</span> meses</div>
            <div className="mt-auto pt-5 text-xs leading-snug text-gray-400 border-t border-[#1e1e2e] mt-6">
              Factores que aceleran: marketing dirigido a desarrolladores + copy data-driven (12 aptos, CUS/COS explícitos) + precio alineado.
            </div>
          </div>
          <div className="lg:col-span-3 glass rounded-2xl p-5 border border-[#1e1e2e]">
            <div className="flex justify-between items-baseline mb-3">
              <div className="font-semibold text-sm">Precio de salida vs Tiempo estimado (meses)</div>
              <div className="text-[10px] text-gray-500">Bar = caso base. Líneas = rango</div>
            </div>
            <div className="h-64 -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sellChartData}>
                  <CartesianGrid strokeDasharray="2 2" stroke="#1e1e2e" />
                  <XAxis dataKey="rango" tick={{ fill: '#6b7280', fontSize: 10 }} />
                  <YAxis label={{ value: 'Meses', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11 }} tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#111118', border: '1px solid #1e1e2e', borderRadius: 8 }} />
                  <Bar dataKey="meses" name="Meses estimados (base)" fill="#7c3aed" radius={4}>
                    {sellChartData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 2 ? '#f59e0b' : '#7c3aed'} />
                    ))}
                  </Bar>
                  <Line type="monotone" dataKey="min" stroke="#10b981" strokeWidth={1.5} dot={false} name="Optimista" />
                  <Line type="monotone" dataKey="max" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="2 2" dot={false} name="Pesimista" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="text-[11px] text-amber-400/90 mt-1">Barra naranja = bucket de tu precio actual ($7M).</div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {SELL_TIME_DATA.map((s, idx) => (
            <div key={idx} className={`glass rounded-2xl p-4 border ${idx === 2 ? 'border-[#f59e0b]/60 ring-1 ring-[#f59e0b]/20' : 'border-[#1e1e2e]'}`}>
              <div className="text-xs text-gray-500">{s.rango}</div>
              <div className="font-semibold mt-0.5">{s.precio_label}</div>
              <div className="mt-3 text-3xl font-mono tracking-tight">{s.meses_base} <span className="text-sm text-gray-400">meses</span></div>
              <div className="text-xs text-gray-400">{s.meses_min}–{s.meses_max} meses</div>
              <div className="text-[11px] mt-3 text-gray-400 leading-tight">{s.nota}</div>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-500 px-1">
          Investigación sintetizada de: Lamudi (reporte 2026), Inmuebles24 (crecimiento oferta + dinamismo QRO), benchmarks de absorción de lotes vacantes en México (60-180 días típicos para lotes; lotes grandes 4-10+ meses).
        </div>
      </section>

      <div className="pt-4 border-t border-[#1e1e2e] text-xs text-gray-500 flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
        <div>
          Datos: KPIs titulares y vector de precios calculados sobre los {FULL_DB_COUNT} comps reales scrapeados de Lamudi (mercado amplio) • Modelo fino de referencia calculado sobre 12 comps limpios curados a mano (terrenos sin construcción) — ver reconciliación arriba. Modelo: <span className="font-mono">modelo_precio_simple.py</span> + <span className="font-mono">valuation_output.json</span>.
        </div>
        <div className="flex gap-3">
          <button onClick={() => alert('En producción: re-ejecutar scraper + modelo + refresh.')} className="hover:text-white transition">Re-correr modelo (py)</button>
          <a href="/data/comps_clean.json" className="hover:text-white transition" download>Descargar comps_clean.json</a>
          <a href="/data/valuation_output.json" className="hover:text-white transition" download>valuation_output.json</a>
        </div>
      </div>
    </>
  );
}
