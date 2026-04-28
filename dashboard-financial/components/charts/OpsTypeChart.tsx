'use client';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { OpsByType } from '@/lib/api';
import { TIPO_COLORS } from '@/lib/api';

interface OpsTypeChartProps {
  data: OpsByType[];
}

const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
      fontSize={11} fontWeight={600}>
      {(percent * 100).toFixed(0)}%
    </text>
  );
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as OpsByType;
  return (
    <div className="glass rounded-lg p-3 text-xs">
      <p className="font-semibold" style={{ color: TIPO_COLORS[d.tipo_operacion] }}>
        {d.tipo_operacion}
      </p>
      <p>Volumen: <span className="font-mono">${Number(d.volumen).toLocaleString('es-MX', {minimumFractionDigits:0})}</span></p>
      <p>Operaciones: <span className="font-mono">{d.total}</span></p>
      <p>Comisiones: <span className="font-mono text-success">${Number(d.comisiones).toLocaleString('es-MX', {minimumFractionDigits:0})}</span></p>
    </div>
  );
};

export default function OpsTypeChart({ data }: OpsTypeChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={3}
          dataKey="volumen"
          nameKey="tipo_operacion"
          labelLine={false}
          label={renderCustomLabel}
        >
          {data.map((entry) => (
            <Cell
              key={entry.tipo_operacion}
              fill={TIPO_COLORS[entry.tipo_operacion] ?? '#6b7280'}
              stroke="transparent"
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(v) => <span style={{ color: '#9ca3af', fontSize: '11px' }}>{v}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
