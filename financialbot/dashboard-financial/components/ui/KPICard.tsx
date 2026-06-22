'use client';
import { motion } from 'framer-motion';
import { fmt } from '@/lib/api';

interface KPICardProps {
  title: string;
  value: number | string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  trend?: number;
  icon: string;
  color?: 'accent' | 'success' | 'warning' | 'danger' | 'info';
  isMonetary?: boolean;
}

const colorMap = {
  accent:  { bg: 'bg-accent/10',  text: 'text-accent-light', border: 'border-accent/20',  glow: 'glow-accent' },
  success: { bg: 'bg-success/10', text: 'text-success',      border: 'border-success/20', glow: 'glow-success' },
  warning: { bg: 'bg-warning/10', text: 'text-warning',      border: 'border-warning/20', glow: '' },
  danger:  { bg: 'bg-danger/10',  text: 'text-danger',       border: 'border-danger/20',  glow: '' },
  info:    { bg: 'bg-info/10',    text: 'text-info',         border: 'border-info/20',    glow: '' },
};

export default function KPICard({
  title, value, prefix = '', suffix = '',
  decimals = 2, trend, icon, color = 'accent', isMonetary = false,
}: KPICardProps) {
  const c = colorMap[color];
  const displayValue = isMonetary
    ? `$${fmt(typeof value === 'number' ? value : parseFloat(String(value)), decimals)}`
    : typeof value === 'number'
      ? fmt(value, decimals)
      : value;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`glass rounded-xl p-5 ${c.border} border ${c.glow} relative overflow-hidden`}
    >
      {/* Background glow blob */}
      <div className={`absolute -top-4 -right-4 w-20 h-20 ${c.bg} rounded-full blur-2xl`} />

      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{title}</p>
          <p className={`text-2xl font-bold ${c.text} font-mono`}>
            {prefix}{displayValue}{suffix}
          </p>
          {trend !== undefined && (
            <p className={`text-xs mt-1 ${trend >= 0 ? 'text-success' : 'text-danger'}`}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}% vs ayer
            </p>
          )}
        </div>
        <span className="text-2xl opacity-80">{icon}</span>
      </div>
    </motion.div>
  );
}
