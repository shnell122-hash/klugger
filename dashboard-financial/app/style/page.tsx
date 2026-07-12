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

        <Sec title="Arte en movimiento (GSAP + ScrollTrigger)">
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
    </div>
  );
}
