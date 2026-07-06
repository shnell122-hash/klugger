'use client';

import React, { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Circle, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Tier = 'bajo' | 'medio' | 'alto' | 'premium';

interface MapboxMapProps {
  // Los 537/537 comps de terrenos_full.json llegan aquí — ver el memo
  // propertyPoints en HbuTab.tsx. Cada punto trae su tier de precio
  // (cuartil de $/m² sobre todo el universo de comps) y su precisión real
  // de geocodificación, para que este componente pueda dibujar cada uno
  // honestamente en vez de inventar posiciones o fingir precisión uniforme.
  propertyPoints: Array<{
    lat: number; lng: number; price: number; size: number;
    title: string; location: string; ppm: number;
    tier: Tier; geoPrecision: string; isApprox: boolean;
  }>;
  fmtMoney: (n: number) => string;
}

// Coordenadas reales geocodificadas del predio objeto — Lic. Carlos Septién
// García 53, Col. Cimatario (antes se usaba un hardcode aproximado
// [20.5725, -100.3925]; este es el resultado real de geocodificación).
const TARGET: [number, number] = [20.5822759, -100.3887838];

// Rampa secuencial de un solo tono (violeta = --brand-violet, el "data
// accent" designado en globals.css para acentos de gráficas) para los 4
// tiers de $/m² por cuartil — light→dark, más oscuro = más caro. Reemplaza
// los 3 umbrales fijos rojo/ámbar/verde que antes reutilizaban --danger y
// --accent-amber de forma decorativa (esos tokens están reservados a
// semántica "malo"/"advertencia" en globals.css, nunca a "terreno caro").
// Validada como rampa ordinal de un solo tono (monotonía de luminosidad,
// separación perceptual entre pasos, extremo claro que no se funde con el
// fondo de mapa claro de OSM) con el validador de paletas del skill dataviz.
const TIER_COLORS: Record<Tier, string> = {
  bajo: '#c1a2f6',
  medio: '#9c69f1',
  alto: '#732dec',
  premium: '#5412c4',
};

const TIER_LABELS: Record<Tier, string> = {
  bajo: 'Bajo',
  medio: 'Medio',
  alto: 'Alto',
  premium: 'Premium',
};

const TIER_ORDER: Tier[] = ['bajo', 'medio', 'alto', 'premium'];

// Radio de referencia alrededor del predio objeto real — un círculo
// geométrico centrado en coordenadas conocidas, no un polígono dibujado a
// mano. Se conserva como la única "zona" del mapa porque es defendible: es
// pura distancia, no un límite de mercado inventado (ver feedback punto 10:
// "cuestionar las delimitaciones del mapa").
const HALO_RADIUS_M = 700;

export default function MapboxMap({ propertyPoints, fmtMoney }: MapboxMapProps) {
  // Custom divIcon para el pin ★ — no depende de los PNGs del bundle de
  // Leaflet. Migrado a --brand-green puro (#10b981); el gradiente anterior
  // mezclaba el neón heredado #00FF66, que globals.css marca como deuda de
  // prototipo a migrar oportunistamente en chrome que se toca.
  const starIcon = useMemo(() => L.divIcon({
    html: `<div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(145deg,#10b981,#059669);border:3px solid #fff;box-shadow:0 0 0 5px rgba(16,185,129,0.35),0 6px 18px rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;font-size:20px;color:#0a0a0f;cursor:pointer;user-select:none;">★</div>`,
    className: '',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -22],
  }), []);

  // Rangos reales de $/m² por tier + conteos de precisión, derivados de los
  // propios puntos recibidos — así la leyenda nunca se desincroniza de lo
  // que realmente se está pintando en el mapa.
  const legendData = useMemo(() => {
    const byTier: Record<Tier, number[]> = { bajo: [], medio: [], alto: [], premium: [] };
    let exactCount = 0;
    let approxCount = 0;
    for (const p of propertyPoints) {
      byTier[p.tier].push(p.ppm);
      if (p.isApprox) approxCount += 1; else exactCount += 1;
    }
    const ranges = TIER_ORDER.map(tier => {
      const vals = byTier[tier];
      if (vals.length === 0) return { tier, label: TIER_LABELS[tier], range: '—', n: 0 };
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      return { tier, label: TIER_LABELS[tier], range: `${Math.round(min).toLocaleString('es-MX')}–${Math.round(max).toLocaleString('es-MX')}`, n: vals.length };
    });
    return { ranges, exactCount, approxCount };
  }, [propertyPoints]);

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <MapContainer
        center={TARGET}
        zoom={14}
        style={{ height: '100%', width: '100%', borderRadius: 12 }}
        zoomControl
        scrollWheelZoom
      >
        {/* OpenStreetMap tiles — sin token, gratuito */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Único "halo" conservado: radio de referencia geométrico
            centrado en el predio objeto real. No es una zona de mercado
            inventada — es una distancia, y se etiqueta como tal. */}
        <Circle
          center={TARGET}
          radius={HALO_RADIUS_M}
          pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.05, weight: 1.5, dashArray: '6 4' }}
        >
          <Popup>
            <div style={{ fontSize: 11 }}>
              Radio de referencia ~{HALO_RADIUS_M} m alrededor del predio objeto.<br />
              <span style={{ color: '#888' }}>No es un límite de mercado — es solo distancia, para orientar qué comps están más cerca del bien valuado.</span>
            </div>
          </Popup>
        </Circle>

        {/* Comparables — círculos coloreados por tier de $/m² (cuartiles
            sobre todo el universo de 537 comps, ver HbuTab.tsx). La
            precisión de ubicación se distingue honestamente por tamaño y
            opacidad del marcador, no por color: los ~432 con precisión de
            calle (coords del listing o Google ROOFTOP/RANGE_INTERPOLATED)
            se pintan como puntos normales; los ~105 geocodificados solo a
            nivel colonia (APPROXIMATE/GEOMETRIC_CENTER) se pintan más
            pequeños, tenues y con borde punteado, y lo aclaran en su popup. */}
        {propertyPoints.map((p, i) => {
          const color = TIER_COLORS[p.tier];
          return (
            <CircleMarker
              key={i}
              center={[p.lat, p.lng]}
              radius={p.isApprox ? 3 : 5}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: p.isApprox ? 0.28 : 0.78,
                opacity: p.isApprox ? 0.55 : 0.95,
                weight: p.isApprox ? 1 : 1.2,
                dashArray: p.isApprox ? '2 2' : undefined,
              }}
            >
              <Popup>
                <div style={{ fontSize: 11, minWidth: 180 }}>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>{p.title}</div>
                  <div>{p.size} m² · {fmtMoney(p.price)}</div>
                  <div style={{ color, fontWeight: 700 }}>
                    ${p.ppm.toLocaleString('es-MX')}/m² · Tier {TIER_LABELS[p.tier]}
                  </div>
                  <div style={{ color: '#888', fontSize: 10 }}>{p.location}</div>
                  {p.isApprox && (
                    <div style={{ color: '#b8860b', fontSize: 10, marginTop: 4, fontStyle: 'italic' }}>
                      Ubicación aproximada (colonia) — geo_precision: {p.geoPrecision}
                    </div>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* Pin ★ del predio objeto — coords reales geocodificadas */}
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

      {/* Leyenda — superpuesta al mapa. Fondo opaco (sin .glass ni
          backdrop-filter) para no repetir el costo de blur sobre un mapa
          que ya re-pinta tiles constantemente al hacer pan/zoom. */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 1000,
          background: 'rgba(10,10,15,0.92)',
          border: '1px solid #1e1e2e',
          borderRadius: 10,
          padding: '10px 12px',
          fontSize: 10.5,
          color: '#e2e2f0',
          lineHeight: 1.55,
          maxWidth: 200,
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 11 }}>$/m² por cuartil</div>
        {legendData.ranges.map(r => (
          <div key={r.tier} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: TIER_COLORS[r.tier], flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{r.label}</span>
            <span style={{ color: '#888' }}>${r.range}</span>
          </div>
        ))}

        <div style={{ borderTop: '1px solid #1e1e2e', margin: '6px 0 5px' }} />
        <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 11 }}>Precisión</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#9c69f1', opacity: 0.95, flexShrink: 0 }} />
          <span style={{ flex: 1 }}>Exacta (calle)</span>
          <span style={{ color: '#888' }}>{legendData.exactCount}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#9c69f1', opacity: 0.4, border: '1px dashed #9c69f1', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>Aprox. (colonia)</span>
          <span style={{ color: '#888' }}>{legendData.approxCount}</span>
        </div>

        <div style={{ borderTop: '1px solid #1e1e2e', margin: '6px 0 5px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 10, flexShrink: 0 }}>★</span>
          <span>Predio objeto</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px dashed #10b981', flexShrink: 0 }} />
          <span>Radio ref. ~{HALO_RADIUS_M} m</span>
        </div>
      </div>
    </div>
  );
}
