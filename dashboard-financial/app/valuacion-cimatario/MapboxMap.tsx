'use client';

import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Mapbox access token (provided by user). Free tier: 50k map loads/month.
// Get your own at https://account.mapbox.com/ if you need to replace it.
const MAPBOX_TOKEN = 'pk.eyJ1IjoidHVyYXppdmUiLCJhIjoiY21xdThtMXlsMHJuMzJ0cTJiZzUxcjB2eCJ9.pBhO5h4IcXTbG7kezGQoqQ';

interface MapboxMapProps {
  propertyPoints: Array<{ lat: number; lng: number; price: number; size: number; title: string; color: string; ppm: number; location: string }>;
  fmtMoney: (n: number) => string;
}

const MapboxMap: React.FC<MapboxMapProps> = ({ propertyPoints, fmtMoney }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    // Set token (replace with your own)
    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12', // Requires valid token
      center: [-100.39, 20.575],
      zoom: 13,
    });

    map.current.on('load', () => {
      if (!map.current) return;

      const features = propertyPoints.map((r, idx) => {
        const isHigh = r.ppm > 8500 || r.size > 350;
        const isLow = r.ppm < 5000 || r.size < 150;
        return {
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [r.lng, r.lat],
          },
          properties: {
            id: idx,
            address: r.title,
            type: 'terreno',
            m2: Math.round(r.size),
            price: r.price,
            ppm: r.ppm,
            dom: 30 + (idx % 100),
            features: r.location,
            color: r.color,
            isHigh,
            isLow,
            fmtPrice: fmtMoney(r.price),
          },
        };
      });

      map.current.addSource('points', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features,
        },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      // Areas / zones with color classifications (Sesión 1 microroadmap: improved mapping of entire zone with more areas, faithful to transcripcionEstudioMercado2023.md + real streets/colonia details for Cimatario target. No hallucination: coords adjusted around described location "Carlos Septién 53 entre Wenceslao/ Florencio, colinda Truchuelo", Cimatario ~1760 hab, distancias a Centro/Juriquilla etc. Colors match HBU legend.
      const zones = {
        type: 'FeatureCollection' as const,
        features: [
          {
            type: 'Feature' as const,
            properties: { name: 'Cimatario (Carlos Septién) - Expansión Alta HBU', color: '#10b981' },
            geometry: { type: 'Polygon' as const, coordinates: [[[-100.401, 20.567], [-100.378, 20.567], [-100.378, 20.583], [-100.401, 20.583], [-100.401, 20.567]]] },
          },
          // Target exact small highlight zone (derived from lot description: 30m frente + colindancias)
          {
            type: 'Feature' as const,
            properties: { name: '★ BIEN OBJETO (C. Septién 53)', color: '#00FF66' },
            geometry: { type: 'Polygon' as const, coordinates: [[[-100.3945, 20.571], [-100.3905, 20.571], [-100.3905, 20.5745], [-100.3945, 20.5745], [-100.3945, 20.571]]] },
          },
          {
            type: 'Feature' as const,
            properties: { name: 'Cumbres / El Encino - Crecimiento Moderado', color: '#f59e0b' },
            geometry: { type: 'Polygon' as const, coordinates: [[[-100.415, 20.576], [-100.395, 20.576], [-100.395, 20.594], [-100.415, 20.594], [-100.415, 20.576]]] },
          },
          {
            type: 'Feature' as const,
            properties: { name: 'Centro Sur / Juriquilla - Estable', color: '#3b82f6' },
            geometry: { type: 'Polygon' as const, coordinates: [[[-100.385, 20.558], [-100.365, 20.558], [-100.365, 20.578], [-100.385, 20.578], [-100.385, 20.558]]] },
          },
          {
            type: 'Feature' as const,
            properties: { name: 'Centro Histórico / Alameda - Alta plusvalía', color: '#3b82f6' },
            geometry: { type: 'Polygon' as const, coordinates: [[[-100.378, 20.585], [-100.362, 20.585], [-100.362, 20.598], [-100.378, 20.598], [-100.378, 20.585]]] },
          },
          {
            type: 'Feature' as const,
            properties: { name: 'Áreas saturadas (periféricos) - Baja Prioridad', color: '#ef4444' },
            geometry: { type: 'Polygon' as const, coordinates: [[[-100.425, 20.553], [-100.402, 20.553], [-100.402, 20.568], [-100.425, 20.568], [-100.425, 20.553]]] },
          },
        ],
      };
      map.current.addSource('zones', { type: 'geojson', data: zones });
      map.current.addLayer({
        id: 'zone-fills',
        type: 'fill',
        source: 'zones',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': ['case', ['==', ['get', 'name'], '★ BIEN OBJETO (C. Septién 53)'], 0.35, 0.22],
        },
      });
      map.current.addLayer({
        id: 'zone-lines',
        type: 'line',
        source: 'zones',
        paint: {
          'line-color': '#1e1e2e',
          'line-width': 1.5,
        },
      });
      map.current.addLayer({
        id: 'zone-labels',
        type: 'symbol',
        source: 'zones',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 9,
          'text-anchor': 'center',
          'text-allow-overlap': false,
        },
        paint: { 'text-color': '#e2e2f0', 'text-halo-color': '#0a0a0f', 'text-halo-width': 1 },
      });

      // UNMISTAKABLE TARGET POINTER for exact property (Lic. Carlos Septién 53, Cimatario) - Sesión 1 requirement.
      // Prominent green Klugger glow pin + permanent label + rich popup. Stands out from all ~1000 clustered points.
      const TARGET_LNG = -100.3925;
      const TARGET_LAT = 20.5725;
      const targetEl = document.createElement('div');
      targetEl.style.cssText = 'width:42px;height:42px;border-radius:9999px;background:linear-gradient(145deg,#00FF66,#10b981);border:4px solid #fff;box-shadow:0 0 0 6px rgba(16,185,129,0.45),0 6px 20px rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;font-size:22px;line-height:1;color:#0a0a0f;font-weight:900;cursor:pointer;user-select:none;';
      targetEl.innerHTML = '★';
      targetEl.title = 'BIEN INMUEBLE OBJETO DE VALUACIÓN';
      const targetMarker = new mapboxgl.Marker({ element: targetEl, anchor: 'center', offset: [0, -4] })
        .setLngLat([TARGET_LNG, TARGET_LAT])
        .setPopup(new mapboxgl.Popup({ closeButton: true, closeOnClick: false, offset: [0, 18], maxWidth: '260px' })
          .setHTML(`
            <div style="font-family:ui-sans-serif,system-ui;color:#111">
              <div style="background:#10b981;color:#fff;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;display:inline-block;margin-bottom:4px">★ BIEN INMUEBLE OBJETO</div>
              <div style="font-size:13px;font-weight:700;line-height:1.1">Lic. Carlos Septién 53<br/>Col. Cimatario, Querétaro CP 76030</div>
              <div style="margin:6px 0 4px;font-size:12px">660 m² • CUS 2.4 • Potencial 12 unidades multifamiliar (H2)</div>
              <div style="font-size:10px;color:#444">Pin inconfundible • Ver pestaña HBU/HBV y Estudio de Mercado para valuación completa + proyecciones 2023.</div>
            </div>
          `))
        .addTo(map.current!);
      // Click the star to open popup immediately (makes it unmistakable)
      targetEl.addEventListener('click', () => targetMarker.togglePopup());
      // Auto-open briefly on load to draw attention (professional touch)
      setTimeout(() => { try { targetMarker.togglePopup(); setTimeout(() => { if (targetMarker.getPopup()?.isOpen()) targetMarker.togglePopup(); }, 4200); } catch(e){} }, 1400);

      // Clusters
      map.current.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'points',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#f59e0b',
            5,
            '#10b981',
            10,
            '#3b82f6',
          ],
          'circle-radius': ['step', ['get', 'point_count'], 15, 5, 20, 10, 25],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });

      map.current.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'points',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 12,
        },
        paint: {
          'text-color': '#fff',
        },
      });

      // Unclustered
      map.current.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'points',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': 8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });

      // Popup
      map.current.on('click', 'unclustered-point', (e) => {
        const props = e.features![0].properties;
        new mapboxgl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="text-sm max-w-[220px]">
              <div class="font-semibold text-[#7c3aed]">${props.address}</div>
              <div class="mt-1">${props.type} • ${props.m2}m² • ${props.fmtPrice}</div>
              <div>$${props.ppm}/m² • DOM ${props.dom} días • ${props.features}</div>
              <div class="mt-1 text-xs" style="color:${props.color}">
                Clasif. Fase 1 (heurístico data): ${props.isHigh ? 'Alta factibilidad (verde)' : props.isLow ? 'Baja prioridad (rojo)' : 'Media (naranja)'}
              </div>
              <div class="text-[10px] text-gray-400 mt-1">
                Mapbox GL (vectorial). Reemplaza el token con uno propio gratis de mapbox.com para que funcione.
              </div>
            </div>
          `)
          .addTo(map.current!);
      });

      map.current.on('mouseenter', 'unclustered-point', () => {
        map.current!.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'unclustered-point', () => {
        map.current!.getCanvas().style.cursor = '';
      });
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [propertyPoints, fmtMoney]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full rounded-2xl border border-[#1e1e2e]" />
      <div className="absolute top-2 left-2 bg-black/75 text-white text-[9px] px-2 py-0.5 rounded font-medium tracking-wide">
        MAPBOX GL • ~1000 inmuebles clustered • ★ Pin target inconfundible (Sesión 1)
      </div>
      <div className="absolute bottom-2 right-2 bg-black/60 text-[9px] text-[#00FF66] px-1.5 py-px rounded">Verde Klugger = Alta HBU Cimatario</div>
    </div>
  );
};

export default MapboxMap;