"use client";
// Klugger — Hero 3D NATIVO (spike H1 del MASTERPLAN-HERO-3D-NATIVO).
// WebGL real (React Three Fiber), canvas TRANSPARENTE (sin cielo) → compone con la página.
// El scroll controla la rotación del mundo (lerp, 60fps). Placeholder low-poly hasta tener el GLB.
// Cargar SIEMPRE con dynamic(ssr:false) — no debe prerenderizarse en el build estático.
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations, Center } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { CanvasTexture, MeshStandardMaterial, Quaternion, Vector3, type Group, type Mesh, type Texture } from "three";

const ZORRO = "/assets/klugger-zorro-anim.glb"; // Fox animado (Khronos/three.js, CC0): Survey/Walk/Run
const R = 1.25; // radio del planeta

/** Coloca sobre la esfera (φ desde el polo +Y, θ azimut), orientado radial (base en superficie). */
function onSphere(phi: number, theta: number, lift = 0) {
  const n = new Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
  const pos = n.clone().multiplyScalar(R + lift);
  const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), n);
  return { pos, quat };
}

/** Landmark real de CDMX (GLB Meshy, draco). Se para sobre la esfera con su base tocando la superficie. */
function Landmark({ url, phi, theta, scale }: { url: string; phi: number; theta: number; scale: number }) {
  const { scene } = useGLTF(url, true);
  useMemo(() => {
    scene.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
    });
  }, [scene]);
  const { pos, quat } = useMemo(() => onSphere(phi, theta, -0.03), [phi, theta]);
  return (
    <group position={pos} quaternion={quat}>
      <Center bottom scale={scale}><primitive object={scene} /></Center>
    </group>
  );
}

/** Árboles low-poly dispersos (cono + tronco), radiales a la esfera. Scatter determinista. */
function Trees() {
  const items = useMemo(() => {
    let s = 1337;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    return Array.from({ length: 42 }, () => {
      const phi = 0.35 + rnd() * 1.15; // evita el polo (zorro) y el fondo
      const theta = rnd() * Math.PI * 2;
      const { pos, quat } = onSphere(phi, theta, 0);
      const sc = 0.12 + rnd() * 0.08;
      return { pos, quat, sc };
    });
  }, []);
  return (
    <>
      {items.map((t, i) => (
        <group key={i} position={t.pos} quaternion={t.quat} scale={t.sc}>
          <mesh castShadow position={[0, 0.5, 0]}>
            <coneGeometry args={[0.7, 1.6, 6]} />
            <meshStandardMaterial color={i % 3 ? "#2E9E4F" : "#3DBB5B"} flatShading />
          </mesh>
          <mesh position={[0, -0.1, 0]}>
            <cylinderGeometry args={[0.14, 0.14, 0.5, 5]} />
            <meshStandardMaterial color="#7A5A3A" flatShading />
          </mesh>
        </group>
      ))}
    </>
  );
}

const LANDMARKS = [
  { url: "/assets/landmark-estadio.glb", phi: 0.75, theta: 1.2, scale: 1.0 },
  { url: "/assets/landmark-bellasartes.glb", phi: 0.8, theta: 2.5, scale: 0.95 },
  { url: "/assets/landmark-catedral.glb", phi: 0.8, theta: 0.0, scale: 0.95 },
  { url: "/assets/landmark-castillo.glb", phi: 0.85, theta: 4.2, scale: 0.95 },
];

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

/** Zorro animado. El walk se DRIVE por la velocidad de scroll (scroll-triggered):
   scrolleas → camina; te detienes → se queda quieto. */
function Fox({ progress }: { progress: { current: number } }) {
  const ref = useRef<Group>(null);
  const last = useRef(0);
  const { scene, animations } = useGLTF(ZORRO);
  const { actions } = useAnimations(animations, ref);
  useMemo(() => {
    scene.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && m.material) {
        const src = m.material as MeshStandardMaterial;
        if (src.userData?.__tinted) return; // idempotente: no re-tintar (evita verde→azul)
        const mat = src.clone();
        if (mat.map) mat.map = tintGreen(mat.map);
        mat.flatShading = false;
        mat.userData = { ...(mat.userData ?? {}), __tinted: true };
        m.material = mat;
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
  }, [scene]);
  useEffect(() => {
    const survey = actions["Survey"];
    const walk = actions["Walk"];
    survey?.reset().play();                 // idle por defecto: parado, mirando (plantado)
    if (walk) { walk.reset().play(); walk.weight = 0; } // walk listo, oculto hasta scrollear
  }, [actions]);
  useFrame((_, dt) => {
    const walk = actions["Walk"];
    const survey = actions["Survey"];
    const vel = Math.abs(progress.current - last.current) / Math.max(dt, 0.001);
    last.current = progress.current;
    const moving = Math.min(vel * 12, 1);   // 0 quieto → 1 scrolleando
    const k = Math.min(dt * 6, 1);
    if (walk) walk.weight += (moving - walk.weight) * k;          // crossfade a Walk al scrollear
    if (survey) survey.weight += (1 - moving - survey.weight) * k; // vuelve a Survey al parar
  });
  return (
    <group ref={ref} position={[0, 1.5, 0]} rotation={[0, -0.9, 0]}>
      <Center scale={0.011}>
        <primitive object={scene} />
      </Center>
    </group>
  );
}

/** Mundo low-poly (placeholder hasta el GLB del mundo). Rota según progress (0→1) del scroll. */
function World({ progress }: { progress: { current: number } }) {
  const world = useRef<Group>(null);
  useFrame(() => {
    if (!world.current) return;
    // rotación 100% scroll-triggered: la posición de scroll mapea al giro del mundo
    world.current.rotation.y = progress.current * Math.PI * 2.5;
  });
  return (
    <group rotation={[-0.35, 0, 0]} position={[0, -0.35, 0]} scale={0.9}>
      {/* el mundo rota; el zorro NO (queda arriba caminando en su sitio) */}
      <group ref={world}>
        <mesh receiveShadow castShadow>
          <icosahedronGeometry args={[R, 2]} />
          <meshStandardMaterial color="#3DBB5B" flatShading roughness={0.95} />
        </mesh>
        {LANDMARKS.map((l) => <Landmark key={l.url} {...l} />)}
        <Trees />
      </group>
      <Fox progress={progress} />
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
        shadows                                  // sombras → ancla al zorro al mundo (nivel Principito)
        gl={{ alpha: true, antialias: true }}   // TRANSPARENTE (sin cielo)
        dpr={[1, 2]}
        camera={{ position: [0, 0.4, 6.6], fov: 35 }}
      >
        {/* luz cálida y suave, cielo/suelo (mood Principito) */}
        <hemisphereLight args={["#FFF6E5", "#57C05A", 0.85]} />
        <directionalLight
          castShadow position={[3.5, 6, 4]} intensity={2.1} color="#FFF1DC"
          shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
          shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={4} shadow-camera-bottom={-4}
          shadow-camera-near={0.5} shadow-camera-far={20}
        />
        <Suspense fallback={null}>
          <World progress={progress} />
        </Suspense>
      </Canvas>
      <div className="kworld__hint">↕ scrollea — el mundo es geometría WebGL nativa (no video), fondo transparente</div>
    </div>
  );
}
