/**
 * Utilidades geométricas del arte procedural. Puras y deterministas:
 * sin Math.random ni reloj. Todos los números se escriben con 1 decimal.
 */

export type Pt = readonly [number, number];

/** Número → texto con 1 decimal (sin "-0"). */
export function f(n: number): string {
  const r = Math.round(n * 10) / 10;
  return (r === 0 ? 0 : r).toString();
}

export function p2s(p: Pt): string {
  return `${f(p[0])} ${f(p[1])}`;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function at<T>(arr: readonly T[], i: number): T {
  const n = arr.length;
  return arr[((i % n) + n) % n] as T;
}

/** FNV-1a de 32 bits (determinista, sin dependencias). */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Curva cerrada suave (Catmull-Rom → Bézier cúbica). */
export function smoothClosed(pts: readonly Pt[]): string {
  let d = `M${p2s(at(pts, 0))}`;
  for (let i = 0; i < pts.length; i++) {
    const p0 = at(pts, i - 1), p1 = at(pts, i), p2 = at(pts, i + 1), p3 = at(pts, i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${p2s(c1)} ${p2s(c2)} ${p2s(p2)}`;
  }
  return d + "Z";
}

/** Polilínea abierta suave (para cejas, bocas, nervios). */
export function smoothOpen(pts: readonly Pt[]): string {
  let d = `M${p2s(at(pts, 0))}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)] as Pt, p1 = pts[i] as Pt, p2 = pts[i + 1] as Pt;
    const p3 = pts[Math.min(pts.length - 1, i + 2)] as Pt;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${p2s(c1)} ${p2s(c2)} ${p2s(p2)}`;
  }
  return d;
}

/** Polígono cerrado con esquinas redondeadas de radio r (r grande = blando). */
export function roundedPoly(pts: readonly Pt[], r: number): string {
  let d = "";
  for (let i = 0; i < pts.length; i++) {
    const p0 = at(pts, i - 1), p1 = at(pts, i), p2 = at(pts, i + 1);
    const d1 = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]) || 1;
    const d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const a: Pt = [p1[0] + ((p0[0] - p1[0]) * rr) / d1, p1[1] + ((p0[1] - p1[1]) * rr) / d1];
    const b: Pt = [p1[0] + ((p2[0] - p1[0]) * rr) / d2, p1[1] + ((p2[1] - p1[1]) * rr) / d2];
    d += `${i === 0 ? "M" : "L"}${p2s(a)}Q${p2s(p1)} ${p2s(b)}`;
  }
  return d + "Z";
}

/** Rota p alrededor de c (grados). */
export function rot(p: Pt, c: Pt, deg: number): Pt {
  const a = (deg * Math.PI) / 180;
  const cs = Math.cos(a), sn = Math.sin(a);
  const x = p[0] - c[0], y = p[1] - c[1];
  return [c[0] + x * cs - y * sn, c[1] + x * sn + y * cs];
}

/** Caja envolvente acumulada (para encajar la criatura en el lienzo). */
export class BBox {
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;
  add(x: number, y: number, r = 0): void {
    this.minX = Math.min(this.minX, x - r);
    this.maxX = Math.max(this.maxX, x + r);
    this.minY = Math.min(this.minY, y - r);
    this.maxY = Math.max(this.maxY, y + r);
  }
  addPts(pts: readonly Pt[], r = 0): void {
    for (const p of pts) this.add(p[0], p[1], r);
  }
}
