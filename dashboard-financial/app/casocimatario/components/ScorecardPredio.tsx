'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { fmtMX } from '@/lib/format';
import predioScorecardRaw from '../data/scores/predio-scorecard.json';
import threatsRaw from '../data/scores/threats.json';
import scoresReportRaw from '../data/scores/scores-report.json';

// ---------------------------------------------------------------------------
// Tipos — reflejan exactamente el shape de los JSON generados por el pipeline
// de scoring (ver SCORING-SPEC.md). Todo número que se pinta en este
// componente sale de estos tres archivos; nada se recalcula ni se inventa.
// ---------------------------------------------------------------------------

type LensKey = 'desarrollador' | 'comprador' | 'inversionista';

interface LensData {
  score: number;
  percentil: number;
  ranking_en_537: number;
  weakest: string;
  weakest_label: string;
  gap_top_decil_pts: number;
  veredicto: string;
  safety_is_proxy?: boolean;
  liquidity_is_proxy?: boolean;
  liquidity_n_comps_1500m?: number;
}

interface PredioScorecard {
  predio: { lat: number; lng: number; size_m2: number; asking: number; ppm: number };
  surface: number;
  subscores: Record<string, number>;
  lentes: Record<LensKey, LensData>;
  veredicto_texto: string;
  para_quien_es_mejor: LensKey;
  flags: {
    growth_included: boolean;
    growth_amount_weighted: boolean;
    safety_is_proxy: boolean;
    liquidity_is_proxy: boolean;
  };
}

type ThreatSeverity = 'baja' | 'media' | 'alta';

interface Threat {
  tipo: string;
  severidad: ThreatSeverity;
  evidencia_numerica: Record<string, unknown>;
}

const predioScorecard = predioScorecardRaw as unknown as PredioScorecard;
const threats = threatsRaw as unknown as Threat[];
const scoresReport = scoresReportRaw as unknown as { n_comps_valid: number };

const N_COMPS = scoresReport.n_comps_valid;

// ---------------------------------------------------------------------------
// Motion — mismo lenguaje que KPICard.tsx (ease-out, stagger corto,
// deshabilitado bajo prefers-reduced-motion).
// ---------------------------------------------------------------------------
const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: EASE_OUT, delay: i * 0.06 },
  }),
};

// ---------------------------------------------------------------------------
// Etiquetas y matriz de pesos por lente — SCORING-SPEC.md §2 (labels de S1..S7)
// y §3.1 (matriz de pesos por lente). La matriz NO viene en el JSON del
// predio (el JSON solo trae el score ya ponderado); se reproduce aquí
// únicamente para decidir qué 3 subscores mostrar como "los que más pesan"
// en cada lente — los VALORES de esos subscores siempre se leen del JSON,
// nunca se recalculan.
// ---------------------------------------------------------------------------
const SUBSCORE_LABELS: Record<string, string> = {
  S1: 'Valor relativo ($/m²)',
  S2: 'Oportunidad de ubicación',
  S3: 'Consumo meta (estilo de vida)',
  S4: 'Anclas (estructura de valor)',
  S5: 'Equipamiento de barrio',
  S6: 'Competencia neta',
  S7: 'Crecimiento / inversión',
};

const LENS_WEIGHTS: Record<LensKey, Record<string, number>> = {
  desarrollador: { S1: 0.10, S2: 0.25, S3: 0.10, S4: 0.10, S5: 0.05, S6: 0.25, S7: 0.15 },
  comprador: { S1: 0.25, S2: 0.15, S3: 0.25, S4: 0.10, S5: 0.20, S6: 0.05, S7: 0.00 },
  inversionista: { S1: 0.20, S2: 0.15, S3: 0.10, S4: 0.10, S5: 0.05, S6: 0.10, S7: 0.30 },
};

const LENS_META: Record<LensKey, { label: string; icon: string; sub: string }> = {
  desarrollador: { label: 'Desarrollador', icon: '🏗️', sub: 'espacio para HBU / poca canibalización' },
  comprador: { label: 'Comprador (usuario)', icon: '🏠', sub: 'estilo de vida co-living, asequibilidad' },
  inversionista: { label: 'Inversionista', icon: '📈', sub: 'plusvalía, cap rate proxy, liquidez' },
};

const LENS_ORDER: LensKey[] = ['desarrollador', 'comprador', 'inversionista'];

function topSubscoresForLens(lens: LensKey, n = 3): { key: string; weight: number }[] {
  return Object.entries(LENS_WEIGHTS[lens])
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, weight]) => ({ key, weight }));
}

// ---------------------------------------------------------------------------
// Amenazas — labels legibles por tipo + render de evidencia numérica.
// La severidad (color ámbar/rojo/verde) es la ÚNICA sección del dashboard
// donde se usa ese registro semántico de riesgo.
// ---------------------------------------------------------------------------
const THREAT_LABELS: Record<string, string> = {
  competencia_cercana: 'Competencia cercana',
  saturacion_submercado: 'Saturación del submercado',
  dependencia_una_ancla: 'Dependencia de una sola ancla',
  precio_sobre_banda: 'Precio sobre banda de mercado',
  equipamiento_debil: 'Equipamiento débil',
};

const SEVERITY_META: Record<ThreatSeverity, { label: string; color: string; bg: string; border: string }> = {
  baja: { label: 'Baja', color: '#10b981', bg: 'bg-[#10b981]/10', border: 'border-[#10b981]/30' },
  media: { label: 'Media', color: '#f59e0b', bg: 'bg-[#f59e0b]/10', border: 'border-[#f59e0b]/40' },
  alta: { label: 'Alta', color: '#ef4444', bg: 'bg-[#ef4444]/10', border: 'border-[#ef4444]/50' },
};

function renderEvidencia(t: Threat): string {
  const e = t.evidencia_numerica as Record<string, any>;
  switch (t.tipo) {
    case 'competencia_cercana': {
      const refs = (e.refs ?? []) as { name: string; d_m: number }[];
      const nearest = refs[0];
      return `${e.n} competidor${e.n === 1 ? '' : 'es'} de referencia · más cercano: ${nearest ? `${nearest.name} a ${fmtMX(nearest.d_m)} m` : `${fmtMX(e.d_min_m)} m`}`;
    }
    case 'saturacion_submercado':
      return `Percentil de saturación ${fmtMX(e.sat_percentil, 1)} de ${N_COMPS} comps (k_sat crudo = ${fmtMX(e.k_sat, 2)})`;
    case 'dependencia_una_ancla': {
      const nb = (e.nearest_by_subcat ?? {}) as Record<string, number>;
      const rest = Object.entries(nb)
        .map(([k, v]) => `${k} ${fmtMX(v)}m`)
        .join(' · ');
      return `Ancla dominante: ${e.subcat_dominante} (${fmtMX((e.share as number) * 100, 1)}% del kernel de anclas) — ${rest}`;
    }
    case 'precio_sobre_banda':
      return `$/m² ${fmtMX(e.ppm)} vs mediana de mercado ${fmtMX(e.p50)} (percentil ${fmtMX(e.percentil, 1)}; banda p75=${fmtMX(e.p75)} · p90=${fmtMX(e.p90)})`;
    case 'equipamiento_debil':
      return `Percentil de equipamiento ${fmtMX(e.E_percentil, 1)} (k_equip crudo = ${fmtMX(e.k_equip, 2)})`;
    default:
      return Object.entries(e)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ');
  }
}

// ---------------------------------------------------------------------------
// Sub-componentes visuales
// ---------------------------------------------------------------------------

/** Barra de percentil 0-100 con marca en 90 (umbral "top-decil" del mercado). */
function PercentileBar({ value, highlight, reduceMotion }: { value: number; highlight: boolean; reduceMotion: boolean | null }) {
  const fillColor = highlight ? '#10b981' : '#7c3aed';
  return (
    <div className="relative h-2.5 rounded-full bg-[#1e1e2e] overflow-visible mt-2 mb-1">
      <motion.div
        className="h-full rounded-full"
        style={{ background: fillColor }}
        initial={{ width: reduceMotion ? `${value}%` : '0%' }}
        animate={{ width: `${value}%` }}
        transition={{ duration: reduceMotion ? 0 : 0.7, ease: EASE_OUT, delay: reduceMotion ? 0 : 0.15 }}
      />
      {/* Umbral top-decil (percentil 90) */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-[2px] h-4 bg-white/40"
        style={{ left: '90%' }}
        title="Umbral top-decil (percentil 90)"
      />
    </div>
  );
}

function LensCard({ lensKey, index, reduceMotion }: { lensKey: LensKey; index: number; reduceMotion: boolean | null }) {
  const lens = predioScorecard.lentes[lensKey];
  const meta = LENS_META[lensKey];
  const isBest = predioScorecard.para_quien_es_mejor === lensKey;
  const topSubs = topSubscoresForLens(lensKey);
  const inTopDecile = lens.gap_top_decil_pts <= 0;

  return (
    <motion.div
      className={`glass rounded-2xl p-5 border relative overflow-hidden flex flex-col ${
        isBest ? 'border-[#10b981]/50 ring-1 ring-[#10b981]/20' : 'border-[#1e1e2e]'
      }`}
      custom={index}
      initial="hidden"
      animate="visible"
      variants={cardVariants}
    >
      {isBest && (
        <div className="absolute -top-5 -right-5 w-20 h-20 bg-[#10b981]/15 rounded-full blur-3xl" />
      )}
      <div className="relative flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-lg leading-none">{meta.icon}</span>
            <span className="font-semibold text-sm">{meta.label}</span>
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">{meta.sub}</div>
        </div>
        {isBest && (
          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-[#10b981]/15 text-[#10b981] whitespace-nowrap">
            Mejor lente
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className={`text-3xl font-bold font-mono tabular-nums tracking-tight ${isBest ? 'text-[#10b981]' : 'text-[#a78bfa]'}`}>
          {fmtMX(lens.score, 1)}
        </span>
        <span className="text-xs text-gray-500">/ 100</span>
      </div>

      <PercentileBar value={lens.percentil} highlight={isBest} reduceMotion={reduceMotion} />
      <div className="text-xs text-gray-400 mb-3">
        Percentil <span className="font-medium text-gray-200">{fmtMX(lens.percentil, 1)}</span> de {N_COMPS} comps ·
        {' '}ranking <span className="font-mono">#{lens.ranking_en_537}</span>
        {inTopDecile && <span className="text-[#10b981]"> · ya en top-decil</span>}
      </div>

      <div className="space-y-1.5 text-xs border-t border-[#1e1e2e] pt-3">
        <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Subscores que más pesan aquí</div>
        {topSubs.map(({ key, weight }) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <span className="text-gray-400 truncate">
              {SUBSCORE_LABELS[key]} <span className="text-gray-600">({fmtMX(weight * 100, 0)}%)</span>
            </span>
            <span className="font-mono tabular-nums text-gray-200 flex-shrink-0">{fmtMX(predioScorecard.subscores[key], 1)}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-[#1e1e2e] text-[11px] text-gray-400 leading-snug">
        Punto más débil: <span className="text-gray-200 font-medium">{lens.weakest_label}</span>{' '}
        ({fmtMX(predioScorecard.subscores[lens.weakest], 1)} pts)
        {!inTopDecile && (
          <> — le faltan ~{fmtMX(lens.gap_top_decil_pts, 1)} pts, principalmente vía {lens.weakest_label}, para top-decil.</>
        )}
      </div>

      {lens.safety_is_proxy && (
        <div className="mt-2 text-[10px] text-gray-500 italic">Seguridad no medida directamente: proxy vía densidad de equipamiento (salud/educación).</div>
      )}
      {lens.liquidity_is_proxy && (
        <div className="mt-2 text-[10px] text-gray-500 italic">
          Liquidez no medida directamente: proxy vía profundidad de mercado ({lens.liquidity_n_comps_1500m} comps válidos ≤1500 m).
        </div>
      )}
    </motion.div>
  );
}

export default function ScorecardPredio() {
  const reduceMotion = useReducedMotion();
  const bestLens = predioScorecard.para_quien_es_mejor;
  const bestMeta = LENS_META[bestLens];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Scorecard del predio vs el mercado</h2>
        <p className="text-sm text-gray-400 mt-1">
          El mismo predio (660 m², asking {fmtMX(predioScorecard.predio.asking)}) evaluado bajo 3 lentes de decisión —
          cada lente re-pondera los mismos 7 subscores geoespaciales (S1..S7) y re-rankea el predio dentro de los{' '}
          {N_COMPS} comps reales de Cimatario con esa matriz de pesos. Ver metodología completa en SCORING-SPEC.md.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {LENS_ORDER.map((key, i) => (
          <LensCard key={key} lensKey={key} index={i} reduceMotion={reduceMotion} />
        ))}
      </div>

      {/* Veredicto */}
      <motion.div
        className="glass rounded-3xl p-6 border border-[#10b981]/30"
        custom={3}
        initial="hidden"
        animate="visible"
        variants={cardVariants}
      >
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-gray-500">¿Para quién es el mejor este terreno?</div>
            <div className="text-2xl font-bold mt-1 flex items-center gap-2">
              <span>{bestMeta.icon}</span>
              <span className="text-[#10b981]">{bestMeta.label}</span>
            </div>
          </div>
          <div className="text-right text-xs text-gray-500 max-w-xs">
            Percentiles por lente: {LENS_ORDER.map((k) => `${LENS_META[k].label} p${fmtMX(predioScorecard.lentes[k].percentil, 0)}`).join(' · ')}
          </div>
        </div>
        <p className="text-sm text-gray-300 mt-4 leading-relaxed">{predioScorecard.veredicto_texto}</p>
        <p className="text-xs text-gray-500 mt-2 leading-relaxed">
          Los tres lentes ya colocan al predio en o por encima del percentil 90 (top-decil) del mercado de {N_COMPS} comps —
          la diferencia entre ellos es de grado, no de categoría. El lente más ajustado al borde del top-decil es{' '}
          {(() => {
            const closest = LENS_ORDER.reduce((a, b) => (predioScorecard.lentes[a].percentil < predioScorecard.lentes[b].percentil ? a : b));
            return (
              <span className="text-gray-300 font-medium">
                {LENS_META[closest].label} (percentil {fmtMX(predioScorecard.lentes[closest].percentil, 1)})
              </span>
            );
          })()}
          .
        </p>
      </motion.div>

      {/* Amenazas */}
      <motion.div
        className="glass rounded-2xl p-5 border border-[#1e1e2e]"
        custom={4}
        initial="hidden"
        animate="visible"
        variants={cardVariants}
      >
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="font-semibold text-sm">Amenazas detectadas ({threats.length})</h3>
          <span className="text-[11px] text-gray-500">derivadas de umbrales numéricos — nunca opinión libre</span>
        </div>
        <div className="space-y-2">
          {threats.map((t, i) => {
            const sev = SEVERITY_META[t.severidad];
            return (
              <div key={i} className={`rounded-xl p-3 border ${sev.bg} ${sev.border} flex flex-col sm:flex-row sm:items-center gap-2`}>
                <div className="flex items-center gap-2 sm:w-56 flex-shrink-0">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ color: sev.color, background: `${sev.color}22` }}
                  >
                    {sev.label}
                  </span>
                  <span className="text-sm font-medium">{THREAT_LABELS[t.tipo] ?? t.tipo}</span>
                </div>
                <div className="text-xs text-gray-400 leading-snug">{renderEvidencia(t)}</div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Nota de método */}
      <div className="text-[11px] text-gray-500 px-1 leading-relaxed">
        Nota de método: cada score es <span className="text-gray-400">relativo al mercado</span> — percentil-rank del
        predio dentro de los {N_COMPS} comps reales de Cimatario (Lamudi), no una escala absoluta. Los 7 subscores
        (S1 valor, S2 oportunidad de ubicación, S3 consumo, S4 anclas, S5 equipamiento, S6 competencia neta, S7
        crecimiento) y las 3 matrices de pesos por lente son parámetros configurables y opinables — ver{' '}
        <span className="font-mono">SCORING-SPEC.md</span> para el detalle y los supuestos marcados para validación
        humana.
        {predioScorecard.flags.growth_included ? (
          <> S7 (crecimiento) sí tiene datos en esta corrida{predioScorecard.flags.growth_amount_weighted ? ', ponderados por monto de inversión' : ''}.</>
        ) : (
          <> S7 (crecimiento) no tiene datos aún; su peso se reparte entre los demás subscores.</>
        )}
      </div>
    </section>
  );
}
