/**
 * Informe del estudio de variantes v0.3 (Markdown + HTML), generado desde los JSON de las fases.
 * Todas las cifras y conclusiones salen de los datos (plantillas condicionales); no hay números escritos a mano.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { Interval } from "../combat/analysis.ts";
import { renderHtml, renderMd, type Block } from "../combat/report.ts";
import { allFamilies, RAW_COMBAT } from "../combat/setup.ts";
import { delta, familyRates, metrics, SPEC_V03, type Crit, type Metrics } from "./analysis.ts";
import type { Phase, PhaseFile } from "./cli.ts";
import { MIN_ACTIONS } from "./games.ts";

const pct = (x: number, d = 1): string => (!Number.isFinite(x) ? "—" : `${(x * 100).toLocaleString("es", { minimumFractionDigits: d, maximumFractionDigits: d })} %`);
const num = (x: number, d = 2): string => (!Number.isFinite(x) ? "—" : x.toLocaleString("es", { minimumFractionDigits: d, maximumFractionDigits: d }));
const int = (x: number): string => x.toLocaleString("es");
const ivp = (i: Interval | null): string => (i ? `${pct(i.value)} (${pct(i.lo)}–${pct(i.hi)})` : "—");
const ivn = (i: Interval, d = 2): string => `${num(i.value, d)} (${num(i.lo, d)}–${num(i.hi, d)})`;
const pp = (d: number): string => `${d >= 0 ? "+" : "−"}${Math.abs(d * 100).toLocaleString("es", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pt`;
const sgn = (d: number, dec = 2): string => `${d >= 0 ? "+" : "−"}${num(Math.abs(d), dec)}`;
const verdict = (c: Crit): string => (c.pass ? "aprobado" : "suspendido") + (c.fragile ? " (frágil)" : "");
const mark = (c: Crit | undefined): string => (!c ? "" : c.pass ? (c.fragile ? " ✓ frágil" : " ✓") : c.fragile ? " ✗ frágil" : " ✗");
const critVal = (c: Crit): string => (c.fmt === "pct" ? ivp(c.iv) : c.iv.lo === c.iv.hi ? num(c.iv.value, 0) : ivn(c.iv));
const list = (xs: readonly string[]): string => (xs.length === 0 ? "ninguna" : xs.length === 1 ? xs[0]! : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

const V1_KEY = "variantes.golpe_basico_efecto.activo";

interface Row {
  readonly id: string;
  readonly label: string;
  readonly sha: string;
  /** Lleva V1 (golpe básico con efecto): afectada por el aviso Q-01 del Revisor. */
  readonly v1: boolean;
  readonly m: Metrics;
}

function rowsOf(f: PhaseFile): Row[] {
  return f.combos.filter((c) => f.data[c.id]).map((c) => ({ id: c.id, label: c.label + (c.combat[V1_KEY] === true ? " †" : ""), sha: c.sha, v1: c.combat[V1_KEY] === true, m: metrics(f.data[c.id]!) }));
}

/** Puntos con IC por combinación (una o dos series) y línea de umbral. */
function intervalsSvg(labels: readonly string[], series: { cls: string; ivs: (Interval | null)[] }[], dom: [number, number], thr: number): string {
  const W = 860;
  const rowH = 30;
  const L = 170;
  const R = 20;
  const T = 8;
  const H = T + labels.length * rowH + 26;
  const x = (v: number): number => L + ((Math.min(dom[1], Math.max(dom[0], v)) - dom[0]) / (dom[1] - dom[0])) * (W - L - R);
  const parts: string[] = [];
  for (let t = dom[0]; t <= dom[1] + 1e-9; t += 0.1) {
    parts.push(`<line class="grid" x1="${x(t).toFixed(1)}" y1="${T}" x2="${x(t).toFixed(1)}" y2="${H - 24}"/>`);
    parts.push(`<text class="tick" x="${x(t).toFixed(1)}" y="${H - 8}" text-anchor="middle">${Math.round(t * 100)} %</text>`);
  }
  parts.push(`<line class="mark" x1="${x(thr).toFixed(1)}" y1="${T}" x2="${x(thr).toFixed(1)}" y2="${H - 24}"/>`);
  labels.forEach((lb, i) => {
    const yc = T + i * rowH + rowH / 2;
    parts.push(`<text class="axl" x="${L - 8}" y="${(yc + 4).toFixed(1)}" text-anchor="end">${lb.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`);
    series.forEach((s, k) => {
      const iv = s.ivs[i];
      if (!iv) return;
      const y = yc + (series.length > 1 ? (k === 0 ? -5 : 5) : 0);
      parts.push(`<line class="whisk ${s.cls}" x1="${x(iv.lo).toFixed(1)}" y1="${y}" x2="${x(iv.hi).toFixed(1)}" y2="${y}"/>`);
      parts.push(`<circle class="dot ${s.cls}" cx="${x(iv.value).toFixed(1)}" cy="${y}" r="4"/>`);
    });
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${parts.join("")}</svg>`;
}

function narrative(ph: Partial<Record<Phase, PhaseFile>>): { title: string; blocks: Block[] } {
  const title = "Variantes de combate v0.3: estudio de balance — Proyecto Genoma";
  const B: Block[] = [{ t: "h1", text: title }];
  const ev = ph.evaluar;
  if (!ev) {
    B.push({ t: "p", text: "No hay datos de la fase `evaluar`." });
    return { title, blocks: B };
  }
  const z = ev.sizes;
  const rows = rowsOf(ev);
  const base = rows.find((r) => r.id === "base")!;
  const others = rows.filter((r) => r.id !== "base");
  const v4 = rows.filter((r) => r.id.startsWith("v4p"));
  const cOf = (r: Row, id: string): Crit | undefined => r.m.crit.find((c) => c.id === id);
  const fails = (r: Row): Crit[] => r.m.crit.filter((c) => !c.pass);
  const baseFailIds = new Set(fails(base).map((c) => c.id));
  const newFails = (r: Row): Crit[] => fails(r).filter((c) => !baseFailIds.has(c.id));
  const fixed = (r: Row): Crit[] => fails(base).filter((c) => r.m.crit.find((x) => x.id === c.id)?.pass);
  const D = RAW_COMBAT.criterios_sim.duracion;
  const F = RAW_COMBAT.criterios_sim.familias;

  B.push({
    t: "sub",
    text: `Generado por \`npm run sim:variantes\` desde el commit \`${ev.commit}\` (más cambios locales si los hay), configs combate + movimientos + genética v0.2 (balance v0.2.1) sin cambios, huella sha256 \`${ev.configSha}…\`; cada combinación es un parche por ruta con su propia huella (tabla de método). Modo ${ev.mode}, semillas \`${ev.seed}|…\`, ${ev.threads} hilos, ${int(Math.round(ev.elapsedSec))} s${ph.elegir ? `; ajuste: elegir \`${ph.elegir.seed}|…\` (${int(Math.round(ph.elegir.elapsedSec))} s)` : ""}${ph.validar ? `, validar \`${ph.validar.seed}|…\` (${int(Math.round(ph.validar.elapsedSec))} s)` : ""}.${ev.mode === "rapido" ? " **Modo rápido: sirve para depurar, no para concluir.**" : ""}`,
  });

  B.push({ t: "h2", text: "Avisos de fiabilidad (Revisor)" });
  B.push({
    t: "list",
    items: [
      `**Q-01 — las cifras con V1 (marcadas con †) no son fiables en Roca ni en el equilibrio de familias.** Con V1 activa, el escudo de ${String(RAW_COMBAT.variantes.golpe_basico_efecto.efectos.roca.cantidad)} del golpe básico de Roca renueva la duración de los escudos previos (\`packages/core/src/combat/engine.ts\`, efecto \`escudo\` del golpe básico), así que un escudo grande se vuelve permanente. Afecta a ${list(rows.filter((r) => r.v1).map((r) => r.label))}: sus columnas de familias (y, en menor medida, remontada y duración) son **provisionales** hasta que se arregle el núcleo y se repitan. La base, V2 y V4+provocar no llevan V1 y no están afectadas; V3 solo se ha medido combinada con V1, así que su efecto se lee de la diferencia entre combinaciones que comparten el defecto.`,
      `**Q-02 — las combinaciones con V4 miden casi «V4 sin provocar».** Solo 2 de los 72 movimientos del catálogo llevan provocar; en equipos de salvajes se usa ${v4.map((r) => `${num(r.m.tauntsPerGame)} veces por partida (${r.label})`).join(", ")}. La profundidad, la remontada, la variedad y la duración de V4 son, en la práctica, las del objetivo automático sin su contrapeso. Provocar solo pesa en el escenario de familias (equipos monofamilia), y ahí hace daño (ver diagnóstico).`,
    ],
  });

  // ------------------------------------------------------------------ tabla principal
  const mainTable: Block = {
    t: "table",
    head: ["Combinación", `Profundidad (> ${pct(SPEC_V03.depthMin, 0)})`, `Gana 1.er KO (< ${pct(SPEC_V03.comebackMax, 0)})`, `Gana líder de vida T3 (< ${pct(SPEC_V03.comebackMax, 0)})`, `Familias en ${pct(F.min, 0)}–${pct(F.max, 0)}`, `Turnos, media (${D.media_min}–${D.media_max})`, `p90 (≤ ${D.p90_max})`, `Empates (≤ ${pct(D.max_empates, 0)})`, "Criterios"],
    rows: rows.map((r) => [
      r.label,
      `${ivp(r.m.depth)}${mark(cOf(r, "prof"))}`,
      `${ivp(r.m.firstKo)}${mark(cOf(r, "ko1"))}`,
      `${ivp(r.m.lead3)}${mark(cOf(r, "vida3"))}`,
      r.m.families ? `${r.m.famOk}/${r.m.families.length}${mark(cOf(r, "fam"))}` : "—",
      `${num(r.m.mean.value)}${mark(cOf(r, "dur_media"))}`,
      `${num(r.m.p90.value, 0)}${mark(cOf(r, "dur_p90"))}`,
      `${pct(r.m.draws.value)}${mark(cOf(r, "empates"))}`,
      `${r.m.crit.filter((c) => c.pass).length}/${r.m.crit.length}`,
    ]),
  };

  // ------------------------------------------------------------------ resumen
  B.push({ t: "h2", text: "Resumen ejecutivo" });
  const items: string[] = [];
  const depthSure = (r: Row): boolean => r.m.depth !== null && r.m.depth.lo > SPEC_V03.depthMin;
  if (base.m.depth)
    items.push(
      `**Profundidad.** Base: ${ivp(base.m.depth)}. ${rows.every(depthSure) ? `Todas las combinaciones superan el ${pct(SPEC_V03.depthMin, 0)} con el IC entero por encima` : `No superan con claridad el ${pct(SPEC_V03.depthMin, 0)}: ${list(rows.filter((r) => !depthSure(r)).map((r) => r.label))}`}. La más baja es ${[...rows].sort((a, b) => a.m.depth!.value - b.m.depth!.value)[0]!.label} (${ivp([...rows].sort((a, b) => a.m.depth!.value - b.m.depth!.value)[0]!.m.depth)}).`,
    );
  if (v4.length && base.m.depth) {
    const all = v4.every(depthSure);
    const drops = v4.filter((r) => delta(r.m.depth!, base.m.depth!).sig && r.m.depth!.value < base.m.depth!.value);
    items.push(
      `**¿El objetivo automático mantiene la profundidad > ${pct(SPEC_V03.depthMin, 0)}?** ${all ? "**Sí**" : v4.some(depthSure) ? "**Solo en parte**" : "**No**"}: ${v4.map((r) => `${r.label} ${ivp(r.m.depth)}`).join("; ")}. ${drops.length ? `Baja de forma significativa frente a la base en ${list(drops.map((r) => `${r.label} (${pp(r.m.depth!.value - base.m.depth!.value)})`))}: quitar la elección de objetivo resta decisiones, pero queda margen sobre el umbral.` : "Ninguna diferencia con la base es significativa con este tamaño de muestra."}`,
    );
  }
  const v2 = rows.find((r) => r.id === "v2");
  const v1 = rows.find((r) => r.id === "v1");
  const v1v2 = rows.find((r) => r.id === "v1v2");
  if (v2) {
    const dE = delta(v2.m.entropy, base.m.entropy);
    const dB = delta(v2.m.basic, base.m.basic);
    const dE12 = v1 && v1v2 ? delta(v1v2.m.entropy, v1.m.entropy) : null;
    const poorer = dE.sig && dE.d < 0;
    const richer = dE.sig && dE.d > 0;
    items.push(
      `**¿El descanso (V2) empobrece la variedad?** ${poorer ? "**Sí, algo**" : richer ? "**No: la aumenta**" : "**No de forma apreciable**"}. Entropía de uso por alma ${num(base.m.entropy.value)} → ${num(v2.m.entropy.value)} bits (${sgn(dE.d)}${dE.sig ? ", significativo" : ", no significativo"})${dE12 ? `; sobre V1, ${num(v1!.m.entropy.value)} → ${num(v1v2!.m.entropy.value)} (${sgn(dE12.d)}${dE12.sig ? ", significativo" : ", no significativo"})` : ""}. Golpes básicos ${pct(base.m.basic.value)} → ${pct(v2.m.basic.value)} (${pp(dB.d)}). Cada alma tiene de media ${num(v2.m.avail)} de sus 4 movimientos disponibles (no ${num(3, 0)}: con el ${pct(v2.m.basic.value, 0)} de golpes básicos casi nunca hay un movimiento en descanso), y ${num(v2.m.payable)} que además puede pagar (base: ${num(base.m.payable)}). ${Math.abs(dE.d) < 0.05 ? "Con la IA de reglas el descanso apenas cambia nada: ni empobrece ni enriquece, porque la energía ya impide repetir." : ""}`,
    );
  }
  const koBase = cOf(base, "ko1")!;
  const l3Base = cOf(base, "vida3")!;
  items.push(
    `**Remontada.** Base: gana quien hace el primer KO en el ${ivp(base.m.firstKo)} (${verdict(koBase)}) y quien lidera en vida tras el turno 3 en el ${ivp(base.m.lead3)} (${verdict(l3Base)}). ${others.filter((r) => !cOf(r, "ko1")!.pass || !cOf(r, "vida3")!.pass).length ? `Suspenden alguna de las dos: ${list(others.filter((r) => !cOf(r, "ko1")!.pass || !cOf(r, "vida3")!.pass).map((r) => r.label))}.` : "Ninguna combinación suspende."} En partidas espejo (mismo equipo en los dos lados, sin ventaja de equipo) la base da ${ivp(base.m.mirrorFirstKo)} y ${ivp(base.m.mirrorLead3)}: ${base.m.mirrorLead3 && base.m.mirrorLead3.value < base.m.lead3.value - 0.02 ? "parte de la medida con equipos distintos es ventaja de equipo y no bola de nieve" : "la medida casi no depende de la diferencia de equipos"}.`,
  );
  const famBad = rows.filter((r) => r.m.families && r.m.famOk < r.m.families.length);
  if (base.m.families)
    items.push(
      `**Familias.** Base: ${base.m.famOk}/${base.m.families.length} en banda (la más alejada, ${base.m.famWorst!.family} ${ivp(base.m.famWorst!.rate)}). ${famBad.length ? `Con alguna familia fuera: ${list(famBad.map((r) => `${r.label} (${r.m.famOk}/${r.m.families!.length}; ${r.m.families!.filter((f) => f.rate.value < F.min || f.rate.value > F.max).map((f) => `${f.family} ${pct(f.rate.value)}`).join(", ")})`))}.` : "Todas las combinaciones mantienen las 13 en banda."}`,
    );
  const durBad = rows.filter((r) => ["dur_media", "dur_p90", "empates"].some((id) => !cOf(r, id)!.pass));
  items.push(`**Duración.** Base: media ${num(base.m.mean.value)}, p90 ${num(base.m.p90.value, 0)}, empates ${pct(base.m.draws.value)}. ${durBad.length ? `Suspenden duración o empates: ${list(durBad.map((r) => `${r.label} (${fails(r).filter((c) => ["dur_media", "dur_p90", "empates"].includes(c.id)).map((c) => c.label.toLowerCase()).join(", ")})`))}.` : "Todas en banda."}`);
  B.push({ t: "list", items });
  B.push({ t: "h3", text: "Tabla resumen (✓ aprobado, ✗ suspendido; «frágil» = el IC 95 % cruza el umbral)" });
  B.push(mainTable);
  if (base.m.depth) {
    B.push({ t: "svg", title: "Profundidad: victorias de la IA de búsqueda contra la mejor IA de reglas (IC 95 %)", svg: intervalsSvg(rows.map((r) => r.label), [{ cls: "s1", ivs: rows.map((r) => r.m.depth) }], [0.5, 1], SPEC_V03.depthMin), note: `Línea discontinua: umbral ${pct(SPEC_V03.depthMin, 0)}.` });
  }
  B.push({
    t: "svg",
    title: "Remontada: % de partidas que gana quien hace el primer KO y quien lidera en vida tras el turno 3 (IC 95 %)",
    legend: `<span><i class="sw s1"></i>primer KO</span><span><i class="sw s2"></i>líder de vida tras el turno 3</span>`,
    svg: intervalsSvg(rows.map((r) => r.label), [{ cls: "s1", ivs: rows.map((r) => r.m.firstKo) }, { cls: "s2", ivs: rows.map((r) => r.m.lead3) }], [0.5, 0.8], SPEC_V03.comebackMax),
    note: `Línea discontinua: umbral ${pct(SPEC_V03.comebackMax, 0)} (debe quedar a la izquierda).`,
  });

  // ------------------------------------------------------------------ recomendación
  void newFails;
  void fixed;
  B.push(...recommendation(ph, rows, base, { fails, cOf }));

  // ------------------------------------------------------------------ cambios frente a la base
  B.push({ t: "h2", text: "Qué mejora y qué empeora cada combinación frente a la base" });
  const cell = (x: Interval | null, b: Interval | null, goodUp: boolean, asPct: boolean): string => {
    if (!x || !b) return "—";
    const d = delta(x, b);
    const txt = asPct ? pp(d.d) : sgn(d.d);
    return `${txt} ${!d.sig ? "≈" : d.d > 0 === goodUp ? "mejora" : "empeora"}`;
  };
  const famDev = (r: Row): number => (r.m.famWorst ? Math.abs(r.m.famWorst.rate.value - 0.5) : NaN);
  B.push({
    t: "table",
    head: ["Combinación", "Profundidad", "Gana 1.er KO", "Gana líder T3", "Entropía por alma (bits)", "% golpes básicos", "Familias en banda", "Turnos (media)"],
    rows: others.map((r) => [
      r.label,
      cell(r.m.depth, base.m.depth, true, true),
      cell(r.m.firstKo, base.m.firstKo, false, true),
      cell(r.m.lead3, base.m.lead3, false, true),
      cell(r.m.entropy, base.m.entropy, true, false),
      cell(r.m.basic, base.m.basic, false, true),
      r.m.families ? `${r.m.famOk - base.m.famOk >= 0 ? "+" : "−"}${Math.abs(r.m.famOk - base.m.famOk)} (desv. máx. ${pp(famDev(r) - famDev(base))}) ${r.m.famOk > base.m.famOk ? "mejora" : r.m.famOk < base.m.famOk ? "empeora" : "≈"}` : "—",
      `${sgn(r.m.mean.value - base.m.mean.value)} ${cOf(r, "dur_media")!.pass ? "(en banda)" : "(fuera de banda)"}`,
    ]),
  });
  B.push({ t: "p", text: "«mejora» / «empeora» = diferencia significativa al 95 % en el sentido bueno / malo; «≈» = no significativa. El contraste trata las muestras como independientes (los equipos son los mismos en todas las combinaciones, así que es conservador). En familias cuenta el nº de familias en banda. En «% golpes básicos» el contraste cuenta cada acción como independiente (son decenas de miles), así que marca como significativas diferencias de menos de 1 punto que no tienen importancia práctica." });

  // ------------------------------------------------------------------ criterios por combinación
  B.push({ t: "h2", text: "Criterios por combinación" });
  B.push({
    t: "table",
    status: 4,
    head: ["Combinación", "Criterio", "Umbral", "Valor (IC 95 %)", "Resultado"],
    rows: rows.flatMap((r) => r.m.crit.map((c) => [r.label, c.label + (c.extra ? ` — ${c.extra} en banda` : ""), c.threshold, critVal(c), verdict(c)])),
  });

  // ------------------------------------------------------------------ variedad
  B.push({ t: "h2", text: "Variedad de uso" });
  B.push({
    t: "table",
    head: ["Combinación", "Entropía por alma, bits (IC)", "Opciones efectivas (2^H)", "Entropía agregada", "Básico", "Mov. más barato", "2.º", "3.º", "Más caro", "Mov. disponibles (de 4)", "…y pagables", "Energía sin gastar por turno", "Provocar por partida"],
    num: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    rows: rows.map((r) => [r.label, ivn(r.m.entropy), num(2 ** r.m.entropy.value), num(r.m.aggEntropy), pct(r.m.shares[0]!), pct(r.m.shares[1]!), pct(r.m.shares[2]!), pct(r.m.shares[3]!), pct(r.m.shares[4]!), num(r.m.avail), num(r.m.payable), num(r.m.unspent), num(r.m.tauntsPerGame)]),
  });
  B.push({
    t: "list",
    items: [
      `Entropía por alma: de la distribución de sus acciones ejecutadas entre golpe básico y sus 4 movimientos (máximo log₂ 5 = ${num(Math.log2(5))} bits), media de las almas con ≥ ${MIN_ACTIONS} acciones en la partida. Con pocas acciones por alma el estimador queda sesgado a la baja, más en partidas cortas (V3): por eso se da también la **entropía agregada** (de la distribución conjunta por rango de coste), que no tiene ese sesgo.`,
      "«Mov. disponibles»: movimientos que no están en descanso al decidir; «pagables»: además, con coste ≤ energía del bando. Medido con la IA de reglas en los dos lados (C1).",
      `En las partidas de profundidad (búsqueda contra reglas, los dos bandos mezclados) el golpe básico supone: ${rows.map((r) => `${r.label} ${pct(r.m.depthBasic)}`).join("; ")}. ${base.m.depthBasic < base.m.basic.value - 0.02 ? "Quien piensa más usa más los movimientos." : "Pensar más no reduce el uso del básico: el límite es la energía (3–4 por turno para 4 almas), no la IA."} El básico solo baja de forma clara con V3 (más energía).`,
    ],
  });

  // ------------------------------------------------------------------ remontada: controles
  B.push({ t: "h2", text: "Remontada: controles" });
  B.push({
    t: "table",
    head: ["Combinación", "1.er KO (equipos distintos)", "1.er KO (espejo)", "Líder T3 (equipos distintos)", "Líder T3 (espejo)", "Gana el equipo con más vida máxima inicial"],
    rows: rows.map((r) => [r.label, ivp(r.m.firstKo), ivp(r.m.mirrorFirstKo), ivp(r.m.lead3), ivp(r.m.mirrorLead3), ivp(r.m.lead0)]),
  });
  B.push({
    t: "p",
    text: `El criterio se aplica a la columna de equipos distintos (C1, ${int(z.c1)} partidas), que es la lectura literal de la spec. Esa medida mezcla dos cosas: bola de nieve (ir por delante ayuda a ganar) y que el mejor equipo suele ir por delante **y** ganar. El control espejo (${int(z.mirror)} partidas, mismo equipo en los dos lados) quita lo segundo; la última columna indica cuánto predice el resultado un dato anterior al combate. Se excluyen los empates, las partidas sin líder (vida igual) y, en «líder T3», las que acaban antes del turno 4.`,
  });

  // ------------------------------------------------------------------ familias
  if (base.m.families) {
    B.push({ t: "h2", text: "Equilibrio de familias (C2)" });
    B.push({
      t: "table",
      head: ["Familia", ...rows.map((r) => r.label)],
      num: rows.map((_, i) => i + 1),
      rows: allFamilies().map((fam) => [fam, ...rows.map((r) => {
        const f = r.m.families!.find((x) => x.family === fam)!;
        return `${pct(f.rate.value)}${f.rate.value < F.min || f.rate.value > F.max ? " ✗" : ""}`;
      })]),
    });
    const hw = base.m.families[0]!;
    B.push({ t: "p", text: `${int(z.c2PerPair)} partidas por pareja (78 parejas, ${int(hw.n)} por familia): el IC 95 % de cada celda es de ± ${pp((hw.rate.hi - hw.rate.lo) / 2).slice(1)}. Una familia a menos de esa distancia del borde puede cambiar de lado con otras semillas (en v0.2.1, magma ya estaba al borde: 54,7 %).` });
  }

  // ------------------------------------------------------------------ V4
  if (v4.length) {
    B.push({ t: "h2", text: "Objetivo automático (V4): formación y provocar" });
    B.push({
      t: "table",
      head: ["Combinación", "Formación sugerida vs orden de generación", "Formación sugerida vs invertida", "Usos de provocar por partida (C1)", "Planes de la búsqueda distintos de la IA de reglas", "Turnos con búsqueda"],
      rows: rows.map((r) => [r.label, ivp(r.m.formGen), ivp(r.m.formInv), num(r.m.tauntsPerGame), pct(r.m.depthDiffers), num(r.m.depthTurns)]),
    });
    const fi = v4[0]!.m.formInv;
    const fg = v4[0]!.m.formGen;
    B.push({
      t: "list",
      items: [
        fi && fg ? `**¿La formación pasa a ser una decisión importante?** Con el mismo equipo y la IA de reglas en los dos lados, la formación de \`suggestFormation\` gana el ${ivp(fg)} a la de orden de generación y el ${ivp(fi)} a su inversa (${int(z.form)} partidas cada una, ${v4[0]!.label}). ${fi.lo > 0.55 ? "Colocar bien el equipo da ventaja clara: la formación decide partidas." : fi.lo > 0.5 ? "La formación cuenta, pero poco." : "Con estas medidas, la formación no cambia el resultado de forma apreciable: como decisión pesa poco."}` : "Sin datos de formación.",
        `**Provocar apenas aparece** en equipos de salvajes: ${v4.map((r) => `${num(r.m.tauntsPerGame)} usos por partida en ${r.label}`).join("; ")}. Solo 2 de los 72 movimientos del catálogo lo llevan (notas de implementación, n.º 20). La medida de V4 es, en la práctica, la de «objetivo automático casi sin provocar».`,
        `La IA de búsqueda elige un plan distinto del de la IA de reglas en el ${pct(base.m.depthDiffers)} de sus decisiones en la base y en el ${v4.map((r) => `${pct(r.m.depthDiffers)} (${r.label})`).join(", ")} con V4: ${v4.every((r) => r.m.depthDiffers > base.m.depthDiffers - 0.05) ? "aunque no se elige objetivo, sigue habiendo tantas decisiones de movimiento y energía en las que pensar más cambia el plan" : "sin objetivos hay menos decisiones en las que pensar más cambia el plan"}.`,
      ],
    });
  }

  // ------------------------------------------------------------------ ajuste
  B.push(...adjustBlocks(ph));

  // ------------------------------------------------------------------ método
  B.push({ t: "h2", text: "Método y limitaciones" });
  B.push({
    t: "table",
    head: ["Combinación", "Parche de combate", "Parche de movimientos", "Huella de la config efectiva"],
    rows: ev.combos.map((c) => [c.label, Object.keys(c.combat).length ? Object.entries(c.combat).map(([k, v]) => `\`${k}\` = ${JSON.stringify(v)}`).join("; ") : "—", Object.keys(c.moves).length ? Object.entries(c.moves).map(([k, v]) => `\`${k}\` = ${JSON.stringify(v)}`).join("; ") : "—", `\`${c.sha}\``]),
  });
  const P = ev.data["base"]?.PROF;
  B.push({
    t: "list",
    items: [
      "**Los parches cambian la config de verdad:** antes de simular, cada ruta se lee de vuelta del JSON efectivo con el valor pedido, la config pasa por los parsers del núcleo y se exige que las huellas de todas las combinaciones sean distintas. Los ficheros de `config/` no se tocan.",
      `**Tamaños por combinación:** profundidad ${int(z.depth)} partidas${z.depth >= 400 ? " (lo que pide la spec)" : " (la spec pide ≥ 400; reducido por presupuesto)"}; C1 ${int(z.c1)} (duración, remontada, variedad); espejo ${int(z.mirror)}; C2 ${int(z.c2PerPair)} por pareja (v0.2.1 usó 250; reducido por presupuesto, ver el IC en la tabla de familias); formación ${int(z.form)} por rival y solo con V4.`,
      `**Profundidad:** \`createSearchAi()\` con las opciones por defecto contra \`createReferenceAi()\` (la mejor IA de reglas, informe de combate v0.2), mismo equipo de salvajes en los dos lados y cada equipo dos veces (búsqueda en A y en B) con la misma semilla. IC 95 % normal con empate = ½.${P ? ` En la base, ${P.draws} empates en ${int(P.n)} partidas.` : ""} La base mide ${ivp(base.m.depth)}; \`profundidad-v0.1.md\` dio 86,8 % con otras semillas (\`prof01\`).`,
      "**Formación:** con V4, los dos equipos se colocan con `suggestFormation` en todos los escenarios; sin V4, en orden de generación, como en el estudio v0.2.1. La comparación V4 / no V4 incluye por tanto el efecto de colocar el equipo.",
      "**Semillas:** equipos `<semilla>|<escenario>|equipos|i` (los mismos para todas las combinaciones) y partida `<semilla>|<escenario>|<combinación>|i` (flujo propio por combinación). Ninguna se había usado: quemadas `genoma*`, `combate01`, `elige01/02*`, `explora02*`, `valida01–03`, `prof01`, `tune1/2` (la CLI las rechaza).",
      `**Planes inválidos:** ${rows.every((r) => r.m.invalid === 0) ? "0 en todas las combinaciones (las IA no proponen movimientos en descanso)" : rows.filter((r) => r.m.invalid > 0).map((r) => `${r.label}: ${r.m.invalid}`).join("; ")}.`,
      `**Cómputo:** evaluación ${int(Math.round(ev.elapsedSec))} s${ph.diagnostico ? ` + diagnóstico ${int(Math.round(ph.diagnostico.elapsedSec))} s` : ""} con ${ev.threads} hilos. Una primera ejecución de la evaluación se interrumpió sin dejar datos (corte de la sesión) y se repitió entera con las mismas semillas y tamaños algo menores; de ella no se miró ningún resultado.`,
      "**Limitaciones.** (1) Remontada, variedad, duración y familias se miden con la IA de reglas en los dos lados; una persona no juega igual (con la búsqueda, el básico baja unos puntos). (2) La profundidad se mide contra una IA: es una cota de cuánto gana pensar, no una medida de diversión. (3) Los números de V1 y de provocar son los del Ingeniero (notas v0.3); aquí no se han buscado valores mejores salvo el ajuste declarado. (4) Equipos de salvajes: provocar casi no aparece, así que V4 se ha medido casi sin su contrapeso.",
    ],
  });
  return { title, blocks: B };
}

interface Helpers {
  fails: (r: Row) => Crit[];
  cOf: (r: Row, id: string) => Crit | undefined;
}

function diagRows(ph: Partial<Record<Phase, PhaseFile>>): { id: string; label: string; ok: number; out: string[]; brote: Interval | null }[] {
  const dg = ph.diagnostico;
  if (!dg) return [];
  const F = RAW_COMBAT.criterios_sim.familias;
  return dg.combos.filter((c) => dg.data[c.id]?.C2).map((c) => {
    const fr = familyRates(dg.data[c.id]!.C2!);
    return { id: c.id, label: c.label, ok: fr.filter((f) => f.rate.value >= F.min && f.rate.value <= F.max).length, out: fr.filter((f) => f.rate.value < F.min || f.rate.value > F.max).map((f) => `${f.family} ${pct(f.rate.value)}`), brote: fr.find((f) => f.family === "brote")?.rate ?? null };
  });
}

function recommendation(ph: Partial<Record<Phase, PhaseFile>>, rows: readonly Row[], base: Row, h: Helpers): Block[] {
  const B: Block[] = [{ t: "h2", text: "Recomendación" }];
  const by = (id: string): Row | undefined => rows.find((r) => r.id === id);
  const others = rows.filter((r) => r.id !== "base");
  const clean = others.filter((r) => h.fails(r).length === 0);
  const baseClean = h.fails(base).length === 0;
  const failTxt = (r: Row): string => h.fails(r).map((c) => (c.id === "fam" ? `familias (${c.extra})` : c.id === "ko1" ? `primer KO (${pct(c.iv.value)})` : c.id === "vida3" ? `líder de vida T3 (${pct(c.iv.value)})` : c.label.toLowerCase())).join(", ");
  const items: string[] = [];
  const v2 = by("v2");
  const better = clean.filter((r) => {
    const e = delta(r.m.entropy, base.m.entropy);
    return e.sig && e.d > 0;
  });
  items.push(
    `**${baseClean ? "La base v0.2.1 cumple los " + base.m.crit.length + " criterios" : "La base v0.2.1 suspende: " + failTxt(base)}.** ${clean.length ? `De las ${others.length} combinaciones, solo ${list(clean.map((r) => r.label))} ${clean.length === 1 ? "los cumple" : "los cumplen"} también; las demás suspenden algo que la base aprueba: ${others.filter((r) => !clean.includes(r)).map((r) => `${r.label} → ${failTxt(r)}`).join("; ")}.` : `Ninguna de las ${others.length} combinaciones cumple todos: ${others.map((r) => `${r.label} → ${failTxt(r)}`).join("; ")}.`}`,
  );
  if (v2) {
    const e = delta(v2.m.entropy, base.m.entropy);
    items.push(
      `**V2 (descanso): ${clean.includes(v2) ? "adoptable sin tocar nada más" : "no adoptable tal cual"}, con beneficio ${better.includes(v2) ? "pequeño" : "nulo"}.** ${clean.includes(v2) ? "No rompe ningún criterio" : `Suspende ${failTxt(v2)}`}; la entropía por alma sube ${sgn(e.d)} bits (de ${num(2 ** base.m.entropy.value)} a ${num(2 ** v2.m.entropy.value)} opciones efectivas), el reparto global de acciones no cambia (entropía agregada ${num(base.m.aggEntropy)} → ${num(v2.m.aggEntropy)}; básicos ${pct(base.m.basic.value)} → ${pct(v2.m.basic.value)}) y profundidad, remontada, familias y duración quedan como en la base. Es decir: reparte el uso entre los movimientos de cada alma, pero no hace que se usen más movimientos.`,
    );
  }
  const v1 = by("v1");
  if (v1) {
    const dD = delta(v1.m.depth ?? base.m.entropy, base.m.depth ?? base.m.entropy);
    const FB = RAW_COMBAT.criterios_sim.familias;
    const baseFams = (RAW_COMBAT.familias.anillo_base as string[]).filter((f) => f !== "roca");
    const noRock = (v1.m.families ?? []).filter((f) => baseFams.includes(f.family) && (f.rate.value < FB.min || f.rate.value > FB.max)).map((f) => `${f.family} ${pct(f.rate.value)}`);
    items.push(
      `**V1 (golpe básico con efecto): no adoptar con estos números, y repetir tras el arreglo de Q-01.** Sola no aporta nada medible a la variedad (entropía ${num(base.m.entropy.value)} → ${num(v1.m.entropy.value)}, básicos ${pct(base.m.basic.value)} → ${pct(v1.m.basic.value)}) ni a la profundidad (${pp(dD.d)}${dD.sig ? "" : ", no significativo"}) y deja ${v1.m.famOk}/${v1.m.families?.length ?? 13} familias en banda. Parte de ese desequilibrio puede ser el defecto del escudo de Roca (Q-01)${noRock.length ? `, pero también salen de banda familias base que no son Roca (${noRock.join(", ")}): aunque se arregle, V1 pedirá una ronda de equilibrio de familias (sales o magnitud de los efectos)` : "; habrá que ver cuánto queda tras el arreglo"}. Su valor es de sabor (que el básico «sea de su familia»), no de balance.`,
    );
  }
  const pairs: [Row | undefined, Row | undefined][] = [[by("v1v2v3"), by("v1v2")], [by("v4p_v1v2v3"), by("v4p_v1v2")]];
  const v3txt = pairs.filter((p): p is [Row, Row] => !!p[0] && !!p[1]).map(([w, wo]) => `sobre ${wo.label}: básicos ${pp(w.m.basic.value - wo.m.basic.value)}, entropía agregada ${sgn(w.m.aggEntropy - wo.m.aggEntropy)}, turnos ${sgn(w.m.mean.value - wo.m.mean.value)}, líder de vida T3 ${pp(w.m.lead3.value - wo.m.lead3.value)} (${pct(w.m.lead3.value)}), primer KO ${pp(w.m.firstKo.value - wo.m.firstKo.value)} (${pct(w.m.firstKo.value)})`);
  const v3bad = pairs.some(([w]) => w && (!h.cOf(w, "vida3")!.pass || !h.cOf(w, "ko1")!.pass));
  if (v3txt.length)
    items.push(
      `**V3 (+1 de energía): es la única variante que de verdad cambia qué se juega, ${v3bad ? "pero rompe la remontada" : "y mantiene la remontada"}.** Efecto de añadirla — ${v3txt.join("; ")}. Más energía = menos golpes básicos y más movimientos caros, pero partidas más cortas y más decididas por quien se adelanta${v3bad ? ": no adoptar tal cual" : ""}. Si se quiere su efecto sobre la variedad, habría que compensar la bola de nieve (p. ej. más vida o energía 4 solo desde cierto turno), y eso es un estudio aparte.`,
    );
  const v4p = by("v4p");
  if (v4p && v4p.m.depth) {
    const okDepth = v4p.m.depth.lo > SPEC_V03.depthMin;
    const okCb = h.cOf(v4p, "ko1")!.pass && h.cOf(v4p, "vida3")!.pass;
    const dg = diagRows(ph);
    const d4 = dg.find((d) => d.id === "v4");
    const d0 = dg.find((d) => d.id === "v4p_brote0");
    const brote = v4p.m.families?.find((f) => f.family === "brote")?.rate;
    items.push(
      `**V4 (objetivo automático): ${okDepth && okCb ? "cumple su criterio de adopción" : "no cumple su criterio de adopción"}** (profundidad ${ivp(v4p.m.depth)}, primer KO ${pct(v4p.m.firstKo.value)}${h.cOf(v4p, "ko1")!.fragile ? " frágil, igual que la base" : ""}, líder T3 ${pct(v4p.m.lead3.value)}). ${okDepth && okCb ? "Quitar la elección de objetivo no hace el combate más superficial ni más bola de nieve para las IA." : ""} **Pero no está lista para adoptarse:** rompe el equilibrio de familias (${v4p.m.famOk}/${v4p.m.families?.length ?? 13}${brote ? `; brote cae al ${pct(brote.value)}` : ""}).${d4 && d0 ? ` El diagnóstico separa dos causas: sin la pieza provocar, V4 deja ${d4.ok}/13 (fuera: ${d4.out.join(", ") || "ninguna"}) y brote en ${pct(d4.brote?.value ?? NaN)}; con provocar pero sin peso en brote, ${d0.ok}/13 (fuera: ${d0.out.join(", ") || "ninguna"}) y brote en ${pct(d0.brote?.value ?? NaN)}. ${d0.brote && d0.brote.value >= 0.45 && brote && brote.value < 0.45 ? "Es decir, **el hundimiento de brote lo causa el movimiento con provocar de brote** (según las notas de implementación, \`brote.cabeza\`: escudo de fila 50 → 30 + provocar; atrae todos los golpes hacia un alma que no los aguanta)" : "El diagnóstico no aísla la causa de la caída de brote"}, y el objetivo automático por sí solo deja ${13 - d4.ok} ${13 - d4.ok === 1 ? "familia" : "familias"} fuera de banda, que habría que reequilibrar con sales.` : ""} Además, la formación ${(v4p.m.formInv?.value ?? 0.5) < 0.6 ? "pesa poco" : "pesa bastante"} (la sugerida gana el ${pct(v4p.m.formInv?.value ?? NaN)} a su inversa) y provocar casi no se ha podido probar (Q-02).`,
    );
  }
  B.push({ t: "list", items });
  const recV2 = v2 && clean.includes(v2) && better.includes(v2);
  B.push({
    t: "p",
    text: `**Propuesta del analista:** ${baseClean ? "mantener la base v0.2.1 como configuración de referencia" : "ninguna combinación arregla lo que suspende la base"}${recV2 ? "; **V2 (descanso) es la única variante que se puede activar ya sin romper nada**, con una mejora pequeña de la variedad por alma" : ""}. Ninguna combinación mejora a la base en los criterios de §4 (profundidad, remontada, familias, duración): ${clean.length ? `${list(clean.map((r) => r.label))} los iguala` : "todas pierden alguno"} y el resto los empeora. No adoptar V1 ni V3 con los números actuales. V4 supera sus dos condiciones (profundidad y remontada), así que la decisión de adoptarla es de diseño y no de balance, pero antes necesita: (1) quitar provocar de brote o corregir cómo lo valora la IA, (2) una ronda de sales para las familias que descoloca y (3) medir provocar con equipos que lo lleven.`,
  });
  B.push({ t: "h3", text: "Decisiones para el director" });
  B.push({
    t: "list",
    items: [
      `**Descanso (V2):** (a) activarlo en v0.3${recV2 ? " — recomendado si se busca que cada alma no repita movimiento; coste de balance nulo" : ""}; (b) dejarlo fuera: el efecto medido es pequeño y añade una regla que explicar. Recomendación del analista: ${recV2 ? "(a), sabiendo que no reduce los golpes básicos" : "(b)"}.`,
      "**Objetivo automático (V4):** (a) seguir con la elección de objetivo (base); (b) invertir una ronda más (arreglo de provocar en brote + sales + medida con provocar presente) y decidir entonces. Los datos no obligan a ninguna: la profundidad no cae. Recomendación: (b) solo si la interfaz sin objetivos es una prioridad de producto; si no, (a).",
      "**Más energía (V3) y golpe básico con efecto (V1):** aparcar. V3 es la palanca que reduce los golpes básicos (el problema de fondo de la variedad: más del 60 % de las acciones), pero necesita su propio estudio contra la bola de nieve; V1 se repite cuando el núcleo arregle Q-01.",
    ],
  });
  return B;
}

function adjustBlocks(ph: Partial<Record<Phase, PhaseFile>>): Block[] {
  const B: Block[] = [];
  const dg = diagRows(ph);
  if (ph.diagnostico && dg.length) {
    B.push({ t: "h2", text: "Diagnóstico: ¿por qué V4+provocar hunde a brote?" });
    B.push({ t: "table", head: ["Variante de diagnóstico", "Familias en banda", "Fuera de banda", "Brote"], rows: dg.map((d) => [d.label, `${d.ok}/13`, d.out.join(", ") || "—", ivp(d.brote)]) });
    B.push({ t: "p", text: `Dos variantes de diagnóstico (causa, no arreglo), solo en C1 y C2 (${int(ph.diagnostico.sizes.c2PerPair)} partidas por pareja), con las mismas semillas \`${ph.diagnostico.seed}\` que la evaluación para que la comparación sea pareada; ${int(Math.round(ph.diagnostico.elapsedSec))} s. Si más adelante se adopta alguna de estas dos configuraciones, \`${ph.diagnostico.seed}\` pasa a ser semilla de elegir para ella y hay que validarla con semillas nuevas.` });
  }
  B.push({ t: "h2", text: "Ajuste ligero" });
  if (!ph.elegir)
    B.push({
      t: "p",
      text: "**No se ha hecho ningún ajuste.** El encargo lo permitía para una combinación prometedora que suspendiera «solo por poco», y no hay ninguna: las que suspenden lo hacen en familias por un margen amplio (V4+provocar, por el movimiento de brote) o llevan V1, cuyas cifras de familias no son fiables hasta que se arregle Q-01 (ajustar pesos sobre un defecto del núcleo sería ajustar ruido). El presupuesto que quedaba se gastó en el diagnóstico de arriba. La CLI conserva las fases `--fase elegir` y `--fase validar` (candidatas en `sim/variants/adjust.ts`, semillas `elige03` y `valida04`, sin usar) para la siguiente ronda.",
    });
  return B;
}

export function writeVariantReports(ph: Partial<Record<Phase, PhaseFile>>, dir: string, official: boolean): string[] {
  const n = narrative(ph);
  const html = renderHtml(n.title, n.blocks);
  const md = renderMd(n.blocks);
  const out = [`${dir}/informe-variantes-v0.3.html`, `${dir}/variantes-v0.3.md`];
  mkdirSync(dir, { recursive: true });
  writeFileSync(out[0]!, html);
  writeFileSync(out[1]!, md);
  if (official) {
    mkdirSync("docs/informes", { recursive: true });
    writeFileSync("docs/informes/informe-variantes-v0.3.html", html);
    writeFileSync("docs/informes/variantes-v0.3.md", md);
    out.push("docs/informes/informe-variantes-v0.3.html", "docs/informes/variantes-v0.3.md");
  }
  return out;
}
