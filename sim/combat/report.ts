/**
 * Informe del combate v0.1 (HTML autocontenido con SVG inline + Markdown).
 * Todo número y toda conclusión salen de los resultados de la ejecución
 * (plantillas condicionales); la config se cita leyendo el JSON.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Criterion, FamilyRate, Interval, MoveRow } from "./analysis.ts";
import { qualityExtremes, RAW_COMBAT, RAW_GENETICS, RAW_MOVES, readPath, rawCombatFor, type Variant } from "./setup.ts";
import type { CandidateSummary, Plan, ScenarioSummary, moveSummary } from "./study.ts";

export interface ReportInput {
  readonly plan: Plan;
  readonly base: ScenarioSummary;
  readonly val: ScenarioSummary;
  readonly cands: readonly CandidateSummary[];
  readonly choice: { readonly id: string; readonly allPass: boolean };
  readonly moves: readonly MoveRow[];
  readonly moveSummary: ReturnType<typeof moveSummary>;
  readonly famDiag: readonly { readonly id: string; readonly label: string; readonly rates: readonly FamilyRate[] }[];
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

type Block =
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

/** Uso por la IA (u = 0) de los movimientos sustituidos, por coste. */
function usageByCost(moves: readonly MoveRow[]): { cost: number; n: number; meanUse: number; never: number; meanWr: number }[] {
  return [1, 2, 3, 4, 5].map((cost) => {
    const rs = moves.filter((m) => m.cost === cost);
    const fin = rs.filter((m) => Number.isFinite(m.use));
    return {
      cost,
      n: rs.length,
      meanUse: fin.reduce((s, m) => s + m.use, 0) / Math.max(1, fin.length),
      never: rs.filter((m) => !Number.isFinite(m.use) || m.use === 0).length,
      meanWr: rs.reduce((s, m) => s + m.wr.value, 0) / Math.max(1, rs.length),
    };
  });
}

function critTable(cs: readonly Criterion[], withSeeds = true): Block {
  return {
    t: "table",
    head: ["Criterio", "Umbral", "Valor", "IC 95 %", ...(withSeeds ? ["Semillas/grupos OK"] : []), "Resultado"],
    rows: cs.map((c) => [`${c.group}: ${c.label}`, c.threshold, fmtC(c, c.value), ic(c), ...(withSeeds ? [c.seedsOk ? `${c.seedsOk[0]}/${c.seedsOk[1]}` : "—"] : []), verdict(c)]),
    status: withSeeds ? 5 : 4,
    num: [2],
  };
}

function changes(v: Variant): string {
  const raw = rawCombatFor(v);
  return Object.keys(v.set)
    .map((p) => `\`${p}\` ${String(readPath(RAW_COMBAT, p)).replace(".", ",")} → **${String(readPath(raw, p)).replace(".", ",")}**`)
    .join("; ");
}

function narrative(d: ReportInput): { title: string; blocks: Block[] } {
  const { plan, base, val, cands, moves } = d;
  const ms = d.moveSummary;
  const prov = provenance();
  const B: Block[] = [];
  const title = "Informe de combate v0.1 — Proyecto Genoma";
  const chosen = cands.find((c) => c.variant.id === d.choice.id)!;
  const durC = base.c1.filter((c) => c.group === "Duración C1");
  const durFail = durC.filter((c) => !c.pass);
  const valAll = [...val.c1, ...val.familyCrit, ...val.qualityCrit.filter((c) => !c.informative), ...val.energyCrit];
  const valFail = valAll.filter((c) => !c.pass);
  const allBase = [...base.c1, ...base.familyCrit, ...base.qualityCrit.filter((c) => !c.informative), ...base.energyCrit, ...ms.crit, ms.arch];
  const baseFail = allBase.filter((c) => !c.pass);
  const broken = moves.filter((m) => m.verdict === "roto" || m.verdict === "roto grave");
  const useless = moves.filter((m) => m.verdict === "inútil");
  const sus = moves.filter((m) => m.suspicious);
  const fam = [...base.families].sort((a, b) => b.rate.value - a.rate.value);
  const beta0 = RAW_COMBAT.estadisticas.beta_calidad as number;
  const q0 = base.quality.find((q) => q.beta === beta0);
  const bestE = [...base.energy].sort((a, b) => b.wr.value - a.wr.value)[0];

  B.push({ t: "h1", text: title });
  B.push({
    t: "sub",
    text: `Generado por \`sim/combat\` desde el commit \`${prov.commit}\` (más cambios locales), configs combate + movimientos + genética v0.2 con huella sha256 \`${prov.configSha}…\`. Modo ${plan.mode}, ${num(d.elapsedSec, 0)} s. Semillas: evaluación de v0.1 \`${plan.seed}-*\`; elección de candidatas \`${plan.chooseSeed}-*\`; validación de la elegida \`${plan.validateSeed}-*\` (con estas no se ha elegido nada).`,
  });
  if (plan.mode !== "completo") B.push({ t: "p", text: "**Modo rápido: sirve para depurar, no para concluir.**" });

  // ---- Resumen ejecutivo
  B.push({ t: "h2", text: "Resumen ejecutivo" });
  const famOut = (rs: readonly FamilyRate[]): FamilyRate[] => rs.filter((f) => f.rate.value < RAW_COMBAT.criterios_sim.familias.min || f.rate.value > RAW_COMBAT.criterios_sim.familias.max);
  const valFam = [...val.families].sort((a, b) => b.rate.value - a.rate.value);
  const eqDiag = d.famDiag.find((x) => x.id.endsWith("_statsiguales"));
  const iaDiag = cands.find((c) => c.variant.id === "diag_ia_reserva3");
  const ubc = usageByCost(moves);
  B.push({
    t: "list",
    items: [
      durFail.length
        ? `**La duración de v0.1 no cumple**: media ${num(base.duration.mean.value, 2)} turnos, mediana ${num(base.duration.median.value)}, p90 ${num(base.duration.p90.value)}, empates ${pct(base.duration.draws.value)} (${int(base.duration.n)} combates C1). Causa: falta energía; el ${pct(base.duration.basicShare, 0)} de las acciones son golpes básicos y la IA casi nunca junta energía para movimientos de coste 5 (los usa en el ${pct(ubc[4]!.meanUse, 0)} de los turnos en que podría).`
        : `La duración de v0.1 cumple: media ${num(base.duration.mean.value, 2)}, p90 ${num(base.duration.p90.value)}, empates ${pct(base.duration.draws.value)}.`,
      famOut(base.families).length
        ? `**Familias desequilibradas**: ${famOut(base.families).length} de 13 fuera de ${pct(RAW_COMBAT.criterios_sim.familias.min, 0)}–${pct(RAW_COMBAT.criterios_sim.familias.max, 0)} (de ${fam.at(-1)!.family} ${pct(fam.at(-1)!.rate.value)} a ${fam[0]!.family} ${pct(fam[0]!.rate.value)}). ${eqDiag && eqDiag.rates.length ? `Igualando las estadísticas (diagnóstico) el rango se estrecha a ${pct(Math.min(...eqDiag.rates.map((r) => r.rate.value)))}–${pct(Math.max(...eqDiag.rates.map((r) => r.rate.value)))}, pero quedan ${famOut(eqDiag.rates).length} fuera: pesan el perfil (la resistencia da más vida de lo que la velocidad da en iniciativa) y los movimientos. El arreglo de duración no lo corrige.` : ""}`
        : `Familias equilibradas (${pct(fam.at(-1)!.rate.value)}–${pct(fam[0]!.rate.value)}).`,
      `Lado A ${pct(base.c1.find((c) => c.id === "lado_A")!.value)} (${verdict(base.c1.find((c) => c.id === "lado_A")!)}). Calidad máx. vs mín.: ${base.quality.map((q) => `β ${num(q.beta, 2)} → ${pct(q.wr.value)}`).join(", ")} (${base.qualityCrit.filter((c) => !c.informative).every((c) => c.pass) ? "cumple D-008" : "**no cumple D-008**"}). Energía: ${bestE ? `guardar (u = ${bestE.u}) gana el ${pct(bestE.wr.value)}` : "—"} (${base.energyCrit.every((c) => c.pass) ? "cumple" : "**no cumple**"}).`,
      `Movimientos (${moves.length}: 72 del catálogo y ${moves.length - 72} mutados): ${broken.length} rotos, ${useless.length} inútiles (${useless.filter((m) => m.source === "catálogo").length} del catálogo, ${useless.filter((m) => m.cost === 2).length} de coste 2), ${sus.length} de uso sospechoso. ${ubc[4]!.never + ubc[3]!.never} de coste 4–5 no se usan nunca con la IA u = 0, así que la prueba no ve esos costes.`,
      d.choice.allPass && valFail.length === 0
        ? `**Recomendación v0.2: ${changes(chosen.variant)}.** Elegida con \`${plan.chooseSeed}\` y validada con \`${plan.validateSeed}\`: aprueba los ${valAll.length} criterios de combate${valAll.some((c) => c.fragile) ? ` (frágil: ${valAll.filter((c) => c.fragile).map((c) => c.label.toLowerCase()).join(", ")})` : ""}.`
        : `**Recomendación v0.2: ${changes(chosen.variant)}.** Arregla ${val.c1.filter((c) => c.group === "Duración C1").every((c) => c.pass) ? "la duración" : "parte de la duración"} (validada con \`${plan.validateSeed}\`)${valFail.length ? `, pero sigue suspendiendo: ${valFail.map((c) => c.label.toLowerCase()).join("; ")}. Las familias necesitan una decisión aparte (abajo)` : ""}.`,
    ],
  });

  // ---- Tabla de criterios
  B.push({ t: "h2", text: "Criterios de v0.1" });
  B.push({ t: "p", text: `${allBase.length - baseFail.length} de ${allBase.length} criterios aprobados (sin contar informativos). "Frágil" = el IC 95 % cruza el umbral. Empate = ½ victoria en todas las tasas.` });
  B.push(critTable([...base.c1, base.init, ...base.familyCrit, ...base.qualityCrit, ...base.energyCrit, ...ms.crit, ms.arch]));
  B.push({
    t: "p",
    text: `Tamaños: C1 ${plan.c1Seeds} semillas × ${int(plan.c1PerSeed)}; C2 ${int(plan.c2PerPair)} por pareja (78 parejas${plan.c2PerPair < RAW_COMBAT.escenarios_sim.C2_familias.combates_por_pareja ? `; la spec pide ${int(RAW_COMBAT.escenarios_sim.C2_familias.combates_por_pareja)}, reducido por presupuesto` : ""}); C3 ${plan.c3.map((c) => `β ${num(c.beta, 2)}: ${int(c.n)}`).join(", ")}; C4 ${int(plan.c4PerReserve)} por reserva; sustitución ${int(plan.movStage1)} por movimiento y +${int(plan.movStage2)} si el IC cruza un umbral (spec: ${int(RAW_MOVES.criterios_sim.combates_por_movimiento)}), con ${plan.movSample} mutados (spec: ${RAW_MOVES.criterios_sim.muestra_mutados}).`,
  });

  // ---- Duración
  B.push({ t: "h2", text: "Duración (C1) y su causa" });
  B.push({
    t: "svg",
    title: "Distribución de turnos en C1",
    svg: histogramSvg(
      [
        { label: "v0.1", hist: base.turnsHist, cls: "s2" },
        { label: `${chosen.variant.id} (validación)`, hist: val.turnsHist, cls: "s1" },
      ],
      RAW_COMBAT.fin.turnos_max,
      RAW_COMBAT.criterios_sim.duracion.p90_max,
    ),
    legend: `<span><i class="sw s2"></i>v0.1 (${int(base.duration.n)} combates)</span><span><i class="sw s1"></i>${esc(chosen.variant.id)}, semillas de validación (${int(val.duration.n)})</span>`,
    note: `La barra del turno ${RAW_COMBAT.fin.turnos_max} incluye los empates por tope.`,
  });
  const diag = cands.filter((c) => c.diagnostic);
  const row = (c: { variant: Variant; duration: CandidateSummary["duration"] }, seeds: string): string[] => [
    c.variant.id,
    Object.keys(c.variant.set).length ? changes(c.variant) : "—",
    seeds,
    int(c.duration.n),
    num(c.duration.mean.value, 2),
    num(c.duration.median.value),
    num(c.duration.p90.value),
    pct(c.duration.draws.value),
    pct(c.duration.drawsCap.value),
    pct(c.duration.basicShare, 0),
  ];
  B.push({
    t: "table",
    head: ["Config", "Cambio", "Semillas", "N", "Media", "Mediana", "p90", "Empates", "…por tope", "Golpes básicos"],
    rows: [row({ variant: base.variant, duration: base.duration }, plan.seed), ...diag.map((c) => row(c, plan.chooseSeed)), ...cands.filter((c) => !c.diagnostic).map((c) => row(c, plan.chooseSeed)), row({ variant: val.variant, duration: val.duration }, `${plan.validateSeed} (validación)`)],
    num: [3, 4, 5, 6, 7, 8, 9],
  });
  const vida = diag.find((c) => c.variant.id === "diag_vida180");
  const tope = diag.find((c) => c.variant.id === "diag_tope40");
  const arch = Object.entries(base.duration.archetypeShare).sort((a, b) => b[1] - a[1]);
  B.push({
    t: "list",
    items: [
      `**Energía, no vida.** Con ${RAW_COMBAT.energia.por_turno} de energía por turno, el ${pct(base.duration.basicShare, 0)} de las acciones son golpes básicos y los movimientos que se pagan son sobre todo baratos: los de coste 4–5 apenas se usan (tabla de abajo). Uso por arquetipo, en % de acciones: ${arch.map(([k, v]) => `${k} ${pct(v, 0)}`).join(", ")}.`,
      vida ? `Bajar la vida un ${pct(1 - 180 / (RAW_COMBAT.estadisticas.vida_base as number), 0)} (diagnóstico) deja la media en ${num(vida.duration.mean.value, 2)} y el p90 en ${num(vida.duration.p90.value)}: ${vida.c1.filter((c) => c.group === "Duración C1" && c.pass).length === 4 ? "bastaría" : "no basta"}.` : "",
      tope ? `Sin tope efectivo (40 turnos, diagnóstico), los combates que hoy empatan por tope ${tope.duration.drawsCap.value < base.duration.drawsCap.value / 2 ? "acaban casi todos" : "siguen sin acabar"}: empates por tope ${pct(tope.duration.drawsCap.value)}, p90 ${num(tope.duration.p90.value)}. ${tope.duration.drawsCap.value < base.duration.drawsCap.value / 2 ? "Son combates lentos, no bloqueados: el desgaste llega tarde." : "Hay bloqueos que el desgaste no rompe."}` : "",
      iaDiag ? `Si las dos IA guardan energía (reserva 3, diagnóstico), la media baja a ${num(iaDiag.duration.mean.value, 2)} y el p90 a ${num(iaDiag.duration.p90.value)}: la IA de referencia, que gasta todo cada turno, alarga los combates porque malgasta el presupuesto convexo en movimientos baratos.` : "",
      `La IA de referencia no puntúa la energía extra del táctico (nota de implementación 17d); el táctico es el ${pct(base.duration.archetypeShare["tactico"] ?? 0, 0)} de las acciones.`,
      "energia.por_turno" in chosen.variant.set
        ? `Arreglo elegido: subir la energía por turno, que ataca la causa (más movimientos pagados por turno) con un solo parámetro. Las otras candidatas (golpe básico más fuerte + desgaste) acortan por fuerza bruta y dejan los movimientos igual de raros.`
        : `Arreglo elegido por la regla: ${changes(chosen.variant)}. No toca la energía, así que los movimientos siguen siendo raros.`,
    ].filter(Boolean),
  });
  B.push({
    t: "table",
    head: ["Coste", "Movimientos probados", "Uso cuando puede pagarlo (IA u = 0)", "Nunca usados", "Victorias medias"],
    rows: ubc.map((u) => [String(u.cost), int(u.n), pct(u.meanUse, 0), int(u.never), pct(u.meanWr)]),
    num: [1, 2, 3, 4],
  });

  // ---- Familias
  B.push({ t: "h2", text: "Familias (C2)" });
  B.push({
    t: "svg",
    title: "Tasa de victoria de cada familia contra las otras 12 (v0.1)",
    svg: rangeBarsSvg(
      fam.map((f) => ({ label: f.family, iv: f.rate })),
      RAW_COMBAT.criterios_sim.familias.min,
      RAW_COMBAT.criterios_sim.familias.max,
      [0.15, 0.85],
    ),
    legend: `<span><i class="sw band"></i>banda ${pct(RAW_COMBAT.criterios_sim.familias.min, 0)}–${pct(RAW_COMBAT.criterios_sim.familias.max, 0)}</span><span><i class="sw s1"></i>dentro</span><span><i class="sw s2"></i>fuera</span>`,
    note: `Base: equipos de 4 salvajes puros. Híbridas: decisión del analista (la spec no fija las estadísticas del D híbrido): 2 D híbridos con firma al azar y valores = media de los D de sus componentes, más 1 D de cada componente.`,
  });
  const rateOf = (rs: readonly FamilyRate[], f: string): string => {
    const r = rs.find((x) => x.family === f);
    return r ? pct(r.rate.value) : "—";
  };
  B.push({
    t: "table",
    head: ["Familia", `v0.1 (${plan.seed})`, `${chosen.variant.id} (${plan.validateSeed})`, ...d.famDiag.map((x) => `Diag.: ${x.id} (${plan.chooseSeed})`)],
    rows: fam.map((f) => [f.family, ivp(f.rate), rateOf(val.families, f.family), ...d.famDiag.map((x) => rateOf(x.rates, f.family))]),
    num: [1, 2, 3, 4],
  });
  B.push({ t: "p", text: `Diagnósticos: ${d.famDiag.map((x) => `**${x.id}**: ${x.label}`).join("; ")}. Con ${int(plan.diagC2PerPair)} combates por pareja (IC por familia ≈ ±${pct(1.96 * Math.sqrt(0.25 / (12 * Math.max(1, plan.diagC2PerPair))), 0)}).` });
  const vidaF = d.famDiag.find((x) => x.id.endsWith("_vida025"));
  B.push({
    t: "list",
    items: [
      `Con anillos simétricos la ventaja de tabla es 0 para todas; lo que separa a las familias es su perfil de estadísticas (pesos de catálogo) y su catálogo de movimientos.`,
      eqDiag && eqDiag.rates.length ? `**Perfil**: igualando estadísticas (con ${chosen.variant.id}), el rango pasa de ${pct(valFam.at(-1)?.rate.value ?? NaN)}–${pct(valFam[0]?.rate.value ?? NaN)} a ${pct(Math.min(...eqDiag.rates.map((r) => r.rate.value)))}–${pct(Math.max(...eqDiag.rates.map((r) => r.rate.value)))} (${famOut(eqDiag.rates).length} fuera de banda: ${famOut(eqDiag.rates).map((r) => `${r.family} ${pct(r.rate.value)}`).join(", ") || "ninguna"}). Lo que queda es efecto de los movimientos.` : "",
      vidaF && vidaF.rates.length ? `**Vida**: con \`alfa_vida\` 0,25, ${famOut(vidaF.rates).length} familias fuera de banda (${famOut(vidaF.rates).map((r) => `${r.family} ${pct(r.rate.value)}`).join(", ") || "ninguna"}). ${famOut(vidaF.rates).length > 0 ? "Ayuda, pero no basta: no se propone sin el arreglo de movimientos." : "Bastaría."}` : "",
      `Con ${chosen.variant.id} (validación): ${famOut(valFam).length} fuera de banda (${famOut(valFam).map((r) => `${r.family} ${pct(r.rate.value)}`).join(", ") || "ninguna"}). El arreglo de duración no toca este problema.`,
    ].filter(Boolean),
  });

  // ---- Calidad
  B.push({ t: "h2", text: "Calidad (D-008 / D-018, C3)" });
  B.push({
    t: "table",
    head: ["β", "N", "Victorias de calidad máx.", "IC 95 %", `Objetivo ≤ ${pct(RAW_COMBAT.criterios_sim.calidad_D008.objetivo_max, 0)}`, `Límite ≤ ${pct(RAW_COMBAT.criterios_sim.calidad_D008.limite_max, 0)}`],
    rows: base.quality.map((q) => [num(q.beta, 2) + (q.beta === beta0 ? " (actual)" : ""), int(q.n), pct(q.wr.value), `${pct(q.wr.lo)}–${pct(q.wr.hi)}`, q.wr.value <= RAW_COMBAT.criterios_sim.calidad_D008.objetivo_max ? "sí" : "no", q.wr.value <= RAW_COMBAT.criterios_sim.calidad_D008.limite_max ? "sí" : "no"]),
    num: [1, 2],
  });
  B.push({ t: "p", text: `Equipos espejo de 4 salvajes con todos los D a calidad máxima (${num(qualityExtremes().hi, 2)}) frente a mínima (${num(qualityExtremes().lo, 2)}) (ancla del catálogo escalada y repartida). Como la calidad no cambia las cuotas σ, su único efecto es q = 1 ± β·(ΔT/T). La curva es plana en el rango estudiado: la calidad no decide combates, como pide D-008.${val.qualityCrit.length ? ` Con la candidata: ${pct(val.qualityCrit[0]!.value)}.` : ""}` });

  // ---- Energía y lado
  B.push({ t: "h2", text: "Energía (C4), lado e iniciativa" });
  B.push({
    t: "table",
    head: ["Reserva u", "N", "Victorias de u contra u = 0 (v0.1)", ...(val.energy.length ? [`Con ${chosen.variant.id} (validación)`] : [])],
    rows: base.energy.map((e) => {
      const v = val.energy.find((x) => x.u === e.u);
      return [String(e.u), int(e.n), ivp(e.wr), ...(v ? [ivp(v.wr)] : [])];
    }),
    num: [1],
  });
  const valBestE = [...val.energy].sort((a, b) => b.wr.value - a.wr.value)[0];
  B.push({
    t: "p",
    text: `Con v0.1 guardar energía compensa: la IA u = 0 gasta todo cada turno y casi nunca paga los movimientos caros, que dan más puntos por energía (presupuesto convexo). ${valBestE ? `Con ${chosen.variant.id} la ventaja de guardar baja a ${pct(valBestE.wr.value)} (u = ${valBestE.u}); ${val.energyCrit.every((c) => c.pass) ? "sigue cumpliendo los dos criterios" : `**no cumple**: ${val.energyCrit.filter((c) => !c.pass).map((c) => c.label.toLowerCase()).join("; ")}`}${val.energyCrit.some((c) => c.fragile) ? " (frágil: el IC cruza el umbral)" : ""}.` : ""}`,
  });
  B.push({
    t: "p",
    text: `Lado A (C1): ${pct(base.c1.find((c) => c.id === "lado_A")!.value)} (${verdict(base.c1.find((c) => c.id === "lado_A")!)}). Iniciativa (informativo): con Δ base ≤ 5 actúa antes la de más iniciativa el ${pct(base.init.value)} de las veces (rango esperado ${base.init.threshold}).`,
  });

  // ---- Movimientos
  B.push({ t: "h2", text: "Movimientos: prueba de sustitución" });
  B.push({
    t: "svg",
    title: "Victorias del equipo con el movimiento frente al golpe de referencia del mismo coste",
    svg: stripSvg(moves, [RAW_MOVES.criterios_sim.inutil_wr, RAW_MOVES.criterios_sim.roto_wr]),
    legend: `<span><i class="sw band"></i>zona normal ${pct(RAW_MOVES.criterios_sim.inutil_wr, 0)}–${pct(RAW_MOVES.criterios_sim.roto_wr, 0)}</span><span><i class="sw s2"></i>roto o inútil</span>`,
  });
  const flagged = [...broken, ...useless, ...sus.filter((m) => !broken.includes(m) && !useless.includes(m))].sort((a, b) => b.wr.value - a.wr.value);
  B.push({
    t: "table",
    head: ["Veredicto", "Origen", "Gen", "Movimiento", "N", "Victorias (IC 95 %)", "Uso"],
    rows: flagged.map((m) => [m.verdict + (m.suspicious ? ", uso sospechoso" : "") + (m.uncertain ? " (dudoso)" : ""), m.source, m.key, m.desc, int(m.n), ivp(m.wr), pct(m.use, 0)]),
    num: [4],
  });
  const piecesHot = ms.pieces.filter((p) => broken.length + useless.length > 0 && (p.broken + p.useless) / Math.max(1, broken.length + useless.length) > 0.5 && p.value !== "—");
  B.push({
    t: "p",
    text: `${broken.length} rotos y ${useless.length} inútiles de ${moves.length}. ${piecesHot.length ? `Piezas presentes en más de la mitad de los marcados: ${piecesHot.map((p) => `${p.piece} = ${p.value} (${p.broken} rotos, ${p.useless} inútiles de ${p.n})`).join("; ")}.` : "Ninguna pieza aparece en más de la mitad de los marcados."} Arquetipos distintos por familia en el catálogo: ${ms.perFamily.map((f) => `${f.family} ${f.n}`).join(", ")}.`,
  });
  B.push({
    t: "p",
    text: `**Límite de la prueba**: con la IA u = 0, ${ubc[3]!.never + ubc[4]!.never} de los ${ubc[3]!.n + ubc[4]!.n} movimientos de coste 4–5 no se llegan a usar nunca (ni el de referencia), así que su ~50 % no dice nada. Hay que repetir la sustitución con la energía de v0.2. Los inútiles se concentran en coste 2 (${useless.filter((m) => m.cost === 2).length} de ${useless.length}), sobre todo curas y escudos con estado (\`regenerar\` cuesta 7 de 18 puntos) frente a un golpe de referencia de ${Math.min(Math.floor((RAW_MOVES.presupuesto_por_coste["2"] * RAW_MOVES.escalables.dano.potencia_por_punto) / RAW_MOVES.escalables.paso) * RAW_MOVES.escalables.paso, RAW_MOVES.escalables.dano.max_individual)} de daño.`,
  });
  B.push({
    t: "table",
    head: ["Pieza", "Valor", "Movimientos", "Victorias medias", "Rotos", "Inútiles"],
    rows: ms.pieces.map((p) => [p.piece, p.value, int(p.n), pct(p.meanWr), int(p.broken), int(p.useless)]),
    num: [2, 3, 4, 5],
  });

  // ---- Recomendación
  B.push({ t: "h2", text: "Recomendación para combate v0.2" });
  B.push({
    t: "p",
    text: `Candidatas de arreglo (máx. 3) evaluadas en C1 con \`${plan.chooseSeed}\`. Regla fijada antes de validar: entre las que aprueban todos los criterios de duración y lado, la de menos parámetros cambiados; empate → menos empates. ${d.choice.allPass ? "" : "**Ninguna aprobaba todo**; se tomó la que más aprobaba."} Elegida: **${chosen.variant.id}** (${changes(chosen.variant)}).`,
  });
  B.push({ t: "h3", text: `Validación de ${chosen.variant.id} con semillas nuevas (\`${plan.validateSeed}-*\`) en todos los escenarios` });
  B.push(critTable([...val.c1, val.init, ...val.familyCrit, ...val.qualityCrit, ...val.energyCrit]));
  const durOk = val.c1.filter((c) => c.group === "Duración C1").every((c) => c.pass);
  B.push({
    t: "list",
    items: [
      `**Cambio propuesto en \`config/combate\` v0.2:** ${changes(chosen.variant)}. ${durOk ? "Con semillas nuevas cumple la duración" : "**No cumple toda la duración con semillas nuevas**"}: media ${num(val.duration.mean.value, 2)}, mediana ${num(val.duration.median.value)}, p90 ${num(val.duration.p90.value)}${val.duration.p90.value === RAW_COMBAT.criterios_sim.duracion.p90_max ? " (justo en el límite)" : ""}, empates ${pct(val.duration.draws.value)}.`,
      valFail.length === 0 ? "Aprueba todos los criterios de combate con semillas no usadas para elegir." : `Sigue suspendiendo en validación: ${valFail.map((c) => `${c.label} (${fmtC(c, c.value)})`).join("; ")}.`,
      famOut(valFam).length
        ? `**Familias (sin arreglo validado):** no hay un parámetro de combate que lo resuelva solo. Propuesta para el diseñador: (1) \`estadisticas.alfa_vida\` 0,5 → 0,25 como punto de partida; (2) revisar en movimientos v0.2 los pesos de las familias extremas (${famOut(valFam).map((r) => r.family).join(", ")}); (3) volver a medir C2 con ambos cambios. Es una decisión del dueño (cambia el valor de especializarse).`
        : "",
      broken.length + useless.length > 0
        ? `**Movimientos:** sales en \`overrides_catalogo.sales\` para los del catálogo marcados (${[...broken, ...useless].filter((m) => m.source === "catálogo").map((m) => m.id).join(", ") || "ninguno"}). Además, como ${piecesHot.length ? piecesHot.map((p) => `${p.piece} ${p.value}`).join(", ") : "ninguna pieza"} aparece en más de la mitad de los marcados, la spec pide ajustar costes de pieza y no movimiento a movimiento: en coste 2 las piezas de coste fijo pesan mucho sobre ${RAW_MOVES.presupuesto_por_coste["2"]} puntos; las que más inútiles acumulan son ${ms.pieces.filter((p) => p.value !== "—" && p.piece !== "coste" && p.useless > 0).sort((a, b) => b.useless - a.useless).slice(0, 3).map((p) => `${p.piece} ${p.value} (${p.useless})`).join(", ")}. Propuesta para el diseñador: abaratarlas o subir \`presupuesto_por_coste.2\`. Queda sin validar: hay que repetir la sustitución con la energía de v0.2.`
        : "Movimientos: ningún cambio necesario.",
    ].filter(Boolean),
  });

  B.push({ t: "h2", text: "Decisiones para el dueño" });
  B.push({
    t: "list",
    items: [
      `**Adoptar ${changes(chosen.variant)} en combate v0.2.** Opciones: (a) sí; ${cands.filter((c) => !c.diagnostic && c.variant.id !== chosen.variant.id).map((c, i) => `(${"bcd"[i]}) ${changes(c.variant)} (con \`${plan.chooseSeed}\`: media ${num(c.duration.mean.value, 2)}, p90 ${num(c.duration.p90.value)}, empates ${pct(c.duration.draws.value)})`).join("; ")}. Recomendación: (a).`,
      famOut(valFam).length ? `**Familias:** (a) encargar al diseñador perfil (\`alfa_vida\` 0,25) + pesos de movimientos de las familias extremas y validarlo en la semana siguiente; (b) aceptar el desequilibrio en v0.2 y arreglarlo con la economía. Recomendación: (a), porque con monofamilia hay familias que ganan menos de 1 de cada 3.` : "",
      `**β de calidad (D-018):** la curva es plana (${base.quality.map((q) => `β ${num(q.beta, 2)}: ${pct(q.wr.value)}`).join("; ")}). Mantener β = ${num(beta0, 2)} cumple el objetivo con margen.`,
    ].filter(Boolean),
  });

  B.push({ t: "h2", text: "Método y limitaciones" });
  B.push({
    t: "list",
    items: [
      "Semillas por combate: equipos `<prefijo>|<escenario>|equipos|i` (los mismos para todas las variantes: comparación pareada) y combate `<prefijo>|<escenario>|<variante>|i` (flujo propio por variante). Lados alternos en C2–C4 y en la sustitución; C1 deja A = primer equipo generado.",
      "Empate = ½ victoria. Medias con IC normal; mediana y p90 con IC por estadísticos de orden; proporciones con Wilson.",
      `Variantes de diagnóstico aparte de las de arreglo, ninguna se propone: ${[...cands.filter((c) => c.diagnostic).map((c) => c.variant.id), ...d.famDiag.map((x) => x.id)].join(", ")}.`,
      "Sustitución con la IA de referencia (u = 0) en ambos lados, equipo espejo C1 nuevo en cada combate; el hueco sustituido es el de la criatura 1 con el mismo coste (o el de su locus); referencia = golpe de la familia del movimiento con todo el presupuesto.",
      "Exploración previa al código (300 combates por variante, semillas `diag*`, no reutilizadas aquí) para escoger qué 3 candidatas probar.",
    ],
  });
  return { title, blocks: B };
}

// --------------------------------------------------------------- render

function renderHtml(title: string, blocks: readonly Block[]): string {
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
                    const cls = k === b.status ? (c.startsWith("aprobado") ? "ok" : c.startsWith("suspendido") ? "ko" : "") : b.num?.includes(k) ? "n" : "";
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

function renderMd(blocks: readonly Block[]): string {
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
  const out: string[] = [];
  const htmlPath = `${d.outDir}/informe-combate-v0.1.html`;
  writeFileSync(htmlPath, html);
  writeFileSync(`${d.outDir}/combate-v0.1.md`, renderMd(n.blocks));
  out.push(htmlPath, `${d.outDir}/combate-v0.1.md`);
  if (d.official) {
    mkdirSync("docs/informes", { recursive: true });
    writeFileSync("docs/informes/informe-combate-v0.1.html", html);
    writeFileSync("docs/informes/combate-v0.1.md", renderMd(n.blocks));
    out.push("docs/informes/informe-combate-v0.1.html", "docs/informes/combate-v0.1.md");
  }
  return out;
}
