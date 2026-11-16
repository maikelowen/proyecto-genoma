/** Arte del mapa (spec mundo v0.1 §7): todo dibujado por código en canvas, en «unidades de casilla» (0..1) escaladas.
 *  Lo aleatorio del dibujo sale de un hash entero de la coordenada y la semilla visual (nunca Math.random ni la RNG de reglas).
 *  Sin trigonometría: la onda es una tabla de 32 valores. */
import type { MapDef } from "../../packages/core/src/index.ts";
import { mix } from "../art/palette.ts";
import { LOOK } from "./data.ts";

// ------------------------------------------------------------------ hash, onda, colores
let VSEED = 0;
for (const ch of LOOK.semilla_visual) VSEED = (Math.imul(VSEED ^ ch.charCodeAt(0), 0x9e3779b1) + 0x7f4a7c15) | 0;

export function hash32(x: number, y: number, k = 0): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(k | 0, 0x85ebca6b) ^ VSEED;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}
/** [0, 1) determinista. */
export const h01 = (x: number, y: number, k = 0): number => hash32(x, y, k) / 4294967296;

const WAVE: number[] = [];
for (let i = 0; i < 32; i++) {
  const p = i / 32;
  const tri = p < 0.25 ? p * 4 : p < 0.75 ? 2 - p * 4 : p * 4 - 4;
  WAVE.push(tri * (1.5 - 0.5 * tri * tri)); // aproximación cúbica de una onda suave, sin trigonometría
}
/** Onda periódica suave en [-1, 1]; `p` en ciclos. */
export function wave(p: number): number {
  const f = (p - Math.floor(p)) * 32;
  const i = Math.floor(f);
  const a = WAVE[i & 31] as number;
  const b = WAVE[(i + 1) & 31] as number;
  return a + (b - a) * (f - i);
}
export const TAU = Math.PI * 2;

export function col(tile: string, i: number): string {
  const c = LOOK.casillas[tile]?.colores ?? [];
  return c[i] ?? c[0] ?? "#ff00ff";
}
export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export type Ctx = CanvasRenderingContext2D;
export function canvas(w: number, h: number): { c: HTMLCanvasElement; x: Ctx } {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return { c, x: c.getContext("2d") as Ctx };
}

// ------------------------------------------------------------------ terreno
export interface Terrain {
  readonly map: MapDef;
  ch(x: number, y: number): string;
}
export function terrainOf(map: MapDef): Terrain {
  return {
    map,
    ch: (x, y) => (x < 0 || y < 0 || x >= map.width || y >= map.height ? "#" : (map.rows[y] as string)[x] as string),
  };
}
type Pred = (x: number, y: number) => boolean;

/** Forma unida de un terreno: cuadrados que crecen `g` hacia los vecinos de otro tipo, esquinas convexas redondeadas,
 *  esquinas cóncavas con filete y bultos irregulares en los bordes (§7.2). */
function shape(x: Ctx, T: Terrain, p: Pred, r0: [number, number, number, number], g: number, r: number, color: string, bump: number, salt: number, fillet = 0.29): void {
  const [ax, ay, bx, by] = r0;
  x.fillStyle = color;
  const e = 0.012;
  for (let ty = ay; ty <= by; ty++) {
    for (let tx = ax; tx <= bx; tx++) {
      const me = p(tx, ty);
      const N = p(tx, ty - 1), S = p(tx, ty + 1), W = p(tx - 1, ty), E = p(tx + 1, ty);
      if (me) {
        const l = tx - (W ? e : g), t = ty - (N ? e : g), rr = tx + 1 + (E ? e : g), b = ty + 1 + (S ? e : g);
        const R = Math.min(r + g, 0.49 + g);
        x.beginPath();
        x.roundRect(l, t, rr - l, b - t, [!N && !W ? R : 0, !N && !E ? R : 0, !S && !E ? R : 0, !S && !W ? R : 0]);
        x.fill();
        if (bump > 0) {
          const sides: [boolean, number, number, number, number][] = [
            [N, tx, ty - g, 1, 0], [S, tx, ty + 1 + g, 1, 0], [W, tx - g, ty, 0, 1], [E, tx + 1 + g, ty, 0, 1],
          ];
          sides.forEach(([nb, sx, sy, dx, dy], k) => {
            if (nb) return;
            for (let j = 0; j < 2; j++) {
              const u = 0.22 + 0.56 * h01(tx * 4 + k, ty, salt + j * 7);
              const rad = bump * (0.55 + 0.6 * h01(tx, ty * 4 + k, salt + j * 13));
              const out = (h01(tx + k, ty, salt + 99 + j) - 0.35) * bump * 0.8;
              const cx = sx + dx * u + (dy ? (k === 2 ? -out : out) : 0);
              const cy = sy + dy * u + (dx ? (k === 0 ? -out : out) : 0);
              x.beginPath();
              x.arc(cx, cy, rad, 0, TAU);
              x.fill();
            }
          });
        }
      } else {
        // filetes en las esquinas cóncavas
        const rf = fillet;
        const corners: [boolean, boolean, number, number, number, number][] = [
          [N, W, tx + g, ty + g, 1, 1], [N, E, tx + 1 - g, ty + g, -1, 1], [S, E, tx + 1 - g, ty + 1 - g, -1, -1], [S, W, tx + g, ty + 1 - g, 1, -1],
        ];
        for (const [a, c, cx, cy, dx, dy] of corners) {
          if (!a || !c) continue;
          x.beginPath();
          x.moveTo(cx - dx * e, cy - dy * e);
          x.lineTo(cx + dx * rf, cy - dy * e);
          x.quadraticCurveTo(cx, cy, cx - dx * e, cy + dy * rf);
          x.closePath();
          x.fill();
        }
      }
    }
  }
}

const isTall = (c: string): boolean => c === "," || c === ";";
const isWater = (c: string): boolean => c === "~" || c === "+";
const isPath = (c: string): boolean => c === "=" || c === "P" || c === "S";

function blade(x: Ctx, bx: number, by: number, hgt: number, lean: number, w: number): void {
  x.beginPath();
  x.moveTo(bx - w, by);
  x.quadraticCurveTo(bx - w * 0.3 + lean * 0.3, by - hgt * 0.55, bx + lean, by - hgt);
  x.quadraticCurveTo(bx + w * 0.4 + lean * 0.35, by - hgt * 0.5, bx + w, by);
  x.closePath();
  x.fill();
}

/** Dibuja el terreno estático de las casillas [ax..bx]×[ay..by] (con margen para que los bloques casen). `x` ya está escalado a casillas. */
export function drawGround(x: Ctx, T: Terrain, ax: number, ay: number, bx: number, by: number): void {
  const R: [number, number, number, number] = [ax - 2, ay - 2, bx + 2, by + 2];
  const [x0, y0, x1, y1] = R;
  const c = T.ch;
  // 1. hierba base con manchas de tono
  x.fillStyle = col("hierba", 0);
  x.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      for (let k = 0; k < 2; k++) {
        const v = h01(tx, ty, 11 + k);
        x.fillStyle = v < 0.5 ? mix(col("hierba", 0), col("hierba", 1), 0.25 + v * 0.6) : mix(col("hierba", 0), col("hierba", 2), (v - 0.5) * 0.45);
        x.beginPath();
        x.ellipse(tx + h01(tx, ty, 21 + k), ty + h01(tx, ty, 31 + k), 0.3 + 0.3 * h01(tx, ty, 41 + k), 0.22 + 0.2 * h01(tx, ty, 51 + k), 0, 0, TAU);
        x.fill();
      }
    }
  }
  // 2. suelo del bosque y de la hierba alta
  shape(x, T, (a, b) => c(a, b) === "T" || c(a, b) === "#", R, 0.16, 0.4, "#2a4a3a", 0.16, 1);
  shape(x, T, (a, b) => isTall(c(a, b)), R, 0.13, 0.42, col("hierba_alta", 1), 0.16, 2);
  shape(x, T, (a, b) => isTall(c(a, b)), R, 0.03, 0.4, col("hierba_alta", 0), 0.12, 3);
  shape(x, T, (a, b) => c(a, b) === ";", R, 0.06, 0.4, col("hierba_espesa", 1), 0.12, 4);
  shape(x, T, (a, b) => c(a, b) === ";", R, -0.06, 0.35, col("hierba_espesa", 0), 0.1, 5);
  // 3. camino: labio oscuro, tierra, luces y guijarros
  x.save();
  x.translate(0, 0.05);
  shape(x, T, (a, b) => isPath(c(a, b)), R, 0.1, 0.3, col("camino", 1), 0.1, 6);
  x.restore();
  shape(x, T, (a, b) => isPath(c(a, b)), R, 0.08, 0.3, col("camino", 0), 0.1, 6);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!isPath(c(tx, ty))) continue;
      x.fillStyle = mix(col("camino", 0), col("camino", 2), 0.55);
      x.beginPath();
      x.ellipse(tx + 0.3 + 0.4 * h01(tx, ty, 61), ty + 0.3 + 0.4 * h01(tx, ty, 62), 0.22, 0.12, 0, 0, TAU);
      x.fill();
      x.fillStyle = mix(col("camino", 0), col("camino", 1), 0.5);
      x.beginPath();
      x.ellipse(tx + 0.25 + 0.5 * h01(tx, ty, 63), ty + 0.6 + 0.3 * h01(tx, ty, 64), 0.16, 0.06, 0, 0, TAU);
      x.fill();
      const n = 1 + (hash32(tx, ty, 65) % 3);
      for (let i = 0; i < n; i++) {
        const px = tx + 0.12 + 0.76 * h01(tx, ty, 70 + i), py = ty + 0.12 + 0.76 * h01(tx, ty, 80 + i), rr = 0.025 + 0.035 * h01(tx, ty, 90 + i);
        x.fillStyle = col("camino", 1);
        x.beginPath();
        x.ellipse(px, py + 0.015, rr * 1.3, rr, 0, 0, TAU);
        x.fill();
        x.fillStyle = h01(tx, ty, 95 + i) < 0.5 ? "#c9b79a" : "#9b8f86";
        x.beginPath();
        x.ellipse(px, py, rr * 1.2, rr * 0.85, 0, 0, TAU);
        x.fill();
      }
    }
  }
  // 4. agua: arena, arena mojada, espuma, agua y fondo
  const W: Pred = (a, b) => isWater(c(a, b));
  shape(x, T, W, R, 0.17, 0.42, "#b39a6c", 0.1, 7, 0.5);
  shape(x, T, W, R, 0.09, 0.42, "#7d6c50", 0.08, 7, 0.5);
  shape(x, T, W, R, 0.04, 0.42, mix(col("agua", 2), col("agua", 3), 0.4), 0.07, 7, 0.5);
  shape(x, T, W, R, -0.01, 0.4, col("agua", 0), 0.06, 7, 0.5);
  shape(x, T, (a, b) => W(a, b) && W(a - 1, b) && W(a + 1, b) && W(a, b - 1) && W(a, b + 1), R, 0.22, 0.45, col("agua", 1), 0.08, 8);
  // reflejos fijos en la orilla
  x.strokeStyle = rgba(col("agua", 2), 0.55);
  x.lineWidth = 0.03;
  x.lineCap = "round";
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (c(tx, ty) !== "~" || h01(tx, ty, 101) < 0.35) continue;
      const px = tx + 0.2 + 0.5 * h01(tx, ty, 102), py = ty + 0.25 + 0.5 * h01(tx, ty, 103);
      x.beginPath();
      x.moveTo(px, py);
      x.quadraticCurveTo(px + 0.12, py - 0.05, px + 0.26, py);
      x.stroke();
    }
  }
  // 5. puente
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (c(tx, ty) !== "+") continue;
      const vertical = !isWater(c(tx - 1, ty)) ? false : true; // el arroyo corre norte-sur: el puente va oeste-este
      x.save();
      if (vertical) {
        x.translate(tx + 0.5, ty + 0.5);
        x.rotate(Math.PI / 2);
        x.translate(-tx - 0.5, -ty - 0.5);
      }
      x.fillStyle = "rgba(5,10,25,0.35)";
      x.fillRect(tx - 0.15, ty + 0.2, 1.3, 0.72);
      for (let i = 0; i < 6; i++) {
        const px = tx - 0.15 + i * 0.217;
        x.fillStyle = i % 2 ? col("puente", 0) : mix(col("puente", 0), col("puente", 2), 0.3);
        x.beginPath();
        x.roundRect(px, ty + 0.1 + 0.02 * h01(tx, i, 111), 0.2, 0.74, 0.03);
        x.fill();
        x.fillStyle = col("puente", 1);
        x.fillRect(px + 0.02, ty + 0.78, 0.16, 0.05);
      }
      x.fillStyle = col("puente", 1);
      x.fillRect(tx - 0.18, ty + 0.06, 1.36, 0.08);
      x.fillRect(tx - 0.18, ty + 0.8, 1.36, 0.08);
      x.fillStyle = col("puente", 2);
      x.fillRect(tx - 0.18, ty + 0.06, 1.36, 0.03);
      x.fillRect(tx - 0.18, ty + 0.8, 1.36, 0.03);
      x.restore();
    }
  }
  // 6. detalle de la hierba baja y las flores
  const FL = [col("flores", 1), col("flores", 2), col("flores", 3)];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const k = c(tx, ty);
      if (k !== "." && k !== "*") continue;
      const tufts = hash32(tx, ty, 121) % 4;
      for (let i = 0; i < tufts; i++) {
        const px = tx + 0.15 + 0.7 * h01(tx, ty, 130 + i), py = ty + 0.3 + 0.62 * h01(tx, ty, 140 + i);
        x.fillStyle = i % 2 ? col("hierba", 2) : col("hierba", 1);
        const nb = 2 + (hash32(tx, ty, 150 + i) % 3);
        for (let j = 0; j < nb; j++) blade(x, px + (j - nb / 2) * 0.035, py, 0.1 + 0.07 * h01(tx, j, 160 + i), (j - nb / 2 + 0.5) * 0.05, 0.016);
      }
      if (h01(tx, ty, 170) < 0.35) {
        x.fillStyle = rgba(col("hierba", 2), 0.6);
        x.beginPath();
        x.arc(tx + h01(tx, ty, 171), ty + h01(tx, ty, 172), 0.025, 0, TAU);
        x.fill();
      }
      const nf = k === "*" ? 3 + (hash32(tx, ty, 180) % 4) : h01(tx, ty, 181) < 0.1 ? 1 : 0;
      const ca = FL[hash32(tx, ty, 182) % 3] as string, cb = FL[hash32(tx, ty, 183) % 3] as string;
      for (let i = 0; i < nf; i++) {
        const px = tx + 0.15 + 0.7 * h01(tx, ty, 190 + i), py = ty + 0.15 + 0.7 * h01(tx, ty, 200 + i);
        x.fillStyle = col("hierba", 1);
        x.fillRect(px - 0.006, py, 0.012, 0.08);
        x.fillStyle = i % 2 ? cb : ca;
        for (let p = 0; p < 4; p++) {
          x.beginPath();
          x.arc(px + (p % 2 ? 0.024 : -0.024) * (p < 2 ? 1 : 0), py + (p >= 2 ? (p === 2 ? 0.024 : -0.024) : 0), 0.026, 0, TAU);
          x.fill();
        }
        x.fillStyle = "#fff3c4";
        x.beginPath();
        x.arc(px, py, 0.016, 0, TAU);
        x.fill();
      }
    }
  }
  // 7. rocas y troncos (con sombra)
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const k = c(tx, ty);
      if (k === "R") drawRock(x, tx, ty);
      else if (k === "T") {
        x.fillStyle = "rgba(8,14,12,0.35)";
        x.beginPath();
        x.ellipse(tx + 0.55, ty + 0.78, 0.62, 0.26, 0, 0, TAU);
        x.fill();
        x.fillStyle = "#3a281c";
        x.beginPath();
        x.moveTo(tx + 0.38, ty + 0.9);
        x.quadraticCurveTo(tx + 0.45, ty + 0.7, tx + 0.44, ty + 0.4);
        x.lineTo(tx + 0.58, ty + 0.4);
        x.quadraticCurveTo(tx + 0.56, ty + 0.7, tx + 0.64, ty + 0.9);
        x.closePath();
        x.fill();
        x.fillStyle = "#5a3f2b";
        x.fillRect(tx + 0.46, ty + 0.42, 0.04, 0.44);
      }
    }
  }
  // 8. santuario
  drawSanctuary(x, T, R);
}

function drawRock(x: Ctx, tx: number, ty: number): void {
  const j = (k: number): number => (h01(tx, ty, 300 + k) - 0.5) * 0.12;
  x.fillStyle = "rgba(8,10,20,0.35)";
  x.beginPath();
  x.ellipse(tx + 0.55, ty + 0.84, 0.44, 0.15, 0, 0, TAU);
  x.fill();
  const pts: [number, number][] = [[0.12 + j(0), 0.82], [0.1 + j(1), 0.5 + j(2)], [0.3 + j(3), 0.2 + j(4)], [0.62 + j(5), 0.14 + j(6)], [0.88 + j(7), 0.42 + j(8)], [0.9 + j(9), 0.82]];
  const poly = (p: [number, number][], fill: string): void => {
    x.fillStyle = fill;
    x.beginPath();
    p.forEach(([a, b], i) => (i ? x.lineTo(tx + a, ty + b) : x.moveTo(tx + a, ty + b)));
    x.closePath();
    x.fill();
  };
  poly(pts, col("roca", 1));
  const [p1, p2, p3, p4, p5] = pts as [[number, number], [number, number], [number, number], [number, number], [number, number]];
  poly([p1, p2, p3, p4, [p4[0] - 0.05, 0.55], [0.3, 0.62]], col("roca", 0));
  poly([p2, p3, p4, [p4[0] - 0.1, p4[1] + 0.16], [p3[0] - 0.02, p3[1] + 0.2]], col("roca", 2));
  void p5;
  x.strokeStyle = mix(col("roca", 2), "#ffffff", 0.35);
  x.lineWidth = 0.022;
  x.beginPath();
  x.moveTo(tx + p2[0], ty + p2[1]);
  x.lineTo(tx + p3[0], ty + p3[1]);
  x.lineTo(tx + p4[0], ty + p4[1]);
  x.stroke();
  if (h01(tx, ty, 320) < 0.6) {
    x.fillStyle = "#4f7a45";
    x.beginPath();
    x.ellipse(tx + 0.25 + 0.3 * h01(tx, ty, 321), ty + 0.62, 0.14, 0.06, 0, 0, TAU);
    x.fill();
    x.fillStyle = "#6f9a55";
    x.beginPath();
    x.ellipse(tx + 0.25 + 0.3 * h01(tx, ty, 321) - 0.03, ty + 0.6, 0.07, 0.03, 0, 0, TAU);
    x.fill();
  }
}

/** El santuario: tejado a dos aguas en la fila de arriba, muro de piedra en hiladas, ventanas cálidas y arco de puerta. */
function drawSanctuary(x: Ctx, T: Terrain, R: [number, number, number, number]): void {
  let minX = 99, maxX = -1, minY = 99, maxY = -1;
  for (let ty = 0; ty < T.map.height; ty++)
    for (let tx = 0; tx < T.map.width; tx++) {
      const k = T.ch(tx, ty);
      if (k === "H" || k === "P") {
        minX = Math.min(minX, tx); maxX = Math.max(maxX, tx); minY = Math.min(minY, ty); maxY = Math.max(maxY, ty);
      }
    }
  if (maxX < 0 || maxX < R[0] || minX > R[2] || maxY < R[1] || minY > R[3]) return;
  const L = minX, Rr = maxX + 1, top = minY, bot = maxY + 1;
  const wallTop = top + 1.15;
  const [cM, cS, cL, cD] = [col("muro_santuario", 0), col("muro_santuario", 1), col("muro_santuario", 2), col("muro_santuario", 3)];
  // sombra
  x.fillStyle = "rgba(6,6,16,0.4)";
  x.beginPath();
  x.ellipse((L + Rr) / 2 + 0.2, bot - 0.05, (Rr - L) / 2 + 0.4, 0.3, 0, 0, TAU);
  x.fill();
  // muro
  x.fillStyle = cD;
  x.fillRect(L + 0.08, wallTop, Rr - L - 0.16, bot - wallTop - 0.04);
  const rows = 5;
  const rh = (bot - wallTop - 0.08) / rows;
  for (let i = 0; i < rows; i++) {
    const yy = wallTop + 0.02 + i * rh;
    let xx = L + 0.1 - (i % 2 ? 0.22 : 0);
    let k = 0;
    while (xx < Rr - 0.1) {
      const w = 0.36 + 0.18 * h01(i, k, 401);
      const a = Math.max(xx, L + 0.1), b = Math.min(xx + w, Rr - 0.1);
      if (b - a > 0.05) {
        x.fillStyle = h01(i, k, 402) < 0.3 ? cS : mix(cM, cS, 0.25 * h01(i, k, 403));
        x.beginPath();
        x.roundRect(a + 0.015, yy + 0.015, b - a - 0.03, rh - 0.03, 0.04);
        x.fill();
        x.fillStyle = rgba(cL, 0.55);
        x.fillRect(a + 0.04, yy + 0.02, b - a - 0.08, 0.025);
      }
      xx += w;
      k++;
    }
  }
  // ventanas
  for (const wx of [L + 0.75, Rr - 0.75]) {
    x.fillStyle = cD;
    x.beginPath();
    x.roundRect(wx - 0.2, wallTop + 0.35, 0.4, 0.5, [0.2, 0.2, 0.03, 0.03]);
    x.fill();
    x.fillStyle = "#f2b54a";
    x.beginPath();
    x.roundRect(wx - 0.14, wallTop + 0.41, 0.28, 0.4, [0.14, 0.14, 0.02, 0.02]);
    x.fill();
    x.fillStyle = "#ffe3a3";
    x.beginPath();
    x.roundRect(wx - 0.08, wallTop + 0.47, 0.1, 0.16, [0.05, 0.05, 0, 0]);
    x.fill();
    x.fillStyle = cD;
    x.fillRect(wx - 0.015, wallTop + 0.41, 0.03, 0.4);
    x.fillRect(wx - 0.14, wallTop + 0.6, 0.28, 0.03);
  }
  // puerta (la luz que respira va aparte, animada)
  const dx = doorX(T) + 0.5;
  x.fillStyle = col("puerta_santuario", 0);
  x.beginPath();
  x.roundRect(dx - 0.38, wallTop + 0.12, 0.76, bot - wallTop - 0.1, [0.38, 0.38, 0, 0]);
  x.fill();
  x.fillStyle = "#1c1218";
  x.beginPath();
  x.roundRect(dx - 0.28, wallTop + 0.22, 0.56, bot - wallTop - 0.2, [0.28, 0.28, 0, 0]);
  x.fill();
  x.fillStyle = cL;
  x.fillRect(dx - 0.46, bot - 0.1, 0.92, 0.08);
  // tejado a dos aguas
  const ridge = top + 0.05;
  const eave = wallTop + 0.08;
  x.fillStyle = "#231d29";
  x.beginPath();
  x.moveTo(L - 0.18, eave + 0.06);
  x.lineTo(L + 0.55, ridge);
  x.lineTo(Rr - 0.55, ridge);
  x.lineTo(Rr + 0.18, eave + 0.06);
  x.closePath();
  x.fill();
  const bands = 4;
  for (let i = 0; i < bands; i++) {
    const t0 = i / bands, t1 = (i + 1) / bands;
    const y0 = ridge + (eave - ridge) * t0, y1 = ridge + (eave - ridge) * t1;
    const lx0 = L + 0.55 - 0.73 * t0, lx1 = L + 0.55 - 0.73 * t1;
    const rx0 = Rr - 0.55 + 0.73 * t0, rx1 = Rr - 0.55 + 0.73 * t1;
    x.fillStyle = i % 2 ? "#3a2f42" : "#43364c";
    x.beginPath();
    x.moveTo(lx0 + 0.04, y0 + 0.02);
    x.lineTo(rx0 - 0.04, y0 + 0.02);
    x.lineTo(rx1 - 0.04, y1 - 0.02);
    // borde festoneado de tejas
    const n = Math.round(rx1 - lx1) * 3;
    for (let k = n; k > 0; k--) {
      const xa = lx1 + ((rx1 - lx1) * k) / n, xb = lx1 + ((rx1 - lx1) * (k - 1)) / n;
      x.quadraticCurveTo((xa + xb) / 2, y1 + 0.07, xb + 0.04 * (k === 1 ? 1 : 0), y1 - 0.02);
    }
    x.closePath();
    x.fill();
  }
  x.fillStyle = cL;
  x.fillRect(L + 0.55, ridge - 0.03, Rr - L - 1.1, 0.07);
  // emblema del Gran Farol sobre la puerta
  x.fillStyle = "#2b2530";
  x.beginPath();
  x.arc(dx, eave - 0.32, 0.17, 0, TAU);
  x.fill();
  x.fillStyle = "#f2b54a";
  x.beginPath();
  x.moveTo(dx, eave - 0.45);
  x.lineTo(dx + 0.08, eave - 0.32);
  x.lineTo(dx, eave - 0.2);
  x.lineTo(dx - 0.08, eave - 0.32);
  x.closePath();
  x.fill();
}
export function doorX(T: Terrain): number {
  for (let ty = 0; ty < T.map.height; ty++) for (let tx = 0; tx < T.map.width; tx++) if (T.ch(tx, ty) === "P") return tx;
  return 0;
}

// ------------------------------------------------------------------ sprites: hierba alta y copas
/** Mata de hierba alta: base en la mitad baja de la casilla, puntas que sobresalen ~1/3 por arriba. Área: x 0..1, y -0.45..1. */
/** `front`: matas bajas de la mitad de abajo (van por delante del jugador y le tapan los pies); si no, las de detrás. */
export function tuftSprite(s: number, dense: boolean, v: number, front: boolean): HTMLCanvasElement {
  const { c, x } = canvas(s, s * 1.45);
  x.setTransform(s, 0, 0, s, 0, s * 0.45);
  const id = dense ? "hierba_espesa" : "hierba_alta";
  const n = front ? (dense ? 4 : 3) : dense ? 4 : 3;
  const items: [number, number, number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const bx = 0.12 + 0.76 * ((i + (front ? 0.5 : 0.1 + 0.8 * h01(v, i, 505))) / n) + (h01(v, i, 501) - 0.5) * 0.1;
    const by = front ? 0.84 + 0.14 * h01(v, i, 502) : 0.42 + 0.3 * h01(v, i, 502);
    const hgt = front ? (dense ? 0.36 : 0.32) + 0.08 * h01(v, i, 503) : (dense ? 0.52 : 0.46) + 0.16 * h01(v, i, 503);
    const lean = (h01(v, i, 504) - 0.5) * 0.16;
    items.push([bx, Math.min(1, by), hgt, lean, i]);
  }
  items.sort((p, q) => p[1] - q[1]);
  const dark = col(id, 1), base = col(id, 0), light = col(id, 2);
  for (const [bx, by, hgt, lean, i] of items) {
    // mata en V: dos hojas hacia fuera y una central, de oscuro a claro (sin contorno)
    x.fillStyle = dark;
    blade(x, bx - 0.05, by, hgt * 0.85, lean - 0.13, 0.05);
    blade(x, bx + 0.05, by, hgt * 0.85, lean + 0.13, 0.05);
    x.fillStyle = mix(base, light, 0.25);
    blade(x, bx - 0.035, by, hgt * 0.92, lean - 0.09, 0.04);
    x.fillStyle = mix(base, light, 0.55);
    blade(x, bx + 0.035, by, hgt, lean + 0.08, 0.042);
    x.fillStyle = dense && i % 2 === 0 ? col(id, 3) : light;
    blade(x, bx + 0.035 + (lean + 0.08) * 0.62, by - hgt * 0.62, hgt * 0.38, (lean + 0.08) * 0.38, 0.022);
    if (dense && i % 2 === 1) {
      x.fillStyle = col(id, 3);
      blade(x, bx - 0.035 + (lean - 0.09) * 0.6, by - hgt * 0.55, hgt * 0.37, (lean - 0.09) * 0.4, 0.02);
    }
  }
  return c;
}
/** Copa de árbol en 3 capas planas (oscuro → claro). Área: x -0.35..1.35, y -1.3..0.7. */
export function canopySprite(s: number, v: number): HTMLCanvasElement {
  const { c, x } = canvas(s * 1.7, s * 2.0);
  x.setTransform(s, 0, 0, s, s * 0.35, s * 1.3);
  const j = (k: number): number => (h01(v, k, 601) - 0.5) * 0.14;
  const blobs: [number, number, number][] = [
    [0.5 + j(0), -0.28 + j(1), 0.56], [0.1 + j(2), -0.08, 0.38], [0.9 + j(3), -0.06, 0.37], [0.28 + j(4), -0.66 + j(5), 0.4], [0.74 + j(6), -0.68 + j(7), 0.38], [0.5, 0.12, 0.36],
  ];
  const layer = (shrink: number, ox: number, oy: number, color: string): void => {
    x.fillStyle = color;
    x.beginPath();
    for (const [bx, by, r] of blobs) {
      if (r - shrink <= 0.02) continue;
      x.moveTo(bx + ox + r - shrink, by + oy);
      x.arc(bx + ox, by + oy, r - shrink, 0, TAU);
    }
    x.fill();
  };
  layer(0, 0, 0, col("arbol", 0));
  layer(0.06, -0.03, -0.05, col("arbol", 1));
  layer(0.16, -0.07, -0.11, col("arbol", 2));
  layer(0.3, -0.12, -0.17, mix(col("arbol", 2), "#a8d88a", 0.3));
  x.fillStyle = mix(col("arbol", 2), "#d8f5a0", 0.35);
  for (let i = 0; i < 6; i++) {
    x.beginPath();
    x.ellipse(0.1 + 0.6 * h01(v, i, 611), -0.85 + 0.6 * h01(v, i, 612), 0.05, 0.03, 0, 0, TAU);
    x.fill();
  }
  if (h01(v, 9, 613) < 0.5) {
    x.fillStyle = "#c9604a";
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      x.arc(0.15 + 0.7 * h01(v, i, 614), -0.5 + 0.6 * h01(v, i, 615), 0.03, 0, TAU);
      x.fill();
    }
  }
  return c;
}

/** Halo radial pre-renderizado (sin shadowBlur por frame). */
export function haloSprite(size: number, rgb: string, inner: number): HTMLCanvasElement {
  const { c, x } = canvas(size, size);
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${rgb},${inner})`);
  g.addColorStop(0.45, `rgba(${rgb},${inner * 0.45})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}

// ------------------------------------------------------------------ personajes
export type Face = "n" | "e" | "s" | "o";
export interface FigureLook {
  readonly H: number; // alto en casillas
  readonly capa: string;
  readonly sombra: string;
  readonly luz: string;
  readonly interior: string;
  readonly ojos: string;
  readonly beard?: string;
  readonly hat?: string;
  readonly hunch?: boolean;
  readonly peak?: number;
}
const FP = LOOK.personajes;
const fs = (o: Readonly<Record<string, string | number>>, k: string, d: string): string => (typeof o[k] === "string" ? (o[k] as string) : d);
export const LOOKS: Record<string, FigureLook> = {
  farolero: { H: 0.8, capa: fs(FP.farolero, "capa", "#b4532f"), sombra: fs(FP.farolero, "capa_sombra", "#7e3420"), luz: fs(FP.farolero, "capa_luz", "#d4744a"), interior: fs(FP.farolero, "capucha_interior", "#1a1420"), ojos: fs(FP.farolero, "ojos", "#ffcf5a"), peak: 0.1 },
  arnal: { H: 0.98, capa: FP.arnal["capa"] ?? "#4a3b6b", sombra: FP.arnal["capa_sombra"] ?? "#2f2547", luz: mix(FP.arnal["capa"] ?? "#4a3b6b", "#b9a6e8", 0.35), interior: "#141020", ojos: FP.arnal["ojos"] ?? "#9fe3ff", beard: FP.arnal["barba"] ?? "#d9d4c7", peak: 0.2 },
  tasia: { H: 0.8, capa: FP.vecinos["tasia"]?.["capa"] ?? "#3f6f9c", sombra: FP.vecinos["tasia"]?.["capa_sombra"] ?? "#2b4e70", luz: mix(FP.vecinos["tasia"]?.["capa"] ?? "#3f6f9c", "#cfe4ff", 0.3), interior: "#121624", ojos: "#ffe9a8", hat: "#5b3b2a" },
  gorio: { H: 0.72, capa: FP.vecinos["gorio"]?.["capa"] ?? "#7a8f3c", sombra: FP.vecinos["gorio"]?.["capa_sombra"] ?? "#56662a", luz: mix(FP.vecinos["gorio"]?.["capa"] ?? "#7a8f3c", "#efffb0", 0.3), interior: "#161a10", ojos: "#ffd89a", hunch: true, peak: 0.06 },
};

/** Una figura encapuchada (sin el bastón), en casillas: x 0..1, pies en y 0.95. `frame` 0..3 al andar; -1 quieto. */
export function drawFigure(x: Ctx, L: FigureLook, dir: Face, frame: number): void {
  const bob = frame === 1 || frame === 3 ? -0.025 : 0;
  const sway = frame === 1 ? 0.035 : frame === 3 ? -0.035 : 0;
  const feetY = 0.95;
  const top = feetY - L.H + bob;
  const hoodR = 0.18 * (L.H / 0.8) * (L.hunch ? 0.95 : 1);
  const side = dir === "e" ? 1 : dir === "o" ? -1 : 0;
  const hcx = 0.5 + side * 0.04 + (L.hunch ? side * 0.08 : 0);
  const hcy = top + hoodR + (L.hunch ? 0.06 : 0);
  const hem = 0.3 * (L.H / 0.8) * (L.hunch ? 1.05 : 1);
  // pies
  if (frame === 1 || frame === 3) {
    x.fillStyle = "#1a1418";
    const fx = frame === 1 ? 0.4 : 0.6;
    x.beginPath();
    x.ellipse(fx + side * 0.04, feetY, 0.06, 0.035, 0, 0, TAU);
    x.fill();
  }
  const cape = (sx: number, ox: number, oy: number, color: string): void => {
    x.save();
    x.translate(0.5 + ox, oy);
    x.scale(sx, 1);
    x.translate(-0.5, 0);
    x.fillStyle = color;
    x.beginPath();
    x.moveTo(0.5 - hoodR * 0.9 + (hcx - 0.5), hcy);
    x.quadraticCurveTo(0.5 - hem * 0.95, top + L.H * 0.6, 0.5 - hem + sway, feetY - 0.02);
    x.quadraticCurveTo(0.5 - hem * 0.5 + sway, feetY + 0.03, 0.5 + sway * 0.5, feetY - 0.01);
    x.quadraticCurveTo(0.5 + hem * 0.5 + sway, feetY + 0.03, 0.5 + hem + sway, feetY - 0.02);
    x.quadraticCurveTo(0.5 + hem * 0.95, top + L.H * 0.6, 0.5 + hoodR * 0.9 + (hcx - 0.5), hcy);
    x.closePath();
    x.fill();
    x.restore();
  };
  cape(1, 0, 0, L.sombra);
  cape(0.84, -0.03 - side * 0.02, -0.015, L.capa);
  cape(0.36, -0.12 - side * 0.03, -0.02, L.luz);
  // barba (por delante del pecho)
  if (L.beard && dir !== "n") {
    x.fillStyle = L.beard;
    x.beginPath();
    x.moveTo(hcx - 0.1 + side * 0.04, hcy + 0.08);
    x.quadraticCurveTo(hcx + side * 0.06, hcy + 0.5, hcx + 0.1 + side * 0.06, hcy + 0.08);
    x.closePath();
    x.fill();
  }
  // capucha: 3 capas y pico
  const peak = L.peak ?? 0;
  if (peak > 0) {
    x.fillStyle = L.sombra;
    x.beginPath();
    x.moveTo(hcx - hoodR * 0.7, hcy - hoodR * 0.4);
    x.quadraticCurveTo(hcx - side * 0.05, top - peak * 0.6, hcx - side * 0.12 + 0.06, top - peak);
    x.quadraticCurveTo(hcx + hoodR * 0.4, top + 0.02, hcx + hoodR * 0.8, hcy - hoodR * 0.3);
    x.closePath();
    x.fill();
  }
  x.fillStyle = L.sombra;
  x.beginPath();
  x.arc(hcx, hcy, hoodR, 0, TAU);
  x.fill();
  x.fillStyle = L.capa;
  x.beginPath();
  x.arc(hcx - 0.015, hcy - 0.015, hoodR * 0.9, 0, TAU);
  x.fill();
  x.fillStyle = L.luz;
  x.beginPath();
  x.ellipse(hcx - hoodR * 0.45, hcy - hoodR * 0.4, hoodR * 0.35, hoodR * 0.22, -0.6, 0, TAU);
  x.fill();
  if (L.hat) {
    x.fillStyle = L.hat;
    x.beginPath();
    x.ellipse(hcx, hcy - hoodR * 0.45, hoodR * 1.55, hoodR * 0.42, 0, 0, TAU);
    x.fill();
    x.fillStyle = mix(L.hat, "#000000", 0.25);
    x.beginPath();
    x.roundRect(hcx - hoodR * 0.7, hcy - hoodR * 1.25, hoodR * 1.4, hoodR * 0.8, [hoodR * 0.4, hoodR * 0.4, 0, 0]);
    x.fill();
    x.fillStyle = "#d9b46a";
    x.fillRect(hcx - hoodR * 0.7, hcy - hoodR * 0.6, hoodR * 1.4, hoodR * 0.15);
  }
  // hueco de la cara con dos ojos de luz
  if (dir !== "n") {
    const fx = hcx + side * hoodR * 0.38;
    x.fillStyle = L.interior;
    x.beginPath();
    x.ellipse(fx, hcy + hoodR * 0.12, hoodR * (side ? 0.5 : 0.66), hoodR * 0.58, 0, 0, TAU);
    x.fill();
    x.fillStyle = rgba(L.ojos, 0.22);
    x.beginPath();
    x.ellipse(fx, hcy + hoodR * 0.12, hoodR * 0.5, hoodR * 0.35, 0, 0, TAU);
    x.fill();
    x.fillStyle = L.ojos;
    const ey = hcy + hoodR * 0.1;
    const eyes = side ? [fx + side * hoodR * 0.12, fx - side * hoodR * 0.22] : [fx - hoodR * 0.27, fx + hoodR * 0.27];
    eyes.forEach((ex, i) => {
      const w = side && i === 1 ? 0.6 : 1;
      x.beginPath();
      x.ellipse(ex, ey, hoodR * 0.12 * w, hoodR * 0.2, side ? 0 : (i ? -0.35 : 0.35), 0, TAU);
      x.fill();
    });
  } else {
    x.strokeStyle = L.sombra;
    x.lineWidth = 0.02;
    x.beginPath();
    x.moveTo(hcx, hcy - hoodR * 0.6);
    x.quadraticCurveTo(hcx + 0.01, hcy + hoodR * 0.4, hcx, hcy + hoodR * 1.3);
    x.stroke();
  }
}

/** Bastón con farol. Devuelve el punto del que cuelga el farol (casillas). */
export function staffOf(dir: Face, L: FigureLook, frame: number): { x0: number; y0: number; x1: number; y1: number } {
  const bob = frame === 1 || frame === 3 ? -0.025 : 0;
  const top = 0.95 - L.H + bob;
  const sx = dir === "s" ? 0.8 : dir === "n" ? 0.2 : dir === "e" ? 0.78 : 0.22;
  return { x0: sx - (dir === "e" ? 0.05 : dir === "o" ? -0.05 : 0), y0: 0.93, x1: sx, y1: top + 0.02 };
}
export function drawStaff(x: Ctx, st: { x0: number; y0: number; x1: number; y1: number }, color: string, crook = false): void {
  x.strokeStyle = color;
  x.lineWidth = 0.045;
  x.lineCap = "round";
  x.beginPath();
  x.moveTo(st.x0, st.y0);
  x.lineTo(st.x1, st.y1);
  if (crook) x.quadraticCurveTo(st.x1 + 0.02, st.y1 - 0.14, st.x1 + 0.12, st.y1 - 0.08);
  else x.lineTo(st.x1 + 0.1, st.y1 - 0.03);
  x.stroke();
}
/** Farol colgado de (hx, hy) con balanceo `sw` (casillas de desplazamiento) y brillo `glow` 0..1. */
export function drawLantern(x: Ctx, hx: number, hy: number, sw: number, scale: number, glow: number): void {
  const lx = hx + sw, ly = hy + 0.11 * scale;
  x.strokeStyle = "#2a1d14";
  x.lineWidth = 0.018;
  x.beginPath();
  x.moveTo(hx, hy);
  x.lineTo(lx, ly - 0.05 * scale);
  x.stroke();
  x.fillStyle = "#3a2a22";
  x.beginPath();
  x.roundRect(lx - 0.065 * scale, ly - 0.06 * scale, 0.13 * scale, 0.15 * scale, 0.03 * scale);
  x.fill();
  x.fillStyle = mix("#f2b54a", "#fff1c4", glow * 0.6);
  x.beginPath();
  x.roundRect(lx - 0.042 * scale, ly - 0.035 * scale, 0.084 * scale, 0.1 * scale, 0.02 * scale);
  x.fill();
  x.fillStyle = "#3a2a22";
  x.beginPath();
  x.moveTo(lx - 0.08 * scale, ly - 0.055 * scale);
  x.lineTo(lx, ly - 0.11 * scale);
  x.lineTo(lx + 0.08 * scale, ly - 0.055 * scale);
  x.closePath();
  x.fill();
}

/** Retrato (busto) de un personaje en un canvas de `px` CSS: el mismo dibujo que en el mapa. */
export function portrait(who: string, px: number): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const { c, x } = canvas(px * dpr, px * dpr);
  c.style.width = c.style.height = `${px}px`;
  const L = LOOKS[who] ?? (LOOKS["farolero"] as FigureLook);
  const s = px * dpr * 1.25;
  x.fillStyle = "rgba(0,0,0,0)";
  const g = x.createRadialGradient(px * dpr * 0.5, px * dpr * 0.45, 0, px * dpr * 0.5, px * dpr * 0.45, px * dpr * 0.55);
  g.addColorStop(0, rgba(L.ojos, 0.35));
  g.addColorStop(1, rgba(L.ojos, 0));
  x.fillStyle = g;
  x.fillRect(0, 0, px * dpr, px * dpr);
  x.setTransform(s, 0, 0, s, -s * 0.5 + px * dpr * 0.5, -s * (0.95 - L.H) + px * dpr * 0.12);
  drawFigure(x, L, "s", -1);
  if (who !== "tasia") {
    const st = staffOf("s", L, -1);
    drawStaff(x, st, "#5e3e26", who === "gorio");
    if (who !== "gorio") drawLantern(x, st.x1 + 0.1, st.y1 - 0.03, 0, who === "arnal" ? 1.4 : 1, 1);
  }
  return c;
}

/** Interior del santuario para la cabecera de su pantalla (§7.9): pared de piedra, farol grande y Arnal a un lado. */
export function sanctuaryArt(): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const Wc = 720, Hc = 170;
  const { c, x } = canvas(Wc * dpr, Hc * dpr);
  c.className = "sanct-art";
  x.scale(dpr, dpr);
  const [cM, cS, cL, cD] = [col("muro_santuario", 0), col("muro_santuario", 1), col("muro_santuario", 2), col("muro_santuario", 3)];
  x.fillStyle = cD;
  x.fillRect(0, 0, Wc, Hc);
  // hiladas de piedra
  const rh = 26;
  for (let r = 0; r * rh < Hc - 30; r++) {
    let xx = -((r % 2) * 30);
    let k = 0;
    while (xx < Wc) {
      const w = 48 + 30 * h01(r, k, 1401);
      x.fillStyle = h01(r, k, 1402) < 0.3 ? cS : mix(cM, cS, 0.2 + 0.3 * h01(r, k, 1403));
      x.beginPath();
      x.roundRect(xx + 2, r * rh + 2, w - 4, rh - 4, 5);
      x.fill();
      x.fillStyle = rgba(cL, 0.35);
      x.fillRect(xx + 6, r * rh + 3, w - 12, 2);
      xx += w;
      k++;
    }
  }
  // suelo
  x.fillStyle = "#2a2230";
  x.fillRect(0, Hc - 30, Wc, 30);
  x.fillStyle = "#3a3042";
  x.fillRect(0, Hc - 30, Wc, 4);
  // ventana en arco con luz
  for (const wx of [560, 650]) {
    x.fillStyle = cD;
    x.beginPath();
    x.roundRect(wx - 26, 26, 52, 80, [26, 26, 4, 4]);
    x.fill();
    x.fillStyle = "#33406e";
    x.beginPath();
    x.roundRect(wx - 19, 33, 38, 66, [19, 19, 2, 2]);
    x.fill();
    x.fillStyle = "#9fb4ff";
    for (let i = 0; i < 4; i++) x.fillRect(wx - 12 + 8 * i * h01(wx, i, 1404), 45 + 40 * h01(wx, i, 1405), 2, 2);
    x.fillStyle = cD;
    x.fillRect(wx - 2, 33, 4, 66);
  }
  // halo cálido y gran farol colgado
  const halo = haloSprite(360, "255,190,90", 0.6);
  x.globalCompositeOperation = "lighter";
  x.drawImage(halo, 360 - 180, 70 - 180, 360, 360);
  x.globalCompositeOperation = "source-over";
  x.strokeStyle = "#1e1720";
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(360, 0);
  x.lineTo(360, 34);
  x.stroke();
  x.save();
  x.translate(360, 34);
  x.scale(170, 170);
  drawLantern(x, 0, 0, 0, 2.6, 1);
  x.restore();
  // Arnal a un lado, con su farol
  x.save();
  x.translate(80, 52);
  x.scale(118, 118);
  const L = LOOKS["arnal"] as FigureLook;
  drawFigure(x, L, "e", -1);
  const st = staffOf("e", L, -1);
  drawStaff(x, st, "#5e3e26");
  drawLantern(x, st.x1 + 0.1, st.y1 - 0.03, 0, 1.35, 1);
  x.restore();
  const h2 = haloSprite(160, "255,200,110", 0.5);
  x.globalCompositeOperation = "lighter";
  x.drawImage(h2, 80 + 118 * (st.x1 + 0.1) - 60, 52 + 118 * (st.y1 + 0.1) - 60, 120, 120);
  x.globalCompositeOperation = "source-over";
  // viñeta
  const g = x.createLinearGradient(0, 0, 0, Hc);
  g.addColorStop(0, "rgba(10,9,18,0.35)");
  g.addColorStop(0.5, "rgba(10,9,18,0)");
  g.addColorStop(1, "rgba(10,9,18,0.45)");
  x.fillStyle = g;
  x.fillRect(0, 0, Wc, Hc);
  return c;
}
