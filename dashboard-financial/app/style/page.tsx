"use client";
// Klugger — guía viva del sistema (/style). Ola K0 del MASTERPLAN-CATALOGO.
// Scope aislado: no toca el dashboard financiero (usa data-theme propio).
// Entrada de secciones = CSS (klugger.css: kfadeup) → siempre visible. Framer solo para interacciones.
import "./klugger.css";
import { useState } from "react";
import { Toaster, toast } from "sonner";
import { Button, Toggle, Badge, Chip, Skeleton, ChatPill, ThemeSwitcher } from "@/components/klugger/atoms";
import { ScrollReveal } from "@/components/klugger/ScrollReveal";
import { Icon, UI, AnimatedIcon, Emoji } from "@/components/klugger/icons";
import { Logo } from "@/components/klugger/Logo";
import { Segmented, SearchBar, Navbar, BottomNav, Popover, Accordion, Pagination } from "@/components/klugger/molecules";
import { CommandPalette, useCommandK } from "@/components/klugger/CommandPalette";
import { FilterDrawer } from "@/components/klugger/FilterDrawer";
import { AVMWidget } from "@/components/klugger/AVM";
import { PriceHistory } from "@/components/klugger/PriceHistory";
import { PropertyCard, VerificationPanel, Shortlist, MapFirst, type Prop } from "@/components/klugger/organisms";
import { Gallery, FloorPlan, AgentCopilot, DataRoom } from "@/components/klugger/organisms-k2b";
import { HeroParallax, FoxScrollStory, FoxLineDraw, FoxMascot, Marquee } from "@/components/klugger/MovingArt";

const ZONAS = [
  { icon: UI.Building2, name: "Condesa", dato: "▲ 6.4% plusvalía · $58k/m²" },
  { icon: UI.Trees, name: "Coyoacán", dato: "Parques · casas coloniales" },
  { icon: UI.Waves, name: "Xochimilco", dato: "Chinampas · canales" },
  { icon: UI.Store, name: "Roma", dato: "Comercio · art-decó" },
  { icon: UI.MapPin, name: "Polanco", dato: "Premium · torres" },
  { icon: UI.Home, name: "San Ángel", dato: "Empedrado · plusvalía alta" },
];

const ART = ["#DCCAB4", "#918771", "#B4D94B", "#7CD6FF", "#335E2C", "#566757", "#FAF0DA", "#343631", "#57C6E8", "#C9B496"];
const BRAND = ["#2ED666", "#29BF5C", "#3B3B3B", "#2E9BD6", "#F4F6F5"];

const PROPS: Prop[] = [
  { id: "a", titulo: "Departamento en Condesa", zona: "Condesa", precio: 6_450_000, rec: 2, m2: 82, verificado: true, plus: 6.4, tint: ["#B4D94B", "#7CD6FF", "#DCCAB4"] },
  { id: "b", titulo: "Casa en Coyoacán", zona: "Coyoacán", precio: 8_900_000, rec: 3, m2: 140, verificado: true, nuevo: true, tint: ["#DCCAB4", "#C9B496", "#566757"] },
  { id: "c", titulo: "Loft en Roma Norte", zona: "Roma", precio: 5_200_000, rec: 1, m2: 58, verificado: false, plus: 4.1, tint: ["#57C6E8", "#B4D94B", "#FAF0DA"] },
  { id: "d", titulo: "PH en Polanco", zona: "Polanco", precio: 7_100_000, rec: 2, m2: 96, verificado: true, tint: ["#918771", "#DCCAB4", "#7CD6FF"] },
];

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="kstyle-sec">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export default function StyleGuide() {
  const [theme, setTheme] = useState("consumer");
  const [t1, setT1] = useState(true);
  const [chip, setChip] = useState("Precio");
  const [loading, setLoading] = useState(true);
  const [seg, setSeg] = useState<"Comprar" | "Rentar" | "Vender">("Comprar");
  const [cmdOpen, setCmdOpen] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  useCommandK(setCmdOpen);

  return (
    <div className="klugger-scope" data-theme={theme}>
      <Toaster position="bottom-right" theme={theme === "consumer" ? "light" : "dark"} />
      <div className="kstyle-wrap">
        <header className="kstyle-row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 30, margin: 0 }}>Klugger — Sistema de diseño</h1>
            <p style={{ color: "var(--text-muted)", marginTop: 6 }}>Guía viva · Ola K0 · craft de animación nivel Emil Kowalski</p>
          </div>
          <ThemeSwitcher value={theme} onChange={setTheme} />
        </header>

        <Sec title="Logo">
          <p style={{ color: "var(--text-muted)", marginBottom: 14 }}>
            Imagotipo (círculo + zorro) vectorizado · wordmark en <strong>Nexa Black</strong> como texto vivo (hereda el color del tema — en oscuro se vuelve blanco).
          </p>
          <div className="kstyle-row" style={{ alignItems: "center", gap: 32, flexWrap: "wrap" }}>
            <Logo variant="full" height={44} />
            <Logo variant="mark" height={44} />
            <Logo variant="wordmark" height={44} />
          </div>
          <div style={{ marginTop: 18, padding: "20px 24px", background: "#141414", borderRadius: 12, color: "#fff", display: "inline-flex" }}>
            <Logo variant="full" height={40} />
          </div>
        </Sec>

        <Sec title="Hero (v1 canónico)">
          <div className="khero">
            <img src="/assets/hero-cdmx-v1.jpg" alt="Mapa hero CDMX low-poly (v1 canónico)" />
          </div>
          <div style={{ marginTop: 16 }}>
            <ChatPill />
          </div>
        </Sec>

        <Sec title="Paleta">
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>Oficiales de marca</div>
          <div className="kstyle-row">{BRAND.map((c) => <span key={c} className="kswatch" style={{ background: c }} title={c} />)}</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", margin: "14px 0 8px" }}>Mundo / arte (hero v1)</div>
          <div className="kstyle-row">{ART.map((c) => <span key={c} className="kswatch" style={{ background: c }} title={c} />)}</div>
        </Sec>

        <Sec title="Botones">
          <div className="kstyle-row">
            <Button variant="primary">Agendar visita</Button>
            <Button variant="gradient">Valuar</Button>
            <Button variant="secondary">Guardar</Button>
            <Button variant="ghost">Compartir</Button>
            <Button variant="danger">Descartar</Button>
            <Button variant="primary" size="sm">sm</Button>
            <Button variant="primary" size="lg">lg</Button>
            <Button variant="primary" disabled>disabled</Button>
          </div>
        </Sec>

        <Sec title="Toggles / Switches">
          <div className="kstyle-row">
            <Toggle on={t1} onChange={setT1} label="Solo verificados" />
            <Toggle on={!t1} onChange={(v) => setT1(!v)} label="Con plusvalía" />
          </div>
        </Sec>

        <Sec title="Badges">
          <div className="kstyle-row">
            <Badge variant="verified"><Icon as={UI.BadgeCheck} size={13} /> Verificado</Badge>
            <Badge variant="new">Nuevo hace 1 h</Badge>
            <Badge variant="up"><Icon as={UI.TrendingUp} size={13} /> 4.2% plusvalía</Badge>
            <Badge variant="neutral">Departamento</Badge>
          </div>
        </Sec>

        <Sec title="Iconografía (nativa: Lucide SVG + emojis Twemoji + animados)">
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>Íconos de UI (Lucide, heredan color del tema)</div>
          <div className="kstyle-row" style={{ fontSize: 0 }}>
            {[UI.Search, UI.MapPin, UI.Home, UI.Building2, UI.Trees, UI.Waves, UI.Store, UI.Heart, UI.Share2, UI.Bell, UI.SlidersHorizontal, UI.BadgeCheck, UI.TrendingUp, UI.Check].map((I, i) => (
              <span key={i} style={{ display: "inline-flex", padding: 10, margin: 4, border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)" }}><Icon as={I} size={22} /></span>
            ))}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", margin: "14px 0 8px" }}>Iconogramas animados (Lucide + Framer, 60fps)</div>
          <div className="kstyle-row">
            {(["spin", "pulse", "shake", "draw"] as const).map((k) => (
              <span key={k} style={{ display: "inline-flex", gap: 8, alignItems: "center", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 10 }}><AnimatedIcon kind={k} /> <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{k}</span></span>
            ))}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", margin: "14px 0 8px" }}>Emojis consistentes (Twemoji SVG self-hosted)</div>
          <div className="kstyle-row" style={{ fontSize: 0 }}>
            {(["fox", "home", "pin", "party", "check", "key", "money", "city"] as const).map((e) => (
              <span key={e} style={{ padding: 8, margin: 4 }}><Emoji name={e} size={28} /></span>
            ))}
          </div>
        </Sec>

        <Sec title="Chips / filtros (orden budget-first)">
          <div className="kstyle-row">
            {["Precio", "Recámaras", "Tipo", "m²", "Uso de suelo", "Plusvalía", "Verificado", "Más"].map((c) => (
              <Chip key={c} active={chip === c} onClick={() => setChip(c)}>{c}</Chip>
            ))}
          </div>
        </Sec>

        <Sec title="Toast (Sonner) + Optimistic UI">
          <div className="kstyle-row">
            <Button onClick={() => toast.success("Guardado en tu shortlist", { description: "Invita a tu co-comprador para decidir juntos." })}>Guardar (toast)</Button>
            <Button variant="secondary" onClick={() => toast("Alerta creada", { description: "Te avisamos cuando un home cruce a tu presupuesto." })}>Crear alerta</Button>
          </div>
        </Sec>

        <Sec title="Skeletons">
          <div className="kstyle-row" style={{ alignItems: "stretch" }}>
            <div className="kcard" style={{ width: 240, padding: 12 }}>
              {loading ? (
                <>
                  <Skeleton h={130} radius={8} />
                  <div style={{ height: 10 }} />
                  <Skeleton w="60%" h={14} />
                  <div style={{ height: 8 }} />
                  <Skeleton w="40%" h={12} />
                </>
              ) : (
                <div>Contenido cargado ✓</div>
              )}
            </div>
            <Button variant="ghost" onClick={() => setLoading((v) => !v)}>Toggle carga</Button>
          </div>
        </Sec>

        <Sec title="Moléculas · Navbar (C13) — sticky transparente → sólido">
          <p style={{ color: "var(--text-muted)", marginBottom: 12 }}>Haz scroll dentro del marco: la barra pasa de transparente a sólida con blur. En móvil colapsa a hamburguesa.</p>
          <div className="knav-scroll">
            <Navbar />
            <div className="knav-scroll__filler">↑ scrollea para ver la barra solidificarse</div>
          </div>
        </Sec>

        <Sec title="Moléculas · Buscador (C11) + Segmented (C6)">
          <div style={{ marginBottom: 16 }}>
            <Segmented options={["Comprar", "Rentar", "Vender"] as const} value={seg} onChange={setSeg} />
            <span style={{ marginLeft: 12, fontSize: 13, color: "var(--text-muted)" }}>modo: {seg}</span>
          </div>
          <SearchBar onOpenPalette={() => setCmdOpen(true)} />
        </Sec>

        <Sec title="Moléculas · Filtros (C12) + Drawer Vaul (C4)">
          <p style={{ color: "var(--text-muted)", marginBottom: 12 }}>Orden budget-first; “Más filtros” abre un bottom-sheet con swipe/damping nativo (arrástralo para cerrar).</p>
          <div className="kstyle-row">
            {["Precio", "Recámaras", "Tipo", "m²", "Verificado"].map((c) => (
              <Chip key={c} active={chip === c} onClick={() => setChip(c)}>{c}</Chip>
            ))}
            <FilterDrawer trigger={<button className="kchip" data-active={false}><Icon as={UI.SlidersHorizontal} size={15} /> Más filtros</button>} />
          </div>
        </Sec>

        <Sec title="Moléculas · Command palette (C10) — ⌘K / Ctrl-K">
          <p style={{ color: "var(--text-muted)", marginBottom: 12 }}>Alta frecuencia → aparición instantánea (sin animación de entrada). Navega con ↑↓, Enter, Esc.</p>
          <Button variant="secondary" onClick={() => setCmdOpen(true)}>
            <Icon as={UI.Command} size={15} /> Abrir paleta <kbd className="kcmd__kbd" style={{ marginLeft: 4 }}>⌘K</kbd>
          </Button>
        </Sec>

        <Sec title="Moléculas · Popover (C2) + Accordion (C7) + Paginación (C9)">
          <div className="kstyle-row" style={{ alignItems: "flex-start", gap: 24 }}>
            <Popover trigger={({ toggle, open }) => (
              <Button variant="secondary" onClick={toggle}>Ordenar por <span style={{ display: "inline-flex", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}><Icon as={UI.ChevronDown} size={15} /></span></Button>
            )}>
              {["Relevancia", "Precio: menor a mayor", "Precio: mayor a menor", "Más recientes", "Mayor plusvalía"].map((o) => (
                <div key={o} className="kpop__row"><Icon as={UI.Check} size={16} /> {o}</div>
              ))}
            </Popover>
            <Pagination total={6} />
          </div>
          <div style={{ marginTop: 20, maxWidth: 620 }}>
            <Accordion items={[
              { q: "¿Cómo verifica Klugger una propiedad?", a: "Cotejamos título, geolocalización y dueño contra fuentes oficiales; cada ficha muestra qué se verificó y cuándo fue la última re-verificación." },
              { q: "¿Qué es la valuación (AVM)?", a: "Un estimado de valor con rango de confianza y los factores ponderados que lo explican (ubicación, m², plusvalía de la zona, comparables reales)." },
              { q: "¿Puedo decidir con alguien más?", a: "Sí: la shortlist es colaborativa — invita a tu co-comprador, voten y comparen en modo “Decidir”." },
            ]} />
          </div>
        </Sec>

        <Sec title="Moléculas · Bottom tab-bar (C14, móvil)">
          <p style={{ color: "var(--text-muted)", marginBottom: 12 }}>Indicador activo animado (spring). Se oculta en vista mapa. Preview en marco de teléfono:</p>
          <div style={{ width: 320, margin: "0 auto", border: "1px solid var(--border)", borderRadius: 28, overflow: "hidden", boxShadow: "var(--shadow-2)" }}>
            <div style={{ height: 200, background: "linear-gradient(160deg, color-mix(in srgb, var(--accent) 12%, var(--surface)), var(--surface))", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>contenido de la app</div>
            <BottomNav />
          </div>
        </Sec>

        <Sec title="Organismos · Mapa map-first (D1) + Cards (C1) — card↔pin linking">
          <p style={{ color: "var(--text-muted)", marginBottom: 12 }}>El mapa es el filtro. Pasa el cursor sobre un pin o una card: se resaltan enlazados. (Mapa mock; el real es Mapbox GL con capas.)</p>
          <div className="ksplit">
            <MapFirst active={pin} onHover={setPin} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {PROPS.map((p) => <PropertyCard key={p.id} p={p} active={pin === p.id} onHover={setPin} />)}
            </div>
          </div>
        </Sec>

        <Sec title="Organismos · AVM “Valuar” (D4) + Historial de precio (D6)">
          <p style={{ color: "var(--text-muted)", marginBottom: 12 }}>Regla de honestidad: siempre rango de confianza + factores ponderados + “por qué”, nunca un precio cerrado.</p>
          <div className="ksplit">
            <AVMWidget />
            <PriceHistory />
          </div>
        </Sec>

        <Sec title="Organismos · Verificación itemizada (D5) + Shortlist colaborativa (D7)">
          <div className="ksplit">
            <VerificationPanel />
            <Shortlist />
          </div>
        </Sec>

        <Sec title="Organismos · Galería/Lightbox (D2) + Floor-plan clicable (D3)">
          <div className="ksplit">
            <Gallery />
            <FloorPlan />
          </div>
        </Sec>

        <Sec title="Organismos · Copiloto del agente (D8) + Data room cifrado (D9)">
          <div className="ksplit">
            <AgentCopilot />
            <DataRoom />
          </div>
        </Sec>

        <Sec title="Arte en movimiento · Hero low-poly + parallax (F1/F3)">
          <HeroParallax />
        </Sec>

        <Sec title="Arte en movimiento · Marquee de colonias (F7)">
          <Marquee />
        </Sec>

        <Sec title="Arte en movimiento · Line-draw del imagotipo (F6) + Mascota-estados (F4)">
          <div className="ksplit">
            <div className="kcard" style={{ display: "flex", justifyContent: "center" }}><FoxLineDraw /></div>
            <div className="kcard"><FoxMascot /></div>
          </div>
        </Sec>

        <Sec title="Arte en movimiento · El zorro recorre el mapa (F2 · scroll-story pin+scrub)">
          <p style={{ color: "var(--text-muted)", marginBottom: 12 }}>Haz scroll: la sección se fija y el zorro cruza el mapa mientras avanza la narrativa (respeta prefers-reduced-motion).</p>
          <FoxScrollStory />
        </Sec>

        <Sec title="Arte en movimiento · Reveal on scroll (F8)">
          <p style={{ color: "var(--text-muted)", marginBottom: 12 }}>Cada tarjeta hace reveal al entrar en viewport (respeta prefers-reduced-motion).</p>
          <ScrollReveal>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
              {ZONAS.map((z, i) => (
                <div key={i} className="kcard" data-reveal style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ display: "inline-flex", width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", background: "color-mix(in srgb, var(--accent) 14%, var(--surface))", color: "var(--accent-2)" }}>
                    <Icon as={z.icon} size={22} />
                  </span>
                  <strong>{z.name}</strong>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{z.dato}</span>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </Sec>
      </div>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
