'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sankey, Tooltip, ResponsiveContainer, Layer, Rectangle,
} from 'recharts';

// ── Datos maestros ────────────────────────────────────────────────────────────

const ABDALA_ITEMS = [
  { concepto: 'Admón Mistral 2025',   monto: 120_000    },
  { concepto: 'Admón Mistral 2026',   monto: 134_544    },
  { concepto: 'Admón Mil Cumbres',    monto:  49_072    },
];
const ADRIAN_ITEMS = [
  { concepto: 'Mtto Mistral 2025 (cobrado)', monto: 42_643.73 },
  { concepto: 'Mtto Mistral 2026 (cobrado)', monto: 44_788    },
];
const ABDALA_TOTAL  = 303_616;
const ADRIAN_COBRO  =  87_431.73;
const YA_PAGADO     =  41_600;
const NETO          = 174_584.27;

// ── Sankey data ───────────────────────────────────────────────────────────────

const SANKEY_DATA = {
  nodes: [
    { name: 'Mistral 2025'      },   // 0
    { name: 'Mistral 2026'      },   // 1
    { name: 'Mil Cumbres'       },   // 2
    { name: 'Total Abdala'      },   // 3
    { name: 'Cobrado Adrián'    },   // 4
    { name: 'Comisiones'        },   // 5
    { name: 'NETO a pagar'      },   // 6
  ],
  links: [
    { source: 0, target: 3, value: 120_000  },
    { source: 1, target: 3, value: 134_544  },
    { source: 2, target: 3, value:  49_072  },
    { source: 3, target: 4, value:  87_432  },
    { source: 3, target: 5, value:  41_600  },
    { source: 3, target: 6, value: 174_584  },
  ],
};

// Color per node index
const NODE_FILL = ['#f59e0b','#f59e0b','#f59e0b','#f59e0b','#06b6d4','#10b981','#ef4444'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('es-MX', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function useCounter(target: number, duration = 1800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const t = Math.min((Date.now() - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 4);
      setValue(target * ease);
      if (t >= 1) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [target, duration]);
  return value;
}

// ── Custom Sankey node ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SankeyNode(props: any) {
  const { x, y, width, height, index, payload, containerWidth } = props;
  const isRight = x > containerWidth / 2;
  const fill    = NODE_FILL[index] ?? '#7c3aed';
  const label   = payload?.name ?? '';

  return (
    <g>
      <Rectangle
        x={x} y={y} width={width} height={height}
        fill={fill} fillOpacity={0.85} radius={2}
      />
      {isRight ? (
        <text
          x={x + width + 6} y={y + height / 2}
          fontSize={10} fill={fill}
          dominantBaseline="middle" fontFamily="Inter, system-ui"
        >
          {label}
        </text>
      ) : (
        <text
          x={x - 6} y={y + height / 2}
          fontSize={10} fill={fill} textAnchor="end"
          dominantBaseline="middle" fontFamily="Inter, system-ui"
        >
          {label}
        </text>
      )}
    </g>
  );
}

// ── Custom Sankey link ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SankeyLink(props: any) {
  const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX,
          linkWidth, index } = props;
  // Pick color of target node
  const fill = NODE_FILL[SANKEY_DATA.links[index]?.target] ?? '#7c3aed';
  return (
    <path
      d={`M${sourceX},${sourceY + linkWidth / 2}
          C${sourceControlX},${sourceY + linkWidth / 2}
           ${targetControlX},${targetY + linkWidth / 2}
           ${targetX},${targetY + linkWidth / 2}
          L${targetX},${targetY - linkWidth / 2}
          C${targetControlX},${targetY - linkWidth / 2}
           ${sourceControlX},${sourceY - linkWidth / 2}
           ${sourceX},${sourceY - linkWidth / 2}
          Z`}
      fill={fill}
      fillOpacity={0.18}
      stroke={fill}
      strokeOpacity={0.25}
      strokeWidth={0.5}
    />
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const val = d?.value ?? d?.sourceNode?.value;
  if (!val) return null;
  return (
    <div className="rounded-lg border border-[#1e1e2e] bg-[#111118] px-3 py-2 text-xs">
      <p className="text-[#9ca3af]">{d?.name || `${d?.sourceNode?.name} → ${d?.targetNode?.name}`}</p>
      <p className="mt-1 font-mono font-bold text-white">${fmt(val)}</p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdrianPage() {
  const neto    = useCounter(NETO);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const fadeUp = (delay = 0) => ({
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay },
  });

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── Barra superior ── */}
      <div className="sticky top-0 z-20 border-b border-[#1e1e2e] bg-[#0a0a0f]/90 backdrop-blur px-4 py-3 flex items-center gap-2">
        <span className="text-[#7c3aed] font-semibold text-sm tracking-tight">flujos</span>
        <span className="text-[#3a3a5c] text-sm">/</span>
        <span className="text-[#6b7280] text-sm">conciliación</span>
        <button
          onClick={copyLink}
          className="ml-auto rounded-md border border-[#1e1e2e] px-3 py-1 text-xs text-[#6b7280] hover:border-[#7c3aed] hover:text-white transition-colors"
        >
          {copied ? '✓ Copiado' : 'Copiar enlace'}
        </button>
      </div>

      <div ref={containerRef} className="mx-auto max-w-2xl space-y-5 px-4 pb-12 pt-8">

        {/* ── Hero ── */}
        <motion.div {...fadeUp(0)} className="text-center space-y-3">
          <p className="text-xs uppercase tracking-[0.2em] text-[#3a3a5c]">
            Conciliación privada · Abdala ↔ Adrián
          </p>

          <div className="inline-flex flex-col items-center rounded-2xl border border-[#ef4444]/20 bg-[#0d1117] px-8 py-6"
               style={{ boxShadow: '0 0 40px rgba(239,68,68,0.08)' }}>
            <p className="mb-1 text-xs text-[#6b7280]">Neto a pagar</p>
            <div className="font-bold tabular-nums text-5xl sm:text-6xl text-white">
              ${fmt(neto)}
            </div>
            <p className="mt-2 text-sm">
              <span className="font-semibold text-[#f59e0b]">Abdala</span>
              <span className="mx-2 text-[#3a3a5c]">→</span>
              <span className="font-semibold text-[#06b6d4]">Adrián</span>
            </p>
          </div>

          <p className="text-xs text-[#3a3a5c]">Datos al 26 Abr 2026 · solo lectura</p>
        </motion.div>

        {/* ── KPIs ── */}
        <motion.div {...fadeUp(0.15)} className="grid grid-cols-3 gap-3">
          {([
            { label: 'Abdala\nadministra',   amount: ABDALA_TOTAL, color: '#f59e0b' },
            { label: 'Adrián\ncobró',         amount: ADRIAN_COBRO, color: '#06b6d4' },
            { label: 'Ya\npagado',            amount: YA_PAGADO,    color: '#10b981' },
          ] as const).map(({ label, amount, color }, i) => (
            <div
              key={i}
              className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-3 text-center"
            >
              <p className="mb-1 whitespace-pre-line text-[10px] leading-tight text-[#6b7280]">{label}</p>
              <p className="font-mono font-bold text-sm tabular-nums" style={{ color }}>
                ${amount.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
              </p>
            </div>
          ))}
        </motion.div>

        {/* ── Sankey ── */}
        <motion.div {...fadeUp(0.25)} className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-4">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#6b7280]">
            Flujo de fondos
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <Sankey
                data={SANKEY_DATA}
                nodeWidth={10}
                nodePadding={28}
                margin={{ top: 8, right: 110, bottom: 8, left: 80 }}
                node={<SankeyNode />}
                link={<SankeyLink />}
              >
                <Tooltip content={<CustomTooltip />} />
              </Sankey>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* ── Detalle por parte ── */}
        <div className="grid sm:grid-cols-2 gap-4">

          {/* Abdala */}
          <motion.div {...fadeUp(0.35)} className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#f59e0b]" />
              <span className="text-xs font-semibold text-[#f59e0b]">Abdala administra</span>
            </div>
            <div className="space-y-2">
              {ABDALA_ITEMS.map((item, i) => (
                <div key={i} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-[#9ca3af]">{item.concepto}</span>
                  <span className="shrink-0 font-mono text-white">${fmt(item.monto, 0)}</span>
                </div>
              ))}
              <div className="border-t border-[#1e1e2e] pt-2 flex justify-between text-xs font-semibold">
                <span className="text-[#f59e0b]">Total</span>
                <span className="font-mono text-[#f59e0b]">${fmt(ABDALA_TOTAL, 0)}</span>
              </div>
            </div>
          </motion.div>

          {/* Adrián */}
          <motion.div {...fadeUp(0.4)} className="rounded-xl border border-[#1e1e2e] bg-[#111118] p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#06b6d4]" />
              <span className="text-xs font-semibold text-[#06b6d4]">Adrián cobró</span>
            </div>
            <div className="space-y-2">
              {ADRIAN_ITEMS.map((item, i) => (
                <div key={i} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-[#9ca3af]">{item.concepto}</span>
                  <span className="shrink-0 font-mono text-white">${fmt(item.monto)}</span>
                </div>
              ))}
              <div className="border-t border-[#1e1e2e] pt-2 flex justify-between text-xs font-semibold">
                <span className="text-[#06b6d4]">Total</span>
                <span className="font-mono text-[#06b6d4]">${fmt(ADRIAN_COBRO)}</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* ── Cálculo neto ── */}
        <motion.div
          {...fadeUp(0.45)}
          className="rounded-xl border border-[#ef4444]/25 bg-[#0d1117] p-5"
          style={{ boxShadow: '0 0 32px rgba(239,68,68,0.07)' }}
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#6b7280]">
            Cálculo neto
          </p>
          <div className="space-y-2 font-mono text-sm">
            <div className="flex justify-between">
              <span className="text-[#9ca3af]">Abdala administra</span>
              <span className="text-[#f59e0b]">+ ${fmt(ABDALA_TOTAL, 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9ca3af]">Adrián cobró</span>
              <span className="text-[#06b6d4]">− ${fmt(ADRIAN_COBRO)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9ca3af]">Comisiones ya pagadas</span>
              <span className="text-[#10b981]">− ${fmt(YA_PAGADO, 0)}</span>
            </div>
            <div className="border-t border-[#1e1e2e] pt-3 flex justify-between text-base font-bold">
              <span className="text-white">NETO Abdala → Adrián</span>
              <span className="text-[#ef4444]">${fmt(NETO)}</span>
            </div>
          </div>
        </motion.div>

        {/* ── Nota ── */}
        <motion.p {...fadeUp(0.5)} className="text-xs text-[#3a3a5c] leading-relaxed">
          Las utilidades cobradas por Adrián (mantenimiento) se deducen del total administrado por Abdala.
          Las comisiones ya pagadas en 2025–2026 ($41,600) también se descuentan.
          Esta conciliación es matemáticamente definitiva con los datos actuales.
        </motion.p>

        {/* ── Footer ── */}
        <motion.div {...fadeUp(0.55)} className="flex items-center justify-between text-[10px] text-[#3a3a5c]">
          <span>Flujos AI · flujos.fiscalai.mx</span>
          <span>v1.0 · 2026</span>
        </motion.div>

      </div>
    </div>
  );
}
