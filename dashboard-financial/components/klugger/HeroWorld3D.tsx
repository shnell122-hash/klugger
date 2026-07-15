"use client";
// Klugger — Hero 3D NATIVO (spike H1 del MASTERPLAN-HERO-3D-NATIVO).
// WebGL real (React Three Fiber), canvas TRANSPARENTE (sin cielo) → compone con la página.
// El scroll controla la rotación del mundo (lerp, 60fps). Placeholder low-poly hasta tener el GLB.
// Cargar SIEMPRE con dynamic(ssr:false) — no debe prerenderizarse en el build estático.
//
// AUTO-CALIBRACIÓN (solo con prop `calibrate`, que solo pasa /style):
//   Cada landmark expone scale, lat, lon, rot (yaw sobre la normal) y altura sobre la esfera
//   como controles en vivo (sliders + URL). Ajustas desde el iPhone y lees los números finales.
//   Los defaults se pueden sobreescribir por query param: ?estadio=scale,lat,lon,rot,lift
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations, Center } from "@react-three/drei";
import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { CanvasTexture, MeshStandardMaterial, Quaternion, Vector3, type Group, type Mesh, type Texture } from "three";

const ZORRO = "/assets/klugger-zorro-anim.glb"; // Fox animado (Khronos/three.js, CC0): Survey/Walk/Run
const R = 1.25; // radio del planeta
const DEG = Math.PI / 180;

/** Transform calibrable de un landmark. lat/lon/rot en GRADOS; lift en unidades de mundo. */
type Xf = { scale: number; lat: number; lon: number; rot: number; lift: number };

/** lat/lon (grados) → φ (desde el polo +Y, donde vive el zorro) y θ (azimut). lat 90 = polo norte. */
function latLonToPhiTheta(lat: number, lon: number) {
  return { phi: (90 - lat) * DEG, theta: lon * DEG };
}

/**
 * Coloca sobre la esfera con "up" = normal de la esfera en (lat,lon).
 * lift = altura sobre la superficie (0 = pegado). rot = giro (yaw) alrededor de la normal, en grados.
 */
function place(xf: Xf) {
  const { phi, theta } = latLonToPhiTheta(xf.lat, xf.lon);
  const n = new Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
  const pos = n.clone().multiplyScalar(R + xf.lift);
  const align = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), n); // +Y → normal
  const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), xf.rot * DEG); // gira sobre su up
  const quat = align.multiply(yaw); // primero yaw (local), luego alinear a la normal
  return { pos, quat };
}

/** Sube saturación de una textura lavada (Meshy) en canvas, una vez. */
function boostTexture(tex: Texture): Texture {
  const img = tex.image as HTMLImageElement | undefined;
  if (!img || !("width" in img)) return tex;
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d");
  if (!ctx) return tex;
  ctx.filter = "saturate(1.7) contrast(1.06)";
  ctx.drawImage(img, 0, 0);
  const t = new CanvasTexture(c);
  t.flipY = tex.flipY; t.colorSpace = tex.colorSpace; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT;
  t.needsUpdate = true;
  return t;
}

/** Landmark real de CDMX (GLB Meshy). Se para sobre la esfera con su base en la superficie. */
function Landmark({ url, xf }: { url: string; xf: Xf }) {
  const { scene } = useGLTF(url);
  useMemo(() => {
    scene.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && m.material) {
        const src = m.material as MeshStandardMaterial;
        if (!src.userData?.__boosted) {
          if (src.map) src.map = boostTexture(src.map);
          src.userData = { ...(src.userData ?? {}), __boosted: true };
          src.needsUpdate = true;
        }
        m.castShadow = true; m.receiveShadow = true;
      }
    });
  }, [scene]);
  const { pos, quat } = useMemo(() => place(xf), [xf]);
  return (
    <group position={pos} quaternion={quat}>
      {/* Center bottom: la BASE del modelo queda en el origen del grupo → lift 0 = pegado a la superficie */}
      <Center bottom scale={xf.scale}><primitive object={scene} /></Center>
    </group>
  );
}

/** Árboles low-poly dispersos (cono + tronco), radiales a la esfera. Scatter determinista. */
function Trees() {
  const items = useMemo(() => {
    let s = 1337;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    return Array.from({ length: 20 }, () => {
      const phi = 0.35 + rnd() * 1.15; // evita el polo (zorro) y el fondo
      const theta = rnd() * Math.PI * 2;
      const n = new Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
      const pos = n.clone().multiplyScalar(R);
      const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), n);
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

/** Landmarks + defaults calibrables. lat/lon/rot en grados; scale ~2–3% del radio; lift 0 = pegado. */
const LANDMARKS: { key: string; label: string; url: string; def: Xf }[] = [
  { key: "estadio",     label: "Estadio Azteca", url: "/assets/landmark-estadio.glb",     def: { scale: 0.9, lat: 45, lon: 69, rot: 0, lift: 0 } },
  { key: "bellasartes", label: "Bellas Artes",   url: "/assets/landmark-bellasartes.glb", def: { scale: 0.85, lat: 43, lon: 149, rot: 0, lift: 0 } },
  { key: "catedral",    label: "Catedral",       url: "/assets/landmark-catedral.glb",    def: { scale: 0.85, lat: 44, lon: 0, rot: 0, lift: 0 } },
  { key: "castillo",    label: "Castillo",       url: "/assets/landmark-castillo.glb",    def: { scale: 0.85, lat: 41, lon: 241, rot: 0, lift: 0 } },
];

const DEFAULT_XFS: Record<string, Xf> = Object.fromEntries(LANDMARKS.map((l) => [l.key, l.def]));

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
function World({ progress, xfs }: { progress: { current: number }; xfs: Record<string, Xf> }) {
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
        {/* landmarks + árboles en su PROPIO Suspense: si tardan/fallan, el zorro+mundo siguen visibles */}
        <Suspense fallback={null}>
          {LANDMARKS.map((l) => <Landmark key={l.key} url={l.url} xf={xfs[l.key] ?? l.def} />)}
          <Trees />
        </Suspense>
      </group>
      <Fox progress={progress} />
    </group>
  );
}
useGLTF.preload(ZORRO);

// ─────────────────────────────────────────────────────────────────────────────
// Auto-calibración (solo /style). Sliders nativos (mobile-first) + sync a la URL.
// ─────────────────────────────────────────────────────────────────────────────

/** Lee overrides de la URL: ?estadio=scale,lat,lon,rot,lift&catedral=... */
function readXfsFromUrl(): Record<string, Xf> {
  if (typeof window === "undefined") return { ...DEFAULT_XFS };
  const q = new URLSearchParams(window.location.search);
  const out: Record<string, Xf> = {};
  for (const l of LANDMARKS) {
    const raw = q.get(l.key);
    if (raw) {
      const [scale, lat, lon, rot, lift] = raw.split(",").map(Number);
      out[l.key] = {
        scale: Number.isFinite(scale) ? scale : l.def.scale,
        lat: Number.isFinite(lat) ? lat : l.def.lat,
        lon: Number.isFinite(lon) ? lon : l.def.lon,
        rot: Number.isFinite(rot) ? rot : l.def.rot,
        lift: Number.isFinite(lift) ? lift : l.def.lift,
      };
    } else {
      out[l.key] = { ...l.def };
    }
  }
  return out;
}

/** Serializa a query string copiable: ?estadio=scale,lat,lon,rot,lift&... */
function serializeXfs(xfs: Record<string, Xf>): string {
  const parts = LANDMARKS.map((l) => {
    const x = xfs[l.key] ?? l.def;
    const n = (v: number, d = 2) => Number(v.toFixed(d));
    return `${l.key}=${n(x.scale)},${n(x.lat, 1)},${n(x.lon, 1)},${n(x.rot, 1)},${n(x.lift, 3)}`;
  });
  return "?" + parts.join("&");
}

const SLIDERS: { field: keyof Xf; label: string; min: number; max: number; step: number; unit: string }[] = [
  { field: "scale", label: "Escala", min: 0.02, max: 1.5, step: 0.01, unit: "" },
  { field: "lat",   label: "Lat",    min: -90, max: 90, step: 0.5, unit: "°" },
  { field: "lon",   label: "Lon",    min: 0, max: 360, step: 0.5, unit: "°" },
  { field: "rot",   label: "Rot",    min: -180, max: 180, step: 1, unit: "°" },
  { field: "lift",  label: "Altura", min: -0.2, max: 0.6, step: 0.005, unit: "" },
];

function CalibrationPanel({ xfs, setXfs }: { xfs: Record<string, Xf>; setXfs: (x: Record<string, Xf>) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(LANDMARKS[0].key);
  const [copied, setCopied] = useState(false);
  const qs = serializeXfs(xfs);

  // Sincroniza la URL en vivo (sin navegar) → la propia URL lleva los números.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.history.replaceState(null, "", window.location.pathname + qs);
  }, [qs]);

  const set = (field: keyof Xf, value: number) =>
    setXfs({ ...xfs, [active]: { ...xfs[active], [field]: value } });

  const reset = () => setXfs({ ...xfs, [active]: { ...DEFAULT_XFS[active] } });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(qs);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* iOS sin permiso de clipboard: la URL ya tiene los números */ }
  };

  const box: React.CSSProperties = {
    position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 50,
    maxWidth: 420, margin: "0 auto",
    background: "rgba(12,22,16,0.92)", color: "#EAF6EE",
    border: "1px solid rgba(255,255,255,0.14)", borderRadius: 14,
    padding: 12, backdropFilter: "blur(8px)",
    font: "13px/1.3 ui-sans-serif,system-ui,sans-serif", boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{ ...box, width: "auto", left: "auto", right: 12, padding: "10px 14px", cursor: "pointer" }}>
        ⚙︎ Calibrar landmarks
      </button>
    );
  }

  const cur = xfs[active];
  return (
    <div style={box}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong style={{ fontSize: 14 }}>Calibrar landmarks</strong>
        <button onClick={() => setOpen(false)} style={btn}>▾ ocultar</button>
      </div>

      {/* selector de landmark */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {LANDMARKS.map((l) => (
          <button key={l.key} onClick={() => setActive(l.key)}
            style={{ ...chip, ...(active === l.key ? chipOn : {}) }}>{l.label}</button>
        ))}
      </div>

      {/* sliders */}
      {SLIDERS.map((s) => (
        <label key={s.field} style={{ display: "block", marginBottom: 9 }}>
          <span style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ opacity: 0.85 }}>{s.label}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {Number(cur[s.field].toFixed(s.field === "lift" ? 3 : s.field === "scale" ? 2 : 1))}{s.unit}
            </span>
          </span>
          <input type="range" min={s.min} max={s.max} step={s.step} value={cur[s.field]}
            onChange={(e) => set(s.field, parseFloat(e.target.value))}
            style={{ width: "100%", accentColor: "#3DBB5B", height: 26 }} />
        </label>
      ))}

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button onClick={copy} style={{ ...btn, flex: 1 }}>{copied ? "✓ copiado" : "Copiar números"}</button>
        <button onClick={reset} style={btn}>Reset este</button>
      </div>

      {/* readout copiable — pásame esta línea con los números finales */}
      <code style={{
        display: "block", marginTop: 8, padding: "7px 8px", borderRadius: 8,
        background: "rgba(0,0,0,0.35)", color: "#B9F0C8", fontSize: 11, wordBreak: "break-all",
      }}>{qs}</code>
      <div style={{ opacity: 0.6, fontSize: 10.5, marginTop: 5 }}>
        formato por landmark: <b>scale, lat, lon, rot, altura</b> — la URL ya lleva los números.
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  background: "rgba(255,255,255,0.1)", color: "#EAF6EE", border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 9, padding: "8px 12px", fontSize: 12.5, cursor: "pointer",
};
const chip: React.CSSProperties = {
  background: "rgba(255,255,255,0.07)", color: "#CFE9D6", border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 999, padding: "5px 11px", fontSize: 12, cursor: "pointer",
};
const chipOn: React.CSSProperties = { background: "#3DBB5B", color: "#08120B", borderColor: "#3DBB5B" };

export function HeroWorld3D({ calibrate = false }: { calibrate?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  // En modo calibrate el transform de cada landmark es estado (los sliders lo mutan en vivo).
  // Fuera de calibrate usamos los defaults memoizados → sin overhead ni re-renders.
  const [xfs, setXfs] = useState<Record<string, Xf>>(DEFAULT_XFS);
  useEffect(() => { if (calibrate) setXfs(readXfsFromUrl()); }, [calibrate]);
  const activeXfs = calibrate ? xfs : DEFAULT_XFS;

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
    <Fragment>
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
            shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004}
            shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={4} shadow-camera-bottom={-4}
            shadow-camera-near={0.5} shadow-camera-far={20}
          />
          <Suspense fallback={null}>
            <World progress={progress} xfs={activeXfs} />
          </Suspense>
        </Canvas>
        <div className="kworld__hint">↕ scrollea — el mundo es geometría WebGL nativa (no video), fondo transparente</div>
      </div>
      {/* Panel de calibración: SOLO cuando /style lo pide. Zorro + mundo siempre visibles (arriba). */}
      {calibrate && <CalibrationPanel xfs={xfs} setXfs={setXfs} />}
    </Fragment>
  );
}
