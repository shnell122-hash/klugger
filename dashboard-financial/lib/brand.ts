// Klugger — paleta definitiva (fuente: estudios_mercado/paleta-definitiva.md)
// Oficiales del brandbook = intocables. Mundo/arte = hero CDMX v1.

/** Colores oficiales de marca (brandbook). No modificar. */
export const BRAND = {
  green1: "#2ED666", // primario
  green2: "#29BF5C", // secundario
  gray: "#3B3B3B", // texto/neutro
  blue: "#2E9BD6", // extremo azul del degradado (validar)
  light: "#F4F6F5", // fondo claro
} as const;

/** Degradado firma de marca (verde → azul). */
export const BRAND_GRADIENT = `linear-gradient(90deg, ${BRAND.green2}, ${BRAND.blue})`;

/** Paleta del mundo/arte, extraída del hero CDMX v1 (para ilustración low-poly). */
export const ART_PALETTE = {
  earth: "#DCCAB4",
  stone: "#918771",
  grass: "#B4D94B",
  sky: "#7CD6FF",
  forest: "#335E2C",
  slate: "#566757",
  cream: "#FAF0DA",
  ink: "#343631",
  water: "#57C6E8",
  sand: "#C9B496",
} as const;

/** Tipografía de marca. Display = Nexa Black (repo: public/fonts/nexa-black.ttf). */
export const FONTS = {
  display: '"Nexa Black", "Montserrat", system-ui, sans-serif',
  body: '"Open Sans", system-ui, -apple-system, sans-serif',
} as const;

/** Temas por audiencia (resueltos vía [data-theme]). */
export type KluggerTheme = "consumer" | "valuacion" | "dev";
