'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════════════
//  FinObra3DBuilding — HERO 3D del HBU (3 modelos de vivienda)
// ═══════════════════════════════════════════════════════════════════════
//  Reescrito para que `scenario` gobierne un MASSING reconocible distinto
//  por modelo (no una misma caja con distinto ancho), calidad inspirada en
//  finobra/src/preview/AnimationPreview.tsx + Session2.tsx: columnas I-beam
//  (flanges + web), losas con EdgesGeometry, rebar naranja emissive, glass
//  translúcido, materiales MeshStandardMaterial (metalness/roughness),
//  iluminación key+fill+rim con fog, reveal progresivo por piso vía
//  useFrame, y órbita lenta con ease. Paleta FinObra (void/orange/blue/
//  cream) + acento verde Klugger (#00FF66 / #10b981), sin logos.
//
//  Los 3 massings (lote real 660 m², 22×30 m, doble fachada — escala del
//  set: 1 unidad three.js ≈ 2 m, huella del lote = 11×15 unidades):
//
//   · mixto (Híbrido co-living, recomendación del HBU): volumen ESCALONADO
//     de 3 franjas — base ancha de townhouses (2 niveles, huella completa
//     del lote), cuerpo de lofts (setback, 1-2 niveles) y remate de
//     studios (setback mayor, 1 nivel) con terrazas/planters en cada
//     retranqueo. Lee "usos mixtos" a golpe de vista.
//
//   · max (Vertical / torre): footprint chico (~5×6 m) centrado en una
//     plaza que ocupa el resto del lote, con 8-12 niveles de curtain wall
//     de vidrio en las 4 caras y remate de penthouse + antena. Lee
//     "densidad vertical".
//
//   · residencial (Horizontal / townhouses): 3-5 volúmenes SEPARADOS
//     (huecos visibles entre ellos) en hilera sobre el ancho del lote,
//     2-3 niveles cada uno, jardín trasero compartido. Lee "baja densidad
//     horizontal".
// ═══════════════════════════════════════════════════════════════════════

// ── Tokens ────────────────────────────────────────────────────────────
const C = {
  void: '#020C1B',
  orange: '#FF6B00',
  green: '#00FF66',
  blue: '#2A4A70',
  cream: '#F7F4EF',
  muted: '#6B7C93',
  red: '#FF3B30',
} as const;

type Scenario = 'residencial' | 'mixto' | 'max';

interface FinObra3DBuildingProps {
  floors: number;
  units: number;
  scenario: Scenario;
  anim: boolean;
}

// Lote real Cimatario: 660 m² (22 × 30 m, doble fachada). 1 unidad de
// escena ≈ 2 m reales → huella del lote = 11 × 15 unidades. Los 3
// massings parten de esta misma huella para que la escala sea coherente
// entre modelos (torre = huella chica dentro del lote; mixto/horizontal
// = huella que ocupa el lote).
const LOT_W = 11; // 22 m
const LOT_D = 15; // 30 m

// Geometría unitaria compartida (reescalada por mesh.scale en cada
// instancia) — se crea UNA sola vez al importar el módulo, nunca dentro
// de useFrame ni por render; evita crear una BoxGeometry/EdgesGeometry
// distinta por cada losa/columna/panel.
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_EDGES = new THREE.EdgesGeometry(UNIT_BOX);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

// Materiales compartidos (module scope, creados una vez). Los que llevan
// "pulse" se mutan (emissiveIntensity) dentro de useFrame — es la técnica
// que ya usa finobra/src/preview/Session2.tsx para animar sin recrear
// materiales por frame.
const MAT_COL = new THREE.MeshStandardMaterial({ color: '#5A8FC0', emissive: '#1A3A60', emissiveIntensity: 0.7, metalness: 0.85, roughness: 0.25 });
const MAT_COL_TOWER = new THREE.MeshStandardMaterial({ color: '#8FBFE0', emissive: '#123A55', emissiveIntensity: 0.8, metalness: 0.9, roughness: 0.2 });
const MAT_COL_HOUSE = new THREE.MeshStandardMaterial({ color: '#6B8CAE', emissive: '#20344A', emissiveIntensity: 0.55, metalness: 0.7, roughness: 0.35 });
const MAT_SLAB = new THREE.MeshStandardMaterial({ color: '#8AABCC', roughness: 0.85, metalness: 0.05, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
const MAT_SLAB_WARM = new THREE.MeshStandardMaterial({ color: '#C7B79A', roughness: 0.92, metalness: 0.02, side: THREE.DoubleSide }); // estuco cálido townhouses
const MAT_REBAR = new THREE.MeshStandardMaterial({ color: '#FF6B00', emissive: '#CC3300', emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.4 });
const MAT_ACCENT_GREEN = new THREE.MeshStandardMaterial({ color: C.green, emissive: C.green, emissiveIntensity: 0.55, metalness: 0.5, roughness: 0.35 });
const MAT_ROOF = new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.35, roughness: 0.55 });
const MAT_GROUND = new THREE.MeshLambertMaterial({ color: '#151b26' });
const MAT_PLAZA = new THREE.MeshLambertMaterial({ color: '#182a20' }); // plaza/jardín (verdoso, torre y jardín trasero townhouses)
// Glass: DoubleSide para que las 4 caras de la torre (curtain wall) se
// vean sin importar el signo exacto de la rotación del panel.
const MAT_GLASS = new THREE.MeshPhongMaterial({ color: '#a5f3fc', transparent: true, opacity: 0.34, shininess: 90, side: THREE.DoubleSide });
const MAT_GLASS_TOWER = new THREE.MeshPhongMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.42, shininess: 100, side: THREE.DoubleSide });
const MAT_GLASS_DOOR = new THREE.MeshPhongMaterial({ color: '#ffd9a5', transparent: true, opacity: 0.55, shininess: 60, side: THREE.DoubleSide });

const EDGE_ORANGE = new THREE.LineBasicMaterial({ color: C.orange, transparent: true, opacity: 0.75 });
const EDGE_GREEN = new THREE.LineBasicMaterial({ color: C.green, transparent: true, opacity: 0.85 });
const EDGE_BLUE = new THREE.LineBasicMaterial({ color: '#4A9AFF', transparent: true, opacity: 0.85 });

// ── Helpers geométricos reutilizables (mesh/edges vía geometría unitaria)
function Box({ w, h, d, x = 0, y = 0, z = 0, material }: { w: number; h: number; d: number; x?: number; y?: number; z?: number; material: THREE.Material }) {
  return <mesh geometry={UNIT_BOX} material={material} position={[x, y, z]} scale={[w, h, d]} />;
}
function BoxEdges({ w, h, d, x = 0, y = 0, z = 0, material }: { w: number; h: number; d: number; x?: number; y?: number; z?: number; material: THREE.Material }) {
  return <lineSegments geometry={UNIT_EDGES} material={material} position={[x, y, z]} scale={[w, h, d]} />;
}
// Panel de vidrio: `w` es el ancho en el plano de la fachada (para left/
// right ese "ancho" corre a lo largo de Z, es decir la profundidad `d`).
function GlassPanel({ w, h, x = 0, y = 0, z = 0, rotY = 0, material }: { w: number; h: number; x?: number; y?: number; z?: number; rotY?: number; material: THREE.Material }) {
  return <mesh geometry={UNIT_PLANE} material={material} position={[x, y, z]} rotation={[0, rotY, 0]} scale={[w, h, 1]} />;
}

// Columna I-beam detallada (flanges + web + edges verdes) — inspirada en
// AnimationPreview.tsx, parametrizada para reusarse en los 3 massings.
function IBeamColumn({ x, z, h, material = MAT_COL, tint = EDGE_GREEN, flangeW = 0.5 }: { x: number; z: number; h: number; material?: THREE.Material; tint?: THREE.Material; flangeW?: number }) {
  const flangeT = 0.11;
  const webT = 0.16;
  return (
    <group>
      <Box w={flangeT} h={h} d={flangeW} x={x - 0.22} y={h / 2} z={z} material={material} />
      <Box w={flangeT} h={h} d={flangeW} x={x + 0.22} y={h / 2} z={z} material={material} />
      <Box w={webT} h={h} d={0.2} x={x} y={h / 2} z={z} material={MAT_REBAR} />
      <BoxEdges w={flangeW} h={h} d={flangeW} x={x} y={h / 2} z={z} material={tint} />
    </group>
  );
}

function Planter({ x, z }: { x: number; z: number }) {
  return (
    <group>
      <Box w={0.32} h={0.42} d={0.32} x={x} y={0.21} z={z} material={MAT_ROOF} />
      <BoxEdges w={0.32} h={0.42} d={0.32} x={x} y={0.21} z={z} material={EDGE_GREEN} />
    </group>
  );
}

// Trabajador esquemático (cuerpo/cabeza/brazo) — flavor de obra, animado
// sutilmente en `anim`, mismo espíritu que AnimationPreview.tsx.
function Worker({ px, pz, phase, anim }: { px: number; pz: number; phase: number; anim: boolean }) {
  const armRef = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (!armRef.current) return;
    const t = clock.getElapsedTime();
    armRef.current.position.y = 0.78 + (anim ? Math.sin(t * 4 + phase * 3) * 0.12 : 0);
  });
  return (
    <group position={[px, 0, pz]} rotation={[0, phase * 1.7, 0]}>
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.11, 0.14, 0.62, 6]} />
        <meshLambertMaterial color="#334155" />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshLambertMaterial color="#e2e8f0" />
      </mesh>
      <mesh ref={armRef} position={[0.18, 0.78, 0]}>
        <boxGeometry args={[0.05, 0.36, 0.05]} />
        <meshStandardMaterial color={C.green} emissive={C.green} emissiveIntensity={anim ? 0.5 : 0.1} />
      </mesh>
    </group>
  );
}

// ── Slice reveal timing helpers ─────────────────────────────────────────
function easeOutCubic(t: number) {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 2.5);
}

type GlassSide = 'front' | 'back' | 'left' | 'right';

interface SliceGroupProps {
  index: number;
  y: number;
  h: number;
  w: number;
  d: number;
  slabMat: THREE.Material;
  colMat?: THREE.Material;
  colTint?: THREE.Material;
  glassMat?: THREE.Material;
  glassSides?: GlassSide[];
  dividers?: number;
  edgeMat?: THREE.Material;
  midColumns?: boolean;
  revealRef: React.MutableRefObject<number>;
  stagger: number;
  duration: number;
  prefersReduced: boolean;
}

// Bloque genérico reutilizado por los 3 massings: una "rebanada" (piso de
// townhouse/loft/studio, piso de torre, o unidad de conjunto horizontal)
// con losa+edges, columnas I-beam en 4 esquinas (+ centrales si es ancha),
// haz de rebar y paneles de vidrio en las caras indicadas. El reveal
// progresivo (piso por piso) escala el grupo en Y con pivote en su propia
// base — así "crece" desde la losa hacia arriba sin recrear geometría.
function SliceGroup({
  index, y, h, w, d, slabMat, colMat = MAT_COL, colTint = EDGE_GREEN,
  glassMat, glassSides = [], dividers = 0, edgeMat = EDGE_ORANGE, midColumns,
  revealRef, stagger, duration, prefersReduced,
}: SliceGroupProps) {
  const ref = useRef<THREE.Group>(null!);

  useFrame(() => {
    if (!ref.current) return;
    if (prefersReduced) { ref.current.scale.y = 1; return; }
    const raw = (revealRef.current - index * stagger) / duration;
    ref.current.scale.y = Math.max(0.001, easeOutCubic(raw));
  });

  const corners: [number, number][] = [
    [-w / 2 + 0.45, -d / 2 + 0.45], [-w / 2 + 0.45, d / 2 - 0.45],
    [w / 2 - 0.45, -d / 2 + 0.45], [w / 2 - 0.45, d / 2 - 0.45],
  ];

  return (
    <group ref={ref} position={[0, y, 0]}>
      <Box w={w} h={0.2} d={d} y={0.1} material={slabMat} />
      <BoxEdges w={w} h={0.2} d={d} y={0.1} material={edgeMat} />

      {corners.map(([cx, cz], i) => (
        <IBeamColumn key={i} x={cx} z={cz} h={h} material={colMat} tint={colTint} />
      ))}
      {midColumns && ([[0, -d / 2 + 0.45], [0, d / 2 - 0.45]] as [number, number][]).map(([cx, cz], i) => (
        <IBeamColumn key={`mid-${i}`} x={cx} z={cz} h={h} material={colMat} tint={colTint} />
      ))}

      <Box w={Math.max(0.4, w - 1)} h={0.15} d={0.15} y={h * 0.55} material={MAT_REBAR} />

      {glassMat && glassSides.includes('front') && <GlassPanel w={w * 0.88} h={h * 0.78} y={h * 0.5} z={d / 2 + 0.03} material={glassMat} />}
      {glassMat && glassSides.includes('back') && <GlassPanel w={w * 0.88} h={h * 0.78} y={h * 0.5} z={-d / 2 - 0.03} rotY={Math.PI} material={glassMat} />}
      {glassMat && glassSides.includes('left') && <GlassPanel w={d * 0.88} h={h * 0.78} x={-w / 2 - 0.03} y={h * 0.5} rotY={-Math.PI / 2} material={glassMat} />}
      {glassMat && glassSides.includes('right') && <GlassPanel w={d * 0.88} h={h * 0.78} x={w / 2 + 0.03} y={h * 0.5} rotY={Math.PI / 2} material={glassMat} />}

      {dividers > 1 && Array.from({ length: dividers - 1 }, (_, i) => {
        const dx = -w / 2 + (w / dividers) * (i + 1);
        return <Box key={i} w={0.05} h={h * 0.76} d={0.06} x={dx} y={h * 0.5} z={d / 2 + 0.05} material={MAT_ROOF} />;
      })}
    </group>
  );
}

// ── Escala de niveles por escenario (usa floors/units del proforma) ────
function towerFloorsFor(numF: number) {
  return Math.max(8, Math.min(12, Math.round(numF * 2.6)));
}
function mixtoLoftFloors(numF: number) {
  return numF >= 4 ? 2 : 1;
}
function residencialUnitsFor(units: number) {
  return Math.max(3, Math.min(5, Math.round((units || 9) / 3)));
}

// ═══════════════════════════════════════════════════════════════════════
//  Building — arma el massing correcto según `scenario`
// ═══════════════════════════════════════════════════════════════════════
function Building({ floors, units, scenario, anim, prefersReduced }: { floors: number; units: number; scenario: Scenario; anim: boolean; prefersReduced: boolean }) {
  const spinRef = useRef<THREE.Group>(null!);
  const revealRef = useRef(0);
  const prevAnimRef = useRef(false);
  const pulseRef = useRef(0);

  const numF = Math.max(3, Math.min(4, Math.round(floors || 3)));

  useFrame(({ clock }, delta) => {
    // Reinicia el reveal (construcción piso a piso) cada vez que se
    // dispara `anim` (botón "construir" en HbuTab) — además de tocarlo
    // una vez al montar el escenario (revealRef arranca en 0).
    if (anim && !prevAnimRef.current) revealRef.current = 0;
    prevAnimRef.current = anim;
    if (!prefersReduced) revealRef.current += delta;

    // Órbita lenta con ease-in (arranca quieta, acelera a velocidad de
    // crucero) en vez de sumar rotación fija — evita el "doble giro" que
    // se ve al combinar OrbitControls.autoRotate con una rotación manual.
    if (spinRef.current && !prefersReduced) {
      const t = clock.getElapsedTime();
      const ramp = easeOutCubic(Math.min(1, t / 2));
      const speed = 0.13 + (anim ? 0.09 : 0);
      spinRef.current.rotation.y += delta * speed * ramp;
    }

    // Pulso sutil de energía en rebar/acento verde mientras `anim` está
    // activo (construcción en curso) — mutación de material compartido,
    // igual que Session2.tsx anima mCol/mBeam sin recrearlos por frame.
    const target = anim && !prefersReduced ? 1 : 0;
    pulseRef.current += (target - pulseRef.current) * Math.min(1, delta * 4);
    const wave = 0.6 + 0.4 * Math.sin(clock.getElapsedTime() * 6);
    MAT_REBAR.emissiveIntensity = 0.5 + pulseRef.current * 0.35 * wave;
    MAT_ACCENT_GREEN.emissiveIntensity = 0.55 + pulseRef.current * 0.4 * wave;
  });

  // Timing del reveal: se reparte en ~1.6s independientemente del número
  // de rebanadas, para calzar con la ventana de 2.2s del botón "construir"
  // en HbuTab (setIsAnimating ... 2200ms).
  const duration = 0.55;

  let slices: React.ReactNode[] = [];
  let extras: React.ReactNode = null;
  let groundNode: React.ReactNode;

  if (scenario === 'mixto') {
    // ── HÍBRIDO CO-LIVING: base townhouses + cuerpo lofts + remate studios,
    //    cada franja con setback → terrazas visibles en cada retranqueo.
    const FH = 3.0;
    const thFloors = 2;
    const loftFloors = mixtoLoftFloors(numF);
    const stFloors = 1;
    const total = thFloors + loftFloors + stFloors;
    const stagger = 1.6 / total;

    const thW = LOT_W, thD = LOT_D * 0.7;
    const loftW = LOT_W * 0.72, loftD = thD * 0.82;
    const stW = LOT_W * 0.46, stD = thD * 0.6;
    const dividers = Math.max(3, Math.min(6, Math.round((units || 8) / 3)));

    let gi = 0;
    for (let f = 0; f < thFloors; f++, gi++) {
      slices.push(
        <SliceGroup key={`th-${f}`} index={gi} y={f * FH} h={FH} w={thW} d={thD}
          slabMat={MAT_SLAB_WARM} colMat={MAT_COL_HOUSE} colTint={EDGE_ORANGE}
          glassMat={f === 0 ? MAT_GLASS_DOOR : MAT_GLASS} glassSides={['front']}
          dividers={dividers} midColumns
          revealRef={revealRef} stagger={stagger} duration={duration} prefersReduced={prefersReduced} />
      );
    }
    const loftBaseY = thFloors * FH;
    for (let f = 0; f < loftFloors; f++, gi++) {
      slices.push(
        <SliceGroup key={`lo-${f}`} index={gi} y={loftBaseY + f * FH} h={FH} w={loftW} d={loftD}
          slabMat={MAT_SLAB} colMat={MAT_COL} colTint={EDGE_GREEN}
          glassMat={MAT_GLASS} glassSides={['front', 'back']}
          revealRef={revealRef} stagger={stagger} duration={duration} prefersReduced={prefersReduced} />
      );
    }
    const stBaseY = loftBaseY + loftFloors * FH;
    slices.push(
      <SliceGroup key="st-0" index={gi} y={stBaseY} h={FH * 0.92} w={stW} d={stD}
        slabMat={MAT_SLAB} colMat={MAT_COL} colTint={EDGE_GREEN}
        glassMat={MAT_GLASS} glassSides={['front', 'left', 'right']}
        revealRef={revealRef} stagger={stagger} duration={duration} prefersReduced={prefersReduced} />
    );
    gi++;

    // Terrazas: planters en los retranqueos townhouse→loft y loft→studio.
    const thCorners: [number, number][] = [[-thW / 2 + 0.5, -thD / 2 + 0.5], [-thW / 2 + 0.5, thD / 2 - 0.5], [thW / 2 - 0.5, -thD / 2 + 0.5], [thW / 2 - 0.5, thD / 2 - 0.5]];
    const loCorners: [number, number][] = [[-loftW / 2 + 0.4, -loftD / 2 + 0.4], [-loftW / 2 + 0.4, loftD / 2 - 0.4], [loftW / 2 - 0.4, -loftD / 2 + 0.4], [loftW / 2 - 0.4, loftD / 2 - 0.4]];
    extras = (
      <>
        <group position={[0, loftBaseY, 0]}>{thCorners.map(([x, z], i) => <Planter key={i} x={x} z={z} />)}</group>
        <group position={[0, stBaseY, 0]}>{loCorners.map(([x, z], i) => <Planter key={i} x={x} z={z} />)}</group>
        {/* Roof cap del remate de studios */}
        <group position={[0, stBaseY + FH * 0.92, 0]}>
          <Box w={stW + 0.3} h={0.16} d={stD + 0.3} material={MAT_ROOF} />
          <BoxEdges w={stW + 0.3} h={0.16} d={stD + 0.3} material={EDGE_GREEN} />
        </group>
        <Worker px={-thW / 2 - 0.9} pz={thD / 2 - 1} phase={0.3} anim={anim} />
        <Worker px={thW / 2 + 0.9} pz={-thD / 2 + 1.3} phase={1.6} anim={anim} />
      </>
    );
    groundNode = (
      <>
        <Box w={LOT_W + 1.6} h={0.18} d={LOT_D + 1.6} y={-0.09} material={MAT_GROUND} />
      </>
    );
  } else if (scenario === 'max') {
    // ── VERTICAL / TORRE: footprint chico y esbelto, muchos niveles,
    //    curtain wall de vidrio en las 4 caras, plaza abierta alrededor.
    const FH = 2.8;
    const total = towerFloorsFor(numF);
    const stagger = 1.6 / total;
    const tW = LOT_W * 0.42, tD = LOT_D * 0.34;

    for (let f = 0; f < total; f++) {
      slices.push(
        <SliceGroup key={`tw-${f}`} index={f} y={f * FH} h={FH} w={tW} d={tD}
          slabMat={MAT_SLAB} colMat={MAT_COL_TOWER} colTint={EDGE_BLUE}
          glassMat={MAT_GLASS_TOWER} glassSides={['front', 'back', 'left', 'right']}
          revealRef={revealRef} stagger={stagger} duration={duration} prefersReduced={prefersReduced} />
      );
    }
    const roofY = total * FH;
    extras = (
      <>
        {/* Penthouse + antena — remate que lee "torre" a la silueta */}
        <group position={[0, roofY, 0]}>
          <Box w={tW * 0.55} h={0.9} d={tD * 0.55} y={0.45} material={MAT_ROOF} />
          <BoxEdges w={tW * 0.55} h={0.9} d={tD * 0.55} y={0.45} material={EDGE_GREEN} />
          <Box w={0.08} h={2.1} d={0.08} y={0.9 + 1.05} material={MAT_ACCENT_GREEN} />
        </group>
        <Worker px={tW / 2 + 1.6} pz={-tD / 2 - 1.2} phase={0.5} anim={anim} />
        <Worker px={-tW / 2 - 1.8} pz={tD / 2 + 0.8} phase={2.1} anim={anim} />
      </>
    );
    groundNode = (
      <>
        {/* Plaza abierta ocupa el resto del lote — comunica "huella chica,
            altura compensa" frente al lote completo de 22×30 m. */}
        <Box w={LOT_W + 1.6} h={0.18} d={LOT_D + 1.6} y={-0.09} material={MAT_PLAZA} />
        <BoxEdges w={tW + 0.3} h={0.02} d={tD + 0.3} y={0.01} material={EDGE_BLUE} />
      </>
    );
  } else {
    // ── HORIZONTAL / TOWNHOUSES: 3-5 volúmenes separados en hilera,
    //    2-3 niveles cada uno, huecos visibles + jardín trasero.
    const FH = 3.0;
    const nUnits = residencialUnitsFor(units);
    const floorsEach = numF >= 4 ? 3 : 2;
    const gap = 0.55;
    const uW = (LOT_W - (nUnits - 1) * gap) / nUnits;
    const uD = LOT_D * 0.52;
    const total = nUnits * floorsEach;
    const stagger = 1.6 / total;

    for (let u = 0; u < nUnits; u++) {
      const ux = -LOT_W / 2 + uW / 2 + u * (uW + gap);
      for (let f = 0; f < floorsEach; f++) {
        const gi = u * floorsEach + f;
        slices.push(
          <group key={`hu-${u}-${f}`} position={[ux, 0, 0]}>
            <SliceGroup index={gi} y={f * FH} h={FH} w={uW} d={uD}
              slabMat={MAT_SLAB_WARM} colMat={MAT_COL_HOUSE} colTint={EDGE_ORANGE}
              glassMat={f === 0 ? MAT_GLASS_DOOR : MAT_GLASS} glassSides={['front']}
              revealRef={revealRef} stagger={stagger} duration={duration} prefersReduced={prefersReduced} />
          </group>
        );
      }
      // Roof cap individual por unidad (remata cada casa por separado,
      // refuerza la lectura de "volúmenes distintos" pese a compartir
      // predio).
      extras = (
        <React.Fragment key="rh-frag">
          {extras}
          <group position={[ux, floorsEach * FH, 0]}>
            <Box w={uW + 0.2} h={0.14} d={uD + 0.2} material={MAT_ROOF} />
            <BoxEdges w={uW + 0.2} h={0.14} d={uD + 0.2} material={EDGE_GREEN} />
          </group>
        </React.Fragment>
      );
    }
    extras = (
      <>
        {extras}
        <Worker px={-LOT_W / 2 - 1.1} pz={uD / 2 + 0.6} phase={0.2} anim={anim} />
        <Worker px={LOT_W / 2 + 1.1} pz={-uD / 2 - 0.3} phase={1.9} anim={anim} />
      </>
    );
    groundNode = (
      <>
        <Box w={LOT_W + 1.6} h={0.18} d={LOT_D + 1.6} y={-0.09} material={MAT_GROUND} />
        {/* Jardín trasero compartido — franja verde detrás de la hilera,
            comunica la baja densidad / huella extendida del modelo. */}
        <Box w={LOT_W} h={0.05} d={LOT_D - uD} y={-0.05} z={uD / 2 + (LOT_D - uD) / 2} material={MAT_PLAZA} />
      </>
    );
  }

  return (
    <group ref={spinRef}>
      <gridHelper args={[Math.max(LOT_W, LOT_D) + 6, 16, C.green, '#1f2937']} position={[0, -0.19, 0]} />
      {groundNode}
      {/* Contorno real del lote (22×30 m) — honestidad de escala, visible
          en los 3 modelos para comparar huella construida vs. huella del
          predio. */}
      <BoxEdges w={LOT_W} h={0.01} d={LOT_D} y={0.005} material={EDGE_GREEN} />
      {slices}
      {extras}
    </group>
  );
}

// ── prefers-reduced-motion (detectado dentro de este archivo, sin exigir
//    un prop nuevo desde HbuTab.tsx) ──────────────────────────────────
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);
  return reduced;
}

const CAMERA_PRESETS: Record<Scenario, { position: [number, number, number]; target: [number, number, number]; fov: number }> = {
  mixto: { position: [17, 12, 17], target: [0, 4.2, 0], fov: 50 },
  max: { position: [15, 15, 15], target: [0, 9, 0], fov: 46 },
  residencial: { position: [18, 8.5, 18], target: [0, 2, 0], fov: 52 },
};

function HeroScene({ floors, units, scenario, anim, prefersReduced }: { floors: number; units: number; scenario: Scenario; anim: boolean; prefersReduced: boolean }) {
  const cam = CAMERA_PRESETS[scenario];
  return (
    <Canvas
      key={scenario /* remonta la escena al cambiar de modelo → replay del reveal */}
      camera={{ position: cam.position, fov: cam.fov }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={['#001428']} />
      <fog attach="fog" args={['#001428', 30, 78]} />
      <ambientLight intensity={1.0} color="#6080A0" />
      <directionalLight position={[10, 20, 10]} intensity={2.0} color="#E8E0D8" />
      <directionalLight position={[-8, 6, -8]} intensity={0.7} color="#FF8040" />
      <directionalLight position={[0, -4, 10]} intensity={0.35} color="#4080C0" />
      <Building floors={floors} units={units} scenario={scenario} anim={anim} prefersReduced={prefersReduced} />
      <OrbitControls
        enableZoom
        enablePan={false}
        enableRotate
        autoRotate={false}
        target={cam.target}
        minPolarAngle={Math.PI * 0.16}
        maxPolarAngle={Math.PI * 0.72}
        minDistance={8}
        maxDistance={45}
      />
    </Canvas>
  );
}

function sceneCaption(scenario: Scenario, numF: number): string {
  if (scenario === 'max') {
    return `Torre esbelta · ${towerFloorsFor(numF)} niveles · huella ≈5×6 m sobre lote 22×30 m`;
  }
  if (scenario === 'mixto') {
    return `Escalonado · townhouses + lofts + studios · terrazas en cada retranqueo`;
  }
  return `Horizontal · ${residencialUnitsFor(9)} townhouses en hilera · baja densidad · jardín trasero`;
}

const FinObra3DBuilding: React.FC<FinObra3DBuildingProps> = ({ floors, units, scenario, anim }) => {
  const prefersReduced = usePrefersReducedMotion();
  const numF = Math.max(3, Math.min(4, Math.round(floors || 3)));

  return (
    <div style={{ height: 320, width: '100%', background: '#0a0a0f', borderRadius: 12, overflow: 'hidden', border: '1px solid #1e1e2e', position: 'relative' }}>
      <HeroScene floors={floors} units={units} scenario={scenario} anim={anim} prefersReduced={prefersReduced} />

      <div style={{
        position: 'absolute', bottom: 8, left: 8, fontSize: 9.5, color: C.green,
        background: 'rgba(2,12,27,0.78)', padding: '3px 7px', borderRadius: 4,
        fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.02em',
        border: `1px solid ${C.blue}`, maxWidth: 'calc(100% - 16px)',
      }}>
        {sceneCaption(scenario, numF)}
      </div>

      <div style={{
        position: 'absolute', top: 8, right: 10, fontSize: 9, color: C.muted,
        letterSpacing: '0.08em', fontFamily: "'JetBrains Mono', monospace",
        pointerEvents: 'none',
      }}>
        ARRASTRA PARA ROTAR
      </div>
    </div>
  );
};

export default FinObra3DBuilding;
