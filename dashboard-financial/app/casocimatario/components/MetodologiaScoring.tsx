'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import landScoresRaw from '../data/scores/land-scores.json';
import scoresReportRaw from '../data/scores/scores-report.json';

// ---------------------------------------------------------------------------
// Panel de metodología / validación del scoring geoespacial.
//
// Objetivo: abrir la caja negra del modelo (SCORING-SPEC.md) para que german
// pueda revisar y validar pesos y supuestos, no solo confiar en el ranking
// final. Todo número mostrado aquí sale de SCORING-SPEC.md o de los JSON
// reales del pipeline (land-scores.json meta, scores-report.json) — cero
// invención. Los supuestos declarados como subjetivos en SCORING-SPEC.md §8
// se marcan en ámbar.
//
// Este panel es de solo lectura: no permite editar pesos en vivo (eso
// requeriría re-correr compute-scores.mjs contra los JSON de entrada).
// ---------------------------------------------------------------------------

interface LandScoresMeta {
  n_comps_input: number;
  n_comps_valid: number;
  weights: Record<string, number>;
  norm_mode: string;
  growth_included: boolean;
  growth_amount_weighted?: boolean;
  kernels: Record<string, [number, number]>;
}

const landScoresMeta = (landScoresRaw as unknown as { meta: LandScoresMeta }).meta;
const scoresReport = scoresReportRaw as unknown as { n_comps_valid: number; ppm_bands: Record<string, number> };
const N_COMPS = scoresReport.n_comps_valid ?? landScoresMeta.n_comps_valid;

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

// ---------------------------------------------------------------------------
// 1. Los 7 subscores — SCORING-SPEC.md §2 (S1..S7) + §1.3 (A/C/E) + §1.4 (S6)
// ---------------------------------------------------------------------------
const SUBSCORES: { key: string; label: string; qué_mide: string }[] = [
  { key: 'S1', label: 'S1 · Valor', qué_mide: '$/m² invertido vs los comps del mercado — más barato-relativo = score más alto (más margen de desarrollo).' },
  { key: 'S2', label: 'S2 · Oportunidad de ubicación', qué_mide: 'growth_surface(lat,lng): combinación ponderada de ancla + consumo + equipamiento + competencia neta + crecimiento.' },
  { key: 'S3', label: 'S3 · Consumo meta', qué_mide: 'Densidad ponderada por distancia de coworking / café de especialidad / gimnasio / bar / restaurante (radio caminable).' },
  { key: 'S4', label: 'S4 · Ancla', qué_mide: 'Densidad ponderada por distancia de universidad / plaza-mall / hospital / supermercado / corporativo (escala de zona).' },
  { key: 'S5', label: 'S5 · Equipamiento', qué_mide: 'Densidad ponderada por distancia de educación / salud / parque (servicio de barrio inmediato).' },
  { key: 'S6', label: 'S6 · Competencia neta', qué_mide: 'Trade-off: penaliza saturación hiperlocal (≤800 m) y premia demanda validada en submercado (≤1500 m). Alto = poca canibalización.' },
  { key: 'S7', label: 'S7 · Crecimiento', qué_mide: 'Densidad de proyectos de inversión cercanos (megaproyectos), ponderada por monto si está disponible. Forward-looking.' },
];

// ---------------------------------------------------------------------------
// 2. Racional de los pesos del Land Score — SCORING-SPEC.md §2.4 (texto fijo,
//    los NÚMEROS de peso se leen en vivo de land-scores.json meta.weights)
// ---------------------------------------------------------------------------
const LAND_WEIGHT_RATIONALE: Record<string, string> = {
  S1: 'El precio relativo es la variable dura de decisión de compra de suelo.',
  S2: 'Índice geoespacial compuesto; co-motor con el precio.',
  S3: 'Diferenciador del usuario co-living; peso menor por redundancia con S2.',
  S4: 'Estructura de valor; menor por redundancia con S2.',
  S5: 'Servicio de barrio; secundario.',
  S6: 'Riesgo de sobre-oferta / validación de demanda.',
  S7: 'Forward-looking; si no hay datos su peso se reparte entre S1..S6.',
};

// ---------------------------------------------------------------------------
// 3. Matrices de lentes — SCORING-SPEC.md §3.1. No vienen en ningún JSON del
//    pipeline (el JSON del predio solo trae el score ya ponderado), así que
//    se reproducen aquí tal cual el documento — mismos valores que usa
//    ScorecardPredio.tsx para elegir "qué subscores pesan más" por lente.
// ---------------------------------------------------------------------------
type LensKey = 'desarrollador' | 'comprador' | 'inversionista';
const LENS_LABELS: Record<LensKey, string> = {
  desarrollador: 'Desarrollador',
  comprador: 'Comprador (usuario)',
  inversionista: 'Inversionista',
};
const LENS_WEIGHTS: Record<LensKey, Record<string, number>> = {
  desarrollador: { S1: 0.10, S2: 0.25, S3: 0.10, S4: 0.10, S5: 0.05, S6: 0.25, S7: 0.15 },
  comprador: { S1: 0.25, S2: 0.15, S3: 0.25, S4: 0.10, S5: 0.20, S6: 0.05, S7: 0.00 },
  inversionista: { S1: 0.20, S2: 0.15, S3: 0.10, S4: 0.10, S5: 0.05, S6: 0.10, S7: 0.30 },
};

// ---------------------------------------------------------------------------
// 4. Growth Surface — pesos default §1.5 + kernels §1.2 (radios/d0 se leen en
//    vivo de land-scores.json meta.kernels; los pesos de la superficie son
//    config estática del documento, no viven en el JSON de salida)
// ---------------------------------------------------------------------------
const SURFACE_WEIGHTS: { label: string; weight: number; signal: string }[] = [
  { label: 'Ancla (A)', weight: 0.30, signal: 'ancla' },
  { label: 'Consumo meta (C)', weight: 0.25, signal: 'consumo' },
  { label: 'Equipamiento (E)', weight: 0.15, signal: 'equip' },
  { label: 'Competencia neta (COMP)', weight: 0.15, signal: 'comp' },
  { label: 'Crecimiento (G)', weight: 0.15, signal: 'growth' },
];

const KERNEL_ROWS: { señal: string; metaKey: string; racional: string }[] = [
  { señal: 'Ancla', metaKey: 'ancla', racional: 'Anclas (hospital, universidad, mall) irradian valor a escala de zona; sirven aún a 2–3 km en auto.' },
  { señal: 'Consumo meta', metaKey: 'consumo', racional: 'Café / gym / coworking son "estilo de vida a pie": relevantes en radio caminable ~15 min.' },
  { señal: 'Equipamiento', metaKey: 'equip', racional: 'Parque / escuela / salud pesan como servicio de barrio inmediato.' },
  { señal: 'Competencia — saturación', metaKey: 'comp_sat', racional: 'Canibalización es hiperlocal (≤800 m).' },
  { señal: 'Competencia — validación', metaKey: 'comp_val', racional: 'Validación de demanda cuenta en submercado (≤1500 m).' },
  { señal: 'Crecimiento (inversión)', metaKey: 'growth', racional: 'La plusvalía por megaproyecto irradia a escala metropolitana amplia.' },
];

// ---------------------------------------------------------------------------
// 5. Supuestos que requieren validación humana — SCORING-SPEC.md §8, literal.
// ---------------------------------------------------------------------------
const SUPUESTOS: string[] = [
  `Población de referencia = los ${N_COMPS} comps de Cimatario. La escala 0–100 es relativa a la oferta existente en Cimatario, no una escala absoluta contra otra ciudad.`,
  'Trade-off de competencia 0.60 (saturación) vs 0.30 (validación de demanda): postura de negocio anti-sobreoferta. Invertible si la tesis es "clúster gana" (aglomeración).',
  'Las 3 matrices de lentes (Desarrollador / Comprador / Inversionista): el parámetro más subjetivo de todo el modelo — opiniones de negocio, requieren revisión explícita.',
  'Radios y escalas de kernel (ancla 3 km, consumo 1.2 km, equipamiento 1 km, competencia 0.8/1.5 km): definen qué cuenta como "cercano".',
  'Redundancia declarada S2 vs S3–S6: los mismos ingredientes geoespaciales entran dos veces (S2 los agrega, S3–S6 los repite con pesos chicos por interpretabilidad). Si se prefiere cero redundancia: w3=w4=w5=w6=0 y sube w2.',
  'Proxies declarados: seguridad → densidad de equipamiento (salud/educación); yield/cap rate → valor (S1, menor precio de entrada); liquidez → profundidad de comps ≤1500 m. Son proxies, no medidas directas.',
  'Pesos default de la superficie de oportunidad 0.30 / 0.25 / 0.15 / 0.15 / 0.15 (ancla / consumo / equipamiento / competencia neta / crecimiento).',
];

const cardVariants = {
  hidden: { opacity: 0, height: 0 },
  visible: { opacity: 1, height: 'auto' },
};

function fmtPct(w: number): string {
  return `${Math.round(w * 100)}%`;
}

export default function MetodologiaScoring() {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <section className="glass rounded-3xl border border-[#1e1e2e] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-[#1a1a22]/60 transition"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none">🔬</span>
            <span className="font-semibold text-base">Metodología del scoring (validar supuestos)</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Los 7 subscores, los pesos del Land Score, las 3 matrices de lentes, la superficie de oportunidad
            y los radios de kernel — con los supuestos que requieren tu validación explícita, resaltados en ámbar.
          </div>
        </div>
        <span className={`text-gray-500 text-sm transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={cardVariants}
            transition={{ duration: reduceMotion ? 0 : 0.25, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-6 space-y-6 border-t border-[#1e1e2e] pt-5">
              {/* 1. Los 7 subscores */}
              <div>
                <h3 className="text-sm font-semibold text-[#a78bfa] mb-2">1. Los 7 subscores (S1..S7)</h3>
                <div className="overflow-x-auto rounded-xl border border-[#1e1e2e]">
                  <table className="w-full text-xs">
                    <thead className="bg-[#111118] text-gray-500">
                      <tr>
                        <th className="text-left font-medium px-3 py-2 w-48">Subscore</th>
                        <th className="text-left font-medium px-3 py-2">Qué mide</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SUBSCORES.map((s, i) => (
                        <tr key={s.key} className={i % 2 === 0 ? 'bg-[#111118]/40' : ''}>
                          <td className="px-3 py-2 font-medium text-gray-200 align-top whitespace-nowrap">{s.label}</td>
                          <td className="px-3 py-2 text-gray-400 leading-snug">{s.qué_mide}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 2. Pesos Land Score */}
              <div>
                <h3 className="text-sm font-semibold text-[#a78bfa] mb-2">
                  2. Pesos del Land Score (default, Σ = 1.00) — ranking de los {N_COMPS} comps
                </h3>
                <div className="overflow-x-auto rounded-xl border border-[#1e1e2e]">
                  <table className="w-full text-xs">
                    <thead className="bg-[#111118] text-gray-500">
                      <tr>
                        <th className="text-left font-medium px-3 py-2">Subscore</th>
                        <th className="text-right font-medium px-3 py-2 w-20">Peso</th>
                        <th className="text-left font-medium px-3 py-2">Racional</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SUBSCORES.map((s, i) => (
                        <tr key={s.key} className={i % 2 === 0 ? 'bg-[#111118]/40' : ''}>
                          <td className="px-3 py-2 font-medium text-gray-200 whitespace-nowrap">{s.label}</td>
                          <td className="px-3 py-2 text-right font-mono text-[#10b981]">
                            {landScoresMeta.weights[s.key] != null ? fmtPct(landScoresMeta.weights[s.key]) : '—'}
                          </td>
                          <td className="px-3 py-2 text-gray-400 leading-snug">{LAND_WEIGHT_RATIONALE[s.key]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-[11px] text-gray-500 mt-1.5">
                  Pesos leídos en vivo de <span className="font-mono">land-scores.json → meta.weights</span>. Estado actual:
                  S7 crecimiento{' '}
                  {landScoresMeta.growth_included ? (
                    <span className="text-gray-400">sí tiene datos en esta corrida (growth_included=true{landScoresMeta.growth_amount_weighted ? ', ponderado por monto' : ''})</span>
                  ) : (
                    <span className="text-gray-400">sin datos aún (growth_included=false); su peso se reparte entre S1..S6</span>
                  )}
                  .
                </div>
              </div>

              {/* 3. Matrices de lentes */}
              <div>
                <h3 className="text-sm font-semibold text-[#a78bfa] mb-2">3. Matrices de pesos por lente (cada fila del predio, cada columna suma 1.00)</h3>
                <div className="overflow-x-auto rounded-xl border border-[#1e1e2e]">
                  <table className="w-full text-xs">
                    <thead className="bg-[#111118] text-gray-500">
                      <tr>
                        <th className="text-left font-medium px-3 py-2">Subscore</th>
                        {(Object.keys(LENS_LABELS) as LensKey[]).map((lk) => (
                          <th key={lk} className="text-right font-medium px-3 py-2">{LENS_LABELS[lk]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {SUBSCORES.map((s, i) => (
                        <tr key={s.key} className={i % 2 === 0 ? 'bg-[#111118]/40' : ''}>
                          <td className="px-3 py-2 font-medium text-gray-200 whitespace-nowrap">{s.label}</td>
                          {(Object.keys(LENS_LABELS) as LensKey[]).map((lk) => (
                            <td key={lk} className="px-3 py-2 text-right font-mono text-gray-200">{fmtPct(LENS_WEIGHTS[lk][s.key])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
                  Desarrollador prioriza competencia neta (0.25, espacio para absorber oferta nueva) y oportunidad (0.25); valor pesa poco (0.10).
                  Comprador prioriza consumo (0.25), equipamiento (0.20) y valor/asequibilidad (0.25); competencia casi irrelevante (0.05).
                  Inversionista prioriza crecimiento (0.30, motor de plusvalía) y valor como proxy de yield (0.20).
                </div>
              </div>

              {/* 4. Growth Surface */}
              <div>
                <h3 className="text-sm font-semibold text-[#a78bfa] mb-2">4. Growth / Opportunity Surface (alimenta S2)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="overflow-x-auto rounded-xl border border-[#1e1e2e]">
                    <table className="w-full text-xs">
                      <thead className="bg-[#111118] text-gray-500">
                        <tr>
                          <th className="text-left font-medium px-3 py-2">Señal</th>
                          <th className="text-right font-medium px-3 py-2 w-16">Peso</th>
                        </tr>
                      </thead>
                      <tbody>
                        {SURFACE_WEIGHTS.map((s, i) => (
                          <tr key={s.label} className={i % 2 === 0 ? 'bg-[#111118]/40' : ''}>
                            <td className="px-3 py-2 text-gray-200">{s.label}</td>
                            <td className="px-3 py-2 text-right font-mono text-[#10b981]">{fmtPct(s.weight)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/5 p-3 text-xs text-gray-300 leading-relaxed">
                    <div className="font-mono text-[#f59e0b] mb-1.5 text-[11px]">comp_net = 50 − 0.60·(sat−50) + 0.30·(val−50)</div>
                    En palabras: el punto neutro es 50. La <span className="text-gray-200 font-medium">saturación hiperlocal (≤800 m)</span> resta
                    con peso 0.60 — domina porque el riesgo de sobre-oferta es el mayor destructor de valor de un co-living nuevo.
                    La <span className="text-gray-200 font-medium">demanda validada en submercado (≤1500 m)</span> suma pero con la mitad
                    de peso (0.30): es señal positiva pero secundaria. Es decir, <span className="text-amber-300">se penaliza la saturación
                    al doble de lo que se premia la demanda probada</span>.
                  </div>
                </div>
              </div>

              {/* 5. Radios de kernel + normalización */}
              <div>
                <h3 className="text-sm font-semibold text-[#a78bfa] mb-2">5. Radios de kernel ("qué es cercano") y normalización</h3>
                <div className="overflow-x-auto rounded-xl border border-[#1e1e2e]">
                  <table className="w-full text-xs">
                    <thead className="bg-[#111118] text-gray-500">
                      <tr>
                        <th className="text-left font-medium px-3 py-2">Señal</th>
                        <th className="text-right font-medium px-3 py-2 w-20">R (m)</th>
                        <th className="text-right font-medium px-3 py-2 w-20">d0 (m)</th>
                        <th className="text-left font-medium px-3 py-2">Racional</th>
                      </tr>
                    </thead>
                    <tbody>
                      {KERNEL_ROWS.map((k, i) => {
                        const kv = landScoresMeta.kernels[k.metaKey];
                        return (
                          <tr key={k.metaKey} className={i % 2 === 0 ? 'bg-[#111118]/40' : ''}>
                            <td className="px-3 py-2 text-gray-200 whitespace-nowrap">{k.señal}</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-200">{kv ? kv[0].toLocaleString('es-MX') : '—'}</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-200">{kv ? kv[1].toLocaleString('es-MX') : '—'}</td>
                            <td className="px-3 py-2 text-gray-400 leading-snug">{k.racional}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
                  Radios (R) y kernels (d0) leídos en vivo de <span className="font-mono">land-scores.json → meta.kernels</span>.
                  Peso del kernel = <span className="font-mono text-gray-400">1 / (1 + d/d0)</span>: 1.0 en d=0, 0.5 en d=d0, decae suave
                  hasta el corte en R. <span className="font-medium text-gray-300">Normalización</span>: cada señal se convierte a 0–100 por
                  <span className="font-mono text-gray-400"> rango-percentil</span> contra la distribución de los {N_COMPS} comps de referencia
                  (no min-max, porque las densidades están fuertemente sesgadas hacia 0) — el predio se inserta como consulta contra esa
                  misma distribución, nunca la altera.
                </div>
              </div>

              {/* 6. Supuestos a validar */}
              <div>
                <h3 className="text-sm font-semibold text-amber-400 mb-2">⚠ Supuestos que requieren validación humana (SCORING-SPEC.md §8)</h3>
                <ul className="space-y-1.5">
                  {SUPUESTOS.map((sup, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-3 py-2 text-xs text-amber-100/90 leading-snug"
                    >
                      <span className="text-amber-400 flex-shrink-0 mt-0.5">⚠</span>
                      <span><span className="text-amber-300 font-medium">validar —</span> {sup}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Nota honesta de cierre */}
              <div className="text-[11px] text-gray-500 leading-relaxed border-t border-[#1e1e2e] pt-3">
                Estos pesos son opinables; ajústalos si tu tesis difiere. Cambiarlos requiere re-correr{' '}
                <span className="font-mono">compute-scores.mjs</span>. Este panel es de solo lectura — no edita pesos en vivo — y
                existe para que puedas auditar el modelo, no solo confiar en el ranking final. Fuente completa:{' '}
                <span className="font-mono">SCORING-SPEC.md</span>.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
