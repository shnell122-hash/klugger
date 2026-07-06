// data/estudio-mercado.ts
// Módulo de datos FIEL del Estudio de Mercado (Colonia Cimatario, Querétaro).
// Extraído para alimentar un tab de charts nativos del dashboard de valuación.
//
// REGLA DURA: cero alucinación. Toda cifra existe literalmente en las fuentes.
// Cada dataset lleva un campo `source` citando documento + sección/página.
// Donde un dato pedido NO existe literalmente en las fuentes, se omite y se
// anota con un comentario `// FALTA EN FUENTE`.

// ─────────────────────────────────────────────────────────────────────────
// FUENTES
// ─────────────────────────────────────────────────────────────────────────

export const FUENTES = {
  analisis:
    '/Users/germanvillar/.sandbox/workspaces/klugger/cases/terreno-cimatario-queretaro/analisisCimatario2023.md',
  transcripcion:
    '/Users/germanvillar/.sandbox/workspaces/klugger/cases/terreno-cimatario-queretaro/transcripcionEstudioMercado2023.md',
} as const;

// Wrapper genérico: cada dataset lleva su(s) dato(s) + la cita de fuente exacta.
interface Sourced<T> {
  source: string;
  data: T;
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Conectividad y tiempos de traslado desde el predio
// analisisCimatario2023.md §1.2
// ─────────────────────────────────────────────────────────────────────────

export interface ConectividadPOI {
  orden: number; // numeración "#" tal como aparece en la tabla fuente (no es un ranking por distancia)
  lugar: string;
  distancia_km: number;
  tiempo_min: number;
}

export const conectividad: Sourced<ConectividadPOI[]> = {
  source: 'analisisCimatario2023.md §1.2 Conectividad y Tiempos de Traslado desde el Predio',
  data: [
    { orden: 3, lugar: 'Centro Histórico', distancia_km: 2.7, tiempo_min: 11 },
    { orden: 4, lugar: 'Central de Autobuses de Querétaro', distancia_km: 4.2, tiempo_min: 11 },
    { orden: 2, lugar: 'Corregidora', distancia_km: 9.6, tiempo_min: 11 },
    { orden: 1, lugar: 'Juriquilla', distancia_km: 18.6, tiempo_min: 18 },
    { orden: 5, lugar: 'Aeropuerto Internacional de Querétaro', distancia_km: 32.6, tiempo_min: 31 },
    { orden: 6, lugar: 'Bernal', distancia_km: 58.0, tiempo_min: 46 },
    // Tequisquiapan y Cadereyta comparten "1 hr 3 min" (63 min) tal cual en la fuente.
    { orden: 7, lugar: 'Tequisquiapan', distancia_km: 62.0, tiempo_min: 63 },
    { orden: 8, lugar: 'Cadereyta de Montes', distancia_km: 72.2, tiempo_min: 63 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// 2. Proyección de población municipal (serie año por año 2022-2030)
// transcripcionEstudioMercado2023.md Pág. 8 "PROYECCIONES DEMOGRÁFICAS: PAÍS, ESTADO
// Y MUNICIPIO", tabla "Proyección del Estado y Municipio de Querétaro" (~L77-88)
// ─────────────────────────────────────────────────────────────────────────

export interface PoblacionPunto {
  anio: number;
  poblacionMunicipio: number;
  poblacionEstado: number;
  esProyeccion: boolean;
}

export const proyeccionPoblacion: Sourced<PoblacionPunto[]> = {
  source:
    'transcripcionEstudioMercado2023.md Pág. 8 "PROYECCIONES DEMOGRÁFICAS: PAÍS, ESTADO Y MUNICIPIO" — tabla "Proyección del Estado y Municipio de Querétaro" ' +
    '(Fuente citada en el documento: "Investigado y analizado por VDD de acuerdo a Consulta Interactiva de Información Demográfica COESPO Querétaro"). ' +
    'Serie completa año por año, todos los puntos (2022-2030) son proyección COESPO, no censo.',
  data: [
    { anio: 2022, poblacionMunicipio: 1_007_923, poblacionEstado: 2_358_758, esProyeccion: true },
    { anio: 2023, poblacionMunicipio: 1_023_514, poblacionEstado: 2_397_293, esProyeccion: true },
    { anio: 2024, poblacionMunicipio: 1_039_236, poblacionEstado: 2_435_115, esProyeccion: true },
    { anio: 2025, poblacionMunicipio: 1_055_096, poblacionEstado: 2_472_207, esProyeccion: true },
    { anio: 2026, poblacionMunicipio: 1_071_145, poblacionEstado: 2_508_557, esProyeccion: true },
    { anio: 2027, poblacionMunicipio: 1_087_435, poblacionEstado: 2_544_144, esProyeccion: true },
    { anio: 2028, poblacionMunicipio: 1_104_025, poblacionEstado: 2_578_973, esProyeccion: true },
    { anio: 2029, poblacionMunicipio: 1_120_919, poblacionEstado: 2_613_029, esProyeccion: true },
    { anio: 2030, poblacionMunicipio: 1_138_178, poblacionEstado: 2_646_299, esProyeccion: true },
    // Nota: el municipio de Querétaro tuvo 1,049,777 hab. en el Censo 2020 (analisisCimatario2023.md
    // §2.1), cifra mayor a la proyección COESPO de 1,007,923 para 2022. Es una inconsistencia
    // presente en las propias fuentes (metodologías distintas: censo vs. proyección poblacional);
    // se preserva tal cual, sin reconciliar, para no alucinar una cifra "corregida".
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// 3. Estructura de edad municipal (bono demográfico)
// analisisCimatario2023.md §2.1
// ─────────────────────────────────────────────────────────────────────────

export interface RangoEdadMunicipal {
  rango: string;
  poblacion: number;
}

export const estructuraEdad: Sourced<{
  rangos: RangoEdadMunicipal[];
  agregado20a34Pct: number;
  edadMedianaAnios: number;
  relacionDependenciaPct: number;
}> = {
  source: 'analisisCimatario2023.md §2.1 Población y Estructura por Edad',
  data: {
    rangos: [
      { rango: '20-24', poblacion: 96_659 },
      { rango: '25-29', poblacion: 102_358 },
      { rango: '30-34', poblacion: 89_843 },
    ],
    agregado20a34Pct: 27.5,
    edadMedianaAnios: 30,
    relacionDependenciaPct: 41.0,
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 4. Estructura de edad — Colonia Cimatario
// analisisCimatario2023.md §4.1 + transcripcionEstudioMercado2023.md (Pág. 39, ~L499-511)
// ─────────────────────────────────────────────────────────────────────────

export interface RangoEdadCimatario {
  rango: string;
  poblacion: number;
}

export const cimatarioEdad: Sourced<{
  rangos: RangoEdadCimatario[];
  totalHabitantes: number;
  hogares: number;
  edadPromedio: number;
  escolaridadPromedioAnios: number; // "13 años cursados (preparatoria)"
  densidadHabKm2: number;
}> = {
  source:
    'analisisCimatario2023.md §4.1 Características del Predio Objeto del Estudio + transcripcionEstudioMercado2023.md Pág. 39 "COLONIA CIMATARIO" (Fuente: Market Data México)',
  data: {
    rangos: [
      { rango: '0-14', poblacion: 300 },
      { rango: '15-29', poblacion: 500 },
      { rango: '30-59', poblacion: 700 },
      { rango: '+60', poblacion: 390 },
    ],
    totalHabitantes: 1_760,
    hogares: 556,
    edadPromedio: 33,
    escolaridadPromedioAnios: 13,
    densidadHabKm2: 491,
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 5. Migración (CONAPO 2020)
// analisisCimatario2023.md §2.2
// ─────────────────────────────────────────────────────────────────────────

export const migracion: Sourced<{
  inmigrantesInterestatales: number;
  emigrantesInterestatales: number;
  inmigrantesInternacionales: number;
  emigrantesInternacionales: number;
  rankingNacionalAtraccion: number;
}> = {
  source: 'analisisCimatario2023.md §2.2 Migración (datos CONAPO 2020)',
  data: {
    inmigrantesInterestatales: 26_730,
    emigrantesInterestatales: 8_651,
    inmigrantesInternacionales: 2_413,
    emigrantesInternacionales: 7_722,
    rankingNacionalAtraccion: 4,
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 6. Tipología de vivienda municipal (Censo 2020)
// analisisCimatario2023.md §2.3
// ─────────────────────────────────────────────────────────────────────────

export const viviendaTipologia: Sourced<{
  casaUnicaPct: number;
  casaCompartePct: number;
  duplexPct: number;
  verticalPct: number;
}> = {
  source: 'analisisCimatario2023.md §2.3 Vivienda y Servicios Básicos (Censo 2020, municipal)',
  data: {
    casaUnicaPct: 84.9,
    casaCompartePct: 8.7,
    duplexPct: 2.4,
    verticalPct: 3.9,
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 7. Mercado Big Data (Lamudi, ago-2021) vs. tipología censal INEGI
// analisisCimatario2023.md — Interpretación de Elementos Visuales §4 (Pág. 91-92)
// ─────────────────────────────────────────────────────────────────────────

export const mercadoBigDataVsInegi: Sourced<{
  ofertaActivaVerticalPct: number; // % de anuncios de deptos en oferta activa digital (ago-2021)
  productoNuevoPct: number; // % 0-4 años de antigüedad dentro de esa oferta vertical
  medianaPrecioM2: number;
  areaTipoM2: number;
}> = {
  source:
    'analisisCimatario2023.md — Interpretación de Elementos Visuales §4 "Composición de Mercado Big Data vs. Datos INEGI" (Pág. 91 y 92)',
  data: {
    ofertaActivaVerticalPct: 30,
    productoNuevoPct: 84,
    medianaPrecioM2: 24_148,
    areaTipoM2: 118,
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 8. Salud — afiliación médica
// analisisCimatario2023.md §2.4
// ─────────────────────────────────────────────────────────────────────────

export const salud: Sourced<{
  imssPct: number;
  insabiPct: number;
  privadaPct: number;
  coberturaMunicipalPct: number;
  coberturaEstatalPct: number;
}> = {
  source: 'analisisCimatario2023.md §2.4 Salud y Educación',
  data: {
    imssPct: 72.1,
    insabiPct: 17.2,
    privadaPct: 6.4,
    coberturaMunicipalPct: 79.8,
    coberturaEstatalPct: 79.1,
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 9. Educación y alfabetismo
// analisisCimatario2023.md §2.4
// ─────────────────────────────────────────────────────────────────────────

export const educacion: Sourced<{
  superiorPct: number;
  mediaSuperiorPct: number;
  basicaPct: number;
  alfabetismoMunicipalPct: number;
  alfabetismoEstatalPct: number;
}> = {
  source: 'analisisCimatario2023.md §2.4 Salud y Educación',
  data: {
    superiorPct: 34.7,
    mediaSuperiorPct: 25.6,
    basicaPct: 37.0,
    alfabetismoMunicipalPct: 98.05,
    alfabetismoEstatalPct: 96.52,
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 10. Empleo, ocupación y ramas de actividad
// analisisCimatario2023.md §2.5
// ─────────────────────────────────────────────────────────────────────────

export interface RamaActividad {
  rama: string;
  pct: number; // % estatal
}

export const empleo: Sourced<{
  peaMunicipalPct: number;
  peaEstatalPct: number;
  ocupadaPct: number;
  desocupadaPct: number;
  masDeDosSMMunicipalPct: number;
  masDeDosSMEstatalPct: number;
  ramas: RamaActividad[];
}> = {
  source: 'analisisCimatario2023.md §2.5 Empleo, Ocupación e Índice de Desarrollo Humano (IDH)',
  data: {
    peaMunicipalPct: 67,
    peaEstatalPct: 65,
    ocupadaPct: 96.36,
    desocupadaPct: 3.64,
    masDeDosSMMunicipalPct: 67.29,
    masDeDosSMEstatalPct: 61.28,
    ramas: [
      { rama: 'Industria Manufacturera', pct: 23.5 },
      { rama: 'Comercio', pct: 16.9 },
      { rama: 'Construcción', pct: 11.6 },
      { rama: 'Servicios Profesionales', pct: 9.9 },
      { rama: 'Servicios Diversos', pct: 9.4 },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 11. Índice de Desarrollo Humano (IDH)
// analisisCimatario2023.md §2.5
// ─────────────────────────────────────────────────────────────────────────

export const idh: Sourced<{
  total: number;
  salud: number;
  ingreso: number;
  educacion: number;
  rankingNacional: number;
}> = {
  source: 'analisisCimatario2023.md §2.5 Empleo, Ocupación e Índice de Desarrollo Humano (IDH)',
  data: {
    total: 0.781,
    salud: 0.899,
    ingreso: 0.796,
    educacion: 0.666,
    rankingNacional: 12,
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 12. Ecosistema urbano en radio de 5 km
// analisisCimatario2023.md — Interpretación de Elementos Visuales §1 (Pág. 47-54)
// ─────────────────────────────────────────────────────────────────────────

export const ecosistema5km: Sourced<{
  corporativos: number;
  universidades: number;
  hospitales: number;
  bancos: number;
  comerciales: number;
  radioKm: number;
  tiempoTrasladoUrbanoMin: string; // rango literal "entre 15 y 30 minutos"
}> = {
  source:
    'analisisCimatario2023.md — Interpretación de Elementos Visuales §1 "Radios de Equipamiento" (Pág. 47 a 54)',
  data: {
    corporativos: 37,
    universidades: 29,
    hospitales: 18,
    bancos: 58,
    comerciales: 20,
    radioKm: 5,
    tiempoTrasladoUrbanoMin: '15-30',
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 13. Benchmarks de mercado (competencia inmobiliaria)
// analisisCimatario2023.md §4.4
// ─────────────────────────────────────────────────────────────────────────

export const benchmarks: Sourced<{
  coLivingInformal: { precioMensual: number };
  coLivingInstitucional: { precioMensual: number; areaM2Min: number; areaM2Max: number };
  deptsRenta: { precioMensual: number; areaM2Mediana: number; precioM2: number; muestra: number };
  deptsVenta: { precioPromedio: number; areaM2Promedio: number; precioM2Promedio: number; muestra: number };
  casas: { precioPromedio: number; areaM2Promedio: number; precioM2Promedio: number; muestra: number };
}> = {
  source: 'analisisCimatario2023.md §4.4 Análisis del Mercado de la Competencia (Benchmarks)',
  data: {
    coLivingInformal: { precioMensual: 3_837 },
    coLivingInstitucional: { precioMensual: 8_950, areaM2Min: 12, areaM2Max: 14 },
    deptsRenta: { precioMensual: 16_425, areaM2Mediana: 112, precioM2: 150, muestra: 12 },
    deptsVenta: { precioPromedio: 4_247_272, areaM2Promedio: 118, precioM2Promedio: 36_516, muestra: 24 },
    casas: { precioPromedio: 4_917_059, areaM2Promedio: 293, precioM2Promedio: 17_088, muestra: 17 },
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 14. Listados granulares de Co-Living (detalle mundo / México / Querétaro)
// transcripcionEstudioMercado2023.md Pág. 69-75 (~L802-897)
// ─────────────────────────────────────────────────────────────────────────

export interface CoLivingListing {
  nombre: string;
  ubicacion: string;
  categoria: 'mundo' | 'mexico' | 'queretaro' | 'queretaro_estudiantil';
  precioMin: number;
  precioMax?: number; // si la fuente reporta un precio único, se omite
  capacidad_habitaciones: number;
  area_m2?: number; // solo cuando la fuente reporta un área explícita
  amenidades?: string[];
}

export const coLivingListings: Sourced<CoLivingListing[]> = {
  source:
    'transcripcionEstudioMercado2023.md Pág. 69 "CO-LIVING EN EL MUNDO", Pág. 70 (íd.), Pág. 71-72 "CO-LIVING EN MÉXICO", Pág. 73 "CO-LIVING EN QUERÉTARO", Pág. 74-75 "CO-LIVING ESTUDIANTIL EN QUERÉTARO"',
  data: [
    // --- Mundo (Pág. 69-70) ---
    {
      nombre: 'Urban Campus',
      ubicacion: 'Malasaña, Madrid, España',
      categoria: 'mundo',
      precioMin: 21_600,
      precioMax: 36_000,
      capacidad_habitaciones: 8,
      amenidades: [
        'Alquiler flexible desde un mes',
        'Netflix',
        'Wifi de alta velocidad',
        'Limpieza semanal',
        'Servicio de lavandería',
        'Servicio de mantenimiento',
        'Coworking',
        'Terrazas',
        '300 m² de zonas comunes',
      ],
    },
    {
      nombre: 'The Lexington. Urban Leisure',
      ubicacion: 'Bedford-Stuyvesant, Brooklyn, Nueva York',
      categoria: 'mundo',
      precioMin: 27_000,
      precioMax: 36_000,
      capacidad_habitaciones: 8,
      amenidades: [
        'Cocina completamente equipada y lavaplatos',
        'Wifi',
        'Seguridad',
        'Calefacción y aire acondicionado',
        'Estación de café',
        'Patio al aire libre',
        'Smart TV',
      ],
    },
    {
      nombre: 'The Collective Canary Wharf',
      ubicacion: 'Londres, Inglaterra',
      categoria: 'mundo',
      precioMin: 31_000,
      precioMax: 49_000,
      capacidad_habitaciones: 5,
      amenidades: [
        'Smart TV de 32"',
        'Piscina Skyline',
        'Sala de juegos',
        'Limpieza de la habitación',
        'Saunas',
        'Restaurante y Bar',
        'Gimnasio',
        'Simulador de golf',
        'Wifi ultrarrápido',
        'Cine',
        'Biblioteca',
      ],
    },
    {
      nombre: 'Colonies. Gustave',
      ubicacion: 'Villejuif, Francia',
      categoria: 'mundo',
      precioMin: 21_360,
      capacidad_habitaciones: 14,
      amenidades: [
        'Sala de estar',
        'Comedor',
        'Área de cocina',
        'Área de barbacoa',
        'Terraza',
        'Gimnasio',
        'Sala de proyección',
        'Jardín',
        'Portabicicletas',
      ],
    },
    // --- México (Pág. 71-72) ---
    {
      nombre: 'Estancia 39',
      ubicacion: 'Escandón, Miguel Hidalgo, CDMX',
      categoria: 'mexico',
      precioMin: 14_700,
      precioMax: 18_900,
      capacidad_habitaciones: 224,
      amenidades: [
        'Internet inalámbrico de alta velocidad',
        'Conexión Ethernet hasta 200mb',
        'Venta de alimentos, bebidas, medicinas y productos de aseo',
        'Acceso controlado con reconocimiento facial y huella',
        'CCTV en áreas comunes 24 hrs',
      ],
    },
    {
      nombre: 'El Depa de Juana',
      ubicacion: 'Gustavo A. Madero, CDMX',
      categoria: 'mexico',
      precioMin: 15_500,
      precioMax: 21_200,
      capacidad_habitaciones: 60,
      amenidades: [
        'Cocina equipada',
        'Comedor multiusos',
        'Gimnasio',
        'Terraza con grill',
        'Lavandería',
        'Áreas verdes',
        'Sala de TV con Netflix',
        'Área de coworking',
        'Estacionamiento para bicicletas',
        'Seguridad 24/7',
        'Concierge',
      ],
    },
    {
      nombre: 'Covive Casa Amatlán',
      ubicacion: 'La Condesa, CDMX',
      categoria: 'mexico',
      precioMin: 12_950,
      capacidad_habitaciones: 10,
      amenidades: ['Casa remodelada', 'Jardín social a la entrada', 'Solario', 'Cocina', 'Sala', 'Comedor', 'Centro de lavado'],
    },
    {
      nombre: 'Niu Coliving',
      ubicacion: 'Colonia Narvarte, CDMX',
      categoria: 'mexico',
      precioMin: 12_500,
      precioMax: 15_500,
      capacidad_habitaciones: 54,
      amenidades: [
        'Mobiliario y servicios incluidos',
        'Vigilancia',
        'Concierge',
        'Mudanza',
        'Mantenimiento incluido',
        'Smart TV',
        'Internet inalámbrico',
        'Gym y snack bar (cargo adicional)',
      ],
    },
    // --- Querétaro (Pág. 73) ---
    {
      nombre: 'Casa Iris Co-living',
      ubicacion: 'Navidad 24, Centro Histórico, Qro.',
      categoria: 'queretaro',
      precioMin: 12_800,
      capacidad_habitaciones: 18,
      amenidades: ['Wi-Fi', 'Estacionamiento', 'Servicio de lavandería', 'Centro de negocios', 'Cocina en todas las habitaciones', 'Jacuzzi'],
    },
    {
      nombre: 'Casa Séptimo',
      ubicacion: 'Héroes de Nacozari, Centro, Qro.',
      categoria: 'queretaro',
      precioMin: 6_000,
      capacidad_habitaciones: 6,
      amenidades: ['3 habitaciones privadas', '1 loft privado para 5 personas', '2 dormitorios', 'Cocina y sala común'],
    },
    // --- Querétaro estudiantil (Pág. 74-75) ---
    {
      nombre: 'Kali Homes',
      ubicacion: 'Av. Felipe Ángeles, Qro. (cerca de Tec de Monterrey)',
      categoria: 'queretaro_estudiantil',
      precioMin: 7_500,
      precioMax: 8_250,
      capacidad_habitaciones: 40,
      area_m2: 14,
      amenidades: [
        'Servibar',
        'Internet ilimitado de alta velocidad',
        'Acceso a salón de co-working',
        'Lavadora y secadora de autoservicio',
        'Cocina y comedor compartido',
        'Estacionamiento por $100 semanal',
        'Baño propio',
        'Limpieza dos veces por semana',
        'Rooftop y terrazas',
      ],
    },
    {
      nombre: 'Habiteé Urban Dorms. Executive Suites',
      ubicacion: 'Fracc. Tecnológico, Qro. (cerca de Tec de Monterrey)',
      categoria: 'queretaro_estudiantil',
      precioMin: 9_500,
      capacidad_habitaciones: 10,
      amenidades: ['Check-in/out privado y exprés', 'Terraza', 'Limpieza diaria', 'Calefacción', 'Kit de primeros auxilios', 'TV'],
    },
    {
      nombre: 'Altana Student Living',
      ubicacion: 'Zibatá, El Marqués, Qro. (Universidad Anáhuac)',
      categoria: 'queretaro_estudiantil',
      precioMin: 10_300,
      capacidad_habitaciones: 83,
      amenidades: ['Study Room', 'Lobby', 'Concierge', 'Laundry rooms', 'Lounge', 'Cooking roof garden', 'BBQ Garden', 'Sun garden'],
    },
    {
      nombre: 'Xéntric Anáhuac',
      ubicacion: 'Zibatá, El Marqués, Qro. (Universidad Anáhuac)',
      categoria: 'queretaro_estudiantil',
      precioMin: 8_500,
      capacidad_habitaciones: 245,
      area_m2: 12.31, // habitación independiente; el depto amueblado de la misma propiedad es de 77 m²
      amenidades: [
        'Baño privado',
        'Internet inalámbrico simétrico y TV por cable',
        'Alberca',
        'Gimnasio',
        'Pista para correr de 1 km',
        'Cancha de fútbol',
        'Lavandería',
        'Estacionamiento',
        'Transporte a puntos estratégicos',
        'Vigilancia 24 horas',
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// 14b. Levantamiento granular de cuartos en renta y co-living (tabla comparativa)
// transcripcionEstudioMercado2023.md Pág. 76 "LEVANTAMIENTO DE CO-LIVING & CUARTOS EN RENTA" (~L900-917)
// Bonus dataset — soporta el detalle detrás de `benchmarks.coLivingInformal` /
// `benchmarks.coLivingInstitucional` con servicios incluidos por listado.
// ─────────────────────────────────────────────────────────────────────────

export interface CuartoRentaLevantamiento {
  nombre: string;
  ubicacion: string;
  segmento: 'informal' | 'institucional';
  precioMensual: number;
  contratoMinimo: string;
  servicios: {
    luz: boolean;
    agua: boolean;
    gas: boolean;
    cableTV: boolean;
    internet: boolean;
    limpieza: boolean;
    cocina: boolean;
    areasCompartidas: boolean;
    banoPropio: boolean;
    areaLavado: boolean;
  };
}

export const cuartosRentaLevantamiento: Sourced<CuartoRentaLevantamiento[]> = {
  source:
    'transcripcionEstudioMercado2023.md Pág. 76 "LEVANTAMIENTO DE CO-LIVING & CUARTOS EN RENTA" (tabla completa)',
  data: [
    {
      nombre: 'Cuarto en Casa Colonial',
      ubicacion: 'Escobedo, Centro Histórico',
      segmento: 'informal',
      precioMensual: 3_799,
      contratoMinimo: '2 meses',
      servicios: { luz: true, agua: true, gas: true, cableTV: false, internet: true, limpieza: true, cocina: true, areasCompartidas: true, banoPropio: true, areaLavado: true },
    },
    {
      nombre: 'Cuarto para señoritas',
      ubicacion: 'Centro Histórico',
      segmento: 'informal',
      precioMensual: 2_500,
      contratoMinimo: '6 meses',
      servicios: { luz: true, agua: true, gas: true, cableTV: false, internet: true, limpieza: false, cocina: false, areasCompartidas: false, banoPropio: false, areaLavado: true },
    },
    {
      nombre: 'Habitaciones amuebladas',
      ubicacion: 'Morelos, Centro Histórico',
      segmento: 'informal',
      precioMensual: 4_900,
      contratoMinimo: 'N/E',
      servicios: { luz: true, agua: true, gas: true, cableTV: false, internet: true, limpieza: true, cocina: true, areasCompartidas: true, banoPropio: true, areaLavado: true },
    },
    {
      nombre: 'Amplia Habitación solo mujeres',
      ubicacion: 'Plazas del Sol',
      segmento: 'informal',
      precioMensual: 3_000,
      contratoMinimo: 'N/E',
      servicios: { luz: false, agua: false, gas: false, cableTV: false, internet: true, limpieza: false, cocina: true, areasCompartidas: false, banoPropio: true, areaLavado: true },
    },
    {
      nombre: 'Habitación compartida',
      ubicacion: 'Cimatario',
      segmento: 'informal',
      precioMensual: 3_600,
      contratoMinimo: '3 meses',
      servicios: { luz: true, agua: true, gas: true, cableTV: true, internet: true, limpieza: true, cocina: true, areasCompartidas: true, banoPropio: false, areaLavado: true },
    },
    {
      nombre: 'Cuarto amueblado',
      ubicacion: 'Cimatario',
      segmento: 'informal',
      precioMensual: 5_000,
      contratoMinimo: '3 meses',
      servicios: { luz: true, agua: true, gas: true, cableTV: true, internet: true, limpieza: true, cocina: true, areasCompartidas: true, banoPropio: false, areaLavado: true },
    },
    {
      nombre: 'Cuarto semi amueblado',
      ubicacion: 'El Mirador',
      segmento: 'informal',
      precioMensual: 3_400,
      contratoMinimo: 'N/E',
      servicios: { luz: true, agua: true, gas: true, cableTV: true, internet: true, limpieza: true, cocina: true, areasCompartidas: true, banoPropio: false, areaLavado: true },
    },
    {
      nombre: 'Habitación amueblada',
      ubicacion: 'Milenio III',
      segmento: 'informal',
      precioMensual: 4_500,
      contratoMinimo: 'N/E',
      servicios: { luz: true, agua: true, gas: true, cableTV: true, internet: true, limpieza: false, cocina: true, areasCompartidas: true, banoPropio: true, areaLavado: false },
    },
    {
      nombre: 'Habiteé Executive suites All inclusive+coworking',
      ubicacion: 'Av. Felipe Ángeles',
      segmento: 'institucional',
      precioMensual: 7_500,
      contratoMinimo: 'Semanal',
      servicios: { luz: true, agua: true, gas: true, cableTV: true, internet: true, limpieza: true, cocina: true, areasCompartidas: true, banoPropio: true, areaLavado: true },
    },
    {
      nombre: 'Kali Homes',
      ubicacion: 'Av. Estadística (errata; es F. Ángeles)',
      segmento: 'institucional',
      precioMensual: 9_500,
      contratoMinimo: 'Día',
      servicios: { luz: true, agua: true, gas: true, cableTV: true, internet: true, limpieza: true, cocina: true, areasCompartidas: true, banoPropio: true, areaLavado: true },
    },
    {
      nombre: 'Altana',
      ubicacion: 'Zibatá',
      segmento: 'institucional',
      precioMensual: 8_500,
      contratoMinimo: 'Anual',
      servicios: { luz: true, agua: true, gas: true, cableTV: true, internet: true, limpieza: true, cocina: true, areasCompartidas: true, banoPropio: true, areaLavado: true },
    },
    {
      nombre: 'Xéntric Anáhuac',
      ubicacion: 'Zibatá',
      segmento: 'institucional',
      precioMensual: 10_300,
      contratoMinimo: 'Anual',
      servicios: { luz: true, agua: true, gas: true, cableTV: true, internet: true, limpieza: true, cocina: true, areasCompartidas: true, banoPropio: true, areaLavado: true },
    },
    // NOTA: los precios de esta tabla (Pág. 76) difieren de los reportados en el detalle
    // individual de listados institucionales (Pág. 74-75, ver `coLivingListings`) para
    // Kali Homes, Altana y Xéntric Anáhuac. Es una inconsistencia presente en el propio
    // documento fuente (posible mezcla de plan base vs. plan premium); se preserva tal
    // cual en ambos datasets sin reconciliar, para no alucinar una cifra "corregida".
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// 15. Inversiones — obra pública y privada relevante
// analisisCimatario2023.md §3.2 + transcripcionEstudioMercado2023.md Pág. 39 (~L510)
// ─────────────────────────────────────────────────────────────────────────

export const inversiones: Sourced<{
  cloudHQDataCenter: { nombre: string; inversionMDP: number; descripcion: string };
  swobodaMechatronics: { nombre: string; ubicacion: string; areaM2: number; inversionMDD: number };
  hospitalAngeles: { nombre: string; pisos: number; terrenoHa: number };
  hotelWestin: { nombre: string; niveles: number; alturaM: number; composicion: string };
  carretera210: { nombre: string; descripcion: string };
  carretera540: { nombre: string; descripcion: string };
  cimatarioSeccion2: { inversionMXN: number; avancePct: number };
  cimatarioSeccion3: { inversionMXN: number; inicio: string };
  outputEconomicoCimatario: {
    totalAnualMXN: number;
    ingresoHogaresMXN: number;
    ingresoEstablecimientosMXN: number;
    numEstablecimientos: number;
    trabajadoresQueLaboranEnLaColonia: number;
    totalResidentesYTrabajadores: number;
  };
}> = {
  source:
    'analisisCimatario2023.md §3.2 Obras Públicas y Privadas Relevantes en Ejecución (2021) + transcripcionEstudioMercado2023.md Pág. 39 "Economía" (~L510-511, Fuente MarketData México)',
  data: {
    cloudHQDataCenter: {
      nombre: 'Cloud-HQ Campus Data Center',
      inversionMDP: 14_942,
      descripcion: 'Centro de datos a híper escala',
    },
    swobodaMechatronics: {
      nombre: 'Swoboda Mechatronics (San Juan del Río)',
      ubicacion: 'San Juan del Río',
      areaM2: 7_000,
      inversionMDD: 30,
    },
    hospitalAngeles: {
      nombre: 'Hospital Ángeles (Centro Sur)',
      pisos: 21,
      terrenoHa: 4.69,
    },
    hotelWestin: {
      nombre: 'Hotel Westin Querétaro (Centro Sur)',
      niveles: 37,
      alturaM: 188,
      composicion: '9 niveles hotel + 9 niveles oficinas corporativas + 14 niveles deptos de lujo',
    },
    carretera210: {
      nombre: 'Carretera 210 (El Marqués)',
      descripcion: 'Modernización vial para los municipios conurbados',
    },
    carretera540: {
      nombre: 'Carretera 540 (El Marqués)',
      descripcion: 'Ampliación de 2 a 6 carriles e inclusión de ciclovía',
    },
    cimatarioSeccion2: { inversionMXN: 55_973_831, avancePct: 51 },
    cimatarioSeccion3: { inversionMXN: 63_542_306, inicio: 'agosto de 2021' },
    outputEconomicoCimatario: {
      totalAnualMXN: 1_800_000_000,
      ingresoHogaresMXN: 220_000_000,
      ingresoEstablecimientosMXN: 1_600_000_000,
      numEstablecimientos: 430,
      trabajadoresQueLaboranEnLaColonia: 7_000,
      totalResidentesYTrabajadores: 9_000,
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 16. FODA del predio
// analisisCimatario2023.md §4.2
// ─────────────────────────────────────────────────────────────────────────

export const foda: Sourced<{
  fortalezas: string[];
  oportunidades: string[];
  debilidades: string[];
  amenazas: string[];
}> = {
  source: 'analisisCimatario2023.md §4.2 Análisis FODA del Terreno',
  data: {
    fortalezas: [
      'Construcción previa ya demolida con trámites avanzados',
      'Excelente conectividad peatonal con el Centro Histórico pero fuera de la restricción de la zona de monumentos',
      'Equipamiento educativo, comercial y médico completo a corta distancia',
    ],
    oportunidades: [
      'Obras públicas activas de mejoramiento de servicios en la colonia',
      'Proliferación de oficinas boutique y micronegocios en las inmediaciones',
      'Alta plusvalía por cercanía a vialidades principales',
    ],
    debilidades: [
      'Costo elevado de adquisición del metro cuadrado de tierra',
      'La zona inmediata no se encuentra consolidada como distrito exclusivo de oficinas o estudiantil',
      'Perfil vecinal actual envejecido',
    ],
    amenazas: [
      'Infraestructura de servicios generales antigua en el entorno',
      'Congestionamiento vehicular provocado por la entrada/salida de colegios principales (v.g., Instituto Plancarte)',
      'Uso de calles internas residenciales como rutas de desahogo de tráfico',
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 17. Matriz de gestión de riesgos
// analisisCimatario2023.md §6
// ─────────────────────────────────────────────────────────────────────────

export interface Riesgo {
  tipo: 'Económico' | 'Social' | 'Legal';
  amenaza: string;
  probabilidad: number; // escala 1-10
  impacto: number; // escala 1-10
  valorCritico: number;
  clasificacion: string; // "Importante" | "Apreciable" tal como en la fuente
  estrategia: string;
}

export const riesgos: Sourced<Riesgo[]> = {
  source: 'analisisCimatario2023.md §6 Gestión y Matriz de Riesgos',
  data: [
    {
      tipo: 'Económico',
      amenaza: 'Absorción baja de rentas por impactos prolongados del COVID-19.',
      probabilidad: 5,
      impacto: 9,
      valorCritico: 45,
      clasificacion: 'Importante',
      estrategia:
        'Aceptación Activa: Creación de un fondo de contingencia y asignación de presupuesto extraordinario a marketing digital.',
    },
    {
      tipo: 'Económico',
      amenaza: 'Volatilidad e incremento en costos de materiales de obra.',
      probabilidad: 5,
      impacto: 9,
      valorCritico: 45,
      clasificacion: 'Importante',
      estrategia: 'Transferir: Mitigar mediante contratos de construcción firmados a precio alzado (precio fijo) con los contratistas.',
    },
    {
      tipo: 'Social',
      amenaza: 'Inseguridad en el entorno de la colonia.',
      probabilidad: 7,
      impacto: 6,
      valorCritico: 42,
      clasificacion: 'Importante',
      estrategia: 'Mitigar: Diseño arquitectónico controlado que integre caseta de vigilancia y control de acceso biométrico facial.',
    },
    {
      tipo: 'Económico',
      amenaza: 'Depreciación o desgaste rápido del mobiliario de los lofts.',
      probabilidad: 10,
      impacto: 3,
      valorCritico: 30,
      clasificacion: 'Apreciable',
      estrategia: 'Mitigar: Comprar equipamiento de alta calidad industrial que reduzca el costo de mantenimiento a largo plazo.',
    },
    {
      tipo: 'Social',
      amenaza: 'Desconfianza inicial del mercado hacia la tipología townhouse.',
      probabilidad: 8,
      impacto: 3,
      valorCritico: 24,
      clasificacion: 'Apreciable',
      estrategia:
        'Escalar: Lanzar campaña robusta de relaciones públicas posicionando al desarrollo como pionero de diseño de vanguardia en la ciudad.',
    },
    {
      tipo: 'Legal',
      amenaza: 'Ausencia de un marco regulatorio local para el arrendamiento compartido.',
      probabilidad: 9,
      impacto: 2,
      valorCritico: 18,
      clasificacion: 'Apreciable',
      estrategia:
        'Mitigar: Redacción e instrumentación de un reglamento interno estricto de co-living respaldado por contratos notariales jurídicos individuales.',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// 18. Modelo financiero HAIV (escenario híbrido 2 Townhouses + 6 Co-living)
// analisisCimatario2023.md §5.1-5.4
// ─────────────────────────────────────────────────────────────────────────

export const haiv: Sourced<{
  tirConsolidada: number; // 23%
  tirEscenarioTotal: number; // 81.4% (con apalancamiento y venta de tierra)
  roiAnualPct: number; // 20.36%
  inversionInicialMXN: number; // Año 0, negativo
  ventaTownhousesTotalMXN: number; // Año 2
  ventaTownhousesPrecioUnitarioMXN: number;
  ventaTownhousesTasaM2: number;
  ingresoBrutoMensualMXN: number;
  ingresoAnualAprox3ConEscalacionMXN: number;
  zonificacion: {
    construccionTotalM2: number;
    townhouses: { unidades: number; m2CadaUno: number };
    coLiving: {
      lofts: { unidades: number; m2CadaUno: number };
      estudios: { unidades: number; m2CadaUno: number };
    };
  };
  costosConstruccion: {
    ventaCostoM2: number;
    ventaInversionPorModuloMXN: number;
    rentaCostoM2: number;
    rentaInversionTotalMXN: number;
  };
  rentasMensualesEstimadas: {
    loft79m2: number;
    suite38m2: number;
  };
}> = {
  source:
    'analisisCimatario2023.md §5.1 Propuesta de Valor y Target de Mercado, §5.2 Zonificación, §5.3 Costos de Construcción, §5.4 Evaluación y Resultados Financieros',
  data: {
    tirConsolidada: 23,
    tirEscenarioTotal: 81.4,
    roiAnualPct: 20.36,
    inversionInicialMXN: -14_057_727,
    ventaTownhousesTotalMXN: 9_165_000,
    ventaTownhousesPrecioUnitarioMXN: 4_582_500,
    ventaTownhousesTasaM2: 19_500,
    ingresoBrutoMensualMXN: 50_300,
    ingresoAnualAprox3ConEscalacionMXN: 610_384,
    zonificacion: {
      construccionTotalM2: 950,
      townhouses: { unidades: 2, m2CadaUno: 235 },
      coLiving: {
        lofts: { unidades: 2, m2CadaUno: 79 },
        estudios: { unidades: 4, m2CadaUno: 38 },
      },
    },
    costosConstruccion: {
      ventaCostoM2: 8_277,
      ventaInversionPorModuloMXN: 1_945_290,
      rentaCostoM2: 14_074,
      rentaInversionTotalMXN: 5_067_147,
    },
    rentasMensualesEstimadas: {
      loft79m2: 11_850,
      suite38m2: 6_650,
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 19. Predio y normatividad (zonificación H2)
// analisisCimatario2023.md §4.1, §4.3
// ─────────────────────────────────────────────────────────────────────────

export const predio: Sourced<{
  direccion: string;
  superficieM2: number;
  frenteM: number;
  fondoM: number;
  usoSuelo: string;
  loteMinimoM2: number;
  frenteMinimoM: number;
  alturaMaximaNiveles: number;
  alturaMaximaM: number;
  casPct: number;
  casM2: number;
  cosPct: number;
  cosM2: number;
  cusVeces: number;
  cusM2: number;
}> = {
  source:
    'analisisCimatario2023.md §4.1 Características del Predio Objeto del Estudio + §4.3 Diagnóstico de Normatividad y Uso de Suelo',
  data: {
    direccion: 'Calle Carlos Septién García No. 53, Colonia Cimatario, Santiago de Querétaro',
    superficieM2: 660,
    frenteM: 22,
    fondoM: 30,
    usoSuelo: 'H2 (Habitacional hasta 200 hab/ha)',
    loteMinimoM2: 180,
    frenteMinimoM: 9,
    alturaMaximaNiveles: 3,
    alturaMaximaM: 10.5,
    casPct: 10,
    casM2: 66,
    cosPct: 60,
    cosM2: 396,
    cusVeces: 1.8,
    cusM2: 1_188,
  },
};

// Alias por ambigüedad de nombre solicitada en el brief ("predio / zoning").
export const zoning = predio;
