"use client";
// Klugger — landing de compra para personas físicas (comprador individual).
// Buscador + chips + drawer de filtros están conectados a un filtrado real sobre el
// dataset mock de app/personas/data.ts (no hay backend de propiedades todavía).
import "../style/klugger.css";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import { Button, Badge, Chip } from "@/components/klugger/atoms";
import { ScrollReveal } from "@/components/klugger/ScrollReveal";
import { Icon, UI } from "@/components/klugger/icons";
import { Logo } from "@/components/klugger/Logo";
import { SearchBar, Navbar, Accordion, Pagination } from "@/components/klugger/molecules";
import { CommandPalette, useCommandK } from "@/components/klugger/CommandPalette";
import { FilterDrawer, DEFAULT_FILTERS, type PropertyFilters, type PriceConfig } from "@/components/klugger/FilterDrawer";
import { PropertyCard, VerificationPanel, Shortlist, MapFirst, type MapPin } from "@/components/klugger/organisms";
import { PROPS, ZONAS } from "./data";

const PAGE_SIZE = 3;

// Sin backend de venta todavía: el slider del drawer originalmente es de renta
// ($/mes); aquí lo reconfiguramos a rango de precio de venta (MXN).
const SALE_PRICE: PriceConfig = {
  min: 2_000_000, max: 15_000_000, step: 500_000,
  label: "Precio máximo",
  format: (v) => `$${(v / 1_000_000).toFixed(1)}M`,
};

// Filtros iniciales que NO ocultan nada — a diferencia de los defaults del /style
// guide (pensados solo como demo visual), aquí el punto es que el usuario vea todo
// el catálogo y vaya acotando.
const INITIAL_FILTERS: PropertyFilters = { ...DEFAULT_FILTERS, precioMax: SALE_PRICE.max, rec: "Todas", tipo: [], uso: "Todos", verificado: false };

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

const recMin = (rec: PropertyFilters["rec"]) => (rec === "Todas" ? 0 : parseInt(rec, 10));

export default function PersonasPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [soloPlus, setSoloPlus] = useState(false);
  const [filters, setFilters] = useState<PropertyFilters>(INITIAL_FILTERS);
  const [pin, setPin] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [cmdOpen, setCmdOpen] = useState(false);
  useCommandK(setCmdOpen);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    return PROPS.filter((p) => {
      if (term && !`${p.titulo} ${p.zona}`.toLowerCase().includes(term)) return false;
      if (p.precio > filters.precioMax) return false;
      if (p.rec < recMin(filters.rec)) return false;
      if (filters.tipo.length > 0 && !(p.tipo && filters.tipo.includes(p.tipo))) return false;
      if (filters.uso !== "Todos" && p.usoSuelo !== filters.uso) return false;
      if (filters.verificado && !p.verificado) return false;
      if (soloPlus && p.plus == null) return false;
      return true;
    });
  }, [q, filters, soloPlus]);

  // Cualquier cambio de filtro regresa a la página 1 (si no, podrías quedar en una página vacía).
  useEffect(() => { setPage(1); }, [q, filters, soloPlus]);

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const pageItems = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pins: MapPin[] = results.map((p) => ({ id: p.id, x: p.mapX, y: p.mapY, precio: `${(p.precio / 1_000_000).toFixed(1)}M` }));

  const clearFilters = () => { setFilters(INITIAL_FILTERS); setSoloPlus(false); setQ(""); };
  const goToProperty = (id: string) => router.push(`/personas/propiedad/${id}/`);

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
            <SearchBar
              modes={["Comprar"]}
              location={q}
              onLocationChange={setQ}
              onSubmit={() => document.getElementById("resultados")?.scrollIntoView({ behavior: "smooth" })}
              onOpenPalette={() => setCmdOpen(true)}
              placeholder="Colonia, delegación o metro — ej. Condesa, Metro Chabacano"
            />
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
          <div id="resultados" className="kstyle-row" style={{ marginBottom: 8 }}>
            <Chip active={filters.verificado} onClick={() => setFilters((f) => ({ ...f, verificado: !f.verificado }))}>
              <Icon as={UI.BadgeCheck} size={14} /> Solo verificadas
            </Chip>
            <Chip active={soloPlus} onClick={() => setSoloPlus((v) => !v)}>
              <Icon as={UI.TrendingUp} size={14} /> Con plusvalía
            </Chip>
            <FilterDrawer
              trigger={<button className="kchip" data-active={false}><Icon as={UI.SlidersHorizontal} size={15} /> Más filtros</button>}
              filters={filters}
              onChange={setFilters}
              onClear={clearFilters}
              resultCount={results.length}
              price={SALE_PRICE}
            />
            {(q || soloPlus || filters.verificado || filters.tipo.length > 0 || filters.uso !== "Todos" || filters.rec !== "Todas" || filters.precioMax < SALE_PRICE.max) && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>Limpiar filtros</Button>
            )}
          </div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
            {results.length === 0 ? "Ninguna propiedad coincide con tu búsqueda." : `${results.length} propiedad${results.length === 1 ? "" : "es"} encontrada${results.length === 1 ? "" : "s"}`}
          </p>

          {results.length === 0 ? (
            <div className="kcard" style={{ padding: 32, textAlign: "center" }}>
              <p style={{ marginBottom: 12 }}>No encontramos propiedades con esos filtros.</p>
              <Button variant="secondary" onClick={clearFilters}>Limpiar filtros</Button>
            </div>
          ) : (
            <>
              <div className="ksplit">
                <MapFirst active={pin} onHover={setPin} pins={pins} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {pageItems.map((p) => (
                    <PropertyCard key={p.id} p={p} active={pin === p.id} onHover={setPin} onClick={goToProperty} />
                  ))}
                </div>
              </div>
              {totalPages > 1 && (
                <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
                  <Pagination total={totalPages} page={page} onPageChange={setPage} />
                </div>
              )}
            </>
          )}
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
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
