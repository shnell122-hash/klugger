"use client";
// Klugger — átomos del sistema (K0). Estilos en app/style/klugger.css; motion en lib/motion.ts.
import { motion } from "framer-motion";
import { pressTap, pressTransition } from "@/lib/motion";
import type { ReactNode } from "react";

type BtnVariant = "primary" | "secondary" | "ghost" | "gradient" | "danger";
export function Button({
  children, variant = "primary", size, disabled, onClick,
}: { children: ReactNode; variant?: BtnVariant; size?: "sm" | "lg"; disabled?: boolean; onClick?: () => void }) {
  return (
    <motion.button
      className={`kbtn kbtn--${variant}${size ? ` kbtn--${size}` : ""}`}
      whileTap={disabled ? undefined : pressTap}
      transition={pressTransition}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </motion.button>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
      <button
        type="button" role="switch" aria-checked={on} className="ktoggle" data-on={on}
        onClick={() => onChange(!on)}
      >
        <motion.span
          className="ktoggle__knob"
          animate={{ x: on ? 18 : 0 }}
          transition={{ type: "spring", duration: 0.35, bounce: 0.2 }}
        />
      </button>
      {label && <span style={{ fontSize: 14, color: "var(--text)" }}>{label}</span>}
    </label>
  );
}

export function Badge({ children, variant = "neutral" }: { children: ReactNode; variant?: "verified" | "new" | "up" | "neutral" }) {
  return <span className={`kbadge kbadge--${variant}`}>{children}</span>;
}

export function Chip({ children, active, onClick }: { children: ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <motion.button className="kchip" data-active={!!active} onClick={onClick} whileTap={pressTap} transition={pressTransition}>
      {children}
    </motion.button>
  );
}

export function Skeleton({ w = "100%", h = 16, radius }: { w?: number | string; h?: number | string; radius?: number }) {
  return <span className="kskel" style={{ display: "block", width: w, height: h, borderRadius: radius }} aria-hidden />;
}

/** Chat pill "Ask Klugger" — búsqueda NL (patrón Zillow AI Mode). */
export function ChatPill({ placeholder = "Pregúntale a Klugger: “2 rec bajo $20k cerca de Metro Chabacano, buena plusvalía”" }: { placeholder?: string }) {
  return (
    <div className="kpill">
      <span aria-hidden style={{ fontSize: 18 }}>🔎</span>
      <input placeholder={placeholder} aria-label="Búsqueda en lenguaje natural" />
      <Button size="sm" variant="gradient">Buscar</Button>
    </div>
  );
}

const THEMES = [
  { id: "consumer", label: "☀️ Consumidor" },
  { id: "dev", label: "🌓 Desarrollador" },
  { id: "valuacion", label: "🌑 Valuación" },
] as const;
export function ThemeSwitcher({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  return (
    <div className="kstyle-row" role="tablist" aria-label="Tema">
      {THEMES.map((t) => (
        <Chip key={t.id} active={value === t.id} onClick={() => onChange(t.id)}>{t.label}</Chip>
      ))}
    </div>
  );
}
