'use client';

import React from 'react';
import { fmtMX } from '@/lib/format';

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

const colorMap: Record<string, { bg: string; text: string; border: string }> = {
  accent:  { bg: 'bg-[#7c3aed]/10', text: 'text-[#a78bfa]',  border: 'border-[#7c3aed]/30' },
  success: { bg: 'bg-[#10b981]/10', text: 'text-[#10b981]',  border: 'border-[#10b981]/30' },
  warning: { bg: 'bg-[#f59e0b]/10', text: 'text-[#f59e0b]',  border: 'border-[#f59e0b]/30' },
  danger:  { bg: 'bg-[#ef4444]/10', text: 'text-[#ef4444]',  border: 'border-[#ef4444]/30' },
  info:    { bg: 'bg-[#3b82f6]/10', text: 'text-[#3b82f6]',  border: 'border-[#3b82f6]/30' },
};

// Local MXN currency formatter (Intl-based) — large KPI amounts drop cents
// (maximumFractionDigits: 0) so the string stays short and never needs to
// wrap. Kept local to this component so lib/format.ts (shared by other tabs)
// stays untouched.
function formatMXNCurrency(n: number): string {
  const maximumFractionDigits = Math.abs(n) >= 1000 ? 0 : 2;
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(n);
}

export default function KPICard({ title, value, prefix = '', suffix = '', decimals = 0, icon, color = 'accent', isMonetary = false, trend }: KPICardProps) {
  const c = colorMap[color] ?? colorMap.accent;
  const display = isMonetary
    ? formatMXNCurrency(typeof value === 'number' ? value : parseFloat(String(value)))
    : typeof value === 'number' ? fmtMX(value, decimals) : value;
  const fullText = `${prefix}${display}${suffix}`;

  // Fluid font-size (clamp) instead of a fixed text-3xl: on the 2-column
  // mobile grid a fixed 30px number like "$7,000,000" doesn't fit its
  // column and used to force a mid-number line break (the "break-all" bug).
  // clamp() shrinks it to fit narrow columns and grows back up to 30px once
  // there's room (md:4-col layout), so the full number always renders on
  // one line.
  const fluidSizeStyle: React.CSSProperties = {
    fontSize: 'clamp(1.05rem, 3.6vw, 1.875rem)',
    lineHeight: 1.15,
  };

  return (
    <div className={`glass rounded-2xl p-5 border ${c.border} relative overflow-hidden transition-all hover:scale-[1.01]`}>
      <div className={`absolute -top-5 -right-5 w-16 h-16 ${c.bg} rounded-full blur-3xl`} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[1px] text-gray-500 mb-1.5">{title}</div>
          <div
            className={`font-bold font-mono tabular-nums tracking-[-0.5px] whitespace-nowrap ${c.text}`}
            style={fluidSizeStyle}
            title={fullText}
          >
            {fullText}
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
