/** CSV determinista: columnas en el orden de la primera fila, números con ≤ 6 decimales. */
import { createHash } from "node:crypto";
import type { Row } from "./engine.ts";

export function fmtCell(v: number | string | undefined): string {
  if (v === undefined) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return Number.isNaN(v) ? "" : v > 0 ? "inf" : "-inf";
    return String(Math.round(v * 1e6) / 1e6);
  }
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(rows: readonly Row[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0] as Row);
  const lines = [cols.join(",")];
  for (const r of rows) lines.push(cols.map((c) => fmtCell(r[c])).join(","));
  return lines.join("\n") + "\n";
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
