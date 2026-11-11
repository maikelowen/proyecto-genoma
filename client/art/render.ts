/**
 * renderCreatureSvg(creature, cfg): SVG autocontenido de la criatura,
 * generado solo a partir de sus genes D (determinista: mismo genoma →
 * mismo SVG). Orden de dibujo: cola, patas lejanas y cercanas, adornos
 * dorsales, cuerpo (tapa las caderas), adornos de cabeza, cabeza, cara.
 */
import type { Creature, Gene, GeneticsConfig } from "../../packages/core/src/index.ts";
import { f, hashStr } from "./geom.ts";
import { EXPRESSIONS, face, type Expression } from "./face.ts";
import { paletteOf } from "./palette.ts";
import { bodyBack, bodyFrame, bodyMain, GROUND, headFrame, headMain, legLength, limbs, tail, Scene, type Piece } from "./parts.ts";

const BASE_FALLBACK = "brote";

function level(v: number): number {
  return Math.max(0, Math.min(4, Math.round(v * 4)));
}

/** Datos de dibujo de una pieza a partir de su gen. */
export function pieceOf(g: Gene, cfg: GeneticsConfig): Piece {
  const hy = cfg.hybridById.get(g.family);
  const s = [g.shape[0], g.shape[1], g.shape[2], g.shape[3]] as const;
  const l = s.map(level);
  let fam = g.family, alt = g.family;
  if (hy) {
    // híbrida: la anatomía de un componente (elegido por la forma), adornos del otro
    const k = ((l[0] as number) + (l[2] as number)) % 2;
    fam = hy.components[k] as string;
    alt = hy.components[1 - k] as string;
  } else if (!cfg.baseFamilies.includes(fam)) {
    fam = alt = BASE_FALLBACK;
  }
  const mutated = g.origin === "mutacion";
  return {
    fam,
    alt,
    hybrid: hy !== undefined,
    mutated,
    pal: paletteOf(g.family, hy?.components),
    s,
    tpl: ((l[3] as number) + 2 * (l[1] as number)) % 3,
    orn: Math.round(s[3] * 3) + (hy ? 1 : 0) + (mutated ? 1 : 0),
    soft: 0.45 - 0.35 * s[2],
    seed: hashStr(`${g.family}|${g.locus}|${g.signature}`),
  };
}

/** Expresión determinista desde los genes de cabeza (D y R1: se hereda a menudo). */
export function expressionOf(c: Creature): Expression {
  const h = c.genome.cabeza;
  return EXPRESSIONS[hashStr(`${h.D.family}|${h.D.signature}|${h.R1.signature}`) % EXPRESSIONS.length] as Expression;
}

export interface RenderOptions {
  /** Tamaño en px del <svg> (por defecto 200). */
  readonly size?: number;
  /** Prefijo de ids (para varias copias en una página; por defecto, del genoma). */
  readonly idPrefix?: string;
}

export function renderCreatureSvg(creature: Creature, cfg: GeneticsConfig, opts: RenderOptions = {}): string {
  const g = creature.genome;
  const pH = pieceOf(g.cabeza.D, cfg), pB = pieceOf(g.cuerpo.D, cfg), pL = pieceOf(g.extremidades.D, cfg), pT = pieceOf(g.cola.D, cfg);
  const key = [g.cabeza.D, g.cuerpo.D, g.extremidades.D, g.cola.D, g.cabeza.R1].map((x) => `${x.family}${x.signature}${x.origin[0]}`).join(".");
  const sc = new Scene(opts.idPrefix ?? `k${hashStr(creature.id + "/" + key).toString(36)}`);

  const fr = bodyFrame(pB, legLength(pL));
  const hf = headFrame(pH, fr.neck);
  const tailSvg = tail(sc, pT, fr.tail);
  const legs = limbs(sc, pL, fr);
  const back = bodyBack(sc, pB, fr);
  const body = bodyMain(sc, pB, fr);
  const head = headMain(sc, pH, hf);
  const faceSvg = face(sc, hf, expressionOf(creature), pH.pal);

  // encaje en el lienzo: escala ≤ 1 y centrado horizontal, suelo fijo
  const bb = sc.bb;
  const w = bb.maxX - bb.minX, h = GROUND + 4 - bb.minY;
  const s = Math.min(1, 186 / w, 186 / h);
  const tx = 100 - s * ((bb.minX + bb.maxX) / 2);
  const ty = 194 - s * (GROUND + 4);
  const shadowW = (fr.bw + 20) * s;
  const size = opts.size ?? 200;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${size}" height="${size}" role="img" aria-label="${creature.family}">` +
    `<defs>${sc.defs.join("")}</defs>` +
    `<ellipse cx="100" cy="${f(ty + s * GROUND + 2)}" rx="${f(shadowW)}" ry="${f(6 * s)}" fill="#000" fill-opacity="0.12"/>` +
    `<g transform="translate(${f(tx)} ${f(ty)}) scale(${(Math.round(s * 1000) / 1000).toString()})">` +
    tailSvg + legs.far + legs.near + back + body + head.back + head.main + faceSvg +
    `</g></svg>`
  );
}
