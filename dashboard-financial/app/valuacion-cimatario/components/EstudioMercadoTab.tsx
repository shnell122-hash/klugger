'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import KPICard from './KPICard';
import { fmtMX } from '@/lib/format';
import {
  conectividad, proyeccionPoblacion, estructuraEdad, cimatarioEdad, migracion,
  viviendaTipologia, mercadoBigDataVsInegi, salud, educacion, empleo, idh,
  ecosistema5km, benchmarks, coLivingListings, cuartosRentaLevantamiento,
  inversiones, foda, riesgos, haiv, predio,
} from '../data/estudio-mercado';
import type { CoLivingListing, CuartoRentaLevantamiento, Riesgo } from '../data/estudio-mercado';

// react-leaflet touches `window` on import — must stay client-only, same
// pattern already used by HbuTab.tsx for this exact component.
const MapboxMap = dynamic(() => import('../MapboxMap'), {
  ssr: false,
  loading: () => (
    <div style={{ height: 380, background: '#0a0a0f', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', border: '1px solid #1e1e2e' }}>
      Cargando mapa...
    </div>
  ),
});

interface EstudioMercadoTabProps {
  /** Lets section 12 (Modelo HAIV) jump the user to the HBU/HBV tab, which owns the full pro-forma. */
  onNavigateHbu?: () => void;
}

// ── Paleta compartida (acentos Klugger + series categóricas) ────────────────
const C = {
  accent: '#7c3aed',
  accentLight: '#a78bfa',
  success: '#10b981',
  neon: '#00FF66',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
};
const PIE_COLORS = [C.success, C.accent, C.warning, C.info, C.danger];

function fmtPesos(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
}
function fmtPct(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}

// ── Bloques reutilizables ────────────────────────────────────────────────────

function Source({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-gray-500 mt-2 leading-snug">📎 {children}</p>;
}

function SectionHeading({ icon, title, insight }: { icon: string; title: string; insight?: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
        <span>{icon}</span> {title}
      </h2>
      {insight && <p className="text-sm text-gray-400 mt-1.5 max-w-3xl leading-relaxed">{insight}</p>}
    </div>
  );
}

// NOTE: same fix as DatabaseTab.tsx — chart wrappers use a flat opaque
// background instead of `.glass` (which sets backdrop-filter: blur), because
// backdrop-filter composites incorrectly over Recharts' SVG during headless
// full-page screenshot capture (blurred layer paints over the bars/points).
function ChartCard({ title, height, children, className = '' }: { title?: string; height?: number; children: React.ReactNode; className?: string }) {
  return (
    <div className={`chart-card-enter bg-[#111118] rounded-2xl p-4 border border-[#1e1e2e] ${className}`}>
      {title && <h4 className="text-sm font-semibold text-gray-300 mb-3">{title}</h4>}
      {children}
    </div>
  );
}

function Badge({ children, color = 'accent' }: { children: React.ReactNode; color?: 'accent' | 'success' | 'warning' | 'danger' }) {
  const map: Record<string, string> = {
    accent: 'bg-[#7c3aed]/15 text-[#a78bfa] border-[#7c3aed]/30',
    success: 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30',
    warning: 'bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/30',
    danger: 'bg-[#ef4444]/15 text-[#ef4444] border-[#ef4444]/30',
  };
  return <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${map[color]}`}>{children}</span>;
}

const AXIS_TICK = { fill: '#6b7280', fontSize: 10 };

export default function EstudioMercadoTab({ onNavigateHbu }: EstudioMercadoTabProps) {
  // ── 1. Conectividad ──────────────────────────────────────────────────────
  const conectividadOrdenada = useMemo(
    () => [...conectividad.data].sort((a, b) => a.distancia_km - b.distancia_km),
    []
  );

  // ── 8b. Co-living listings: buscador + filtro + orden ───────────────────
  const [colivingQuery, setColivingQuery] = useState('');
  const [colivingCategoria, setColivingCategoria] = useState<'all' | CoLivingListing['categoria']>('all');
  const [colivingSort, setColivingSort] = useState<'asc' | 'desc'>('asc');
  const categoriaLabels: Record<CoLivingListing['categoria'], string> = {
    mundo: 'Mundo', mexico: 'México', queretaro: 'Querétaro', queretaro_estudiantil: 'Qro. Estudiantil',
  };
  const filteredListings = useMemo(() => {
    let list = coLivingListings.data;
    if (colivingCategoria !== 'all') list = list.filter((l) => l.categoria === colivingCategoria);
    const q = colivingQuery.trim().toLowerCase();
    if (q) list = list.filter((l) => `${l.nombre} ${l.ubicacion}`.toLowerCase().includes(q));
    return [...list].sort((a, b) => (colivingSort === 'asc' ? a.precioMin - b.precioMin : b.precioMin - a.precioMin));
  }, [colivingQuery, colivingCategoria, colivingSort]);

  const avgByCategoria = useMemo(() => {
    const groups: Partial<Record<CoLivingListing['categoria'], number[]>> = {};
    coLivingListings.data.forEach((l) => {
      (groups[l.categoria] ??= []).push(l.precioMin);
    });
    return (Object.entries(groups) as [CoLivingListing['categoria'], number[]][]).map(([cat, arr]) => ({
      categoria: categoriaLabels[cat],
      precioMinProm: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
    }));
  }, []);

  function countServicios(s: CuartoRentaLevantamiento['servicios']): number {
    return Object.values(s).filter(Boolean).length;
  }
  const cuartosOrdenados = useMemo(
    () => [...cuartosRentaLevantamiento.data].sort((a, b) => a.segmento.localeCompare(b.segmento) || a.precioMensual - b.precioMensual),
    []
  );

  // ── 10. Inversión — comparables monetarios en MDP (escala log por la brecha 14,942 vs ~56-63) ─
  const inversionData = [
    { proyecto: 'Cloud-HQ Data Center', mdp: inversiones.data.cloudHQDataCenter.inversionMDP },
    { proyecto: 'Cimatario Secc. 2', mdp: Math.round((inversiones.data.cimatarioSeccion2.inversionMXN / 1_000_000) * 100) / 100 },
    { proyecto: 'Cimatario Secc. 3', mdp: Math.round((inversiones.data.cimatarioSeccion3.inversionMXN / 1_000_000) * 100) / 100 },
  ];

  // ── 11. Riesgos — heatmap prob × impacto ────────────────────────────────
  function riesgoColor(r: Riesgo): string {
    return r.clasificacion === 'Importante' ? C.danger : C.warning;
  }
  function RiesgoTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Riesgo }> }) {
    if (!active || !payload?.length) return null;
    const r = payload[0].payload;
    return (
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-3 text-xs max-w-[260px] shadow-xl">
        <div className="font-semibold text-white mb-1">{r.tipo} · {r.clasificacion} (crítico {r.valorCritico})</div>
        <div className="text-gray-300 mb-1.5">{r.amenaza}</div>
        <div className="text-gray-500 mb-1.5">Probabilidad {r.probabilidad}/10 · Impacto {r.impacto}/10</div>
        <div className="text-[#a78bfa]">{r.estrategia}</div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div>
        <div className="uppercase text-xs tracking-[2px] text-[#7c3aed] font-semibold mb-1">Estudio de Mercado 2023 · Fiel a fuente</div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Estudio de Mercado — Colonia Cimatario</h1>
        <p className="mt-2 text-sm text-gray-400 max-w-3xl leading-relaxed">
          Cada dato citado abajo existe literalmente en <code className="text-[#a78bfa]">analisisCimatario2023.md</code> o{' '}
          <code className="text-[#a78bfa]">transcripcionEstudioMercado2023.md</code>. Donde la fuente no reporta una cifra
          (p. ej. una serie numérica de ciclo de vida, o puntos intermedios 2023-2029 de población), se omite y se aclara en el
          texto en vez de interpolar o inventar.
        </p>
      </div>

      {/* ── 1. Conectividad & movilidad ─────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          icon="🚗"
          title="1. Conectividad & movilidad"
          insight={<>Los 8 puntos de interés desde el predio abarcan de 2.7 km / 11 min (Centro Histórico) hasta 72.2 km / 63 min
          (Cadereyta de Montes) — el predio queda dentro del anillo de traslados cortos hacia el corazón urbano de Querétaro.</>}
        />
        <div className="grid md:grid-cols-2 gap-4">
          <ChartCard title="Distancia desde el predio (km)" height={280}>
            <ResponsiveContainer width="100%" height={280} debounce={50}>
              <BarChart data={conectividadOrdenada} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} unit=" km" />
                <YAxis type="category" dataKey="lugar" tick={{ ...AXIS_TICK, fontSize: 10 }} width={150} />
                <Tooltip />
                <Bar dataKey="distancia_km" name="km" fill={C.accent} radius={[0, 4, 4, 0]} animationDuration={300} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Tiempo de traslado (min)" height={280}>
            <ResponsiveContainer width="100%" height={280} debounce={50}>
              <BarChart data={conectividadOrdenada} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} unit=" min" />
                <YAxis type="category" dataKey="lugar" tick={{ ...AXIS_TICK, fontSize: 10 }} width={150} />
                <Tooltip />
                <Bar dataKey="tiempo_min" name="min" fill={C.success} radius={[0, 4, 4, 0]} animationDuration={300} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        <Source>{conectividad.source}</Source>
      </section>

      {/* ── 2. Demografía & bono ────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          icon="👥"
          title="2. Demografía & bono demográfico"
          insight={<>El municipio pasa de 1,007,923 (2022) a 1,138,178 habitantes estimados (2030): ~130,000 nuevos residentes.
          El bono demográfico se concentra en 20-34 años (27.5% de la población), con edad mediana de 30 años y relación de
          dependencia de 41%.</>}
        />
        <div className="grid md:grid-cols-2 gap-4">
          <ChartCard title="Proyección de población municipal">
            <ResponsiveContainer width="100%" height={230} debounce={50}>
              <LineChart data={proyeccionPoblacion.data} margin={{ left: 8, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="anio" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} tickFormatter={(v) => fmtMX(v / 1000) + 'k'} width={48} />
                <Tooltip formatter={(v: number) => fmtMX(v)} />
                <Line type="monotone" dataKey="poblacionMunicipio" name="Población" stroke={C.neon} strokeWidth={3}
                  dot={{ r: 5, fill: C.neon }} animationDuration={400} animationEasing="ease-out" />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-[11px] text-gray-500 mt-2">Solo 2 datapoints existen en la fuente (2022 y 2030); no se interpolan años intermedios para no alucinar cifras anuales.</p>
          </ChartCard>
          <ChartCard title="Estructura por edad — bono demográfico (20-34)">
            <ResponsiveContainer width="100%" height={230} debounce={50}>
              <BarChart data={estructuraEdad.data.rangos} margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="rango" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} tickFormatter={(v) => fmtMX(v / 1000) + 'k'} width={48} />
                <Tooltip formatter={(v: number) => fmtMX(v)} />
                <Bar dataKey="poblacion" name="Población" fill={C.accent} radius={[4, 4, 0, 0]} animationDuration={300} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge>20-34 años: {fmtPct(estructuraEdad.data.agregado20a34Pct)}</Badge>
              <Badge color="success">Edad mediana: {estructuraEdad.data.edadMedianaAnios} años</Badge>
              <Badge color="warning">Dependencia: {fmtPct(estructuraEdad.data.relacionDependenciaPct)}</Badge>
            </div>
          </ChartCard>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Habitantes Cimatario', val: fmtMX(cimatarioEdad.data.totalHabitantes) },
            { label: 'Hogares', val: fmtMX(cimatarioEdad.data.hogares) },
            { label: 'Edad promedio', val: `${cimatarioEdad.data.edadPromedio} años` },
            { label: 'Escolaridad prom.', val: `${cimatarioEdad.data.escolaridadPromedioAnios} años` },
            { label: 'Densidad', val: `${fmtMX(cimatarioEdad.data.densidadHabKm2)} hab/km²` },
          ].map((k) => (
            <div key={k.label} className="glass p-3 rounded-xl border border-[#1e1e2e]">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">{k.label}</div>
              <div className="text-lg font-mono font-bold tabular-nums text-white">{k.val}</div>
            </div>
          ))}
        </div>
        <Source>{proyeccionPoblacion.source} · {estructuraEdad.source} · {cimatarioEdad.source}</Source>
      </section>

      {/* ── 3. Migración ─────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          icon="✈️"
          title="3. Migración"
          insight={<>Querétaro atrae 26,730 inmigrantes interestatales frente a 8,651 emigrantes — un saldo neto ampliamente
          positivo que lo posiciona como <strong className="text-white">4º lugar nacional</strong> en atracción migratoria (CONAPO 2020).</>}
        />
        <div className="flex flex-wrap gap-2">
          <Badge color="success">🏆 4º lugar nacional en atracción migratoria</Badge>
        </div>
        <ChartCard title="Inmigrantes vs. emigrantes (CONAPO 2020)">
          <ResponsiveContainer width="100%" height={260} debounce={50}>
            <BarChart
              data={[
                { tipo: 'Interestatal', Inmigrantes: migracion.data.inmigrantesInterestatales, Emigrantes: migracion.data.emigrantesInterestatales },
                { tipo: 'Internacional', Inmigrantes: migracion.data.inmigrantesInternacionales, Emigrantes: migracion.data.emigrantesInternacionales },
              ]}
              margin={{ left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis dataKey="tipo" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} tickFormatter={(v) => fmtMX(v / 1000) + 'k'} width={48} />
              <Tooltip formatter={(v: number) => fmtMX(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Inmigrantes" fill={C.success} radius={[4, 4, 0, 0]} animationDuration={300} animationEasing="ease-out" />
              <Bar dataKey="Emigrantes" fill={C.danger} radius={[4, 4, 0, 0]} animationDuration={300} animationEasing="ease-out" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <Source>{migracion.source}</Source>
      </section>

      {/* ── 4. Vivienda ──────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          icon="🏠"
          title="4. Vivienda"
          insight={<>El stock censal municipal es 84.9% casa única (horizontal). Pero la <em>oferta activa digital</em> (Lamudi,
          ago-2021) es 30% vertical — casi 8× la participación vertical del censo (3.9%) — señal de un mercado que se está
          moviendo hacia producto vertical más rápido de lo que refleja el stock construido.</>}
        />
        <div className="grid md:grid-cols-2 gap-4">
          <ChartCard title="Tipología de vivienda municipal (Censo 2020)">
            <ResponsiveContainer width="100%" height={260} debounce={50}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Casa única', value: viviendaTipologia.data.casaUnicaPct },
                    { name: 'Casa comparte terreno', value: viviendaTipologia.data.casaCompartePct },
                    { name: 'Vertical (deptos)', value: viviendaTipologia.data.verticalPct },
                    { name: 'Dúplex', value: viviendaTipologia.data.duplexPct },
                  ]}
                  dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}
                  animationDuration={350} animationEasing="ease-out"
                >
                  {PIE_COLORS.map((c, i) => <Cell key={i} fill={c} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmtPct(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Mercado Big Data vs. censo INEGI">
            <div className="space-y-3 h-full flex flex-col justify-center">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Oferta activa vertical (Lamudi, ago-2021)</span>
                <span className="font-mono font-bold text-[#a78bfa] tabular-nums">{fmtPct(mercadoBigDataVsInegi.data.ofertaActivaVerticalPct)}</span>
              </div>
              <div className="h-2 bg-[#1e1e2e] rounded-full overflow-hidden"><div className="h-full bg-[#7c3aed]" style={{ width: `${mercadoBigDataVsInegi.data.ofertaActivaVerticalPct}%` }} /></div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Vertical censal (INEGI 2020)</span>
                <span className="font-mono font-bold text-white tabular-nums">{fmtPct(viviendaTipologia.data.verticalPct)}</span>
              </div>
              <div className="h-2 bg-[#1e1e2e] rounded-full overflow-hidden"><div className="h-full bg-[#10b981]" style={{ width: `${viviendaTipologia.data.verticalPct}%` }} /></div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div><div className="text-[10px] text-gray-500 uppercase">Producto nuevo (0-4 años)</div><div className="font-mono font-bold tabular-nums">{fmtPct(mercadoBigDataVsInegi.data.productoNuevoPct)}</div></div>
                <div><div className="text-[10px] text-gray-500 uppercase">Mediana $/m²</div><div className="font-mono font-bold tabular-nums">{fmtPesos(mercadoBigDataVsInegi.data.medianaPrecioM2)}</div></div>
                <div className="col-span-2"><div className="text-[10px] text-gray-500 uppercase">Área tipo</div><div className="font-mono font-bold tabular-nums">{mercadoBigDataVsInegi.data.areaTipoM2} m²</div></div>
              </div>
            </div>
          </ChartCard>
        </div>
        <Source>{viviendaTipologia.source} · {mercadoBigDataVsInegi.source}</Source>
      </section>

      {/* ── 5. Salud & Educación ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          icon="🏥"
          title="5. Salud & Educación"
          insight={<>72.1% de afiliación IMSS domina la cobertura médica (cobertura total municipal 79.8%, ligeramente por
          encima del 79.1% estatal). En educación, 34.7% de la población tiene nivel superior y el alfabetismo municipal
          (98.05%) supera al estatal (96.52%).</>}
        />
        <div className="grid md:grid-cols-2 gap-4">
          <ChartCard title="Afiliación médica">
            <ResponsiveContainer width="100%" height={230} debounce={50}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'IMSS', value: salud.data.imssPct },
                    { name: 'INSABI', value: salud.data.insabiPct },
                    { name: 'Privada', value: salud.data.privadaPct },
                  ]}
                  dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}
                  animationDuration={350} animationEasing="ease-out"
                >
                  {[C.info, C.accent, C.success].map((c, i) => <Cell key={i} fill={c} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmtPct(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
            <p className="text-[11px] text-gray-500 mt-1">Suma capturada: {fmtPct(salud.data.imssPct + salud.data.insabiPct + salud.data.privadaPct)} — el resto no está desglosado por afiliadora en la fuente.</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge color="success">Cobertura municipal {fmtPct(salud.data.coberturaMunicipalPct)}</Badge>
              <Badge>Cobertura estatal {fmtPct(salud.data.coberturaEstatalPct)}</Badge>
            </div>
          </ChartCard>
          <ChartCard title="Escolaridad">
            <ResponsiveContainer width="100%" height={230} debounce={50}>
              <BarChart
                data={[
                  { nivel: 'Básica', pct: educacion.data.basicaPct },
                  { nivel: 'Media superior', pct: educacion.data.mediaSuperiorPct },
                  { nivel: 'Superior', pct: educacion.data.superiorPct },
                ]}
                margin={{ left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="nivel" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} unit="%" width={38} />
                <Tooltip formatter={(v: number) => fmtPct(v)} />
                <Bar dataKey="pct" name="%" fill={C.accent} radius={[4, 4, 0, 0]} animationDuration={300} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[11px] text-gray-500 mt-1">Suma capturada: {fmtPct(educacion.data.basicaPct + educacion.data.mediaSuperiorPct + educacion.data.superiorPct)}.</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge color="success">Alfabetismo municipal {fmtPct(educacion.data.alfabetismoMunicipalPct, 2)}</Badge>
              <Badge>Estatal {fmtPct(educacion.data.alfabetismoEstatalPct, 2)}</Badge>
            </div>
          </ChartCard>
        </div>
        <Source>{salud.source} · {educacion.source}</Source>
      </section>

      {/* ── 6. Empleo & economía ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          icon="💼"
          title="6. Empleo & economía"
          insight={<>PEA municipal de 67% (vs. 65% estatal) con 96.36% ocupada. El IDH municipal es 0.781 (ranking nacional
          #12), impulsado por salud (0.899) e ingreso (0.796), con educación como el componente más rezagado (0.666).</>}
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard title="PEA municipal" value={empleo.data.peaMunicipalPct} suffix="%" icon="👷" color="accent" index={0} />
          <KPICard title="Ocupada" value={empleo.data.ocupadaPct} suffix="%" decimals={2} icon="✅" color="success" index={1} />
          <KPICard title=">2 SM municipal" value={empleo.data.masDeDosSMMunicipalPct} suffix="%" decimals={2} icon="💰" color="info" index={2} />
          <KPICard title="IDH total" value={idh.data.total} decimals={3} icon="📈" color="warning" index={3} />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <ChartCard title="Ramas de actividad económica (% estatal)">
            <ResponsiveContainer width="100%" height={260} debounce={50}>
              <BarChart data={empleo.data.ramas} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} unit="%" />
                <YAxis type="category" dataKey="rama" tick={{ ...AXIS_TICK, fontSize: 10 }} width={150} />
                <Tooltip formatter={(v: number) => fmtPct(v)} />
                <Bar dataKey="pct" name="%" fill={C.success} radius={[0, 4, 4, 0]} animationDuration={300} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title={`IDH desglosado (ranking nacional #${idh.data.rankingNacional})`}>
            <ResponsiveContainer width="100%" height={260} debounce={50}>
              <RadarChart data={[
                { eje: 'Salud', valor: idh.data.salud },
                { eje: 'Ingreso', valor: idh.data.ingreso },
                { eje: 'Educación', valor: idh.data.educacion },
              ]}>
                <PolarGrid stroke="#1e1e2e" />
                <PolarAngleAxis dataKey="eje" tick={AXIS_TICK} />
                <PolarRadiusAxis domain={[0, 1]} tick={{ ...AXIS_TICK, fontSize: 9 }} />
                <Radar dataKey="valor" name="IDH" stroke={C.accentLight} fill={C.accent} fillOpacity={0.45} animationDuration={350} animationEasing="ease-out" />
                <Tooltip formatter={(v: number) => v.toFixed(3)} />
              </RadarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        <Source>{empleo.source} · {idh.source}</Source>
      </section>

      {/* ── 7. Ecosistema 5 km ───────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          icon="🗺️"
          title="7. Ecosistema urbano (radio 5 km)"
          insight={<>En 5 km alrededor del predio hay 58 bancos, 37 corporativos, 29 universidades, 20 comerciales y 18
          hospitales — un equipamiento completo con traslados urbanos internos de {ecosistema5km.data.tiempoTrasladoUrbanoMin} min.</>}
        />
        <div className="grid md:grid-cols-2 gap-4">
          <ChartCard title={`Equipamiento en radio de ${ecosistema5km.data.radioKm} km`}>
            <ResponsiveContainer width="100%" height={280} debounce={50}>
              <BarChart
                data={[
                  { categoria: 'Bancos', n: ecosistema5km.data.bancos },
                  { categoria: 'Corporativos', n: ecosistema5km.data.corporativos },
                  { categoria: 'Universidades', n: ecosistema5km.data.universidades },
                  { categoria: 'Comerciales', n: ecosistema5km.data.comerciales },
                  { categoria: 'Hospitales', n: ecosistema5km.data.hospitales },
                ]}
                layout="vertical" margin={{ left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} />
                <YAxis type="category" dataKey="categoria" tick={AXIS_TICK} width={100} />
                <Tooltip />
                <Bar dataKey="n" name="Cantidad" fill={C.info} radius={[0, 4, 4, 0]} animationDuration={300} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Ubicación del predio" className="p-2 overflow-hidden">
            <div style={{ height: 280, borderRadius: 10, overflow: 'hidden' }}>
              <MapboxMap propertyPoints={[]} fmtMoney={(n) => fmtPesos(n)} />
            </div>
            <p className="text-[11px] text-gray-500 mt-2 px-2">Mapa centrado en el predio (★) — el polígono verde marca la zona
            de expansión de alto HBU descrita en el estudio; el radio de 5 km reportado en la fuente es un dato agregado, no un
            trazo geométrico explícito del documento.</p>
          </ChartCard>
        </div>
        <Source>{ecosistema5km.source}</Source>
      </section>

      {/* ── 8. Mercado inmobiliario ──────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          icon="🏢"
          title="8. Mercado inmobiliario"
          insight={<>El co-living institucional cobra 2.3× el precio del informal ($8,950 vs. $3,837/mes), justificando el
          premium por servicios y gestión profesional. En venta, las casas ($17,088/m²) valen menos por m² que los deptos
          ($36,516/m²) pero más en absoluto ($4.9M vs. $4.2M promedio).</>}
        />

        <div className="grid md:grid-cols-2 gap-4">
          <ChartCard title="Co-living: informal vs. institucional ($/mes)">
            <ResponsiveContainer width="100%" height={220} debounce={50}>
              <BarChart
                data={[
                  { tipo: 'Informal (mediana)', precio: benchmarks.data.coLivingInformal.precioMensual },
                  { tipo: `Institucional (${benchmarks.data.coLivingInstitucional.areaM2Min}-${benchmarks.data.coLivingInstitucional.areaM2Max} m²)`, precio: benchmarks.data.coLivingInstitucional.precioMensual },
                ]}
                margin={{ left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="tipo" tick={{ ...AXIS_TICK, fontSize: 9 }} />
                <YAxis tick={AXIS_TICK} tickFormatter={(v) => fmtMX(v / 1000) + 'k'} width={44} />
                <Tooltip formatter={(v: number) => fmtPesos(v)} />
                <Bar dataKey="precio" name="$/mes" radius={[4, 4, 0, 0]} animationDuration={300} animationEasing="ease-out">
                  <Cell fill={C.warning} /><Cell fill={C.success} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Venta $/m²: deptos vs. casas">
            <ResponsiveContainer width="100%" height={220} debounce={50}>
              <BarChart
                data={[
                  { tipo: `Deptos venta (n=${benchmarks.data.deptsVenta.muestra})`, precioM2: benchmarks.data.deptsVenta.precioM2Promedio },
                  { tipo: `Casas (n=${benchmarks.data.casas.muestra})`, precioM2: benchmarks.data.casas.precioM2Promedio },
                ]}
                margin={{ left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="tipo" tick={{ ...AXIS_TICK, fontSize: 9 }} />
                <YAxis tick={AXIS_TICK} tickFormatter={(v) => fmtMX(v / 1000) + 'k'} width={44} />
                <Tooltip formatter={(v: number) => fmtPesos(v)} />
                <Bar dataKey="precioM2" name="$/m²" radius={[4, 4, 0, 0]} animationDuration={300} animationEasing="ease-out">
                  <Cell fill={C.accent} /><Cell fill={C.info} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="glass p-3 rounded-xl border border-[#1e1e2e]">
            <div className="text-[10px] text-gray-500 uppercase">Deptos renta (n={benchmarks.data.deptsRenta.muestra})</div>
            <div className="text-lg font-mono font-bold tabular-nums">{fmtPesos(benchmarks.data.deptsRenta.precioMensual)}/mes</div>
            <div className="text-[11px] text-gray-500">{benchmarks.data.deptsRenta.areaM2Mediana} m² mediana · {fmtPesos(benchmarks.data.deptsRenta.precioM2)}/m²</div>
          </div>
          <div className="glass p-3 rounded-xl border border-[#1e1e2e]">
            <div className="text-[10px] text-gray-500 uppercase">Deptos venta (n={benchmarks.data.deptsVenta.muestra})</div>
            <div className="text-lg font-mono font-bold tabular-nums">{fmtPesos(benchmarks.data.deptsVenta.precioPromedio)}</div>
            <div className="text-[11px] text-gray-500">{benchmarks.data.deptsVenta.areaM2Promedio} m² promedio</div>
          </div>
          <div className="glass p-3 rounded-xl border border-[#1e1e2e]">
            <div className="text-[10px] text-gray-500 uppercase">Casas (n={benchmarks.data.casas.muestra})</div>
            <div className="text-lg font-mono font-bold tabular-nums">{fmtPesos(benchmarks.data.casas.precioPromedio)}</div>
            <div className="text-[11px] text-gray-500">{benchmarks.data.casas.areaM2Promedio} m² promedio</div>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Listados de co-living relevados (mundo / México / Querétaro)</h4>
          <ChartCard height={200}>
            <ResponsiveContainer width="100%" height={200} debounce={50}>
              <BarChart data={avgByCategoria} margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="categoria" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} tickFormatter={(v) => fmtMX(v / 1000) + 'k'} width={44} />
                <Tooltip formatter={(v: number) => fmtPesos(v)} />
                <Bar dataKey="precioMinProm" name="Precio mín. prom." fill={C.accentLight} radius={[4, 4, 0, 0]} animationDuration={300} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="flex flex-col md:flex-row gap-3 mt-3">
            <input
              value={colivingQuery}
              onChange={(e) => setColivingQuery(e.target.value)}
              placeholder="Buscar por nombre o ubicación..."
              className="flex-1 bg-[#111118] border border-[#1e1e2e] rounded-2xl px-4 py-2.5 text-sm"
            />
            <select value={colivingCategoria} onChange={(e) => setColivingCategoria(e.target.value as typeof colivingCategoria)}
              className="bg-[#111118] border border-[#1e1e2e] rounded-2xl px-3 py-2 text-sm">
              <option value="all">Todas las categorías</option>
              {(Object.keys(categoriaLabels) as CoLivingListing['categoria'][]).map((k) => (
                <option key={k} value={k}>{categoriaLabels[k]}</option>
              ))}
            </select>
            <button onClick={() => setColivingSort((s) => (s === 'asc' ? 'desc' : 'asc'))}
              className="px-4 py-2 rounded-2xl bg-[#111118] border border-[#1e1e2e] hover:bg-[#1a1a22] text-sm whitespace-nowrap">
              Precio {colivingSort === 'asc' ? '↑' : '↓'}
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[#1e1e2e] bg-[#111118] mt-3">
            <table className="w-full text-sm">
              <thead className="bg-[#0a0a0f] text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left">Nombre / Ubicación</th>
                  <th className="px-3 py-2 text-left">Categoría</th>
                  <th className="px-3 py-2 text-right">Precio</th>
                  <th className="px-3 py-2 text-right">Habitaciones</th>
                  <th className="px-3 py-2 text-right">m²</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {filteredListings.length > 0 ? filteredListings.map((l, i) => (
                  <tr key={i} className="hover:bg-[#1a1a22]">
                    <td className="px-3 py-2">
                      <div className="font-medium text-white text-xs">{l.nombre}</div>
                      <div className="text-[10px] text-gray-500">{l.ubicacion}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400">{categoriaLabels[l.categoria]}</td>
                    <td className="px-3 py-2 text-right font-mono text-[#a78bfa] text-xs tabular-nums">
                      {fmtPesos(l.precioMin)}{l.precioMax ? ` – ${fmtPesos(l.precioMax)}` : ''}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{l.capacidad_habitaciones}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{l.area_m2 ?? '—'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Sin resultados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Levantamiento de cuartos en renta (soporta el benchmark informal/institucional)</h4>
          <div className="overflow-x-auto rounded-2xl border border-[#1e1e2e] bg-[#111118]">
            <table className="w-full text-sm">
              <thead className="bg-[#0a0a0f] text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left">Nombre / Ubicación</th>
                  <th className="px-3 py-2 text-left">Segmento</th>
                  <th className="px-3 py-2 text-right">$/mes</th>
                  <th className="px-3 py-2 text-left">Contrato mín.</th>
                  <th className="px-3 py-2 text-right">Servicios inc.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {cuartosOrdenados.map((c, i) => (
                  <tr key={i} className="hover:bg-[#1a1a22]">
                    <td className="px-3 py-2">
                      <div className="font-medium text-white text-xs">{c.nombre}</div>
                      <div className="text-[10px] text-gray-500">{c.ubicacion}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <Badge color={c.segmento === 'institucional' ? 'success' : 'warning'}>{c.segmento}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{fmtPesos(c.precioMensual)}</td>
                    <td className="px-3 py-2 text-xs text-gray-400">{c.contratoMinimo}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{countServicios(c.servicios)}/10</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-500 mt-2">Los precios de Kali Homes / Altana / Xéntric Anáhuac difieren entre este
          levantamiento y el detalle individual de listados (arriba) — inconsistencia presente en el propio documento fuente
          (posible plan base vs. premium); se conserva tal cual, sin reconciliar.</p>
        </div>
        <Source>{benchmarks.source} · {coLivingListings.source} · {cuartosRentaLevantamiento.source}</Source>
      </section>

      {/* ── 9. Ciclo de vida & oportunidad ───────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          icon="🔄"
          title="9. Ciclo de vida del submercado & oportunidad"
          insight="La fuente no reporta una serie numérica de ciclo de vida de submercado; la siguiente lectura es una interpretación cualitativa construida a partir de tres datasets ya citados (tipología de vivienda, mercado Big Data vs. INEGI y el modelo HAIV) — no se inventa una curva ni cifras que el estudio no reporta."
        />
        <div className="grid md:grid-cols-3 gap-4">
          {[
            {
              fase: 'Madurez — stock horizontal',
              color: C.info,
              detalle: `${fmtPct(viviendaTipologia.data.casaUnicaPct)} del stock censal es casa única. El vecindario es un mercado consolidado, de perfil vecinal envejecido (FODA — debilidades).`,
            },
            {
              fase: 'Transición — repunte vertical',
              color: C.warning,
              detalle: `${fmtPct(mercadoBigDataVsInegi.data.ofertaActivaVerticalPct)} de la oferta activa digital (Lamudi 2021) ya es vertical, casi 8× el 3.9% del censo — el mercado se mueve más rápido que el stock construido.`,
            },
            {
              fase: 'Oportunidad — modelo híbrido townhouse + co-living',
              color: C.success,
              detalle: `El modelo HAIV evaluado (2 townhouses + 6 co-living) proyecta TIR consolidada de ${haiv.data.tirConsolidada}% — la propuesta de valor que capitaliza esta transición.`,
            },
          ].map((f, i) => (
            <div key={i} className="glass rounded-2xl p-5 border border-[#1e1e2e] relative">
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: f.color }} />
              <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: f.color }}>Fase {i + 1}</div>
              <div className="font-semibold text-white mb-2">{f.fase}</div>
              <p className="text-sm text-gray-400 leading-relaxed">{f.detalle}</p>
              {i < 2 && <div className="hidden md:block absolute top-1/2 -right-5 text-gray-600 text-xl">→</div>}
            </div>
          ))}
        </div>
        <Source>{viviendaTipologia.source} · {mercadoBigDataVsInegi.source} · {haiv.source}</Source>
      </section>

      {/* ── 10. Inversión & obras ────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          icon="🏗️"
          title="10. Inversión & obras públicas/privadas"
          insight={<>El Cloud-HQ Data Center ($14,942 MDP) domina por escala junto con obra vial y hospitalaria de Centro Sur.
          La colonia Cimatario en sí genera ${fmtMX(inversiones.data.outputEconomicoCimatario.totalAnualMXN / 1_000_000)}M
          MXN/año en {fmtMX(inversiones.data.outputEconomicoCimatario.numEstablecimientos)} establecimientos.</>}
        />
        <ChartCard title="Megaproyectos comparables (MDP, escala log por la disparidad de magnitudes)">
          <ResponsiveContainer width="100%" height={220} debounce={50}>
            <BarChart data={inversionData} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" horizontal={false} />
              <XAxis type="number" scale="log" domain={['auto', 'auto']} tick={AXIS_TICK} allowDataOverflow />
              <YAxis type="category" dataKey="proyecto" tick={AXIS_TICK} width={140} />
              <Tooltip formatter={(v: number) => `${fmtMX(v, 2)} MDP`} />
              <Bar dataKey="mdp" name="MDP" fill={C.accent} radius={[0, 4, 4, 0]} animationDuration={300} animationEasing="ease-out" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { t: inversiones.data.swobodaMechatronics.nombre, d: `${fmtMX(inversiones.data.swobodaMechatronics.areaM2)} m² · $${inversiones.data.swobodaMechatronics.inversionMDD} MDD` },
            { t: inversiones.data.hospitalAngeles.nombre, d: `${inversiones.data.hospitalAngeles.pisos} pisos · ${inversiones.data.hospitalAngeles.terrenoHa} ha` },
            { t: inversiones.data.hotelWestin.nombre, d: `${inversiones.data.hotelWestin.niveles} niveles · ${inversiones.data.hotelWestin.alturaM} m` },
            { t: inversiones.data.carretera210.nombre, d: inversiones.data.carretera210.descripcion },
            { t: inversiones.data.carretera540.nombre, d: inversiones.data.carretera540.descripcion },
            { t: 'Cimatario Sección 2', d: `${fmtPesos(inversiones.data.cimatarioSeccion2.inversionMXN)} · ${inversiones.data.cimatarioSeccion2.avancePct}% avance` },
          ].map((c, i) => (
            <div key={i} className="glass p-3 rounded-xl border border-[#1e1e2e]">
              <div className="text-xs font-semibold text-white leading-snug">{c.t}</div>
              <div className="text-[11px] text-gray-500 mt-1 leading-snug">{c.d}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard title="Output anual Cimatario" value={inversiones.data.outputEconomicoCimatario.totalAnualMXN} isMonetary icon="💵" color="success" index={0} />
          <KPICard title="Establecimientos" value={inversiones.data.outputEconomicoCimatario.numEstablecimientos} icon="🏬" color="accent" index={1} />
          <KPICard title="Trabajadores en la colonia" value={inversiones.data.outputEconomicoCimatario.trabajadoresQueLaboranEnLaColonia} icon="👷" color="info" index={2} />
          <KPICard title="Residentes + trabajadores" value={inversiones.data.outputEconomicoCimatario.totalResidentesYTrabajadores} icon="🧑‍🤝‍🧑" color="warning" index={3} />
        </div>
        <Source>{inversiones.source}</Source>
      </section>

      {/* ── 11. Predio, zoning, FODA, riesgos ────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading icon="📋" title="11. Predio, zonificación, FODA & riesgos" />

        <ChartCard title="Ficha del predio">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3 text-sm">
            {[
              ['Dirección', predio.data.direccion],
              ['Superficie', `${fmtMX(predio.data.superficieM2)} m²`],
              ['Frente × Fondo', `${predio.data.frenteM} m × ${predio.data.fondoM} m`],
              ['Uso de suelo', predio.data.usoSuelo],
              ['Lote mínimo', `${predio.data.loteMinimoM2} m² (frente mín. ${predio.data.frenteMinimoM} m)`],
              ['Altura máxima', `${predio.data.alturaMaximaNiveles} niveles / ${predio.data.alturaMaximaM} m`],
              ['CAS', `${predio.data.casPct}% (${predio.data.casM2} m²)`],
              ['COS', `${predio.data.cosPct}% (${predio.data.cosM2} m²)`],
              ['CUS', `${predio.data.cusVeces}× (${fmtMX(predio.data.cusM2)} m²)`],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
                <div className="font-mono text-white tabular-nums">{value}</div>
              </div>
            ))}
          </div>
        </ChartCard>

        <div className="grid md:grid-cols-2 gap-4">
          {[
            { title: 'Fortalezas', items: foda.data.fortalezas, color: 'success' as const },
            { title: 'Oportunidades', items: foda.data.oportunidades, color: 'accent' as const },
            { title: 'Debilidades', items: foda.data.debilidades, color: 'warning' as const },
            { title: 'Amenazas', items: foda.data.amenazas, color: 'danger' as const },
          ].map((q) => (
            <div key={q.title} className="glass rounded-2xl p-5 border border-[#1e1e2e]">
              <div className="mb-2"><Badge color={q.color}>{q.title}</Badge></div>
              <ul className="space-y-1.5 text-sm text-gray-300 list-disc list-inside">
                {q.items.map((it, i) => <li key={i}>{it}</li>)}
              </ul>
            </div>
          ))}
        </div>

        <ChartCard title="Matriz de riesgos — probabilidad × impacto">
          <ResponsiveContainer width="100%" height={300} debounce={50}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis type="number" dataKey="probabilidad" name="Probabilidad" domain={[0, 10]} tick={AXIS_TICK} label={{ value: 'Probabilidad', position: 'insideBottom', offset: -5, fill: '#6b7280', fontSize: 11 }} />
              <YAxis type="number" dataKey="impacto" name="Impacto" domain={[0, 10]} tick={AXIS_TICK} label={{ value: 'Impacto', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11 }} />
              <ReferenceLine x={5} stroke="#1e1e2e" />
              <ReferenceLine y={5} stroke="#1e1e2e" />
              <Tooltip content={<RiesgoTooltip />} cursor={{ strokeDasharray: '3 3' }} />
              <Scatter data={riesgos.data} animationDuration={350} animationEasing="ease-out">
                {riesgos.data.map((r, i) => <Cell key={i} fill={riesgoColor(r)} />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          <div className="flex gap-3 mt-2 text-xs">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: C.danger }} /> Importante</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: C.warning }} /> Apreciable</span>
          </div>
        </ChartCard>
        <Source>{predio.source} · {foda.source} · {riesgos.source}</Source>
      </section>

      {/* ── 12. Modelo HAIV ──────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          icon="📐"
          title="12. Modelo financiero HAIV"
          insight={<>Escenario híbrido (2 townhouses + 6 co-living, 950 m² de construcción) evaluado con TIR consolidada de
          23%, ROI anual de 20.36% e ingreso bruto mensual de $50,300 en renta.</>}
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard title="TIR consolidada" value={haiv.data.tirConsolidada} suffix="%" icon="📊" color="success" index={0} />
          <KPICard title="ROI anual" value={haiv.data.roiAnualPct} suffix="%" decimals={2} icon="💹" color="accent" index={1} />
          <KPICard title="Ingreso bruto mensual" value={haiv.data.ingresoBrutoMensualMXN} isMonetary icon="🏠" color="info" index={2} />
          <KPICard title="TIR escenario total" value={haiv.data.tirEscenarioTotal} suffix="%" decimals={1} icon="🚀" color="warning" index={3} />
        </div>
        <div className="glass rounded-2xl p-5 border border-[#1e1e2e] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <p className="text-sm text-gray-400 max-w-xl">El desglose completo de zonificación, costos de construcción y pro-forma
          DCF de este modelo vive en la pestaña HBU/HBV, donde es interactivo (sliders de cap rate, precio de venta y costo de suelo).</p>
          {onNavigateHbu && (
            <button onClick={onNavigateHbu}
              className="px-5 py-2.5 rounded-2xl bg-[#7c3aed] text-white text-sm font-medium hover:bg-[#8b5cf6] transition-colors duration-150 whitespace-nowrap">
              Ver modelo completo en HBU/HBV →
            </button>
          )}
        </div>
        <Source>{haiv.source}</Source>
      </section>

      {/* Subtle mount animation for chart cards — same pattern as DatabaseTab.tsx:
          plain CSS transition (not backdrop-filter), respects prefers-reduced-motion. */}
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
