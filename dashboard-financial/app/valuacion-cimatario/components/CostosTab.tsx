'use client';

import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  ResponsiveContainer, LabelList,
} from 'recharts';
import apiCostsRaw from '../data/api-costs.json';
import KPICard from './KPICard';

// ── Tipos + fuente ───────────────────────────────────────────────────────────
// api-costs.json es un array plano de líneas de gasto. Se importa como
// cualquier otro JSON del proyecto (mismo patrón que terrenos_full.json en
// DatabaseTab.tsx / HbuTab.tsx): Next.js con resolveJsonModule inlinea el
// contenido en el bundle en build time, así que funciona igual en dev, en el
// server Node y en `next build` con NEXT_STATIC_EXPORT=true (no hay fetch en
// runtime, no hay dependencia del filesystem del server).
interface ApiCostEntry {
  date: string;
  api: string;
  operation: string;
  units: number;
  unit_cost_usd: number;
  cost_usd: number;
  note?: string;
}

const ENTRIES = apiCostsRaw as ApiCostEntry[];

// Tope de presupuesto para FAL (fal.ai) mencionado en el objetivo del tab.
// Si en el futuro se agregan más presupuestos por API, esto se vuelve un
// Record<string, number> — por ahora un solo tope justifica mantenerlo simple.
//
// FAL/fal.ai puede aparecer en el dataset con varios nombres de `api` (un
// modelo por línea, p.ej. "FAL flux/schnell" y "FAL kling-video 1.6 std
// i2v") — todos cuentan contra el mismo tope. El match es por PREFIJO
// case-insensitive, no por nombre exacto, para no perder gasto silenciosamente
// cuando se agregue un modelo FAL nuevo al JSON.
const FAL_BUDGET_USD = 5;
const FAL_PREFIX = 'FAL';

// ── Paleta compartida (tokens del design system, no hex sueltos) ────────────
const C = {
  green: 'var(--brand-green)',
  violet: 'var(--brand-violet)',
  violetLight: 'var(--brand-violet-light)',
  amber: 'var(--accent-amber)',
  danger: 'var(--danger)',
};
// Recharts necesita valores de color resolvibles fuera del árbol de React
// (SVG fill/stroke) — los tokens CSS funcionan porque se resuelven contra
// :root en el navegador, igual que en className `bg-[var(--brand-green)]`.
const SERIES_COLORS = [C.green, C.violet, C.amber, C.danger, C.violetLight];

function fmtUSD(n: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

// Montos <$0.10 pierden toda significancia con 2 decimales (p.ej. $0.012
// redondea a "$0.01", casi indistinguible de $0.00 frente a un total como
// $1.99). Para esos casos se muestran 3 decimales; el resto usa el formato
// estándar de 2 — consistente y sin perder precisión donde importa.
function fmtUSDSmart(n: number): string {
  return fmtUSD(n, Math.abs(n) > 0 && Math.abs(n) < 0.1 ? 3 : 2);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

// NOTE: mismo fix que DatabaseTab.tsx / EstudioMercadoTab.tsx — los wrappers
// de gráficas usan fondo plano opaco en vez de `.glass` (que trae
// backdrop-filter: blur), porque backdrop-filter compone mal sobre el SVG de
// Recharts durante captura de screenshot full-page headless (la capa
// blureada pinta encima de barras/áreas).
function ChartCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="chart-card-enter bg-[#111118] rounded-2xl p-4 border border-[#1e1e2e]">
      {title && <h4 className="text-sm font-semibold text-gray-300 mb-3">{title}</h4>}
      {children}
    </div>
  );
}

const AXIS_TICK = { fill: '#6b7280', fontSize: 10 };
const PER_PAGE = 10;

export default function CostosTab() {
  const [page, setPage] = useState(1);

  // Todo el trabajo de agregación se deriva una sola vez de ENTRIES (módulo
  // estático, no cambia en runtime) — useMemo con [] evita recalcular en
  // cada render sin necesidad de re-derivar dependencias.
  const { totalUsd, totalUnits, apiCount, byApi, cumulative, sortedEntries, falSpent, falApiNames } = useMemo(() => {
    const sorted = [...ENTRIES].sort((a, b) => a.date.localeCompare(b.date));

    const totalUsd = sorted.reduce((sum, e) => sum + e.cost_usd, 0);
    const totalUnits = sorted.reduce((sum, e) => sum + e.units, 0);

    const byApiMap = new Map<string, number>();
    for (const e of sorted) byApiMap.set(e.api, (byApiMap.get(e.api) ?? 0) + e.cost_usd);
    const byApi = Array.from(byApiMap.entries())
      .map(([api, cost_usd]) => ({ api, cost_usd }))
      .sort((a, b) => b.cost_usd - a.cost_usd);

    // Serie acumulada por fecha: se agrupa primero por día calendario (misma
    // fecha con múltiples llamadas cuenta como un solo punto), luego se hace
    // suma corrida sobre esos totales diarios ordenados cronológicamente.
    const byDayMap = new Map<string, number>();
    for (const e of sorted) {
      const day = e.date.slice(0, 10); // 'YYYY-MM-DD'
      byDayMap.set(day, (byDayMap.get(day) ?? 0) + e.cost_usd);
    }
    let running = 0;
    const cumulative = Array.from(byDayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, dayCost]) => {
        running += dayCost;
        return { day, dayCost, acumulado: Math.round(running * 10000) / 10000 };
      });

    // Suma TODAS las líneas cuyo `api` empiece con "FAL" (case-insensitive),
    // no solo un nombre exacto — el dataset trae un `api` distinto por
    // modelo (flux/schnell, kling-video, etc.) y todos gastan del mismo
    // presupuesto de fal.ai.
    let falSpent = 0;
    const falApiNames: string[] = [];
    for (const [api, cost] of byApiMap) {
      if (api.toUpperCase().startsWith(FAL_PREFIX)) {
        falSpent += cost;
        falApiNames.push(api);
      }
    }

    return {
      totalUsd, totalUnits, apiCount: byApiMap.size, byApi, cumulative,
      sortedEntries: sorted, falSpent, falApiNames,
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(sortedEntries.length / PER_PAGE));
  const pageItems = sortedEntries.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const falPct = FAL_BUDGET_USD > 0 ? (falSpent / FAL_BUDGET_USD) * 100 : 0;
  const falColor = falPct >= 100 ? 'danger' : falPct >= 75 ? 'warning' : 'success';

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold tracking-tight mb-1">💰 Costos de APIs Externas</h2>
        <p className="text-sm text-gray-400 max-w-2xl">
          Gasto real en APIs de pago (Google Maps/Geocoding/StreetView, FAL/fal.ai, etc.) usadas para construir este
          dashboard. <strong className="text-white">No incluye</strong> agentes/LLM Claude — corren vía CLI proxy sin
          costo adicional.
        </p>
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard index={0} title="Gasto total" value={totalUsd} prefix="$" suffix=" USD" decimals={2} icon="💵" color="accent" />
        <KPICard index={1} title="Llamadas / unidades" value={totalUnits} icon="🔢" color="info" />
        <KPICard index={2} title="APIs distintas" value={apiCount} icon="🧩" color="info" />
        <KPICard
          index={3}
          title={`FAL vs. tope ($${FAL_BUDGET_USD})`}
          value={falPct}
          suffix="%"
          decimals={1}
          icon={falPct >= 100 ? '🚨' : '🛡️'}
          color={falColor}
        />
      </div>

      {/* Barra de presupuesto FAL — refuerzo visual del KPI de arriba con el
          monto absoluto (el KPI solo muestra %). */}
      <div className="bg-[#111118] rounded-2xl p-4 border border-[#1e1e2e]">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-gray-400">
            Presupuesto FAL/fal.ai {falApiNames.length > 0 && `(${falApiNames.join(' + ')})`}
          </span>
          <span className="font-mono tabular-nums">
            {fmtUSDSmart(falSpent)} <span className="text-gray-500">/ {fmtUSD(FAL_BUDGET_USD, 0)}</span>
          </span>
        </div>
        <div className="h-2.5 bg-[#1e1e2e] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{
              width: `${Math.min(falPct, 100)}%`,
              background: falColor === 'danger' ? C.danger : falColor === 'warning' ? C.amber : C.green,
            }}
          />
        </div>
      </div>

      {/* Desglose por API + serie acumulada */}
      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="Desglose de gasto por API">
          {/* Barras horizontales: los nombres de `api` son largos ("FAL
              kling-video 1.6 std i2v", "Google Places / Maps") y en un eje-X
              vertical se encimaban/truncaban. Con layout="vertical" el
              nombre va en el eje Y (categoría), con ancho fijo para que
              quepa completo y legible. */}
          <ResponsiveContainer width="100%" height={Math.max(220, byApi.length * 56)} debounce={50}>
            <BarChart data={byApi} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} tickFormatter={(v) => `$${v}`} />
              <YAxis type="category" dataKey="api" tick={AXIS_TICK} width={140} />
              <Tooltip
                contentStyle={{ background: '#111118', border: '1px solid #1e1e2e', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => fmtUSDSmart(v)}
              />
              <Bar dataKey="cost_usd" name="Costo (USD)" radius={[0, 4, 4, 0]} animationDuration={300} animationEasing="ease-out">
                {byApi.map((_, i) => <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />)}
                <LabelList dataKey="cost_usd" position="right" formatter={(v: number) => fmtUSDSmart(v)} style={{ fill: '#9ca3af', fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Gasto acumulado en el tiempo">
          {cumulative.length > 1 ? (
            <ResponsiveContainer width="100%" height={260} debounce={50}>
              <AreaChart data={cumulative} margin={{ left: 8, right: 12 }}>
                <defs>
                  <linearGradient id="costos-acumulado-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.violet} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C.violet} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="day" tickFormatter={fmtDate} tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} tickFormatter={(v) => `$${v}`} width={48} />
                <Tooltip
                  contentStyle={{ background: '#111118', border: '1px solid #1e1e2e', borderRadius: 8, fontSize: 12 }}
                  labelFormatter={fmtDate}
                  formatter={(v: number) => fmtUSD(v)}
                />
                <Area type="monotone" dataKey="acumulado" name="Acumulado (USD)" stroke={C.violet} strokeWidth={2}
                  fill="url(#costos-acumulado-fill)" dot={{ r: 4, fill: C.violet }} animationDuration={400} animationEasing="ease-out" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            // Un solo día de datos: un área/línea con 1 punto no comunica
            // tendencia — se muestra el número directo en vez de una gráfica
            // vacía engañosa.
            <div className="h-[260px] flex flex-col items-center justify-center text-center gap-1">
              <div className="text-3xl font-mono font-bold tabular-nums text-[var(--brand-violet-light)]">
                {cumulative.length === 1 ? fmtUSD(cumulative[0].acumulado) : fmtUSD(0)}
              </div>
              <div className="text-xs text-gray-500 max-w-xs">
                El seguimiento por día iniciará al registrarse gasto en fechas distintas.
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Tabla de entradas */}
      <section className="space-y-3">
        <h3 className="text-xl font-semibold">Detalle de llamadas</h3>
        <div className="overflow-x-auto rounded-2xl border border-[#1e1e2e] bg-[#111118]">
          {/* table-fixed + anchos explícitos: fuerza a "Operación" (la única
              columna sin ancho fijo, toma el resto) a envolver texto en vez
              de forzar overflow-x en toda la tabla — así el contenido largo
              se lee completo sin scroll horizontal ni truncado. */}
          <table className="w-full text-sm table-fixed">
            <thead className="bg-[#0a0a0f] text-gray-400">
              <tr>
                <th className="px-3 py-2 text-left w-20">Fecha</th>
                <th className="px-3 py-2 text-left w-40">API</th>
                <th className="px-3 py-2 text-left">Operación</th>
                <th className="px-3 py-2 text-right w-20">Unidades</th>
                <th className="px-3 py-2 text-right w-24">Costo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e2e]">
              {pageItems.length > 0 ? pageItems.map((e, idx) => (
                <tr key={`${e.date}-${idx}`} className="bg-[#0f0f15] hover:bg-[#1a1a22]">
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{fmtDate(e.date)}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className="inline-block px-2 py-0.5 rounded-full bg-[#1e1e2e] text-gray-300 whitespace-normal break-words leading-tight" title={e.api}>{e.api}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-300 whitespace-normal break-words" title={e.operation}>
                    {e.operation}
                    {e.note && <div className="text-[10px] text-gray-500 mt-0.5">{e.note}</div>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{e.units}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-[var(--brand-violet-light)]">{fmtUSDSmart(e.cost_usd)}</td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Sin registros de costos aún.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {sortedEntries.length > PER_PAGE && (
          <div className="flex justify-between items-center text-sm">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded border border-[#1e1e2e] disabled:opacity-50">← Anterior</button>
            <span>Página {page} de {totalPages} — {pageItems.length} de {sortedEntries.length}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 rounded border border-[#1e1e2e] disabled:opacity-50">Siguiente →</button>
          </div>
        )}
      </section>

      {/* Subtle mount animation for chart cards — mismo patrón que
          EstudioMercadoTab.tsx / DatabaseTab.tsx: transición CSS plana (no
          backdrop-filter), respeta prefers-reduced-motion. */}
      <style jsx>{`
        .chart-card-enter {
          animation: chart-card-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes chart-card-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .chart-card-enter { animation: none; }
        }
      `}</style>
    </div>
  );
}
