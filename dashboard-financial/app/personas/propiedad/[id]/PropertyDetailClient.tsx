"use client";
// Klugger — detalle de propiedad (comprador individual). Reusa organismos existentes
// (Gallery, FloorPlan, VerificationPanel) — las fotos/plano siguen siendo demo-content
// hasta que haya un backend real de medios por propiedad.
import "../../../style/klugger.css";
import { useRouter } from "next/navigation";
import { Toaster, toast } from "sonner";
import { Button, Badge } from "@/components/klugger/atoms";
import { Icon, UI } from "@/components/klugger/icons";
import { Navbar } from "@/components/klugger/molecules";
import { Gallery, FloorPlan } from "@/components/klugger/organisms-k2b";
import { VerificationPanel, useFavorite, type Prop } from "@/components/klugger/organisms";

const fmtM = (n: number) => "$" + n.toLocaleString("es-MX");

export function PropertyDetailClient({ prop }: { prop: Prop & { descripcion: string } }) {
  const router = useRouter();
  const [fav, toggleFav] = useFavorite(prop.id);

  return (
    <div className="klugger-scope" data-theme="consumer">
      <Toaster position="bottom-right" theme="light" />
      <Navbar />
      <div className="kstyle-wrap">
        <button className="kbtn kbtn--ghost" style={{ padding: 0, marginBottom: 8 }} onClick={() => router.push("/personas/")}>
          <UI.ChevronDown size={16} style={{ transform: "rotate(90deg)" }} /> Volver a propiedades en venta
        </button>

        <section className="kstyle-sec" style={{ marginTop: 8 }}>
          <div className="kstyle-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="kstyle-row" style={{ marginBottom: 8 }}>
                {prop.verificado && <Badge variant="verified"><Icon as={UI.BadgeCheck} size={13} /> Verificado</Badge>}
                {prop.nuevo && <Badge variant="new">Nuevo</Badge>}
                {prop.plus != null && <Badge variant="up"><Icon as={UI.TrendingUp} size={13} /> {prop.plus}% plusvalía</Badge>}
                {prop.tipo && <Badge variant="neutral">{prop.tipo}</Badge>}
              </div>
              <h1 style={{ fontSize: 30, margin: 0 }}>{prop.titulo}</h1>
              <p style={{ color: "var(--text-muted)", marginTop: 6 }}><Icon as={UI.MapPin} size={14} /> {prop.zona} · {prop.rec > 0 ? `${prop.rec} rec · ` : ""}{prop.m2} m²</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "var(--k-font-display)", fontWeight: 900, fontSize: 30 }}>{fmtM(prop.precio)}</div>
              <div style={{ marginTop: 6 }}>
                <Button variant={fav ? "secondary" : "ghost"} size="sm" onClick={toggleFav}>
                  <UI.Heart size={15} fill={fav ? "currentColor" : "none"} /> {fav ? "Guardado" : "Guardar"}
                </Button>
              </div>
            </div>
          </div>
        </section>

        <Sec title="Fotos">
          <Gallery />
        </Sec>

        {prop.tipo !== "Terreno" && (
          <Sec title="Plano">
            <FloorPlan />
          </Sec>
        )}

        <Sec title="Descripción">
          <p style={{ color: "var(--text)", lineHeight: 1.6, maxWidth: 640 }}>{prop.descripcion}</p>
        </Sec>

        <Sec title="Transparencia, siempre" subtitle="Verificamos cada propiedad y te mostramos exactamente qué revisamos.">
          <VerificationPanel />
        </Sec>

        <section className="kstyle-sec" style={{ textAlign: "center", padding: "40px 0" }}>
          <h2>¿Te interesa esta propiedad?</h2>
          <div className="kstyle-row" style={{ marginTop: 16, justifyContent: "center" }}>
            <Button
              variant="gradient" size="lg"
              onClick={() => toast.success("Visita solicitada", { description: "Un asesor Klugger te contactará para agendar la visita." })}
            >
              Agendar visita
            </Button>
            <Button
              variant="secondary" size="lg"
              onClick={() => toast.success("Solicitud enviada", { description: "Un asesor Klugger te contactará en breve." })}
            >
              Hablar con un asesor
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function Sec({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="kstyle-sec">
      <h2>{title}</h2>
      {subtitle && <p style={{ color: "var(--text-muted)", marginTop: -4, marginBottom: 16 }}>{subtitle}</p>}
      {children}
    </section>
  );
}
