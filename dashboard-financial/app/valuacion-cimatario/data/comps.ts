// Shared valuation data for Cimatario case — imported by all tabs

export const COMPS_CLEAN = [
  { id: 1, price: 2550000, size_m2: 300, title: "Terreno plano 300m² fracc seguro", location: "Cumbres del Cimatario, Qro", link: "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/", notes: "Frente area verde, vigilancia 24h" },
  { id: 2, price: 1136500, size_m2: 234, title: "Lote Club Golf El Encino 234m²", location: "Cumbres del Cimatario", link: "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/", notes: "24% bajo promedio" },
  { id: 3, price: 2750000, size_m2: 300, title: "Terreno 300m² frente área verde", location: "Cumbres del Cimatario", link: "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/", notes: "Muy poca pendiente, amenidades fracc" },
  { id: 4, price: 2550000, size_m2: 322, title: "Excelente terreno La Biznaga 323m²", location: "Cumbres del Cimatario", link: "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/", notes: "Vista a ciudad y reserva" },
  { id: 5, price: 2650000, size_m2: 335, title: "Terreno 336m² La Biznaga", location: "Cumbres del Cimatario", link: "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/", notes: "Hermosa vista, cerca Centro Sur" },
  { id: 6, price: 1200000, size_m2: 160, title: "Lote Mayant Cimatario 160m²", location: "Cimatario / Huimilpan", link: "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/", notes: "Vistas cañada, seguridad 24/7" },
  { id: 7, price: 756000, size_m2: 180, title: "Oportunidad El Encino 180m²", location: "Cumbres del Cimatario", link: "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/", notes: "34% bajo promedio" },
  { id: 8, price: 1350000, size_m2: 300, title: "Lote 300m² Villas del Sur", location: "Villas del Sur (cerca Cimatario)", link: "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/", notes: "Zona habitacional/parque" },
  { id: 9, price: 2600000, size_m2: 285, title: "Terreno habitacional 285m² Villas del Sur", location: "Villas del Sur, Qro", link: "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/", notes: "Céntrico cerca Alameda" },
  { id: 10, price: 2225000, size_m2: 250, title: "Terreno Mallorca 250m² frente Parque Cimatario", location: "Mallorca Residence, Cimatario", link: "https://www.inmuebles24.com/terrenos-en-venta-en-cimatario.html", notes: "Amenidades, 20min centro" },
  { id: 11, price: 3200000, size_m2: 500, title: "Lote plusvalía 500m² zona crecimiento", location: "Cimatario area", link: "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/", notes: "Potencial desarrollo" },
  { id: 12, price: 2950000, size_m2: 420, title: "Terreno 420m² Cimatario consolidado", location: "Cimatario, Qro", link: "https://www.inmuebles24.com/terrenos-en-venta-en-cimatario.html", notes: "Alta plusvalía" },
];

export const VALUATION = {
  target: {
    m2: 660,
    asking_price: 7000000,
    asking_ppm: 10606,
    cus: 2.4,
    cos: 0.6,
    potential_units: 12,
    location: "Lic. Carlos Septien 53, Cimatario, Querétaro (CP 76030)",
  },
  comps_stats: {
    n: 12,
    median_ppm: 7705,
    mean_ppm: 7167,
    min_ppm: 4200,
    max_ppm: 9167,
    lamudi_market_ppm: 6433,
  },
  models: {
    base_median: 5085448,
    adjusted_median: 7475608,
    base_mean: 4729990,
    adjusted_mean: 6953086,
    lamudi_base: 4245780,
    lamudi_adjusted: 6241297,
    potential_multiplier: 1.4,
    zone_premium: 1.05,
    formula: "precio = m2 × mediana_ppm × mult_CUS_dev(1.4) × mult_zona(1.05)",
    consensus_low: 6877560,
    consensus_high: 8073657,
  },
  price_vector: COMPS_CLEAN.map((c) => {
    const implied = Math.round(660 * (c.price / c.size_m2));
    const delta = implied - 7000000;
    return {
      ...c,
      implied_for_target: implied,
      delta_vs_asking: delta,
      pct_vs_asking: Math.round((delta / 7000000) * 1000) / 10,
    };
  }),
};

export const SELL_TIME_DATA = [
  { rango: "4.5-5.5M", precio_label: "Base baja (~5M)", meses_base: 3.5, meses_min: 2.5, meses_max: 5, nota: "Rápida absorción si precio agresivo" },
  { rango: "5.5-6.5M", precio_label: "Alineado mercado (~6M)", meses_base: 4.5, meses_min: 3, meses_max: 6, nota: "Típico lote plusvalía QRO" },
  { rango: "6.5-7.5M", precio_label: "Nuestro precio actual (7M)", meses_base: 6.5, meses_min: 5, meses_max: 9, nota: "Highlight: outreach devs acelera" },
  { rango: "7.5-8.5M", precio_label: "Ajustado mediana (~7.5M)", meses_base: 7.5, meses_min: 6, meses_max: 10, nota: "Premium CUS justificado" },
  { rango: "8.5M+", precio_label: "Alto / sobre", meses_base: 10, meses_min: 8, meses_max: 14, nota: "Más negociación o espera" },
];

export const TARGET_SELL_EST = { min: 5, base: 6.5, max: 9 };
