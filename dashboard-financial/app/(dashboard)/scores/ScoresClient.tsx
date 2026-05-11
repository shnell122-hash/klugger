'use client';

import { useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts';
import { api, type LearningEpisodesData, type LearningEpisode, type LearningPattern, fmt } from '@/lib/api';

const TIER_COLOR: Record<number, string> = {
  1: '#0EA5E9', 2: '#F59E0B', 3: '#F97316', 4: '#8B5CF6',
};
const TIER_LABEL: Record<number, string> = {
  1: 'Básico', 2: 'Intermedio', 3: 'Avanzado', 4: 'Edge',
};

function scoreColor(pct: number) {
  if (pct >= 80) return 'text-emerald-400';
  if (pct >= 60) return 'text-yellow-400';
  return 'text-red-400';
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' }) + ' ' +
    dt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

interface CustomDotProps {
  cx?: number; cy?: number; payload?: LearningEpisode;
}
function TierDot({ cx = 0, cy = 0, payload }: CustomDotProps) {
  const color = TIER_COLOR[payload?.complexity_tier ?? 1] ?? '#94A3B8';
  return <circle cx={cx} cy={cy} r={3} fill={color} stroke="none" opacity={0.85} />;
}

interface TooltipProps {
  active?: boolean; payload?: Array<{ payload: LearningEpisode }>;
}
function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const ep = payload[0].payload;
  const tier = ep.complexity_tier;
  return (
    <div className="glass rounded-lg p-3 border border-white/10 text-xs space-y-1 min-w-[160px]">
      <div className="font-bold text-white">Episodio #{ep.episode_num}</div>
      <div style={{ color: TIER_COLOR[tier] }}>Tier {tier} — {TIER_LABEL[tier]}</div>
      <div className={`font-bold text-base ${scoreColor(Number(ep.score_pct))}`}>
        {Number(ep.score_pct).toFixed(1)}%
      </div>
      <div className="text-gray-400">{ep.passed_tests}/{ep.total_tests} tests</div>
      {ep.git_sha && <div className="font-mono text-gray-500">{ep.git_sha.slice(0, 7)}</div>}
      <div className="text-gray-500">{fmtDate(ep.completed_at ?? ep.started_at)}</div>
    </div>
  );
}

export default function ScoresClient({ initialData }: { initialData: LearningEpisodesData | null }) {
  const [data, setData] = useState<LearningEpisodesData | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(initialData?.episodes.length ?? 0);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getLearningEpisodes(300, 0);
      setData(res);
      setOffset(res.episodes.length);
    } catch (_) {} finally { setLoading(false); }
  }, []);

  const loadMore = useCallback(async () => {
    if (!data) return;
    setLoading(true);
    try {
      const res = await api.getLearningEpisodes(200, offset);
      setData(prev => prev ? {
        ...prev,
        episodes: [...prev.episodes, ...res.episodes],
      } : res);
      setOffset(o => o + res.episodes.length);
    } catch (_) {} finally { setLoading(false); }
  }, [data, offset]);

  if (!data) return (
    <div className="glass rounded-xl p-8 border border-white/10 text-center text-gray-500 text-sm">
      Sin datos — verifica que la tabla <code>learning_episodes</code> existe y el conversation-engine está activo.
    </div>
  );

  const latest = data.latest;
  const episodes = data.episodes;
  // Chart: reversed to chronological order, last 200
  const chartData = [...episodes].reverse().slice(-200);
  const hasMore = episodes.length < data.total;

  return (
    <div className="space-y-5">

      {/* ── Pills / summary ── */}
      <div className="flex flex-wrap gap-3 items-center">
        {latest && (
          <div className="glass rounded-xl px-4 py-2 border border-white/10 flex items-center gap-3">
            <span className="text-gray-400 text-xs">Último score</span>
            <span className={`text-2xl font-bold ${scoreColor(Number(latest.score_pct))}`}>
              {Number(latest.score_pct).toFixed(1)}%
            </span>
            <span className="text-xs" style={{ color: TIER_COLOR[latest.complexity_tier] }}>
              Ep #{latest.episode_num} · Tier {latest.complexity_tier} {TIER_LABEL[latest.complexity_tier]}
            </span>
          </div>
        )}
        <div className="glass rounded-xl px-4 py-2 border border-white/10 text-sm text-gray-300">
          <span className="text-gray-500 text-xs">Total </span>
          <span className="font-bold">{data.total}</span>
          <span className="text-gray-500 text-xs"> episodios</span>
        </div>
        {episodes.length > 0 && (
          <div className="glass rounded-xl px-4 py-2 border border-white/10 text-sm text-gray-300">
            <span className="text-gray-500 text-xs">Promedio (últimos {episodes.length}) </span>
            <span className="font-bold">
              {(episodes.reduce((s, e) => s + Number(e.score_pct), 0) / episodes.length).toFixed(1)}%
            </span>
          </div>
        )}
        <button
          onClick={refresh}
          disabled={loading}
          className="ml-auto px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300 hover:bg-white/10 transition disabled:opacity-50"
        >
          {loading ? '...' : '↻ Refresh'}
        </button>
      </div>

      {/* ── Line chart ── */}
      <div className="glass rounded-xl p-5 border border-white/10">
        <div className="text-xs text-gray-500 mb-3">Score % por episodio (últimos 200) · línea roja = umbral 80%</div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="episode_num"
              tick={{ fontSize: 9, fill: '#6b7280' }}
              tickFormatter={(v) => `#${v}`}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: '#6b7280' }}
              tickFormatter={(v) => `${v}%`}
              width={30}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={80} stroke="#EF4444" strokeDasharray="4 3" strokeWidth={1.5} />
            <Line
              type="monotone"
              dataKey="score_pct"
              stroke="#0EA5E9"
              strokeWidth={1.5}
              dot={<TierDot />}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
        {/* Tier legend */}
        <div className="flex gap-4 mt-2">
          {([1, 2, 3, 4] as const).map(t => (
            <span key={t} className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: TIER_COLOR[t] }} />
              T{t} {TIER_LABEL[t]}
            </span>
          ))}
        </div>
      </div>

      {/* ── Active patterns ── */}
      {data.patterns.length > 0 && (
        <div className="glass rounded-xl p-5 border border-white/10 space-y-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Patrones activos ({data.patterns.length})
          </div>
          <div className="space-y-2">
            {data.patterns.map((p: LearningPattern) => (
              <div key={p.pattern_key} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2">
                <span className="min-w-[36px] text-center text-xs font-bold text-red-400 bg-red-400/10 rounded px-1.5 py-0.5">
                  ×{p.episode_count}
                </span>
                <span className="flex-1 text-xs text-gray-200 truncate" title={p.description}>
                  {p.description || p.test_id}
                </span>
                <span className="text-xs text-gray-500 font-mono">{p.test_id}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Episode table ── */}
      <div className="glass rounded-xl border border-white/10 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Historial de episodios
          </span>
          <span className="ml-2 text-xs text-gray-500">
            ({episodes.length} de {data.total})
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 text-gray-500">
                <th className="px-5 py-2 text-left font-medium">#</th>
                <th className="px-3 py-2 text-center font-medium">Tier</th>
                <th className="px-3 py-2 text-center font-medium">Score</th>
                <th className="px-3 py-2 text-center font-medium">Tests</th>
                <th className="px-3 py-2 text-left font-medium">Fecha</th>
                <th className="px-3 py-2 text-left font-medium">SHA</th>
                <th className="px-3 py-2 text-left font-medium">Origen</th>
              </tr>
            </thead>
            <tbody>
              {episodes.map((ep: LearningEpisode) => (
                <tr key={ep.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-5 py-2 text-gray-400">#{ep.episode_num}</td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded"
                      style={{
                        color: TIER_COLOR[ep.complexity_tier],
                        background: `${TIER_COLOR[ep.complexity_tier]}20`,
                      }}
                    >
                      T{ep.complexity_tier}
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-center font-bold ${scoreColor(Number(ep.score_pct))}`}>
                    {Number(ep.score_pct).toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 text-center text-gray-400">
                    {ep.passed_tests}/{ep.total_tests}
                  </td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                    {fmtDate(ep.completed_at ?? ep.started_at)}
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-500">
                    {ep.git_sha ? ep.git_sha.slice(0, 7) : '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {ep.triggered_by ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <div className="px-5 py-3 border-t border-white/10 text-center">
            <button
              onClick={loadMore}
              disabled={loading}
              className="px-4 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300 hover:bg-white/10 transition disabled:opacity-50"
            >
              {loading ? 'Cargando...' : `Cargar más (${data.total - episodes.length} restantes)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
