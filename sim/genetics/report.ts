/**
 * Informe autocontenido: HTML + SVG inline (sin librerías ni CDN, modo
 * claro y oscuro, legible en móvil) y versión Markdown versionable.
 * Todas las cifras salen de los mismos datos que los CSV.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { Row } from "./engine.ts";
import { evaluateCriteria, type Criterion, type DeterminismResult, type Plan, type ScenarioId, type ScenarioRun, type VariantSummary } from "./runner.ts";
import { meanCI, type MeanCI } from "./stats.ts";
import { narrative, type Narrative } from "./narrative.ts";

export interface ReportInput {
  readonly plan: Plan;
  readonly summaries: readonly VariantSummary[];
  readonly det: DeterminismResult;
  readonly violations: number;
  readonly elapsedSec: number;
  readonly outDir: string;
  readonly runs: readonly ScenarioRun[];
  /** Ejecución completa sin filtros: escribe también docs/informes/genetica-v0.1.md. */
  readonly fullSet: boolean;
}

// ---------------------------------------------------------------------------
// Acceso a datos
// ---------------------------------------------------------------------------

export class Data {
  readonly input: ReportInput;
  constructor(input: ReportInput) {
    this.input = input;
  }
  get plan(): Plan {
    return this.input.plan;
  }
  sum(exp: string, id: string): VariantSummary | undefined {
    return this.input.summaries.find((s) => s.experiment === exp && s.variant.id === id);
  }
  of(exp: string): VariantSummary[] {
    return this.input.summaries.filter((s) => s.experiment === exp);
  }
  /** Media e IC de una métrica por semilla. */
  m(exp: string, id: string, sc: ScenarioId, key: string): MeanCI | undefined {
    const xs = this.sum(exp, id)?.perSeed[sc]?.map((x) => x[key] as number);
    return xs && xs.length ? meanCI(xs) : undefined;
  }
  v(exp: string, id: string, sc: ScenarioId, key: string): number {
    return this.m(exp, id, sc, key)?.mean ?? NaN;
  }
  /** Curva media entre semillas de una columna por generación. */
  curve(exp: string, id: string, sc: string, col: string, scale = 1): [number, number][] {
    const runs = this.input.runs.filter((r) => r.experiment === exp && r.variant.id === id && r.scenario === sc);
    if (runs.length === 0) return [];
    const n = (runs[0] as ScenarioRun).rows.length;
    const out: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (const r of runs) s += Number((r.rows[i] as Row)[col]);
      out.push([Number(((runs[0] as ScenarioRun).rows[i] as Row)["gen"]), (s / runs.length) * scale]);
    }
    return out;
  }
  /** Curva media entre semillas del cambio relativo de una columna respecto a la gen 0 de cada semilla. */
  curveRel(exp: string, id: string, sc: string, col: string): [number, number][] {
    const runs = this.input.runs.filter((r) => r.experiment === exp && r.variant.id === id && r.scenario === sc);
    if (runs.length === 0) return [];
    const n = (runs[0] as ScenarioRun).rows.length;
    const out: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (const r of runs) s += Number((r.rows[i] as Row)[col]) / Number((r.rows[0] as Row)[col]) - 1;
      out.push([Number(((runs[0] as ScenarioRun).rows[i] as Row)["gen"]), s / runs.length]);
    }
    return out;
  }
  /** Nº total de crías simuladas en escenarios de población + E4. */
  totalChildren(): number {
    let t = 0;
    for (const r of this.input.runs) {
      if (r.scenario === "E4") t += 0;
      else for (const row of r.rows) t += Number(row["n_crias"] ?? 0);
    }
    return t;
  }
  crit(exp: string, id: string): Criterion[] {
    const s = this.sum(exp, id);
    return s ? evaluateCriteria(s) : [];
  }
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

export function pct(x: number, d = 1): string {
  if (!Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(d).replace(".", ",")} %`;
}
export function nf(x: number, d = 1): string {
  if (x === Infinity) return "∞";
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(d).replace(".", ",");
}
function fmtC(c: Criterion, x: number): string {
  return c.fmt === "pct" ? pct(x) : c.fmt === "int" ? nf(x, 0) : nf(x, Math.abs(x) >= 100 ? 0 : Math.abs(x) >= 10 ? 1 : 2);
}
export function critShort(c: Criterion): string {
  return fmtC(c, c.value);
}
export function critValue(c: Criterion): string {
  const ci = c.ci && c.ci.n > 1 && c.ci.hi - c.ci.lo > 1e-9 ? ` [${fmtC(c, c.ci.lo)}; ${fmtC(c, c.ci.hi)}]` : "";
  return `${fmtC(c, c.value)}${ci}`;
}
export function verdict(c: Criterion): string {
  return c.pass ? (c.fragile ? "APROBADO (frágil)" : "APROBADO") : c.fragile ? "SUSPENSO (frágil)" : "SUSPENSO";
}
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Gráficas SVG
// ---------------------------------------------------------------------------

interface Series {
  readonly name: string;
  readonly slot: number;
  readonly pts: readonly [number, number][];
  readonly dashed?: boolean;
}

function niceTicks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo || 1;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => span / s <= n) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

const W = 640;
const H = 300;
const M = { l: 58, r: 16, t: 14, b: 44 };

function legend(series: readonly { name: string; slot: number; dashed?: boolean }[], extra = ""): string {
  return `<div class="legend">${series
    .map((s) => `<span><i class="sw s${s.slot}${s.dashed ? " dash" : ""}"></i>${esc(s.name)}</span>`)
    .join("")}${extra}</div>`;
}

function frame(xs: number[], ys: number[], xLabel: string, yLabel: string, yFmt: (v: number) => string, sx: (v: number) => number, sy: (v: number) => number): string {
  let g = "";
  for (const y of ys) g += `<line class="grid" x1="${M.l}" x2="${W - M.r}" y1="${sy(y)}" y2="${sy(y)}"/><text class="tick" x="${M.l - 6}" y="${sy(y) + 4}" text-anchor="end">${esc(yFmt(y))}</text>`;
  for (const x of xs) g += `<text class="tick" x="${sx(x)}" y="${H - M.b + 16}" text-anchor="middle">${nf(x, 0)}</text>`;
  g += `<line class="axis" x1="${M.l}" x2="${W - M.r}" y1="${H - M.b}" y2="${H - M.b}"/>`;
  g += `<text class="axl" x="${(M.l + W - M.r) / 2}" y="${H - 6}" text-anchor="middle">${esc(xLabel)}</text>`;
  g += `<text class="axl" transform="translate(13 ${(M.t + H - M.b) / 2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text>`;
  return g;
}

export function lineChart(o: {
  title: string;
  series: readonly Series[];
  xLabel: string;
  yLabel: string;
  yFmt: (v: number) => string;
  band?: readonly [number, number];
  bandLabel?: string;
  yMin?: number;
  yMax?: number;
  note?: string;
}): string {
  const all = o.series.flatMap((s) => s.pts);
  if (all.length === 0) return "";
  const xMin = Math.min(...all.map((p) => p[0]));
  const xMax = Math.max(...all.map((p) => p[0]));
  let yMin = o.yMin ?? Math.min(...all.map((p) => p[1]), ...(o.band ? [o.band[0]] : []));
  let yMax = o.yMax ?? Math.max(...all.map((p) => p[1]), ...(o.band ? [o.band[1]] : []));
  if (o.yMin === undefined) yMin = Math.min(0, yMin);
  yMax += (yMax - yMin) * 0.05;
  const yt = niceTicks(yMin, yMax);
  yMax = Math.max(yMax, yt[yt.length - 1] as number);
  const sx = (x: number): number => M.l + ((x - xMin) / (xMax - xMin || 1)) * (W - M.l - M.r);
  const sy = (y: number): number => H - M.b - ((y - yMin) / (yMax - yMin || 1)) * (H - M.t - M.b);
  let svg = frame(niceTicks(xMin, xMax, 6), yt, o.xLabel, o.yLabel, o.yFmt, sx, sy);
  if (o.band) {
    const [b0, b1] = o.band;
    svg += `<rect class="band" x="${M.l}" width="${W - M.l - M.r}" y="${sy(Math.min(b1, yMax))}" height="${Math.max(0, sy(Math.max(b0, yMin)) - sy(Math.min(b1, yMax)))}"><title>${esc(o.bandLabel ?? "umbral")}</title></rect>`;
  }
  for (const s of o.series) {
    const d = s.pts.map((p, i) => `${i ? "L" : "M"}${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`).join("");
    svg += `<path class="ln s${s.slot}${s.dashed ? " dash" : ""}" d="${d}"/>`;
  }
  // Capa de hover: puntos invisibles con tooltip (cada k-ésima generación).
  const k = Math.max(1, Math.ceil((o.series[0]?.pts.length ?? 1) / 60));
  for (const s of o.series)
    s.pts.forEach((p, i) => {
      if (i % k === 0 || i === s.pts.length - 1) svg += `<circle class="hit" cx="${sx(p[0]).toFixed(1)}" cy="${sy(p[1]).toFixed(1)}" r="7"><title>${esc(`${s.name} · gen ${p[0]}: ${o.yFmt(p[1])}`)}</title></circle>`;
    });
  return `<figure><figcaption>${esc(o.title)}</figcaption>${legend(o.series, o.band ? `<span><i class="sw band"></i>${esc(o.bandLabel ?? "umbral")}</span>` : "")}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title)}">${svg}</svg>${o.note ? `<p class="note">${esc(o.note)}</p>` : ""}</figure>`;
}

/** Puntos con intervalo (IC 95 %) por categoría, horizontal, con banda de umbral. */
export function dotChart(o: { title: string; items: readonly { label: string; ci: MeanCI; slot: number }[]; band: readonly [number, number]; bandLabel: string; xFmt: (v: number) => string; xLabel: string; note?: string }): string {
  const rowH = 26;
  const h = M.t + o.items.length * rowH + M.b;
  const l = 70;
  const vals = o.items.flatMap((i) => [i.ci.lo, i.ci.hi]).concat(o.band);
  const x0 = Math.min(0, ...vals);
  let x1 = Math.max(...vals) * 1.05;
  const xt = niceTicks(x0, x1, 6);
  x1 = Math.max(x1, xt[xt.length - 1] as number);
  const sx = (x: number): number => l + ((x - x0) / (x1 - x0)) * (W - l - M.r);
  let s = `<rect class="band" x="${sx(o.band[0])}" width="${sx(o.band[1]) - sx(o.band[0])}" y="${M.t}" height="${o.items.length * rowH}"><title>${esc(o.bandLabel)}</title></rect>`;
  for (const x of xt) s += `<line class="grid" x1="${sx(x)}" x2="${sx(x)}" y1="${M.t}" y2="${M.t + o.items.length * rowH}"/><text class="tick" x="${sx(x)}" y="${M.t + o.items.length * rowH + 16}" text-anchor="middle">${esc(o.xFmt(x))}</text>`;
  o.items.forEach((it, i) => {
    const y = M.t + i * rowH + rowH / 2;
    s += `<text class="tick" x="${l - 8}" y="${y + 4}" text-anchor="end">${esc(it.label)}</text>`;
    s += `<line class="whisk s${it.slot}" x1="${sx(it.ci.lo)}" x2="${sx(it.ci.hi)}" y1="${y}" y2="${y}"/>`;
    s += `<circle class="dot s${it.slot}" cx="${sx(it.ci.mean)}" cy="${y}" r="5"/>`;
    s += `<rect class="hitr" x="${l}" y="${y - rowH / 2}" width="${W - l - M.r}" height="${rowH}"><title>${esc(`${it.label}: ${o.xFmt(it.ci.mean)} (IC 95 % ${o.xFmt(it.ci.lo)}–${o.xFmt(it.ci.hi)}, ${it.ci.n} semillas)`)}</title></rect>`;
  });
  s += `<text class="axl" x="${(l + W - M.r) / 2}" y="${h - 6}" text-anchor="middle">${esc(o.xLabel)}</text>`;
  const slots = [...new Map(o.items.map((i) => [i.slot, i.label.split("-")[0] as string])).entries()].map(([slot, name]) => ({ slot, name: `pesos_D ${name}` }));
  return `<figure><figcaption>${esc(o.title)}</figcaption>${legend(slots, `<span><i class="sw band"></i>${esc(o.bandLabel)}</span>`)}<svg viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(o.title)}">${s}</svg>${o.note ? `<p class="note">${esc(o.note)}</p>` : ""}</figure>`;
}

export function histogram(o: { title: string; counts: readonly number[]; binLabel: (i: number) => string; xLabel: string; note?: string; marks?: readonly { x: number; label: string }[] }): string {
  const total = o.counts.reduce((a, b) => a + b, 0);
  const ys = o.counts.map((c) => c / total);
  const yMax0 = Math.max(...ys) * 1.1;
  const yt = niceTicks(0, yMax0, 4);
  const yMax = Math.max(yMax0, yt[yt.length - 1] as number);
  const n = o.counts.length;
  const bw = (W - M.l - M.r) / n;
  const sy = (y: number): number => H - M.b - (y / yMax) * (H - M.t - M.b);
  let s = "";
  for (const y of yt) s += `<line class="grid" x1="${M.l}" x2="${W - M.r}" y1="${sy(y)}" y2="${sy(y)}"/><text class="tick" x="${M.l - 6}" y="${sy(y) + 4}" text-anchor="end">${pct(y, 0)}</text>`;
  ys.forEach((y, i) => {
    const x = M.l + i * bw + 1;
    const top = sy(y);
    const hgt = H - M.b - top;
    const shape = hgt >= 4 ? `<path class="bar s1" d="M${x} ${H - M.b}V${top + 4}q0 -4 4 -4h${bw - 10}q4 0 4 4V${H - M.b}Z">` : `<rect class="bar s1" x="${x}" y="${top}" width="${bw - 2}" height="${Math.max(hgt, 0.5)}">`;
    s += `${shape}<title>${esc(`${o.binLabel(i)} crías: ${pct(y)} (${o.counts[i]} ensayos)`)}</title>${hgt >= 4 ? "</path>" : "</rect>"}`;
    if (i % 2 === 0) s += `<text class="tick" x="${x + bw / 2 - 1}" y="${H - M.b + 16}" text-anchor="middle">${esc(o.binLabel(i))}</text>`;
  });
  for (const mk of o.marks ?? []) {
    const x = M.l + (mk.x / 10) * bw;
    s += `<line class="mark" x1="${x}" x2="${x}" y1="${M.t}" y2="${H - M.b}"/><text class="tick" x="${x + 4}" y="${M.t + 12}">${esc(mk.label)}</text>`;
  }
  s += `<line class="axis" x1="${M.l}" x2="${W - M.r}" y1="${H - M.b}" y2="${H - M.b}"/><text class="axl" x="${(M.l + W - M.r) / 2}" y="${H - 6}" text-anchor="middle">${esc(o.xLabel)}</text>`;
  return `<figure><figcaption>${esc(o.title)}</figcaption><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title)}">${s}</svg>${o.note ? `<p class="note">${esc(o.note)}</p>` : ""}</figure>`;
}

// ---------------------------------------------------------------------------
// Tablas (HTML y Markdown a partir de la misma estructura)
// ---------------------------------------------------------------------------

export interface Table {
  readonly head: readonly string[];
  readonly rows: readonly (readonly string[])[];
  /** Columnas numéricas (alineadas a la derecha). */
  readonly num?: readonly number[];
}

function htmlTable(t: Table): string {
  const cls = (i: number): string => (t.num?.includes(i) ? ' class="n"' : "");
  const cell = (c: string, i: number, th = false): string => {
    const tag = th ? "th" : "td";
    const st = /^APROBADO/.test(c) ? ' class="ok"' : /^SUSPENSO/.test(c) ? ' class="ko"' : cls(i);
    return `<${tag}${st}>${inline(c)}</${tag}>`;
  };
  return `<div class="tw"><table><thead><tr>${t.head.map((h, i) => cell(h, i, true)).join("")}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => cell(c, i)).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function mdTable(t: Table): string {
  const line = (r: readonly string[]): string => `| ${r.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`;
  return [line(t.head), `|${t.head.map((_, i) => (t.num?.includes(i) ? "---:" : "---")).join("|")}|`, ...t.rows.map(line)].join("\n");
}

// ---------------------------------------------------------------------------
// Documento: secciones neutras que se pintan en HTML y en MD
// ---------------------------------------------------------------------------

export type Block =
  | { readonly kind: "h2" | "h3" | "p"; readonly text: string }
  | { readonly kind: "ul" | "ol"; readonly items: readonly string[] }
  | { readonly kind: "table"; readonly table: Table; readonly caption?: string }
  | { readonly kind: "chart"; readonly html: string; readonly fallback?: Table; readonly caption: string };

/** Negrita mínima **x** en HTML. */
function inline(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function renderHtml(title: string, blocks: readonly Block[]): string {
  const body = blocks
    .map((b) => {
      switch (b.kind) {
        case "h2":
          return `<h2>${inline(b.text)}</h2>`;
        case "h3":
          return `<h3>${inline(b.text)}</h3>`;
        case "p":
          return `<p>${inline(b.text)}</p>`;
        case "ul":
        case "ol":
          return `<${b.kind}>${b.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${b.kind}>`;
        case "table":
          return `${b.caption ? `<p class="cap">${inline(b.caption)}</p>` : ""}${htmlTable(b.table)}`;
        case "chart":
          return b.html + (b.fallback ? `<details><summary>Ver datos en tabla</summary>${htmlTable(b.fallback)}</details>` : "");
      }
    })
    .join("\n");
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{color-scheme:light;--bg:#fcfcfb;--fg:#0b0b0b;--fg2:#52514e;--mut:#8a8984;--grid:#e6e5e0;--axis:#b9b8b2;--band:rgba(27,175,122,.13);--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#6250d6;--ok:#008300;--ko:#c62828;--okbg:#e8f5e9;--kobg:#fdecea;--card:#fff;--line:#e6e5e0}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])){color-scheme:dark;--bg:#1a1a19;--fg:#f0efec;--fg2:#c3c2b7;--mut:#94938b;--grid:#2e2e2c;--axis:#55544f;--band:rgba(25,158,112,.2);--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#9085e9;--ok:#5fbf5f;--ko:#ef6b6b;--okbg:#16301a;--kobg:#3a1c1c;--card:#222221;--line:#33332f}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:860px;margin:0 auto;padding:20px 16px 60px}
h1{font-size:1.5rem;margin:.2em 0}h2{font-size:1.2rem;margin:2em 0 .5em;border-bottom:1px solid var(--line);padding-bottom:.2em}h3{font-size:1.02rem;margin:1.4em 0 .4em}
p,li{color:var(--fg)}.sub{color:var(--fg2);margin-top:0}.cap{color:var(--fg2);font-size:.9rem;margin-bottom:.3em}
code{font-size:.88em;background:var(--grid);padding:0 .25em;border-radius:3px}
.tw{overflow-x:auto;margin:.4em 0 1em}table{border-collapse:collapse;font-size:.84rem;min-width:100%}
th,td{padding:5px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--fg2);font-weight:600;white-space:nowrap}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}td.ok{color:var(--ok);background:var(--okbg);font-weight:600;white-space:nowrap}td.ko{color:var(--ko);background:var(--kobg);font-weight:600;white-space:nowrap}
figure{margin:1.2em 0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px}
figcaption{font-weight:600;margin-bottom:4px}svg{width:100%;height:auto;display:block}
.legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:.82rem;color:var(--fg2);margin:2px 0 6px}.legend span{display:inline-flex;align-items:center;gap:6px}
.sw{display:inline-block;width:16px;height:3px;border-radius:2px}.sw.s1{background:var(--s1)}.sw.s2{background:var(--s2)}.sw.s3{background:var(--s3)}.sw.s4{background:var(--s4)}
.sw.dash{background:repeating-linear-gradient(90deg,var(--fg2) 0 4px,transparent 4px 7px)}.sw.band{height:10px;background:var(--band)}
.grid{stroke:var(--grid);stroke-width:1}.axis{stroke:var(--axis);stroke-width:1}.tick{fill:var(--mut);font-size:11px}.axl{fill:var(--fg2);font-size:12px}
.band{fill:var(--band)}.ln{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}.ln.dash{stroke-dasharray:5 4}
.s1{stroke:var(--s1)}.s2{stroke:var(--s2)}.s3{stroke:var(--s3)}.s4{stroke:var(--s4)}.ln.dash.s4{stroke:var(--fg2)}
.dot.s1{fill:var(--s1)}.dot.s2{fill:var(--s2)}.dot.s3{fill:var(--s3)}.dot{stroke:var(--card);stroke-width:2}.whisk{stroke-width:2}
.bar.s1{fill:var(--s1)}.mark{stroke:var(--fg2);stroke-dasharray:3 3}
.hit{fill:transparent;stroke:none}.hit:hover{fill:var(--fg2);fill-opacity:.35}.hitr{fill:transparent}.hitr:hover{fill:var(--grid);fill-opacity:.4}
.note{font-size:.82rem;color:var(--fg2);margin:.4em 0 0}details{margin:-.6em 0 1em;font-size:.85rem}summary{cursor:pointer;color:var(--fg2)}
</style></head><body><main>
${body}
</main></body></html>
`;
}

function renderMd(blocks: readonly Block[]): string {
  return (
    blocks
      .map((b) => {
        switch (b.kind) {
          case "h2":
            return `## ${b.text}`;
          case "h3":
            return `### ${b.text}`;
          case "p":
            return b.text;
          case "ul":
            return b.items.map((i) => `- ${i}`).join("\n");
          case "ol":
            return b.items.map((i, k) => `${k + 1}. ${i}`).join("\n");
          case "table":
            return `${b.caption ? `${b.caption}\n\n` : ""}${mdTable(b.table)}`;
          case "chart":
            return b.fallback ? `**${b.caption}**\n\n${mdTable(b.fallback)}` : "";
        }
      })
      .filter(Boolean)
      .join("\n\n") + "\n"
  );
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export function writeReports(input: ReportInput): string[] {
  const d = new Data(input);
  const n: Narrative = narrative(d);
  const html = renderHtml(n.title, n.blocks);
  const out: string[] = [];
  const htmlPath = input.plan.mode === "completo" && input.fullSet ? "sim/out/informe-genetica-v0.1.html" : `${input.outDir}/informe-genetica-v0.1.html`;
  writeFileSync(htmlPath, html);
  out.push(htmlPath);
  if (input.plan.mode === "completo" && input.fullSet) {
    mkdirSync("docs/informes", { recursive: true });
    writeFileSync("docs/informes/genetica-v0.1.md", renderMd(n.blocks));
    out.push("docs/informes/genetica-v0.1.md");
  }
  return out;
}
