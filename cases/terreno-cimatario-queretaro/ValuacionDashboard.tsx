'use client';

import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, Legend, Cell,
} from 'recharts';

// ====================================================================
// ValuacionDashboard.tsx
// Dashboard mobile-first para valuación comercial del terreno Cimatario
// Copia/adaptación de elementos del financialbot/dashboard-financial:
// - KPICard (glass + accent colors + layout)
// - glass cards, globals.css theme (dark violet accent)
// - Recharts patterns de VolumeChart / OpsTypeChart (tooltips glass, grids, responsive)
// - Tablas estilo OperationsTable (simple native + filters para no deps pesados)
// - Layout: grid KPIs, glass rounded-xl p-5 sections, header
//
// Uso:
// 1. Colócalo en un proyecto Next.js con:
//    "recharts": "^2", "framer-motion" (opcional), tailwind + los tokens de dashboard-financial/app/globals.css + tailwind.config.ts
// 2. Copia también las vars CSS :root y .glass de globals.css
// 3. Para datos reales: import comps_clean.json + valuation_output.json (generados por modelo_precio_simple.py)
// 4. Render: <ValuacionDashboard /> dentro de page.tsx o layout del caso
//
// Todo dentro de klugger/ — sin tocar otros repos.
// Fuentes de datos: 12 comps limpios (terrenos sin construcción) + stats del modelo (roadmap + miniplan + user spec)
// ====================================================================

// Datos embebidos (seed desde research + modelo). Reemplaza importando JSONs cuando integres.
const COMPS_CLEAN = [
  { id: 1, price: 2550000, size_m2: 300, title: "Terreno plano 300m² fracc seguro", location: "Cumbres del Cimatario, Qro", link: "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/", notes: "Frente area verde, vigilancia 24h" },
  { id: 2, price: 1136500, size_m2: 234, title: "Lote Club Golf El Encino 234m²", location: "Cumbres del Cimatario", link: "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/", notes: "24% bajo promedio" },
  { id: 3, price: 2750000, size_m2: 300, title: "Terreno 300m² frente área verde", location: "Cumbres del Cimatario", link: "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/", notes: "Muy poca pendiente, amenidades fracc" },
  { id: 4, price: 2550000, size_m2: 322, title: "Excelente terreno La Biznaga 323m²", location: "Cumbres del Cimatario", link: "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/", notes: "Vista a ciudad y reserva" },
  { id: 5, price: 2650000, size_m2: 335, title: "Terreno 336m² La Biznaga", location: "Cumbres del Cimatario", link: "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/", notes: "Hermosa vista, cerca Centro Sur" },
  { id: 6, price: 1200000, size_m2: 160, title: "Lote Mayant Cimatario 160m²", location: "Cimatario / Huimilpan", link: "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/", notes: "Vistas cañada, seguridad 24/7" },
  { id: 7, price: 756000, size_m2: 180, title: "Oportunidad El Encino 180m²", location: "Cumbres del Cimatario", link: "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/", notes: "34% bajo promedio" },
  { id: 8, price: 1350000, size_m2: 300, title: "Lote 300m² Villas del Sur", location: "Villas del Sur (cerca Cimatario)", link: "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/", notes: "Zona habitacional/parque" },
  { id: 9, price: 2600000, size_m2: 285, title: "Terreno habitacional 285m² Villas del Sur", location: "Villas del Sur, Qro", link: "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/", notes: "Céntrico cerca Alameda" },
  { id: 10, price: 2225000, size_m2: 250, title: "Terreno Mallorca 250m² frente Parque Cimatario", location: "Mallorca Residence, Cimatario", link: "https://www.inmuebles24.com/terrenos-en-venta-en-cimatario.html", notes: "Amenidades, 20min centro" },
  { id: 11, price: 3200000, size_m2: 500, title: "Lote plusvalía 500m² zona crecimiento", location: "Cimatario area", link: "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/", notes: "Potencial desarrollo" },
  { id: 12, price: 2950000, size_m2: 420, title: "Terreno 420m² Cimatario consolidado", location: "Cimatario, Qro", link: "https://www.inmuebles24.com/terrenos-en-venta-en-cimatario.html", notes: "Alta plusvalía" },
];

const VALUATION = {
  target: {
    m2: 660,
    asking_price: 7000000,
    asking_ppm: 10606,
    cus: 2.4,
    cos: 0.6,
    potential_units: 12,
    location: "Lic. Carlos Septien 53, Cimatario, Querétaro (CP 76030)",
  },
  comps_stats: {
    n: 12,
    median_ppm: 7705,
    mean_ppm: 7167,
    min_ppm: 4200,
    max_ppm: 9167,
    lamudi_market_ppm: 6433,
  },
  models: {
    base_median: 5085448,
    adjusted_median: 7475608,
    base_mean: 4729990,
    adjusted_mean: 6953086,
    lamudi_base: 4245780,
    lamudi_adjusted: 6241297,
    potential_multiplier: 1.4,
    zone_premium: 1.05,
    formula: "precio = m2 × mediana_ppm × mult_CUS_dev(1.4) × mult_zona(1.05)",
    consensus_low: 6877560,
    consensus_high: 8073657,
  },
  price_vector: COMPS_CLEAN.map((c, idx) => {
    const implied = Math.round(660 * (c.price / c.size_m2));
    const delta = implied - 7000000;
    return {
      ...c,
      implied_for_target: implied,
      delta_vs_asking: delta,
      pct_vs_asking: Math.round((delta / 7000000) * 1000) / 10,
    };
  }),
};

// Tiempo estimado de venta (sintetizado de investigación web + reportes Lamudi/Inmuebles24 2026 + benchmarks MX)
// Mercado QRO dinámico/estable. Terrenos vacantes tardan más que casas terminadas (DD de compradores devs/autopromotores).
// No hay estadística granular pública exacta por precio/zona; estimados conservadores basados en dinamismo + elasticidad precio.
const SELL_TIME_DATA = [
  { rango: "4.5-5.5M", precio_label: "Base baja (~5M)", meses_base: 3.5, meses_min: 2.5, meses_max: 5, nota: "Rápida absorción si precio agresivo" },
  { rango: "5.5-6.5M", precio_label: "Alineado mercado (~6M)", meses_base: 4.5, meses_min: 3, meses_max: 6, nota: "Típico lote plusvalía QRO" },
  { rango: "6.5-7.5M", precio_label: "Nuestro precio actual (7M)", meses_base: 6.5, meses_min: 5, meses_max: 9, nota: "Highlight: outreach devs acelera" },
  { rango: "7.5-8.5M", precio_label: "Ajustado mediana (~7.5M)", meses_base: 7.5, meses_min: 6, meses_max: 10, nota: "Premium CUS justificado" },
  { rango: "8.5M+", precio_label: "Alto / sobre", meses_base: 10, meses_min: 8, meses_max: 14, nota: "Más negociación o espera" },
];

const TARGET_SELL_EST = { min: 5, base: 6.5, max: 9 }; // meses para 7M

// Helpers (inspirados en fmt de @/lib/api del dashboard-financial)
function fmtMX(n: number, decimals = 0): string {
  return n.toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtMoney(n: number): string {
  return '$' + fmtMX(n, 0);
}
function pct(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

// KPICard inline (copia fiel del components/ui/KPICard.tsx del financial dashboard, adaptado sin import framer si no está)
interface KPICardProps {
  title: string;
  value: number | string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  icon: string;
  color?: 'accent' | 'success' | 'warning' | 'danger' | 'info';
  isMonetary?: boolean;
  trend?: number;
}
const colorMap: Record<string, any> = {
  accent: { bg: 'bg-[#7c3aed]/10', text: 'text-[#a78bfa]', border: 'border-[#7c3aed]/30' },
  success: { bg: 'bg-[#10b981]/10', text: 'text-[#10b981]', border: 'border-[#10b981]/30' },
  warning: { bg: 'bg-[#f59e0b]/10', text: 'text-[#f59e0b]', border: 'border-[#f59e0b]/30' },
  danger: { bg: 'bg-[#ef4444]/10', text: 'text-[#ef4444]', border: 'border-[#ef4444]/30' },
  info: { bg: 'bg-[#3b82f6]/10', text: 'text-[#3b82f6]', border: 'border-[#3b82f6]/30' },
};
function KPICard({ title, value, prefix = '', suffix = '', decimals = 0, icon, color = 'accent', isMonetary = false, trend }: KPICardProps) {
  const c = colorMap[color] || colorMap.accent;
  const display = isMonetary
    ? fmtMoney(typeof value === 'number' ? value : parseFloat(String(value)))
    : typeof value === 'number' ? fmtMX(value, decimals) : value;

  return (
    <div className={`glass rounded-2xl p-5 border ${c.border} relative overflow-hidden transition-all hover:scale-[1.01]`}>
      <div className={`absolute -top-5 -right-5 w-16 h-16 ${c.bg} rounded-full blur-3xl`} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[1px] text-gray-500 mb-1.5">{title}</div>
          <div className={`text-3xl font-bold font-mono tabular-nums tracking-[-1.5px] ${c.text} break-all`}>
            {prefix}{display}{suffix}
          </div>
          {trend !== undefined && (
            <div className={`text-xs mt-1 font-medium ${trend >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}% vs base
            </div>
          )}
        </div>
        <div className="text-4xl opacity-70 flex-shrink-0 mt-0.5">{icon}</div>
      </div>
    </div>
  );
}

// Simple table row component (mobile friendly cards on small screens)
function CompsTable({ data, filter }: { data: any[]; filter: string }) {
  const filtered = useMemo(() => {
    const q = filter.toLowerCase().trim();
    if (!q) return data;
    return data.filter((c: any) =>
      (c.title + c.location + c.notes).toLowerCase().includes(q)
    );
  }, [data, filter]);

  return (
    <div className="space-y-3">
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-[#1e1e2e] bg-[#111118]">
        <table className="w-full text-sm">
          <thead className="bg-[#0a0a0f] text-gray-400">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Terreno / Lote</th>
              <th className="text-right px-4 py-3 font-medium">m²</th>
              <th className="text-right px-4 py-3 font-medium">Precio</th>
              <th className="text-right px-4 py-3 font-medium">$/m²</th>
              <th className="text-right px-4 py-3 font-medium">Implied 660m²</th>
              <th className="text-right px-4 py-3 font-medium">vs Asking</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e2e]">
            {filtered.map((c: any, i: number) => {
              const ppm = Math.round(c.price / c.size_m2);
              const implied = Math.round(660 * (c.price / c.size_m2));
              const delta = implied - 7000000;
              const pctv = ((delta / 7000000) * 100);
              return (
                <tr key={i} className="hover:bg-[#1a1a22] transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{c.title}</div>
                    <div className="text-xs text-gray-500">{c.location}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{c.size_m2}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#a78bfa]">{fmtMoney(c.price)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmtMX(ppm)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmtMoney(implied)}</td>
                  <td className={`px-4 py-3 text-right font-mono ${delta >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                    {pct(pctv)}
                  </td>
                  <td className="px-4 py-3">
                    <a href={c.link} target="_blank" rel="noreferrer" className="text-xs underline text-[#7c3aed] hover:text-[#a78bfa]">ver listing →</a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards */}
      <div className="md:hidden space-y-2">
        {filtered.map((c: any, i: number) => {
          const ppm = Math.round(c.price / c.size_m2);
          const implied = Math.round(660 * (c.price / c.size_m2));
          const delta = implied - 7000000;
          const pctv = ((delta / 7000000) * 100);
          return (
            <div key={i} className="glass rounded-2xl p-4 border border-[#1e1e2e]">
              <div className="flex justify-between gap-3">
                <div>
                  <div className="font-semibold text-white text-[15px] leading-tight">{c.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{c.location}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-[#a78bfa] text-lg">{fmtMoney(c.price)}</div>
                  <div className="text-[11px] text-gray-400">{c.size_m2} m² · {fmtMX(ppm)}/m²</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-[#1e1e2e] flex items-center justify-between text-sm">
                <div>
                  <span className="text-gray-400">Implied 660m²:</span> <span className="font-mono">{fmtMoney(implied)}</span>
                  <span className={`ml-2 font-mono ${delta >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>{pct(pctv)}</span>
                </div>
                <a href={c.link} target="_blank" className="text-[#7c3aed] underline text-xs">ver →</a>
              </div>
              {c.notes && <div className="text-[11px] text-gray-400 mt-1.5">{c.notes}</div>}
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && <div className="text-center py-6 text-sm text-gray-500">Sin resultados para el filtro.</div>}
    </div>
  );
}

export default function ValuacionDashboard() {
  const [search, setSearch] = useState('');
  const [showAllComps, setShowAllComps] = useState(false);

  const target = VALUATION.target;
  const models = VALUATION.models;
  const stats = VALUATION.comps_stats;

  // Vector data for charts (precio vs implied)
  const vectorForChart = VALUATION.price_vector.slice(0, 8).map((v: any, i: number) => ({
    name: v.title.substring(0, 18) + (v.title.length > 18 ? '…' : ''),
    implied: Math.round(v.implied_for_target / 1000),
    asking: Math.round(7000), // k MXN
    ppm: Math.round(v.price / v.size_m2),
  }));

  // Sell time chart data (nice bars)
  const sellChartData = SELL_TIME_DATA.map(d => ({
    rango: d.precio_label,
    meses: d.meses_base,
    min: d.meses_min,
    max: d.meses_max,
  }));

  // Our target highlight row
  const askingPpmVsMedian = Math.round(((target.asking_ppm - stats.median_ppm) / stats.median_ppm) * 100);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e2e2f0] font-sans">
      {/* Header - mobile first, sticky */}
      <div className="sticky top-0 z-50 bg-[#0a0a0f]/95 backdrop-blur border-b border-[#1e1e2e]">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#7c3aed] flex items-center justify-center text-white font-bold text-lg">K</div>
            <div>
              <div className="font-semibold text-lg tracking-[-0.3px]">Klugger Inmuebles</div>
              <div className="text-[10px] text-gray-500 -mt-0.5">CASO • Cimatario, Querétaro</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#111118] border border-[#1e1e2e]">
              <div className="w-1.5 h-1.5 bg-[#10b981] rounded-full animate-pulse" /> Datos Jun 2026
            </div>
            <a href="https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/" target="_blank" className="underline text-[#7c3aed] hover:text-[#a78bfa]">Fuente mercado</a>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-6 pb-20 space-y-8">
        {/* HERO */}
        <div>
          <div className="uppercase text-xs tracking-[2px] text-[#7c3aed] font-semibold mb-1">Valuación Comercial • Prototipo Roadmap</div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-[-2.2px] text-white">Terreno 660 m² — Cimatario</h1>
          <p className="mt-2 text-lg text-gray-400 max-w-2xl">Precio comercial estimado usando <span className="font-medium text-white">mediana de comps vacantes</span> × m² + ajustes por CUS 2.4 / potencial 12 unidades (modelos del REAL_ESTATE_ROADMAP + mini-plan).</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="px-3 py-1 rounded-full bg-[#111118] border border-[#1e1e2e]">12 comps limpios (sin construcción)</span>
            <span className="px-3 py-1 rounded-full bg-[#111118] border border-[#1e1e2e]">176 filas scraper total (raw)</span>
            <span className="px-3 py-1 rounded-full bg-[#111118] border border-[#1e1e2e]">Mobile-first • Recharts + glass</span>
          </div>
        </div>

        {/* KPIs principales - 2 cols mobile, 4 desktop (exactamente patrón dashboard-financial) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard title="Precio Asking" value={target.asking_price} icon="🏷️" color="warning" isMonetary />
          <KPICard title="Mediana Mercado $/m²" value={stats.median_ppm} suffix=" /m²" icon="📏" color="info" />
          <KPICard title="Estimado Ajustado (CUS)" value={models.adjusted_median} icon="🚀" color="accent" isMonetary />
          <KPICard title="Rango Consenso" value={`${fmtMX(models.consensus_low / 1e6, 1)}M - ${fmtMX(models.consensus_high / 1e6, 1)}M`} icon="📊" color="success" />
        </div>

        {/* Resumen rápido + delta */}
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
            Modelo principal (roadmap + especificación usuario): <span className="font-mono text-[#a78bfa]">{models.formula}</span><br />
            +40% por alto potencial densificación (CUS 2.4 permite ~12 aptos vs lotes típicos 1-2 viviendas en los comps).
          </div>
        </div>

        {/* SECCIÓN: EXPLICACIÓN VALUACIÓN CON FÓRMULAS NUMÉRICAS */}
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

        {/* VECTOR DE PRECIOS + GRÁFICO COMPARACIÓN */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Vector de precios: comps vs asking actual</h2>
          <p className="text-sm text-gray-400">Cada comp aplicado al tamaño objetivo (660 m²). Muestra si el mercado “pagaría” más o menos que tu asking.</p>

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
                  <ReferenceLine y={7000} stroke="#f59e0b" strokeWidth={2} label={{ value: "Asking 7M", fill: '#f59e0b', fontSize: 11, position: 'insideTopRight' }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Filtro + Tabla de vector / comps */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar comps (ej. Biznaga, Encino...)"
                className="flex-1 bg-[#111118] border border-[#1e1e2e] rounded-2xl px-4 py-2.5 text-sm placeholder:text-gray-600 focus:outline-none focus:border-[#7c3aed]/60"
              />
              <button onClick={() => setSearch('')} className="text-xs px-3 py-2 rounded-2xl border border-[#1e1e2e] hover:bg-[#1a1a22]">Limpiar</button>
            </div>
            <CompsTable data={VALUATION.price_vector} filter={search} />
          </div>
        </section>

        {/* TIEMPO ESTIMADO DE VENTA + GRÁFICA (investigación internet) */}
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">¿En cuánto tiempo estimamos vender?</h2>
            <p className="text-sm text-gray-400 mt-1">Panel basado en investigación web (Lamudi Reporte Inmobiliario 2026, Inmuebles24 dinamismo Querétaro 2026, benchmarks generales de absorción de terrenos vacantes en mercados MX secundarios). No existen cifras públicas ultra-granulares por precio exacto y colonia; los rangos son estimados sintetizados y conservadores.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* KPI tiempo */}
            <div className="lg:col-span-2 glass rounded-3xl p-6 border border-[#1e1e2e] flex flex-col">
              <div className="uppercase tracking-widest text-xs text-gray-500">Escenario actual (asking $7M)</div>
              <div className="mt-3 text-6xl font-bold tracking-[-3px] text-white tabular-nums">{TARGET_SELL_EST.base}<span className="text-3xl align-super text-gray-400">meses</span></div>
              <div className="text-sm mt-1">Rango probable: <span className="font-medium text-[#10b981]">{TARGET_SELL_EST.min} — {TARGET_SELL_EST.max}</span> meses</div>

              <div className="mt-auto pt-5 text-xs leading-snug text-gray-400 border-t border-[#1e1e2e] mt-6">
                Factores que aceleran: marketing dirigido a desarrolladores + copy data-driven (12 aptos, CUS/COS explícitos) + precio alineado. Terrenos para desarrollo tardan más que casas terminadas por due diligence del comprador.
              </div>
            </div>

            {/* Gráfica atractiva de tiempo vs precio */}
            <div className="lg:col-span-3 glass rounded-2xl p-5 border border-[#1e1e2e]">
              <div className="flex justify-between items-baseline mb-3">
                <div className="font-semibold text-sm">Precio de salida vs Tiempo estimado de venta (meses)</div>
                <div className="text-[10px] text-gray-500">Bar = caso base. Sombras = rango min/max</div>
              </div>
              <div className="h-64 -mx-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sellChartData}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#1e1e2e" />
                    <XAxis dataKey="rango" tick={{ fill: '#6b7280', fontSize: 10 }} />
                    <YAxis label={{ value: 'Meses', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11 }} tick={{ fill: '#6b7280', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#111118', border: '1px solid #1e1e2e', borderRadius: 8 }} />
                    <Bar dataKey="meses" name="Meses estimados (base)" fill="#7c3aed" radius={4}>
                      {sellChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 2 ? '#f59e0b' : '#7c3aed'} /> // highlight our price bucket
                      ))}
                    </Bar>
                    {/* Líneas de rango visual */}
                    <Line type="monotone" dataKey="min" stroke="#10b981" strokeWidth={1.5} dot={false} name="Optimista" />
                    <Line type="monotone" dataKey="max" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="2 2" dot={false} name="Pesimista" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="text-[11px] text-amber-400/90 mt-1">Barra naranja = bucket de tu precio actual ($7M). Outreach a desarrolladores + landing custom puede moverlo hacia el extremo optimista.</div>
            </div>
          </div>

          {/* Escenarios detallados */}
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
            Investigación sintetizada de: Lamudi (reporte 2026 + precio m² área), Inmuebles24 (crecimiento oferta + dinamismo QRO), benchmarks generales de absorción de lotes vacantes en México (mercados secundarios activos: 60-180 días típicos para lotes; lotes grandes o de desarrollo 4-10+ meses). Elasticidad precio observada: precios >15-20% sobre mediana local extienden el tiempo.
          </div>
        </section>

        {/* FOOTER / NOTAS + ACCIONES */}
        <div className="pt-4 border-t border-[#1e1e2e] text-xs text-gray-500 flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
          <div>
            Datos: 12 comps limpios (terrenos sin construcción) • Scraper produjo 176 entradas (algunas ruidosas). Modelo actualizado en <span className="font-mono">modelo_precio_simple.py</span> + <span className="font-mono">valuation_output.json</span>.
          </div>
          <div className="flex gap-3">
            <button onClick={() => alert('En producción: re-ejecutar scraper + modelo + refresh.')} className="hover:text-white transition">Re-correr modelo (py)</button>
            <a href="data/comps_clean.json" className="hover:text-white transition" download>Descargar comps_clean.json</a>
            <a href="data/valuation_output.json" className="hover:text-white transition" download>valuation_output.json</a>
          </div>
        </div>
      </div>
    </div>
  );
}
