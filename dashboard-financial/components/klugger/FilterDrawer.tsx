"use client";
// Klugger — Drawer / bottom-sheet de filtros (C4) con Vaul (swipe, velocity, damping nativos).
import { Drawer } from "vaul";
import { useState, type ReactNode } from "react";
import { Icon, UI } from "./icons";
import { Button, Toggle, Chip } from "./atoms";

const RECAMARAS = ["Todas", "1+", "2+", "3+", "4+"];
const TIPOS = ["Casa", "Departamento", "Terreno", "Oficina"];
const USOS = ["Habitacional", "Mixto", "Comercial"];

export function FilterDrawer({ trigger }: { trigger: ReactNode }) {
  const [rec, setRec] = useState("2+");
  const [tipo, setTipo] = useState<string[]>(["Departamento"]);
  const [uso, setUso] = useState("Habitacional");
  const [verificado, setVerificado] = useState(true);
  const [precio, setPrecio] = useState(20);
  const toggleTipo = (t: string) => setTipo((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

  return (
    <Drawer.Root>
      <Drawer.Trigger asChild>{trigger}</Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="kdrawer__overlay" />
        <Drawer.Content className="kdrawer">
          <div className="kdrawer__handle" />
          <div className="kdrawer__head">
            <Drawer.Title className="kdrawer__title">Filtros</Drawer.Title>
            <Drawer.Close className="knav__icon" aria-label="Cerrar"><Icon as={UI.X} size={20} /></Drawer.Close>
          </div>

          <div className="kdrawer__body">
            <label className="kfield">
              <span className="kfield__label">Presupuesto máx. <strong>${precio}k / mes</strong></span>
              <input type="range" min={5} max={80} value={precio} onChange={(e) => setPrecio(+e.target.value)} className="krange" aria-label="Presupuesto" />
            </label>

            <div className="kfield">
              <span className="kfield__label">Recámaras</span>
              <div className="kstyle-row">
                {RECAMARAS.map((r) => <Chip key={r} active={rec === r} onClick={() => setRec(r)}>{r}</Chip>)}
              </div>
            </div>

            <div className="kfield">
              <span className="kfield__label">Tipo de propiedad</span>
              <div className="kstyle-row">
                {TIPOS.map((t) => <Chip key={t} active={tipo.includes(t)} onClick={() => toggleTipo(t)}>{t}</Chip>)}
              </div>
            </div>

            <div className="kfield">
              <span className="kfield__label">Uso de suelo</span>
              <div className="kstyle-row">
                {USOS.map((u) => <Chip key={u} active={uso === u} onClick={() => setUso(u)}>{u}</Chip>)}
              </div>
            </div>

            <div className="kfield kfield--row">
              <Toggle on={verificado} onChange={setVerificado} label="Solo verificados" />
            </div>
          </div>

          <div className="kdrawer__foot">
            <Button variant="ghost">Limpiar</Button>
            <Drawer.Close asChild><Button variant="gradient">Ver 128 propiedades</Button></Drawer.Close>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
