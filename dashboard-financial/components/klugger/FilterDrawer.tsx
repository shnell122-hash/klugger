"use client";
// Klugger — Drawer / bottom-sheet de filtros (C4) con Vaul (swipe, velocity, damping nativos).
// Controlable: si se pasan filters+onChange, el drawer refleja y emite ese estado (para
// conectarlo a un filtrado real). Si no, cae a estado interno (comportamiento original de /style).
import { Drawer } from "vaul";
import { useState, type ReactNode } from "react";
import { Icon, UI } from "./icons";
import { Button, Toggle, Chip } from "./atoms";

export const RECAMARAS = ["Todas", "1+", "2+", "3+", "4+"] as const;
export const TIPOS = ["Casa", "Departamento", "Terreno", "Oficina"] as const;
export const USOS = ["Todos", "Habitacional", "Mixto", "Comercial"] as const;

export type PropertyFilters = {
  precioMax: number;
  rec: (typeof RECAMARAS)[number];
  tipo: string[];
  uso: (typeof USOS)[number];
  verificado: boolean;
};

export const DEFAULT_FILTERS: PropertyFilters = {
  precioMax: 20, rec: "2+", tipo: ["Departamento"], uso: "Habitacional", verificado: true,
};

export type PriceConfig = { min: number; max: number; step: number; label: string; format: (v: number) => string };
const DEFAULT_PRICE: PriceConfig = { min: 5, max: 80, step: 1, label: "Presupuesto máx.", format: (v) => `$${v}k / mes` };

export function FilterDrawer({
  trigger, filters, onChange, onClear, resultCount, price = DEFAULT_PRICE,
}: {
  trigger: ReactNode;
  filters?: PropertyFilters;
  onChange?: (f: PropertyFilters) => void;
  onClear?: () => void;
  resultCount?: number;
  price?: PriceConfig;
}) {
  const [internal, setInternal] = useState<PropertyFilters>(DEFAULT_FILTERS);
  const value = filters ?? internal;
  const update = (patch: Partial<PropertyFilters>) => {
    const next = { ...value, ...patch };
    if (onChange) onChange(next); else setInternal(next);
  };
  const toggleTipo = (t: string) => update({ tipo: value.tipo.includes(t) ? value.tipo.filter((x) => x !== t) : [...value.tipo, t] });
  const clear = () => { if (onClear) onClear(); else setInternal(DEFAULT_FILTERS); };

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
              <span className="kfield__label">{price.label} <strong>{price.format(value.precioMax)}</strong></span>
              <input type="range" min={price.min} max={price.max} step={price.step} value={value.precioMax} onChange={(e) => update({ precioMax: +e.target.value })} className="krange" aria-label={price.label} />
            </label>

            <div className="kfield">
              <span className="kfield__label">Recámaras</span>
              <div className="kstyle-row">
                {RECAMARAS.map((r) => <Chip key={r} active={value.rec === r} onClick={() => update({ rec: r })}>{r}</Chip>)}
              </div>
            </div>

            <div className="kfield">
              <span className="kfield__label">Tipo de propiedad</span>
              <div className="kstyle-row">
                {TIPOS.map((t) => <Chip key={t} active={value.tipo.includes(t)} onClick={() => toggleTipo(t)}>{t}</Chip>)}
              </div>
            </div>

            <div className="kfield">
              <span className="kfield__label">Uso de suelo</span>
              <div className="kstyle-row">
                {USOS.map((u) => <Chip key={u} active={value.uso === u} onClick={() => update({ uso: u })}>{u}</Chip>)}
              </div>
            </div>

            <div className="kfield kfield--row">
              <Toggle on={value.verificado} onChange={(v) => update({ verificado: v })} label="Solo verificados" />
            </div>
          </div>

          <div className="kdrawer__foot">
            <Button variant="ghost" onClick={clear}>Limpiar</Button>
            <Drawer.Close asChild><Button variant="gradient">Ver {resultCount ?? "…"} propiedades</Button></Drawer.Close>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
