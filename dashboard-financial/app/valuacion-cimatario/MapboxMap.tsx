'use client';

import React, { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polygon, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MapboxMapProps {
  // Solo comps con lat/lng real (geocodificados) llegan aquí — ver
  // propertyPoints en HbuTab.tsx. No se dibujan posiciones inventadas.
  propertyPoints: Array<{
    lat: number; lng: number; price: number; size: number;
    title: string; color: string; ppm: number; location: string;
  }>;
  fmtMoney: (n: number) => string;
}

// Coordenadas verificadas del predio objeto — Lic. Carlos Septién García 53, Col. Cimatario
const TARGET: [number, number] = [20.5725, -100.3925];

// Zonas del estudio de mercado (polígonos aproximados, fieles a calles reales del PDU Cimatario)
const ZONES = [
  {
    name: 'Cimatario — Expansión Alta HBU',
    color: '#10b981',
    coords: [[20.567, -100.401], [20.583, -100.401], [20.583, -100.378], [20.567, -100.378]] as [number, number][],
  },
  {
    name: '★ Bien Objeto (C. Septién 53)',
    color: '#00FF66',
    coords: [[20.571, -100.3945], [20.5745, -100.3945], [20.5745, -100.3905], [20.571, -100.3905]] as [number, number][],
  },
  {
    name: 'Cumbres / El Encino — Crecimiento moderado',
    color: '#f59e0b',
    coords: [[20.576, -100.415], [20.594, -100.415], [20.594, -100.395], [20.576, -100.395]] as [number, number][],
  },
  {
    name: 'Centro Sur — Estable',
    color: '#3b82f6',
    coords: [[20.558, -100.385], [20.578, -100.385], [20.578, -100.365], [20.558, -100.365]] as [number, number][],
  },
  {
    name: 'Periféricos saturados',
    color: '#ef4444',
    coords: [[20.553, -100.425], [20.568, -100.425], [20.568, -100.402], [20.553, -100.402]] as [number, number][],
  },
];

export default function MapboxMap({ propertyPoints, fmtMoney }: MapboxMapProps) {
  // Custom divIcon para el pin ★ — no depende de los PNGs del bundle de Leaflet
  const starIcon = useMemo(() => L.divIcon({
    html: `<div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(145deg,#00FF66,#10b981);border:3px solid #fff;box-shadow:0 0 0 5px rgba(16,185,129,0.35),0 6px 18px rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;font-size:20px;color:#0a0a0f;cursor:pointer;user-select:none;">★</div>`,
    className: '',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -22],
  }), []);

  return (
    <div style={{ height: '100%', width: '100%' }}>
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

        {/* Polígonos de zonas del estudio de mercado */}
        {ZONES.map(z => (
          <Polygon
            key={z.name}
            positions={z.coords}
            pathOptions={{
              color: z.color,
              fillColor: z.color,
              fillOpacity: z.color === '#00FF66' ? 0.28 : 0.16,
              weight: z.color === '#00FF66' ? 3 : 1.5,
              dashArray: z.color === '#00FF66' ? undefined : '5 3',
            }}
          >
            <Popup>
              <div style={{ fontSize: 12, fontWeight: 600, color: z.color }}>
                {z.name}
              </div>
            </Popup>
          </Polygon>
        ))}

        {/* Comparables — círculos coloreados por rango de $/m². Todos los
            puntos que llegan aquí traen lat/lng real de la fuente
            (terrenos_full.json); los comps sin geocodificación se excluyen
            antes de llegar a este componente en vez de mostrarse en una
            posición inventada. */}
        {propertyPoints.slice(0, 300).map((p, i) => (
          <CircleMarker
            key={i}
            center={[p.lat, p.lng]}
            radius={5}
            pathOptions={{
              color: p.color,
              fillColor: p.color,
              fillOpacity: 0.72,
              weight: 1,
            }}
          >
            <Popup>
              <div style={{ fontSize: 11, minWidth: 170 }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>{p.title}</div>
                <div>{p.size} m² · {fmtMoney(p.price)}</div>
                <div style={{ color: p.color, fontWeight: 600 }}>${p.ppm.toLocaleString('es-MX')}/m²</div>
                <div style={{ color: '#888', fontSize: 10 }}>{p.location}</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Pin ★ del predio objeto */}
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
    </div>
  );
}
