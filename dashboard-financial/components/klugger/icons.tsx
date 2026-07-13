"use client";
// Klugger — iconografía nativa (MASTERPLAN-ICONOGRAFIA).
// 1) UI icons = Lucide (SVG, currentColor). 2) Emojis = Twemoji SVG self-hosted. 3) Animados = Lucide+Framer.
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Search, Sun, SunMoon, Moon, Check, TrendingUp, Heart, Share2, MapPin, Home,
  Bell, Loader2, BadgeCheck, SlidersHorizontal, Building2, Trees, Waves, Store,
  ChevronDown, ChevronRight, X, Command, ArrowRight, Menu, User, Plus, Minus,
  MessageSquare, Map as MapIcon, LayoutGrid, CornerDownLeft,
} from "lucide-react";

/** Wrapper de ícono: tamaño, stroke y a11y consistentes; hereda color (currentColor). */
export function Icon({ as: As, size = 20, strokeWidth = 2, label }: { as: LucideIcon; size?: number; strokeWidth?: number; label?: string }) {
  return <As size={size} strokeWidth={strokeWidth} aria-hidden={label ? undefined : true} aria-label={label} focusable="false" />;
}

/** Set curado de UI (se expande según se necesite). */
export const UI = {
  Search, Sun, SunMoon, Moon, Check, TrendingUp, Heart, Share2, MapPin, Home,
  Bell, BadgeCheck, SlidersHorizontal, Building2, Trees, Waves, Store,
  ChevronDown, ChevronRight, X, Command, ArrowRight, Menu, User, Plus, Minus,
  MessageSquare, Map: MapIcon, LayoutGrid, Enter: CornerDownLeft,
};

/** Iconograma animado nativo (Lucide + Framer, transform/opacity 60fps). */
export function AnimatedIcon({ kind, size = 22 }: { kind: "spin" | "pulse" | "shake" | "draw"; size?: number }) {
  if (kind === "spin")
    return <motion.span style={{ display: "inline-flex" }} animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}><Loader2 size={size} /></motion.span>;
  if (kind === "pulse")
    return <motion.span style={{ display: "inline-flex", color: "#E0574E" }} animate={{ scale: [1, 1.18, 1] }} transition={{ repeat: Infinity, duration: 1.1, ease: [0.23, 1, 0.32, 1] }}><Heart size={size} fill="currentColor" /></motion.span>;
  if (kind === "shake")
    return <motion.span style={{ display: "inline-flex" }} animate={{ rotate: [0, -12, 12, -8, 8, 0] }} transition={{ repeat: Infinity, repeatDelay: 1.4, duration: 0.7 }}><Bell size={size} /></motion.span>;
  // draw: check que se dibuja
  return (
    <motion.span style={{ display: "inline-flex", color: "var(--accent-2)" }} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: [0, 1, 1], scale: [0.6, 1.15, 1] }} transition={{ repeat: Infinity, repeatDelay: 1.2, duration: 0.9, ease: [0.23, 1, 0.32, 1] }}>
      <BadgeCheck size={size} />
    </motion.span>
  );
}

/** Emoji consistente (SVG Twemoji self-hosted en /emoji/{codepoint}.svg). */
const EMOJI: Record<string, string> = {
  fox: "1f98a", home: "1f3e0", pin: "1f4cd", party: "1f389", check: "2705",
  key: "1f511", money: "1f4b0", house_garden: "1f3e1", city: "1f3d9",
};
export function Emoji({ name, size = 20, label }: { name: keyof typeof EMOJI; size?: number; label?: string }) {
  const cp = EMOJI[name];
  return <img src={`/emoji/${cp}.svg`} width={size} height={size} alt={label ?? name} loading="lazy" style={{ display: "inline-block", verticalAlign: "-0.15em" }} />;
}
