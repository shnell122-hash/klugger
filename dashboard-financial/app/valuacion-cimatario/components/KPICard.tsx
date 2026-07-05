'use client';

import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion, animate } from 'framer-motion';
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
  /** Position in a grid of KPICards — drives the entrance stagger delay. Optional. */
  index?: number;
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

// Emil Kowalski-style ease-out curve (quick start, gentle settle) used for
// both the entrance and the count-up — one motion language, reused.
const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

// Entrance: opacity + translateY(8px) -> 0, staggered by grid position.
// Both properties are transform/opacity only (GPU, no layout thrash).
const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: EASE_OUT,
      // Cap the stagger so a long grid doesn't leave the last card waiting.
      delay: Math.min(i, 7) * 0.04,
    },
  }),
};

/**
 * Animates a numeric value from 0 -> target once on mount. Disabled (jumps
 * straight to target) when the value isn't numeric, or when the user has
 * requested reduced motion — count-up is decoration, not information, so it's
 * the first thing to drop.
 */
function useCountUp(target: number, enabled: boolean, duration = 0.6): number {
  const [display, setDisplay] = useState(enabled ? 0 : target);

  useEffect(() => {
    if (!enabled) {
      setDisplay(target);
      return;
    }
    const controls = animate(0, target, {
      duration,
      ease: EASE_OUT,
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, enabled]);

  return display;
}

export default function KPICard({ title, value, prefix = '', suffix = '', decimals = 0, icon, color = 'accent', isMonetary = false, trend, index = 0 }: KPICardProps) {
  const c = colorMap[color] ?? colorMap.accent;
  const prefersReducedMotion = useReducedMotion();

  const numericValue = typeof value === 'number' ? value : null;
  const animatedNumeric = useCountUp(numericValue ?? 0, numericValue !== null && !prefersReducedMotion);
  const numberToRender = numericValue !== null ? animatedNumeric : value;

  const display = isMonetary
    ? formatMXNCurrency(typeof numberToRender === 'number' ? numberToRender : parseFloat(String(numberToRender)))
    : typeof numberToRender === 'number' ? fmtMX(numberToRender, decimals) : numberToRender;
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
    fontVariantNumeric: 'tabular-nums',
  };

  return (
    <motion.div
      className={`glass rounded-2xl p-5 border ${c.border} relative overflow-hidden`}
      custom={index}
      initial="hidden"
      animate="visible"
      variants={cardVariants}
      whileHover={{ y: -2, boxShadow: '0 10px 28px -8px rgba(0,0,0,0.45)' }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      style={{ willChange: 'transform' }}
    >
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
            <div className={`text-xs mt-1 font-medium tabular-nums ${trend >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}% vs base
            </div>
          )}
        </div>
        <div className="text-4xl opacity-70 flex-shrink-0 mt-0.5">{icon}</div>
      </div>
    </motion.div>
  );
}
