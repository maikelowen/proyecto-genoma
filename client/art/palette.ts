/**
 * Paletas por familia (dirección visual: 2–3 colores + acento, contorno
 * oscuro del color de la familia, una sola sombra plana). Las híbridas
 * mezclan las paletas de sus dos componentes.
 */

export interface Palette {
  /** Color principal de la piel. */
  readonly main: string;
  /** Secundario (marcas, manchas). */
  readonly second: string;
  /** Acento (detalles pequeños: puntas, cristales, chispas). */
  readonly accent: string;
  /** Contorno: versión oscura del principal (nunca negro). */
  readonly dark: string;
  /** Único tono de sombra. */
  readonly shadow: string;
  /** Vientre / hocico (claro). */
  readonly belly: string;
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: string, b: string, t: number): string {
  const x = hex(a), y = hex(b);
  const out = x.map((v, i) => Math.round(v + ((y[i] as number) - v) * t));
  return "#" + out.map((v) => v.toString(16).padStart(2, "0")).join("");
}

type Base = Omit<Palette, "shadow" | "belly"> & { belly?: string };

function complete(p: Base): Palette {
  return {
    ...p,
    shadow: mix(p.main, p.dark, 0.3),
    belly: p.belly ?? mix(p.main, "#fffaf0", 0.6),
  };
}

const BASE: Record<string, Base> = {
  llama: { main: "#e8643a", second: "#f5a640", accent: "#ffe08a", dark: "#6e2414", belly: "#fcd7a6" },
  marea: { main: "#3d9bd6", second: "#5fd0c6", accent: "#f2f0dc", dark: "#173e63", belly: "#c4ecea" },
  brote: { main: "#6cb84f", second: "#c6d95a", accent: "#f4c63f", dark: "#2b5821", belly: "#e4efb6" },
  roca: { main: "#a38b72", second: "#c9b99d", accent: "#6cc6c0", dark: "#46382c", belly: "#ddd1bc" },
  voltio: { main: "#f0c232", second: "#f7e6a0", accent: "#4f78e6", dark: "#634409", belly: "#fff3c6" },
  sombra: { main: "#6b5aa8", second: "#3f396d", accent: "#f0d270", dark: "#221c44", belly: "#b8aae0" },
};

/** Híbridas: principal y secundario tomados de cada componente, acento propio. */
const HYBRID: Record<string, Base> = {
  vapor: { main: "#e3877a", second: "#79d0cb", accent: "#f2f0dc", dark: "#55283f" },
  magma: { main: "#8a675a", second: "#ef8a3a", accent: "#ffd66b", dark: "#3d221d" },
  tormenta: { main: "#4f80cf", second: "#f2d04a", accent: "#eaf4ff", dark: "#1d2c5c" },
  plasma: { main: "#ec6a86", second: "#f5d23c", accent: "#8ee6ff", dark: "#661d39" },
  espora: { main: "#8b7bc2", second: "#9fcd6a", accent: "#f3e6a8", dark: "#2c2849" },
  abismo: { main: "#2f6f9b", second: "#6b5aa8", accent: "#7ff0d6", dark: "#13253f" },
  liquen: { main: "#8ea86a", second: "#bba98e", accent: "#e6d45a", dark: "#333f29" },
};

const GREY: Base = { main: "#9a9aa6", second: "#c4c4cc", accent: "#f0d270", dark: "#34343e" };

/**
 * Paleta de una familia. `components` (si es híbrida) se usa para
 * híbridas sin paleta propia: mezcla de los componentes.
 */
export function paletteOf(family: string, components?: readonly [string, string]): Palette {
  const b = BASE[family] ?? HYBRID[family];
  if (b) return complete(b);
  if (components) {
    const a = BASE[components[0]] ?? GREY, c = BASE[components[1]] ?? GREY;
    return complete({ main: mix(a.main, c.main, 0.35), second: c.main, accent: c.accent, dark: mix(a.dark, c.dark, 0.5) });
  }
  return complete(GREY);
}
