// Klugger — logo lockup. Imagotipo (círculo verde + zorro, vectorizado) + wordmark
// "Klugger" como TEXTO VIVO en Nexa Black (--k-font-display) con currentColor:
// se adapta solo a tema claro/oscuro (en dark el wordmark se vuelve blanco).
// Solo el imagotipo es SVG; las letras nunca se trazan → sin bug de contadores.
import type { CSSProperties } from "react";

type Variant = "full" | "mark" | "wordmark";
export function Logo({
  variant = "full",
  height = 32,
  className,
  style,
}: {
  variant?: Variant;
  height?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const mark = (
    <img
      src="/assets/klugger-isotipo.svg"
      alt="Klugger"
      width={height}
      height={height}
      style={{ display: "block", width: height, height }}
    />
  );
  const word = (
    <span
      style={{
        fontFamily: "var(--k-font-display)",
        fontWeight: 900,
        fontSize: height * 0.82,
        lineHeight: 1,
        letterSpacing: "-0.01em",
        color: "currentColor",
      }}
    >
      Klugger
    </span>
  );

  if (variant === "mark") return <span className={className} style={style}>{mark}</span>;
  if (variant === "wordmark") return <span className={className} style={style}>{word}</span>;
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: height * 0.3, ...style }}
      aria-label="Klugger"
    >
      {mark}
      {word}
    </span>
  );
}
