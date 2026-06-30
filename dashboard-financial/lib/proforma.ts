// lib/proforma.ts — Pro-forma HBU/HBV real para Cimatario (Klugger)

export interface ProformaInput {
  m2Terreno: number;
  cus: number;
  cos: number;
  costoVentaM2: number;      // costo de construcción m² venta (townhouses)
  costoRentaM2: number;      // costo de construcción m² renta (lofts/estudios)
  precioVentaM2: number;     // precio de venta al comprador final
  rentaLoftMes: number;      // renta mensual por loft
  rentaStudioMes: number;    // renta mensual por estudio
  capRate: number;           // tasa de capitalización (0.075 = 7.5%)
  costoSuelo: number;        // precio del terreno
  comisionesPct: number;     // comisiones sobre ventas (0.05 = 5%)
  contingenciaPct: number;   // contingencia sobre costo duro (0.10 = 10%)
  horizonteAnos: number;     // horizonte de análisis
  // Programa de unidades
  townhouses: number;
  lofts: number;
  studios: number;
  m2Townhouse: number;
  m2Loft: number;
  m2Studio: number;
}

export interface ProformaOutput {
  areaConstruible: number;   // m2Terreno × CUS
  huella: number;            // m2Terreno × COS
  m2Venta: number;
  m2Renta: number;
  gdv: number;               // Gross Development Value
  costosDuros: number;       // Hard costs (construcción)
  costosBlandos: number;     // Soft costs (comisiones + contingencia)
  costoTotal: number;        // costosDuros + costosBlandos + costoSuelo
  noiAnual: number;          // Net Operating Income (renta anual)
  valueSell: number;         // Ingreso por venta
  valueCapitalized: number;  // NOI / capRate (valor capitalizado portafolio renta)
  rlv: number;               // Residual Land Value
  vpn: number;               // VPN a tasa de descuento 15%
  tir: number;               // TIR (%)
  roi: number;               // ROI total (%)
  cashflows: number[];       // Flujos anuales
}

export interface ProformaPreset {
  name: string;
  description: string;
  source: string;
  delta: Partial<ProformaInput>;
}

// Valores base del Estudio 2023 (tomados de transcripcionEstudioMercado2023.md)
export const DEFAULT_INPUT: ProformaInput = {
  m2Terreno: 660,
  cus: 2.4,             // listing EasyBroker; legalmente confirmado H2 = 1.8
  cos: 0.60,
  costoVentaM2: 8277,   // estudio 2023, construcción townhouse
  costoRentaM2: 14074,  // estudio 2023, construcción co-living (mayor calidad)
  precioVentaM2: 19500, // estudio 2023, precio townhouse terminado
  rentaLoftMes: 11850,  // levantamiento 2023 (co-living premium)
  rentaStudioMes: 6650, // levantamiento 2023 (studio)
  capRate: 0.075,       // benchmark nearshoring QRO 2026
  costoSuelo: 7000000,  // precio asking
  comisionesPct: 0.05,
  contingenciaPct: 0.10,
  horizonteAnos: 10,
  townhouses: 2,
  lofts: 2,
  studios: 4,
  m2Townhouse: 235,
  m2Loft: 79,
  m2Studio: 38,
};

export const PRESETS: ProformaPreset[] = [
  {
    name: '2VV+6VR — Base estudio',
    description: '2 townhouses venta + 2 lofts + 4 estudios renta. Modelo seleccionado por estudio 2023. TIR ≈23%.',
    source: 'Estudio de mercado 2023',
    delta: { townhouses: 2, lofts: 2, studios: 4, cus: 2.4 },
  },
  {
    name: '3VV — Mayor venta',
    description: '3 townhouses venta. TIR ≈25.7% por menor inversión renta. Menos flujo recurrente.',
    source: 'Estudio de mercado 2023',
    delta: { townhouses: 3, lofts: 1, studios: 2, cus: 2.4 },
  },
  {
    name: '6VV — Máx venta (requiere DUS)',
    description: '6 townhouses. Ventas $15.98M pero requiere cambio de uso de suelo. Riesgo regulatorio.',
    source: 'Estudio de mercado 2023',
    delta: { townhouses: 6, lofts: 0, studios: 0, cus: 2.4 },
  },
  {
    name: 'H2 Conservador — CUS 1.8',
    description: 'Zonificación H2 confirmada. 3 niveles / 10.5m. Legalmente sólido. Menor área construible.',
    source: 'DUS202104552 + Plan Parcial PDU',
    delta: { townhouses: 2, lofts: 1, studios: 2, cus: 1.8 },
  },
];

/** VPN de una serie de flujos al tipo r. */
export function npv(cashflows: number[], r: number): number {
  return cashflows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + r, t), 0);
}

/** TIR por bisección. Devuelve null si no converge. */
export function irr(cashflows: number[]): number | null {
  if (cashflows.length < 2 || cashflows[0] >= 0) return null;
  // Necesitamos NPV positivo en algún punto antes de lo = -50%
  if (npv(cashflows, -0.5) < 0) return null;

  let lo = -0.5, hi = 5.0;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const n = npv(cashflows, mid);
    if (Math.abs(n) < 1 || (hi - lo) < 0.0001) return mid;
    if (n > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Calcula pro-forma completa desde inputs. */
export function computeProforma(inp: ProformaInput): ProformaOutput {
  const {
    m2Terreno, cus, cos, costoVentaM2, costoRentaM2, precioVentaM2,
    rentaLoftMes, rentaStudioMes, capRate, costoSuelo, comisionesPct,
    contingenciaPct, horizonteAnos, townhouses, lofts, studios,
    m2Townhouse, m2Loft, m2Studio,
  } = inp;

  // Áreas
  const areaConstruible = m2Terreno * cus;  // total m² construibles (CUS)
  const huella = m2Terreno * cos;           // huella permitida (COS)
  const m2Venta = townhouses * m2Townhouse;
  const m2Renta = lofts * m2Loft + studios * m2Studio;

  // Costos duros (construcción por tipo de uso — FIX: no mezclar COS con CUS)
  const costosDuros = Math.round(m2Venta * costoVentaM2 + m2Renta * costoRentaM2);

  // Costos blandos: comisiones sobre ventas + contingencia sobre costo duro
  const ingresosVenta = Math.round(m2Venta * precioVentaM2);
  const comisiones = Math.round(ingresosVenta * comisionesPct);
  const contingencia = Math.round(costosDuros * contingenciaPct);
  const costosBlandos = comisiones + contingencia;

  const costoTotal = costosDuros + costosBlandos + costoSuelo;

  // Ingresos
  const noiAnual = Math.round((lofts * rentaLoftMes + studios * rentaStudioMes) * 12);
  const valueSell = ingresosVenta;
  const valueCapitalized = capRate > 0 ? Math.round(noiAnual / capRate) : 0;
  const gdv = valueSell + valueCapitalized;

  // RLV: GDV − (costos duros + blandos) − utilidad desarrollador (15%)
  const utilidadDev = Math.round((gdv - costosDuros - costosBlandos) * 0.15);
  const rlv = gdv - costosDuros - costosBlandos - utilidadDev;

  // DCF:
  // t=0: inversión inicial (terreno + construcción + blandos)
  // t=1: renta año 1
  // t=2: renta + ventas townhouses
  // t=3..n-1: renta
  // t=n: renta + valor terminal (portfolio renta)
  const cashflows: number[] = [-(costosDuros + costosBlandos + costoSuelo)];
  for (let t = 1; t <= horizonteAnos; t++) {
    let cf = noiAnual;
    if (t === 2) cf += valueSell;                     // venta townhouses año 2
    if (t === horizonteAnos) cf += valueCapitalized;  // valor terminal
    cashflows.push(cf);
  }

  const HURDLE = 0.15;
  const vpn = Math.round(npv(cashflows, HURDLE));
  const tirCalc = irr(cashflows);
  const tir = tirCalc !== null ? Math.round(tirCalc * 1000) / 10 : 0;
  const roi = costoTotal > 0 ? Math.round(((gdv - costoTotal) / costoTotal) * 1000) / 10 : 0;

  return {
    areaConstruible, huella, m2Venta, m2Renta,
    gdv, costosDuros, costosBlandos, costoTotal,
    noiAnual, valueSell, valueCapitalized,
    rlv, vpn, tir, roi, cashflows,
  };
}
