'use client';

import React, { useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Circle, Marker, Rectangle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Mapa inteligente multicapa. Antes este componente solo pintaba los 537
// comps por tier de $/m². Feedback: "de qué sirve obtener Google Places si
// no lo mapeas" — hoy el proyecto ya recolecta 537 comps + land-score +
// growth-grid + 656 puntos de Google Places (anclas/competencia/consumo/
// equipamiento) + proyectos de inversión/polos de crecimiento, y ninguno de
// esos datos llegaba al mapa salvo los comps. Este archivo ahora importa
// TODO ese universo directamente (mismo patrón de import JSON que
// terrenos_full.json en HbuTab.tsx/DatabaseTab.tsx) y lo expone como capas
// toggleables, en vez de esperar a que quien invoque el componente se lo
// arme.
import terrenosFullRaw from './terrenos_full.json';
import landScoresRaw from './data/scores/land-scores.json';
import growthGridRaw from './data/scores/growth-grid.json';
import anclasRaw from './data/geo/anclas.json';
import competenciaRaw from './data/geo/competencia.json';
import consumoRaw from './data/geo/consumo-usuario.json';
import equipamientoRaw from './data/geo/equipamiento.json';
import inversionRaw from './data/geo/inversion-proyectos.json';

type Tier = 'bajo' | 'medio' | 'alto' | 'premium';

interface MapboxMapProps {
  // Firma histórica del componente — HbuTab.tsx sigue armando y pasando
  // propertyPoints/fmtMoney y no debe romperse. Este componente ya NO
  // depende de propertyPoints para pintar los comps (importa terrenos_full
  // + land-scores directamente y los une por `link`, ver `properties` más
  // abajo) porque necesita el land_score/percentil/rank que propertyPoints
  // no trae, pero conserva el parámetro para no cambiar cómo lo invocan.
  // fmtMoney sí se sigue usando, para que los montos en los popups respeten
  // el mismo formato (pesos enteros) que el resto del tab.
  propertyPoints: Array<{
    lat: number; lng: number; price: number; size: number;
    title: string; location: string; ppm: number;
    tier: Tier; geoPrecision: string; isApprox: boolean;
  }>;
  fmtMoney: (n: number) => string;
}

// Coordenadas reales geocodificadas del predio objeto — Lic. Carlos Septién
// García 53, Col. Cimatario.
const TARGET: [number, number] = [20.5822759, -100.3887838];

// ---------------------------------------------------------------------
// Paleta — restraint over variety (ver globals.css: un verde de marca, un
// violeta "data accent", ámbar/danger reservados a semántica de
// advertencia/error, todo lo demás es chrome neutro). Con 6 capas de
// puntos nuevas encima de los comps NO se inventan hues nuevos: las capas
// de Google Places se distinguen por ÍCONO (glifo) sobre una "chip"
// neutra, no por color de marca, y las dos familias de color reales
// (verde/violeta) quedan reservadas a lo que ya significan en el resto
// del dashboard — violeta = valor/score de los comps, verde = el predio
// objeto, "oportunidad" y crecimiento.
// ---------------------------------------------------------------------

type ScoreBand = 'q1' | 'q2' | 'q3' | 'q4';

const SCORE_BAND_COLORS: Record<ScoreBand, string> = {
  q1: '#c1a2f6',
  q2: '#9c69f1',
  q3: '#732dec',
  q4: '#5412c4',
};

const SCORE_BAND_LABELS: Record<ScoreBand, string> = {
  q1: 'Score bajo (P0–25)',
  q2: 'Score medio (P25–50)',
  q3: 'Score alto (P50–75)',
  q4: 'Score muy alto (P75–100)',
};

const SCORE_BAND_ORDER: ScoreBand[] = ['q1', 'q2', 'q3', 'q4'];

const TOP_DECILE_PERCENTIL = 90;

function scoreBand(percentil: number): ScoreBand {
  if (percentil < 25) return 'q1';
  if (percentil < 50) return 'q2';
  if (percentil < 75) return 'q3';
  return 'q4';
}

// Radio de referencia alrededor del predio objeto — geométrico, no un
// polígono de mercado dibujado a mano (feedback punto 10).
const HALO_RADIUS_M = 700;

// Subcategorías reales presentes en cada dataset de Google Places (ver
// anclas.json/competencia.json/consumo-usuario.json/equipamiento.json) →
// glifo + etiqueta en español. `????` de respaldo para cualquier subcat
// no prevista, para que un cambio de fuente nunca deje puntos sin ícono.
const FALLBACK_META = { emoji: '📍', label: '' };

const ANCLA_SUBCAT: Record<string, { emoji: string; label: string }> = {
  universidad: { emoji: '🎓', label: 'Universidad' },
  plaza_mall: { emoji: '🏬', label: 'Plaza / mall' },
  hospital: { emoji: '🏥', label: 'Hospital' },
  supermercado: { emoji: '🛒', label: 'Supermercado' },
  corporativo: { emoji: '🏢', label: 'Corporativo' },
};

const COMPETENCIA_SUBCAT: Record<string, { emoji: string; label: string }> = {
  coliving: { emoji: '🛌', label: 'Coliving' },
  estudiantil: { emoji: '🎒', label: 'Vivienda estudiantil' },
  multifamiliar_renta: { emoji: '🏙️', label: 'Multifamiliar en renta' },
};

const CONSUMO_SUBCAT: Record<string, { emoji: string; label: string }> = {
  coworking: { emoji: '💻', label: 'Coworking' },
  cafe_especialidad: { emoji: '☕', label: 'Café de especialidad' },
  gimnasio: { emoji: '💪', label: 'Gimnasio' },
  bar: { emoji: '🍸', label: 'Bar' },
  restaurante: { emoji: '🍽️', label: 'Restaurante' },
};

const EQUIPAMIENTO_SUBCAT: Record<string, { emoji: string; label: string }> = {
  educacion: { emoji: '📚', label: 'Educación' },
  salud: { emoji: '🩺', label: 'Salud' },
  parque: { emoji: '🌳', label: 'Parque' },
  transporte: { emoji: '🚌', label: 'Transporte' },
};

// Bordes de las "chips" de POI — dos tintes de la familia violeta
// (anclas/consumo, ligados a "info" como el resto del dashboard) y dos
// grises neutros (competencia/equipamiento, mismo espíritu que --muted:
// chrome, no color con significado). Nada de rojo/ámbar decorativo.
const LAYER_BORDER = {
  ancla: 'var(--brand-violet-light)',
  competencia: '#9a9ab0',
  consumo: 'var(--brand-violet)',
  equipamiento: '#5c6270',
  inversion: 'var(--brand-green)',
};

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDist(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '—';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function fmtRating(rating: number | null | undefined, userRatings: number | null | undefined): string | null {
  if (rating == null || !Number.isFinite(rating)) return null;
  const n = userRatings != null && Number.isFinite(userRatings) ? ` (${userRatings})` : '';
  return `★ ${rating.toFixed(1)}${n}`;
}

// Rango de opacidad de la capa de calor "Oportunidad" — un solo hue
// (verde de marca), 5 escalones de alfa por surface 0–100. Semi-
// transparente a propósito: es una superficie modelada (mismo insumo que
// alimenta k_growth del land-score), no un dato observado punto a punto.
function heatAlpha(surface: number): number {
  if (surface < 20) return 0.04;
  if (surface < 40) return 0.1;
  if (surface < 60) return 0.18;
  if (surface < 80) return 0.28;
  return 0.42;
}

const INTENSIDAD_RADIUS_M: Record<string, number> = { alta: 1400, media: 900, baja: 500 };

type LayerKey =
  | 'halo'
  | 'propiedades'
  | 'heat'
  | 'anclas'
  | 'competencia'
  | 'consumo'
  | 'equipamiento'
  | 'inversion';

export default function MapboxMap({ fmtMoney }: MapboxMapProps) {
  // Capas por defecto: solo lo que ya se mostraba antes (propiedades +
  // halo + ★). Todo lo demás (~2,300 puntos adicionales + 1,600 celdas de
  // grid) es opt-in — el mapa arranca con el mismo costo de render de
  // siempre y el usuario decide cuándo pagar el resto.
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    halo: true,
    propiedades: true,
    heat: false,
    anclas: false,
    competencia: false,
    consumo: false,
    equipamiento: false,
    inversion: false,
  });
  const toggle = (k: LayerKey) => setLayers((l) => ({ ...l, [k]: !l[k] }));

  const starIcon = useMemo(
    () =>
      L.divIcon({
        html: `<div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(145deg,#10b981,#059669);border:3px solid #fff;box-shadow:0 0 0 5px rgba(16,185,129,0.35),0 6px 18px rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;font-size:20px;color:#0a0a0f;cursor:pointer;user-select:none;">★</div>`,
        className: '',
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        popupAnchor: [0, -22],
      }),
    []
  );

  // Cache de divIcons por (emoji, borde, tamaño) — se construyen una sola
  // vez y se reusan en los ~650 puntos de Google Places, en vez de crear
  // un L.DivIcon nuevo por marcador en cada render.
  const iconCache = useMemo(() => {
    const cache = new Map<string, L.DivIcon>();
    return {
      get(emoji: string, border: string, size = 22): L.DivIcon {
        const key = `${emoji}|${border}|${size}`;
        let icon = cache.get(key);
        if (!icon) {
          icon = L.divIcon({
            html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:rgba(17,17,24,0.94);border:1.5px solid ${border};display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.52)}px;line-height:1;box-shadow:0 1px 4px rgba(0,0,0,0.55);">${emoji}</div>`,
            className: '',
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
            popupAnchor: [0, -size / 2 - 2],
          });
          cache.set(key, icon);
        }
        return icon;
      },
    };
  }, []);

  // ---- Propiedades: 537 comps de terrenos_full.json UNIDOS por `link`
  // con su land_score/percentil/rank de land-scores.json (feedback: antes
  // se coloreaba por cuartil de $/m², un dato que no dice nada de qué tan
  // BUENA es la compra; ahora se colorea por el score real que ya calcula
  // el modelo, y el top-decil — el 10% mejor para comprar — se resalta con
  // un borde verde). El join es 1:1 (537/537, verificado contra el
  // dataset) pero se conserva `excludedCount` por robustez ante filas sin
  // coords/precio/tamaño válidos o sin match de score.
  const { properties, excludedCount } = useMemo(() => {
    const scoreByLink = new Map<string, any>();
    for (const c of (landScoresRaw as any).comps as any[]) scoreByLink.set(c.link, c);
    const raw = terrenosFullRaw as any[];
    let excluded = 0;
    const list: Array<{
      key: string; lat: number; lng: number; price: number; size: number; ppm: number;
      title: string; location: string; geoPrecision: string; isApprox: boolean;
      score: number; percentil: number; rank: number; band: ScoreBand; topDecile: boolean; link: string;
    }> = [];
    raw.forEach((r: any, i: number) => {
      const lat = Number(r.lat);
      const lng = Number(r.lng);
      const price = Number(r.price) || 0;
      const size = Number(r.size_m2 ?? r.size) || 0;
      const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
      const sc = scoreByLink.get(r.link);
      if (!hasCoords || price <= 0 || size <= 0 || !sc) {
        excluded += 1;
        return;
      }
      const geoPrecision: string = r.geo_precision ?? 'EXACT';
      const isApprox = geoPrecision === 'APPROXIMATE' || geoPrecision === 'GEOMETRIC_CENTER';
      list.push({
        key: String(r.link ?? i),
        lat, lng, price, size,
        ppm: Math.round(price / size),
        title: String(r.title ?? r.address ?? `Terreno ${i + 1}`),
        location: String(r.location ?? 'Cimatario'),
        geoPrecision, isApprox,
        score: sc.score,
        percentil: sc.percentil,
        rank: sc.rank,
        band: scoreBand(sc.percentil),
        topDecile: sc.percentil >= TOP_DECILE_PERCENTIL,
        link: r.link,
      });
    });
    return { properties: list, excludedCount: excluded };
  }, []);

  const scoreLegend = useMemo(() => {
    const byBand: Record<ScoreBand, number[]> = { q1: [], q2: [], q3: [], q4: [] };
    let topDecileCount = 0;
    for (const p of properties) {
      byBand[p.band].push(p.score);
      if (p.topDecile) topDecileCount += 1;
    }
    const ranges = SCORE_BAND_ORDER.map((band) => {
      const vals = byBand[band];
      if (vals.length === 0) return { band, label: SCORE_BAND_LABELS[band], range: '—', n: 0 };
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      return { band, label: SCORE_BAND_LABELS[band], range: `${min.toFixed(0)}–${max.toFixed(0)}`, n: vals.length };
    });
    return { ranges, topDecileCount };
  }, [properties]);

  // ---- Grid de oportunidad (40×40 = 1,600 celdas). Cada celda se dibuja
  // como <Rectangle> sobre el renderer canvas del MapContainer
  // (preferCanvas) en vez de 1,600 <div> — el canvas de Leaflet agrupa
  // TODAS las capas vectoriales (rectángulos + círculos de comps) en un
  // único <canvas>, así que agregar 1,600 rectángulos no multiplica nodos
  // DOM ni cuesta más que un puñado de draw calls adicionales.
  const heatCells = useMemo(() => {
    const g = growthGridRaw as any;
    const halfLat = g.step.lat / 2;
    const halfLng = g.step.lng / 2;
    return (g.cells as any[]).map((c: any, i: number) => ({
      key: i,
      surface: c.surface as number,
      bounds: [
        [c.lat - halfLat, c.lng - halfLng],
        [c.lat + halfLat, c.lng + halfLng],
      ] as [[number, number], [number, number]],
    }));
  }, []);

  const anclas = anclasRaw as any[];
  const competencia = competenciaRaw as any[];
  const consumo = consumoRaw as any[];
  const equipamiento = equipamientoRaw as any[];

  const { proyectos, polos } = useMemo(() => {
    const inv = inversionRaw as any;
    const proyectosValidos = (inv.proyectos as any[]).filter(
      (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)
    );
    return { proyectos: proyectosValidos, polos: (inv.polos_crecimiento as any[]) ?? [] };
  }, []);

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <MapContainer
        center={TARGET}
        zoom={14}
        style={{ height: '100%', width: '100%', borderRadius: 12 }}
        zoomControl
        scrollWheelZoom
        preferCanvas
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Capa de calor "Oportunidad" — se dibuja primero para quedar
            debajo de todo lo demás. Superficie modelada (percentiles del
            mismo insumo k_growth que usa land-scores), no una medición
            directa — se aclara en la leyenda. */}
        {layers.heat &&
          heatCells.map((c) => (
            <Rectangle
              key={c.key}
              bounds={c.bounds}
              pathOptions={{
                stroke: false,
                fillColor: '#10b981',
                fillOpacity: heatAlpha(c.surface),
              }}
              interactive={false}
            />
          ))}

        {/* Polos de crecimiento (5) — anillo punteado verde, radio por
            intensidad declarada (alta/media/baja). Es zona inferida desde
            el estudio de mercado 2023, no un límite catastral; se aclara
            en el popup. */}
        {layers.inversion &&
          polos.map((p: any, i: number) => (
            <Circle
              key={`polo-${i}`}
              center={[p.lat, p.lng]}
              radius={INTENSIDAD_RADIUS_M[p.intensidad] ?? 700}
              pathOptions={{
                color: 'var(--brand-green)',
                fillColor: 'var(--brand-green)',
                fillOpacity: 0.06,
                weight: 1.5,
                dashArray: '5 5',
              }}
            >
              <Popup>
                <div style={{ fontSize: 11, minWidth: 200 }}>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>📈 {p.nombre}</div>
                  <div style={{ color: '#10b981', fontWeight: 700, fontSize: 10.5 }}>
                    Polo de crecimiento · intensidad {p.intensidad}
                  </div>
                  <div style={{ fontSize: 10, marginTop: 4, color: '#444', lineHeight: 1.4 }}>
                    {String(p.descripcion ?? '').slice(0, 220)}
                    {String(p.descripcion ?? '').length > 220 ? '…' : ''}
                  </div>
                  <div style={{ color: '#888', fontSize: 9.5, marginTop: 4 }}>
                    ~{fmtDist(haversineM(TARGET[0], TARGET[1], p.lat, p.lng))} del predio · Fuente: {p.fuente ?? 'estudio de mercado 2023'}
                  </div>
                </div>
              </Popup>
            </Circle>
          ))}

        {/* Único halo geométrico conservado: radio de referencia real
            centrado en el predio objeto (feedback punto 10). */}
        {layers.halo && (
          <Circle
            center={TARGET}
            radius={HALO_RADIUS_M}
            pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.05, weight: 1.5, dashArray: '6 4' }}
          >
            <Popup>
              <div style={{ fontSize: 11 }}>
                Radio de referencia ~{HALO_RADIUS_M} m alrededor del predio objeto.<br />
                <span style={{ color: '#888' }}>No es un límite de mercado — es solo distancia, para orientar qué está más cerca del bien valuado.</span>
              </div>
            </Popup>
          </Circle>
        )}

        {/* Anclas (312) — Google Places: universidad/plaza-mall/hospital/
            supermercado/corporativo. Chip neutra + glifo por subcat. */}
        {layers.anclas &&
          anclas.map((p: any) => {
            const meta = ANCLA_SUBCAT[p.subcat] ?? { ...FALLBACK_META, label: p.subcat };
            return (
              <Marker key={p.place_id} position={[p.lat, p.lng]} icon={iconCache.get(meta.emoji, LAYER_BORDER.ancla, 20)}>
                <Popup>
                  <PoiPopup p={p} meta={meta} categoryLabel="Ancla" />
                </Popup>
              </Marker>
            );
          })}

        {/* Competencia (54) — coliving/estudiantil/multifamiliar en renta. */}
        {layers.competencia &&
          competencia.map((p: any) => {
            const meta = COMPETENCIA_SUBCAT[p.subcat] ?? { ...FALLBACK_META, label: p.subcat };
            return (
              <Marker key={p.place_id} position={[p.lat, p.lng]} icon={iconCache.get(meta.emoji, LAYER_BORDER.competencia, 20)}>
                <Popup>
                  <PoiPopup p={p} meta={meta} categoryLabel="Competencia" />
                </Popup>
              </Marker>
            );
          })}

        {/* Consumo del usuario meta (163) — coworking/café/gimnasio/bar/
            restaurante: qué tan cerca vive el consumo del target del
            proyecto. */}
        {layers.consumo &&
          consumo.map((p: any) => {
            const meta = CONSUMO_SUBCAT[p.subcat] ?? { ...FALLBACK_META, label: p.subcat };
            return (
              <Marker key={p.place_id} position={[p.lat, p.lng]} icon={iconCache.get(meta.emoji, LAYER_BORDER.consumo, 18)}>
                <Popup>
                  <PoiPopup p={p} meta={meta} categoryLabel="Consumo" />
                </Popup>
              </Marker>
            );
          })}

        {/* Equipamiento (127) — educación/salud/parque/transporte. */}
        {layers.equipamiento &&
          equipamiento.map((p: any) => {
            const meta = EQUIPAMIENTO_SUBCAT[p.subcat] ?? { ...FALLBACK_META, label: p.subcat };
            return (
              <Marker key={p.place_id} position={[p.lat, p.lng]} icon={iconCache.get(meta.emoji, LAYER_BORDER.equipamiento, 18)}>
                <Popup>
                  <PoiPopup p={p} meta={meta} categoryLabel="Equipamiento" />
                </Popup>
              </Marker>
            );
          })}

        {/* Proyectos de inversión (13, con coords válidas) — obra pública
            y desarrollos privados citados en el estudio 2023. */}
        {layers.inversion &&
          proyectos.map((p: any, i: number) => (
            <Marker key={`proy-${i}`} position={[p.lat, p.lng]} icon={iconCache.get('🏗️', LAYER_BORDER.inversion, 22)}>
              <Popup>
                <div style={{ fontSize: 11, minWidth: 210, fontFamily: 'ui-sans-serif,system-ui' }}>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>{p.nombre}</div>
                  <div style={{ color: 'var(--brand-green)', fontWeight: 700, fontSize: 10.5 }}>{p.tipo}</div>
                  <div style={{ fontSize: 10.5, marginTop: 3 }}>
                    {p.monto_mdp != null ? `${fmtMoney(p.monto_mdp * 1_000_000)} (${p.monto_mdp} MDP)` : 'Monto no reportado en la fuente'}
                  </div>
                  <div style={{ color: '#888', fontSize: 10, marginTop: 2 }}>{p.ubicacion_texto}</div>
                  {p.cita_breve && (
                    <div style={{ fontSize: 9.5, marginTop: 4, fontStyle: 'italic', color: '#666', lineHeight: 1.35 }}>
                      "{String(p.cita_breve).slice(0, 180)}{String(p.cita_breve).length > 180 ? '…' : ''}"
                    </div>
                  )}
                  <div style={{ color: '#888', fontSize: 9.5, marginTop: 4 }}>
                    ~{fmtDist(haversineM(TARGET[0], TARGET[1], p.lat, p.lng))} del predio
                    {p.geo_precision ? ` · ubicación ${p.geo_precision}` : ''}
                    {p.fuente ? ` · Fuente: ${p.fuente}` : ''}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

        {/* Comparables (537) coloreados por land_score (rampa violeta,
            data accent), NO por $/m² — feedback: el precio solo no dice
            si conviene comprar. El top-decil (mejor 10% del score) se
            resalta con un borde/anillo verde adicional, "★ mejores para
            comprar". La precisión de ubicación sigue distinguiéndose
            honestamente por tamaño/opacidad, como antes. */}
        {layers.propiedades &&
          properties.map((p) => {
            const fill = SCORE_BAND_COLORS[p.band];
            return (
              <CircleMarker
                key={p.key}
                center={[p.lat, p.lng]}
                radius={(p.isApprox ? 3 : 5) + (p.topDecile ? 2 : 0)}
                pathOptions={{
                  color: p.topDecile ? '#10b981' : fill,
                  fillColor: fill,
                  fillOpacity: p.isApprox ? 0.28 : 0.8,
                  opacity: p.isApprox ? 0.55 : 0.95,
                  weight: p.topDecile ? 2.5 : p.isApprox ? 1 : 1.2,
                  dashArray: p.isApprox ? '2 2' : undefined,
                }}
              >
                <Popup>
                  <div style={{ fontSize: 11, minWidth: 195 }}>
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>
                      {p.topDecile && <span style={{ color: '#10b981' }}>★ TOP 10% · </span>}
                      {p.title}
                    </div>
                    <div>{p.size} m² · {fmtMoney(p.price)}</div>
                    <div style={{ color: fill, fontWeight: 700 }}>
                      ${p.ppm.toLocaleString('es-MX')}/m²
                    </div>
                    <div style={{ fontWeight: 600, marginTop: 3 }}>
                      Score {p.score.toFixed(1)} · percentil {p.percentil.toFixed(0)} · rank #{p.rank}/{properties.length}
                    </div>
                    <div style={{ color: '#888', fontSize: 10 }}>{p.location}</div>
                    {p.isApprox && (
                      <div style={{ color: '#b8860b', fontSize: 10, marginTop: 4, fontStyle: 'italic' }}>
                        Ubicación aproximada (colonia) — geo_precision: {p.geoPrecision}
                      </div>
                    )}
                    <a
                      href={p.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-block',
                        marginTop: 6,
                        padding: '4px 10px',
                        background: 'var(--brand-violet)',
                        color: '#fff',
                        borderRadius: 6,
                        fontSize: 10.5,
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      Ver listing original →
                    </a>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

        {/* Pin ★ del predio objeto — siempre visible, no es una capa
            toggleable. */}
        <Marker position={TARGET} icon={starIcon}>
          <Popup>
            <div style={{ fontFamily: 'ui-sans-serif,system-ui', minWidth: 210 }}>
              <div style={{ background: '#10b981', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, display: 'inline-block', marginBottom: 6 }}>
                ★ BIEN INMUEBLE OBJETO DE VALUACIÓN
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>
                Lic. Carlos Septién García 53<br />
                Col. Cimatario, Querétaro CP 76030
              </div>
              <div style={{ fontSize: 11, marginTop: 6, color: '#333', lineHeight: 1.5 }}>
                660 m² · Frente 22 m · Zonif. H2<br />
                CUS 1.8 (confirmado) | Listing CUS 2.4<br />
                <strong>Asking: $7,000,000 MXN</strong>
              </div>
            </div>
          </Popup>
        </Marker>
      </MapContainer>

      {/* Panel de capas + leyenda — fondo opaco (sin .glass ni
          backdrop-filter: el mapa ya repinta tiles constantemente al
          hacer pan/zoom, no hay que sumarle costo de blur). Scrollable
          porque con 8 capas + sub-leyendas no entra todo sin scroll en
          viewports chicos. */}
      <div className="map-legend-panel">
        <div className="map-legend-title">Capas</div>

        <label className="map-legend-row map-legend-locked">
          <input type="checkbox" checked disabled />
          <span className="map-legend-swatch" style={{ background: 'transparent' }}>★</span>
          <span style={{ flex: 1 }}>Predio objeto</span>
        </label>

        <label className="map-legend-row">
          <input type="checkbox" checked={layers.halo} onChange={() => toggle('halo')} />
          <span className="map-legend-swatch" style={{ border: '1.5px dashed #10b981', borderRadius: '50%' }} />
          <span style={{ flex: 1 }}>Radio ref. {HALO_RADIUS_M} m</span>
        </label>

        <label className="map-legend-row">
          <input type="checkbox" checked={layers.propiedades} onChange={() => toggle('propiedades')} />
          <span className="map-legend-swatch" style={{ background: 'var(--brand-violet)', borderRadius: '50%' }} />
          <span style={{ flex: 1 }}>Propiedades</span>
          <span className="map-legend-count">{properties.length}</span>
        </label>
        {layers.propiedades && (
          <div className="map-legend-sub">
            {scoreLegend.ranges.map((r) => (
              <div key={r.band} className="map-legend-row" style={{ paddingLeft: 4 }}>
                <span className="map-legend-swatch" style={{ background: SCORE_BAND_COLORS[r.band], borderRadius: '50%', width: 8, height: 8 }} />
                <span style={{ flex: 1 }}>{r.label}</span>
                <span className="map-legend-count">{r.n}</span>
              </div>
            ))}
            <div className="map-legend-row" style={{ paddingLeft: 4 }}>
              <span className="map-legend-swatch" style={{ border: '2px solid #10b981', borderRadius: '50%', width: 8, height: 8 }} />
              <span style={{ flex: 1 }}>★ Top 10% (mejor para comprar)</span>
              <span className="map-legend-count">{scoreLegend.topDecileCount}</span>
            </div>
            {excludedCount > 0 && (
              <div className="map-legend-note">{excludedCount} comps excluidos (sin coords/precio/score válido)</div>
            )}
          </div>
        )}

        <label className="map-legend-row">
          <input type="checkbox" checked={layers.heat} onChange={() => toggle('heat')} />
          <span className="map-legend-swatch" style={{ background: 'rgba(16,185,129,0.42)' }} />
          <span style={{ flex: 1 }}>Calor "Oportunidad"</span>
          <span className="map-legend-count">{heatCells.length} celdas</span>
        </label>
        {layers.heat && (
          <div className="map-legend-note">Superficie modelada 0–100 (mismo insumo que alimenta el land-score) — no es una medición directa punto a punto.</div>
        )}

        <label className="map-legend-row">
          <input type="checkbox" checked={layers.anclas} onChange={() => toggle('anclas')} />
          <span className="map-legend-swatch" style={{ border: `1.5px solid ${LAYER_BORDER.ancla}`, borderRadius: '50%' }} />
          <span style={{ flex: 1 }}>Anclas</span>
          <span className="map-legend-count">{anclas.length}</span>
        </label>
        {layers.anclas && (
          <div className="map-legend-sub">
            {Object.entries(ANCLA_SUBCAT).map(([k, m]) => (
              <div key={k} className="map-legend-row" style={{ paddingLeft: 4 }}>
                <span style={{ fontSize: 11 }}>{m.emoji}</span>
                <span style={{ flex: 1 }}>{m.label}</span>
              </div>
            ))}
          </div>
        )}

        <label className="map-legend-row">
          <input type="checkbox" checked={layers.competencia} onChange={() => toggle('competencia')} />
          <span className="map-legend-swatch" style={{ border: `1.5px solid ${LAYER_BORDER.competencia}`, borderRadius: '50%' }} />
          <span style={{ flex: 1 }}>Competencia</span>
          <span className="map-legend-count">{competencia.length}</span>
        </label>
        {layers.competencia && (
          <div className="map-legend-sub">
            {Object.entries(COMPETENCIA_SUBCAT).map(([k, m]) => (
              <div key={k} className="map-legend-row" style={{ paddingLeft: 4 }}>
                <span style={{ fontSize: 11 }}>{m.emoji}</span>
                <span style={{ flex: 1 }}>{m.label}</span>
              </div>
            ))}
          </div>
        )}

        <label className="map-legend-row">
          <input type="checkbox" checked={layers.consumo} onChange={() => toggle('consumo')} />
          <span className="map-legend-swatch" style={{ border: `1.5px solid ${LAYER_BORDER.consumo}`, borderRadius: '50%' }} />
          <span style={{ flex: 1 }}>Consumo usuario meta</span>
          <span className="map-legend-count">{consumo.length}</span>
        </label>
        {layers.consumo && (
          <div className="map-legend-sub">
            {Object.entries(CONSUMO_SUBCAT).map(([k, m]) => (
              <div key={k} className="map-legend-row" style={{ paddingLeft: 4 }}>
                <span style={{ fontSize: 11 }}>{m.emoji}</span>
                <span style={{ flex: 1 }}>{m.label}</span>
              </div>
            ))}
          </div>
        )}

        <label className="map-legend-row">
          <input type="checkbox" checked={layers.equipamiento} onChange={() => toggle('equipamiento')} />
          <span className="map-legend-swatch" style={{ border: `1.5px solid ${LAYER_BORDER.equipamiento}`, borderRadius: '50%' }} />
          <span style={{ flex: 1 }}>Equipamiento</span>
          <span className="map-legend-count">{equipamiento.length}</span>
        </label>
        {layers.equipamiento && (
          <div className="map-legend-sub">
            {Object.entries(EQUIPAMIENTO_SUBCAT).map(([k, m]) => (
              <div key={k} className="map-legend-row" style={{ paddingLeft: 4 }}>
                <span style={{ fontSize: 11 }}>{m.emoji}</span>
                <span style={{ flex: 1 }}>{m.label}</span>
              </div>
            ))}
          </div>
        )}

        <label className="map-legend-row">
          <input type="checkbox" checked={layers.inversion} onChange={() => toggle('inversion')} />
          <span className="map-legend-swatch" style={{ border: '1.5px solid var(--brand-green)', borderRadius: '50%' }} />
          <span style={{ flex: 1 }}>Inversión + polos</span>
          <span className="map-legend-count">{proyectos.length + polos.length}</span>
        </label>
        {layers.inversion && (
          <div className="map-legend-sub">
            <div className="map-legend-row" style={{ paddingLeft: 4 }}>
              <span style={{ fontSize: 11 }}>🏗️</span>
              <span style={{ flex: 1 }}>Proyecto de inversión</span>
              <span className="map-legend-count">{proyectos.length}</span>
            </div>
            <div className="map-legend-row" style={{ paddingLeft: 4 }}>
              <span style={{ fontSize: 11, color: '#10b981' }}>◌</span>
              <span style={{ flex: 1 }}>Polo de crecimiento (anillo, radio = intensidad)</span>
              <span className="map-legend-count">{polos.length}</span>
            </div>
          </div>
        )}

        <div className="map-legend-footer">
          Fuente: Google Places (anclas/competencia/consumo/equipamiento/inversión) · scoring propio (land-score/grid de oportunidad).
        </div>
      </div>

      <style jsx>{`
        .map-legend-panel {
          position: absolute;
          top: 10px;
          right: 10px;
          z-index: 1000;
          background: rgba(10, 10, 15, 0.94);
          border: 1px solid #1e1e2e;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 10.5px;
          color: #e2e2f0;
          line-height: 1.5;
          width: 210px;
          max-height: calc(100% - 20px);
          overflow-y: auto;
          animation: map-legend-in 260ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .map-legend-title {
          font-weight: 700;
          margin-bottom: 4px;
          font-size: 11px;
        }
        .map-legend-row {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 2px 0;
          cursor: pointer;
        }
        .map-legend-row input {
          flex-shrink: 0;
          cursor: pointer;
        }
        .map-legend-locked input {
          cursor: default;
        }
        .map-legend-swatch {
          width: 11px;
          height: 11px;
          flex-shrink: 0;
          display: inline-block;
        }
        .map-legend-count {
          color: #888;
          font-size: 10px;
          flex-shrink: 0;
        }
        .map-legend-sub {
          border-left: 1px solid #1e1e2e;
          margin: 2px 0 4px 5px;
          padding-left: 4px;
        }
        .map-legend-note {
          color: #888;
          font-size: 9.5px;
          font-style: italic;
          margin: 2px 0 4px 5px;
          line-height: 1.35;
        }
        .map-legend-footer {
          border-top: 1px solid #1e1e2e;
          margin-top: 6px;
          padding-top: 5px;
          color: #777;
          font-size: 9px;
          line-height: 1.4;
        }
        @keyframes map-legend-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .map-legend-panel { animation: none; }
        }
        @media (max-width: 640px) {
          .map-legend-panel { width: 165px; font-size: 9.5px; padding: 8px 9px; }
          .map-legend-title { font-size: 10px; }
        }
      `}</style>
    </div>
  );
}

// Popup compartido por anclas/competencia/consumo/equipamiento — mismo
// shape en las 4 fuentes de Google Places (name/categoria/subcat/lat/lng/
// dist_predio_m/rating/user_ratings/vicinity). Requisito: nombre +
// categoría + distancia al predio + rating si hay.
function PoiPopup({ p, meta, categoryLabel }: { p: any; meta: { emoji: string; label: string }; categoryLabel: string }) {
  const rating = fmtRating(p.rating, p.user_ratings);
  return (
    <div style={{ fontSize: 11, minWidth: 190, fontFamily: 'ui-sans-serif,system-ui' }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{meta.emoji} {p.name}</div>
      <div style={{ color: 'var(--brand-violet-light)', fontWeight: 700, fontSize: 10.5 }}>
        {categoryLabel} · {meta.label}
      </div>
      <div style={{ fontSize: 10.5, marginTop: 3 }}>{fmtDist(p.dist_predio_m)} del predio objeto</div>
      {rating && <div style={{ fontSize: 10.5 }}>{rating}</div>}
      {p.vicinity && <div style={{ color: '#888', fontSize: 10, marginTop: 2 }}>{p.vicinity}</div>}
      <div style={{ color: '#777', fontSize: 9, marginTop: 4 }}>Fuente: Google Places</div>
    </div>
  );
}
