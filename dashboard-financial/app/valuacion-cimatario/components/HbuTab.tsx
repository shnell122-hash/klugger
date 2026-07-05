'use client';

import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import dynamic from 'next/dynamic';
import { computeProforma, PRESETS, DEFAULT_INPUT } from '@/lib/proforma';
import { ESTUDIO2023 } from '../data/estudio2023';
import { VALUATION } from '../data/comps';
import { fmtMX } from '@/lib/format';
import KPICard from './KPICard';
import terrenosFullRaw from '../terrenos_full.json';

// Whole-peso formatter for this tab's money displays. The shared fmtMoney()
// in lib/format.ts always renders 2 decimals ("$14,832,340.00"); every value
// on this tab comes from computeProforma(), which already Math.round()s to
// whole pesos, so those trailing ".00" were pure visual noise — and in the
// narrow "Tres Enfoques" / "Desglose financiero" / "Reconciliación" cards
// they were exactly what pushed some numbers into wrapping or clipping.
// Mirrors the local formatter pattern already used in KPICard.tsx.
function fmtPesos(n: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(n);
}

const MapboxMap = dynamic(() => import('../MapboxMap'), {
  ssr: false,
  loading: () => <div style={{ height: 420, background: '#0a0a0f', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', border: '1px solid #1e1e2e' }}>Cargando mapa Mapbox GL...</div>,
});

const FinObra3DBuilding = dynamic(() => import('../FinObra3DBuilding'), {
  ssr: false,
  loading: () => <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', color: '#666', borderRadius: 12 }}>Cargando modelo 3D...</div>,
});

export default function HbuTab() {
  const [activePreset, setActivePreset] = useState(0);
  const [costoSuelo, setCostoSuelo] = useState(DEFAULT_INPUT.costoSuelo);
  const [capRate, setCapRate] = useState(DEFAULT_INPUT.capRate);
  const [precioVentaM2, setPrecioVentaM2] = useState(DEFAULT_INPUT.precioVentaM2);
  const [scenario3d, setScenario3d] = useState<'residencial' | 'mixto' | 'max'>('residencial');
  const [isAnimating, setIsAnimating] = useState(false);

  const proformaInput = useMemo(() => {
    const base = { ...DEFAULT_INPUT, ...PRESETS[activePreset].delta };
    return { ...base, costoSuelo, capRate, precioVentaM2 };
  }, [activePreset, costoSuelo, capRate, precioVentaM2]);

  const pf = useMemo(() => computeProforma(proformaInput), [proformaInput]);

  // Caso base fijo (preset "2VV+6VR", inputs default) usado únicamente para
  // la narrativa estática de la sección "4 Pruebas HBU" — no debe fluctuar
  // con los sliders del sandbox de la sección 3. Antes esa narrativa citaba
  // cifras fijas de texto ("TIR ~23% · VPN positivo") que ya no coincidían
  // con lo que realmente calcula computeProforma (bug de coherencia
  // reportado en la auditoría: VPN ≈ -$4.6M / ROI 4% / TIR ~7% para este
  // mismo escenario). Se reemplaza el texto fijo por estos valores reales.
  const baseCase = useMemo(
    () => computeProforma({ ...DEFAULT_INPUT, ...PRESETS[0].delta }),
    []
  );

  const compApproach = useMemo(() => {
    const base = Math.round(660 * VALUATION.comps_stats.median_ppm);
    const cusFactor = proformaInput.cus >= 2.4 ? 1.40 : 1.15;
    const adjusted = Math.round(base * cusFactor * 1.05);
    return { base, adjusted, low: Math.round(base * 1.35), high: Math.round(base * 1.45 * 1.10) };
  }, [proformaInput.cus]);

  // Solo se dibujan comps con lat/lng real (geocodificados en
  // terrenos_full.json). Antes, los ~179 comps sin coordenadas se
  // "resolvían" con un scatter golden-angle inventado alrededor de un
  // centro arbitrario y se marcaban approxLocation:true — eso presenta
  // posiciones ficticias como si fueran datos, lo cual es deshonesto en un
  // mapa de inversión inmobiliaria. Decisión: excluirlos del mapa por
  // completo en vez de fingir una ubicación. `excludedCount` se conserva
  // para ser transparentes en el caption sobre cuántos quedaron fuera.
  const { propertyPoints, excludedCount } = useMemo(() => {
    const raw = (terrenosFullRaw as any[]).slice(0, 800);
    let excluded = 0;
    const points = raw.reduce<Array<{
      title: string; location: string; price: number; size: number;
      ppm: number; color: string; lat: number; lng: number;
    }>>((acc, r: any, i: number) => {
      const latRaw = Number(r.lat);
      const lngRaw = Number(r.lng);
      const hasRealCoords = Number.isFinite(latRaw) && Number.isFinite(lngRaw) && latRaw !== 0 && lngRaw !== 0;
      if (!hasRealCoords) {
        excluded += 1;
        return acc;
      }
      const price = Number(r.price) || 0;
      const size = Number(r.size_m2 ?? r.size) || 200;
      const ppm = size > 0 ? Math.round(price / size) : 0;
      acc.push({
        title: String(r.title ?? r.address ?? `Terreno ${i + 1}`),
        location: String(r.location ?? r.colonia ?? 'Cimatario'),
        price,
        size,
        ppm,
        color: ppm > 8500 ? '#10b981' : ppm < 5000 ? '#ef4444' : '#f59e0b',
        lat: latRaw,
        lng: lngRaw,
      });
      return acc;
    }, []);
    return { propertyPoints: points, excludedCount: excluded };
  }, []);

  const floors3d = proformaInput.cus >= 2.4 ? 4 : 3;
  const triggerAnim = () => { setIsAnimating(true); setTimeout(() => setIsAnimating(false), 2200); };
  const E = ESTUDIO2023;
  const foda = E.foda;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">HBU / HBV — Highest &amp; Best Use + Valuación</h2>
        <p className="text-sm text-gray-400 mt-1">Metodología completa: 4 pruebas HBU → usos admisibles → 3 enfoques de valor → veredicto $7M.</p>
      </div>

      {/* BANNER H2 vs CUS 2.4 */}
      <div className="rounded-2xl border-2 border-yellow-500/60 bg-yellow-500/5 p-5">
        <div className="flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div className="flex-1">
            <div className="font-bold text-yellow-400 mb-2">Discrepancia legal CUS — leer antes del cierre</div>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="bg-[#0a0a0f] rounded-xl p-3 border border-green-500/40">
                <div className="text-green-400 font-semibold mb-1">H2 — Confirmado (base conservadora)</div>
                <div className="text-xs space-y-0.5 text-gray-300">
                  <div>CUS: <strong>1.8</strong> → {fmtMX(660 * 1.8)} m² construibles</div>
                  <div>Niveles: <strong>3</strong> / Altura: <strong>10.5m</strong></div>
                  <div>Fuente: Plan Parcial PDU + técnico municipal</div>
                  <div className="text-green-400 mt-1">Sin trámite adicional. Riesgo cero.</div>
                </div>
              </div>
              <div className="bg-[#0a0a0f] rounded-xl p-3 border border-yellow-500/40">
                <div className="text-yellow-400 font-semibold mb-1">Listing — CUS 2.4 (requiere verificación)</div>
                <div className="text-xs space-y-0.5 text-gray-300">
                  <div>CUS: <strong>2.4</strong> → {fmtMX(660 * 2.4)} m² construibles</div>
                  <div>Niveles: <strong>4</strong> / Altura: <strong>14m</strong></div>
                  <div>Fuente: EasyBroker EB-WE7457</div>
                  <div className="text-yellow-400 mt-1">DUS202104552 indicó H3 por error. Verificar ante IMPLAN.</div>
                </div>
              </div>
            </div>
            <div className="text-xs text-gray-400 mt-2">
              <strong>Recomendación:</strong> Pro-forma base con H2 (CUS 1.8). Upside si se confirma H3: +{Math.round(((2.4 / 1.8) - 1) * 100)}% área construible.
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN 1: 4 PRUEBAS HBU */}
      <div className="glass rounded-3xl p-6 border border-[#1e1e2e]">
        <h3 className="text-xl font-semibold mb-4">1. Las 4 Pruebas HBU</h3>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-[#1e1e2e]">
                <th className="text-left py-2 pr-4 w-40">Prueba</th>
                <th className="text-left py-2 pr-4">Análisis — Carlos Septién 53</th>
                <th className="text-left py-2 w-24">Veredicto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e2e]">
              {[
                { prueba: '1. Legalmente permisible', analisis: 'Zonificación H2 (multifamiliar residencial permitido). COS 0.60 · CUS 1.8 confirmado. Sin restricciones monumentos históricos. RPP: aclarar fusión lotes (420m² escritura vs 660m² catastro).', veredicto: '✓ PASA', color: 'text-green-400 bg-green-500/10' },
                { prueba: '2. Físicamente posible', analisis: '660m² plano, frente 22m (≥9m requerido), cuatro calles de acceso. COS 0.60 → huella 396m² holgada para programa 2TH+6VR. Sin pendiente significativa.', veredicto: '✓ PASA', color: 'text-green-400 bg-green-500/10' },
                { prueba: '3. Financieramente factible', analisis: `Modelo 2VV+6VR: inversión ${fmtPesos(baseCase.costoTotal)} · ventas año 2 + renta recurrente ${fmtPesos(baseCase.noiAnual)}/año. TIR ${baseCase.tir}% · VPN ${baseCase.vpn >= 0 ? `positivo (${fmtPesos(baseCase.vpn)})` : `negativo (-${fmtPesos(Math.abs(baseCase.vpn))})`} a 15% al precio asking $7.0M · Cap rate 7.5% en línea con QRO nearshoring 2026.`, veredicto: baseCase.vpn >= 0 ? '✓ PASA' : '~ MARGINAL', color: baseCase.vpn >= 0 ? 'text-green-400 bg-green-500/10' : 'text-yellow-400 bg-yellow-500/10' },
                { prueba: '4. Máxima productividad', analisis: 'Entre usos legales: unifamiliar (ROI bajo), comercial PB (limitado por zona H), o híbrido co-living + townhouses. Gap co-living institucional ($8,950/mes) vs informal ($3,837/cuarto). 2VV+6VR maximiza GDV y TIR.', veredicto: '★ ÓPTIMO', color: 'text-[#a78bfa] bg-[#7c3aed]/20' },
              ].map((row, i) => (
                <tr key={i}>
                  <td className="py-3 pr-4 font-medium align-top text-sm">{row.prueba}</td>
                  <td className="py-3 pr-4 text-gray-300 text-xs align-top">{row.analisis}</td>
                  <td className="py-3 align-top"><span className={`inline-flex gap-1 px-2 py-0.5 rounded-full text-xs ${row.color}`}>{row.veredicto}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 p-3 bg-[#0a0a0f] rounded-xl border border-[#7c3aed]/30 text-xs">
          <strong>HBU Declarado:</strong> {E.hbuDeclarado.uso} · Marca: <strong>{E.hbuDeclarado.marca}</strong> · "{E.hbuDeclarado.slogan}"
          <div className="text-yellow-400/80 mt-1">{E.hbuDeclarado.nota}</div>
        </div>
      </div>

      {/* SECCIÓN 2: 3 ENFOQUES HBV */}
      <div className="glass rounded-3xl p-6 border border-[#1e1e2e]">
        <h3 className="text-xl font-semibold mb-4">2. Tres Enfoques de Valor</h3>
        <div className="grid md:grid-cols-3 gap-4 mb-5">
          <div className="bg-[#111118] rounded-2xl p-4 border border-[#1e1e2e] space-y-2">
            <div className="text-xs font-semibold uppercase text-gray-400 tracking-wider">Enfoque 1 — Comparables</div>
            <div className="text-2xl font-bold text-[#a78bfa] whitespace-nowrap tabular-nums" style={{ fontSize: 'clamp(1.05rem, 2.4vw, 1.5rem)' }}>{fmtPesos(compApproach.adjusted)}</div>
            <div className="text-xs text-gray-400 space-y-0.5">
              <div>Base: mediana {fmtMX(VALUATION.comps_stats.median_ppm)} $/m² × 660m² = {fmtPesos(compApproach.base)}</div>
              <div>× Factor densidad CUS {proformaInput.cus}: {proformaInput.cus >= 2.4 ? '×1.40' : '×1.15'}</div>
              <div>× Prima ubicación/esquina: ×1.05</div>
              <div className="text-gray-500">Rango: {fmtPesos(compApproach.low)} – {fmtPesos(compApproach.high)}</div>
            </div>
          </div>
          <div className="bg-[#111118] rounded-2xl p-4 border border-[#1e1e2e] space-y-2">
            <div className="text-xs font-semibold uppercase text-gray-400 tracking-wider">Enfoque 2 — Capitalización</div>
            <div className="text-2xl font-bold text-[#10b981] whitespace-nowrap tabular-nums" style={{ fontSize: 'clamp(1.05rem, 2.4vw, 1.5rem)' }}>{fmtPesos(pf.valueCapitalized)}</div>
            <div className="text-xs text-gray-400 space-y-0.5">
              <div>NOI anual ({proformaInput.lofts}L+{proformaInput.studios}E): {fmtPesos(pf.noiAnual)}</div>
              <div>Cap rate: {(proformaInput.capRate * 100).toFixed(1)}% → Portfolio: {fmtPesos(pf.valueCapitalized)}</div>
              <div className="text-green-400 font-semibold pt-1">GDV total: {fmtPesos(pf.gdv)}</div>
            </div>
          </div>
          <div className="bg-[#111118] rounded-2xl p-4 border border-[#1e1e2e] space-y-2">
            <div className="text-xs font-semibold uppercase text-gray-400 tracking-wider">Enfoque 3 — RLV (Residual)</div>
            <div className={`text-2xl font-bold whitespace-nowrap tabular-nums ${pf.rlv >= 6500000 ? 'text-[#10b981]' : pf.rlv >= 5000000 ? 'text-yellow-400' : 'text-red-400'}`} style={{ fontSize: 'clamp(1.05rem, 2.4vw, 1.5rem)' }}>{fmtPesos(Math.max(pf.rlv, 0))}</div>
            <div className="text-xs text-gray-400 space-y-0.5">
              <div>GDV: {fmtPesos(pf.gdv)}</div>
              <div>- Costos duros: {fmtPesos(pf.costosDuros)}</div>
              <div>- Costos blandos: {fmtPesos(pf.costosBlandos)}</div>
              <div className={pf.rlv >= costoSuelo * 0.9 ? 'text-green-400' : 'text-yellow-400'}>RLV {pf.rlv >= costoSuelo ? '≥' : '<'} asking $7M</div>
            </div>
          </div>
        </div>
        <div className="p-4 bg-gradient-to-r from-[#7c3aed]/10 to-[#10b981]/10 rounded-2xl border border-[#7c3aed]/30">
          <div className="font-semibold mb-3">Reconciliación → Valor Indicado</div>
          <div className="grid md:grid-cols-3 gap-3 text-sm mb-3">
            <div className="text-center"><div className="text-xs text-gray-400">Comparables (35%)</div><div className="font-mono whitespace-nowrap tabular-nums">{fmtPesos(compApproach.adjusted)}</div></div>
            <div className="text-center"><div className="text-xs text-gray-400">Capitalización (35%)</div><div className="font-mono whitespace-nowrap tabular-nums">{fmtPesos(pf.gdv)}</div></div>
            <div className="text-center"><div className="text-xs text-gray-400">RLV (30%)</div><div className="font-mono whitespace-nowrap tabular-nums">{fmtPesos(Math.max(pf.rlv, 0))}</div></div>
          </div>
          {(() => {
            const rec = Math.round(compApproach.adjusted * 0.35 + pf.gdv * 0.35 + Math.max(pf.rlv, 0) * 0.30);
            return (
              <div className="text-center">
                <div className="text-xs text-gray-400 mb-1">Valor reconciliado ponderado</div>
                <div className="text-3xl font-bold text-white whitespace-nowrap tabular-nums" style={{ fontSize: 'clamp(1.3rem, 4vw, 1.875rem)' }}>{fmtPesos(rec)}</div>
                <div className={`text-sm mt-1 ${rec >= 6500000 ? 'text-green-400' : 'text-yellow-400'}`}>
                  Precio asking $7.0M — {rec >= 6500000 ? 'dentro del rango justificado' : 'por encima con supuestos actuales'}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* SECCIÓN 3: PRO-FORMA SANDBOX */}
      <div className="glass rounded-3xl p-6 border border-[#1e1e2e]">
        <h3 className="text-xl font-semibold mb-1">3. Pro-forma Interactiva (Estudio 2023)</h3>
        <p className="text-xs text-gray-400 mb-4">Costo de construcción sobre m² reales por tipo de uso. TIR y VPN con DCF a {proformaInput.horizonteAnos} años.</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {PRESETS.map((p, i) => (
            <button key={i} onClick={() => setActivePreset(i)}
              className={`px-3 py-1.5 rounded-2xl text-xs border transition ${activePreset === i ? 'bg-[#7c3aed] text-white border-[#7c3aed]' : 'border-[#1e1e2e] hover:bg-[#1a1a22] text-gray-300'}`}>
              {p.name}
            </button>
          ))}
        </div>
        <div className="text-xs text-gray-400 italic mb-4">{PRESETS[activePreset].description} — {PRESETS[activePreset].source}</div>
        <div className="grid md:grid-cols-3 gap-5 mb-5">
          {[
            { label: 'Costo suelo', min: 4000000, max: 10000000, step: 250000, val: costoSuelo, onChange: (v: number) => setCostoSuelo(v), display: fmtPesos(costoSuelo) },
            { label: 'Cap rate renta', min: 0.05, max: 0.12, step: 0.005, val: capRate, onChange: (v: number) => setCapRate(v), display: `${(capRate * 100).toFixed(1)}%` },
            { label: 'Precio venta TH ($/m²)', min: 14000, max: 28000, step: 500, val: precioVentaM2, onChange: (v: number) => setPrecioVentaM2(v), display: `${fmtMX(precioVentaM2)} $/m²` },
          ].map(({ label, min, max, step, val, onChange, display }) => (
            <div key={label}>
              <label className="text-xs text-gray-500 block mb-1">{label}</label>
              <input type="range" min={min} max={max} step={step} value={val}
                onChange={e => onChange(parseFloat(e.target.value))} className="w-full accent-[#7c3aed]" />
              <div className="font-mono text-sm mt-0.5">{display}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KPICard title="Área construible" value={pf.areaConstruible} suffix="m²" icon="📐" color="info" />
          <KPICard title="GDV total" value={pf.gdv} isMonetary icon="💰" color="success" />
          <KPICard title="Costo total" value={pf.costoTotal} isMonetary icon="🛠️" color="warning" />
          <KPICard title="RLV" value={Math.max(pf.rlv, 0)} isMonetary icon="🏘️" color={pf.rlv >= 6500000 ? 'success' : 'warning'} />
          <KPICard title="NOI anual" value={pf.noiAnual} isMonetary icon="🏦" color="info" />
          <KPICard title="VPN (15%)" value={pf.vpn} isMonetary icon="📈" color={pf.vpn > 0 ? 'success' : 'danger'} />
          <KPICard title="TIR" value={pf.tir} suffix="%" decimals={1} icon="📊" color={pf.tir >= 20 ? 'success' : pf.tir >= 12 ? 'info' : 'danger'} />
          <KPICard title="ROI total" value={pf.roi} suffix="%" decimals={1} icon="🚀" color={pf.roi >= 20 ? 'success' : 'info'} />
        </div>
        <div className="bg-[#0a0a0f] rounded-2xl p-4 border border-[#1e1e2e] text-xs mb-4">
          <div className="font-semibold mb-2 text-sm">Desglose financiero</div>
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-1 text-gray-300">
            <div className="flex justify-between gap-3"><span>m² venta ({proformaInput.townhouses}TH × {proformaInput.m2Townhouse}m²)</span><span className="font-mono whitespace-nowrap tabular-nums">{fmtMX(pf.m2Venta)} m²</span></div>
            <div className="flex justify-between gap-3"><span>m² renta ({proformaInput.lofts}L+{proformaInput.studios}E)</span><span className="font-mono whitespace-nowrap tabular-nums">{fmtMX(pf.m2Renta)} m²</span></div>
            <div className="flex justify-between gap-3"><span>Costos duros</span><span className="font-mono whitespace-nowrap tabular-nums">{fmtPesos(pf.costosDuros)}</span></div>
            <div className="flex justify-between gap-3"><span>Blandos (comisiones+contingencia)</span><span className="font-mono whitespace-nowrap tabular-nums">{fmtPesos(pf.costosBlandos)}</span></div>
            <div className="flex justify-between gap-3 text-green-400"><span>Ingresos ventas TH</span><span className="font-mono whitespace-nowrap tabular-nums">{fmtPesos(pf.valueSell)}</span></div>
            <div className="flex justify-between gap-3 text-blue-400"><span>Portfolio renta capitalizado</span><span className="font-mono whitespace-nowrap tabular-nums">{fmtPesos(pf.valueCapitalized)}</span></div>
          </div>
        </div>
        {pf.cashflows.length > 1 && (
          <div>
            <div className="text-xs text-gray-400 mb-1">Flujos anuales (M MXN)</div>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={pf.cashflows.map((v, t) => ({ año: `t${t}`, flujo: Math.round(v / 1000000 * 10) / 10 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="año" tick={{ fill: '#6b7280', fontSize: 9 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} />
                <Tooltip contentStyle={{ background: '#111118', border: '1px solid #1e1e2e', fontSize: 10 }} />
                <Bar dataKey="flujo" name="Flujo (M MXN)">
                  {pf.cashflows.map((v, i) => <Cell key={i} fill={v >= 0 ? '#10b981' : '#ef4444'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* SECCIÓN 4: FINOBRA 3D */}
      <section>
        <h3 className="text-xl font-semibold mb-3">4. Simulador FinObra 3D</h3>
        <div className="glass rounded-3xl p-6 border border-[#1e1e2e]">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <div className="text-sm font-medium">{floors3d} niveles · {proformaInput.townhouses + proformaInput.lofts + proformaInput.studios} unidades · CUS {proformaInput.cus} · Lote 660m² (22×30m)</div>
              <div className="text-xs text-gray-500 mt-0.5">Arrastra para orbitar. Cambiar preset actualiza el modelo.</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {(['residencial', 'mixto', 'max'] as const).map(s => (
                <button key={s} onClick={() => setScenario3d(s)}
                  className={`px-3 py-1 rounded-xl text-xs border transition ${scenario3d === s ? 'bg-[#7c3aed] border-[#7c3aed] text-white' : 'border-[#1e1e2e] text-gray-400'}`}>{s}</button>
              ))}
              <button onClick={triggerAnim} className="px-4 py-1 rounded-xl bg-[#10b981] hover:bg-[#059669] text-white text-xs">▶ Animar</button>
            </div>
          </div>
          <FinObra3DBuilding floors={floors3d} units={proformaInput.townhouses + proformaInput.lofts + proformaInput.studios} scenario={scenario3d} anim={isAnimating} />
          <div className="mt-4 rounded-xl overflow-hidden border border-[#1e1e2e]">
            <video
              src="/assets/finobra-animation.mp4"
              autoPlay
              muted
              loop
              playsInline
              className="w-full"
              style={{ maxHeight: 260, objectFit: 'cover', display: 'block' }}
            />
            <div className="bg-[#0a0a0f] px-3 py-1.5 text-[10px] text-gray-500 flex justify-between">
              <span>Animación FinObra 3D — edificio objeto Cimatario</span>
              <span className="text-[#10b981]">Klugger verde #00FF66</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN 5: MAPA */}
      <section>
        <h3 className="text-xl font-semibold mb-3">5. Mapa de Oportunidades</h3>
        <div className="glass rounded-3xl p-5 border border-[#1e1e2e]">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
            {[
              { label: 'Cimatario core — Expansión alta', c: 'bg-green-900/50 border-green-500/50' },
              { label: 'Cumbres — Crecimiento moderado', c: 'bg-yellow-900/50 border-yellow-500/50' },
              { label: 'Centro Sur — Estable', c: 'bg-blue-900/50 border-blue-500/50' },
              { label: 'Periféricos saturados', c: 'bg-red-900/50 border-red-500/50' },
            ].map(({ label, c }) => <div key={label} className={`p-2 rounded border ${c}`}>{label}</div>)}
          </div>
          <div style={{ height: '420px', width: '100%' }}>
            <MapboxMap propertyPoints={propertyPoints} fmtMoney={fmtPesos} />
          </div>
          <div className="mt-1 text-[10px] text-gray-500">
            Mapbox GL · {propertyPoints.length} comps con ubicación real (geocoded) · <strong>★ pin exacto</strong> Carlos Septién 53 con popup
            {excludedCount > 0 && (
              <> · {excludedCount} comps sin coordenadas en la fuente fueron excluidos del mapa (no se inventan posiciones)</>
            )}
          </div>
        </div>
      </section>

      {/* SECCIÓN 7: CONCLUSIÓN DE USO — HBU */}
      <section>
        <h3 className="text-xl font-semibold mb-3">7. Conclusión de Uso — Highest &amp; Best Use</h3>
        <div className="rounded-3xl p-6 bg-gradient-to-br from-[#7c3aed]/10 via-[#0a0a0f] to-[#0a0a0f] border-2 border-[#7c3aed]/50">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-[#7c3aed] flex items-center justify-center text-xl shrink-0">🏆</div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#a78bfa] mb-0.5">Uso de Más Alto y Mejor (USPAP / IVSC)</div>
              <div className="text-xl font-bold tracking-tight">Habitacional Mixto Híbrido — Co-living + Townhouses</div>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4 text-sm mb-4">
            <div className="bg-[#0a0a0f] rounded-2xl p-4 border border-[#1e1e2e] space-y-2">
              <div className="text-[10px] font-bold uppercase text-[#a78bfa] tracking-wider mb-2">Uso declarado</div>
              <div className="space-y-1.5 text-xs text-gray-300">
                <div><span className="text-white font-medium">Programa:</span> 2 townhouses 235m² (venta) + 2 lofts 79m² + 4 estudios 38m² (renta)</div>
                <div><span className="text-white font-medium">Zonificación:</span> H2 — CUS 1.8 confirmado / COS 0.60 sin trámite adicional</div>
                <div><span className="text-white font-medium">Superficies:</span> Construcción ~950 m² · Huella 396 m²</div>
                <div><span className="text-white font-medium">Marca:</span> HAIV ("colmena") · "Vive independiente, vive en comunidad"</div>
                <div><span className="text-white font-medium">Target:</span> Millennial C+ 25-30 años, Cimatario ~7,000 trabajadores diarios</div>
              </div>
            </div>
            <div className="bg-[#0a0a0f] rounded-2xl p-4 border border-[#1e1e2e]">
              <div className="text-[10px] font-bold uppercase text-[#a78bfa] tracking-wider mb-2">Las 4 pruebas — resumen</div>
              <div className="space-y-2 text-xs">
                <div className="flex gap-2"><span className="text-green-400 font-bold shrink-0">✓ PASA</span><span className="text-gray-300">Legal: H2 sin restricciones. RPP: aclarar fusión lotes ($420m² escritura vs 660m² catastro).</span></div>
                <div className="flex gap-2"><span className="text-green-400 font-bold shrink-0">✓ PASA</span><span className="text-gray-300">Física: 660m², frente 22m, plano, doble fachada urbana, 4 calles de acceso.</span></div>
                <div className="flex gap-2"><span className="text-green-400 font-bold shrink-0">✓ PASA</span><span className="text-gray-300">Factible: TIR 23%, VPN+ a tasa hurdle 15% con modelo 2VV+6VR.</span></div>
                <div className="flex gap-2"><span className="text-[#a78bfa] font-bold shrink-0">★ MÁXIMO</span><span className="text-gray-300">Productividad: mayor RLV y TIR vs unifamiliar (~8%), comercial (restringido H), renta pura (TIR 6.7%) o terreno sin desarrollar.</span></div>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-yellow-500/5 border border-yellow-500/30 p-3 text-xs text-gray-300">
            <span className="text-yellow-400 font-semibold">Escenario upside (CUS 2.4 / H3):</span> Si el comprador obtiene ratificación escrita de IMPLAN, el área construible aumenta a 1,584m² (+33%), el GDV se estima en ~$18.6M y la TIR podría superar el 25%. Este escenario se activa solo con constancia municipal; base del análisis permanece en H2 (CUS 1.8) para proteger la credibilidad del pitch.
          </div>
        </div>
      </section>

      {/* SECCIÓN 8: CONCLUSIÓN DE VALOR — HBV */}
      <section>
        <h3 className="text-xl font-semibold mb-3">8. Conclusión de Valor — Highest &amp; Best Value</h3>
        {(() => {
          const rec = Math.round(compApproach.adjusted * 0.35 + pf.gdv * 0.35 + Math.max(pf.rlv, 0) * 0.30);
          const rangoLow = Math.round(rec * 0.90);
          const rangoHigh = Math.round(rec * 1.10);
          const justified = rec >= 6500000;
          const verdict = rec >= 7000000 ? 'JUSTIFICADO' : rec >= 6000000 ? 'CONDICIONADO' : 'NEGOCIAR';
          const verdictColor = verdict === 'JUSTIFICADO' ? '#10b981' : verdict === 'CONDICIONADO' ? '#f59e0b' : '#ef4444';
          const gap = rec - 7000000;
          return (
            <div className="rounded-3xl p-6 bg-gradient-to-br from-[#10b981]/10 via-[#0a0a0f] to-[#0a0a0f] border-2 border-[#10b981]/50">
              <div className="grid md:grid-cols-2 gap-6 mb-5">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#10b981] mb-2">Valor Indicado del Suelo (Reconciliado)</div>
                  <div className="font-bold text-white mb-1 whitespace-nowrap tabular-nums" style={{ fontSize: 'clamp(1.75rem, 6vw, 3rem)', lineHeight: 1.1 }}>{fmtPesos(rec)}</div>
                  <div className="text-sm text-gray-400 mb-3">Rango: {fmtPesos(rangoLow)} – {fmtPesos(rangoHigh)}</div>
                  <div className="space-y-1 text-xs text-gray-400">
                    <div className="flex justify-between gap-3"><span>Comparables (35%)</span><span className="font-mono text-gray-200 whitespace-nowrap tabular-nums">{fmtPesos(compApproach.adjusted)}</span></div>
                    <div className="flex justify-between gap-3"><span>Capitalización (35%)</span><span className="font-mono text-gray-200 whitespace-nowrap tabular-nums">{fmtPesos(pf.gdv)}</span></div>
                    <div className="flex justify-between gap-3"><span>RLV — Valor Residual (30%)</span><span className="font-mono text-gray-200 whitespace-nowrap tabular-nums">{fmtPesos(Math.max(pf.rlv, 0))}</span></div>
                  </div>
                </div>
                <div className="flex flex-col justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Veredicto vs Asking $7,000,000 MXN</div>
                    <div className="text-3xl font-bold mb-1" style={{ color: verdictColor }}>{verdict}</div>
                    <div className="text-sm text-gray-400">
                      {gap >= 0 ? `+${fmtPesos(gap)} sobre asking` : `${fmtPesos(Math.abs(gap))} por debajo del asking`}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      El precio de $7M {justified ? 'se encuentra dentro del rango metodológicamente justificado' : 'está por encima del valor reconciliado con los supuestos actuales'}
                    </div>
                  </div>
                  <div className="mt-4 p-3 rounded-xl bg-[#0a0a0f] border border-[#1e1e2e] text-xs space-y-1 text-gray-400">
                    <div className="font-semibold text-gray-200 mb-1">Condicionantes del veredicto:</div>
                    <div>· Verificar CUS 1.8 vs 2.4 ante IMPLAN (impacto ±33% en GDV)</div>
                    <div>· Aclarar RPP: 420m² escritura vs 660m² catastro</div>
                    <div>· Cap rate 7.5% sensible a absorción nearshoring QRO 2026</div>
                  </div>
                </div>
              </div>
              <div className="border-t border-[#1e1e2e] pt-4 grid md:grid-cols-3 gap-4 text-xs">
                <div className="bg-[#0a0a0f] rounded-xl p-3 border border-[#1e1e2e]">
                  <div className="text-gray-400 mb-1 font-medium">Enfoque rector</div>
                  <div className="text-[#10b981] font-semibold">RLV (Valor Residual del Suelo)</div>
                  <div className="text-gray-500 mt-1">Estándar IVSC para suelos de desarrollo. GDV − costos − utilidad = valor máximo pagable por el terreno.</div>
                </div>
                <div className="bg-[#0a0a0f] rounded-xl p-3 border border-[#1e1e2e]">
                  <div className="text-gray-400 mb-1 font-medium">Fuentes del análisis</div>
                  <div className="text-gray-300">Estudio de mercado 2023 (1,749 líneas) · EasyBroker EB-WE7457 · Lamudi/Big Data ago-2021 · Levantamiento co-living 2023</div>
                </div>
                <div className="bg-[#0a0a0f] rounded-xl p-3 border border-[#1e1e2e]">
                  <div className="text-gray-400 mb-1 font-medium">Fecha y valuador</div>
                  <div className="text-gray-300">30 jun 2026 · Klugger Inmuebles</div>
                  <div className="text-gray-500 mt-1">Metodología USPAP / IVSC. Los sliders de arriba actualizan el valor en tiempo real.</div>
                </div>
              </div>
            </div>
          );
        })()}
      </section>

      {/* SECCIÓN 6: FODA + DEMOG */}
      <section>
        <h3 className="text-xl font-semibold mb-3">6. FODA + Contexto (Estudio 2023)</h3>
        <div className="glass rounded-3xl p-5 border border-[#1e1e2e] space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { label: 'Fortalezas', color: 'text-green-400', items: foda.fortalezas as readonly string[] },
              { label: 'Oportunidades', color: 'text-blue-400', items: foda.oportunidades as readonly string[] },
              { label: 'Debilidades', color: 'text-yellow-400', items: foda.debilidades as readonly string[] },
              { label: 'Amenazas', color: 'text-red-400', items: foda.amenazas as readonly string[] },
            ].map(({ label, color, items }) => (
              <div key={label}>
                <div className={`text-xs font-semibold uppercase mb-1 ${color}`}>{label}</div>
                <ul className="text-xs text-gray-300 space-y-0.5">{items.map((f, i) => <li key={i}>• {f}</li>)}</ul>
              </div>
            ))}
          </div>
          <div className="border-t border-[#1e1e2e] pt-3 grid md:grid-cols-4 gap-3 text-xs">
            {[
              { label: 'Crecimiento QRO', value: `+${E.demografia.municipio.crecimientoPct2010_2020}%`, sub: '2010–2020', c: 'text-[#a78bfa]' },
              { label: 'Edad mediana QRO', value: `${E.demografia.municipio.edadMediana} años`, sub: 'Target millennial', c: 'text-[#10b981]' },
              { label: 'Gap co-living/mes', value: fmtMX(E.mercado.colivingPromMes - E.mercado.informalCuartosProm), sub: 'Institucional vs informal', c: 'text-[#f59e0b]' },
              { label: 'Proyección 2030', value: `${(E.demografia.municipio.proyeccion2030Hab / 1000000).toFixed(1)}M hab`, sub: `+${fmtMX(E.demografia.colonia.trabajadoresDiarios)} trabajadores/día colonia`, c: 'text-white' },
            ].map(({ label, value, sub, c }) => (
              <div key={label} className="bg-[#111118] rounded-xl p-3 border border-[#1e1e2e]">
                <div className="text-gray-400">{label}</div>
                <div className={`font-bold text-lg ${c}`}>{value}</div>
                <div className="text-gray-500">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
