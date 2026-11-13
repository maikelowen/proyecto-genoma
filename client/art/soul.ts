/**
 * Arte de ánimas v3 (docs/arte/direccion-visual.md, sección "v3"), 2.ª iteración.
 *
 * Un ánima se dibuja solo a partir de sus genes (determinista: mismo genoma → mismo SVG).
 * No usa el RNG de reglas ni Math.random. Casi no hay variación por hash: lo que cambia entre
 * dos ánimas sale de un gen distinto (el hash solo desfasa la animación).
 *
 * Un gen = una zona fija (para leer la herencia):
 *  - cabeza → cara: temperamento (ojos, párpado, inclinación, vaivén) y boca (8 bocas o ninguna).
 *  - cuerpo → silueta (familia y variante del gen: 18 siluetas), proporción y núcleo del pecho
 *    (forma por gen, color de la familia del gen).
 *  - extremidades → rasgo (8), siempre grande y en tono claro de la familia del gen; la rareza
 *    añade detalle, brillo o segunda pieza, no tamaño.
 *  - cola → lo de debajo: cola y restos (forma y color de la familia del gen; cantidad por variante).
 * El color del cuerpo y de los ojos es el de la familia del ánima (la que da el tipo en combate).
 *
 * Complementos (gorro, gafas, colgante, monopatín): capa opcional de muestra, NO sale de los genes.
 *
 * Estilo: 3 capas de la misma silueta (oscura, media, clara), sin contorno ni degradados; ojos como
 * recortes de luz; halo plano del color de la familia; sin filtros SVG.
 * Reacciones: el SVG lleva los ojos de los 5 estados (idle, atk, hurt, low, ko) y la clase `m-<estado>`
 * del <svg> decide cuál se ve (CSS en SOUL_CSS).
 */
import type { Creature, Gene, GeneticsConfig } from "../../packages/core/src/index.ts";
import { f, hashStr } from "./geom.ts";
import { mix, paletteOf, type Palette } from "./palette.ts";

// ------------------------------------------------------------------ catálogos

export const TEMPERAMENTS = ["altivo", "aburrido", "travieso", "feroz", "timido", "desquiciado", "sereno", "astuto"] as const;
export type Temperament = (typeof TEMPERAMENTS)[number];
export const TEMPERAMENT_LABEL: Record<Temperament, string> = {
  altivo: "Altivo",
  aburrido: "Aburrido",
  travieso: "Travieso",
  feroz: "Feroz",
  timido: "Tímido",
  desquiciado: "Desquiciado",
  sereno: "Sereno",
  astuto: "Astuto",
};

export const MOUTHS = ["colmillos", "sierra", "lengua", "torcida", "cosida", "mueca", "abierta", "bostezo"] as const;
export type Mouth = (typeof MOUTHS)[number];
export const MOUTH_LABEL: Record<Mouth, string> = {
  colmillos: "Colmillos",
  sierra: "Dientes de sierra",
  lengua: "Lengua fuera",
  torcida: "Sonrisa torcida",
  cosida: "Boca cosida",
  mueca: "Mueca altiva",
  abierta: "Boca abierta",
  bostezo: "Bostezo",
};

export const TRAITS = ["cuernos", "halo roto", "bracitos", "orejas de llama", "alitas", "antenas", "corona de esquirlas", "cuerno único"] as const;
export const CORES = ["círculo", "rombo", "estrella", "media luna", "hexágono", "lágrima", "rayo", "anillo"] as const;
export const REMAINS = { llama: "brasas", marea: "gotas", brote: "hojas", roca: "esquirlas", voltio: "chispas", sombra: "jirones" } as const;
export const SILHOUETTES = {
  llama: ["brasa coronada", "ascua agrietada", "mecha"],
  marea: ["ola", "remolino", "gota alta"],
  brote: ["bulbo con hojas", "capullo", "brote enredado"],
  roca: ["bloque", "menhir", "drusa"],
  voltio: ["pila con rayo", "punta", "estrella"],
  sombra: ["capucha", "llama negra", "manto"],
} as const;

/** Complementos de muestra (futuros objetos equipables). No salen de los genes. */
export const ACCESSORIES = ["gorro", "gafas", "colgante", "monopatin"] as const;
export type Accessory = (typeof ACCESSORIES)[number];
export const ACCESSORY_LABEL: Record<Accessory, string> = { gorro: "Gorro (cabeza)", gafas: "Gafas (cara)", colgante: "Colgante (cuello)", monopatin: "Monopatín (base)" };

export type Mood = "idle" | "atk" | "hurt" | "low" | "ko";
export const MOODS: readonly Mood[] = ["idle", "atk", "hurt", "low", "ko"];

const BASES = ["llama", "marea", "brote", "roca", "voltio", "sombra"] as const;
type Base = (typeof BASES)[number];
const isBase = (s: string): s is Base => (BASES as readonly string[]).includes(s);

type Head = [Temperament, Mouth | null];
/**
 * Gen de cabeza (familia, variante 1–3) → temperamento y boca. Cada familia da 3 temperamentos;
 * 6 de los 18 genes no tienen boca (los serenos, los tímidos, un travieso y un astuto).
 */
const HEAD: Record<Base, [Head, Head, Head]> = {
  llama: [["feroz", "colmillos"], ["travieso", "lengua"], ["desquiciado", "sierra"]],
  marea: [["sereno", null], ["timido", null], ["astuto", "torcida"]],
  brote: [["travieso", null], ["timido", null], ["aburrido", "bostezo"]],
  roca: [["aburrido", "cosida"], ["altivo", "mueca"], ["feroz", "colmillos"]],
  voltio: [["desquiciado", "abierta"], ["astuto", null], ["travieso", "lengua"]],
  sombra: [["astuto", "torcida"], ["altivo", "mueca"], ["sereno", null]],
};
/** Gen de cuerpo → núcleo (índice de CORES). */
const CORE: Record<Base, [number, number, number]> = {
  llama: [5, 2, 1],
  marea: [0, 3, 5],
  brote: [7, 0, 3],
  roca: [4, 6, 1],
  voltio: [1, 2, 4],
  sombra: [3, 6, 7],
};
/** Gen de extremidades → rasgo (índice de TRAITS). */
const TRAIT: Record<Base, [number, number, number]> = {
  llama: [3, 0, 2],
  marea: [4, 5, 1],
  brote: [5, 2, 6],
  roca: [6, 0, 7],
  voltio: [5, 7, 1],
  sombra: [0, 4, 1],
};

/** Color de los ojos por familia: luz en contraste con el cuerpo (Voltio, cuerpo amarillo: azul eléctrico oscuro). */
const EYE: Record<Base, string> = {
  llama: "#fff2a6",
  marea: "#9af8ff",
  brote: "#fdffc4",
  roca: "#8ffcea",
  voltio: "#2f5be6",
  sombra: "#f59bff",
};
/** Luz del núcleo por familia del gen de cuerpo (siempre clara). */
const CORE_LIGHT: Record<Base, string> = { llama: "#ffe45c", marea: "#9af8ff", brote: "#e8ff6a", roca: "#8ffcea", voltio: "#7ae2ff", sombra: "#f59bff" };
/** Llama: cuerpo de brasa (más oscuro que el naranja de la paleta) para que el fuego y los ojos resalten. */
const BODY_OVERRIDE: Partial<Record<Base, { dark: string; mid: string; light: string }>> = {
  llama: { dark: "#4a160e", mid: "#9a2e1b", light: "#c9472a" },
};
const FLAME = { outer: "#ff9a2e", inner: "#ffe27a" };

// ------------------------------------------------------------------ siluetas (3 por familia, por gen de cuerpo)
// Coordenadas locales: centro del cuerpo en (0,0), ~50 de ancho, cima ≈ −22…−46, base ≈ +27.
// Solo M, L, Q y Z (se aplanan para calcular anclajes de rasgos).
const SIL: Record<Base, [string, string, string]> = {
  llama: [
    // brasa coronada: terrón ancho y achatado (la corona de fuego va en DECO)
    "M-26 8Q-28-6-19-14L-12-19Q-4-23 4-21L12-20Q21-18 25-9Q29 1 26 11Q22 25 2 27Q-19 27-26 8Z",
    // ascua agrietada: canto rodado redondo con grietas de luz (DECO)
    "M-23 14Q-28-4-18-18Q-8-27 3-27Q16-26 22-16Q28-4 25 12Q21 26 1 27Q-17 27-23 14Z",
    // mecha: cabo de vela con chorretones; la mecha y su llama van en DECO
    "M-20 24Q-22 4-21-13Q-21-20-14-21Q-11-16-8-20Q-2-23 4-20Q7-15 10-20Q19-21 20-13Q22 4 20 24Q9 28 0 27Q-9 28-20 24Z",
  ],
  marea: [
    "M0-30Q10-16 20-6Q30 6 20 20Q10 28-4 27Q-24 24-25 6Q-25-8-12-18Q-16-28-10-36Q-8-28 0-30Z",
    "M-26 14Q-30-4-16-16Q-4-26 10-24Q24-22 26-10Q20-16 12-12Q22-6 26 4Q30 18 18 24Q4 30-10 27Q-24 24-26 14Z",
    "M2-38Q8-26 16-16Q26-4 22 12Q16 27 0 27Q-18 27-22 12Q-26-2-14-14Q-18-22-14-30Q-10-22-4-22Q-2-30 2-38Z",
  ],
  brote: [
    "M0-24Q22-20 24 2Q24 26 0 27Q-24 26-24 2Q-22-20 0-24ZM-1-23Q-12-40-24-36Q-14-26-1-23ZM1-23Q12-44 26-40Q18-28 1-23Z",
    "M0-36Q18-20 20 2Q20 26 0 27Q-20 26-20 2Q-18-20 0-36ZM2-30Q14-46 25-42Q18-30 3-27Z",
    "M-6-26Q-14-36-12-44Q-4-36 0-28Q2-40 8-46Q10-34 6-26Q16-34 22-32Q16-26 12-22Q26-12 26 4Q26 26 0 27Q-26 26-26 4Q-26-18-6-26Z",
  ],
  roca: [
    "M-24 18L-26-4L-14-22L4-28L22-18L28 2L22 22L2 28L-16 27Z",
    "M-18 24L-20-12L-10-32L8-36L18-20L20 10L14 26L-2 28Z",
    "M-28 16L-26-6L-18-16L-16-30L-10-18L-2-22L2-38L8-20L16-18L20-28L22-12L28 0L26 18L10 27L-12 27Z",
  ],
  voltio: [
    "M0-26L22-14L22 14L0 27L-22 14L-22-14ZM-3-24L-9-36L-1-35L-5-48L7-31L1-31L4-24Z",
    "M0-40L20-6L14 18L0 28L-14 18L-20-6Z",
    "M0-30L8-18L24-22L18-6L26 6L16 12L14 26L0 20L-14 26L-16 12L-26 6L-18-6L-24-22L-8-18Z",
  ],
  sombra: [
    "M20 22Q14 16 10 20Q6 26 0 22Q-6 28-12 22Q-18 26-22 20Q-28 6-24-6Q-22-20-10-26Q-14-34-8-40Q-2-44 6-44Q0-38 4-32Q22-26 24-8Q28 6 20 22Z",
    "M-20 24Q-26 0-18-18Q-10-34 10-42Q4-30 14-22Q26-10 24 8Q24 20 18 26Q14 20 8 25Q2 20-4 26Q-10 20-14 26Q-18 22-20 24Z",
    "M-26 14Q-30-6-20-18Q-24-28-18-34Q-14-24-8-24Q-6-36 2-40Q0-28 6-24Q14-30 20-28Q16-22 20-16Q30-4 26 14Q22 24 14 20Q8 28 0 22Q-8 28-14 21Q-22 24-26 14Z",
  ],
};

/** Piezas de luz propias de una silueta (fuego de la familia Llama). Se dibujan dentro del cuerpo escalado. */
const DECO: Partial<Record<Base, [string, string, string]>> = {
  llama: [
    // corona de tres lenguas sobre el terrón
    `<path d="M-13-17Q-18-27-11-34Q-10-27-5-27Q-8-38 1-47Q2-36 6-31Q9-37 14-38Q16-27 12-17Q0-21-13-17Z" fill="${FLAME.outer}"/>` +
      `<path d="M-7-19Q-9-25-5-28Q-4-24-1-24Q-2-32 2-37Q4-29 6-26Q9-29 9-25Q9-21 7-19Q0-21-7-19Z" fill="${FLAME.inner}"/>`,
    // grietas de luz en los bordes y una lengua que sale de la grieta de arriba
    `<path d="M-14-23Q-19-31-13-38Q-11-31-8-29Q-9-26-10-23Z" fill="${FLAME.outer}"/>` +
      `<path d="M-12-24L-9-19L-13-15M25 4L19 7L21 12L16 15M-22 12L-16 11L-15 18M8 26L10 21L15 20" fill="none" stroke="${FLAME.outer}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M-12-24L-9-19L-13-15M25 4L19 7L21 12" fill="none" stroke="${FLAME.inner}" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round"/>`,
    // mecha y llama en gota, chorretones claros
    `<path d="M0-21Q-1-25 1-28" fill="none" stroke="#2a0d08" stroke-width="2" stroke-linecap="round"/>` +
      `<path d="M1-26Q-8-33 1-49Q10-33 1-26Z" fill="${FLAME.outer}"/><path d="M1-28Q-4-33 1-41Q6-33 1-28Z" fill="${FLAME.inner}"/>` +
      `<path d="M-14-21Q-15-12-13-9Q-11-12-11-19ZM10-20Q11-14 12-12Q14-14 14-20Z" fill="#e8643a"/>`,
  ],
};
/** Cima real (con DECO) para colocar rasgos que flotan. */
const DECO_TOP: Partial<Record<Base, [number, number, number]>> = { llama: [-47, -38, -49] };

type P = [number, number];

/** Aplana un path (M/L/Q/Z con números) en polígonos. */
function flatten(d: string): P[][] {
  const tok = d.match(/[MLQZ]|-?\d*\.?\d+/g) ?? [];
  const polys: P[][] = [];
  let cur: P[] = [];
  let i = 0;
  let cmd = "";
  const num = (): number => Number(tok[i++]);
  while (i < tok.length) {
    const t = tok[i] as string;
    if (/[MLQZ]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === "Z") {
        if (cur.length) polys.push(cur);
        cur = [];
        continue;
      }
    }
    if (cmd === "M") {
      if (cur.length) polys.push(cur);
      cur = [[num(), num()]];
      cmd = "L";
    } else if (cmd === "L") cur.push([num(), num()]);
    else if (cmd === "Q") {
      const p0 = cur[cur.length - 1] as P;
      const c: P = [num(), num()];
      const p1: P = [num(), num()];
      for (let k = 1; k <= 8; k++) {
        const s = k / 8, u = 1 - s;
        cur.push([u * u * p0[0] + 2 * u * s * c[0] + s * s * p1[0], u * u * p0[1] + 2 * u * s * c[1] + s * s * p1[1]]);
      }
    }
  }
  if (cur.length) polys.push(cur);
  return polys;
}

function crossings(polys: P[][], axis: 0 | 1, v: number): number[] {
  const o = 1 - axis;
  const out: number[] = [];
  for (const poly of polys) {
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k] as P, b = poly[(k + 1) % poly.length] as P;
      if ((a[axis] <= v && b[axis] > v) || (b[axis] <= v && a[axis] > v)) {
        const t = (v - a[axis]) / (b[axis] - a[axis]);
        out.push((a[o] as number) + t * ((b[o] as number) - (a[o] as number)));
      }
    }
  }
  return out;
}

interface Anchors {
  /** Cima del contorno en x (la menor y). */
  top(x: number): number;
  /** Media anchura a la altura y (lado derecho). */
  half(y: number): number;
  minY: number;
  bottom: number;
}
const anchorCache = new Map<string, Anchors>();
function anchors(d: string): Anchors {
  const hit = anchorCache.get(d);
  if (hit) return hit;
  // solo la primera subruta es el cuerpo (las demás son hojas o rayos)
  const all = flatten(d);
  const body = [all[0] as P[]];
  let minY = Infinity;
  for (const poly of all) for (const p of poly) minY = Math.min(minY, p[1]);
  const top = (x: number): number => Math.min(...crossings(body, 0, x), 0);
  const half = (y: number): number => Math.max(...crossings(body, 1, y), 8);
  const a: Anchors = { top, half, minY, bottom: Math.max(...crossings(body, 0, 0.01), 20) };
  anchorCache.set(d, a);
  return a;
}

// ------------------------------------------------------------------ aspecto (genes → descriptor)

export interface SoulLook {
  readonly family: string;
  /** Familia y variante de la silueta: las del gen de cuerpo. */
  readonly silFamily: Base;
  readonly variant: number;
  /** Paleta del cuerpo: la de la familia del ánima. */
  readonly pal: Palette;
  readonly eye: string;
  /** Color del halo (híbridas: el del segundo componente). */
  readonly halo: string;
  readonly halo2: string;
  temperament: Temperament;
  mouth: Mouth | null;
  readonly core: number;
  /** Color del núcleo: luz de la familia del gen de cuerpo. */
  readonly coreColor: string;
  readonly trait: number;
  /** Paleta del rasgo: la de la familia del gen de extremidades. */
  readonly traitPal: Palette;
  /** 0 común, 1 media, 2 rara (calidad alta, mutación o híbrida): más detalle, no más tamaño. */
  tier: number;
  readonly remains: Base;
  readonly tailPal: Palette;
  readonly tailVariant: number;
  readonly sx: number;
  readonly sy: number;
  readonly k: number;
  /** Solo para desfasar la animación. */
  readonly seed: number;
}

function variantOf(g: Gene): number {
  const m = /\.(\d+)$/.exec(g.id);
  const n = m ? Number(m[1]) - 1 : hashStr(g.id) % 3;
  return ((n % 3) + 3) % 3;
}
/** Familia base del gen para elegir pieza: la suya, o un componente fijo si es híbrida. */
function baseOf(fam: string, cfg: GeneticsConfig, salt: string): Base {
  if (isBase(fam)) return fam;
  const hy = cfg.hybridById.get(fam);
  if (hy) {
    const c = hy.components[hashStr(salt) % 2] as string;
    return (isBase(c) ? c : hy.components[0]) as Base;
  }
  return BASES[hashStr(fam + salt) % BASES.length] as Base;
}
function pick3<T>(table: Record<Base, [T, T, T]>, g: Gene, cfg: GeneticsConfig): T {
  return table[baseOf(g.family, cfg, g.id)][variantOf(g)] as T;
}
function eyeOf(fam: string, cfg: GeneticsConfig, table: Record<Base, string> = EYE): string {
  if (isBase(fam)) return table[fam];
  const hy = cfg.hybridById.get(fam);
  const c = hy?.components[1] as string | undefined;
  return c && isBase(c) ? table[c] : table.sombra;
}
function palOf(fam: string, cfg: GeneticsConfig): Palette {
  return paletteOf(fam, cfg.hybridById.get(fam)?.components);
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function lookOf(c: Creature, cfg: GeneticsConfig): SoulLook {
  const g = c.genome;
  const hy = cfg.hybridById.get(c.family);
  const pal = palOf(c.family, cfg);
  const genes = [g.cabeza.D, g.cuerpo.D, g.extremidades.D, g.cola.D];
  const seed = hashStr(genes.map((x) => x.id).join("|") + "|" + c.id);
  const b = g.cuerpo.D;
  const q = b.quality || 90;
  // proporción por el gen de cuerpo (su ancla: igual en padre y cría), en un rango corto
  const wide = (b.anchor.resistencia - b.anchor.velocidad) / q;
  const sx = clamp(1 + wide * 0.6, 0.92, 1.08);
  const sy = clamp(1 - wide * 0.4, 0.94, 1.06);
  const k = clamp(0.97 + ((b.quality - 85.5) / 9) * 0.06, 0.95, 1.03);
  const ex = g.extremidades.D;
  let tier = ex.quality >= 93 ? 2 : ex.quality >= 91.2 ? 1 : 0;
  if (ex.origin === "mutacion" || !isBase(ex.family)) tier = 2;
  if (hy) tier = Math.min(2, tier + 1);
  const [temperament, mouth] = pick3(HEAD, g.cabeza.D, cfg);
  return {
    family: c.family,
    silFamily: baseOf(b.family, cfg, b.id),
    variant: variantOf(b),
    pal,
    eye: eyeOf(c.family, cfg),
    halo: pal.main,
    halo2: hy && isBase(hy.components[1]) ? paletteOf(hy.components[1]).main : pal.main,
    temperament,
    mouth,
    core: pick3(CORE, b, cfg),
    coreColor: eyeOf(b.family, cfg, CORE_LIGHT),
    trait: pick3(TRAIT, ex, cfg),
    traitPal: palOf(ex.family, cfg),
    tier,
    remains: baseOf(g.cola.D.family, cfg, g.cola.D.id),
    tailPal: palOf(g.cola.D.family, cfg),
    tailVariant: variantOf(g.cola.D),
    sx,
    sy,
    k,
    seed,
  };
}

// ------------------------------------------------------------------ ojos

type EyeShape = "almond" | "lid" | "droop" | "fierce" | "happy" | "closed" | "round" | "chevron" | "flat";
interface EyeSpec {
  s: EyeShape;
  w: number;
  h: number;
  /** Desplazamiento (x hacia fuera, y abajo) y giro (grados, + = el extremo exterior baja). */
  dx?: number;
  dy?: number;
  rot?: number;
  /** Párpado para lid/droop: altura del borde superior en el lado interior y exterior (en unidades de h). */
  ti?: number;
  to?: number;
  /** Pupila oscura (desplazamiento en unidades de w/h; x hacia fuera). */
  pupil?: [number, number];
}
interface Face {
  L: EyeSpec;
  R: EyeSpec;
  gap?: number;
  dy?: number;
}

/** Path de un ojo con x hacia fuera (+) y centro en 0,0. */
function eyePath(e: EyeSpec): string {
  const { w, h } = e;
  switch (e.s) {
    case "almond":
      return `M${f(-w)} 0Q0 ${f(-2 * h)} ${f(w)} 0Q0 ${f(2 * h)} ${f(-w)} 0Z`;
    case "lid": {
      const ti = (e.ti ?? 0) * h, to = (e.to ?? 0) * h;
      return `M${f(-w)} ${f(ti)}L${f(w)} ${f(to)}Q${f(w * 0.1)} ${f(2.1 * h)} ${f(-w)} ${f(ti)}Z`;
    }
    case "droop": {
      const ti = (e.ti ?? -0.5) * h, to = (e.to ?? 0.4) * h;
      return `M${f(-w)} ${f(ti)}Q0 ${f(Math.min(ti, to) - 0.3 * h)} ${f(w)} ${f(to)}Q${f(w * 0.2)} ${f(1.9 * h)} ${f(-w)} ${f(ti)}Z`;
    }
    case "fierce":
      return `M${f(-w)} ${f(0.35 * h)}L${f(w)} ${f(-h)}Q${f(0.45 * w)} ${f(1.7 * h)} ${f(-w)} ${f(0.35 * h)}Z`;
    case "happy":
      return `M${f(-w)} ${f(0.6 * h)}Q0 ${f(-2.2 * h)} ${f(w)} ${f(0.6 * h)}Q0 ${f(-0.7 * h)} ${f(-w)} ${f(0.6 * h)}Z`;
    case "closed":
      return `M${f(-w)} ${f(-0.3 * h)}Q0 ${f(1.9 * h)} ${f(w)} ${f(-0.3 * h)}Q0 ${f(0.7 * h)} ${f(-w)} ${f(-0.3 * h)}Z`;
    case "round":
      return `M${f(-w)} 0A${f(w)} ${f(h)} 0 1 0 ${f(w)} 0A${f(w)} ${f(h)} 0 1 0 ${f(-w)} 0Z`;
    case "chevron":
      return `M${f(w)} ${f(-h)}L${f(-w)} 0L${f(w)} ${f(h)}L${f(0.35 * w)} 0Z`;
    case "flat":
      return `M${f(-w)} ${f(-0.45)}L${f(w)} ${f(-0.45)}L${f(w)} ${f(0.45)}L${f(-w)} ${f(0.45)}Z`;
  }
}

/**
 * Caras por temperamento. Los dos ojos miden casi lo mismo (≤ ~12 % de diferencia);
 * solo el desquiciado tiene uno enorme y otro diminuto.
 */
const FACES: Record<Temperament, Face> = {
  // párpados pesados y rectos, mirada por encima del hombro (pupilas abajo)
  altivo: { L: { s: "lid", w: 5.6, h: 3.1, ti: 0.15, to: -0.2, rot: -8, pupil: [0.1, 0.8] }, R: { s: "lid", w: 5.6, h: 3.1, ti: 0.3, to: -0.05, rot: -8, pupil: [0.15, 0.85] } },
  // rendijas caídas por fuera, sin pupila: mirada vacía
  aburrido: { L: { s: "droop", w: 5.4, h: 2.3, ti: -0.1, to: 0.7, dy: 1.2 }, R: { s: "droop", w: 5.6, h: 2.5, ti: -0.2, to: 0.6, dy: 0.9 } },
  // un ojo guiñado en sonrisa, el otro abierto mirando de reojo
  travieso: { L: { s: "happy", w: 5.3, h: 3, dy: 0.4 }, R: { s: "almond", w: 5.6, h: 3.5, pupil: [-0.35, 0.05], rot: -6 } },
  // ojos en V que bajan hacia el centro
  feroz: { L: { s: "fierce", w: 6.2, h: 3.6 }, R: { s: "fierce", w: 6.5, h: 3.8, dy: -0.3 } },
  // ojos pequeños, bajos y juntos, mirando abajo y a un lado
  timido: { L: { s: "round", w: 2.9, h: 3.3, pupil: [0.3, 0.45] }, R: { s: "round", w: 3.1, h: 3.4, pupil: [-0.2, 0.45] }, gap: 6.6, dy: 2.2 },
  // uno enorme y otro diminuto (la única asimetría fuerte)
  desquiciado: { L: { s: "round", w: 5.4, h: 5.6, pupil: [0.1, -0.05] }, R: { s: "round", w: 2, h: 2, dy: -1.5, dx: 1 }, gap: 9.4 },
  // cerrados en arco, en calma
  sereno: { L: { s: "closed", w: 5.2, h: 3, rot: 4 }, R: { s: "closed", w: 5.2, h: 3, rot: 4 } },
  // los dos entornados, mirando de lado
  astuto: { L: { s: "lid", w: 5.8, h: 2.5, ti: -0.1, to: 0.25, rot: 6, pupil: [0.45, 0.4] }, R: { s: "lid", w: 5.8, h: 2.8, ti: -0.3, to: 0.15, rot: -8, pupil: [-0.45, 0.35] } },
};

/** Reacciones: al atacar, al recibir, con poca vida y al caer. */
function moodFace(t: Temperament, m: Mood): Face {
  if (m === "idle") return FACES[t];
  if (m === "atk") {
    if (t === "timido") return { L: { s: "round", w: 3.8, h: 4.1 }, R: { s: "round", w: 3.8, h: 4.1 }, gap: 7.4, dy: 1 };
    if (t === "sereno") return { L: { s: "almond", w: 6.2, h: 3.4 }, R: { s: "almond", w: 6.2, h: 3.4 } };
    if (t === "desquiciado") return { L: { s: "round", w: 6.4, h: 6.6, pupil: [0, 0] }, R: { s: "fierce", w: 4, h: 2.8 }, gap: 9.6 };
    return { L: { s: "fierce", w: 6.6, h: 3.8 }, R: { s: "fierce", w: 6.8, h: 3.9, dy: -0.3 } };
  }
  if (m === "hurt") return { L: { s: "chevron", w: 4.4, h: 3.2 }, R: { s: "chevron", w: 4.4, h: 3.2 } };
  if (m === "low") return { L: { s: "droop", w: 5, h: 2.1, ti: 0.1, to: 0.7, dy: 1 }, R: { s: "droop", w: 5, h: 2.3, ti: 0, to: 0.6, dy: 1.3 } };
  return { L: { s: "flat", w: 4.4, h: 1, rot: 8 }, R: { s: "flat", w: 4.4, h: 1, rot: -8, dy: 0.8 } };
}

// ------------------------------------------------------------------ bocas (gen de cabeza)

interface MouthColors {
  hole: string;
  teeth: string;
  tongue: string;
}
/** Bocas planas sin contorno, centradas en 0,0 y de ~13 de ancho (legibles a 48 px). */
function mouthSvg(m: Mouth, c: MouthColors): string {
  const H = (d: string): string => `<path d="${d}" fill="${c.hole}"/>`;
  const W = (d: string): string => `<path d="${d}" fill="${c.teeth}"/>`;
  const S = (d: string, col: string, w: number): string => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  switch (m) {
    case "colmillos":
      // media luna oscura con dos colmillos que asoman por debajo
      return H("M-6.8-1.2Q0 3.2 6.8-1.2Q0 5.6-6.8-1.2Z") + W("M-5-0.2L-2.4 0.9L-3.9 5.2ZM5-0.2L2.4 0.9L3.9 5.2Z");
    case "sierra":
      // boca ancha abierta con dientes en zigzag arriba y abajo
      return H("M-7.2-1.6Q0-3.4 7.2-1.6Q6.2 4.6 0 5Q-6.2 4.6-7.2-1.6Z") + W("M-6.6-1.6L-5 1L-3.4-2.3L-1.7 1L0-2.5L1.7 1L3.4-2.3L5 1L6.6-1.6Q0-3.3-6.6-1.6Z") + W("M-5.4 3.7L-3.8 1.6L-2 4.4L0 1.6L2 4.4L3.8 1.6L5.4 3.7Q0 5.6-5.4 3.7Z");
    case "lengua":
      // sonrisa abierta con una lengua grande colgando a un lado
      return H("M-6.4-1.4Q0 0.6 6.4-1.4Q5.2 4 0 4.3Q-5.2 4-6.4-1.4Z") + `<path d="M-0.4 1.6Q4.6 0.6 4.9 4.4Q5.1 8 2.3 8.1Q-0.4 8.2-0.5 4.8Z" fill="${c.tongue}"/>` + S("M2.2 3.2L2.3 6", c.hole, 0.8);
    case "torcida":
      // sonrisa ladeada: sube hacia un lado, con hoyuelo
      return S("M-5.6 0.6Q0.5 2.6 5.4-2.4", c.hole, 2.2) + S("M4.1-3.6L6.6-1.4", c.hole, 1.4);
    case "cosida":
      // costura: línea oscura con cuatro puntadas claras
      return S("M-6 0L6 0", c.hole, 1.8) + S("M-4.2-2L-3.8 2M-1.4-2.1L-1.4 2.1M1.4-2.1L1.4 2.1M4.2-2L3.8 2", c.teeth, 1.2);
    case "mueca":
      // gesto altivo: boca pequeña hacia abajo, desplazada, con la comisura más baja
      return `<g transform="translate(1.6 0)">${H("M-4.6 2.2Q0-3 4.6 2.2Q0-0.6-4.6 2.2Z")}</g>`;
    case "abierta":
      // grito: óvalo grande abierto con la lengua al fondo
      return H("M-3.6 1.4A3.6 4.4 0 1 0 3.6 1.4A3.6 4.4 0 1 0-3.6 1.4Z") + `<path d="M-2.5 4.2Q0 1.8 2.5 4.2Q0 5.9-2.5 4.2Z" fill="${c.tongue}"/>`;
    case "bostezo":
      // bostezo ladeado y caído, con un diente suelto
      return `<g transform="translate(-1.5 0.5) rotate(-12)">${H("M-5.4 0Q-5 -2.4 0-2.2Q5-2 5.4 0.4Q4.6 3.6 0 3.6Q-4.8 3.4-5.4 0Z")}${W("M1.2-2.2L3.4-2L2.4 0Z")}</g>`;
  }
}

// ------------------------------------------------------------------ núcleo y restos

function corePath(i: number, r: number): string {
  const p = (x: number, y: number): string => `${f(x * r)} ${f(y * r)}`;
  switch (i) {
    case 0:
      return `M${p(-1, 0)}A${f(r)} ${f(r)} 0 1 0 ${p(1, 0)}A${f(r)} ${f(r)} 0 1 0 ${p(-1, 0)}Z`;
    case 1:
      return `M${p(0, -1.3)}L${p(0.85, 0)}L${p(0, 1.3)}L${p(-0.85, 0)}Z`;
    case 2:
      return `M${p(0, -1.35)}L${p(0.36, -0.36)}L${p(1.25, 0)}L${p(0.36, 0.36)}L${p(0, 1.35)}L${p(-0.36, 0.36)}L${p(-1.25, 0)}L${p(-0.36, -0.36)}Z`;
    case 3:
      return `M${p(0.3, -1.1)}A${f(1.1 * r)} ${f(1.1 * r)} 0 1 0 ${p(0.3, 1.1)}A${f(0.8 * r)} ${f(0.8 * r)} 0 1 1 ${p(0.3, -1.1)}Z`;
    case 4:
      return `M${p(0, -1.15)}L${p(1, -0.58)}L${p(1, 0.58)}L${p(0, 1.15)}L${p(-1, 0.58)}L${p(-1, -0.58)}Z`;
    case 5:
      return `M${p(0, -1.45)}Q${p(1.15, 0)} ${p(0.75, 0.6)}Q${p(0, 1.4)} ${p(-0.75, 0.6)}Q${p(-1.15, 0)} ${p(0, -1.45)}Z`;
    case 6:
      return `M${p(-0.2, -1.4)}L${p(0.75, -1.4)}L${p(0.2, -0.25)}L${p(0.8, -0.25)}L${p(-0.4, 1.45)}L${p(-0.05, 0.2)}L${p(-0.7, 0.2)}Z`;
    default:
      return `M${p(-1.15, 0)}A${f(1.15 * r)} ${f(1.15 * r)} 0 1 0 ${p(1.15, 0)}A${f(1.15 * r)} ${f(1.15 * r)} 0 1 0 ${p(-1.15, 0)}ZM${p(-0.5, 0)}A${f(0.5 * r)} ${f(0.5 * r)} 0 1 1 ${p(0.5, 0)}A${f(0.5 * r)} ${f(0.5 * r)} 0 1 1 ${p(-0.5, 0)}Z`;
  }
}

function remainPath(fam: Base, p: number): string {
  const q = (x: number, y: number): string => `${f(x * p)} ${f(y * p)}`;
  switch (fam) {
    case "llama":
      return `M${q(0, -1.6)}Q${q(1, 0)} ${q(0, 1)}Q${q(-1, 0)} ${q(0, -1.6)}Z`;
    case "marea":
      return `M${q(0, -1.5)}Q${q(0.9, -0.2)} ${q(0.8, 0.3)}Q${q(0.7, 1.1)} ${q(0, 1.1)}Q${q(-0.7, 1.1)} ${q(-0.8, 0.3)}Q${q(-0.9, -0.2)} ${q(0, -1.5)}Z`;
    case "brote":
      return `M${q(-1.3, 0.3)}Q${q(0, -1.3)} ${q(1.3, -0.3)}Q${q(0, 1.1)} ${q(-1.3, 0.3)}Z`;
    case "roca":
      return `M${q(0, -1.4)}L${q(0.8, 0.1)}L${q(0.1, 1.2)}L${q(-0.6, 0.3)}Z`;
    case "voltio":
      return `M${q(-0.7, -1.4)}L${q(0.7, -0.2)}L${q(0, 0)}L${q(0.8, 1.4)}L${q(-0.7, 0.2)}L${q(0, 0)}Z`;
    case "sombra":
      return `M${q(-1.3, 0.4)}Q${q(-0.2, -1.4)} ${q(1.3, -0.5)}Q${q(0, -0.5)} ${q(-1.3, 0.4)}Z`;
  }
}

const T = (x: number, y: number, rot = 0, s = 1): string => `translate(${f(x)} ${f(y)})${rot ? ` rotate(${f(rot)})` : ""}${s !== 1 ? ` scale(${(Math.round(s * 100) / 100).toString()})` : ""}`;

interface Colors {
  dark: string;
  mid: string;
  light: string;
  eye: string;
  core: string;
  pupil: string;
  /** Rasgo: tono claro y tono base de la familia del gen de extremidades. */
  tLight: string;
  tBase: string;
  /** Brillo del rasgo en raras. */
  tGlow: string;
}

interface Anch {
  top: (x: number) => number;
  half: (y: number) => number;
  minY: number;
}

/**
 * Rasgo de extremidades: siempre grande y en el tono claro de la familia del gen, para que no se
 * confunda con las puntas de la silueta. Rareza: 1 añade detalle (bandas, garras, pluma extra),
 * 2 además brillo y una segunda pieza. Devuelve [detrás del cuerpo, delante].
 */
/** Altura de la frente: los rasgos de cabeza nacen aquí, delante del cuerpo, para no perderse entre las puntas de la silueta. */
const FOREHEAD = -15;

function traitSvg(i: number, tier: number, a: Anch, c: Colors): [string, string] {
  const s = 1.35;
  const hw = a.half(-4);
  const glow = (x: number, y: number, r: number): string => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${c.tGlow}" opacity=".35"/><path transform="${T(x, y)}" d="${corePath(2, r * 0.55)}" fill="${c.tGlow}"/>`;
  switch (i) {
    case 0: {
      // cuernos: un par curvo hacia fuera
      const y = FOREHEAD;
      const x = Math.min(hw * 0.55, a.half(y) - 4);
      const len = 15.5 * s;
      const horn = (sx: number): string => {
        const band = tier >= 1 ? `<path d="M${f(-3.6)} ${f(-len * 0.28)}L3.5 ${f(-len * 0.33)}L3.2 ${f(-len * 0.45)}L${f(-3.1)} ${f(-len * 0.4)}Z" fill="${c.tBase}"/>` : "";
        const tip = tier === 2 ? `<path d="M${f(sx * 0.6)} ${f(-len * 0.72)}L${f(sx * 3.4)} ${f(-len)}L${f(sx * 2.6)} ${f(-len * 0.68)}Z" fill="${c.tGlow}"/>` : "";
        return `<g transform="${T(sx * x, y, sx * 28)}"><path d="M-5 0Q-4.2 ${f(-len * 0.6)} ${f(sx * 4)} ${f(-len)}Q1 ${f(-len * 0.5)} 5 0Z" fill="${c.tLight}"/>${band}${tip}</g>`;
      };
      return ["", horn(-1) + horn(1)];
    }
    case 1: {
      // halo roto: anillo inclinado con un hueco, flotando sobre la cabeza
      const y = a.minY - 6;
      const rx = 13, ry = 3.8;
      const gap = 1.1;
      const x1 = rx * Math.cos(gap), y1 = ry * Math.sin(gap);
      const frag1 = tier >= 1 ? `<path d="M${f(rx * 0.55)} ${f(ry + 2.6)}l3 -0.8l-0.6 2.6z" fill="${c.tLight}"/>` : "";
      const frag2 = tier === 2 ? glow(-rx - 3, -2, 3.2) : "";
      return ["", `<g transform="${T(0, y, -9)}"><path d="M${f(x1)} ${f(y1)}A${f(rx)} ${f(ry)} 0 1 1 ${f(rx)} 0" fill="none" stroke="${c.tLight}" stroke-width="3.2" stroke-linecap="round"/>${frag1}${frag2}</g>`];
    }
    case 2: {
      // bracitos a los lados, alzados
      const y = 4;
      const x = a.half(y) - 3;
      const arm = (sx: number, up: number): string => {
        const claws = tier >= 1 ? `<path d="M${f(sx * 14 * s)} ${f(-7.5 * s)}l${f(sx * 2.6)} -2.4l${f(-sx * 0.4)} 2.8zM${f(sx * 15.6 * s)} ${f(-4 * s)}l${f(sx * 3)} -0.6l${f(-sx * 1.6)} 2.4z" fill="${c.tBase}"/>` : "";
        const orb = tier === 2 ? glow(sx * 13 * s, -4.5 * s, 3) : "";
        return `<g transform="${T(sx * x, y, sx * up)}"><path d="M0 -3.6Q${f(sx * 9 * s)} -2.4 ${f(sx * 12 * s)} ${f(-7 * s)}Q${f(sx * 15 * s)} ${f(-1.2 * s)} ${f(sx * 8.5 * s)} 2.4Q${f(sx * 4)} 3.8 0 3.4Z" fill="${c.tLight}"/>${claws}${orb}</g>`;
      };
      return ["", arm(-1, -14) + arm(1, 22)];
    }
    case 3: {
      // orejas de llama: dos lenguas laterales hacia fuera
      const y = FOREHEAD + 2;
      const x = a.half(y) - 3;
      const ear = (sx: number): string => {
        const inner = tier >= 1 ? `<path d="M-1.6 -1Q-2 ${f(-6 * s)} ${f(sx * 1.4)} ${f(-10 * s)}Q1.6 ${f(-5 * s)} 2.6 -1Z" fill="${c.tBase}"/>` : "";
        const tip = tier === 2 ? glow(sx * 2.4, -16 * s, 2.4) : "";
        return `<g transform="${T(sx * x, y, sx * 62)}"><path d="M-4.6 0Q-5.6 ${f(-9 * s)} ${f(sx * 2.2)} ${f(-15 * s)}Q${f(sx * 1)} ${f(-8 * s)} 5.4 0Z" fill="${c.tLight}"/>${inner}${tip}</g>`;
      };
      return ["", ear(-1) + ear(1)];
    }
    case 4: {
      // alitas: plumas planas que salen de la espalda, por fuera de la silueta
      const y = -2;
      const x = a.half(y) - 4;
      const wing = (sx: number): string => {
        const feathers = tier >= 1 ? 3 : 2;
        let g = "";
        for (let k = 0; k < feathers; k++) g += `<path transform="rotate(${f(sx * (-22 + k * 20))})" d="M0 -2.4Q${f(sx * 10 * s)} ${f(-8.5 * s)} ${f(sx * 17 * s)} ${f(-4 * s)}Q${f(sx * 10 * s)} 0.4 0 3.2Z" fill="${k === 1 ? c.tBase : c.tLight}"/>`;
        if (tier === 2) g += glow(sx * 17 * s, -9 * s, 2.6);
        return `<g transform="${T(sx * x, y)}">${g}</g>`;
      };
      return [wing(-1) + wing(1), ""];
    }
    case 5: {
      // antenas con bola en la punta
      const x = 6;
      const ant = (sx: number): string => {
        const y0 = FOREHEAD - 1;
        const ex = sx * 7, ey = Math.min(a.minY - 6, -36) - y0;
        const ball = tier >= 1 ? c.tGlow : c.tLight;
        const ring = tier === 2 ? `<circle cx="${f(sx * x + ex)}" cy="${f(y0 + ey)}" r="5.6" fill="${c.tGlow}" opacity=".3"/>` : "";
        return `<path d="M${f(sx * x)} ${f(y0)}Q${f(sx * x + ex * 0.1)} ${f(y0 + ey * 0.7)} ${f(sx * x + ex)} ${f(y0 + ey)}" fill="none" stroke="${c.tLight}" stroke-width="2.2" stroke-linecap="round"/>${ring}<circle cx="${f(sx * x + ex)}" cy="${f(y0 + ey)}" r="3.3" fill="${ball}"/>`;
      };
      return ["", ant(-1) + ant(1)];
    }
    case 6: {
      // corona de esquirlas flotando
      const y = a.minY - 7;
      const n = tier === 2 ? 5 : 3;
      let g = "";
      for (let k = 0; k < n; k++) {
        const t = k / (n - 1) - 0.5;
        const mid = k === Math.floor(n / 2);
        const h = mid ? 14 : 10;
        const col = mid && tier >= 1 ? c.tGlow : k % 2 ? c.tBase : c.tLight;
        g += `<path transform="${T(t * 30, Math.abs(t) * 7, t * 40)}" d="M0 ${f(-h)}L4 0L0 2.6L-4 0Z" fill="${col}"/>`;
      }
      return ["", `<g transform="${T(0, y)}">${g}</g>`];
    }
    default: {
      // cuerno único, algo desplazado
      const x = 0;
      const y = FOREHEAD + 1;
      const len = 20;
      const band = tier >= 1 ? `<path d="M-3.2 ${f(-len * 0.3)}L3 ${f(-len * 0.4)}L2.6 ${f(-len * 0.5)}L-2.8 ${f(-len * 0.4)}Z M-2.4 ${f(-len * 0.55)}L2.2 ${f(-len * 0.64)}L1.9 ${f(-len * 0.72)}L-2 ${f(-len * 0.64)}Z" fill="${c.tBase}"/>` : "";
      const tip = tier === 2 ? glow(2, -len, 2.6) : "";
      return ["", `<g transform="${T(x, y, 6)}"><path d="M-4.4 0Q-3.4 ${f(-len * 0.6)} 2 ${f(-len)}Q1.8 ${f(-len * 0.5)} 4.4 0Z" fill="${c.tLight}"/>${band}${tip}</g>`];
    }
  }
}

/** Cola y restos (gen de cola): forma y color de su familia; la variante decide cola larga, sin cola o corta. */
function tailSvg(look: SoulLook, bottom: number, c: Colors): string {
  let out = "";
  const tp = look.tailPal;
  const v = look.tailVariant;
  if (v !== 1) {
    const len = v === 0 ? 15 : 10;
    const side = v === 0 ? 1 : -1;
    const d = `M-7 -3Q-4 ${f(len * 0.7)} ${f(side * 8)} ${f(len)}Q1 ${f(len * 0.55)} 7 -3Z`;
    out += `<path transform="translate(0 ${f(bottom)})" d="${d}" fill="${c.dark}"/><path transform="translate(0 ${f(bottom - 1)}) scale(.6)" d="${d}" fill="${c.mid}"/>`;
  }
  // posiciones fijas por variante
  const POS: [number, number, number, number][][] = [
    [[-15, 7, -20, 2.6], [16, 3, 25, 2.2]],
    [[-15, 4, -25, 2.6], [-5, 10, 10, 2.9], [6, 9, -15, 2.4], [16, 4, 20, 2.6]],
    [[-14, 6, -20, 2.5], [12, 7, 15, 2.6], [1, 14, 30, 2.1]],
  ];
  const lightT = mix(tp.main, "#ffffff", 0.35);
  for (const [k, [x, y, rot, p]] of (POS[v] ?? []).entries()) out += `<path transform="${T(x, bottom + y, rot)}" d="${remainPath(look.remains, p)}" fill="${k % 2 ? lightT : tp.main}"/>`;
  return out;
}

// ------------------------------------------------------------------ complementos (muestra; no salen de los genes)

function accessorySvg(acc: Accessory, a: Anch, eyeY: number, eyeGap: number, bottom: number): string {
  switch (acc) {
    case "gorro": {
      // gorro de lana con borla, encajado en la cabeza
      const y = a.top(0) + 6;
      return `<g transform="${T(0, y, -6)}"><path d="M-14 0Q-15-15 0-17Q15-15 14 0Z" fill="#3f9c8a"/><path d="M-10-12Q0-15 10-12L12-7Q0-10-12-7Z" fill="#e9dcc0"/><rect x="-16" y="-3" width="32" height="6.4" rx="3" fill="#e9dcc0"/><circle cy="-19" r="4.4" fill="#e2574c"/></g>`;
    }
    case "gafas": {
      // gafas redondas de cristal claro (los ojos se siguen viendo)
      const r = 7;
      const lens = (x: number): string => `<circle cx="${f(x)}" cy="${f(eyeY)}" r="${r}" fill="#bfefff" opacity=".22"/><circle cx="${f(x)}" cy="${f(eyeY)}" r="${r}" fill="none" stroke="#20202a" stroke-width="1.8"/>`;
      return lens(-eyeGap) + lens(eyeGap) + `<path d="M${f(-eyeGap + r)} ${f(eyeY - 1)}Q0 ${f(eyeY - 4)} ${f(eyeGap - r)} ${f(eyeY - 1)}" fill="none" stroke="#20202a" stroke-width="1.8"/>`;
    }
    case "colgante": {
      // cordón con una piedra colgando a un lado del núcleo
      const L = a.half(8) - 2;
      return `<path d="M${f(-L)} 7Q0 21 ${f(L)} 7" fill="none" stroke="#2a2433" stroke-width="1.6"/><g transform="translate(12.5 11)"><path d="M0 0L0 2.6" stroke="#d9b24a" stroke-width="1.4"/><path d="M0 2Q3.6 5 0 9.6Q-3.6 5 0 2Z" fill="#d9b24a"/><path d="M0 3.6Q2 5.4 0 8Q-2 5.4 0 3.6Z" fill="#e3577a"/></g>`;
    }
    case "monopatin": {
      // tabla con ruedas en lugar de los restos de debajo
      const y = bottom + 7;
      return `<g transform="translate(0 ${f(y)})"><path d="M-27-3Q-29-4-28-6Q-25-1-20-1L20-1Q25-1 28-6Q29-4 27-3Q25 2 19 2L-19 2Q-25 2-27-3Z" fill="#3a3f58"/><rect x="-16" y="-1" width="32" height="1.6" fill="#f2c94c"/><circle cx="-14" cy="5" r="3" fill="#e9e4d8"/><circle cx="14" cy="5" r="3" fill="#e9e4d8"/></g>`;
    }
  }
}

// ------------------------------------------------------------------ render

const SWAY: Record<Temperament, string> = {
  altivo: "quieto",
  aburrido: "perezoso",
  travieso: "rebote",
  feroz: "tenso",
  timido: "nervioso",
  desquiciado: "tic",
  sereno: "lento",
  astuto: "lateral",
};
/** Inclinación por temperamento (gen de cabeza): el altivo levanta la barbilla, el aburrido se deja caer. */
const TILT: Record<Temperament, number> = { altivo: -7, aburrido: 8, travieso: -5, feroz: 3, timido: 7, desquiciado: -9, sereno: 0, astuto: -4 };

export interface SoulRenderOptions {
  readonly size?: number;
  readonly mood?: Mood;
  /** Clases extra del <svg>. */
  readonly className?: string;
  /** Complemento de muestra (no sale de los genes; futuros objetos equipables). */
  readonly accessory?: Accessory;
}

export const VIEWBOX = "-58 -66 116 116";
/** Alturas fijas de la cara y el núcleo (coordenadas del cuerpo sin escalar). */
const EYE_Y = -6;
const MOUTH_Y = 4;
const CORE_Y = 17.5;

export function renderSoulLook(look: SoulLook, opts: SoulRenderOptions = {}): string {
  const t = look.temperament;
  const pal = look.pal;
  const ov = look.family === "llama" ? BODY_OVERRIDE.llama : undefined;
  const tp = look.traitPal;
  const c: Colors = {
    dark: ov?.dark ?? mix(pal.main, pal.dark, 0.5),
    mid: ov?.mid ?? pal.main,
    light: ov?.light ?? mix(pal.main, "#ffffff", 0.3),
    eye: look.eye === EYE.voltio ? look.eye : mix(look.eye, "#ffffff", 0.2),
    core: mix(look.coreColor, "#ffffff", 0.25),
    pupil: mix(pal.dark, "#000000", 0.45),
    tLight: mix(tp.main, "#fffaf0", 0.72),
    tBase: mix(tp.main, tp.dark, 0.25),
    tGlow: mix(tp.accent, "#ffffff", 0.3),
  };
  const d = SIL[look.silFamily][look.variant] as string;
  const an = anchors(d);
  const { sx, sy } = look;
  const decoTop = DECO_TOP[look.silFamily]?.[look.variant];
  const A: Anch = {
    top: (x: number) => an.top(x / sx) * sy,
    half: (y: number) => an.half(y / sy) * sx,
    minY: Math.min(an.minY, decoTop ?? 0) * sy,
  };
  const fs = 1.5 * clamp(0.92 + (sx - 1) * 0.6, 0.88, 1.06);
  const eyeY = EYE_Y * sy;
  const face = (m: Mood): string => {
    const fc = moodFace(t, m);
    const gap = (fc.gap ?? 8.6) * fs;
    const fy = eyeY + (fc.dy ?? 0) * fs;
    const one = (e: EyeSpec, side: -1 | 1): string => {
      const cx = side * (gap + (e.dx ?? 0) * fs), cy = fy + (e.dy ?? 0) * fs;
      const tr = `translate(${f(cx)} ${f(cy)}) scale(${f(side * fs)} ${f(fs)})${e.rot ? ` rotate(${f(e.rot)})` : ""}`;
      const pu = e.pupil && m !== "ko" ? `<ellipse cx="${f(e.pupil[0] * e.w)}" cy="${f(e.pupil[1] * e.h)}" rx="${f(Math.max(0.8, e.w * 0.17))}" ry="${f(Math.max(1.1, e.h * 0.6))}" fill="${c.pupil}"/>` : "";
      return `<g transform="${tr}"><path d="${eyePath(e)}" fill="${c.eye}"/>${pu}</g>`;
    };
    return `<g class="ey e-${m}"${m === "ko" ? ' opacity=".55"' : ""}>${one(fc.L, -1)}${one(fc.R, 1)}</g>`;
  };
  const eyes = MOODS.map(face).join("");
  const mouth = look.mouth
    ? `<g class="mo" transform="translate(0 ${f(MOUTH_Y * sy)}) scale(${f(fs * 0.95)})">${mouthSvg(look.mouth, { hole: c.pupil, teeth: mix(look.eye, "#ffffff", 0.55), tongue: "#ff6f8e" })}</g>`
    : "";
  // núcleo: resplandor + gema del color de la familia del gen de cuerpo + brillo
  const coreR = 5.4;
  const coreY = CORE_Y * sy;
  const core =
    `<circle cy="${f(coreY)}" r="${f(coreR * 1.6)}" fill="${c.core}" opacity=".18"/>` +
    `<path transform="translate(0 ${f(coreY)})" d="${corePath(look.core, coreR)}" fill="${c.core}"${look.core === 7 ? ' fill-rule="evenodd"' : ""}/>` +
    `<circle cx="${f(-coreR * 0.35)}" cy="${f(coreY - coreR * 0.4)}" r="1.1" fill="#ffffff" opacity=".75"/>`;
  const [tb, tf] = traitSvg(look.trait, look.tier, A, c);
  const bottom = an.bottom * sy;
  const tail = opts.accessory === "monopatin" ? "" : tailSvg(look, bottom, c);
  const deco = DECO[look.silFamily]?.[look.variant] ?? "";
  const body =
    `<g transform="scale(${f(sx)} ${f(sy)})">` +
    `<path d="${d}" fill="${c.dark}"/>` +
    `<path transform="translate(-2.4 -2.8) scale(.93)" d="${d}" fill="${c.light}"/>` +
    `<path transform="translate(1.3 0.4) scale(.85)" d="${d}" fill="${c.mid}"/>` +
    deco +
    `</g>`;
  const acc = opts.accessory ? accessorySvg(opts.accessory, A, eyeY, 8.6 * fs, bottom) : "";
  const sparks = look.tier === 2 ? `<path transform="${T(-36, -24)}" d="${corePath(2, 2.4)}" fill="${c.tGlow}" opacity=".85"/><path transform="${T(35, -6)}" d="${corePath(2, 1.8)}" fill="${c.tGlow}" opacity=".65"/>` : "";
  const haloOp = look.tier === 2 ? 0.2 : 0.14;
  const size = opts.size ?? 120;
  const delay = -((look.seed >>> 8) % 4000) / 1000;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}" width="${size}" height="${size}" class="soul3 m-${opts.mood ?? "idle"}${opts.className ? " " + opts.className : ""}" aria-hidden="true">` +
    `<circle class="halo" cy="-4" r="46" fill="${look.halo2}" opacity="${f(haloOp * 0.6)}"/><circle class="halo" cy="-2" r="33" fill="${look.halo}" opacity="${f(haloOp)}"/>` +
    sparks +
    `<g class="sw sw-${SWAY[t]}" style="animation-delay:${delay.toFixed(2)}s">` +
    `<g transform="translate(0 -2) rotate(${f(TILT[t])} 0 20) scale(${(look.k * 1.1).toFixed(3)})">` +
    tail +
    tb +
    body +
    (opts.accessory === "colgante" ? acc : "") +
    core +
    eyes +
    mouth +
    tf +
    (opts.accessory === "colgante" ? "" : acc) +
    `</g></g></svg>`
  );
}

const cache = new WeakMap<Creature, SoulLook>();
export function soulSvg(c: Creature, cfg: GeneticsConfig, opts: SoulRenderOptions = {}): string {
  let look = cache.get(c);
  if (!look) {
    look = lookOf(c, cfg);
    cache.set(c, look);
  }
  return renderSoulLook(look, opts);
}

/** CSS del arte v3: estado de los ojos según `m-<estado>` y vaivén por temperamento. Sin filtros. */
export const SOUL_CSS = `
.soul3 .ey,.soul3 .mo{display:none}
.soul3.m-idle .e-idle,.soul3.m-atk .e-atk,.soul3.m-hurt .e-hurt,.soul3.m-low .e-low,.soul3.m-ko .e-ko,.soul3.m-idle .mo,.soul3.m-atk .mo{display:inline}
.soul3.m-low .e-low{animation:s3flick 1.4s steps(1) infinite}
.soul3 .sw{transform-box:fill-box;transform-origin:50% 85%;animation-duration:4s;animation-timing-function:ease-in-out;animation-iteration-count:infinite}
.soul3 .sw-quieto{animation-name:s3quieto;animation-duration:5s}
.soul3 .sw-perezoso{animation-name:s3perezoso;animation-duration:6s}
.soul3 .sw-rebote{animation-name:s3rebote;animation-duration:1.3s}
.soul3 .sw-tenso{animation-name:s3tenso;animation-duration:1.5s}
.soul3 .sw-nervioso{animation-name:s3nervioso;animation-duration:.45s;animation-timing-function:linear}
.soul3 .sw-tic{animation-name:s3tic;animation-duration:2.6s;animation-timing-function:linear}
.soul3 .sw-lento{animation-name:s3lento;animation-duration:5.5s}
.soul3 .sw-lateral{animation-name:s3lateral;animation-duration:3.2s}
.soul3.m-ko .sw{animation:none}
@keyframes s3flick{0%,100%{opacity:1}45%{opacity:.35}55%{opacity:1}80%{opacity:.6}}
@keyframes s3quieto{0%,100%{transform:scale(1,1)}50%{transform:scale(1.015,.985)}}
@keyframes s3perezoso{0%,100%{transform:rotate(-2deg) translateY(0)}50%{transform:rotate(3.5deg) translateY(1.5px)}}
@keyframes s3rebote{0%,100%{transform:translateY(0) scale(1,1)}35%{transform:translateY(-4px) scale(.96,1.05)}65%{transform:translateY(0) scale(1.05,.95)}}
@keyframes s3tenso{0%,100%{transform:scale(1,1)}50%{transform:scale(1.04,.97) translateY(1px)}}
@keyframes s3nervioso{0%,100%{transform:translate(0,0)}25%{transform:translate(-.7px,.3px) rotate(-1deg)}50%{transform:translate(.6px,-.4px) rotate(.8deg)}75%{transform:translate(-.3px,-.3px)}}
@keyframes s3tic{0%,78%,100%{transform:rotate(0)}80%{transform:rotate(-7deg) translateX(-1px)}83%{transform:rotate(5deg)}86%{transform:rotate(-2deg)}89%{transform:rotate(0)}}
@keyframes s3lento{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes s3lateral{0%,100%{transform:rotate(-3deg) translateX(-1px)}50%{transform:rotate(3deg) translateX(1px)}}
@media (prefers-reduced-motion:reduce){.soul3 .sw{animation:none}.soul3.m-low .e-low{animation:none}}
`;
