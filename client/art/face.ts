/**
 * Ojos, párpados, cejas y boca. La expresión se elige de forma
 * determinista desde los genes de cabeza (ver render.ts).
 */
import { f, p2s, smoothOpen, type Pt } from "./geom.ts";
import { line, solid, type HeadFrame, type Scene } from "./parts.ts";
import type { Palette } from "./palette.ts";

export const EXPRESSIONS = ["decidida", "picara", "despistada", "alegre", "curiosa", "tranquila"] as const;
export type Expression = (typeof EXPRESSIONS)[number];

interface ExprParams {
  /** Fracción del ojo tapada por el párpado superior (0..0,55). */
  lid: number;
  /** Inclinación del párpado (+ = baja hacia el interior: mirada firme). */
  lidTilt: number;
  /** Altura de las cejas (+ = más altas). */
  browUp: number;
  /** Inclinación de las cejas (+ = extremo interior más bajo). */
  browTilt: number;
  /** Asimetría: la ceja del ojo lejano sube esto. */
  browAsym: number;
  gaze: Pt;
  pupil: number;
  happy: boolean;
  mouth: "flat" | "smirk" | "o" | "open" | "smile";
}

const PARAMS: Record<Expression, ExprParams> = {
  decidida: { lid: 0.3, lidTilt: 0.25, browUp: 0, browTilt: 0.45, browAsym: 0, gaze: [0.6, 0], pupil: 0.95, happy: false, mouth: "flat" },
  picara: { lid: 0.32, lidTilt: -0.1, browUp: 0.1, browTilt: 0.1, browAsym: 0.45, gaze: [0.7, 0.1], pupil: 0.9, happy: false, mouth: "smirk" },
  despistada: { lid: 0.05, lidTilt: 0, browUp: 0.45, browTilt: -0.3, browAsym: 0.15, gaze: [-0.2, -0.55], pupil: 0.8, happy: false, mouth: "o" },
  alegre: { lid: 0, lidTilt: 0, browUp: 0.35, browTilt: -0.15, browAsym: 0, gaze: [0.4, 0], pupil: 1, happy: true, mouth: "open" },
  curiosa: { lid: 0, lidTilt: 0, browUp: 0.3, browTilt: 0, browAsym: 0.35, gaze: [0.75, -0.2], pupil: 1.15, happy: false, mouth: "o" },
  tranquila: { lid: 0.45, lidTilt: -0.05, browUp: 0.1, browTilt: -0.1, browAsym: 0, gaze: [0.3, 0.2], pupil: 0.95, happy: false, mouth: "smile" },
};

function eye(sc: Scene, c: Pt, r: number, inner: 1 | -1, x: ExprParams, pal: Palette, lidColor: string): string {
  const rx = r * 0.82, ry = r;
  const id = sc.nextId();
  sc.defs.push(`<clipPath id="${id}"><ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="${f(rx)}" ry="${f(ry)}"/></clipPath>`);
  const pc: Pt = [c[0] + x.gaze[0] * rx * 0.35, c[1] + x.gaze[1] * ry * 0.3 + r * 0.08];
  let g = `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="${f(rx)}" ry="${f(ry)}" fill="#fffdf6"/>`;
  g += `<ellipse cx="${f(pc[0])}" cy="${f(pc[1])}" rx="${f(rx * 0.55 * x.pupil)}" ry="${f(ry * 0.66 * x.pupil)}" fill="${pal.dark}"/>`;
  g += `<circle cx="${f(pc[0] - rx * 0.18)}" cy="${f(pc[1] - ry * 0.25)}" r="${f(r * 0.2)}" fill="#ffffff"/>`;
  // párpado superior: borde inclinado (el lado interior baja con lidTilt)
  const yl = c[1] - ry + 2 * ry * x.lid;
  const yIn = yl + x.lidTilt * ry, yOut = yl - x.lidTilt * ry * 0.5;
  const xIn = c[0] + inner * rx * 1.3, xOut = c[0] - inner * rx * 1.3;
  if (x.lid > 0) {
    g += `<path d="M${p2s([xOut, c[1] - ry * 1.5])}L${p2s([xIn, c[1] - ry * 1.5])}L${p2s([xIn, yIn])}L${p2s([xOut, yOut])}Z" fill="${lidColor}"/>`;
    g += line(`M${p2s([xOut, yOut])}L${p2s([xIn, yIn])}`, pal.dark, 3);
  }
  if (x.happy) {
    // párpado inferior que sube (ojos sonrientes)
    g += `<path d="M${p2s([c[0] - rx * 1.3, c[1] + ry * 1.3])}L${p2s([c[0] - rx * 1.3, c[1] + ry * 0.55])}Q${p2s([c[0], c[1] + ry * 0.05])} ${p2s([c[0] + rx * 1.3, c[1] + ry * 0.55])}L${p2s([c[0] + rx * 1.3, c[1] + ry * 1.3])}Z" fill="${lidColor}"/>`;
    g += line(`M${p2s([c[0] - rx, c[1] + ry * 0.45])}Q${p2s([c[0], c[1] + ry * 0.08])} ${p2s([c[0] + rx, c[1] + ry * 0.45])}`, pal.dark, 2.6);
  }
  return `<g clip-path="url(#${id})">${g}</g><ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="${f(rx)}" ry="${f(ry)}" fill="none" stroke="${pal.dark}" stroke-width="3"/>`;
}

function brow(c: Pt, r: number, inner: 1 | -1, x: ExprParams, extraUp: number, pal: Palette): string {
  const y = c[1] - r * (1.35 + x.browUp + extraUp);
  const xIn = c[0] + inner * r * 0.75, xOut = c[0] - inner * r * 0.8;
  const yIn = y + x.browTilt * r * 0.6, yOut = y - x.browTilt * r * 0.35;
  const mid: Pt = [(xIn + xOut) / 2, (yIn + yOut) / 2 - r * 0.18];
  return line(smoothOpen([[xOut, yOut], mid, [xIn, yIn]]), pal.dark, Math.max(3.2, r * 0.32));
}

function mouth(m: Pt, r: number, x: ExprParams, pal: Palette): string {
  const w = r * 0.32;
  switch (x.mouth) {
    case "flat":
      return line(`M${p2s([m[0] - w, m[1] - 1])}Q${p2s([m[0], m[1] + 2])} ${p2s([m[0] + w, m[1] - 2])}`, pal.dark, 3);
    case "smirk":
      return line(`M${p2s([m[0] - w, m[1] + 1])}Q${p2s([m[0] + w * 0.2, m[1] + 3])} ${p2s([m[0] + w * 1.1, m[1] - 4])}`, pal.dark, 3);
    case "o":
      return `<ellipse cx="${f(m[0])}" cy="${f(m[1] + 1)}" rx="${f(w * 0.38)}" ry="${f(w * 0.48)}" fill="${pal.dark}"/>`;
    case "open":
      return solid(`M${p2s([m[0] - w, m[1] - 2])}Q${p2s([m[0], m[1] + w * 1.4])} ${p2s([m[0] + w, m[1] - 2])}Z`, pal.dark, pal.dark, 2.4) +
        `<ellipse cx="${f(m[0] + 0.5)}" cy="${f(m[1] + w * 0.38)}" rx="${f(w * 0.45)}" ry="${f(w * 0.22)}" fill="#e98a8a"/>`;
    default:
      return line(`M${p2s([m[0] - w, m[1] - 2])}Q${p2s([m[0], m[1] + 4])} ${p2s([m[0] + w, m[1] - 3])}`, pal.dark, 3);
  }
}

export function face(sc: Scene, h: HeadFrame, expr: Expression, pal: Palette): string {
  const x = PARAMS[expr];
  const [e1, e2] = h.eyes;
  const r1 = h.eyeR, r2 = h.eyeR * 0.86;
  return (
    eye(sc, e1, r1, 1, x, pal, pal.main) +
    eye(sc, e2, r2, -1, x, pal, pal.main) +
    brow(e1, r1, 1, x, 0, pal) +
    brow(e2, r2, -1, x, x.browAsym, pal) +
    mouth(h.mouth, h.r, x, pal)
  );
}
