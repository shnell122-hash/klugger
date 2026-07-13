"use client";
// Klugger — Historial de precio (D6). Timeline de precio + días en mercado. Recharts (ya instalado).
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Icon, UI } from "./icons";

const DATA = [
  { mes: "Ene", precio: 6.9 }, { mes: "Feb", precio: 6.9 }, { mes: "Mar", precio: 6.75 },
  { mes: "Abr", precio: 6.75 }, { mes: "May", precio: 6.6 }, { mes: "Jun", precio: 6.45 },
];

export function PriceHistory() {
  const first = DATA[0].precio, last = DATA[DATA.length - 1].precio;
  const deltaPct = (((last - first) / first) * 100).toFixed(1);
  return (
    <div className="kph">
      <div className="kph__head">
        <div>
          <div className="kph__title">Historial de precio</div>
          <div className="kph__sub">Últimos 6 meses · <span className="kph__down">{deltaPct}%</span></div>
        </div>
        <div className="kph__dom"><Icon as={UI.MapPin} size={14} /> 63 días en mercado</div>
      </div>
      <div style={{ width: "100%", height: 160 }}>
        <ResponsiveContainer>
          <AreaChart data={DATA} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="kphFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} domain={["dataMin - 0.3", "dataMax + 0.3"]} tickFormatter={(v) => `$${v}M`} />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, color: "var(--text)" }}
              formatter={(v: number) => [`$${v}M`, "Precio"]}
            />
            <Area type="monotone" dataKey="precio" stroke="var(--accent-2)" strokeWidth={2.5} fill="url(#kphFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
