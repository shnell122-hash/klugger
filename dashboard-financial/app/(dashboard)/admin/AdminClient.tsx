'use client';
import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { api } from '@/lib/api';
import type { OperationType, LLMCostAgent, LLMCostPoint } from '@/lib/api';

interface Props {
  opTypes: OperationType[];
  llmData: { byAgent: LLMCostAgent[]; timeSeries: LLMCostPoint[] };
}

// ── Comisiones configurables ──────────────────────────────────────────────────

function CommissionConfig({ types }: { types: OperationType[] }) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(types.map(t => [t.codigo, (t.comision_pct * 100).toFixed(1)]))
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const handleSave = async (codigo: string) => {
    const pct = parseFloat(values[codigo]) / 100;
    if (isNaN(pct) || pct < 0 || pct >= 1) return;
    setSaving(codigo);
    try {
      await api.updateOpType(codigo, pct);
      setSaved(codigo);
      setTimeout(() => setSaved(null), 2000);
    } catch (e) {
      alert(`Error: ${(e as Error).message}`);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="glass rounded-xl p-5 border border-border">
      <h2 className="text-sm font-semibold text-gray-300 mb-4">Comisiones por tipo de operación</h2>
      <div className="space-y-3">
        {types.map(t => (
          <div key={t.codigo} className="flex items-center gap-3">
            <span className="text-sm font-medium text-white w-24">{t.nombre}</span>
            <div className="flex items-center gap-2 flex-1">
              <input
                type="number"
                step="0.1"
                min="0"
                max="99"
                value={values[t.codigo]}
                onChange={e => setValues(v => ({ ...v, [t.codigo]: e.target.value }))}
                className="w-24 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-accent/50"
              />
              <span className="text-sm text-gray-500">%</span>
              <button
                disabled={saving === t.codigo}
                onClick={() => handleSave(t.codigo)}
                className="px-3 py-1.5 text-xs rounded-lg bg-accent/10 text-accent-light border border-accent/20 hover:bg-accent/20 transition disabled:opacity-50"
              >
                {saving === t.codigo ? '...' : saved === t.codigo ? '✓ Guardado' : 'Guardar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Costos LLM por agente ─────────────────────────────────────────────────────

function LLMCostsByAgent({ byAgent }: { byAgent: LLMCostAgent[] }) {
  return (
    <div className="glass rounded-xl p-5 border border-border">
      <h2 className="text-sm font-semibold text-gray-300 mb-4">Costos LLM por agente (30 días)</h2>
      <div className="space-y-2 mb-4">
        {byAgent.map(a => (
          <div key={`${a.agent_name}-${a.model}`} className="flex items-center gap-3 text-xs">
            <span className="text-gray-400 w-36 truncate">{a.agent_name}</span>
            <span className="text-gray-600 w-28 truncate font-mono">{a.model}</span>
            <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full"
                style={{
                  width: `${Math.min(100, (a.total_cost_usd / (byAgent[0]?.total_cost_usd || 1)) * 100)}%`,
                }}
              />
            </div>
            <span className="font-mono text-success w-20 text-right">
              ${Number(a.total_cost_usd).toFixed(5)}
            </span>
            <span className="text-gray-600 w-14 text-right">{a.total_calls} calls</span>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={byAgent} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
          <XAxis dataKey="agent_name" tick={{ fill: '#6b7280', fontSize: 9 }} tickLine={false} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} tickLine={false} axisLine={false}
            tickFormatter={v => `$${v.toFixed(3)}`} />
          <Tooltip
            contentStyle={{ background: '#111118', border: '1px solid #1e1e2e', borderRadius: 8 }}
            formatter={(v: number) => [`$${v.toFixed(6)}`, 'Costo']}
          />
          <Bar dataKey="total_cost_usd" fill="#7c3aed" radius={[3, 3, 0, 0]} name="Costo USD" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Serie de tiempo de costos ─────────────────────────────────────────────────

function LLMCostTimeSeries({ data }: { data: LLMCostPoint[] }) {
  const formatted = data.map(d => ({
    ...d,
    fecha_fmt: format(parseISO(d.fecha), 'd MMM'),
  }));

  return (
    <div className="glass rounded-xl p-5 border border-border">
      <h2 className="text-sm font-semibold text-gray-300 mb-4">Tendencia de costos LLM (30 días)</h2>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
          <XAxis dataKey="fecha_fmt" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false}
            tickFormatter={v => `$${v.toFixed(3)}`} />
          <Tooltip
            contentStyle={{ background: '#111118', border: '1px solid #1e1e2e', borderRadius: 8 }}
            formatter={(v: number) => [`$${v.toFixed(5)}`, '']}
          />
          <Legend wrapperStyle={{ fontSize: '11px', color: '#9ca3af' }} />
          <Line type="monotone" dataKey="total_cost_usd" name="Costo USD"
            stroke="#7c3aed" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── API Keys (solo admin) ─────────────────────────────────────────────────────

function APIKeys() {
  const [show, setShow] = useState(false);
  const keys = [
    { name: 'DeepSeek API Key',    env: 'DEEPSEEK_API_KEY',           masked: '...****' + (process.env.DEEPSEEK_API_KEY?.slice(-4) ?? '????') },
    { name: 'Telegram Bot Token',  env: 'FIN_TELEGRAM_BOT_TOKEN',     masked: '...****' + '????' },
    { name: 'Anthropic API Key',   env: 'ANTHROPIC_API_KEY',          masked: '...****' + '????' },
  ];

  return (
    <div className="glass rounded-xl p-5 border border-border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-300">API Keys</h2>
        <button
          onClick={() => setShow(!show)}
          className="text-xs px-2 py-1 rounded border border-border text-gray-500 hover:text-white hover:border-accent/30 transition"
        >
          {show ? '🙈 Ocultar' : '👁️ Mostrar'}
        </button>
      </div>
      <div className="space-y-2">
        {keys.map(k => (
          <div key={k.env} className="flex items-center gap-3 text-xs">
            <span className="text-gray-400 w-40">{k.name}</span>
            <code className="font-mono text-gray-600 bg-surface px-2 py-1 rounded flex-1">
              {show ? `${k.env}=****` : k.masked}
            </code>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-600 mt-3">
        Configuradas en <code className="text-gray-500">financial/.env</code>
      </p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminClient({ opTypes, llmData }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <CommissionConfig types={opTypes} />
      <APIKeys />
      <LLMCostsByAgent byAgent={llmData.byAgent} />
      <LLMCostTimeSeries data={llmData.timeSeries} />
    </div>
  );
}
