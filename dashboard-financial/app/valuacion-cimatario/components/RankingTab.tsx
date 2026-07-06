'use client';

import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import landScoresRaw from '../data/scores/land-scores.json';
import scoresReportRaw from '../data/scores/scores-report.json';
import predioScorecardRaw from '../data/scores/predio-scorecard.json';
import terrenosFullRaw from '../terrenos_full.json';
import { fmtMoney, fmtMX } from '@/lib/format';

// ─────────────────────────────────────────────────────────────────────────
// Todo lo que este tab muestra viene de tres artefactos ya calculados por el
// pipeline determinista descrito en data/scores/SCORING-SPEC.md — este
// componente NO recalcula ningún score, solo los lee, los une (por `link`)
// con terrenos_full.json para mostrar título/ubicación, y los presenta:
//   - land-scores.json      → score + 7 subscores por cada uno de los 537 comps
//   - scores-report.json    → bandas de $/m² del mercado, top10, percentiles del predio
//   - predio-scorecard.json → dónde cae el predio objeto bajo 3 lentes de negocio
// ─────────────────────────────────────────────────────────────────────────

type LandComp = {
  link: string;
  lat: number;
  lng: number;
  price: number;
  size_m2: number;
  ppm: number;
  score: number;
  subscores: Record<string, number | null>;
  flags?: { value_outlier?: boolean };
  rank: number;
  percentil: number;
};

const landScores = landScoresRaw as unknown as { meta: any; comps: LandComp[] };
const scoresReport = scoresReportRaw as any;
const predioScorecard = predioScorecardRaw as any;

// Etiquetas de los 7 subscores — texto tomado literalmente de
// SCORING-SPEC.md §2 (S1..S7) y de los `weakest_label` que el propio pipeline
// ya emite en predio-scorecard.json (p.ej. "valor ($/m² relativo)",
// "competencia neta"), para no inventar redacción nueva.
const SUBSCORE_KEYS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'] as const;
type SubscoreKey = typeof SUBSCORE_KEYS[number];
const SUBSCORE_LABEL: Record<SubscoreKey, string> = {
  S1: 'valor ($/m² relativo)',
  S2: 'oportunidad de ubicación',
  S3: 'consumo meta (co-living)',
  S4: 'anclas (hospital, universidad, plaza, súper)',
  S5: 'equipamiento de barrio',
  S6: 'competencia neta (baja saturación)',
  S7: 'crecimiento / inversión futura',
};
const SUBSCORE_SHORT: Record<SubscoreKey, string> = {
  S1: 'Valor', S2: 'Oportun.', S3: 'Consumo', S4: 'Ancla', S5: 'Equipam.', S6: 'Compet.', S7: 'Crecim.',
};
const WEIGHTS: Record<SubscoreKey, number> = landScores.meta.weights;

const C = { green: '#10b981', violet: '#7c3aed', violetLight: '#a78bfa', amber: '#f59e0b', red: '#ef4444' };

// ── Join con terrenos_full.json (título/ubicación por link) ─────────────────
const titleByLink = new Map<string, { title?: string; location?: string; address?: string }>();
for (const row of terrenosFullRaw as any[]) {
  if (row.link && !titleByLink.has(row.link)) {
    titleByLink.set(row.link, { title: row.title, location: row.location, address: row.address });
  }
}

// Heurística de colonia: `address` es texto libre de geocodificación, no un
// catálogo canónico de colonias. Se toma el primer segmento (tras la calle)
// que no sea el propio estado/ciudad/país/CP. Cuando no se puede aislar un
// nombre limpio, se cae honestamente al campo `location` (más amplio, p.ej.
// "Juriquilla, Querétaro Arteaga") en vez de inventar una colonia.
const SKIP_SEGMENTS = new Set([
  'querétaro', 'querétaro arteaga', 'santiago de querétaro', 'santiago de queretaro',
  'mex', 'méxico', 'mexico', 'qro.', 'qro',
]);
function deriveColonia(address: string | undefined, location: string | undefined): string {
  if (address) {
    const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i];
      const low = p.toLowerCase();
      if (SKIP_SEGMENTS.has(low)) continue;
      if (/^\d+$/.test(p)) continue; // código postal
      return p;
    }
  }
  return location || 'Sin dato';
}

// ── Tipología por precio ($/m²) — bandas tomadas de scores-report.json,
// que el pipeline ya calculó winsorizando a [p5,p95] sobre los 537 comps.
// No se inventan cortes: son p25/p75/p90 reales del mercado.
const PPM_BANDS = scoresReport.ppm_bands as { p25: number; p75: number; p90: number };
type PriceTier = 'Económico' | 'Medio' | 'Premium' | 'Lujo';
function priceTierOf(ppm: number): PriceTier {
  if (ppm < PPM_BANDS.p25) return 'Económico';
  if (ppm < PPM_BANDS.p75) return 'Medio';
  if (ppm < PPM_BANDS.p90) return 'Premium';
  return 'Lujo';
}
const PRICE_TIER_ORDER: PriceTier[] = ['Económico', 'Medio', 'Premium', 'Lujo'];

// ── Tipología por tamaño — terciles calculados en vivo sobre los 537 comps
// reales de este dataset (no un umbral externo inventado).
function quantile(sortedAsc: number[], q: number): number {
  const pos = (sortedAsc.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sortedAsc[base + 1] !== undefined ? sortedAsc[base] + rest * (sortedAsc[base + 1] - sortedAsc[base]) : sortedAsc[base];
}
type SizeTier = 'Pequeño' | 'Mediano' | 'Grande';
function sizeTierOf(size: number, p33: number, p66: number): SizeTier {
  if (size <= p33) return 'Pequeño';
  if (size <= p66) return 'Mediano';
  return 'Grande';
}

function topDrivers(subscores: Record<string, number | null>, n = 3) {
  return (Object.entries(subscores) as [SubscoreKey, number | null][])
    .filter(([, v]) => v != null)
    .map(([key, v]) => ({ key, value: v as number, weight: WEIGHTS[key] ?? 0, contribution: (v as number) * (WEIGHTS[key] ?? 0) }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, n);
}

// Barra sparkline de 7 segmentos (uno por subscore) — codificación
// secuencial de una sola tonalidad (verde) por magnitud 0..100, tal como
// pide la guía de dataviz del proyecto: el color aquí NO distingue
// categorías, distingue "qué tan alto" es cada subscore de este comp.
function SubscoreMiniBars({ subscores }: { subscores: Record<string, number | null> }) {
  return (
    <div className="flex items-end gap-[2px] h-6" title="S1..S7 — ver detalle en la card del top-5 o en metodología">
      {SUBSCORE_KEYS.map((k) => {
        const v = subscores[k] ?? 0;
        return (
          <div
            key={k}
            title={`${SUBSCORE_SHORT[k]} (${k}): ${v.toFixed(0)}`}
            className="w-[5px] rounded-t-sm bg-[var(--brand-green)]"
            style={{ height: `${Math.max(6, v)}%`, opacity: 0.3 + 0.7 * (v / 100) }}
          />
        );
      })}
    </div>
  );
}

type SortKey = 'score' | 'price' | 'ppm' | 'size';

export default function RankingTab() {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('score');
  const [onlyTopDecile, setOnlyTopDecile] = useState(false);
  const [page, setPage] = useState(1);
  const [showMethodology, setShowMethodology] = useState(false);
  const perPage = 25;

  const joined = useMemo(() => {
    const comps = landScores.comps;
    const sizes = [...comps.map((c) => c.size_m2)].sort((a, b) => a - b);
    const p33 = quantile(sizes, 0.33);
    const p66 = quantile(sizes, 0.66);
    return comps.map((c) => {
      const meta = titleByLink.get(c.link);
      return {
        ...c,
        title: meta?.title || 'Sin título',
        location: meta?.location || '',
        colonia: deriveColonia(meta?.address, meta?.location),
        priceTier: priceTierOf(c.ppm),
        sizeTier: sizeTierOf(c.size_m2, p33, p66),
      };
    });
  }, []);

  const sizeTierBounds = useMemo(() => {
    const sizes = [...landScores.comps.map((c) => c.size_m2)].sort((a, b) => a - b);
    return { p33: Math.round(quantile(sizes, 0.33)), p66: Math.round(quantile(sizes, 0.66)) };
  }, []);

  // ── Clasificación agregada (punto 1: clasifica los 537) ──────────────────
  const priceTierStats = useMemo(() => {
    const groups = new Map<PriceTier, { count: number; scoreSum: number }>();
    for (const c of joined) {
      const g = groups.get(c.priceTier) || { count: 0, scoreSum: 0 };
      g.count++; g.scoreSum += c.score;
      groups.set(c.priceTier, g);
    }
    return PRICE_TIER_ORDER.map((tier) => {
      const g = groups.get(tier) || { count: 0, scoreSum: 0 };
      return { tier, count: g.count, avgScore: g.count > 0 ? g.scoreSum / g.count : 0 };
    });
  }, [joined]);

  const sizeTierStats = useMemo(() => {
    const groups = new Map<SizeTier, { count: number; scoreSum: number }>();
    for (const c of joined) {
      const g = groups.get(c.sizeTier) || { count: 0, scoreSum: 0 };
      g.count++; g.scoreSum += c.score;
      groups.set(c.sizeTier, g);
    }
    return (['Pequeño', 'Mediano', 'Grande'] as SizeTier[]).map((tier) => {
      const g = groups.get(tier) || { count: 0, scoreSum: 0 };
      return { tier, count: g.count, avgScore: g.count > 0 ? g.scoreSum / g.count : 0 };
    });
  }, [joined]);

  const topColonias = useMemo(() => {
    const groups = new Map<string, { count: number; scoreSum: number; ppmSum: number }>();
    for (const c of joined) {
      const g = groups.get(c.colonia) || { count: 0, scoreSum: 0, ppmSum: 0 };
      g.count++; g.scoreSum += c.score; g.ppmSum += c.ppm;
      groups.set(c.colonia, g);
    }
    return [...groups.entries()]
      .map(([colonia, g]) => ({ colonia, count: g.count, avgScore: g.scoreSum / g.count, avgPpm: g.ppmSum / g.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [joined]);

  // ── Top-5 con desglose (punto 3) ──────────────────────────────────────────
  const top5 = joined.slice(0, 5);

  // ── Tabla filtrable/ordenable/paginada (punto 2) ─────────────────────────
  const processed = useMemo(() => {
    let list = joined;
    if (onlyTopDecile) list = list.filter((c) => c.percentil >= 90);
    const q = search.toLowerCase().trim();
    if (q) list = list.filter((c) => `${c.title} ${c.location} ${c.colonia} ${c.link}`.toLowerCase().includes(q));
    list = [...list].sort((a, b) => {
      if (sortBy === 'price') return a.price - b.price; // más barato primero
      if (sortBy === 'ppm') return a.ppm - b.ppm; // mejor valor primero
      if (sortBy === 'size') return b.size_m2 - a.size_m2; // más grande primero
      return b.score - a.score; // mejor score primero
    });
    return list;
  }, [joined, onlyTopDecile, search, sortBy]);

  const totalPages = Math.max(1, Math.ceil(processed.length / perPage));
  const pageItems = processed.slice((page - 1) * perPage, page * perPage);

  // ── Dónde cae el predio objeto (punto 4) — 100% desde predio-scorecard.json ─
  const lentes = predioScorecard.lentes as Record<string, any>;
  const LENS_NAME: Record<string, string> = {
    desarrollador: 'Desarrollador', comprador: 'Comprador (usuario final)', inversionista: 'Inversionista',
  };
  const lensEntries = Object.entries(lentes);
  const bestByRank = lensEntries.reduce((best, cur) => (cur[1].ranking_en_537 < best[1].ranking_en_537 ? cur : best));
  const bestByScore = lensEntries.reduce((best, cur) => (cur[1].score > best[1].score ? cur : best));
  const predioIsTop5 = bestByRank[1].ranking_en_537 <= 5;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">🏆 Ranking de Terrenos — Clasificación de Todo el Mercado</h2>
        <p className="text-sm text-gray-400 mt-1 max-w-3xl">
          Los {landScores.comps.length} comps reales de Cimatario, ordenados y clasificados por un
          <strong className="text-white"> Land Score 0–100</strong> (S1 valor + S2 oportunidad de ubicación
          + S3–S6 proximidades atómicas + S7 crecimiento, ver metodología abajo). El score es{' '}
          <strong className="text-white">relativo al propio mercado</strong>: compara cada terreno contra
          los otros {landScores.comps.length - 1}, no contra un estándar externo.
        </p>
        <button
          onClick={() => setShowMethodology((v) => !v)}
          className="mt-3 text-xs px-3 py-1.5 rounded-full border border-[#1e1e2e] bg-[#111118] hover:bg-[#1a1a22] text-[var(--brand-violet-light)]"
        >
          {showMethodology ? 'Ocultar metodología ▲' : 'Ver metodología (qué es cada subscore) ▼'}
        </button>
        {showMethodology && (
          <div className="mt-3 bg-[#111118] rounded-2xl p-4 border border-[#1e1e2e] text-xs text-gray-400 space-y-2 max-w-3xl">
            <p>
              Cada comp recibe 7 subscores (0–100, percentil dentro de los {landScores.comps.length} comps
              válidos) y el Land Score es su suma ponderada:
            </p>
            <ul className="space-y-1">
              {SUBSCORE_KEYS.map((k) => (
                <li key={k}>
                  <span className="text-white font-mono">{k}</span> — {SUBSCORE_LABEL[k]} · peso <span className="font-mono">{WEIGHTS[k]}</span>
                </li>
              ))}
            </ul>
            <p>
              S1 se invierte (más barato relativo = más puntos). S3–S6 son ingredientes del propio S2
              (oportunidad de ubicación) repetidos con peso chico solo para poder explicar el "por qué" de
              cada score sin triple-contar. Fuente completa de fórmulas y guardas anti-alucinación:{' '}
              <span className="font-mono">data/scores/SCORING-SPEC.md</span>.
            </p>
            <p>
              Insumos descartados por dato sucio (documentado, no oculto): competencia{' '}
              {scoresReport.poi_discarded_outlier?.competencia?.discarded_far ?? 0} POIs descartados por
              coordenada implausible (&gt;50 km); inversión{' '}
              {scoresReport.poi_discarded_outlier?.inversion?.discarded_null ?? 0} descartados por dato nulo.
            </p>
          </div>
        )}
      </div>

      {/* Punto 4 — banner honesto de dónde cae el predio objeto */}
      <div className={`rounded-2xl p-5 border ${predioIsTop5 ? 'border-[var(--brand-green)]/40 bg-[var(--brand-green)]/5' : 'border-[var(--amber,#f59e0b)]/30 bg-[#111118]'}`} style={{ borderColor: predioIsTop5 ? undefined : 'rgba(245,158,11,0.3)' }}>
        <h3 className="text-lg font-semibold mb-1">📍 ¿Dónde cae el predio objeto (660 m², asking $7,000,000) en este ranking?</h3>
        <p className="text-sm text-gray-300 mb-4">
          {predioIsTop5
            ? `El predio SÍ está en el top-5 bajo el lente ${LENS_NAME[bestByRank[0]]} (#${bestByRank[1].ranking_en_537} de ${landScores.comps.length}).`
            : `Honestamente: el predio NO está en el top-5 de ningún lente. Su mejor posición relativa es #${bestByRank[1].ranking_en_537} de ${landScores.comps.length} (percentil ${fmtMX(bestByRank[1].percentil, 1)}) bajo el lente ${LENS_NAME[bestByRank[0]]}. Por score más alto, el mejor lente es ${LENS_NAME[bestByScore[0]]} (${fmtMX(bestByScore[1].score, 1)}/100).`}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {lensEntries.map(([key, l]) => (
            <div key={key} className="bg-[#0a0a0f] rounded-xl p-3 border border-[#1e1e2e]">
              <div className="text-xs text-gray-500 uppercase tracking-wide">{LENS_NAME[key] || key}</div>
              <div className="text-2xl font-mono font-bold text-white">{fmtMX(l.score, 1)}<span className="text-sm text-gray-500">/100</span></div>
              <div className="text-xs text-gray-400 mt-1">
                Percentil {fmtMX(l.percentil, 1)} · rank #{l.ranking_en_537} de {landScores.comps.length}
              </div>
              <div className="text-xs text-gray-500 mt-1">Punto más débil: {l.weakest_label} ({l.weakest})</div>
            </div>
          ))}
        </div>
      </div>

      {/* Punto 1 — clasificación / tipología de los 537 */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Clasificación de los {landScores.comps.length} inmuebles</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="chart-card-enter bg-[#111118] rounded-2xl p-4 border border-[#1e1e2e]">
            <h4 className="text-sm font-semibold text-gray-300 mb-1">Por precio relativo ($/m²)</h4>
            <p className="text-[11px] text-gray-500 mb-3">
              Bandas del mercado real (winsorizadas p5–p95): Económico &lt; ${fmtMX(PPM_BANDS.p25)}/m² ·
              Medio hasta ${fmtMX(PPM_BANDS.p75)}/m² · Premium hasta ${fmtMX(PPM_BANDS.p90)}/m² · Lujo por
              encima.
            </p>
            <ResponsiveContainer width="100%" height={180} debounce={50}>
              <BarChart data={priceTierStats} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="tier" tick={{ fill: '#6b7280', fontSize: 10 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
                <Tooltip formatter={(v: number, name: string) => [name === 'count' ? v : v.toFixed(1), name === 'count' ? 'Inmuebles' : 'Score prom.']} />
                <Bar dataKey="count" name="count" fill={C.green} radius={[3, 3, 0, 0]} animationDuration={350} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card-enter bg-[#111118] rounded-2xl p-4 border border-[#1e1e2e]">
            <h4 className="text-sm font-semibold text-gray-300 mb-1">Por tamaño (terciles reales del dataset)</h4>
            <p className="text-[11px] text-gray-500 mb-3">
              Pequeño ≤ {sizeTierBounds.p33} m² · Mediano hasta {sizeTierBounds.p66} m² · Grande por encima
              (cortes = p33/p66 de los {landScores.comps.length} comps, no un umbral externo).
            </p>
            <ResponsiveContainer width="100%" height={180} debounce={50}>
              <BarChart data={sizeTierStats} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="tier" tick={{ fill: '#6b7280', fontSize: 10 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
                <Tooltip formatter={(v: number) => v} />
                <Bar dataKey="count" name="Inmuebles" fill={C.violet} radius={[3, 3, 0, 0]} animationDuration={350} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#111118] rounded-2xl p-4 border border-[#1e1e2e]">
          <h4 className="text-sm font-semibold text-gray-300 mb-1">Submercados (colonia derivada de la dirección scrapeada)</h4>
          <p className="text-[11px] text-gray-500 mb-3">
            Heurística de texto libre sobre <span className="font-mono">address</span>, no un catálogo
            oficial de colonias — cuando no se puede aislar limpio, cae a la ubicación amplia.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-xs">
                <tr>
                  <th className="text-left px-2 py-1">Colonia / zona</th>
                  <th className="text-right px-2 py-1">Comps</th>
                  <th className="text-right px-2 py-1">Score prom.</th>
                  <th className="text-right px-2 py-1">$/m² prom.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {topColonias.map((c) => (
                  <tr key={c.colonia}>
                    <td className="px-2 py-1.5 text-white">{c.colonia}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{c.count}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-[var(--brand-green)]">{c.avgScore.toFixed(1)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-[var(--brand-violet-light)]">{fmtMX(Math.round(c.avgPpm))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Punto 3 — top-5 con el porqué */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Top-5 terrenos para comprar (y por qué)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {top5.map((c) => {
            const drivers = topDrivers(c.subscores, 3);
            const radarData = SUBSCORE_KEYS.map((k) => ({ subj: SUBSCORE_SHORT[k], valor: c.subscores[k] ?? 0 }));
            return (
              <div key={c.link} className="chart-card-enter bg-[#111118] rounded-2xl p-4 border border-[#1e1e2e] flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="text-xs text-gray-500">#{c.rank} · percentil {c.percentil.toFixed(1)}</div>
                    <div className="font-medium text-white text-sm truncate" title={c.title}>{c.title}</div>
                    <div className="text-[11px] text-gray-500">{c.colonia}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-mono font-bold text-[var(--brand-green)]">{c.score.toFixed(1)}</div>
                    <div className="text-[10px] text-gray-500">score</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px] mb-2">
                  <div><div className="text-gray-500">Precio</div><div className="font-mono text-white">{fmtMoney(c.price)}</div></div>
                  <div><div className="text-gray-500">m²</div><div className="font-mono text-white">{c.size_m2}</div></div>
                  <div><div className="text-gray-500">$/m²</div><div className="font-mono text-white">{fmtMX(c.ppm)}</div></div>
                </div>
                <ResponsiveContainer width="100%" height={160} debounce={50}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#1e1e2e" />
                    <PolarAngleAxis dataKey="subj" tick={{ fill: '#6b7280', fontSize: 9 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 8 }} />
                    <Radar dataKey="valor" stroke={C.violetLight} fill={C.violet} fillOpacity={0.45} animationDuration={350} animationEasing="ease-out" />
                    <Tooltip formatter={(v: number) => v.toFixed(0)} />
                  </RadarChart>
                </ResponsiveContainer>
                <div className="text-[11px] text-gray-400 mt-2 flex-1">
                  Lo que más empuja su score: {drivers.map((d) => `${SUBSCORE_LABEL[d.key]} (${d.value.toFixed(0)} pts × peso ${d.weight})`).join(', ')}.
                  {c.flags?.value_outlier && <span className="text-[var(--amber,#f59e0b)]" style={{ color: '#f59e0b' }}> ⚠ $/m² marcado como atípico (fuera de banda p5–p95).</span>}
                </div>
                <a href={c.link} target="_blank" rel="noopener noreferrer" className="mt-3 text-xs text-center text-[var(--brand-violet-light)] underline hover:text-white">
                  Ver listing original ↗
                </a>
              </div>
            );
          })}
        </div>
      </div>

      {/* Punto 2 — tabla completa filtrable/ordenable/paginada */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Tabla completa — {landScores.comps.length} comps ordenados</h3>

        <div className="flex flex-col md:flex-row gap-3">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar (título, colonia, link...)"
            className="flex-1 bg-[#111118] border border-[#1e1e2e] rounded-2xl px-4 py-2.5 text-sm"
          />
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value as SortKey); setPage(1); }}
            className="bg-[#111118] border border-[#1e1e2e] rounded-2xl px-3 py-2 text-sm"
          >
            <option value="score">Score (mejor primero)</option>
            <option value="price">Precio (menor primero)</option>
            <option value="ppm">$/m² (menor primero)</option>
            <option value="size">Tamaño (mayor primero)</option>
          </select>
          <button
            onClick={() => { setOnlyTopDecile((v) => !v); setPage(1); }}
            className={`px-4 py-2 rounded-2xl text-sm font-medium border whitespace-nowrap ${onlyTopDecile ? 'bg-[#7c3aed] text-white border-[#7c3aed]' : 'border-[#1e1e2e] hover:bg-[#1a1a22]'}`}
          >
            {onlyTopDecile ? 'Solo top-decil (activo)' : 'Solo top-decil'}
          </button>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[#1e1e2e] bg-[#111118]">
          <table className="w-full text-sm">
            <thead className="bg-[#0a0a0f] text-gray-400">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Título / Ubicación</th>
                <th className="px-3 py-2 text-right">Precio</th>
                <th className="px-3 py-2 text-right">m²</th>
                <th className="px-3 py-2 text-right">$/m²</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2 text-right">Percentil</th>
                <th className="px-3 py-2 text-center">S1..S7</th>
                <th className="px-3 py-2">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e2e]">
              {pageItems.length > 0 ? pageItems.map((c) => (
                <tr key={c.link} className="hover:bg-[#1a1a22]">
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{c.rank}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-white text-xs truncate max-w-[220px]" title={c.title}>{c.title}</div>
                    <div className="text-[10px] text-gray-500">{c.colonia}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[#a78bfa] text-xs">{fmtMoney(c.price)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{c.size_m2}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {fmtMX(c.ppm)}
                    {c.flags?.value_outlier && <span title="Fuera de banda p5–p95 del mercado" style={{ color: '#f59e0b' }}> ⚠</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-[var(--brand-green)] font-semibold">{c.score.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{c.percentil.toFixed(1)}</td>
                  <td className="px-3 py-2"><div className="flex justify-center"><SubscoreMiniBars subscores={c.subscores} /></div></td>
                  <td className="px-3 py-2">
                    <a href={c.link} target="_blank" rel="noopener noreferrer" className="text-[#7c3aed] underline text-xs">ver</a>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-500">Sin resultados.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center text-sm">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded border border-[#1e1e2e] disabled:opacity-50">← Anterior</button>
          <span>Página {page} de {totalPages} — {pageItems.length} de {processed.length}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 rounded border border-[#1e1e2e] disabled:opacity-50">Siguiente →</button>
        </div>
      </div>

      {/* Mismo fix de compositing que DatabaseTab.tsx: fondo opaco (no .glass)
          en las cards con Recharts + animación de entrada respetando
          prefers-reduced-motion. */}
      <style jsx>{`
        .chart-card-enter {
          animation: ranking-card-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes ranking-card-in {
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
