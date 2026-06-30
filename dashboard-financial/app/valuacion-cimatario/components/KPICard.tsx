'use client';

import React from 'react';
import { fmtMX, fmtMoney } from '@/lib/format';

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

export default function KPICard({ title, value, prefix = '', suffix = '', decimals = 0, icon, color = 'accent', isMonetary = false, trend }: KPICardProps) {
  const c = colorMap[color] ?? colorMap.accent;
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
