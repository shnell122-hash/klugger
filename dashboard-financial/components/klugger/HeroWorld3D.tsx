"use client";
// Klugger — Hero 3D NATIVO (spike H1 del MASTERPLAN-HERO-3D-NATIVO).
// WebGL real (React Three Fiber), canvas TRANSPARENTE (sin cielo) → compone con la página.
// El scroll controla la rotación del mundo (lerp, 60fps). Placeholder low-poly hasta tener el GLB.
// Cargar SIEMPRE con dynamic(ssr:false) — no debe prerenderizarse en el build estático.
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Group } from "three";

/** Mundo + zorro low-poly (placeholder). Rota según progress (0→1) del scroll. */
function World({ progress }: { progress: { current: number } }) {
  const world = useRef<Group>(null);
  const fox = useRef<Group>(null);
  useFrame((_, dt) => {
    const k = Math.min(dt * 3, 1);
    if (world.current) {
      const target = progress.current * Math.PI * 2; // una vuelta completa al scrollear
      world.current.rotation.y += (target - world.current.rotation.y) * k;
    }
    if (fox.current) fox.current.rotation.y += dt * 0.8; // el zorro gira suave sobre el mundo
  });
  return (
    <group rotation={[-0.35, 0, 0]}>
      <group ref={world}>
        {/* planeta low-poly */}
        <mesh castShadow>
          <icosahedronGeometry args={[1.25, 1]} />
          <meshStandardMaterial color="#3DBB5B" flatShading roughness={0.9} />
        </mesh>
        {/* edificios low-poly repartidos */}
        {Array.from({ length: 10 }).map((_, i) => {
          const a = (i / 10) * Math.PI * 2;
          const r = 1.2;
          return (
            <mesh key={i} position={[Math.cos(a) * r, Math.sin(i) * 0.5, Math.sin(a) * r]} rotation={[0, -a, 0]}>
              <boxGeometry args={[0.18, 0.3 + (i % 3) * 0.15, 0.18]} />
              <meshStandardMaterial color={i % 2 ? "#E7ECE9" : "#C9B496"} flatShading />
            </mesh>
          );
        })}
        {/* zorro placeholder (cuerpo + cabeza + orejas) montando el polo */}
        <group ref={fox} position={[0, 1.35, 0]} scale={0.42}>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.5, 0.35, 1]} />
            <meshStandardMaterial color="#3DBB5B" flatShading />
          </mesh>
          <mesh position={[0, 0.15, 0.6]}>
            <boxGeometry args={[0.38, 0.34, 0.38]} />
            <meshStandardMaterial color="#3DBB5B" flatShading />
          </mesh>
          <mesh position={[-0.13, 0.42, 0.62]} rotation={[0, 0, 0.2]}>
            <coneGeometry args={[0.1, 0.24, 4]} />
            <meshStandardMaterial color="#343631" flatShading />
          </mesh>
          <mesh position={[0.13, 0.42, 0.62]} rotation={[0, 0, -0.2]}>
            <coneGeometry args={[0.1, 0.24, 4]} />
            <meshStandardMaterial color="#343631" flatShading />
          </mesh>
          <mesh position={[0, -0.05, -0.7]} rotation={[0.5, 0, 0]}>
            <coneGeometry args={[0.14, 0.6, 5]} />
            <meshStandardMaterial color="#343631" flatShading />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export function HeroWorld3D() {
  const wrap = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const el = wrap.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 cuando la sección entra por abajo, 1 cuando sale por arriba
      const p = (vh - r.top) / (vh + r.height);
      progress.current = Math.max(0, Math.min(1, p));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, []);
  return (
    <div className="kworld" ref={wrap}>
      <Canvas
        className="kworld__canvas"
        gl={{ alpha: true, antialias: true }}   // TRANSPARENTE (sin cielo)
        dpr={[1, 2]}
        camera={{ position: [0, 0, 4], fov: 35 }}
      >
        <ambientLight intensity={0.75} />
        <directionalLight position={[3, 5, 2]} intensity={1.6} />
        <directionalLight position={[-4, -2, -3]} intensity={0.4} color="#7CD6FF" />
        <World progress={progress} />
      </Canvas>
      <div className="kworld__hint">↕ scrollea — el mundo es geometría WebGL nativa (no video), fondo transparente</div>
    </div>
  );
}
