#!/usr/bin/env node
/**
 * compute-scores.mjs
 * Implementación determinista de SCORING-SPEC.md (ver archivo hermano en este mismo directorio).
 * Sin dependencias externas: solo `fs`/`path`/`url` del core de Node y matemática pura.
 *
 * Contrato aplicado (instrucción explícita de la tarea, sobre-escribe el default de la spec):
 *   `data/geo/inversion-proyectos.json` YA EXISTE ⇒ se activa S7/growth con
 *   growth_included:true, kernel (R=4000, d0=800), tal como describe §1.6 de la spec.
 *   Con S7 activo, los pesos de §2.4 y §3.1 ya suman 1.00 sin necesidad de repartir peso.
 *
 * Determinismo: sin Math.random, sin red, sin Date.now() en los cálculos (solo se usa en meta
 * informativo). Orden estable: comps por `link` asc antes de cualquier desempate por score.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCORES_DIR = __dirname; // app/valuacion-cimatario/data/scores
const DATA_DIR = path.resolve(SCORES_DIR, ".."); // app/valuacion-cimatario/data
const GEO_DIR = path.join(DATA_DIR, "geo"); // app/valuacion-cimatario/data/geo
const APP_DIR = path.resolve(DATA_DIR, ".."); // app/valuacion-cimatario

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// ---------------------------------------------------------------------------
// 0. Carga de insumos
// ---------------------------------------------------------------------------
const terrenos = readJSON(path.join(APP_DIR, "terrenos_full.json"));
const anclasRaw = readJSON(path.join(GEO_DIR, "anclas.json"));
const competenciaRaw = readJSON(path.join(GEO_DIR, "competencia.json"));
const consumoRaw = readJSON(path.join(GEO_DIR, "consumo-usuario.json"));
const equipamientoRaw = readJSON(path.join(GEO_DIR, "equipamiento.json"));
const topologia = readJSON(path.join(DATA_DIR, "topologia-colindancias.json"));

const inversionPath = path.join(GEO_DIR, "inversion-proyectos.json");
const INVERSION_EXISTS = fs.existsSync(inversionPath);
const inversionRaw = INVERSION_EXISTS ? readJSON(inversionPath) : null;
const proyectosRaw = INVERSION_EXISTS ? inversionRaw.proyectos || [] : [];

const GROWTH_INCLUDED = INVERSION_EXISTS; // contrato §1.6 activado según instrucción de la tarea

// Predio (fuente autoritativa = topologia-colindancias.json.predio)
const PREDIO = {
  lat: topologia.predio.lat, // 20.5822759
  lng: topologia.predio.lng, // -100.3887838
  size_m2: 660,
  asking: 7000000,
};
PREDIO.ppm = PREDIO.asking / PREDIO.size_m2;

// ---------------------------------------------------------------------------
// Utilidades matemáticas
// ---------------------------------------------------------------------------
const R_EARTH = 6371000; // m
const OUTLIER_CAP_M = 50000;

function haversine(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dphi = toRad(lat2 - lat1);
  const dlambda = toRad(lng2 - lng1);
  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(Math.min(1, a)));
}

function percentile(sortedAsc, p) {
  const n = sortedAsc.length;
  if (n === 0) return null;
  if (n === 1) return sortedAsc[0];
  const idx = (p / 100) * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

// norm(x; X) = 100 * (#{v<x} + 0.5*#{v==x}) / |X|   -- rank-percentil, X ordenado asc
function normRank(x, sortedAsc) {
  const n = sortedAsc.length;
  if (n === 0) return null;
  // lowerBound: primer índice con valor >= x  => cuenta de v < x
  let lo = 0,
    hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  const countLess = lo;
  // upperBound: primer índice con valor > x => cuenta de v <= x
  lo = 0;
  hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  const countLessOrEq = lo;
  const countEqual = countLessOrEq - countLess;
  return (100 * (countLess + 0.5 * countEqual)) / n;
}

function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return percentile(s, 50);
}

// ---------------------------------------------------------------------------
// 0.1 Guarda de implementación obligatoria: haversine(predio, anclas[0]) == dist_predio_m
// ---------------------------------------------------------------------------
{
  const a0 = anclasRaw[0];
  const dCalc = haversine(PREDIO.lat, PREDIO.lng, a0.lat, a0.lng);
  const diff = Math.abs(dCalc - a0.dist_predio_m);
  if (a0.place_id !== "ChIJE6WgeO1F04UR4pa0m_kqupA") {
    console.warn(
      `[warn] anclas[0].place_id no es el esperado por la spec (${a0.place_id}); se continúa igual.`
    );
  }
  if (diff > 2) {
    throw new Error(
      `GUARDA FALLIDA (§0.1): haversine(predio, anclas[0]) = ${dCalc.toFixed(
        1
      )} m difiere de dist_predio_m=${a0.dist_predio_m} m en ${diff.toFixed(
        1
      )} m (> 2 m). Bug de implementación, deteniendo pipeline.`
    );
  }
  console.log(
    `[ok] guarda §0.1: haversine(predio, anclas[0]) = ${dCalc.toFixed(
      1
    )} m ≈ dist_predio_m = ${a0.dist_predio_m} m (diff ${diff.toFixed(2)} m)`
  );
}

// ---------------------------------------------------------------------------
// 0.2 Guardas de calidad — filtrado de POIs (guarda 1: coordenada implausible >50km)
// ---------------------------------------------------------------------------
function filterPois(list, label) {
  const kept = [];
  let discardedNullCoord = 0;
  let discardedFar = 0;
  for (const p of list) {
    if (p.lat == null || p.lng == null || Number.isNaN(p.lat) || Number.isNaN(p.lng)) {
      discardedNullCoord++;
      continue;
    }
    const d = haversine(PREDIO.lat, PREDIO.lng, p.lat, p.lng);
    if (d > OUTLIER_CAP_M) {
      discardedFar++;
      continue;
    }
    kept.push(p);
  }
  console.log(
    `[filter] ${label}: n_in=${list.length} n_kept=${kept.length} discarded_null_coord=${discardedNullCoord} discarded_far(>50km)=${discardedFar}`
  );
  return { kept, discardedNullCoord, discardedFar, nIn: list.length };
}

const anclasF = filterPois(anclasRaw, "anclas");
const competenciaF = filterPois(competenciaRaw, "competencia");
const consumoF = filterPois(consumoRaw, "consumo-usuario");
const equipamientoF = filterPois(equipamientoRaw, "equipamiento");
const inversionF = filterPois(proyectosRaw, "inversion-proyectos");

const anclas = anclasF.kept;
const competencia = competenciaF.kept;
const consumo = consumoF.kept;
const equipamiento = equipamientoF.kept;
const inversion = inversionF.kept;

// --- Ponderación por monto para el kernel de crecimiento (§1.6) ---
// "Si monto está disponible, ponderar el término del kernel por monto/mediana(monto) (cap a 3x)."
// Aquí el campo real es `monto_mdp` (parcial: varios proyectos no tienen monto reportado).
// Para los que no tienen monto -> peso 1 (conteo simple, sin invención de magnitud).
const montosDisponibles = inversion
  .map((p) => p.monto_mdp)
  .filter((m) => typeof m === "number" && m > 0);
const medianaMonto = montosDisponibles.length > 0 ? median(montosDisponibles) : null;
let growthAmountWeighted = false;
for (const p of inversion) {
  if (typeof p.monto_mdp === "number" && p.monto_mdp > 0 && medianaMonto) {
    p._growthWeight = clamp(p.monto_mdp / medianaMonto, 0, 3);
    growthAmountWeighted = true;
  } else {
    p._growthWeight = 1;
  }
}
console.log(
  `[growth] proyectos válidos=${inversion.length} con monto=${montosDisponibles.length} mediana_monto_mdp=${medianaMonto}`
);

// ---------------------------------------------------------------------------
// 0.2.2 Guarda: comps inválidos (price<=0, size_m2<=0, lat/lng nulos)
// ---------------------------------------------------------------------------
const N_COMPS_INPUT = terrenos.length;
const validComps = [];
let nInvalidComps = 0;
for (const c of terrenos) {
  if (
    !(typeof c.price === "number" && c.price > 0) ||
    !(typeof c.size_m2 === "number" && c.size_m2 > 0) ||
    c.lat == null ||
    c.lng == null
  ) {
    nInvalidComps++;
    continue;
  }
  validComps.push(c);
}
// Orden estable base por link asc (spec: "orden de iteración estable")
validComps.sort((a, b) => (a.link < b.link ? -1 : a.link > b.link ? 1 : 0));
console.log(
  `[comps] n_input=${N_COMPS_INPUT} n_valid=${validComps.length} n_invalid=${nInvalidComps}`
);

// ---------------------------------------------------------------------------
// Kernel de densidad ponderada por distancia (§1.1)
// K(punto, P; R, d0) = Σ_{p∈P, d<=R} 1/(1+d/d0)
// ---------------------------------------------------------------------------
function kernelSum(lat, lng, pois, R, d0, weightFn) {
  let s = 0;
  for (const p of pois) {
    const d = haversine(lat, lng, p.lat, p.lng);
    if (d > R) continue; // corte de radio
    const w = weightFn ? weightFn(p) : 1;
    s += w * (1 / (1 + d / d0));
  }
  return s;
}

const KERNELS = {
  ancla: { R: 3000, d0: 500 },
  consumo: { R: 1200, d0: 300 },
  equip: { R: 1000, d0: 300 },
  comp_sat: { R: 800, d0: 150 },
  comp_val: { R: 1500, d0: 400 },
  growth: { R: 4000, d0: 800 },
};

function computeRawKernels(lat, lng) {
  return {
    k_ancla: kernelSum(lat, lng, anclas, KERNELS.ancla.R, KERNELS.ancla.d0),
    k_consumo: kernelSum(lat, lng, consumo, KERNELS.consumo.R, KERNELS.consumo.d0),
    k_equip: kernelSum(lat, lng, equipamiento, KERNELS.equip.R, KERNELS.equip.d0),
    k_sat: kernelSum(lat, lng, competencia, KERNELS.comp_sat.R, KERNELS.comp_sat.d0),
    k_val: kernelSum(lat, lng, competencia, KERNELS.comp_val.R, KERNELS.comp_val.d0),
    k_growth: GROWTH_INCLUDED
      ? kernelSum(lat, lng, inversion, KERNELS.growth.R, KERNELS.growth.d0, (p) => p._growthWeight)
      : null,
  };
}

// ---------------------------------------------------------------------------
// Pase 1: kernels crudos + ppm sobre los 537 comps válidos (población de referencia X)
// ---------------------------------------------------------------------------
const compRaw = validComps.map((c) => {
  const ppm = c.price / c.size_m2;
  const k = computeRawKernels(c.lat, c.lng);
  return { comp: c, ppm, ...k };
});

const X_ppm = compRaw.map((r) => r.ppm).sort((a, b) => a - b);
const X_ancla = compRaw.map((r) => r.k_ancla).sort((a, b) => a - b);
const X_consumo = compRaw.map((r) => r.k_consumo).sort((a, b) => a - b);
const X_equip = compRaw.map((r) => r.k_equip).sort((a, b) => a - b);
const X_sat = compRaw.map((r) => r.k_sat).sort((a, b) => a - b);
const X_val = compRaw.map((r) => r.k_val).sort((a, b) => a - b);
const X_growth = GROWTH_INCLUDED ? compRaw.map((r) => r.k_growth).sort((a, b) => a - b) : null;

const ppm_p5 = percentile(X_ppm, 5);
const ppm_p95 = percentile(X_ppm, 95);
const ppm_p10 = percentile(X_ppm, 10);
const ppm_p25 = percentile(X_ppm, 25);
const ppm_p50 = percentile(X_ppm, 50);
const ppm_p75 = percentile(X_ppm, 75);
const ppm_p90 = percentile(X_ppm, 90);
const ppm_min = X_ppm[0];
const ppm_max = X_ppm[X_ppm.length - 1];

console.log(
  `[ppm] min=${ppm_min.toFixed(0)} p10=${ppm_p10.toFixed(0)} p25=${ppm_p25.toFixed(
    0
  )} mediana=${ppm_p50.toFixed(0)} p75=${ppm_p75.toFixed(0)} p90=${ppm_p90.toFixed(
    0
  )} p95=${ppm_p95.toFixed(0)} max=${ppm_max.toFixed(0)}  (cotas de spec: min 507, p10 4502, p25 7341, mediana 9002, p75 10917, p90 13961, max 104167)`
);
for (const [label, X] of [
  ["ancla(3000,500)", X_ancla],
  ["consumo(1200,300)", X_consumo],
  ["equip(1000,300)", X_equip],
  ["comp_sat(800,150)", X_sat],
]) {
  console.log(
    `[kernel] ${label}: min=${X[0].toFixed(2)} p5=${percentile(X, 5).toFixed(
      2
    )} mediana=${percentile(X, 50).toFixed(2)} p95=${percentile(X, 95).toFixed(
      2
    )} max=${X[X.length - 1].toFixed(2)}`
  );
}

// ---------------------------------------------------------------------------
// Subseñales normalizadas + comp_net (§1.3/§1.4) + surface (§1.5) + S1 (§2.1)
// ---------------------------------------------------------------------------
const W_SAT = 0.6;
const W_VAL = 0.3;

// Pesos de la superficie (§1.5). Si GROWTH_INCLUDED=false se reparte w_G entre {A,C,E,COMP}.
const SURFACE_W_BASE = { A: 0.3, C: 0.25, E: 0.15, COMP: 0.15, G: 0.15 };
function surfaceWeights(includeGrowth) {
  if (includeGrowth) return { ...SURFACE_W_BASE };
  const wG = SURFACE_W_BASE.G;
  const rest = 1 - wG; // 0.85
  return {
    A: SURFACE_W_BASE.A / rest,
    C: SURFACE_W_BASE.C / rest,
    E: SURFACE_W_BASE.E / rest,
    COMP: SURFACE_W_BASE.COMP / rest,
    G: 0,
  };
}
const SW = surfaceWeights(GROWTH_INCLUDED);

function computeSubscores(raw, ppm) {
  const A = normRank(raw.k_ancla, X_ancla);
  const C = normRank(raw.k_consumo, X_consumo);
  const E = normRank(raw.k_equip, X_equip);
  const sat = normRank(raw.k_sat, X_sat);
  const val = normRank(raw.k_val, X_val);
  const comp_net = clamp(50 - W_SAT * (sat - 50) + W_VAL * (val - 50), 0, 100);
  const G = GROWTH_INCLUDED ? normRank(raw.k_growth, X_growth) : null;

  const surface =
    SW.A * A + SW.C * C + SW.E * E + SW.COMP * comp_net + (GROWTH_INCLUDED ? SW.G * G : 0);

  // S1 con guarda de outlier de precio (winsorización [p5,p95])
  let s1Pct = normRank(ppm, X_ppm);
  const value_outlier = ppm < ppm_p5 || ppm > ppm_p95;
  if (value_outlier) {
    s1Pct = ppm < ppm_p5 ? normRank(ppm_p5, X_ppm) : normRank(ppm_p95, X_ppm);
  }
  const S1 = 100 - s1Pct;

  const S2 = surface;
  const S3 = C;
  const S4 = A;
  const S5 = E;
  const S6 = comp_net;
  const S7 = GROWTH_INCLUDED ? G : null;

  return {
    A,
    C,
    E,
    sat,
    val,
    comp_net,
    G,
    surface,
    S1,
    S2,
    S3,
    S4,
    S5,
    S6,
    S7,
    value_outlier,
  };
}

// ---------------------------------------------------------------------------
// Land score (§2.4) — pesos DEFAULT (con S7 activo, ya suman 1.00 sin reparto)
// ---------------------------------------------------------------------------
const LAND_W_BASE = { S1: 0.3, S2: 0.3, S3: 0.1, S4: 0.1, S5: 0.05, S6: 0.1, S7: 0.05 };
function landWeights(includeGrowth) {
  if (includeGrowth) return { ...LAND_W_BASE };
  const w7 = LAND_W_BASE.S7;
  const rest = 1 - w7; // 0.95
  const out = {};
  for (const k of ["S1", "S2", "S3", "S4", "S5", "S6"]) out[k] = LAND_W_BASE[k] / rest;
  out.S7 = 0;
  return out;
}
const LW = landWeights(GROWTH_INCLUDED);

function landScore(sub) {
  return (
    LW.S1 * sub.S1 +
    LW.S2 * sub.S2 +
    LW.S3 * sub.S3 +
    LW.S4 * sub.S4 +
    LW.S5 * sub.S5 +
    LW.S6 * sub.S6 +
    (GROWTH_INCLUDED ? LW.S7 * sub.S7 : 0)
  );
}

// ---------------------------------------------------------------------------
// Pase 2: subscores + land_score por comp
// ---------------------------------------------------------------------------
const compsScored = compRaw.map((r) => {
  const sub = computeSubscores(r, r.ppm);
  const score = landScore(sub);
  return { comp: r.comp, ppm: r.ppm, raw: r, sub, score };
});

// Orden: score desc, empate -> S1 desc, empate -> link asc
compsScored.sort((a, b) => {
  if (b.score !== a.score) return b.score - a.score;
  if (b.sub.S1 !== a.sub.S1) return b.sub.S1 - a.sub.S1;
  return a.comp.link < b.comp.link ? -1 : a.comp.link > b.comp.link ? 1 : 0;
});

const scoresSortedAsc = compsScored.map((c) => c.score).sort((a, b) => a - b);
compsScored.forEach((c, i) => {
  c.rank = i + 1; // 1-based, ya viene ordenado desc
  c.percentil = normRank(c.score, scoresSortedAsc);
});

// ---------------------------------------------------------------------------
// Predio: mismos subscores, insertado como consulta contra la misma X (no altera X)
// ---------------------------------------------------------------------------
const predioRawKernels = computeRawKernels(PREDIO.lat, PREDIO.lng);
const predioSub = computeSubscores(predioRawKernels, PREDIO.ppm);
const predioLandScoreDefaultW = landScore(predioSub); // score con pesos §2.4 (no es un "lente", solo informativo)

console.log(
  `[predio] ppm=${PREDIO.ppm.toFixed(0)} k_ancla=${predioRawKernels.k_ancla.toFixed(
    2
  )} k_consumo=${predioRawKernels.k_consumo.toFixed(2)} k_equip=${predioRawKernels.k_equip.toFixed(
    2
  )} k_sat=${predioRawKernels.k_sat.toFixed(2)} k_val=${predioRawKernels.k_val.toFixed(2)} k_growth=${
    predioRawKernels.k_growth != null ? predioRawKernels.k_growth.toFixed(2) : "null"
  }`
);
console.log(
  `[predio] S1=${predioSub.S1.toFixed(1)} S2(surface)=${predioSub.S2.toFixed(
    1
  )} S3=${predioSub.S3.toFixed(1)} S4=${predioSub.S4.toFixed(1)} S5=${predioSub.S5.toFixed(
    1
  )} S6=${predioSub.S6.toFixed(1)} S7=${predioSub.S7 != null ? predioSub.S7.toFixed(1) : "null"}`
);

// ---------------------------------------------------------------------------
// 3.1 Lentes — matrices de pesos (suman 1.00 c/u; con S7 activo no requieren reparto)
// ---------------------------------------------------------------------------
const LENS_WEIGHTS = {
  desarrollador: { S1: 0.1, S2: 0.25, S3: 0.1, S4: 0.1, S5: 0.05, S6: 0.25, S7: 0.15 },
  comprador: { S1: 0.25, S2: 0.15, S3: 0.25, S4: 0.1, S5: 0.2, S6: 0.05, S7: 0.0 },
  inversionista: { S1: 0.2, S2: 0.15, S3: 0.1, S4: 0.1, S5: 0.05, S6: 0.1, S7: 0.3 },
};

function lensScore(sub, w) {
  let s = 0;
  for (const k of ["S1", "S2", "S3", "S4", "S5", "S6", "S7"]) {
    const wi = w[k] || 0;
    if (wi === 0) continue;
    const si = sub[k];
    if (si == null) continue; // S7 null (no debería pasar con GROWTH_INCLUDED=true)
    s += wi * si;
  }
  return s;
}

// Re-rankear los 537 comps bajo cada lente (§3: "cada lente re-rankea los 537 con sus propios pesos")
const lensCompScores = {};
for (const lensName of Object.keys(LENS_WEIGHTS)) {
  const w = LENS_WEIGHTS[lensName];
  lensCompScores[lensName] = compsScored
    .map((c) => lensScore(c.sub, w))
    .sort((a, b) => a - b);
}

function weakestSubscore(sub, w) {
  // argmin_i( S_i * w_i ) considerando solo subscores con peso > 0 (un peso 0 no puede ser
  // "el punto más débil" porque no participa en el lente; ver nota de implementación en el reporte).
  let best = null;
  let bestVal = Infinity;
  for (const k of ["S1", "S2", "S3", "S4", "S5", "S6", "S7"]) {
    const wi = w[k] || 0;
    if (wi <= 0) continue;
    const si = sub[k];
    if (si == null) continue;
    const val = si * wi;
    if (val < bestVal) {
      bestVal = val;
      best = k;
    }
  }
  return { key: best, product: bestVal, raw: sub[best] };
}

const SUBSCORE_LABELS = {
  S1: "valor ($/m² relativo)",
  S2: "oportunidad de ubicación (surface)",
  S3: "consumo meta",
  S4: "ancla",
  S5: "equipamiento",
  S6: "competencia neta",
  S7: "crecimiento (inversión)",
};

const lentesOut = {};
for (const lensName of Object.keys(LENS_WEIGHTS)) {
  const w = LENS_WEIGHTS[lensName];
  const score = lensScore(predioSub, w);
  const sortedAsc = lensCompScores[lensName];
  const percentil = normRank(score, sortedAsc);
  const rankingEn537 = sortedAsc.filter((v) => v > score).length + 1; // posición si se insertara
  const p90 = percentile(sortedAsc, 90);
  const gapTopDecil = Math.max(0, p90 - score);
  const weakest = weakestSubscore(predioSub, w);
  lentesOut[lensName] = {
    score,
    percentil,
    ranking_en_537: rankingEn537,
    p90_comps: p90,
    gap_top_decil_pts: gapTopDecil,
    weakest_subscore: weakest.key,
    weakest_subscore_label: SUBSCORE_LABELS[weakest.key],
    weakest_subscore_value: weakest.raw,
    weights: w,
  };
  if (lensName === "comprador") lentesOut[lensName].safety_is_proxy = true;
  if (lensName === "inversionista") lentesOut[lensName].liquidity_is_proxy = true;
}

// mejor_lente = argmax de score
const mejorLenteName = Object.keys(lentesOut).reduce((best, k) =>
  lentesOut[k].score > lentesOut[best].score ? k : best
, Object.keys(lentesOut)[0]);
const mejor = lentesOut[mejorLenteName];

const veredictoTexto =
  `El predio es más atractivo para el perfil ${mejorLenteName} (score ${mejor.score.toFixed(
    1
  )}/100, percentil ${mejor.percentil.toFixed(1)} de 537). ` +
  `Su punto más débil bajo este lente es ${mejor.weakest_subscore_label} (${mejor.weakest_subscore_value.toFixed(
    1
  )} pts). ` +
  `Para entrar al top-decil necesitaría subir ~${mejor.gap_top_decil_pts.toFixed(
    1
  )} pts, principalmente vía ${mejor.weakest_subscore_label}.`;

// --- Modificadores no-geo (§3.1 desarrollador): doble fachada/esquina, frente amplio ---
// topologia-colindancias.json solo trae POIs adyacentes (nombre/tipo/lat/lng), NO geometría de
// lote (frente, esquina, fachadas). No es inferible de los datos disponibles -> modificador 0.
const topoModifierApplied = false;
const topoValuePts = 0;

// --- Liquidez proxy (inversionista): profundidad de comps válidos <=1500m del predio ---
const compsWithin1500 = validComps.filter(
  (c) => haversine(PREDIO.lat, PREDIO.lng, c.lat, c.lng) <= 1500
).length;

// ---------------------------------------------------------------------------
// Amenazas (§4) — threats.json
// ---------------------------------------------------------------------------
const threats = [];

// 1. competencia_cercana (<=500m del predio)
{
  const within500 = competencia
    .map((p) => ({ p, d: haversine(PREDIO.lat, PREDIO.lng, p.lat, p.lng) }))
    .filter((x) => x.d <= 500)
    .sort((a, b) => a.d - b.d);
  const n = within500.length;
  if (n > 0) {
    const dMin = within500[0].d;
    let severidad;
    if (n > 5 || dMin < 150) severidad = "alta";
    else if (n >= 3) severidad = "media";
    else severidad = "baja"; // n in [1,2]
    threats.push({
      tipo: "competencia_cercana",
      severidad,
      evidencia_numerica: {
        n,
        d_min_m: Math.round(dMin),
        refs: within500.map((x) => ({
          name: x.p.name,
          place_id: x.p.place_id,
          d_m: Math.round(x.d),
        })),
      },
    });
  }
}

// 2. saturacion_submercado (percentil de sat del predio)
{
  const satPercentil = predioSub.sat;
  let severidad = null;
  if (satPercentil > 85) severidad = "alta";
  else if (satPercentil >= 60) severidad = "media";
  else severidad = "baja";
  threats.push({
    tipo: "saturacion_submercado",
    severidad,
    evidencia_numerica: {
      sat_percentil: round1(satPercentil),
      k_sat: round2(predioRawKernels.k_sat),
    },
  });
}

// 3. dependencia_una_ancla (share ponderado por subcat sobre K_ancla del predio)
{
  const bySubcat = {};
  let total = 0;
  for (const p of anclas) {
    const d = haversine(PREDIO.lat, PREDIO.lng, p.lat, p.lng);
    if (d > KERNELS.ancla.R) continue;
    const term = 1 / (1 + d / KERNELS.ancla.d0);
    const subcat = p.subcat || "desconocido";
    bySubcat[subcat] = (bySubcat[subcat] || 0) + term;
    total += term;
  }
  let dominant = null;
  let dominantVal = -1;
  for (const [k, v] of Object.entries(bySubcat)) {
    if (v > dominantVal) {
      dominantVal = v;
      dominant = k;
    }
  }
  const share = total > 0 ? dominantVal / total : 0;

  // nearest_by_subcat: distancia mínima al POI más cercano de cada subcat (dentro de anclas kept)
  const nearestBySubcat = {};
  for (const p of anclas) {
    const d = haversine(PREDIO.lat, PREDIO.lng, p.lat, p.lng);
    const subcat = p.subcat || "desconocido";
    if (!(subcat in nearestBySubcat) || d < nearestBySubcat[subcat]) {
      nearestBySubcat[subcat] = d;
    }
  }
  for (const k of Object.keys(nearestBySubcat)) {
    nearestBySubcat[k] = Math.round(nearestBySubcat[k]);
  }

  let severidad;
  if (share > 0.65) severidad = "alta";
  else if (share >= 0.4) severidad = "media";
  else severidad = "baja";
  threats.push({
    tipo: "dependencia_una_ancla",
    severidad,
    evidencia_numerica: {
      subcat_dominante: dominant,
      share: round3(share),
      nearest_by_subcat: nearestBySubcat,
    },
  });
}

// 4. precio_sobre_banda
{
  const ppm = PREDIO.ppm;
  const percentilPpm = normRank(ppm, X_ppm);
  if (ppm > ppm_p50) {
    let severidad;
    if (ppm > ppm_p90) severidad = "alta";
    else if (ppm > ppm_p75) severidad = "media";
    else severidad = "baja"; // p50 - p75
    threats.push({
      tipo: "precio_sobre_banda",
      severidad,
      evidencia_numerica: {
        ppm: round0(ppm),
        p50: round0(ppm_p50),
        p75: round0(ppm_p75),
        p90: round0(ppm_p90),
        percentil: round1(percentilPpm),
      },
    });
  }
}

// 5. equipamiento_debil
{
  const ePercentil = predioSub.E;
  if (ePercentil <= 40) {
    let severidad;
    if (ePercentil < 10) severidad = "alta";
    else if (ePercentil < 25) severidad = "media";
    else severidad = "baja"; // 25-40
    threats.push({
      tipo: "equipamiento_debil",
      severidad,
      evidencia_numerica: {
        E_percentil: round1(ePercentil),
        k_equip: round2(predioRawKernels.k_equip),
      },
    });
  }
}

function round0(x) {
  return Math.round(x);
}
function round1(x) {
  return Math.round(x * 10) / 10;
}
function round2(x) {
  return Math.round(x * 100) / 100;
}
function round3(x) {
  return Math.round(x * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Growth grid (§1: growth_surface muestreada en malla ~40x40)
// ---------------------------------------------------------------------------
const GRID_N = 40;
const allLats = [...validComps.map((c) => c.lat), PREDIO.lat];
const allLngs = [...validComps.map((c) => c.lng), PREDIO.lng];
const bbox = {
  minLat: Math.min(...allLats),
  maxLat: Math.max(...allLats),
  minLng: Math.min(...allLngs),
  maxLng: Math.max(...allLngs),
};
const stepLat = (bbox.maxLat - bbox.minLat) / (GRID_N - 1);
const stepLng = (bbox.maxLng - bbox.minLng) / (GRID_N - 1);

const gridCells = [];
for (let i = 0; i < GRID_N; i++) {
  const lat = bbox.minLat + i * stepLat;
  for (let j = 0; j < GRID_N; j++) {
    const lng = bbox.minLng + j * stepLng;
    const raw = computeRawKernels(lat, lng);
    const sub = computeSubscores(raw, null /* ppm no aplica a puntos arbitrarios */);
    gridCells.push({ lat: round1lat(lat), lng: round1lat(lng), surface: round1(sub.surface) });
  }
}
function round1lat(x) {
  return Math.round(x * 1e6) / 1e6; // 6 decimales (~0.11 m) para no perder precisión geográfica
}

// ---------------------------------------------------------------------------
// Escritura de outputs
// ---------------------------------------------------------------------------
const meta = {
  generated_from: [
    "terrenos_full.json",
    "anclas.json",
    "competencia.json",
    "consumo-usuario.json",
    "equipamiento.json",
    ...(INVERSION_EXISTS ? ["inversion-proyectos.json"] : []),
  ],
  n_comps_input: N_COMPS_INPUT,
  n_comps_valid: validComps.length,
  n_comps_invalid: nInvalidComps,
  weights: LW,
  norm_mode: "percentile",
  growth_included: GROWTH_INCLUDED,
  growth_amount_weighted: growthAmountWeighted,
  kernels: {
    ancla: [KERNELS.ancla.R, KERNELS.ancla.d0],
    consumo: [KERNELS.consumo.R, KERNELS.consumo.d0],
    equip: [KERNELS.equip.R, KERNELS.equip.d0],
    comp_sat: [KERNELS.comp_sat.R, KERNELS.comp_sat.d0],
    comp_val: [KERNELS.comp_val.R, KERNELS.comp_val.d0],
    ...(GROWTH_INCLUDED ? { growth: [KERNELS.growth.R, KERNELS.growth.d0] } : {}),
  },
  poi_filter: {
    anclas: { n_in: anclasF.nIn, n_kept: anclas.length, discarded_far: anclasF.discardedFar, discarded_null: anclasF.discardedNullCoord },
    competencia: { n_in: competenciaF.nIn, n_kept: competencia.length, discarded_far: competenciaF.discardedFar, discarded_null: competenciaF.discardedNullCoord },
    consumo: { n_in: consumoF.nIn, n_kept: consumo.length, discarded_far: consumoF.discardedFar, discarded_null: consumoF.discardedNullCoord },
    equipamiento: { n_in: equipamientoF.nIn, n_kept: equipamiento.length, discarded_far: equipamientoF.discardedFar, discarded_null: equipamientoF.discardedNullCoord },
    inversion: { n_in: inversionF.nIn, n_kept: inversion.length, discarded_far: inversionF.discardedFar, discarded_null: inversionF.discardedNullCoord },
  },
};

const landScoresOut = {
  meta,
  comps: compsScored.map((c) => ({
    link: c.comp.link,
    lat: c.comp.lat,
    lng: c.comp.lng,
    price: c.comp.price,
    size_m2: c.comp.size_m2,
    ppm: round0(c.ppm),
    score: round2(c.score),
    subscores: {
      S1: round2(c.sub.S1),
      S2: round2(c.sub.S2),
      S3: round2(c.sub.S3),
      S4: round2(c.sub.S4),
      S5: round2(c.sub.S5),
      S6: round2(c.sub.S6),
      S7: c.sub.S7 != null ? round2(c.sub.S7) : null,
    },
    raw: {
      k_ancla: round2(c.raw.k_ancla),
      k_consumo: round2(c.raw.k_consumo),
      k_equip: round2(c.raw.k_equip),
      k_sat: round2(c.raw.k_sat),
      k_val: round2(c.raw.k_val),
      k_growth: c.raw.k_growth != null ? round2(c.raw.k_growth) : null,
    },
    flags: { value_outlier: c.sub.value_outlier },
    rank: c.rank,
    percentil: round2(c.percentil),
  })),
};

const predioScorecardOut = {
  predio: {
    lat: PREDIO.lat,
    lng: PREDIO.lng,
    size_m2: PREDIO.size_m2,
    asking: PREDIO.asking,
    ppm: round0(PREDIO.ppm),
  },
  surface: round2(predioSub.S2),
  subscores: {
    S1: round2(predioSub.S1),
    S2: round2(predioSub.S2),
    S3: round2(predioSub.S3),
    S4: round2(predioSub.S4),
    S5: round2(predioSub.S5),
    S6: round2(predioSub.S6),
    S7: predioSub.S7 != null ? round2(predioSub.S7) : null,
  },
  raw: {
    k_ancla: round2(predioRawKernels.k_ancla),
    k_consumo: round2(predioRawKernels.k_consumo),
    k_equip: round2(predioRawKernels.k_equip),
    k_sat: round2(predioRawKernels.k_sat),
    k_val: round2(predioRawKernels.k_val),
    k_growth: predioRawKernels.k_growth != null ? round2(predioRawKernels.k_growth) : null,
  },
  lentes: {
    desarrollador: {
      score: round2(lentesOut.desarrollador.score),
      percentil: round2(lentesOut.desarrollador.percentil),
      ranking_en_537: lentesOut.desarrollador.ranking_en_537,
      weakest: lentesOut.desarrollador.weakest_subscore,
      weakest_label: lentesOut.desarrollador.weakest_subscore_label,
      gap_top_decil_pts: round2(lentesOut.desarrollador.gap_top_decil_pts),
      veredicto:
        mejorLenteName === "desarrollador"
          ? veredictoTexto
          : `Score ${lentesOut.desarrollador.score.toFixed(1)}/100, percentil ${lentesOut.desarrollador.percentil.toFixed(
              1
            )} de 537. Punto más débil: ${lentesOut.desarrollador.weakest_subscore_label} (${lentesOut.desarrollador.weakest_subscore_value.toFixed(
              1
            )} pts).`,
    },
    comprador: {
      score: round2(lentesOut.comprador.score),
      percentil: round2(lentesOut.comprador.percentil),
      ranking_en_537: lentesOut.comprador.ranking_en_537,
      weakest: lentesOut.comprador.weakest_subscore,
      weakest_label: lentesOut.comprador.weakest_subscore_label,
      gap_top_decil_pts: round2(lentesOut.comprador.gap_top_decil_pts),
      veredicto:
        mejorLenteName === "comprador"
          ? veredictoTexto
          : `Score ${lentesOut.comprador.score.toFixed(1)}/100, percentil ${lentesOut.comprador.percentil.toFixed(
              1
            )} de 537. Punto más débil: ${lentesOut.comprador.weakest_subscore_label} (${lentesOut.comprador.weakest_subscore_value.toFixed(
              1
            )} pts).`,
      safety_is_proxy: true,
    },
    inversionista: {
      score: round2(lentesOut.inversionista.score),
      percentil: round2(lentesOut.inversionista.percentil),
      ranking_en_537: lentesOut.inversionista.ranking_en_537,
      weakest: lentesOut.inversionista.weakest_subscore,
      weakest_label: lentesOut.inversionista.weakest_subscore_label,
      gap_top_decil_pts: round2(lentesOut.inversionista.gap_top_decil_pts),
      veredicto:
        mejorLenteName === "inversionista"
          ? veredictoTexto
          : `Score ${lentesOut.inversionista.score.toFixed(1)}/100, percentil ${lentesOut.inversionista.percentil.toFixed(
              1
            )} de 537. Punto más débil: ${lentesOut.inversionista.weakest_subscore_label} (${lentesOut.inversionista.weakest_subscore_value.toFixed(
              1
            )} pts).`,
      liquidity_is_proxy: true,
      liquidity_n_comps_1500m: compsWithin1500,
    },
  },
  veredicto_texto: veredictoTexto,
  para_quien_es_mejor: mejorLenteName,
  modifiers: { topo_modifier_applied: topoModifierApplied, value_pts: topoValuePts },
  flags: {
    growth_included: GROWTH_INCLUDED,
    growth_amount_weighted: growthAmountWeighted,
    safety_is_proxy: true,
    liquidity_is_proxy: true,
  },
};

const growthGridOut = {
  bbox,
  step: { lat: stepLat, lng: stepLng },
  grid_n: GRID_N,
  meta: { growth_included: GROWTH_INCLUDED, norm_mode: "percentile" },
  cells: gridCells,
};

const top10 = compsScored.slice(0, 10).map((c) => ({
  link: c.comp.link,
  score: round2(c.score),
  rank: c.rank,
}));

const scoresReportOut = {
  generated_at_note: "sin timestamp en los cálculos (determinismo); ver este campo solo como metadato de ejecución",
  n_comps_input: N_COMPS_INPUT,
  n_comps_valid: validComps.length,
  n_comps_discarded_invalid: nInvalidComps,
  poi_discarded_outlier: meta.poi_filter,
  growth_included: GROWTH_INCLUDED,
  growth_amount_weighted: growthAmountWeighted,
  ppm_bands: {
    min: round0(ppm_min),
    p10: round0(ppm_p10),
    p25: round0(ppm_p25),
    mediana: round0(ppm_p50),
    p75: round0(ppm_p75),
    p90: round0(ppm_p90),
    p95: round0(ppm_p95),
    max: round0(ppm_max),
  },
  predio_percentiles_por_lente: {
    desarrollador: round2(lentesOut.desarrollador.percentil),
    comprador: round2(lentesOut.comprador.percentil),
    inversionista: round2(lentesOut.inversionista.percentil),
  },
  predio_score_por_lente: {
    desarrollador: round2(lentesOut.desarrollador.score),
    comprador: round2(lentesOut.comprador.score),
    inversionista: round2(lentesOut.inversionista.score),
  },
  mejor_lente: mejorLenteName,
  top10_por_score: top10,
  n_threats: threats.length,
};

fs.writeFileSync(path.join(SCORES_DIR, "land-scores.json"), JSON.stringify(landScoresOut, null, 2));
fs.writeFileSync(
  path.join(SCORES_DIR, "predio-scorecard.json"),
  JSON.stringify(predioScorecardOut, null, 2)
);
fs.writeFileSync(path.join(SCORES_DIR, "threats.json"), JSON.stringify(threats, null, 2));
fs.writeFileSync(path.join(SCORES_DIR, "growth-grid.json"), JSON.stringify(growthGridOut));
fs.writeFileSync(
  path.join(SCORES_DIR, "scores-report.json"),
  JSON.stringify(scoresReportOut, null, 2)
);

console.log("\n[done] archivos escritos en", SCORES_DIR);
for (const f of [
  "land-scores.json",
  "predio-scorecard.json",
  "threats.json",
  "growth-grid.json",
  "scores-report.json",
]) {
  const st = fs.statSync(path.join(SCORES_DIR, f));
  console.log(`  ${f}: ${(st.size / 1024).toFixed(1)} KB`);
}

// ---------------------------------------------------------------------------
// Validación contra el ejemplo trabajado de la spec (§6), usando growth_included:false
// para reproducir EXACTAMENTE las condiciones del ejemplo documentado (que asumía que
// inversion-proyectos.json no existía). Esto es solo un self-check, no altera los outputs.
// ---------------------------------------------------------------------------
console.log("\n=== VALIDACIÓN vs ejemplo trabajado de la spec (§6, con growth_included:false) ===");
{
  const savedGrowthIncluded = GROWTH_INCLUDED;
  // Recalcular localmente con growth forzado a false, reutilizando raw kernels ya calculados
  // (k_growth simplemente se ignora en estas fórmulas locales).
  const SWv = surfaceWeights(false);
  const LWv = landWeights(false);

  function subNoGrowth(raw, ppm) {
    const A = normRank(raw.k_ancla, X_ancla);
    const C = normRank(raw.k_consumo, X_consumo);
    const E = normRank(raw.k_equip, X_equip);
    const sat = normRank(raw.k_sat, X_sat);
    const val = normRank(raw.k_val, X_val);
    const comp_net = clamp(50 - W_SAT * (sat - 50) + W_VAL * (val - 50), 0, 100);
    const surface = SWv.A * A + SWv.C * C + SWv.E * E + SWv.COMP * comp_net;
    let s1Pct = normRank(ppm, X_ppm);
    if (ppm < ppm_p5) s1Pct = normRank(ppm_p5, X_ppm);
    else if (ppm > ppm_p95) s1Pct = normRank(ppm_p95, X_ppm);
    const S1 = 100 - s1Pct;
    return { S1, S2: surface, S3: C, S4: A, S5: E, S6: comp_net, sat, val };
  }
  function scoreNoGrowth(sub) {
    return (
      LWv.S1 * sub.S1 +
      LWv.S2 * sub.S2 +
      LWv.S3 * sub.S3 +
      LWv.S4 * sub.S4 +
      LWv.S5 * sub.S5 +
      LWv.S6 * sub.S6
    );
  }

  const comp0 = compRaw.find((r) => r.comp.link.endsWith("38-19d6af9-83b9-735e"));
  if (comp0) {
    const sub0 = subNoGrowth(comp0, comp0.ppm);
    const score0 = scoreNoGrowth(sub0);
    console.log(
      `comp0: ppm=${comp0.ppm.toFixed(0)} (spec 6500) k_ancla=${comp0.k_ancla.toFixed(
        2
      )} (spec 26.30) k_consumo=${comp0.k_consumo.toFixed(2)} (spec 13.01) k_equip=${comp0.k_equip.toFixed(
        2
      )} (spec 16.35) k_sat=${comp0.k_sat.toFixed(2)} (spec 0.84)`
    );
    console.log(
      `comp0: S1=${sub0.S1.toFixed(1)} (spec≈80) S4=${sub0.S4.toFixed(1)} (spec≈96) S3=${sub0.S3.toFixed(
        1
      )} (spec≈96) S5=${sub0.S5.toFixed(1)} (spec≈97) S6=${sub0.S6.toFixed(1)} (spec≈35) S2=${sub0.S2.toFixed(
        1
      )} (spec≈85) land_score=${score0.toFixed(1)} (spec≈81.1, tolerancia ±1.5 -> rango [79.6,82.6])`
    );
  } else {
    console.log("[warn] no se encontró el comp de ejemplo por sufijo de link");
  }

  const subP = subNoGrowth(predioRawKernels, PREDIO.ppm);
  const surfaceP = subP.S2;
  console.log(
    `predio: S1=${subP.S1.toFixed(1)} (spec≈27) S4=${subP.S4.toFixed(1)} (spec≈90) S3=${subP.S3.toFixed(
      1
    )} (spec≈88) S5=${subP.S5.toFixed(1)} (spec≈97) S6=${subP.S6.toFixed(1)} (spec≈46) surface(S2)=${surfaceP.toFixed(
      1
    )} (spec≈82.9-83, tolerancia ±1.5 -> [81.4,84.5])`
  );

  const lensDev = { S1: 0.1, S2: 0.25, S3: 0.1, S4: 0.1, S5: 0.05, S6: 0.25 };
  const lensUser = { S1: 0.25, S2: 0.15, S3: 0.25, S4: 0.1, S5: 0.2, S6: 0.05 };
  const lensInv = { S1: 0.2, S2: 0.15, S3: 0.1, S4: 0.1, S5: 0.05, S6: 0.1 };
  function renorm(w) {
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    const out = {};
    for (const k of Object.keys(w)) out[k] = w[k] / sum;
    return out;
  }
  function lensScoreNoGrowth(sub, w) {
    const wn = renorm(w);
    let s = 0;
    for (const k of Object.keys(wn)) s += wn[k] * sub[k];
    return s;
  }
  const devScore = lensScoreNoGrowth(subP, lensDev);
  const userScore = lensScoreNoGrowth(subP, lensUser);
  const invScore = lensScoreNoGrowth(subP, lensInv);
  console.log(
    `predio lentes (sin growth): desarrollador=${devScore.toFixed(1)} (spec≈67.7) comprador=${userScore.toFixed(
      1
    )} (spec≈71.9) inversionista=${invScore.toFixed(1)} (spec≈64.4) — tolerancia ±1.5`
  );

  console.log(
    `\n[nota] Los outputs finales (land-scores.json, predio-scorecard.json, etc.) usan growth_included:${savedGrowthIncluded} ` +
      `porque data/geo/inversion-proyectos.json SÍ EXISTE (contrato §1.6 activado por instrucción explícita de la tarea). ` +
      `Por eso S2/land_score/lentes de los outputs reales difieren de este bloque de validación (que fuerza growth_included:false ` +
      `únicamente para reproducir el ejemplo documentado en la spec).`
  );
}
