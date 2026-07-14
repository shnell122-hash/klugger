"use client";
// Klugger — Hero 3D NATIVO (spike H1 del MASTERPLAN-HERO-3D-NATIVO).
// WebGL real (React Three Fiber), canvas TRANSPARENTE (sin cielo) → compone con la página.
// El scroll controla la rotación del mundo (lerp, 60fps). Placeholder low-poly hasta tener el GLB.
// Cargar SIEMPRE con dynamic(ssr:false) — no debe prerenderizarse en el build estático.
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Center } from "@react-three/drei";
import { Suspense, useEffect, useRef } from "react";
import type { Group } from "three";

const ZORRO = "/assets/klugger-zorro.glb";

/** Zorro real (GLB de Meshy). Camina "en su lugar" arriba del mundo (bob), mientras el mundo rota debajo. */
function Fox() {
  const ref = useRef<Group>(null);
  const { scene } = useGLTF(ZORRO);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.position.y = 1.5 + Math.abs(Math.sin(t * 5)) * 0.05; // trote: rebote hacia arriba
    ref.current.rotation.z = Math.sin(t * 10) * 0.02;                 // balanceo de paso
    ref.current.rotation.x = -0.05 + Math.sin(t * 5) * 0.03;          // cabeceo de trote
  });
  // bottom≈-1 tras Center+scale → base del zorro apoyada en el polo (r=1.25)
  return (
    <group ref={ref} position={[0, 1.5, 0]} rotation={[0, -0.6, 0]}>
      <Center scale={0.95}>
        <primitive object={scene} />
      </Center>
    </group>
  );
}

/** Mundo low-poly (placeholder hasta el GLB del mundo). Rota según progress (0→1) del scroll. */
function World({ progress }: { progress: { current: number } }) {
  const world = useRef<Group>(null);
  const idle = useRef(0);
  useFrame((_, dt) => {
    if (!world.current) return;
    idle.current += dt * 0.22; // giro continuo → el terreno se mueve bajo el zorro (camina)
    world.current.rotation.y = idle.current + progress.current * Math.PI * 2; // + scroll acelera
  });
  return (
    <group rotation={[-0.35, 0, 0]} position={[0, -0.35, 0]} scale={0.9}>
      {/* el mundo rota; el zorro NO (queda arriba caminando en su sitio) */}
      <group ref={world}>
        <mesh>
          <icosahedronGeometry args={[1.25, 1]} />
          <meshStandardMaterial color="#3DBB5B" flatShading roughness={0.9} />
        </mesh>
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
      </group>
      <Fox />
    </group>
  );
}
useGLTF.preload(ZORRO);

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
        camera={{ position: [0, 0.4, 6.6], fov: 35 }}
      >
        <ambientLight intensity={0.75} />
        <directionalLight position={[3, 5, 2]} intensity={1.6} />
        <directionalLight position={[-4, -2, -3]} intensity={0.4} color="#7CD6FF" />
        <Suspense fallback={null}>
          <World progress={progress} />
        </Suspense>
      </Canvas>
      <div className="kworld__hint">↕ scrollea — el mundo es geometría WebGL nativa (no video), fondo transparente</div>
    </div>
  );
}
