'use client';

import React, { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend, Cell, Line,
} from 'recharts';
import { VALUATION, SELL_TIME_DATA, TARGET_SELL_EST } from '../data/comps';
import { fmtMoney, fmtMX } from '@/lib/format';
import KPICard from './KPICard';
import CompsTable from './CompsTable';
import terrenosFullRaw from '../terrenos_full.json';

const FULL_DB_COUNT = (terrenosFullRaw as any[]).length || 1000;

export default function ValuacionTab() {
  const [search, setSearch] = useState('');

  const target = VALUATION.target;
  const models = VALUATION.models;
  const stats = VALUATION.comps_stats;

  const vectorForChart = VALUATION.price_vector.slice(0, 8).map((v: any) => ({
    name: v.title.substring(0, 18) + (v.title.length > 18 ? '…' : ''),
    implied: Math.round(v.implied_for_target / 1000),
    ppm: Math.round(v.price / v.size_m2),
  }));

  const sellChartData = SELL_TIME_DATA.map(d => ({
    rango: d.precio_label,
    meses: d.meses_base,
    min: d.meses_min,
    max: d.meses_max,
  }));

  const askingPpmVsMedian = Math.round(((target.asking_ppm - stats.median_ppm) / stats.median_ppm) * 100);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Precio Asking" value={target.asking_price} icon="🏷️" color="warning" isMonetary />
        <KPICard title="Mediana Mercado $/m²" value={stats.median_ppm} suffix=" /m²" icon="📏" color="info" />
        <KPICard title="Estimado Ajustado (CUS)" value={models.adjusted_median} icon="🚀" color="accent" isMonetary />
        <KPICard title="Rango Consenso" value={`${fmtMX(models.consensus_low / 1e6, 1)}M - ${fmtMX(models.consensus_high / 1e6, 1)}M`} icon="📊" color="success" />
      </div>

      <div className="glass rounded-3xl p-6 border border-[#1e1e2e]">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="text-sm text-gray-400">Tu asking vs modelo mediana ajustada</div>
            <div className="text-4xl font-bold font-mono tracking-tighter mt-1">
              {fmtMoney(target.asking_price)} <span className="text-base align-super text-gray-500">vs ~{fmtMoney(models.adjusted_median)}</span>
            </div>
          </div>
          <div className="text-right">
            <div className={`inline-block px-4 py-1 rounded-2xl text-sm font-semibold ${target.asking_price <= models.adjusted_median ? 'bg-[#10b981]/15 text-[#10b981]' : 'bg-[#ef4444]/15 text-[#ef4444]'}`}>
              {target.asking_price <= models.adjusted_median ? '✓ ALINEADO O LIGERAMENTE SUBVALORADO' : 'SOBRE PRECIO'}
            </div>
            <div className="text-xs text-gray-500 mt-1">Asking ${fmtMX(target.asking_ppm)}/m² • Mercado mediana limpia ${fmtMX(stats.median_ppm)}/m² (+{askingPpmVsMedian}%)</div>
          </div>
        </div>
        <div className="mt-4 text-xs leading-relaxed text-gray-400">
          Modelo principal: <span className="font-mono text-[#a78bfa]">{models.formula}</span><br />
          +40% por alto potencial densificación (CUS 2.4 permite ~12 aptos vs lotes típicos 1-2 viviendas en los comps).
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Cómo se obtiene la valuación (fórmulas + números)</h2>
          <div className="text-xs px-2 py-0.5 bg-[#1e1e2e] rounded">Fuente: comps_clean.json + modelo_precio_simple.py</div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass rounded-2xl p-5 border border-[#1e1e2e] space-y-3 text-sm">
            <div className="font-semibold text-[#a78bfa]">1. Mediana de comps vacantes (sin construcción)</div>
            <div className="font-mono text-lg">mediana_ppm = {fmtMX(stats.median_ppm)} $/m² <span className="text-xs text-gray-500">(n={stats.n})</span></div>
            <div className="text-gray-400">Base = 660 m² × {fmtMX(stats.median_ppm)} = <span className="text-white font-medium">{fmtMoney(models.base_median)}</span></div>
          </div>
          <div className="glass rounded-2xl p-5 border border-[#1e1e2e] space-y-3 text-sm">
            <div className="font-semibold text-[#a78bfa]">2. Ajuste CUS / potencial desarrollo (roadmap)</div>
            <div>multiplicador_CUS = {models.potential_multiplier}× (12 unidades vs densidad baja de comps)</div>
            <div>multiplicador_zona = {models.zone_premium}× (plusvalía Cimatario)</div>
            <div className="font-mono text-lg">valor_ajustado = {fmtMoney(models.base_median)} × {models.potential_multiplier} × {models.zone_premium} = <span className="text-[#10b981] font-semibold">{fmtMoney(models.adjusted_median)}</span></div>
          </div>
          <div className="glass rounded-2xl p-5 border border-[#1e1e2e] space-y-2 text-sm lg:col-span-2">
            <div className="font-semibold mb-1">Referencias adicionales del modelo</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs md:text-sm">
              <div>Promedio comps (ajustado): <span className="font-medium text-white">{fmtMoney(models.adjusted_mean)}</span></div>
              <div>Lamudi area avg 6,433 $/m² (ajustado): <span className="font-medium text-white">{fmtMoney(models.lamudi_adjusted)}</span></div>
              <div>Rango consenso (ajustado ±8%): <span className="font-medium text-[#10b981]">{fmtMoney(models.consensus_low)} — {fmtMoney(models.consensus_high)}</span></div>
            </div>
            <div className="pt-2 text-[11px] text-gray-500">Nota: Este es prototipo inicial. Próximos pasos (roadmap): sklearn regression, features de vision (vistas, topografía), ajuste por tamaño y tiempo en mercado.</div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Vector de precios: comps vs asking actual</h2>
        <p className="text-sm text-gray-400">Cada comp aplicado al tamaño objetivo (660 m²). Muestra si el mercado "pagaría" más o menos que tu asking.</p>
        <div className="glass rounded-2xl p-5 border border-[#1e1e2e]">
          <div className="h-[260px] -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vectorForChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 10 }} angle={-25} textAnchor="end" height={70} />
                <YAxis tickFormatter={(v) => `${v}k`} tick={{ fill: '#6b7280', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#111118', border: '1px solid #1e1e2e', borderRadius: 8, color: '#e2e2f0' }} />
                <Legend />
                <Bar dataKey="implied" name="Valor implícito del comp (k MXN)" fill="#7c3aed" radius={3} />
                <ReferenceLine y={7000} stroke="#f59e0b" strokeWidth={2} label={{ value: 'Asking 7M', fill: '#f59e0b', fontSize: 11, position: 'insideTopRight' }} />
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
          <CompsTable data={VALUATION.price_vector} filter={search} />
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
            <div className="mt-3 text-6xl font-bold tracking-[-3px] text-white tabular-nums">{TARGET_SELL_EST.base}<span className="text-3xl align-super text-gray-400">meses</span></div>
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
          Datos: 12 comps limpios (terrenos sin construcción) • {FULL_DB_COUNT} entradas en base completa. Modelo: <span className="font-mono">modelo_precio_simple.py</span> + <span className="font-mono">valuation_output.json</span>.
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
