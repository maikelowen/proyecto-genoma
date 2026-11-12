/**
 * Informe del combate v0.2 / propuesta v0.2.1 (HTML autocontenido con SVG inline + Markdown).
 * Todo número y toda conclusión salen de los resultados de la ejecución (plantillas condicionales);
 * la config y la propuesta se citan leyendo los JSON.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Criterion, FamilyRate, Interval, MoveRow } from "./analysis.ts";
import { RAW_COMBAT, RAW_GENETICS, RAW_MOVES, readPath, type Variant } from "./setup.ts";
import type { Plan, Summary } from "./study.ts";

export interface ReportInput {
  readonly plan: Plan;
  readonly sums: readonly Summary[];
  readonly proposal: { readonly path: string; readonly variant: Variant; readonly criteria: Record<string, unknown> } | null;
  readonly search: readonly any[];
  readonly elapsedSec: number;
  readonly outDir: string;
  readonly official: boolean;
}

// --------------------------------------------------------------- formato

const pct = (x: number, d = 1): string => (!Number.isFinite(x) ? "—" : `${(x * 100).toLocaleString("es", { minimumFractionDigits: d, maximumFractionDigits: d })} %`);
const num = (x: number, d = 1): string => x.toLocaleString("es", { minimumFractionDigits: 0, maximumFractionDigits: d });
const int = (x: number): string => x.toLocaleString("es");
const fmtC = (c: Criterion, x: number): string => (c.fmt === "pct" ? pct(x) : num(x, 2));
const ic = (c: Criterion): string => (c.lo === c.hi ? "—" : `${fmtC(c, c.lo)} – ${fmtC(c, c.hi)}`);
const ivp = (i: Interval): string => `${pct(i.value)} (${pct(i.lo)}–${pct(i.hi)})`;
const verdict = (c: Criterion): string => (c.pass ? "aprobado" : "suspendido") + (c.fragile ? " (frágil)" : "") + (c.informative ? " [inf.]" : "");
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type Block =
  | { t: "h1" | "h2" | "h3" | "p" | "sub"; text: string }
  | { t: "list"; items: string[] }
  | { t: "table"; head: string[]; rows: string[][]; status?: number; num?: number[] }
  | { t: "svg"; title: string; svg: string; legend?: string; note?: string };

/** Markdown mínimo → HTML (negrita y código). */
function inline(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

// --------------------------------------------------------------- procedencia

export function provenance(): { commit: string; configSha: string } {
  let commit = "desconocido";
  try {
    const head = readFileSync(".git/HEAD", "utf8").trim();
    if (head.startsWith("ref: ")) {
      const ref = head.slice(5);
      try {
        commit = readFileSync(`.git/${ref}`, "utf8").trim();
      } catch {
        const line = readFileSync(".git/packed-refs", "utf8").split("\n").find((l) => l.endsWith(` ${ref}`));
        if (line) commit = line.split(" ")[0] as string;
      }
    } else commit = head;
  } catch {
    /* sin .git */
  }
  const configSha = createHash("sha256").update(JSON.stringify([RAW_COMBAT, RAW_MOVES, RAW_GENETICS])).digest("hex");
  return { commit: commit.slice(0, 7), configSha: configSha.slice(0, 12) };
}
function fileSha(path: string): string {
  try {
    return createHash("sha256").update(readFileSync(path, "utf8")).digest("hex").slice(0, 12);
  } catch {
    return "—";
  }
}

// --------------------------------------------------------------- gráficos

function histogramSvg(series: { label: string; hist: readonly number[]; cls: string }[], cap: number, hiMark: number): string {
  const W = 760;
  const H = 260;
  const L = 44;
  const R = 10;
  const T = 12;
  const B = 36;
  const maxT = Math.max(cap, ...series.map((s) => s.hist.length - 1));
  const shares = series.map((s) => {
    const h = (t: number): number => (Number.isFinite(s.hist[t]) ? (s.hist[t] as number) : 0);
    const n = s.hist.reduce((a, _b, t) => a + h(t), 0);
    return Array.from({ length: maxT + 1 }, (_, t) => h(t) / n);
  });
  const ymax = Math.ceil(Math.max(...shares.flat()) * 20) / 20;
  const x = (t: number): number => L + ((t - 0.5) / maxT) * (W - L - R);
  const y = (v: number): number => T + (1 - v / ymax) * (H - T - B);
  const bw = ((W - L - R) / maxT / series.length) * 0.85;
  let g = "";
  for (let v = 0; v <= ymax + 1e-9; v += 0.05) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v * 100)} %</text>`;
  for (let t = 1; t <= maxT; t++) if (t % 2 === 1 || maxT <= 20) g += `<text class="tick" x="${x(t) + (bw * series.length) / 2}" y="${H - B + 14}" text-anchor="middle">${t}</text>`;
  g += `<line class="mark" x1="${x(hiMark + 1) - 1}" x2="${x(hiMark + 1) - 1}" y1="${T}" y2="${H - B}"/><text class="tick" x="${x(hiMark + 1) + 3}" y="${T + 10}">p90 ≤ ${hiMark}</text>`;
  series.forEach((s, k) => {
    shares[k]!.forEach((v, t) => {
      if (t === 0 || v === 0) return;
      const xx = x(t) + k * bw;
      g += `<rect class="bar ${s.cls}" x="${xx}" y="${y(v)}" width="${bw}" height="${y(0) - y(v)}"><title>${esc(s.label)}: ${t} turnos, ${pct(v)}</title></rect>`;
    });
  });
  g += `<line class="axis" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/><text class="axl" x="${(W + L) / 2}" y="${H - 4}" text-anchor="middle">turnos</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}

function rangeBarsSvg(items: { label: string; iv: Interval }[], lo: number, hi: number, dom: [number, number]): string {
  const W = 760;
  const rowH = 22;
  const L = 90;
  const R = 70;
  const T = 8;
  const H = T + items.length * rowH + 28;
  const x = (v: number): number => L + ((v - dom[0]) / (dom[1] - dom[0])) * (W - L - R);
  let g = `<rect class="band" x="${x(lo)}" y="${T}" width="${x(hi) - x(lo)}" height="${items.length * rowH}"/>`;
  for (let v = dom[0]; v <= dom[1] + 1e-9; v += 0.05) g += `<line class="grid" x1="${x(v)}" x2="${x(v)}" y1="${T}" y2="${T + items.length * rowH}"/><text class="tick" x="${x(v)}" y="${T + items.length * rowH + 14}" text-anchor="middle">${Math.round(v * 100)} %</text>`;
  g += `<line class="mark" x1="${x(0.5)}" x2="${x(0.5)}" y1="${T}" y2="${T + items.length * rowH}"/>`;
  items.forEach((it, i) => {
    const yy = T + i * rowH + rowH / 2;
    const out = it.iv.value < lo || it.iv.value > hi;
    g += `<text class="tick" x="${L - 8}" y="${yy + 4}" text-anchor="end">${esc(it.label)}</text>`;
    g += `<line class="whisk ${out ? "s2" : "s1"}" x1="${x(Math.max(dom[0], it.iv.lo))}" x2="${x(Math.min(dom[1], it.iv.hi))}" y1="${yy}" y2="${yy}"/>`;
    g += `<circle class="dot ${out ? "s2" : "s1"}" cx="${x(Math.min(dom[1], Math.max(dom[0], it.iv.value)))}" cy="${yy}" r="5"><title>${esc(it.label)}: ${ivp(it.iv)}</title></circle>`;
    g += `<text class="tick" x="${W - R + 6}" y="${yy + 4}">${pct(it.iv.value)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}

function stripSvg(rows: readonly MoveRow[], cuts: number[]): string {
  const W = 760;
  const H = 150;
  const L = 80;
  const R = 10;
  const dom: [number, number] = [0.2, 0.8];
  const lanes = ["catálogo", "mutado"];
  const x = (v: number): number => L + ((Math.min(dom[1], Math.max(dom[0], v)) - dom[0]) / (dom[1] - dom[0])) * (W - L - R);
  let g = `<rect class="band" x="${x(cuts[0]!)}" y="10" width="${x(cuts[1]!) - x(cuts[0]!)}" height="${H - 40}"/>`;
  for (let v = dom[0]; v <= dom[1] + 1e-9; v += 0.1) g += `<line class="grid" x1="${x(v)}" x2="${x(v)}" y1="10" y2="${H - 30}"/><text class="tick" x="${x(v)}" y="${H - 16}" text-anchor="middle">${Math.round(v * 100)} %</text>`;
  lanes.forEach((ln, k) => {
    const yy = 10 + (k + 0.5) * ((H - 40) / 2);
    g += `<text class="tick" x="${L - 8}" y="${yy + 4}" text-anchor="end">${ln}</text>`;
    rows
      .filter((r) => r.source === ln)
      .forEach((r, i) => {
        const jitter = (((i * 37) % 21) - 10) * 1.6;
        const cls = r.verdict === "normal" ? "s1" : "s2";
        g += `<circle class="dot ${cls}" cx="${x(r.wr.value)}" cy="${yy + jitter}" r="3.5"><title>${esc(r.name)} (${esc(r.key)}): ${ivp(r.wr)}</title></circle>`;
      });
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}

// --------------------------------------------------------------- narrativa

const resShort = (c: Criterion | undefined): string => (c ? verdict(c) : "—");
const valIc = (c: Criterion | undefined): string => (c ? `${fmtC(c, c.value)}${c.lo === c.hi ? "" : ` (${fmtC(c, c.lo)}–${fmtC(c, c.hi)})`}` : "—");
const fmtVal = (x: unknown): string => (typeof x === "number" ? num(x, 3) : x === undefined ? "—" : JSON.stringify(x));

function proposalChanges(v: Variant): string[][] {
  const rows: string[][] = [];
  for (const [p, x] of Object.entries(v.combat ?? {})) rows.push(["combate", `\`${p}\``, fmtVal(readPath(RAW_COMBAT, p)), `**${fmtVal(x)}**`]);
  for (const [p, x] of Object.entries(v.moves ?? {})) rows.push(["movimientos", `\`${p}\``, fmtVal(readPath(RAW_MOVES, p)), `**${fmtVal(x)}**`]);
  for (const [id, x] of Object.entries(v.salts ?? {})) rows.push(["sal de catálogo", `\`${id}\``, fmtVal(RAW_MOVES.overrides_catalogo.sales[id]), `**${fmtVal(x)}**`]);
  return rows;
}

/** 1.ª validación (valida02) de la versión anterior de la propuesta, leída de su resumen.json si está. */
function firstValidation(): string {
  const tail = "Se refinó con `elige02c` y `elige02d` (120 combates por candidata y una banda de búsqueda con margen) y se revalida aquí con `valida03`. La CLI no deja evaluar con ninguna de esas semillas.";
  try {
    const r = JSON.parse(readFileSync("sim/out/combate-v0.2/completo-valida02/resumen.json", "utf8"));
    const s = r.sums[1];
    const fam = (s.families as FamilyRate[]).filter((f) => f.rate.value < 0.45 || f.rate.value > 0.55);
    const prev = Object.keys(s.variant.salts ?? {}).length;
    return `La búsqueda y la exploración usan semillas \`explora02*\` y \`elige02*\`. La 1.ª versión de la propuesta (${prev} sales) se validó con \`${r.plan.seed}\`: ${13 - fam.length}/13 familias en banda${fam.length ? ` (fuera: ${fam.map((f) => `${f.family} ${pct(f.rate.value)}`).join(", ")})` : ""}; la sal se había elegido como la mejor de varias decenas de candidatas con 60 combates por pareja, así que rendía menos con semillas nuevas (maldición del ganador). ${tail}`;
  } catch {
    return `La búsqueda y la exploración usan semillas \`explora02*\` y \`elige02*\`; una 1.ª validación con \`valida02\` motivó un refinado. ${tail}`;
  }
}

function narrative(d: ReportInput): { title: string; blocks: Block[] } {
  const P = provenance();
  const base = d.sums[0]!;
  const prop = d.sums.length > 1 ? d.sums[1]! : null;
  const main = prop ?? base;
  const title = prop ? "Informe de combate v0.2 y propuesta de balance v0.2.1 — Proyecto Genoma" : "Informe de combate v0.2 — Proyecto Genoma";
  const B: Block[] = [{ t: "h1", text: title }];
  B.push({
    t: "sub",
    text: `Generado por \`sim/combat\` desde el commit \`${P.commit}\` (más cambios locales si los hay), configs combate + movimientos + genética v0.2 con huella sha256 \`${P.configSha}…\`${d.proposal ? `; propuesta \`${d.proposal.path}\` con huella \`${fileSha(d.proposal.path)}…\`` : ""}. Modo ${d.plan.mode}, ${int(Math.round(d.elapsedSec))} s. Semillas de evaluación \`${d.plan.seed}-*\` (las mismas para base y propuesta); la propuesta se eligió con \`explora02*\`, \`elige02*\` y \`valida02*\` (validación de la 1.ª versión, que motivó un refinado), que no se usan aquí.`,
  });
  const cOf = (s: Summary, id: string): Criterion | undefined => s.crit.find((c) => c.id === id);
  const judged = (s: Summary): Criterion[] => s.crit.filter((c) => !c.informative);
  const passN = (s: Summary): number => judged(s).filter((c) => c.pass).length;
  const fails = (s: Summary): Criterion[] => judged(s).filter((c) => !c.pass);
  const fragile = (s: Summary): Criterion[] => judged(s).filter((c) => c.pass && c.fragile);
  const out = (s: Summary): FamilyRate[] => s.families.filter((f) => f.rate.value < 0.45 || f.rate.value > 0.55);
  const lbl = (c: Criterion): string => `${c.group}: ${c.label} (${fmtC(c, c.value)})`;

  // ---- resumen
  B.push({ t: "h2", text: "Resumen ejecutivo" });
  const items: string[] = [];
  items.push(`**Base v0.2:** aprueba ${passN(base)} de ${judged(base).length} criterios${fails(base).length ? `; suspende ${fails(base).map(lbl).join("; ")}` : ""}.`);
  if (prop) {
    items.push(`**Propuesta v0.2.1:** aprueba ${passN(prop)} de ${judged(prop).length}${fails(prop).length ? `; suspende ${fails(prop).map(lbl).join("; ")}` : " (todos)"}.${fragile(prop).length ? ` Frágiles (el IC cruza el umbral): ${fragile(prop).map(lbl).join("; ")}.` : ""}`);
    const en = cOf(prop, "energia_mejor")!;
    const enB = cOf(base, "energia_mejor")!;
    items.push(`**Ahorrar energía:** la mejor IA que ahorra gana a la que no ahorra el ${pct(enB.value)} con la base y el ${pct(en.value)} con la propuesta; uso de coste 4–5 cuando se puede pagar: ${pct(cOf(base, "energia_uso")!.value)} → ${pct(cOf(prop, "energia_uso")!.value)}.`);
    items.push(`**Familias:** ${base.families.length - out(base).length}/13 en banda con la base y ${prop.families.length - out(prop).length}/13 con la propuesta${out(prop).length ? ` (fuera: ${out(prop).map((f) => `${f.family} ${pct(f.rate.value)}`).join(", ")})` : ""}.`);
    items.push(`**Duración:** media ${num(base.duration.mean.value, 2)} → ${num(prop.duration.mean.value, 2)} turnos, p90 ${num(base.duration.p90.value)} → ${num(prop.duration.p90.value)}, empates ${pct(base.duration.draws.value)} → ${pct(prop.duration.draws.value)}.`);
  }
  B.push({ t: "list", items });

  // ---- tabla de criterios
  B.push({ t: "h2", text: prop ? "Criterios: base v0.2 frente a propuesta (validación)" : "Criterios de la v0.2" });
  B.push({ t: "p", text: "Umbrales de `criterios_sim` de las configs, con la sección `criterios` de la propuesta por encima (criterios del director: lado 48–52 %, ahorro de energía como en v0.1, movimientos sin rotos y ≤ 5 % de inútiles). Se aplican igual a la base y a la propuesta. \"Frágil\" = el IC 95 % cruza el umbral. Empate = ½ victoria." });
  B.push({
    t: "table",
    head: ["Criterio", "Umbral", "Base v0.2 (IC 95 %)", "Base", ...(prop ? ["Propuesta (IC 95 %)", "Propuesta"] : [])],
    rows: base.crit.map((c) => {
      const pc = prop ? cOf(prop, c.id) : undefined;
      // si la etiqueta lleva un nombre que cambia entre variantes (familia más alejada), va con su valor
      const differs = prop !== null && pc !== undefined && pc.label !== c.label;
      const tag = (x: Criterion | undefined): string => (differs && x ? ` [${(/\(([^)]*)\)$/.exec(x.label) ?? ["", ""])[1]}]` : "");
      const label = differs ? c.label.replace(/\s*\([^)]*\)$/, "") : c.label;
      return [`${c.group}: ${label}`, c.threshold, valIc(c) + tag(c), resShort(c), ...(prop ? [valIc(pc) + tag(pc), resShort(pc)] : [])];
    }),
    status: 3,
    num: [2],
  });
  B.push({ t: "p", text: `Tamaños (por variante): C1 ${d.plan.c1Seeds} semillas × ${int(d.plan.c1PerSeed)}; C2 ${d.plan.c2PerPair} por pareja (78 parejas); C3 ${int(d.plan.c3)}; C4 ${int(d.plan.c4PerRival)} por rival; sustitución ${d.plan.movCatalog} del catálogo + ${d.plan.movSample} mutados, ${d.plan.movStage1} combates y +${d.plan.movStage2} si el IC cruza un umbral. Reducidos frente a la spec (C1 20.000, C2 1000, C3 10.000, C4 5000, sustitución 2000 y 500 mutados) para caber en el presupuesto de cómputo; los IC de la tabla reflejan esos tamaños.` });

  // ---- cambios
  if (prop) {
    B.push({ t: "h2", text: "Qué cambia la propuesta" });
    B.push({ t: "p", text: `Parche \`${d.proposal!.path}\` (no toca \`config/\`): ${proposalChanges(prop.variant).length} cambios.` });
    B.push({ t: "table", head: ["Config", "Ruta", "v0.2", "Propuesta"], rows: proposalChanges(prop.variant) });
    B.push({
      t: "list",
      items: [
        "**Curva de presupuesto convexa** (como v0.1, algo más marcada arriba): el rendimiento neto por energía crece con el coste, así que guardar para un movimiento caro compensa (decisión del director).",
        "**Topes de potencia** subidos (aviso K-01 del revisor): con la curva convexa, los topes de v0.2 (daño 250, área 125, cura 180, escudo 200) recortaban justo los movimientos caros y anulaban la convexidad. `estados.escudo.maximo` sube con el tope del escudo.",
        "**Sales de catálogo**: salen de la búsqueda §5.2 con el simulador real (sección Búsqueda); arreglan las familias que la curva nueva desplaza (los kits baratos pierden potencia).",
      ],
    });
  }

  // ---- duración
  B.push({ t: "h2", text: "Duración y lado (C1)" });
  B.push({
    t: "table",
    head: ["Variante", "N", "Media", "Mediana", "p90", "Empates", "…por tope", "Golpes básicos", "Victorias de A"],
    rows: d.sums.map((s) => [s.variant.id, int(s.duration.n), num(s.duration.mean.value, 2), num(s.duration.median.value), num(s.duration.p90.value), pct(s.duration.draws.value), pct(s.duration.drawsCap.value), pct(s.duration.basicShare, 0), valIc(cOf(s, "lado_A"))]),
    num: [1, 2, 3, 4, 5, 6, 7],
  });
  B.push({ t: "svg", title: "Distribución de turnos en C1", svg: histogramSvg(d.sums.map((s, k) => ({ label: s.variant.id, hist: s.turnsHist, cls: k ? "s2" : "s1" })), RAW_COMBAT.fin.turnos_max as number, RAW_COMBAT.criterios_sim.duracion.p90_max as number), legend: d.sums.map((s, k) => `<span><i class="sw ${k ? "s2" : "s1"}"></i>${esc(s.variant.id)}</span>`).join("") });

  // ---- energía
  B.push({ t: "h2", text: "Ahorrar energía (C4) y uso de lo caro (C1)" });
  B.push({ t: "p", text: "IA sin reserva = IA de referencia con κ = 0 y reserva 0 (gasta lo mejor que puede pagar cada turno). IA que ahorra: la de referencia con precio de la energía (κ de la config) y las de reserva fija u con κ = 0. Equipos C1, lados alternos. El criterio toma la mejor; \"sin reserva contra su peor rival\" es el complemento." });
  B.push({
    t: "table",
    head: ["IA que ahorra", ...d.sums.map((s) => `${s.variant.id}: victorias contra la IA sin reserva`)],
    rows: base.energy.map((e, i) => [e.label, ...d.sums.map((s) => ivp(s.energy[i]!.wr))]),
  });
  B.push({
    t: "table",
    head: ["Coste", ...d.sums.flatMap((s) => [`${s.variant.id}: veces pagable`, `${s.variant.id}: uso`])],
    rows: base.use.map((u, i) => [u.cost, ...d.sums.flatMap((s) => [int(s.use[i]!.payable), pct(s.use[i]!.rate.value)])]),
    num: [1, 2, 3, 4],
  });
  B.push({ t: "p", text: "Uso = acciones de una criatura que pagó un movimiento suyo de ese coste / acciones en que tenía uno de ese coste y había energía para él (IA de referencia, C1)." });

  // ---- familias
  B.push({ t: "h2", text: "Familias (C2)" });
  B.push({
    t: "table",
    head: ["Familia", ...d.sums.map((s) => `${s.variant.id} (IC 95 %)`)],
    rows: base.families.map((f, i) => [f.family, ...d.sums.map((s) => ivp(s.families[i]!.rate))]),
  });
  B.push({ t: "svg", title: `Tasa de victoria de cada familia contra las otras 12 (${main.variant.id})`, svg: rangeBarsSvg(main.families.map((f) => ({ label: f.family, iv: f.rate })), 0.45, 0.55, [0.3, 0.7]), legend: `<span><i class="sw band"></i>banda 45–55 %</span>` });

  // ---- calidad
  B.push({ t: "h2", text: "Calidad (D-008 / D-018, C3)" });
  B.push({ t: "p", text: d.sums.map((s) => `${s.variant.id}: calidad máx. contra mín. ${ivp(s.quality.wr)} (N = ${int(s.quality.n)})`).join("; ") + `. β = ${num(RAW_COMBAT.estadisticas.beta_calidad as number, 2)} sin tocar (decisión del dueño).` });

  // ---- movimientos
  B.push({ t: "h2", text: "Movimientos: prueba de sustitución" });
  const flagged = (s: Summary): MoveRow[] => s.moves.filter((m) => m.verdict !== "normal");
  B.push({ t: "p", text: d.sums.map((s) => `${s.variant.id}: ${s.moves.filter((m) => m.verdict.startsWith("roto")).length} rotos y ${s.moves.filter((m) => m.verdict === "inútil").length} inútiles de ${s.moves.length} (catálogo: ${s.moves.filter((m) => m.source === "catálogo" && m.verdict.startsWith("roto")).length} rotos, ${s.moves.filter((m) => m.source === "catálogo" && m.verdict === "inútil").length} inútiles de ${s.moves.filter((m) => m.source === "catálogo").length}); catálogo válido ${s.valid[0]}/${s.valid[1]}`).join(". ") + "." });
  B.push({
    t: "table",
    head: ["Pieza", "Valor", ...d.sums.flatMap((s) => [`${s.variant.id}: victorias medias`, `${s.variant.id}: rotos/inútiles`])],
    rows: base.pieces.map((p, i) => [p.piece, p.value, ...d.sums.flatMap((s) => [pct(s.pieces[i]?.meanWr ?? NaN), s.pieces[i] ? `${s.pieces[i]!.broken}/${s.pieces[i]!.useless}` : "—"])]),
    num: [2, 3, 4, 5],
  });
  if (flagged(main).length)
    B.push({
      t: "table",
      head: ["Veredicto", "Origen", "Gen", "Movimiento", "N", "Victorias (IC 95 %)", "Uso"],
      rows: flagged(main)
        .sort((a, b) => a.wr.value - b.wr.value)
        .map((m) => [m.verdict + (m.uncertain ? " (dudoso)" : ""), m.source, m.key, m.desc, int(m.n), ivp(m.wr), pct(m.use, 0)]),
      num: [4],
    });
  B.push({ t: "svg", title: `Victorias del equipo con el movimiento frente al golpe de referencia del mismo coste (${main.variant.id})`, svg: stripSvg(main.moves, [RAW_MOVES.criterios_sim.inutil_wr, RAW_MOVES.criterios_sim.roto_wr]), legend: `<span><i class="sw band"></i>42–58 %</span><span><i class="sw s2"></i>marcado</span>` });

  // ---- búsqueda
  if (prop) {
    B.push({ t: "h2", text: "Búsqueda (semillas de elegir)" });
    B.push({
      t: "list",
      items: [
        "**Exploración de energía** (semillas `explora02*`, 500–4000 combates por variante, solo para elegir qué probar): curvas lineal (v0.2), convexa de v0.1 y más convexas, curvas convexas solo arriba, κ entre 0,6 y 1,1, reservas fijas, compresión de `coste_energia` y topes de potencia. La compresión del coste por forma se descartó (desaparecen los costes 1 y 5 y cae el valor de ahorrar). Con los topes de v0.2, las curvas convexas solo arriba no cambiaban nada porque el tope de daño recorta los costes 5. κ apenas mueve el resultado: se deja en 0,9.",
        "**Sales (movimientos §5.2)** con `sim/combat/search.ts`, procedimiento fijo: por ronda, las 2 familias base más alejadas; cada gen con c1…c4 respetando las cuotas §5.1; F contra las otras 12 con equipos pareados; se aplica la sal que más acerca F al 50 %.",
      ],
    });
    for (const s of d.search) {
      B.push({ t: "p", text: `Semilla \`${s.seed}\`: ${s.params.nMeasure} combates por pareja para medir y ${s.params.nCandidate} por candidata${s.params.margin ? `; banda de búsqueda ${pct(0.45 + s.params.margin)}–${pct(0.55 - s.params.margin)} (margen de ${num(s.params.margin * 100)} puntos)` : ""}; ${int(Math.round(s.elapsedSec))} s.` });
      B.push({
        t: "table",
        head: ["Ronda", "Fuera de banda al medir", "Cambio aplicado", "F antes → después (candidata)"],
        rows: s.steps.map((st: any) => {
          const m = s.params.margin ?? 0;
          const outF = Object.entries(st.rates as Record<string, number>).filter(([, r]) => r < 0.45 + m || r > 0.55 - m);
          return [String(st.round), outF.map(([f, r]) => `${f} ${pct(r)}`).join(", ") || "ninguna", st.changes.map((c: any) => `\`${c.gene}\` ${c.from ?? "—"} → ${c.to}`).join("; ") || "—", st.changes.map((c: any) => `${c.family} ${pct(c.before)} → ${pct(c.after)}`).join("; ") || "—"];
        }),
      });
    }
  }

  // ---- compromisos
  if (prop) {
    B.push({ t: "h2", text: "Compromisos" });
    const lost = judged(base).filter((c) => c.pass && cOf(prop, c.id) && !cOf(prop, c.id)!.pass);
    const won = judged(base).filter((c) => !c.pass && cOf(prop, c.id)?.pass);
    const ci: string[] = [];
    if (won.length) ci.push(`La propuesta arregla: ${won.map((c) => `${c.group}: ${c.label}`).join("; ")}.`);
    if (lost.length) ci.push(`**Cede** (aprobaba con la base y suspende con la propuesta): ${lost.map((c) => lbl(cOf(prop, c.id)!)).join("; ")}.`);
    if (fails(prop).length) ci.push(`Sigue sin cumplirse: ${fails(prop).map(lbl).join("; ")}.`);
    if (fragile(prop).length) ci.push(`Al borde (frágil): ${fragile(prop).map(lbl).join("; ")}. Con otras semillas puede cambiar de veredicto.`);
    ci.push(`La curva convexa hace que los kits baratos pierdan potencia: sin las sales nuevas, las familias base con formas pequeñas salen de banda (sección Búsqueda, ronda 1). Las sales lo compensan movimiento a movimiento en el catálogo; los mutados de esas familias siguen la curva sin compensación.`);
    if (!lost.length && !fails(prop).length) ci.push("No hay criterio que ceda: los seis objetivos se cumplen a la vez con estas semillas.");
    B.push({ t: "list", items: ci });

    B.push({ t: "h2", text: "Recomendación" });
    B.push({
      t: "list",
      items: [
        fails(prop).length === 0
          ? `**Adoptar la propuesta v0.2.1** en \`config/combate\` y \`config/movimientos\` (regenerar el vector dorado del catálogo): cumple todos los criterios con semillas nuevas${fragile(prop).length ? `, con ${fragile(prop).length} al borde` : ""}.`
          : `**Adoptar la propuesta v0.2.1 con reservas**: mejora ${passN(prop) - passN(base) >= 0 ? `de ${passN(base)} a ${passN(prop)}` : `pero baja de ${passN(base)} a ${passN(prop)}`} criterios aprobados; quedan ${fails(prop).map((c) => c.label).join("; ")}, que deciden el director o el dueño (abajo).`,
        "No se ha tocado β (D-008/D-018), la energía por turno (D-020) ni el núcleo.",
      ],
    });
    if (fails(prop).length || fragile(prop).length) {
      B.push({ t: "h3", text: "Decisiones pendientes" });
      B.push({
        t: "list",
        items: [...fails(prop), ...fragile(prop)].map((c) => `**${c.group}: ${c.label}** (${fmtC(c, c.value)}, umbral ${c.threshold}): (a) aceptarlo en v0.2.1 y vigilarlo; (b) una ronda más de la palanca implicada con semillas nuevas. Recomendación: (b) si suspende, (a) si solo es frágil.`),
      });
    }
  }

  // ---- método
  B.push({ t: "h2", text: "Método y limitaciones" });
  B.push({
    t: "list",
    items: [
      "Semillas por combate: equipos `<prefijo>|<escenario>|equipos|i` (los mismos para todas las variantes: comparación pareada) y combate `<prefijo>|<escenario>|<variante>|i`. Lados alternos en C2–C4 y en la sustitución; C1 deja A = primer equipo generado.",
      "Empate = ½ victoria. Medias con IC normal; mediana y p90 con IC por estadísticos de orden; proporciones con Wilson. El IC del recuento de rotos/inútiles del catálogo es de Wilson sobre 72.",
      "Sustitución con la IA de referencia (κ de la config) en ambos lados; el hueco sustituido es el de la criatura 1 con el mismo coste (o el de su locus); referencia = golpe de la familia del movimiento con todo el presupuesto de la variante, con su tope.",
      "C2 híbridas: 2 D híbridos con firma al azar y valores = media de los D de sus componentes, más 1 D de cada componente (decisión de v0.1).",
      firstValidation(),
    ],
  });
  return { title, blocks: B };
}

// --------------------------------------------------------------- render

export function renderHtml(title: string, blocks: readonly Block[]): string {
  const body = blocks
    .map((b) => {
      switch (b.t) {
        case "h1":
          return `<h1>${inline(b.text)}</h1>`;
        case "h2":
          return `<h2>${inline(b.text)}</h2>`;
        case "h3":
          return `<h3>${inline(b.text)}</h3>`;
        case "sub":
          return `<p class="sub">${inline(b.text)}</p>`;
        case "p":
          return `<p>${inline(b.text)}</p>`;
        case "list":
          return `<ul>${b.items.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`;
        case "table":
          return `<div class="tw"><table><thead><tr>${b.head.map((h, k) => `<th${b.num?.includes(k) ? ' class="n"' : ""}>${inline(h)}</th>`).join("")}</tr></thead><tbody>${b.rows
            .map(
              (r) =>
                `<tr>${r
                  .map((c, k) => {
                    const cls = b.status !== undefined && (c.startsWith("aprobado") || c.startsWith("suspendido")) ? (c.startsWith("aprobado") ? "ok" : "ko") : b.num?.includes(k) ? "n" : "";
                    return `<td${cls ? ` class="${cls}"` : ""}>${inline(c)}</td>`;
                  })
                  .join("")}</tr>`,
            )
            .join("")}</tbody></table></div>`;
        case "svg":
          return `<figure><figcaption>${inline(b.title)}</figcaption>${b.legend ? `<div class="legend">${b.legend}</div>` : ""}${b.svg}${b.note ? `<p class="note">${inline(b.note)}</p>` : ""}</figure>`;
      }
    })
    .join("\n");
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
:root{color-scheme:light;--bg:#fcfcfb;--fg:#0b0b0b;--fg2:#52514e;--mut:#8a8984;--grid:#e6e5e0;--axis:#b9b8b2;--band:rgba(27,175,122,.13);--s1:#2a78d6;--s2:#eb6834;--ok:#008300;--ko:#c62828;--okbg:#e8f5e9;--kobg:#fdecea;--card:#fff;--line:#e6e5e0}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#1a1a19;--fg:#f0efec;--fg2:#c3c2b7;--mut:#94938b;--grid:#2e2e2c;--axis:#55544f;--band:rgba(25,158,112,.2);--s1:#3987e5;--s2:#d95926;--ok:#5fbf5f;--ko:#ef6b6b;--okbg:#16301a;--kobg:#3a1c1c;--card:#222221;--line:#33332f}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:900px;margin:0 auto;padding:20px 16px 60px}
h1{font-size:1.5rem;margin:.2em 0}h2{font-size:1.2rem;margin:2em 0 .5em;border-bottom:1px solid var(--line);padding-bottom:.2em}h3{font-size:1.02rem;margin:1.4em 0 .4em}
.sub{color:var(--fg2);margin-top:0;font-size:.9rem}code{font-size:.88em;background:var(--grid);padding:0 .25em;border-radius:3px}
.tw{overflow-x:auto;margin:.4em 0 1em}table{border-collapse:collapse;font-size:.82rem;min-width:100%}
th,td{padding:5px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--fg2);font-weight:600}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}td.ok{color:var(--ok);background:var(--okbg);font-weight:600;white-space:nowrap}td.ko{color:var(--ko);background:var(--kobg);font-weight:600;white-space:nowrap}
figure{margin:1.2em 0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px}figcaption{font-weight:600;margin-bottom:4px}svg{width:100%;height:auto;display:block}
.legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:.82rem;color:var(--fg2);margin:2px 0 6px}.legend span{display:inline-flex;align-items:center;gap:6px}
.sw{display:inline-block;width:16px;height:10px;border-radius:2px}.sw.s1{background:var(--s1)}.sw.s2{background:var(--s2)}.sw.band{background:var(--band)}
.grid{stroke:var(--grid);stroke-width:1}.axis{stroke:var(--axis);stroke-width:1}.tick{fill:var(--mut);font-size:11px}.axl{fill:var(--fg2);font-size:12px}
.band{fill:var(--band)}.bar.s1{fill:var(--s1)}.bar.s2{fill:var(--s2)}.mark{stroke:var(--fg2);stroke-dasharray:3 3}
.dot.s1{fill:var(--s1)}.dot.s2{fill:var(--s2)}.dot{stroke:var(--card);stroke-width:1}.whisk{stroke-width:2}.whisk.s1{stroke:var(--s1)}.whisk.s2{stroke:var(--s2)}
.note{font-size:.82rem;color:var(--fg2);margin:.4em 0 0}
</style></head><body><main>
${body}
</main></body></html>
`;
}

export function renderMd(blocks: readonly Block[]): string {
  return (
    blocks
      .map((b) => {
        switch (b.t) {
          case "h1":
            return `# ${b.text}`;
          case "h2":
            return `## ${b.text}`;
          case "h3":
            return `### ${b.text}`;
          case "sub":
          case "p":
            return b.text;
          case "list":
            return b.items.map((i) => `- ${i}`).join("\n");
          case "table":
            return [`| ${b.head.join(" | ")} |`, `|${b.head.map((_, k) => (b.num?.includes(k) ? "---:" : "---")).join("|")}|`, ...b.rows.map((r) => `| ${r.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`)].join("\n");
          case "svg":
            return `*Gráfico en el informe HTML: ${b.title}.*${b.note ? ` ${b.note}` : ""}`;
        }
      })
      .join("\n\n") + "\n"
  );
}

export function writeReports(d: ReportInput): string[] {
  const n = narrative(d);
  const html = renderHtml(n.title, n.blocks);
  const md = renderMd(n.blocks);
  const out: string[] = [];
  writeFileSync(`${d.outDir}/informe-combate-v0.2.html`, html);
  writeFileSync(`${d.outDir}/combate-v0.2.md`, md);
  out.push(`${d.outDir}/informe-combate-v0.2.html`, `${d.outDir}/combate-v0.2.md`);
  if (d.official) {
    mkdirSync("docs/informes", { recursive: true });
    writeFileSync("docs/informes/informe-combate-v0.2.html", html);
    writeFileSync("docs/informes/combate-v0.2.md", md);
    out.push("docs/informes/informe-combate-v0.2.html", "docs/informes/combate-v0.2.md");
  }
  return out;
}
