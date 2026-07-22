"use client";
// Klugger — landing de compra para personas físicas (comprador individual).
// Reusa el sistema de diseño de /style (tema "consumer" = personas físicas, light/amigable).
// Un solo buscador (SearchBar, que ya trae su propio Comprar/Rentar/Vender) — sin ChatPill
// ni Segmented duplicados; el resto de la página se compone solo de piezas ya existentes.
import "../style/klugger.css";
import { useState } from "react";
import { Toaster, toast } from "sonner";
import { Button, Badge, Chip } from "@/components/klugger/atoms";
import { ScrollReveal } from "@/components/klugger/ScrollReveal";
import { Icon, UI } from "@/components/klugger/icons";
import { Logo } from "@/components/klugger/Logo";
import { SearchBar, Navbar, Accordion, Pagination } from "@/components/klugger/molecules";
import { FilterDrawer } from "@/components/klugger/FilterDrawer";
import { PropertyCard, VerificationPanel, Shortlist, MapFirst, type Prop } from "@/components/klugger/organisms";

const ZONAS = [
  { icon: UI.Building2, name: "Condesa", dato: "▲ 6.4% plusvalía · $58k/m²" },
  { icon: UI.Trees, name: "Coyoacán", dato: "Parques · casas coloniales" },
  { icon: UI.Waves, name: "Xochimilco", dato: "Chinampas · canales" },
  { icon: UI.Store, name: "Roma", dato: "Comercio · art-decó" },
  { icon: UI.MapPin, name: "Polanco", dato: "Premium · torres" },
  { icon: UI.Home, name: "San Ángel", dato: "Empedrado · plusvalía alta" },
];

const PROPS: Prop[] = [
  { id: "a", titulo: "Departamento en Condesa", zona: "Condesa", precio: 6_450_000, rec: 2, m2: 82, verificado: true, plus: 6.4, tint: ["#B4D94B", "#7CD6FF", "#DCCAB4"] },
  { id: "b", titulo: "Casa en Coyoacán", zona: "Coyoacán", precio: 8_900_000, rec: 3, m2: 140, verificado: true, nuevo: true, tint: ["#DCCAB4", "#C9B496", "#566757"] },
  { id: "c", titulo: "Loft en Roma Norte", zona: "Roma", precio: 5_200_000, rec: 1, m2: 58, verificado: false, plus: 4.1, tint: ["#57C6E8", "#B4D94B", "#FAF0DA"] },
  { id: "d", titulo: "PH en Polanco", zona: "Polanco", precio: 7_100_000, rec: 2, m2: 96, verificado: true, tint: ["#918771", "#DCCAB4", "#7CD6FF"] },
];

const CHIPS = ["Precio", "Recámaras", "Tipo", "m²", "Uso de suelo", "Plusvalía", "Verificado"];

const FAQ = [
  { q: "¿Cómo verifica Klugger una propiedad?", a: "Cotejamos título, geolocalización y dueño contra fuentes oficiales; cada ficha muestra qué se verificó y cuándo fue la última re-verificación." },
  { q: "¿Qué es la valuación (AVM)?", a: "Un estimado de valor con rango de confianza y los factores ponderados que lo explican (ubicación, m², plusvalía de la zona, comparables reales) — nunca un precio cerrado." },
  { q: "¿Puedo decidir con alguien más?", a: "Sí: la shortlist es colaborativa — invita a tu co-comprador, voten y comparen antes de agendar visita." },
];

function Sec({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="kstyle-sec">
      <h2>{title}</h2>
      {subtitle && <p style={{ color: "var(--text-muted)", marginTop: -4, marginBottom: 16 }}>{subtitle}</p>}
      {children}
    </section>
  );
}

export default function PersonasPage() {
  const [chip, setChip] = useState("Precio");
  const [pin, setPin] = useState<string | null>(null);

  return (
    <div className="klugger-scope" data-theme="consumer">
      <Toaster position="bottom-right" theme="light" />
      <Navbar />
      <div className="kstyle-wrap">
        <header>
          <h1 style={{ fontSize: 34, margin: 0 }}>Compra tu próxima propiedad con datos reales</h1>
          <p style={{ color: "var(--text-muted)", marginTop: 8, maxWidth: 560 }}>
            Propiedades verificadas, plusvalía transparente y una shortlist para decidir en familia — sin presión de vendedor.
          </p>
        </header>

        <section className="kstyle-sec">
          <div className="khero">
            <img src="/assets/hero-cdmx-v1.jpg" alt="Mapa CDMX — encuentra tu zona ideal para comprar" />
          </div>
          <div style={{ marginTop: 16 }}>
            <SearchBar />
          </div>
        </section>

        <section className="kstyle-sec">
          <div className="kstyle-row">
            <Badge variant="verified"><Icon as={UI.BadgeCheck} size={13} /> Propiedades verificadas</Badge>
            <Badge variant="up"><Icon as={UI.TrendingUp} size={13} /> Plusvalía transparente</Badge>
            <Badge variant="neutral">Decide en familia</Badge>
          </div>
        </section>

        <Sec title="Propiedades en venta para ti" subtitle="El mapa es el filtro: pasa el cursor sobre un pin o una tarjeta para ver el enlace.">
          <div className="kstyle-row" style={{ marginBottom: 16 }}>
            {CHIPS.map((c) => (
              <Chip key={c} active={chip === c} onClick={() => setChip(c)}>{c}</Chip>
            ))}
            <FilterDrawer trigger={<button className="kchip" data-active={false}><Icon as={UI.SlidersHorizontal} size={15} /> Más filtros</button>} />
          </div>
          <div className="ksplit">
            <MapFirst active={pin} onHover={setPin} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {PROPS.map((p) => <PropertyCard key={p.id} p={p} active={pin === p.id} onHover={setPin} />)}
            </div>
          </div>
          <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
            <Pagination total={6} />
          </div>
        </Sec>

        <Sec title="Zonas con datos, no promesas">
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

        <Sec title="Transparencia, siempre" subtitle="Verificamos cada propiedad y te dejamos decidir en equipo — sin sellos genéricos.">
          <div className="ksplit">
            <VerificationPanel />
            <Shortlist />
          </div>
        </Sec>

        <Sec title="Preguntas frecuentes">
          <div style={{ maxWidth: 620 }}>
            <Accordion items={FAQ} />
          </div>
        </Sec>

        <section className="kstyle-sec" style={{ textAlign: "center", padding: "48px 0 24px" }}>
          <Logo variant="mark" height={48} />
          <h2 style={{ marginTop: 16 }}>El zorro conoce la ciudad. Tú también, con Klugger.</h2>
          <p style={{ color: "var(--text-muted)", marginTop: 8, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
            ¿No encontraste lo que buscabas todavía? Un asesor te ayuda, o te avisamos en cuanto algo cruce tu presupuesto.
          </p>
          <div className="kstyle-row" style={{ marginTop: 16, justifyContent: "center" }}>
            <Button
              variant="gradient"
              size="lg"
              onClick={() => toast.success("Solicitud enviada", { description: "Un asesor Klugger te contactará en breve para ayudarte a comprar." })}
            >
              Hablar con un asesor
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => toast("Alerta creada", { description: "Te avisamos cuando una propiedad cruce tu presupuesto." })}
            >
              Crear alerta de precio
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
