/**
 * Piezas de la criatura: cuerpo, cabeza, extremidades y cola. Cada pieza
 * se dibuja desde el gen D de su locus (ver docs/equipo/cliente.md):
 *   shape[0] tamaño       → escala de la pieza
 *   shape[1] alargamiento → proporciones (largo/ancho, patas, cola)
 *   shape[2] angulosidad  → punta de los detalles (radio de esquina) e inclinación
 *   shape[3] ornamento    → nº y tamaño de adornos
 *   plantilla = (nivel3 + 2·nivel1) mod 3 → variante de la familia
 * Coordenadas: lienzo 200×200, suelo en y = GROUND, la criatura mira a la derecha.
 */
import { at, BBox, f, lerp, p2s, roundedPoly, rot, smoothClosed, smoothOpen, type Pt } from "./geom.ts";
import type { Palette } from "./palette.ts";

export const GROUND = 184;
export const SW = 4.5; // contorno principal
export const SW2 = 3.2; // contorno de detalles

/** Datos de dibujo de una pieza, derivados de su gen D. */
export interface Piece {
  /** Familia anatómica (siempre base). */
  readonly fam: string;
  /** Segunda familia (híbridas: el otro componente; si no, = fam). */
  readonly alt: string;
  readonly hybrid: boolean;
  readonly mutated: boolean;
  readonly pal: Palette;
  readonly s: readonly [number, number, number, number];
  readonly tpl: number;
  /** Nº de adornos (0..5): ornamento + extra por híbrida/mutada. */
  readonly orn: number;
  /** Radio de esquina relativo de las puntas (blando 0,45 → afilado 0,1). */
  readonly soft: number;
  /** Semilla de detalles (posiciones de motas), del gen. */
  readonly seed: number;
}

/** Acumulador de SVG de una criatura. */
export class Scene {
  readonly defs: string[] = [];
  readonly bb = new BBox();
  private n = 0;
  readonly uid: string;
  constructor(uid: string) {
    this.uid = uid;
  }
  nextId(): string {
    return `${this.uid}-${this.n++}`;
  }
}

// ---------------------------------------------------------------- utilidades SVG

export function solid(d: string, fill: string, stroke: string, sw = SW2): string {
  return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
}

export function line(d: string, stroke: string, sw = SW2): string {
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function circle(c: Pt, r: number, fill: string, stroke?: string, sw = SW2): string {
  const st = stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : "";
  return `<circle cx="${f(c[0])}" cy="${f(c[1])}" r="${f(r)}" fill="${fill}"${st}/>`;
}

function ellipse(c: Pt, rx: number, ry: number, fill: string, deg = 0): string {
  const tr = deg !== 0 ? ` transform="rotate(${f(deg)} ${p2s(c)})"` : "";
  return `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${tr}/>`;
}

function place(p: Pt, deg: number, inner: string, scale = 1): string {
  const sc = scale !== 1 ? ` scale(${f(scale * 100) === "100" ? 1 : (Math.round(scale * 100) / 100).toString()})` : "";
  return `<g transform="translate(${p2s(p)}) rotate(${f(deg)})${sc}">${inner}</g>`;
}

/**
 * Pieza principal sombreada: relleno de sombra, encima el principal
 * desplazado arriba-izquierda (deja una media luna de sombra abajo-derecha),
 * marcas recortadas al interior y contorno grueso encima.
 */
export function shaded(sc: Scene, d: string, pal: Palette, inside: string, off = 4, fill = pal.main): string {
  const id = sc.nextId();
  sc.defs.push(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
  return (
    `<path d="${d}" fill="${pal.shadow}"/>` +
    `<g clip-path="url(#${id})"><path d="${d}" fill="${fill}" transform="translate(${f(-off)} ${f(-off * 1.25)})"/>${inside}</g>` +
    `<path d="${d}" fill="none" stroke="${pal.dark}" stroke-width="${SW}" stroke-linejoin="round"/>`
  );
}

/** Mota pseudoaleatoria determinista en [0,1) a partir de la semilla de la pieza. */
function rnd(seed: number, i: number): number {
  let h = (seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- adornos ("mechones") por familia

/**
 * Silueta de adorno de una familia en marco local: base centrada en el
 * origen, punta hacia −y. Es la "firma" visual de la familia.
 */
export function tuftPts(fam: string, w: number, h: number): Pt[] {
  switch (fam) {
    case "llama": // llama: lengua de fuego con la punta curvada hacia atrás
      return [[-w / 2, 0], [-w * 0.55, -h * 0.4], [-w * 0.35, -h * 0.75], [-w * 0.15, -h], [w * 0.05, -h * 0.62], [w * 0.4, -h * 0.5], [w / 2, 0]];
    case "marea": // aleta barrida hacia atrás
      return [[-w / 2, 0], [-w * 0.45, -h * 0.55], [-w * 0.75, -h], [w * 0.1, -h * 0.6], [w / 2, 0]];
    case "brote": // hoja lanceolada
      return [[0, 0], [-w * 0.5, -h * 0.4], [-w * 0.1, -h], [w * 0.5, -h * 0.45]];
    case "roca": // cristal hexagonal
      return [[-w / 2, 0], [-w / 2, -h * 0.6], [0, -h], [w / 2, -h * 0.6], [w / 2, 0]];
    case "voltio": // rayo en zigzag
      return [[-w * 0.35, 0], [-w * 0.5, -h * 0.5], [-w * 0.05, -h * 0.45], [-w * 0.25, -h], [w * 0.5, -h * 0.38], [w * 0.05, -h * 0.42], [w * 0.3, 0]];
    default: // sombra: voluta que se enrosca hacia atrás
      return [[-w / 2, 0], [-w * 0.55, -h * 0.6], [-w * 0.95, -h * 0.95], [-w * 0.2, -h * 0.85], [w * 0.15, -h * 0.5], [w / 2, 0]];
  }
}

function tuftColor(fam: string, pal: Palette): string {
  return fam === "roca" || fam === "voltio" ? pal.accent : pal.second;
}

/** Adorno completo (relleno + contorno + nervio si es hoja). */
export function tuft(fam: string, w: number, h: number, soft: number, pal: Palette, fill?: string): string {
  const d = roundedPoly(tuftPts(fam, w, h), Math.max(1.2, soft * w));
  let s = solid(d, fill ?? tuftColor(fam, pal), pal.dark);
  if (fam === "brote") s += line(`M0 ${f(-h * 0.08)}L${f(-w * 0.05)} ${f(-h * 0.8)}`, pal.dark, 2);
  if (fam === "llama" && h > 12) s += solid(roundedPoly(tuftPts("llama", w * 0.45, h * 0.5), w * 0.2), pal.accent, pal.accent, 0.1);
  return s;
}

/** Marcas de mutación: 3 rombos de acento en posiciones deterministas. */
function mutationMarks(p: Piece, c: Pt, rx: number, ry: number): string {
  if (!p.mutated) return "";
  let s = "";
  for (let i = 0; i < 3; i++) {
    const x = c[0] + (rnd(p.seed, i) - 0.5) * rx * 1.2;
    const y = c[1] + (rnd(p.seed, i + 7) - 0.5) * ry * 1.0;
    const k = 2.6 + rnd(p.seed, i + 13) * 1.6;
    s += solid(roundedPoly([[x, y - k * 1.4], [x + k, y], [x, y + k * 1.4], [x - k, y]], 0.8), p.pal.accent, p.pal.dark, 1.6);
  }
  return s;
}

// ---------------------------------------------------------------- CUERPO

export interface BodyFrame {
  readonly c: Pt;
  readonly bw: number;
  readonly bh: number;
  readonly neck: Pt;
  readonly tail: Pt;
  readonly hipB: Pt;
  readonly hipF: Pt;
}

const BODY_WH: Record<string, [number, number]> = {
  llama: [0.9, 1.08], marea: [1.14, 0.88], brote: [1, 1], roca: [1.12, 1], voltio: [1.06, 0.84], sombra: [0.96, 1.06],
};

export function bodySize(p: Piece): [number, number] {
  const k = 0.85 + 0.3 * p.s[0];
  const [fw, fh] = BODY_WH[p.fam] ?? [1, 1];
  return [34 * k * (0.86 + 0.36 * p.s[1]) * fw, 27 * k * (1.12 - 0.26 * p.s[1]) * fh];
}

function bodyPts(p: Piece, c: Pt, bw: number, bh: number): Pt[] {
  const pts: Pt[] = [];
  const N = 22;
  let tilt = 0;
  for (let i = 0; i < N; i++) {
    const t = (2 * Math.PI * i) / N;
    const cs = Math.cos(t), sn = Math.sin(t); // sn > 0: abajo
    let x = cs * bw, y = sn * bh;
    switch (p.fam) {
      case "llama": // pera erguida: hombros estrechos, base ancha
        x *= sn < 0 ? 0.8 : 1.02;
        break;
      case "marea": // foca: alargada, la parte delantera más alta
        y *= sn > 0 ? 0.86 : 1;
        tilt = -8;
        break;
      case "brote": // bulbo con pico arriba (como una semilla)
        y -= bh * 0.2 * Math.pow(Math.max(0, -sn), 10);
        y *= sn > 0 ? 0.92 : 1;
        break;
      case "roca": { // bloque redondeado: más cuadrado cuanto más anguloso
        const e = 0.72 - 0.32 * p.s[2];
        x = Math.sign(cs) * Math.pow(Math.abs(cs), e) * bw * (sn < 0 ? 0.94 : 1);
        y = Math.sign(sn) * Math.pow(Math.abs(sn), e) * bh;
        break;
      }
      case "voltio": // hurón: esbelto, pecho adelantado
        x *= cs < 0 ? 0.9 : 1.06;
        y *= sn > 0 ? 0.88 : 1;
        tilt = -10;
        break;
      default: // sombra: capa/campana con dobladillo ondulado
        x *= sn < 0 ? 0.84 : 1.1;
        if (sn > 0.15) y += bh * 0.09 * Math.abs(Math.sin(3 * t)) * sn;
        break;
    }
    pts.push(rot([c[0] + x, c[1] + y], c, tilt + (p.s[2] - 0.5) * -4));
  }
  return pts;
}

/** Puntos de anclaje del cuerpo: cuello, base de la cola y caderas. */
export function bodyFrame(p: Piece, legLen: number): BodyFrame {
  const [bw, bh] = bodySize(p);
  const c: Pt = [94, GROUND - legLen - bh * 0.72];
  const lift = p.fam === "marea" || p.fam === "voltio" ? bh * 0.12 : 0;
  return {
    c, bw, bh,
    neck: [c[0] + bw * 0.5, c[1] - bh * 0.6 - lift],
    tail: [c[0] - bw * 0.82, c[1] + bh * 0.05],
    hipB: [c[0] - bw * 0.5, c[1] + bh * 0.5],
    hipF: [c[0] + bw * 0.46, c[1] + bh * 0.5 - lift * 0.5],
  };
}

/** Adornos dorsales (se dibujan detrás del cuerpo). */
export function bodyBack(sc: Scene, p: Piece, fr: BodyFrame): string {
  const n = p.orn;
  if (n === 0) return "";
  let s = "";
  const big = p.fam === "marea" ? 1.6 : 1; // la marea lleva una aleta grande, no varias
  const count = p.fam === "marea" ? Math.min(2, Math.max(1, n - 1)) : n;
  for (let i = 0; i < count; i++) {
    const a = lerp(-2.45, -1.35, count === 1 ? 0.55 : i / (count - 1));
    const pt: Pt = [fr.c[0] + Math.cos(a) * fr.bw * 0.86, fr.c[1] + Math.sin(a) * fr.bh * 0.9];
    const fam = p.hybrid && i % 2 === 1 ? p.alt : p.fam;
    const w = (8 + 4 * p.s[0]) * big, h = (11 + 9 * p.s[3]) * big * (i % 2 === 0 ? 1 : 0.8);
    s += place(pt, (a * 180) / Math.PI + 90, tuft(fam, w, h, p.soft, p.pal));
    sc.bb.add(pt[0], pt[1], h);
  }
  return s;
}

function bodyMarks(p: Piece, fr: BodyFrame): string {
  const { c, bw, bh } = fr;
  const pal = p.pal;
  let s = "";
  const belly = () => ellipse([c[0] + bw * 0.12, c[1] + bh * 0.42], bw * 0.62, bh * 0.5, pal.belly);
  switch (p.fam) {
    case "llama":
      if (p.tpl === 0) s += solid(roundedPoly(tuftPts("llama", bw * 0.8, bh * 1.2).map(([x, y]) => [x + c[0] + bw * 0.15, y + c[1] + bh * 0.95] as Pt), 5), pal.belly, pal.belly, 0.1);
      else if (p.tpl === 1) for (let i = 0; i < 2; i++) s += place([c[0] - bw * (0.15 + 0.32 * i), c[1] + bh * 0.2], -100, solid(roundedPoly(tuftPts("llama", bh * 0.35, bw * 0.45), 3), pal.second, pal.second, 0.1));
      else s += ellipse([c[0] - bw * 0.1, c[1] - bh * 0.85], bw * 0.75, bh * 0.45, pal.second);
      break;
    case "marea":
      if (p.tpl === 0) s += ellipse([c[0] + bw * 0.1, c[1] + bh * 0.65], bw * 0.85, bh * 0.45, pal.belly);
      else if (p.tpl === 1) for (let i = 0; i < 2; i++) {
        const y = c[1] - bh * 0.15 + i * bh * 0.32;
        s += line(smoothOpen([[c[0] - bw * 0.9, y], [c[0] - bw * 0.45, y - 5], [c[0], y], [c[0] + bw * 0.45, y - 5], [c[0] + bw * 0.9, y]]), pal.second, 4.5);
      }
      else for (let i = 0; i < 3 + p.orn; i++) s += circle([c[0] - bw * 0.6 + rnd(p.seed, i) * bw * 1.1, c[1] - bh * 0.5 + rnd(p.seed, i + 9) * bh * 0.6], 2.5 + rnd(p.seed, i + 3) * 2.5, pal.accent);
      break;
    case "brote":
      if (p.tpl === 0) s += belly();
      else if (p.tpl === 1) for (let i = 0; i < 2; i++) s += place([c[0] - bw * 0.35 + i * bw * 0.45, c[1] + bh * 0.3], -30 + i * 50, solid(roundedPoly(tuftPts("brote", bw * 0.32, bh * 0.75), 4), pal.second, pal.second, 0.1));
      else for (let i = -1; i <= 1; i++) s += line(smoothOpen([[c[0] + i * bw * 0.4, c[1] - bh * 1.1], [c[0] + i * bw * 0.55, c[1]], [c[0] + i * bw * 0.4, c[1] + bh * 1.1]]), pal.second, 5);
      break;
    case "roca":
      if (p.tpl === 0) for (let i = 0; i < 3; i++) {
        const x = c[0] - bw * 0.6 + i * bw * 0.48, y = c[1] - bh * 0.75 + (i % 2) * 4;
        s += solid(roundedPoly([[x - 9, y + 8], [x - 6, y - 6], [x + 7, y - 7], [x + 10, y + 7]], 2), pal.second, pal.dark, 2);
      }
      else if (p.tpl === 1) s += solid(roundedPoly([[c[0] - bw * 0.4, c[1] + bh * 0.05], [c[0] + bw * 0.6, c[1] - bh * 0.05], [c[0] + bw * 0.7, c[1] + bh * 1.1], [c[0] - bw * 0.5, c[1] + bh * 1.1]], 6), pal.belly, pal.belly, 0.1);
      else {
        s += line(`M${p2s([c[0] - bw * 0.3, c[1] - bh])}L${p2s([c[0] - bw * 0.2, c[1] - bh * 0.4])}L${p2s([c[0] - bw * 0.4, c[1] - bh * 0.1])}`, pal.dark, 2);
        s += place([c[0] + bw * 0.1, c[1] - bh * 0.35], 15, tuft("roca", 8, 12, 0.15, pal));
      }
      break;
    case "voltio":
      if (p.tpl === 0) {
        const y = c[1] - bh * 0.05;
        const z: Pt[] = [];
        for (let i = 0; i <= 6; i++) z.push([c[0] - bw + (i * bw * 2) / 6, y + (i % 2 === 0 ? -5 : 5)]);
        s += line(`M${z.map(p2s).join("L")}`, pal.accent, 5);
      } else if (p.tpl === 1) s += belly();
      else for (let i = 0; i < 2 + p.orn; i++) s += place([c[0] - bw * 0.6 + rnd(p.seed, i) * bw * 1.1, c[1] - bh * 0.4 + rnd(p.seed, i + 5) * bh * 0.6], 15, solid(roundedPoly(tuftPts("voltio", 7, 11), 1), pal.accent, pal.accent, 0.1));
      break;
    default: // sombra
      if (p.tpl === 0) for (let i = 0; i < 3 + p.orn; i++) s += star([c[0] - bw * 0.7 + rnd(p.seed, i) * bw * 1.3, c[1] - bh * 0.6 + rnd(p.seed, i + 4) * bh * 1.1], 2.5 + rnd(p.seed, i + 8) * 2.5, pal.accent);
      else if (p.tpl === 1) s += ellipse([c[0] + bw * 0.1, c[1] + bh * 0.5], bw * 0.55, bh * 0.45, pal.belly);
      else s += ellipse([c[0] - bw * 0.05, c[1] - bh * 0.9], bw * 0.95, bh * 0.55, pal.second);
      break;
  }
  if (p.hybrid) s += hybridStripe(p, c, bw, bh);
  return s + mutationMarks(p, [c[0] - bw * 0.15, c[1] - bh * 0.1], bw, bh);
}

function star(c: Pt, r: number, fill: string): string {
  const pts: Pt[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4, rr = i % 2 === 0 ? r : r * 0.38;
    pts.push([c[0] + Math.cos(a - Math.PI / 2) * rr, c[1] + Math.sin(a - Math.PI / 2) * rr]);
  }
  return solid(roundedPoly(pts, 0.6), fill, fill, 0.1);
}

/** Híbridas: franja del segundo componente (marca de "mezcla"). */
function hybridStripe(p: Piece, c: Pt, bw: number, bh: number): string {
  return line(smoothOpen([[c[0] - bw * 0.95, c[1] + bh * 0.1], [c[0] - bw * 0.3, c[1] - bh * 0.25], [c[0] + bw * 0.4, c[1] + bh * 0.05], [c[0] + bw, c[1] - bh * 0.3]]), p.pal.second, 5) +
    line(smoothOpen([[c[0] - bw * 0.95, c[1] + bh * 0.1], [c[0] - bw * 0.3, c[1] - bh * 0.25], [c[0] + bw * 0.4, c[1] + bh * 0.05], [c[0] + bw, c[1] - bh * 0.3]]), p.pal.accent, 1.6);
}

export function bodyMain(sc: Scene, p: Piece, fr: BodyFrame): string {
  const pts = bodyPts(p, fr.c, fr.bw, fr.bh);
  sc.bb.addPts(pts, SW);
  return shaded(sc, smoothClosed(pts), p.pal, bodyMarks(p, fr), 5);
}

// ---------------------------------------------------------------- CABEZA

export interface HeadFrame {
  readonly c: Pt;
  readonly r: number;
  readonly eyes: readonly [Pt, Pt];
  readonly eyeR: number;
  readonly mouth: Pt;
}

const HEAD_K: Record<string, number> = { llama: 1, marea: 1.02, brote: 1.04, roca: 1, voltio: 0.96, sombra: 1.02 };

export function headFrame(p: Piece, neck: Pt): HeadFrame {
  const r = 26 * (0.86 + 0.28 * p.s[0]) * (HEAD_K[p.fam] ?? 1);
  const c: Pt = [neck[0] + r * 0.28, neck[1] - r * 0.62];
  const ey = c[1] - r * 0.02;
  const eyeR = r * (0.25 + 0.04 * (1 - p.s[1]));
  return { c, r, eyes: [[c[0] + r * 0.08, ey], [c[0] + r * 0.6, ey - r * 0.02]], eyeR, mouth: [c[0] + r * 0.46, c[1] + r * 0.43] };
}

function headPts(p: Piece, c: Pt, r: number): Pt[] {
  const pts: Pt[] = [];
  const N = 22;
  const rx0 = r * (0.95 + 0.14 * p.s[1]), ry0 = r * 0.92;
  for (let i = 0; i < N; i++) {
    const t = (2 * Math.PI * i) / N;
    const cs = Math.cos(t), sn = Math.sin(t);
    let rx = rx0, ry = ry0, k = 1;
    switch (p.fam) {
      case "llama": // hocico corto y redondo
        k = 1 + 0.17 * Math.pow(Math.max(0, Math.cos(t - 0.4)), 6);
        break;
      case "marea": // cabeza ancha, hocico chato
        rx *= 1.1; ry *= 0.92;
        k = 1 + 0.07 * Math.pow(Math.max(0, Math.cos(t - 0.3)), 4);
        break;
      case "brote":
        ry *= sn > 0 ? 0.94 : 1.02;
        break;
      case "roca": { // cabeza de bloque
        const e = 0.74 - 0.3 * p.s[2];
        pts.push([c[0] + Math.sign(cs) * Math.pow(Math.abs(cs), e) * rx * 1.04, c[1] + Math.sign(sn) * Math.pow(Math.abs(sn), e) * ry * 0.95]);
        continue;
      }
      case "voltio": // hocico afilado (zorruno)
        k = 1 + (0.18 + 0.12 * p.s[2]) * Math.pow(Math.max(0, Math.cos(t - 0.3)), 10);
        ry *= 0.95;
        break;
      default: // sombra: capucha ancha arriba
        rx *= sn < 0 ? 1.04 : 0.92;
        break;
    }
    pts.push([c[0] + cs * rx * k, c[1] + sn * ry * k]);
  }
  return pts;
}

/** Adornos de cabeza: [detrás, delante]. */
function headOrn(sc: Scene, p: Piece, h: HeadFrame): [string, string] {
  const { c, r } = h;
  const pal = p.pal;
  const o = p.s[3];
  let back = "", front = "";
  const add = (pt: Pt, ext: number) => sc.bb.add(pt[0], pt[1], ext);
  const famB = p.hybrid ? p.alt : p.fam;
  switch (p.fam) {
    case "llama": {
      if (p.tpl === 0) { // cresta de 2–4 llamas
        const n = 2 + Math.min(2, Math.floor(p.orn / 2));
        for (let i = 0; i < n; i++) {
          const a = lerp(-2.2, -1.2, n === 1 ? 0.5 : i / (n - 1));
          const pt: Pt = [c[0] + Math.cos(a) * r * 0.82, c[1] + Math.sin(a) * r * 0.82];
          const hh = r * (0.55 + 0.25 * o) * (i === Math.floor(n / 2) ? 1.15 : 0.9);
          back += place(pt, (a * 180) / Math.PI + 90 - 10, tuft(i % 2 && p.hybrid ? famB : "llama", r * 0.42, hh, p.soft, pal));
          add(pt, hh);
        }
      } else if (p.tpl === 1) { // gran llama peinada hacia atrás
        const pt: Pt = [c[0] - r * 0.25, c[1] - r * 0.8];
        const hh = r * (0.9 + 0.35 * o);
        back += place(pt, -40, tuft("llama", r * 0.75, hh, p.soft, pal));
        if (p.orn > 2 || p.hybrid) back += place([c[0] - r * 0.7, c[1] - r * 0.35], -75, tuft(famB, r * 0.45, hh * 0.6, p.soft, pal));
        add(pt, hh);
      } else { // dos "orejas" de llama
        for (const [dx, a] of [[-0.55, -30], [0.25, 10]] as const) {
          const pt: Pt = [c[0] + r * dx, c[1] - r * 0.78];
          const hh = r * (0.6 + 0.3 * o);
          back += place(pt, a, tuft(dx < 0 || !p.hybrid ? "llama" : famB, r * 0.45, hh, p.soft, pal));
          add(pt, hh);
        }
      }
      front += ellipse([c[0] + r * 0.62, c[1] + r * 0.32], r * 0.38, r * 0.26, pal.belly, -10);
      break;
    }
    case "marea": {
      const ear: Pt = [c[0] - r * 0.72, c[1] - r * 0.05];
      if (p.tpl === 0) { // abanico de 3 lóbulos
        const fan: Pt[] = [[0, 0], [-r * 0.5, -r * 0.55], [-r * 0.35, -r * 0.2], [-r * 0.75, -r * 0.2], [-r * 0.4, r * 0.05], [-r * 0.6, r * 0.35]];
        back += place(ear, -10, solid(roundedPoly(fan, r * (0.16 - 0.08 * p.s[2])), pal.second, pal.dark));
        add([ear[0] - r * 0.75, ear[1]], r * 0.6);
      } else if (p.tpl === 1) { // aletas redondas tipo oreja
        back += place(ear, -55, tuft("marea", r * 0.55, r * (0.6 + 0.3 * o), p.soft + 0.1, pal));
        back += place([c[0] + r * 0.05, c[1] - r * 0.85], -20, tuft("marea", r * 0.4, r * (0.45 + 0.25 * o), p.soft + 0.1, pal));
        add(ear, r);
      } else { // cintas largas hacia atrás
        for (let i = 0; i < 2; i++) {
          const pt: Pt = [c[0] - r * 0.6, c[1] - r * 0.35 + i * r * 0.35];
          const len = r * (0.9 + 0.4 * o);
          back += solid(smoothClosed([pt, [pt[0] - len * 0.5, pt[1] - r * 0.25], [pt[0] - len, pt[1] + r * 0.05], [pt[0] - len * 0.45, pt[1] + r * 0.12]]), i === 0 ? pal.second : pal.belly, pal.dark);
          add([pt[0] - len, pt[1]], r * 0.3);
        }
      }
      if (p.orn > 1) front += circle([c[0] - r * 0.05, c[1] - r * 0.55], r * 0.11, pal.accent) + circle([c[0] + r * 0.2, c[1] - r * 0.68], r * 0.07, pal.accent);
      front += ellipse([c[0] + r * 0.62, c[1] + r * 0.3], r * 0.42, r * 0.24, pal.belly, -8);
      break;
    }
    case "brote": {
      if (p.tpl === 0) { // dos orejas-hoja
        for (const [pt, a] of [[[c[0] - r * 0.55, c[1] - r * 0.55], -60], [[c[0] + r * 0.2, c[1] - r * 0.85], 25]] as const) {
          const hh = r * (0.7 + 0.35 * o);
          back += place(pt, a, tuft("brote", r * 0.55, hh, 0.35, pal, pal.main));
          add(pt, hh);
        }
      } else if (p.tpl === 1) { // brote en la coronilla
        const top: Pt = [c[0] - r * 0.1, c[1] - r * 0.9];
        const sh = r * (0.35 + 0.2 * o);
        back += line(`M${p2s(top)}Q${p2s([top[0] - 3, top[1] - sh * 0.6])} ${p2s([top[0] + 2, top[1] - sh])}`, pal.dark, 4.5);
        const tip: Pt = [top[0] + 2, top[1] - sh];
        back += place(tip, -55, tuft("brote", r * 0.38, r * 0.55, 0.35, pal)) + place(tip, 50, tuft("brote", r * 0.38, r * 0.5, 0.35, pal));
        add(tip, r * 0.6);
      } else { // capullo de flor
        const top: Pt = [c[0] - r * 0.05, c[1] - r * 0.88];
        const n = 5;
        const pr = r * (0.28 + 0.1 * o);
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + ((i - (n - 1) / 2) * Math.PI) / 5;
          back += place(top, (a * 180) / Math.PI + 90, solid(roundedPoly([[0, 0], [-pr * 0.5, -pr * 0.8], [0, -pr * 1.5], [pr * 0.5, -pr * 0.8]], pr * 0.4), pal.accent, pal.dark));
        }
        back += circle(top, pr * 0.45, pal.second, pal.dark);
        add(top, pr * 1.6);
      }
      for (let i = 0; i < Math.min(4, p.orn); i++) front += circle([c[0] + r * (0.3 + 0.16 * i), c[1] + r * (0.25 + (i % 2) * 0.1)], r * 0.04, pal.dark);
      break;
    }
    case "roca": {
      if (p.tpl === 0) { // cuernos romos
        for (const [dx, a] of [[-0.55, -25], [0.3, 15]] as const) {
          const pt: Pt = [c[0] + r * dx, c[1] - r * 0.78];
          const hh = r * (0.32 + 0.22 * o);
          back += place(pt, a, solid(roundedPoly([[-r * 0.18, 0], [-r * 0.08, -hh], [r * 0.08, -hh], [r * 0.18, 0]], r * (0.12 - 0.06 * p.s[2])), pal.second, pal.dark));
          add(pt, hh);
        }
      } else if (p.tpl === 1) { // racimo de cristales
        const n = 2 + Math.min(2, p.orn);
        for (let i = 0; i < n; i++) {
          const pt: Pt = [c[0] - r * 0.45 + i * r * 0.28, c[1] - r * 0.8];
          const hh = r * (0.35 + 0.25 * o) * (i % 2 ? 0.75 : 1.05);
          back += place(pt, -20 + i * 12, tuft(i % 2 && p.hybrid ? famB : "roca", r * 0.26, hh, p.soft * 0.5, pal));
          add(pt, hh);
        }
      } else { // casco de placa
        front += solid(roundedPoly([[c[0] - r * 0.9, c[1] - r * 0.35], [c[0] - r * 0.55, c[1] - r * 1.02], [c[0] + r * 0.5, c[1] - r * 1.02], [c[0] + r * 0.8, c[1] - r * 0.45], [c[0] + r * 0.2, c[1] - r * 0.6], [c[0] - r * 0.4, c[1] - r * 0.55]], 5), pal.second, pal.dark);
        if (p.orn > 1) back += place([c[0] - r * 0.1, c[1] - r * 0.95], 0, tuft("roca", r * 0.25, r * 0.45, 0.1, pal));
        add([c[0], c[1] - r * 1.1], 4);
      }
      front += ellipse([c[0] + r * 0.58, c[1] + r * 0.36], r * 0.4, r * 0.25, pal.belly, -5);
      break;
    }
    case "voltio": {
      if (p.tpl === 0) { // orejas altas barridas hacia atrás, con borde en zigzag
        for (const [dx, a] of [[-0.45, -38], [0.18, -18]] as const) {
          const pt: Pt = [c[0] + r * dx, c[1] - r * 0.72];
          const hh = r * (0.75 + 0.35 * o);
          const w = r * 0.42;
          back += place(pt, a, solid(roundedPoly([[-w / 2, 0], [-w * 0.3, -hh * 0.55], [-w * 0.5, -hh * 0.5], [0, -hh], [w * 0.25, -hh * 0.45], [w * 0.05, -hh * 0.4], [w / 2, 0]], Math.max(1.2, p.soft * w * 0.6)), pal.main, pal.dark));
          add(pt, hh);
        }
      } else if (p.tpl === 1) { // antenas con bola
        for (const [dx, a] of [[-0.35, -30], [0.2, 5]] as const) {
          const pt: Pt = [c[0] + r * dx, c[1] - r * 0.8];
          const hh = r * (0.6 + 0.35 * o);
          back += place(pt, a, line(`M0 0Q${f(-hh * 0.25)} ${f(-hh * 0.5)} 0 ${f(-hh)}`, pal.dark, 3.5) + circle([0, -hh], r * 0.14, pal.accent, pal.dark));
          add(pt, hh + r * 0.15);
        }
      } else { // cuerno-rayo en la frente
        const pt: Pt = [c[0] + r * 0.05, c[1] - r * 0.82];
        const hh = r * (0.7 + 0.4 * o);
        back += place(pt, -12, tuft(p.hybrid ? famB : "voltio", r * 0.45, hh, p.soft * 0.6, pal));
        back += place([c[0] - r * 0.6, c[1] - r * 0.55], -55, tuft("voltio", r * 0.3, hh * 0.5, p.soft * 0.6, pal, pal.main));
        add(pt, hh);
      }
      front += place([c[0] - r * 0.2, c[1] - r * 0.5], 10, solid(roundedPoly(tuftPts("voltio", r * 0.22, r * 0.34), 0.8), pal.accent, pal.dark, 1.6));
      break;
    }
    default: { // sombra
      if (p.tpl === 0) { // orejas largas caídas hacia atrás
        for (const [i, base] of [[0, [c[0] - r * 0.45, c[1] - r * 0.7]], [1, [c[0] + r * 0.05, c[1] - r * 0.85]]] as const) {
          const len = r * (0.95 + 0.4 * o) * (i ? 0.85 : 1);
          const pts: Pt[] = [base, [base[0] - len * 0.3, base[1] - r * 0.35], [base[0] - len * 0.85, base[1] - r * 0.1], [base[0] - len, base[1] + r * 0.25], [base[0] - len * 0.6, base[1] + r * 0.1], [base[0] + r * 0.25, base[1] + r * 0.05]];
          back += solid(smoothClosed(pts), i ? pal.main : pal.second, pal.dark);
          add([base[0] - len, base[1]], r * 0.4);
        }
      } else if (p.tpl === 1) { // cuernecillos de media luna
        for (const [dx, a] of [[-0.5, -35], [0.2, 10]] as const) {
          const pt: Pt = [c[0] + r * dx, c[1] - r * 0.75];
          const hh = r * (0.4 + 0.25 * o);
          back += place(pt, a, solid(smoothClosed([[-r * 0.14, 0], [-r * 0.2, -hh * 0.6], [-hh * 0.35, -hh], [r * 0.02, -hh * 0.55], [r * 0.14, 0]]), pal.second, pal.dark));
          add(pt, hh);
        }
      } else { // capucha con punta caída
        const pts: Pt[] = [[c[0] - r * 0.8, c[1] - r * 0.25], [c[0] - r * 0.4, c[1] - r * 1.05], [c[0] - r * (1.0 + 0.4 * o), c[1] - r * 1.15], [c[0] - r * (1.25 + 0.35 * o), c[1] - r * 0.6], [c[0] - r * 0.95, c[1] + r * 0.1]];
        back += solid(roundedPoly(pts, r * 0.25), pal.second, pal.dark);
        add([c[0] - r * 1.6, c[1] - r * 1.15], 4);
      }
      // marca en la frente: media luna
      const m: Pt = [c[0] + r * 0.2, c[1] - r * 0.52];
      front += solid(`M${p2s([m[0] - r * 0.13, m[1] - r * 0.1])}A${f(r * 0.15)} ${f(r * 0.15)} 0 1 0 ${p2s([m[0] + r * 0.14, m[1] - r * 0.08])}A${f(r * 0.11)} ${f(r * 0.11)} 0 1 1 ${p2s([m[0] - r * 0.13, m[1] - r * 0.1])}Z`, pal.accent, pal.accent, 0.1);
      break;
    }
  }
  return [back, front];
}

export function headMain(sc: Scene, p: Piece, h: HeadFrame): { back: string; main: string } {
  const pts = headPts(p, h.c, h.r);
  sc.bb.addPts(pts, SW);
  const [back, front] = headOrn(sc, p, h);
  let inside = front + mutationMarks(p, [h.c[0] - h.r * 0.45, h.c[1] + h.r * 0.1], h.r * 0.5, h.r * 0.6);
  if (p.hybrid) inside += ellipse([h.c[0] - h.r * 0.55, h.c[1] + h.r * 0.15], h.r * 0.25, h.r * 0.5, p.pal.second, 15);
  return { back, main: shaded(sc, smoothClosed(pts), p.pal, inside, 4) };
}

// ---------------------------------------------------------------- EXTREMIDADES

export function legLength(p: Piece): number {
  const famK: Record<string, number> = { llama: 1, marea: 0.72, brote: 0.82, roca: 0.86, voltio: 1.25, sombra: 0.92 };
  return (11 + 12 * p.s[1]) * (0.85 + 0.3 * p.s[0]) * (famK[p.fam] ?? 1);
}

/** Una pata desde la cadera hasta el suelo. `far` = pata del lado lejano (sombra plana). */
function leg(sc: Scene, p: Piece, hip: Pt, ground: number, front: boolean, far: boolean): string {
  const pal = p.pal;
  const lw = (9 + 5 * p.s[0]) * (p.fam === "roca" ? 1.35 : p.fam === "voltio" ? 0.8 : 1);
  const top = hip[1] - 14;
  const fill = far ? pal.shadow : pal.main;
  const x = hip[0];
  let pts: Pt[];
  let foot = "";
  const fy = ground;
  const toes = (n: number, fx: number, w: number, col: string): string => {
    let s = "";
    for (let i = 0; i < n; i++) {
      const tx = fx + (i - (n - 1) / 2) * w * 0.32 + w * 0.3;
      s += solid(roundedPoly([[tx - 2.4, fy - 1.5], [tx + 0.5, fy - 3.5 - 3 * p.s[2]], [tx + 3.2 + 2 * p.s[2], fy - 0.2], [tx + 1, fy + 1.2]], 1.2 + (1 - p.s[2]) * 1.2), col, pal.dark, 1.8);
    }
    return s;
  };
  switch (p.fam) {
    case "marea": { // pata corta + aleta-remo
      pts = [[x - lw / 2, top], [x + lw / 2, top], [x + lw * 0.45, fy - 5], [x - lw * 0.45, fy - 5]];
      const fl: Pt[] = [[x - lw * 0.5, fy - 7], [x + lw * (front ? 1.5 : 1.1), fy - 3], [x + lw * (front ? 1.4 : 1.0), fy + 1.5], [x - lw * 0.6, fy + 1.5]];
      foot = solid(roundedPoly(fl, 4 - 2 * p.s[2]), far ? pal.shadow : pal.second, pal.dark) + (far ? "" : line(`M${p2s([x, fy - 3])}L${p2s([x + lw * 0.8, fy - 2])}`, pal.dark, 1.6));
      break;
    }
    case "brote": { // tocón con raíces
      pts = [[x - lw / 2, top], [x + lw / 2, top], [x + lw * 0.6, fy - 2], [x - lw * 0.6, fy - 2]];
      for (let i = -1; i <= 1; i++) foot += solid(roundedPoly([[x + i * lw * 0.35 - 2.5, fy - 4], [x + i * lw * 0.35 + 2.5, fy - 4], [x + i * lw * 0.7 + 1.5, fy + 1.5], [x + i * lw * 0.7 - 1.5, fy + 1.5]], 1.5), far ? pal.shadow : pal.second, pal.dark, 1.8);
      break;
    }
    case "roca": { // columna con pie plano
      pts = [[x - lw / 2, top], [x + lw / 2, top], [x + lw * 0.55, fy - 4], [x - lw * 0.55, fy - 4]];
      foot = solid(roundedPoly([[x - lw * 0.7, fy - 7], [x + lw * 0.85, fy - 7], [x + lw * 0.9, fy + 1.5], [x - lw * 0.75, fy + 1.5]], 3 - 1.5 * p.s[2]), far ? pal.shadow : pal.second, pal.dark);
      if (!far) foot += line(`M${p2s([x + lw * 0.1, fy - 2])}L${p2s([x + lw * 0.1, fy + 1])}M${p2s([x + lw * 0.5, fy - 2])}L${p2s([x + lw * 0.5, fy + 1])}`, pal.dark, 1.6);
      break;
    }
    case "voltio": { // digitígrada: rodilla hacia atrás
      const kn = top + (fy - top) * 0.5;
      pts = [[x - lw / 2, top], [x + lw / 2, top], [x + lw * 0.1, kn], [x + lw * 0.45, fy - 3], [x - lw * 0.35, fy - 3], [x - lw * 0.75, kn]];
      foot = solid(roundedPoly([[x - lw * 0.45, fy - 5], [x + lw * 1.0, fy - 4], [x + lw * 1.05, fy + 1.5], [x - lw * 0.5, fy + 1.5]], 3), fill, pal.dark);
      break;
    }
    case "sombra": { // pata ahusada con calcetín oscuro
      pts = [[x - lw / 2, top], [x + lw / 2, top], [x + lw * 0.4, fy - 4], [x - lw * 0.4, fy - 4]];
      foot = solid(roundedPoly([[x - lw * 0.55, fy - 9], [x + lw * 0.75, fy - 9], [x + lw * 0.85, fy + 1.5], [x - lw * 0.6, fy + 1.5]], 5), far ? pal.dark : pal.second, pal.dark);
      break;
    }
    default: { // llama: pata rechoncha con garritas
      pts = [[x - lw / 2, top], [x + lw / 2, top], [x + lw * 0.55, fy - 3], [x - lw * 0.5, fy - 3]];
      foot = solid(roundedPoly([[x - lw * 0.6, fy - 7], [x + lw * 0.7, fy - 7], [x + lw * 0.75, fy + 1.5], [x - lw * 0.6, fy + 1.5]], 4), fill, pal.dark);
      if (!far) foot += toes(3, x, lw, pal.belly);
      break;
    }
  }
  let s = solid(roundedPoly(pts, lw * 0.35), fill, pal.dark, SW);
  // variantes: banda/adorno en la pata (plantilla) y adornos por ornamento
  if (!far) {
    const mid: Pt = [x, top + (fy - top) * 0.45];
    if (p.tpl === 1) s += line(`M${p2s([mid[0] - lw * 0.45, mid[1]])}L${p2s([mid[0] + lw * 0.45, mid[1] - 2])}`, p.hybrid ? pal.accent : pal.second, 3.5);
    if (p.tpl === 2 || p.orn >= 3) {
      const fam = p.hybrid && front ? p.alt : p.fam;
      s += place([x - lw * 0.45, mid[1] + 2], -70, tuft(fam, 6 + 2 * p.s[0], 8 + 6 * p.s[3], p.soft, pal));
    }
    if (p.mutated) s += circle([x + lw * 0.1, mid[1] - 4], 2.6, pal.accent, pal.dark, 1.4);
  }
  sc.bb.addPts(pts, SW);
  sc.bb.add(x + lw * 1.5, fy, 2);
  return s + foot;
}

export function limbs(sc: Scene, p: Piece, fr: BodyFrame): { far: string; near: string } {
  const g = GROUND;
  const off: Pt = [8, -2];
  const far = leg(sc, p, [fr.hipB[0] + off[0], fr.hipB[1] + off[1]], g - 2, false, true) + leg(sc, p, [fr.hipF[0] + off[0], fr.hipF[1] + off[1]], g - 2, true, true);
  const near = leg(sc, p, fr.hipB, g, false, false) + leg(sc, p, fr.hipF, g, true, false);
  return { far, near };
}

// ---------------------------------------------------------------- COLA

export function tail(sc: Scene, p: Piece, anchor: Pt): string {
  const pal = p.pal;
  const k = 0.85 + 0.3 * p.s[0];
  const L = (26 + 30 * p.s[1]) * k;
  const w0 = (11 + 5 * p.s[0]) * (p.fam === "roca" ? 1.25 : 1);
  const w1 = w0 * (p.fam === "roca" ? 0.7 : p.fam === "sombra" ? 0.25 : 0.38);
  const angDeg: Record<string, number> = { llama: -150, marea: -168, brote: -145, roca: -172, voltio: -135, sombra: -140 };
  const a = (((angDeg[p.fam] ?? -150) - p.s[2] * 10) * Math.PI) / 180;
  const S: Pt = [anchor[0] + 10, anchor[1]];
  const E: Pt = [anchor[0] + Math.cos(a) * L, anchor[1] + Math.sin(a) * L];
  const bend = p.fam === "sombra" ? -0.55 : p.fam === "marea" ? 0.25 : -0.3;
  const C: Pt = [(S[0] + E[0]) / 2 - (E[1] - S[1]) * bend, (S[1] + E[1]) / 2 + (E[0] - S[0]) * bend];
  const N = 10;
  const cl: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    cl.push([(1 - t) * (1 - t) * S[0] + 2 * (1 - t) * t * C[0] + t * t * E[0], (1 - t) * (1 - t) * S[1] + 2 * (1 - t) * t * C[1] + t * t * E[1]]);
  }
  const left: Pt[] = [], right: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const p0 = at(cl, Math.max(0, i - 1)), p1 = cl[Math.min(N, i + 1)] as Pt;
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dl = Math.hypot(dx, dy) || 1;
    const nx = -dy / dl, ny = dx / dl;
    const t = i / N;
    const w = lerp(w0, w1, t) / 2;
    let z = 0;
    if (p.fam === "voltio" && i >= 2 && i < N) z = (i % 2 === 0 ? 1 : -1) * (4 + 4 * p.s[2]);
    const q = cl[i] as Pt;
    left.push([q[0] + nx * (w + z), q[1] + ny * (w + z)]);
    right.push([q[0] - nx * (w - z), q[1] - ny * (w - z)]);
  }
  const outline = [...left, ...right.reverse()];
  const d = p.fam === "voltio" ? roundedPoly(outline, 2.5) : smoothClosed(outline);
  sc.bb.addPts(outline, SW);
  // anillos (ornamento) recortados dentro de la cola
  let rings = "";
  const nr = p.tpl === 1 ? 2 + Math.min(2, p.orn) : p.orn > 2 ? 1 : 0;
  for (let i = 0; i < nr; i++) {
    const q = cl[Math.round(lerp(4, N - 2, nr === 1 ? 0.5 : i / (nr - 1)))] as Pt;
    rings += circle(q, w0 * 0.42, i % 2 && p.hybrid ? pal.accent : pal.second);
  }
  if (p.mutated) rings += circle(cl[5] as Pt, 2.5, pal.accent, pal.dark, 1.4);
  const body = shaded(sc, d, pal, rings, 3);
  // punta de la cola
  const e1 = cl[N - 1] as Pt;
  const deg = (Math.atan2(E[1] - e1[1], E[0] - e1[0]) * 180) / Math.PI + 90;
  const tipFam = p.hybrid && p.tpl !== 0 ? p.alt : p.fam;
  const tip = tailTip(p, tipFam, w0);
  sc.bb.add(E[0], E[1], w0 * 2.2);
  const tipFirst = p.fam === "marea" || p.fam === "brote";
  return tipFirst ? place(E, deg, tip) + body : body + place(E, deg, tip);
}

function tailTip(p: Piece, fam: string, w0: number): string {
  const pal = p.pal;
  const o = p.s[3];
  const sz = w0 * (1.2 + 0.6 * o);
  switch (fam) {
    case "llama":
      if (p.tpl === 1) return [-35, 0, 35].map((a) => place([0, 2], a, tuft("llama", sz * 0.55, sz * (a === 0 ? 1.3 : 0.95), p.soft, pal))).join("");
      return place([0, 3], 0, tuft("llama", sz * 0.85, sz * 1.5, p.soft, pal));
    case "marea": {
      if (p.tpl === 1) return place([0, 2], 0, solid(roundedPoly([[0, 0], [-sz * 0.8, -sz * 0.6], [-sz * 0.5, -sz * 1.2], [0, -sz * 0.9], [sz * 0.5, -sz * 1.2], [sz * 0.8, -sz * 0.6]], sz * 0.35), pal.second, pal.dark));
      const lobe = (s: number) => place([0, 3], s * 40, solid(roundedPoly([[-sz * 0.25, 0], [-sz * 0.15, -sz * 1.2], [sz * 0.45, -sz * 0.5]], sz * (0.22 - 0.12 * p.s[2])), pal.second, pal.dark));
      return lobe(-1) + lobe(1);
    }
    case "brote":
      if (p.tpl === 2) {
        let s = "";
        for (let i = 0; i < 5; i++) s += place([0, 0], i * 72, solid(roundedPoly([[0, 0], [-sz * 0.3, -sz * 0.5], [0, -sz * 0.85], [sz * 0.3, -sz * 0.5]], sz * 0.25), pal.accent, pal.dark));
        return s + circle([0, 0], sz * 0.25, pal.second, pal.dark);
      }
      if (p.tpl === 1) return place([0, 2], -30, tuft("brote", sz * 0.7, sz * 1.3, 0.35, pal)) + place([0, 2], 35, tuft("brote", sz * 0.6, sz * 1.1, 0.35, pal, pal.main));
      return place([0, 3], 0, tuft("brote", sz * 0.8, sz * 1.5, 0.35, pal));
    case "roca":
      if (p.tpl === 1) return place([0, 2], 0, tuft("roca", sz * 0.55, sz * 1.2, 0.12, pal)) + place([sz * 0.2, 2], 30, tuft("roca", sz * 0.4, sz * 0.8, 0.12, pal));
      {
        let s = solid(smoothClosed([[0, 2], [-sz * 0.55, -sz * 0.2], [-sz * 0.45, -sz * 0.8], [0, -sz * 1.0], [sz * 0.5, -sz * 0.75], [sz * 0.55, -sz * 0.15]]), pal.second, pal.dark, SW);
        if (p.tpl === 2) for (const a of [-50, 0, 50]) s += place([0, -sz * 0.5], a, solid(roundedPoly([[-3, -sz * 0.4], [0, -sz * 0.75], [3, -sz * 0.4]], 1.5), pal.second, pal.dark));
        else s += line(`M${p2s([-sz * 0.2, -sz * 0.75])}L${p2s([0, -sz * 0.45])}L${p2s([-sz * 0.1, -sz * 0.15])}`, pal.dark, 1.8);
        return s;
      }
    case "voltio":
      if (p.tpl === 1) return circle([0, -sz * 0.35], sz * 0.42, pal.accent, pal.dark);
      if (p.tpl === 2) return place([0, 2], -28, tuft("voltio", sz * 0.5, sz * 1.0, p.soft * 0.5, pal)) + place([0, 2], 28, tuft("voltio", sz * 0.5, sz * 1.0, p.soft * 0.5, pal));
      return place([0, 3], 0, tuft("voltio", sz * 0.75, sz * 1.5, p.soft * 0.5, pal));
    default: // sombra
      if (p.tpl === 1) return star([0, -sz * 0.35], sz * 0.75, pal.accent) + line(roundedPoly(starPts([0, -sz * 0.35], sz * 0.75), 0.6), pal.dark, 2.2);
      if (p.tpl === 2) return place([0, 3], -20, tuft("sombra", sz * 0.8, sz * 1.4, 0.4, pal));
      return solid(`M${p2s([-sz * 0.45, -sz * 0.2])}A${f(sz * 0.6)} ${f(sz * 0.6)} 0 1 0 ${p2s([sz * 0.45, -sz * 0.2])}A${f(sz * 0.45)} ${f(sz * 0.45)} 0 1 1 ${p2s([-sz * 0.45, -sz * 0.2])}Z`, pal.accent, pal.dark);
  }
}

function starPts(c: Pt, r: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4, rr = i % 2 === 0 ? r : r * 0.38;
    pts.push([c[0] + Math.cos(a - Math.PI / 2) * rr, c[1] + Math.sin(a - Math.PI / 2) * rr]);
  }
  return pts;
}
