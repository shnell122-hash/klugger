'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// Design tokens from FinObra preview (Klugger adapted: emphasize green #00FF66 or #10b981, orange accent, blue, cream)
const C = {
  void: '#020C1B',
  orange: '#FF6B00',
  green: '#00FF66',
  blue: '#2A4A70',
  cream: '#F7F4EF',
  muted: '#6B7C93',
  red: '#FF3B30',
} as const;

interface FinObra3DBuildingProps {
  floors: number;
  units: number;
  scenario: 'residencial' | 'mixto' | 'max';
  anim: boolean;
}

const MAT_COL = new THREE.MeshStandardMaterial({ color:'#5A8FC0', emissive:'#1A3A60', emissiveIntensity:0.7, metalness:0.85, roughness:0.25 });
const MAT_SLAB = new THREE.MeshStandardMaterial({ color:'#8AABCC', roughness:0.8, transparent:true, opacity:0.82, side:THREE.DoubleSide });
const MAT_REBAR = new THREE.MeshStandardMaterial({ color:'#FF6B00', emissive:'#CC3300', emissiveIntensity:0.5, metalness:0.6, roughness:0.4 });

const FLOOR_H = 3.2, BW = 9, BD = 6;

// Detailed I-beam style column (flanges + web, inspired by py renderer + preview TSX for high quality industrial look)
function ibeamColumn(x: number, z: number, h: number) {
  const flangeW = 0.55, flangeT = 0.12, webT = 0.18;
  const g = new THREE.Group();
  // Left flange
  const lf = new THREE.Mesh(new THREE.BoxGeometry(flangeT, h, flangeW), MAT_COL);
  lf.position.set(x - 0.25, h/2, z);
  g.add(lf);
  // Right flange
  const rf = new THREE.Mesh(new THREE.BoxGeometry(flangeT, h, flangeW), MAT_COL);
  rf.position.set(x + 0.25, h/2, z);
  g.add(rf);
  // Web
  const web = new THREE.Mesh(new THREE.BoxGeometry(webT, h, 0.22), MAT_REBAR);
  web.position.set(x, h/2, z);
  g.add(web);
  // Edge lines for wireframe pop (Klugger green emphasis on some)
  const edgeMat = new THREE.LineBasicMaterial({ color: C.green, transparent: true, opacity: 0.85 });
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.55, h, flangeW)), edgeMat);
  edges.position.set(x, h/2, z);
  g.add(edges);
  return g;
}

function Building({ floors = 4, scenario = 'residencial' as const, anim = false }: { floors?: number; scenario?: 'residencial'|'mixto'|'max'; anim?: boolean }) {
  const groupRef = useRef<THREE.Group>(null!);
  const numF = Math.max(2, Math.min(5, floors || 4));
  const isMix = scenario === 'mixto';
  const w = isMix ? BW * 1.1 : BW;
  const d = BD;

  const slabEdgeGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.25, d)), [w]);
  const colEdgeGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.4, FLOOR_H, 0.4)), []);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    // Nice curve auto-rotate (preview style + enhanced for Sesion 2): base slow + faster pulse on anim
    const base = clock.getElapsedTime() * 0.16;
    const pulse = anim ? Math.sin(clock.getElapsedTime() * 3) * 0.08 : 0;
    groupRef.current.rotation.y = base + pulse;
  });

  // Simple animated workers (preview-inspired: body/head/arms, slight bob on anim, Klugger green accents)
  const Worker = ({ px, pz, phase }: { px: number; pz: number; phase: number }) => (
    <group position={[px, 0.1, pz]} rotation={[0, phase * 1.2, 0]}>
      {/* Body */}
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.18, 0.22, 1.1, 6]} />
        <meshLambertMaterial color="#334155" />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.85, 0]}>
        <sphereGeometry args={[0.18]} />
        <meshLambertMaterial color="#e2e8f0" />
      </mesh>
      {/* Arm (one moving on anim) */}
      <mesh position={[0.35, 1.3 + (anim ? Math.sin(phase*4)*0.15 : 0), 0]}>
        <boxGeometry args={[0.08, 0.7, 0.08]} />
        <meshLambertMaterial color={C.green} emissive={C.green} emissiveIntensity={anim ? 0.3 : 0.05} />
      </mesh>
    </group>
  );

  return (
    <group ref={groupRef}>
      {/* Ground grid + lot (green Klugger accent on grid for Cimatario lot) */}
      <gridHelper args={[18, 16, C.green, '#1f2937']} position={[0, -0.08, 0]} />
      <mesh position={[0, -0.18, 0]} receiveShadow>
        <boxGeometry args={[w + 2, 0.25, d + 2]} />
        <meshLambertMaterial color="#1e2937" />
      </mesh>

      {Array.from({ length: numF }, (_, f) => {
        const y = f * FLOOR_H;
        const slabH = 0.22;
        return (
          <group key={f} position={[0, y, 0]}>
            {/* Slab */}
            <mesh material={MAT_SLAB} position={[0, slabH/2, 0]}>
              <boxGeometry args={[w, slabH, d]} />
            </mesh>
            {/* Edges (orange + green pop) */}
            <lineSegments geometry={slabEdgeGeo} position={[0, slabH/2, 0]}>
              <lineBasicMaterial color={f === 0 ? C.green : '#FF6B00'} transparent opacity={0.7} />
            </lineSegments>

            {/* Detailed I-beam columns (flange+web, more realistic per preview + py) */}
            {[[-w/2+0.6, -d/2+0.6], [-w/2+0.6, d/2-0.6], [w/2-0.6, -d/2+0.6], [w/2-0.6, d/2-0.6]].map(([cx, cz], i) => (
              <primitive key={i} object={ibeamColumn(cx, cz, FLOOR_H)} />
            ))}

            {/* Horizontal rebar beams (more, green Klugger emphasis on key ones) */}
            {[-d/2 + 0.3, d/2 - 0.3, 0].map((bz, bi) => (
              <mesh key={bi} material={bi === 1 ? new THREE.MeshStandardMaterial({ color: C.green, emissive: C.green, emissiveIntensity: 0.4, metalness: 0.7 }) : MAT_REBAR} position={[0, FLOOR_H * 0.55, bz]}>
                <boxGeometry args={[w - 1, 0.16, 0.16]} />
              </mesh>
            ))}

            {/* Glass panels (preview style transparent + slight green tint/emissive for "finished" look, front facade) */}
            <mesh position={[0, FLOOR_H * 0.5, d/2 + 0.05]} material={new THREE.MeshPhongMaterial({ color: '#a5f3fc', transparent: true, opacity: 0.35, shininess: 80, emissive: C.green, emissiveIntensity: anim ? 0.25 : 0.08 })}>
              <planeGeometry args={[w * 0.92, FLOOR_H * 0.85]} />
            </mesh>

            {/* Simple workers on slab (2-3 per floor, animated bob on trigger) */}
            {f > 0 && (
              <>
                <Worker px={-2} pz={-1.5} phase={f * 1.3} />
                <Worker px={1.8} pz={1.2} phase={f * 2.1 + 1} />
              </>
            )}
          </group>
        );
      })}

      {/* Roof cap with green accent line */}
      <mesh position={[0, numF * FLOOR_H + 0.15, 0]} material={new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.3 })}>
        <boxGeometry args={[w + 0.4, 0.2, d + 0.4]} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(w + 0.4, 0.2, d + 0.4)]} />
        <lineBasicMaterial color={C.green} transparent opacity={0.9} />
      </lineSegments>
    </group>
  );
}

function HeroScene({ autoRotate, floors, scenario, anim }: { autoRotate: boolean; floors: number; scenario: 'residencial'|'mixto'|'max'; anim: boolean }) {
  return (
    <Canvas
      camera={{ position: [16, 11, 16], fov: 50 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={['#001428']} />
      <fog attach="fog" args={['#001428', 32, 75]} />
      <ambientLight intensity={1.0} color="#6080A0" />
      <directionalLight position={[10, 20, 10]} intensity={2.0} color="#E8E0D8" />
      <directionalLight position={[-8, 6, -8]} intensity={0.7} color="#FF8040" />
      <directionalLight position={[0, -4, 10]} intensity={0.35} color="#4080C0" />
      <Building floors={floors} scenario={scenario} anim={anim} />
      <OrbitControls
        enableZoom={true}
        enablePan={false}
        autoRotate={autoRotate}
        autoRotateSpeed={anim ? 0.95 : 0.55}
        minPolarAngle={Math.PI * 0.18}
        maxPolarAngle={Math.PI * 0.72}
      />
    </Canvas>
  );
}

const FinObra3DBuilding: React.FC<FinObra3DBuildingProps> = ({ floors, units, scenario, anim }) => {
  // Sesion 2: Greatly improved with best elements from FinObra preview (src/preview/ HeroScene/Building + .cad-skill py renderer style): detailed I-beam columns (flanges+web), extra rebar, glass panels (tinted emissive), animated workers on slabs, green Klugger #00FF66/#10b981 accents on edges/glows/worker arms/grid, smooth camera curves via Orbit + useFrame pulse, prop-driven floors, no logos. Auto orbit + construction pulse on anim.
  // Source refs: https://github.com/vilarkptl-lang/FinObra/blob/claude/.../src/preview/  and .cad-skill + py example for GIF.
  const numF = Math.max(2, Math.min(5, floors || 4));
  return (
    <div style={{ height: 320, width: '100%', background: '#0a0a0f', borderRadius: 12, overflow: 'hidden', border: '1px solid #1e1e2e', position: 'relative' }}>
      <HeroScene autoRotate={anim} floors={numF} scenario={scenario} anim={anim} />
      <div style={{ position: 'absolute', bottom: 6, left: 6, fontSize: 9, color: '#00FF66', background: 'rgba(0,0,0,0.6)', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace' }}>
        3D FinObra mejorado (preview TSX I-beams/rebar/glass/workers + Klugger green) • sin "floors grow windows"
      </div>
    </div>
  );
};

export default FinObra3DBuilding;