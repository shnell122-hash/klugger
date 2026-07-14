"use client";
// Klugger — Hero 3D NATIVO (spike H1 del MASTERPLAN-HERO-3D-NATIVO).
// WebGL real (React Three Fiber), canvas TRANSPARENTE (sin cielo) → compone con la página.
// El scroll controla la rotación del mundo (lerp, 60fps). Placeholder low-poly hasta tener el GLB.
// Cargar SIEMPRE con dynamic(ssr:false) — no debe prerenderizarse en el build estático.
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations, Center } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { CanvasTexture, MeshStandardMaterial, type Group, type Mesh, type Texture } from "three";

const ZORRO = "/assets/klugger-zorro-anim.glb"; // Fox animado (Khronos/three.js, CC0): Survey/Walk/Run

/** Recolorea la textura naranja→verde de marca (giro de tono en canvas, una vez). */
function tintGreen(tex: Texture): Texture {
  const img = tex.image as HTMLImageElement | undefined;
  if (!img || !("width" in img)) return tex;
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d");
  if (!ctx) return tex;
  ctx.filter = "hue-rotate(95deg) saturate(1.15)"; // naranja(~30°) → verde(~125°)
  ctx.drawImage(img, 0, 0);
  const t = new CanvasTexture(c);
  t.flipY = tex.flipY; t.colorSpace = tex.colorSpace; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT;
  t.needsUpdate = true;
  return t;
}

/** Zorro animado que CAMINA (walk cycle real) sobre el mundo; el mundo rota debajo. */
function Fox() {
  const ref = useRef<Group>(null);
  const { scene, animations } = useGLTF(ZORRO);
  const { actions } = useAnimations(animations, ref);
  // tintar a verde una sola vez
  useMemo(() => {
    scene.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && m.material) {
        const src = m.material as MeshStandardMaterial;
        const mat = src.clone();
        if (mat.map) mat.map = tintGreen(mat.map);
        mat.flatShading = false;
        m.material = mat;
      }
    });
  }, [scene]);
  useEffect(() => {
    const walk = actions["Walk"];
    walk?.reset().fadeIn(0.2).play();
    return () => void walk?.fadeOut(0.2);
  }, [actions]);
  return (
    <group ref={ref} position={[0, 1.26, 0]} rotation={[0, -0.7, 0]}>
      <Center scale={0.016}>
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
