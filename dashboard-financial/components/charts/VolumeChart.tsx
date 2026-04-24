'use client';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { VolumePoint } from '@/lib/api';

interface VolumeChartProps {
  data: VolumePoint[];
  height?: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-lg p-3 text-xs">
      <p className="text-gray-400 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono font-semibold">
            ${Number(p.value).toLocaleString('es-MX', { minimumFractionDigits: 0 })}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function VolumeChart({ data, height = 280 }: VolumeChartProps) {
  const formatted = data.map(d => ({
    ...d,
    fecha_fmt: format(parseISO(d.fecha), 'd MMM', { locale: es }),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={formatted} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradVolumen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradComisiones" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
        <XAxis dataKey="fecha_fmt" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickLine={false}
          tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
          axisLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: '11px', color: '#9ca3af' }} />
        <Area
          type="monotone"
          dataKey="volumen_bruto"
          name="Volumen bruto"
          stroke="#7c3aed"
          strokeWidth={2}
          fill="url(#gradVolumen)"
          dot={false}
          activeDot={{ r: 4, fill: '#7c3aed' }}
        />
        <Area
          type="monotone"
          dataKey="comisiones"
          name="Comisiones"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#gradComisiones)"
          dot={false}
          activeDot={{ r: 4, fill: '#10b981' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
