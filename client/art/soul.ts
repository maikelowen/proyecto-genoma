/**
 * Arte de almas v3 (docs/arte/direccion-visual.md, sección "v3").
 *
 * Un alma se dibuja solo a partir de sus genes (determinista: mismo genoma → mismo SVG).
 * No usa el RNG de reglas ni Math.random: la variación individual sale de un hash de los genes.
 *
 * Correspondencia locus → pieza (pocas piezas dibujadas a mano, con variación de tamaño y proporción):
 *  - familia del alma → silueta (3 variantes por familia; la elige la variante del gen de cuerpo).
 *  - cabeza → temperamento (8): forma de ojos y párpado, inclinación, boca (solo en 3), tipo de vaivén.
 *  - cuerpo → núcleo del pecho (8 formas) y proporciones (ancho/alto según sus valores).
 *  - extremidades → rasgo propio (8); tamaño según rareza (calidad del gen, mutación, híbrida).
 *  - cola → restos bajo el alma (6 tipos según la familia del gen) y cola en 2 de 3 variantes.
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

export const TRAITS = ["cuernos", "halo roto", "bracitos", "orejas de llama", "alitas", "antenas", "corona de esquirlas", "cuerno único"] as const;
export const CORES = ["círculo", "rombo", "estrella", "media luna", "hexágono", "lágrima", "grieta", "anillo"] as const;
export const REMAINS = { llama: "brasas", marea: "gotas", brote: "hojas", roca: "esquirlas", voltio: "chispas", sombra: "jirones" } as const;

export type Mood = "idle" | "atk" | "hurt" | "low" | "ko";
export const MOODS: readonly Mood[] = ["idle", "atk", "hurt", "low", "ko"];

const BASES = ["llama", "marea", "brote", "roca", "voltio", "sombra"] as const;
type Base = (typeof BASES)[number];
const isBase = (s: string): s is Base => (BASES as readonly string[]).includes(s);

/** Gen de cabeza (familia, variante 1–3) → temperamento. Cada familia da 3 distintos; los 8 salen 2–3 veces. */
const HEAD: Record<Base, [Temperament, Temperament, Temperament]> = {
  llama: ["feroz", "travieso", "desquiciado"],
  marea: ["sereno", "timido", "astuto"],
  brote: ["travieso", "timido", "aburrido"],
  roca: ["aburrido", "altivo", "feroz"],
  voltio: ["desquiciado", "astuto", "travieso"],
  sombra: ["astuto", "altivo", "sereno"],
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

/** Color de los ojos (luz) por familia: luminoso y en contraste con el cuerpo. */
const EYE: Record<Base, string> = {
  llama: "#ffe45c",
  marea: "#9af8ff",
  brote: "#f0ff7a",
  roca: "#8ffcea",
  voltio: "#7ae2ff",
  sombra: "#f59bff",
};

// ------------------------------------------------------------------ siluetas (3 por familia)
// Coordenadas locales: centro del cuerpo en (0,0), ~52 de ancho, cima ≈ −30…−46, base ≈ +27.
// Solo M, L, Q y Z (se aplanan para calcular anclajes de rasgos).
const SIL: Record<Base, [string, string, string]> = {
  llama: [
    "M-20 18Q-27 4-20-8Q-17-2-13-4Q-16-20-4-30Q-5-18 2-16Q4-30 14-38Q12-22 19-12Q27 0 22 14Q18 26 0 26Q-14 26-20 18Z",
    "M-22 16Q-28 0-18-12Q-16-4-10-6Q-8-22 6-30Q4-18 10-14Q16-26 26-28Q20-18 22-6Q28 8 20 20Q12 27-2 27Q-16 26-22 16Z",
    "M-18 18Q-26 2-16-12Q-8-22-2-28Q4-34 2-44Q14-36 14-24Q14-16 20-10Q26 0 22 14Q16 26 0 26Q-12 26-18 18Z",
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
  readonly silFamily: Base;
  readonly variant: number;
  readonly pal: Palette;
  readonly eye: string;
  /** Color del halo (híbridas: el del segundo componente). */
  readonly halo: string;
  readonly halo2: string;
  temperament: Temperament;
  readonly core: number;
  readonly trait: number;
  /** 0 discreto (común), 1 medio, 2 llamativo (rara: calidad alta, mutación o híbrida). */
  tier: number;
  readonly remains: Base;
  readonly tailVariant: number;
  readonly sx: number;
  readonly sy: number;
  readonly k: number;
  readonly mirror: boolean;
  readonly seed: number;
}

function variantOf(g: Gene): number {
  const m = /\.(\d+)$/.exec(g.id);
  const n = m ? Number(m[1]) - 1 : hashStr(g.id) % 3;
  return ((n % 3) + 3) % 3;
}
/** Familia base para elegir pieza: la del gen, o un componente si es híbrida, o una por hash. */
function baseOf(fam: string, cfg: GeneticsConfig, salt: string): Base {
  if (isBase(fam)) return fam;
  const hy = cfg.hybridById.get(fam);
  if (hy) return (isBase(hy.components[hashStr(salt) % 2] as string) ? hy.components[hashStr(salt) % 2] : hy.components[0]) as Base;
  return BASES[hashStr(fam + salt) % BASES.length] as Base;
}
function pick3<T>(table: Record<Base, [T, T, T]>, g: Gene, cfg: GeneticsConfig): T {
  return table[baseOf(g.family, cfg, g.id)][variantOf(g)] as T;
}

/** Generador local (mulberry32) sembrado con un hash de los genes: solo para el dibujo. */
function artRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function lookOf(c: Creature, cfg: GeneticsConfig): SoulLook {
  const g = c.genome;
  const hy = cfg.hybridById.get(c.family);
  const silFamily: Base = hy ? (g.cuerpo.D.family === hy.components[1] && isBase(hy.components[1]) ? hy.components[1] : (hy.components[0] as Base)) : baseOf(c.family, cfg, "sil");
  const pal = paletteOf(c.family, hy?.components);
  const eyeFam: Base = hy && isBase(hy.components[1]) ? hy.components[1] : silFamily;
  const genes = [g.cabeza.D, g.cuerpo.D, g.extremidades.D, g.cola.D];
  const seed = hashStr(genes.map((x) => `${x.id}:${x.values.potencia},${x.values.velocidad},${x.values.resistencia}`).join("|") + "|" + g.cabeza.R1.id + g.cuerpo.R1.id);
  const b = g.cuerpo.D;
  const q = b.quality || 90;
  // proporciones: resistencia ensancha, velocidad estira; la desviación individual se amplifica
  const wide = (b.values.resistencia - b.values.velocidad) / q;
  const devW = (b.values.resistencia - b.anchor.resistencia) / 6;
  const devH = (b.values.velocidad - b.anchor.velocidad) / 6;
  const sx = clamp(1 + wide * 0.9 + devW * 0.06, 0.84, 1.16);
  const sy = clamp(1 - wide * 0.6 + devH * 0.06, 0.88, 1.14);
  const avgQ = genes.reduce((s, x) => s + x.quality, 0) / 4;
  const k = clamp(0.94 + ((avgQ - 85.5) / 9) * 0.14 + (b.values.potencia / q - 0.333) * 0.3, 0.9, 1.1);
  const ex = g.extremidades.D;
  let tier = ex.quality >= 93 ? 2 : ex.quality >= 91.2 ? 1 : 0;
  if (ex.origin === "mutacion" || !isBase(ex.family)) tier = 2;
  if (hy) tier = Math.min(2, tier + 1);
  return {
    family: c.family,
    silFamily,
    variant: variantOf(b),
    pal,
    eye: EYE[eyeFam],
    halo: pal.main,
    halo2: hy && isBase(hy.components[1]) ? paletteOf(hy.components[1]).main : pal.main,
    temperament: pick3(HEAD, g.cabeza.D, cfg),
    core: pick3(CORE, b, cfg),
    trait: pick3(TRAIT, ex, cfg),
    tier,
    remains: baseOf(g.cola.D.family, cfg, g.cola.D.id),
    tailVariant: variantOf(g.cola.D),
    sx,
    sy,
    k,
    mirror: (seed & 1) === 1,
    seed,
  };
}

// ------------------------------------------------------------------ ojos y bocas

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

const FACES: Record<Temperament, Face> = {
  // párpados planos a media asta, el exterior algo más alto; el derecho más cerrado
  altivo: { L: { s: "lid", w: 5.6, h: 3.2, ti: 0.05, to: -0.4, rot: -6, pupil: [0.05, 0.75] }, R: { s: "lid", w: 5.6, h: 3.2, ti: 0.35, to: 0, rot: -6, pupil: [0.1, 0.8] } },
  // rendijas caídas por fuera, una más baja
  aburrido: { L: { s: "droop", w: 5.2, h: 2.2, ti: 0, to: 0.7, dy: 1.6 }, R: { s: "droop", w: 5.8, h: 2.6, ti: -0.4, to: 0.45, dy: 0.8 } },
  // un ojo cerrado en sonrisa, el otro abierto mirando de reojo
  travieso: { L: { s: "happy", w: 5, h: 2.8, dy: 0.5 }, R: { s: "almond", w: 5.6, h: 3.6, pupil: [-0.35, 0.05], rot: -6 } },
  // ojos en V que bajan hacia el centro; el derecho más grande
  feroz: { L: { s: "fierce", w: 6, h: 3.4 }, R: { s: "fierce", w: 6.6, h: 3.8, dy: -0.4 } },
  // ojos pequeños, bajos y juntos, mirando abajo y a un lado
  timido: { L: { s: "round", w: 2.7, h: 3.1, pupil: [0.3, 0.45] }, R: { s: "lid", w: 2.9, h: 2.9, ti: -0.1, to: 0.2, pupil: [-0.2, 0.45] }, gap: 6.4, dy: 2.4 },
  // uno enorme y otro diminuto
  desquiciado: { L: { s: "round", w: 5.4, h: 5.6, pupil: [0.1, -0.05] }, R: { s: "round", w: 1.9, h: 1.9, dy: -1.5, dx: 1 }, gap: 9.6 },
  // cerrados en arco, en calma
  sereno: { L: { s: "closed", w: 5, h: 2.8, rot: 4 }, R: { s: "closed", w: 5, h: 2.8, rot: 4 } },
  // uno entornado y el otro levantado, mirando de lado
  astuto: { L: { s: "almond", w: 6, h: 1.6, rot: 8, pupil: [0.4, 0] }, R: { s: "lid", w: 5.6, h: 3.1, ti: -0.25, to: 0.2, rot: -10, pupil: [-0.45, 0.1] } },
};

/** Reacciones: al atacar, al recibir, con poca vida y al caer. */
function moodFace(t: Temperament, m: Mood): Face {
  if (m === "idle") return FACES[t];
  if (m === "atk") {
    if (t === "timido") return { L: { s: "round", w: 3.8, h: 4.2 }, R: { s: "round", w: 3.4, h: 3.8 }, gap: 7.4, dy: 1 };
    if (t === "sereno") return { L: { s: "almond", w: 6.2, h: 3.4 }, R: { s: "almond", w: 6.2, h: 3.4 } };
    if (t === "desquiciado") return { L: { s: "round", w: 6.4, h: 6.6, pupil: [0, 0] }, R: { s: "fierce", w: 4, h: 2.8 }, gap: 9.6 };
    return { L: { s: "fierce", w: 6.6, h: 3.8 }, R: { s: "fierce", w: 7, h: 4.1, dy: -0.4 } };
  }
  if (m === "hurt") return { L: { s: "chevron", w: 4.4, h: 3.2 }, R: { s: "chevron", w: 4.4, h: 3.2 } };
  if (m === "low") return { L: { s: "droop", w: 5, h: 2.1, ti: 0.1, to: 0.7, dy: 1 }, R: { s: "droop", w: 5, h: 2.3, ti: 0, to: 0.6, dy: 1.4 } };
  return { L: { s: "flat", w: 4.4, h: 1, rot: 8 }, R: { s: "flat", w: 4.4, h: 1, rot: -8, dy: 0.8 } };
}

/** Boca solo en 3 temperamentos: una línea de luz. */
const MOUTH: Partial<Record<Temperament, string>> = {
  travieso: "M-4.5 0Q0 3.4 5-1.6",
  feroz: "M-4 0.4L4 0.4",
  desquiciado: "M-6.5 0L-3.5 2L-0.5-0.6L2.5 2L5.5-0.4",
};
const FANG = "M0.8 0.4L3 0.4L1.9 3.2Z";

// ------------------------------------------------------------------ piezas

function corePath(i: number, r: number): string {
  const p = (x: number, y: number): string => `${f(x * r)} ${f(y * r)}`;
  switch (i) {
    case 0:
      return `M${p(-1, 0)}A${f(r)} ${f(r)} 0 1 0 ${p(1, 0)}A${f(r)} ${f(r)} 0 1 0 ${p(-1, 0)}Z`;
    case 1:
      return `M${p(0, -1.3)}L${p(0.8, 0)}L${p(0, 1.3)}L${p(-0.8, 0)}Z`;
    case 2:
      return `M${p(0, -1.4)}L${p(0.3, -0.3)}L${p(1.2, 0)}L${p(0.3, 0.3)}L${p(0, 1.4)}L${p(-0.3, 0.3)}L${p(-1.2, 0)}L${p(-0.3, -0.3)}Z`;
    case 3:
      return `M${p(0.3, -1.1)}A${f(1.1 * r)} ${f(1.1 * r)} 0 1 0 ${p(0.3, 1.1)}A${f(0.85 * r)} ${f(0.85 * r)} 0 1 1 ${p(0.3, -1.1)}Z`;
    case 4:
      return `M${p(0, -1.15)}L${p(1, -0.58)}L${p(1, 0.58)}L${p(0, 1.15)}L${p(-1, 0.58)}L${p(-1, -0.58)}Z`;
    case 5:
      return `M${p(0, -1.5)}Q${p(1.15, 0)} ${p(0.7, 0.6)}Q${p(0, 1.4)} ${p(-0.7, 0.6)}Q${p(-1.15, 0)} ${p(0, -1.5)}Z`;
    case 6:
      return `M${p(-0.3, -1.5)}L${p(0.5, -0.4)}L${p(-0.05, -0.1)}L${p(0.6, 1.4)}L${p(-0.45, 0.2)}L${p(0.1, -0.15)}Z`;
    default:
      return `M${p(-1.15, 0)}A${f(1.15 * r)} ${f(1.15 * r)} 0 1 0 ${p(1.15, 0)}A${f(1.15 * r)} ${f(1.15 * r)} 0 1 0 ${p(-1.15, 0)}ZM${p(-0.55, 0)}A${f(0.55 * r)} ${f(0.55 * r)} 0 1 1 ${p(0.55, 0)}A${f(0.55 * r)} ${f(0.55 * r)} 0 1 1 ${p(-0.55, 0)}Z`;
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
  horn: string;
  eye: string;
  core: string;
  pupil: string;
}

/** Rasgo de extremidades. Devuelve [detrás del cuerpo, delante]. */
function traitSvg(i: number, tier: number, a: { top: (x: number) => number; half: (y: number) => number; minY: number }, c: Colors, r: () => number): [string, string] {
  const s = [0.85, 1.1, 1.45][tier] as number;
  const hw = a.half(-4);
  const extra = tier === 2;
  switch (i) {
    case 0: {
      // cuernos: un par curvo, el izquierdo algo distinto
      const x = hw * 0.45;
      const horn = (sx: number, lean: number, len: number): string => `<path transform="${T(sx * x, a.top(sx * x) + 3, sx * (14 + lean))}" d="M-3.4 0Q-3 ${f(-7 * len)} ${f(sx * 2.5)} ${f(-12 * len)}Q0.6 ${f(-6 * len)} 3.4 0Z" fill="${c.horn}"/>`;
      const l = 1 + r() * 0.2;
      return ["", horn(-1, 0, s * l) + horn(1, 6, s * (2.2 - l))];
    }
    case 1: {
      // halo roto: anillo inclinado con un hueco, flotando sobre la cabeza
      const y = a.minY - 2 - 2 * s;
      const rx = 9 * s + 3, ry = 2.6 * s + 0.8;
      const gap = 0.9 + r() * 0.5;
      const x1 = rx * Math.cos(gap), y1 = ry * Math.sin(gap);
      const sw = 1.4 + s * 0.8;
      const piece = extra ? `<path d="M${f(-rx - 2)} -3l2.2 0.6l-1 1.8z" fill="${c.eye}"/>` : "";
      return ["", `<g transform="${T(0, y, -10 + r() * 6)}"><path d="M${f(x1)} ${f(y1)}A${f(rx)} ${f(ry)} 0 1 1 ${f(rx)} 0" fill="none" stroke="${c.eye}" stroke-width="${f(sw)}" stroke-linecap="round"/>${piece}</g>`];
    }
    case 2: {
      // bracitos de energía a los lados
      const y = 6;
      const x = a.half(y) - 3;
      const arm = (sx: number, up: number): string => `<path transform="${T(sx * x, y, sx * up)}" d="M0 -3.2Q${f(sx * 9 * s)} -2 ${f(sx * 12 * s)} ${f(-6 * s)}Q${f(sx * 13.5 * s)} ${f(-1 * s)} ${f(sx * 8 * s)} 2Q${f(sx * 4)} 3.4 0 3Z" fill="${c.mid}"/>`;
      return [arm(-1, -10 - r() * 15) + arm(1, 20 + r() * 20), ""];
    }
    case 3: {
      // orejas de llama: dos lenguas laterales con punta clara
      const x = hw * 0.62;
      const ear = (sx: number): string => {
        const y = a.top(sx * x) + 6;
        return `<g transform="${T(sx * x, y, sx * 28)}"><path d="M-4 0Q-5 ${f(-9 * s)} ${f(sx * 2)} ${f(-15 * s)}Q${f(sx * 1)} ${f(-8 * s)} 5 0Z" fill="${c.dark}"/><path d="M-1.5 -1Q-2 ${f(-6 * s)} ${f(sx * 1.4)} ${f(-10 * s)}Q1.6 ${f(-5 * s)} 2.6 -1Z" fill="${c.light}"/></g>`;
      };
      return ["", ear(-1) + ear(1)];
    }
    case 4: {
      // alitas: dos o tres plumas planas a la espalda
      const y = -2;
      const x = a.half(y) - 5;
      const wing = (sx: number): string => {
        const feathers = extra ? 3 : 2;
        let g = "";
        for (let k = 0; k < feathers; k++) g += `<path transform="rotate(${f(sx * (-18 + k * 22))})" d="M0 -2Q${f(sx * 10 * s)} ${f(-8 * s)} ${f(sx * 17 * s)} ${f(-4 * s)}Q${f(sx * 10 * s)} 0 0 3Z" fill="${k === 0 ? c.mid : c.dark}"/>`;
        return `<g transform="${T(sx * x, y)}">${g}</g>`;
      };
      return [wing(-1) + wing(1), ""];
    }
    case 5: {
      // antenas con punta de luz
      const x = hw * 0.32;
      const ant = (sx: number, bend: number): string => {
        const y0 = a.top(sx * x) + 3;
        const len = (10 + 4 * s) * s;
        const ex = sx * (4 + bend) * s, ey = -len;
        return `<path d="M${f(sx * x)} ${f(y0)}Q${f(sx * x + ex * 0.2)} ${f(y0 + ey * 0.7)} ${f(sx * x + ex)} ${f(y0 + ey)}" fill="none" stroke="${c.dark}" stroke-width="${f(1.3 + s * 0.5)}" stroke-linecap="round"/><circle cx="${f(sx * x + ex)}" cy="${f(y0 + ey)}" r="${f(1.4 + s * 1.1)}" fill="${c.eye}"/>`;
      };
      return [ant(-1, r() * 4) + ant(1, 2 + r() * 4), ""];
    }
    case 6: {
      // corona de esquirlas flotando
      const y = a.minY - 4 - 2 * s;
      const n = extra ? 5 : 3;
      let g = "";
      for (let k = 0; k < n; k++) {
        const t = k / (n - 1) - 0.5;
        const h = (k === Math.floor(n / 2) ? 8 : 5.5) * s + r() * 1.5;
        g += `<path transform="${T(t * 20 * s, Math.abs(t) * 5, t * 40)}" d="M0 ${f(-h)}L${f(1.9 * s + 0.4)} 0L0 ${f(1.4 * s)}L${f(-1.9 * s - 0.4)} 0Z" fill="${k % 2 ? c.light : c.eye}"/>`;
      }
      return ["", `<g transform="${T(0, y)}">${g}</g>`];
    }
    default: {
      // cuerno único, desplazado a un lado
      const x = hw * 0.25;
      const y = a.top(x) + 4;
      const len = 15 * s;
      return ["", `<path transform="${T(x, y, 12)}" d="M-3.8 0Q-3 ${f(-len * 0.6)} 1.5 ${f(-len)}Q1.6 ${f(-len * 0.5)} 3.8 0Z" fill="${c.horn}"/>${extra ? `<path transform="${T(x, y, 12)}" d="M-1.2 ${f(-len * 0.35)}L1.6 ${f(-len * 0.45)}L1.4 ${f(-len * 0.3)}L-1.4 ${f(-len * 0.2)}Z" fill="${c.eye}"/>` : ""}`];
    }
  }
}

function tailSvg(look: SoulLook, bottom: number, c: Colors, r: () => number): string {
  let out = "";
  const side = r() < 0.5 ? -1 : 1;
  if (look.tailVariant !== 1) {
    const len = look.tailVariant === 0 ? 15 : 11;
    const d = `M-7 -3Q-4 ${f(len * 0.7)} ${f(side * 8)} ${f(len)}Q1 ${f(len * 0.55)} 7 -3Z`;
    out += `<path transform="translate(0 ${f(bottom)})" d="${d}" fill="${c.dark}"/><path transform="translate(0 ${f(bottom - 1)}) scale(.6)" d="${d}" fill="${c.mid}"/>`;
  }
  const n = look.tailVariant === 1 ? 4 : look.tailVariant === 0 ? 2 : 3;
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1) - 0.5;
    const x = t * 26 + (r() - 0.5) * 5 - side * 3;
    const y = bottom + 4 + Math.abs(t) * -4 + r() * 7 + (look.tailVariant === 1 ? 0 : 2);
    const p = 1.6 + r() * 1.3;
    out += `<path transform="${T(x, y, (r() - 0.5) * 50)}" d="${remainPath(look.remains, p)}" fill="${k % 2 ? c.light : c.mid}" opacity="${f(0.95 - k * 0.12)}"/>`;
  }
  return out;
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
const TILT: Record<Temperament, number> = { altivo: -5, aburrido: 7, travieso: -8, feroz: 4, timido: 9, desquiciado: -11, sereno: 0, astuto: -6 };

export interface SoulRenderOptions {
  readonly size?: number;
  readonly mood?: Mood;
  /** Clases extra del <svg>. */
  readonly className?: string;
}

export const VIEWBOX = "-58 -66 116 116";

export function renderSoulLook(look: SoulLook, opts: SoulRenderOptions = {}): string {
  const r = artRng(look.seed);
  const t = look.temperament;
  const pal = look.pal;
  const c: Colors = {
    dark: mix(pal.main, pal.dark, 0.5),
    mid: pal.main,
    light: mix(pal.main, "#ffffff", 0.3),
    horn: mix(mix(pal.main, "#fff4e0", 0.55), pal.dark, 0.1),
    eye: mix(look.eye, "#ffffff", 0.2),
    core: mix(look.eye, "#ffffff", 0.35),
    pupil: mix(pal.dark, "#000000", 0.45),
  };
  const d = SIL[look.silFamily][look.variant] as string;
  const an = anchors(d);
  const { sx, sy } = look;
  const A = {
    top: (x: number) => an.top(x / sx) * sy,
    half: (y: number) => an.half(y / sy) * sx,
    minY: an.minY * sy,
  };
  const fs = 1.5 * clamp(0.9 + (sx - 1) * 0.6, 0.86, 1.08);
  const asym = 0.9 + r() * 0.2;
  const face = (m: Mood): string => {
    const fc = moodFace(t, m);
    const gap = (fc.gap ?? 8.6) * fs;
    const fy = -3 * sy + (fc.dy ?? 0) * fs;
    const one = (e: EyeSpec, side: -1 | 1, scale: number): string => {
      const cx = side * (gap + (e.dx ?? 0) * fs), cy = fy + (e.dy ?? 0) * fs;
      const tr = `translate(${f(cx)} ${f(cy)}) scale(${f(side * fs * scale)} ${f(fs * scale)})${e.rot ? ` rotate(${f(e.rot)})` : ""}`;
      const pu = e.pupil && m !== "ko" ? `<ellipse cx="${f(e.pupil[0] * e.w)}" cy="${f(e.pupil[1] * e.h)}" rx="${f(Math.max(0.8, e.w * 0.17))}" ry="${f(Math.max(1.1, e.h * 0.6))}" fill="${c.pupil}"/>` : "";
      return `<g transform="${tr}"><path d="${eyePath(e)}" fill="${c.eye}"/>${pu}</g>`;
    };
    return `<g class="ey e-${m}"${m === "ko" ? ' opacity=".55"' : ""}>${one(fc.L, -1, asym)}${one(fc.R, 1, 2 - asym)}</g>`;
  };
  const eyes = MOODS.map(face).join("");
  const mouthD = MOUTH[t];
  const mouth = mouthD
    ? `<g class="mo" transform="translate(${f((r() - 0.5) * 3)} ${f(6.5 * sy)}) scale(${f(fs * 0.85)})"><path d="${mouthD}" fill="none" stroke="${c.eye}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>${t === "feroz" ? `<path d="${FANG}" fill="${c.eye}"/>` : ""}</g>`
    : "";
  const coreY = (MOUTH[t] ? 15 : 13) * sy;
  const coreR = 3.2 + (look.k - 0.9) * 4;
  const core = `<circle cy="${f(coreY)}" r="${f(coreR * 1.9)}" fill="${c.eye}" opacity=".22"/><path transform="translate(0 ${f(coreY)})" d="${corePath(look.core, coreR)}" fill="${c.core}"${look.core === 7 ? ' fill-rule="evenodd"' : ""}/>`;
  const [tb, tf] = traitSvg(look.trait, look.tier, A, c, r);
  const tail = tailSvg(look, an.bottom * sy, c, r);
  const body =
    `<g transform="scale(${f(sx)} ${f(sy)})">` +
    `<path d="${d}" fill="${c.dark}"/>` +
    `<path transform="translate(-2.4 -2.8) scale(.93)" d="${d}" fill="${c.light}"/>` +
    `<path transform="translate(1.3 0.4) scale(.85)" d="${d}" fill="${c.mid}"/>` +
    `</g>`;
  const tilt = TILT[t] + (r() - 0.5) * 6;
  const k = look.k * (look.mirror ? -1 : 1);
  const sparks = look.tier === 2 ? `<path transform="${T(-34, -26)}" d="${corePath(2, 2.2)}" fill="${c.eye}" opacity=".8"/><path transform="${T(33, -8)}" d="${corePath(2, 1.6)}" fill="${c.eye}" opacity=".6"/>` : "";
  const haloOp = look.tier === 2 ? 0.2 : 0.14;
  const size = opts.size ?? 120;
  const delay = -((look.seed >>> 8) % 4000) / 1000;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}" width="${size}" height="${size}" class="soul3 m-${opts.mood ?? "idle"}${opts.className ? " " + opts.className : ""}" aria-hidden="true">` +
    `<circle class="halo" cy="-4" r="46" fill="${look.halo2}" opacity="${f(haloOp * 0.6)}"/><circle class="halo" cy="-2" r="33" fill="${look.halo}" opacity="${f(haloOp)}"/>` +
    sparks +
    `<g class="sw sw-${SWAY[t]}" style="animation-delay:${delay.toFixed(2)}s">` +
    `<g transform="translate(0 -2) rotate(${f(tilt)} 0 20) scale(${k.toFixed(3)} ${look.k.toFixed(3)})">` +
    tail +
    tb +
    body +
    core +
    eyes +
    mouth +
    tf +
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
