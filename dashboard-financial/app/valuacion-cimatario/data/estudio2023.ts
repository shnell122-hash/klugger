// data/estudio2023.ts — Datos del Estudio de Mercado 2023, Cimatario Querétaro
// Fuente: transcripcionEstudioMercado2023.md + analisisCimatario2023.md

export const ESTUDIO2023 = {
  metadata: {
    fecha: '2023',
    objeto: 'Lic. Carlos Septién García 53, Col. Cimatario, CP 76030, Querétaro',
    fuente: 'Estudio de mercado interno 2023 + Big Data Inmobiliario Lamudi ago-2021',
  },

  fichaLote: {
    m2Catastro: 660,
    m2Escritura: 420,    // RPP: 2 lotes fusionados — pendiente fusión catastral
    frente: 22,          // m al poniente (Carlos Septién García)
    fondo: 30,           // m
    calles: {
      frente: 'Lic. Carlos Septién García',
      lateral1: 'Wenceslao S. de la Barquera',
      lateral2: 'Florencio Rosas',
      fondo: 'José María Truchuelo',
    },
    zonificacionConfirmada: 'H2',
    parametrosH2: {
      cas: 0.10,       // área de cesión (66 m²)
      cos: 0.60,       // 396 m²
      cus: 1.8,        // 1,188 m² — CONFIRMADO legalmente (DUS202104552 indicaba H3 por error)
      niveles: 3,
      alturaMaxM: 10.5,
      loteMinimoM2: 180,
      frenteMinimoM: 9,
    },
    listing2026: {
      cos: 0.60,
      cus: 2.4,        // 1,584 m² — dato comercial EasyBroker EB-WE7457
      niveles: 4,
      alturaMaxM: 14,
      precio: 7_000_000,
      fuente: 'EasyBroker EB-WE7457',
      nota: 'Probablemente bajo H3; requiere verificación ante DUS/IMPLAN',
    },
  },

  reconciliacionHBU: {
    h2Confirmado: {
      cus: 1.8,
      m2Construibles: 1188,
      niveles: 3,
      alturaM: 10.5,
      fuente: 'Plan Parcial PDU + confirmación técnica',
      riesgo: 'Bajo — no requiere trámite adicional',
    },
    listingH3: {
      cus: 2.4,
      m2Construibles: 1584,
      niveles: 4,
      alturaM: 14,
      fuente: 'EasyBroker EB-WE7457',
      riesgo: 'Medio — requiere verificar si aplica cambio de densidad ante autoridades',
      acciones: [
        'Solicitar copia del DUS ante Municipio de Querétaro',
        'Verificar plano de zonificación en IMPLAN',
        'Consultar con valuador si H3 es viable para el predio',
      ],
    },
    recomendacion: 'Trabajar con H2 (CUS 1.8) como base conservadora. Si se confirma H3, el upside es +33% de área construible.',
  },

  demografia: {
    municipio: {
      crecimientoPct2010_2020: 30.9,
      proyeccion2030Hab: 1_140_000,
      edadMediana: 30,
      cohorteJoven20_34Pct: 27.5,
      escolaridadSuperiorPct: 34.7,
      matriculadosEdSuperior: 42_913,
      salariosOver2smPct: 67.3,
      nseC_PlusPct: 11.3,
    },
    colonia: {
      ha: 35,
      habitantes: 1_760,
      hogares: 556,
      edadPromedio: 33,
      trabajadoresDiarios: 7_000,
    },
    personas: {
      roberto: {
        edad: 29, ocupacion: 'Mercadólogo', ingreso: 14_000,
        situacion: 'Soltero, renta depto $8.5k, busca independencia',
      },
      alejandra: {
        edad: 31, ocupacion: 'Servicio público', ingreso: 26_000,
        situacion: 'Pareja, renta $12k, buscan patrimonio',
      },
    },
  },

  mercado: {
    terrenosZonaMedianaM2: 6_433,    // Lamudi Big Data ago-2021
    deptosMunicipalMedianaM2: 24_148, // Big Data ago-2021
    colivingInstitucional: [
      { nombre: 'Kali', min: 7_500, max: 8_250 },
      { nombre: 'Habiteé', min: 9_500, max: 9_500 },
      { nombre: 'Altana', min: 10_300, max: 10_300 },
      { nombre: 'Xéntric', min: 8_500, max: 8_500 },
    ],
    colivingPromMes: 8_950,
    informalCuartosProm: 3_837,
    informalCimatarioRango: [3_600, 5_000],
    deptoAmueblado: { promMes: 16_425, m2Prom: 112, precioM2: 150 },
    newSohoCimatario: { rentaMes: 20_000, m2: 110 },
    ratioCritico: 'Para igualar $16,425/mes al informal ($3,837/cuarto): ≥4.2 habitaciones mínimo',
  },

  modeloSeleccionado: {
    nombre: '2VV+6VR',
    descripcion: '2 townhouses venta + 2 lofts + 4 estudios renta',
    unidades: {
      townhouses: { n: 2, m2: 235, uso: 'venta' },
      lofts: { n: 2, m2: 79, uso: 'renta' },
      studios: { n: 4, m2: 38, uso: 'renta' },
    },
    totalM2Construidos: 950,
    financiero: {
      inversionInicial: -14_057_727,
      costoM2Venta: 8_277,
      costoM2Renta: 14_074,
      ventaTownhousesAno2: 9_165_000,
      precioVentaM2: 19_500,
      rentaMensual: 50_300,
      rentaAnual: 603_600,
      tir: 23,
      roi: 20.36,
      horizonteAnos: 10,
    },
  },

  escenarios: [
    { nombre: '2VV+6VR', tir: 23, roi: 20.36, descripcion: 'Modelo seleccionado. Balance renta-venta.' },
    { nombre: '3VV', tir: 25.7, roi: null, descripcion: 'Mayor TIR por más venta. Menos flujo recurrente.' },
    { nombre: '6VV (requiere DUS)', tir: null, ventasTotal: 15_980_000, descripcion: 'Venta máxima. Requiere cambio DUS.' },
    { nombre: 'VV+VR mixto', tir: 6.7, roi: null, descripcion: 'TIR baja. No óptimo.' },
  ],

  hbuDeclarado: {
    uso: 'Híbrido co-living mejorado (renta) + townhouses (venta)',
    marca: 'HAIV',
    slogan: 'Vive independiente, vive en comunidad',
    target: 'C+, Millennial licenciatura, primera independencia / segunda vivienda',
    nota: 'Horizontal se desplaza mejor; solo vertical sin townhouses no es óptimo para este lote de 660m².',
  },

  foda: {
    fortalezas: [
      'Ubicación estratégica Cimatario: 5km Centro Histórico, alta conectividad',
      'Lote plano, doble fachada, cuatro calles de acceso',
      'Zonificación H2 sin restricción de monumentos históricos',
      'Alto bono demográfico (edad mediana municipal 30 años)',
      'Demanda nearshoring 2026 en crecimiento sostenido',
    ],
    oportunidades: [
      'Gap enorme: co-living institucional ($8,950/mes) vs informal ($3,837/cuarto)',
      'Escasez de oferta CUS >2.0 en Cimatario',
      'Financiamiento bancario accesible para target C+',
      '+130k hab proyectados QRO 2030',
    ],
    debilidades: [
      'Discrepancia legal CUS: confirmado 1.8 vs listing 2.4 — requiere resolución antes de cerrar',
      'RPP registra 420m² vs catastro 660m² — fusión pendiente',
      'Permisos DUS: 3-6 meses si requiere cambio de densidad',
    ],
    amenazas: [
      'Nuevos proyectos co-living institucional en zona',
      'Alza de tasas de financiamiento 2024-2026',
      'Demanda nearshoring sensible a renegociación T-MEC',
    ],
  },
} as const;

export type Estudio2023 = typeof ESTUDIO2023;
