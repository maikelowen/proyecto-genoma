/**
 * Informe de combate v0.5 (docs/informes/combate-v0.5.md), generado desde los datos de `sim/out/v05/<modo>/v05.json`.
 * Ninguna cifra ni conclusión está escrita a mano: los umbrales salen de `criterios_sim` de la config y los veredictos
 * son plantillas condicionales sobre los datos.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { criteria, duration, familyRates, num, pct, type ConfigData, type Criterion } from "../v04/analysis.ts";
import { RAW_COMBAT, type Variant } from "../v04/setup.ts";
import { PLAN_B_ID } from "./configs.ts";
import { decodeCodes, indepDelta, pairedDelta, type Delta } from "./stats.ts";
import type { V05File } from "./cli.ts";

const K05 = RAW_COMBAT.criterios_sim.v05 as Record<string, any>;
const K04 = RAW_COMBAT.criterios_sim.v04 as Record<string, any>;
const BASE = "base_E3";

const variantOf = (f: Pick<V05File, "configs">, id: string): Variant => {
  const c = f.configs.find((x) => x.id === id)!;
  return { id, label: id, combat: c.combat, moves: {}, salts: {} };
};
const crit = (cs: readonly Criterion[], id: string): Criterion | undefined => cs.find((c) => c.id === id);
const pp = (x: number, d = 1): string => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(d).replace(".", ",")} pp`;
const ci = (d: Delta): string => `${pp(d.diff)} ± ${(1.96 * d.se * 100).toFixed(1).replace(".", ",")}`;

interface Deltas { primerKo: Delta; lider3: Delta; remontada: Delta; empate: Delta; turnos: Delta }
function deltasVs(data: Record<string, ConfigData>, id: string, ref: string): Deltas {
  const a = decodeCodes(data[id]!.C1!.codes);
  const b = decodeCodes(data[ref]!.C1!.codes);
  return { primerKo: pairedDelta(a.primerKo, b.primerKo), lider3: pairedDelta(a.lider3, b.lider3), remontada: pairedDelta(a.remontada, b.remontada), empate: pairedDelta(a.empate, b.empate), turnos: pairedDelta(a.turnos, b.turnos) };
}

interface Verdict {
  readonly id: string;
  readonly d: Deltas;
  readonly conds: { n: number; text: string; ok: boolean; fragile: boolean }[];
  readonly improves: boolean;
  readonly worsens: boolean;
  readonly label: "mejora" | "neutro" | "empeora";
}

/** §9.3: las cuatro condiciones de "mejora la bola de nieve". Empeora = primer KO sube más de d054_primer_ko_sube_max_pp o remontadas bajan al menos bola_nieve_remontadas_sube_min_pp (lectura simétrica, declarada en el informe). */
function verdictFor(file: Pick<V05File, "configs">, data: Record<string, ConfigData>, id: string): Verdict {
  const d = deltasVs(data, id, BASE);
  const cs = criteria(variantOf(file, id), data[id]!);
  const near = (x: Delta, thr: number): boolean => Math.abs(x.diff - thr) <= 1.96 * x.se;
  const t1 = -K05.bola_nieve_primer_ko_baja_min_pp / 100;
  const t2 = K05.bola_nieve_lider_t3_sube_max_pp / 100;
  const t3 = K05.bola_nieve_remontadas_sube_min_pp / 100;
  const t4 = K05.bola_nieve_empates_sube_max_pp / 100;
  const dur = ["turnos", "p90", "empates"].map((k) => crit(cs, k)).every((c) => c?.pass);
  const conds = [
    { n: 1, text: `primer KO baja ≥ ${K05.bola_nieve_primer_ko_baja_min_pp} pp (Δ ${ci(d.primerKo)})`, ok: d.primerKo.diff <= t1, fragile: near(d.primerKo, t1) },
    { n: 2, text: `líder T3 no sube más de ${K05.bola_nieve_lider_t3_sube_max_pp} pp (Δ ${ci(d.lider3)})`, ok: d.lider3.diff <= t2, fragile: near(d.lider3, t2) },
    { n: 3, text: `remontadas suben ≥ ${K05.bola_nieve_remontadas_sube_min_pp} pp (Δ ${ci(d.remontada)})`, ok: d.remontada.diff >= t3, fragile: near(d.remontada, t3) },
    { n: 4, text: `duración en v04 (media ${K04.turnos_media_min}–${K04.turnos_media_max}, p90 ≤ ${K04.turnos_p90_max}, empates ≤ ${pct(K04.empates_max, 0)}) y empates no suben más de ${K05.bola_nieve_empates_sube_max_pp} pp (Δ ${ci(d.empate)})`, ok: dur && d.empate.diff <= t4, fragile: near(d.empate, t4) },
  ];
  const improves = conds.every((c) => c.ok);
  const worsens = !improves && (d.primerKo.diff > K05.d054_primer_ko_sube_max_pp / 100 || d.remontada.diff <= -t3);
  return { id, d, conds, improves, worsens, label: improves ? "mejora" : worsens ? "empeora" : "neutro" };
}

/** §9.4: ¿hay que correr la 5.ª config? Solo con las 4 primeras medidas. */
export function planBNeeded(data: Record<string, ConfigData>): boolean {
  const file = { configs: Object.keys(data).filter((k) => data[k]!.C1).map((id) => ({ id, sha: "", combat: patchOf(id) })) };
  const vD = verdictFor(file, data, "solo_D053");
  const vA = verdictFor(file, data, "ambas");
  const c = data["ambas"]!.C1!;
  const perStunned = c.stunLastGames ? c.lostStunLast / c.stunLastGames : 0;
  return (!vA.improves && vD.improves) || perStunned > 1.0;
}
function patchOf(id: string): Record<string, unknown> {
  return RAW_COMBAT.escenarios_sim.configs_v05[id] as Record<string, unknown>;
}

const mean = (v: number, n: number): number => (n ? v / n : NaN);

export function writeV05Report(f: V05File, official: boolean): string {
  const ids = f.configs.map((c) => c.id);
  const core = ids.filter((i) => i !== PLAN_B_ID);
  const data = f.data as Record<string, ConfigData>;
  const crits = Object.fromEntries(ids.map((i) => [i, criteria(variantOf(f, i), data[i]!)]));
  const verdicts = core.filter((i) => i !== BASE).map((i) => verdictFor(f, data, i));
  const L: string[] = [];
  const row = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;
  const table = (head: readonly string[], rows: readonly (readonly string[])[]): void => {
    L.push(row(head), row(head.map(() => "---")), ...rows.map(row), "");
  };
  const n1 = data[BASE]!.C1!.n;
  L.push(
    "# Combate v0.5: bola de nieve con D-053 y D-054",
    "",
    `Generado desde los datos por \`npm run sim:v05\` (modo ${f.mode}${official ? "" : ", NO oficial"}). Commit \`${f.commit}\`, huella de \`config/combate.v0.5.json\` \`${f.configSha}\`, semillas \`${f.seed}\`, ${f.threads} hilos, ${f.elapsedSec.toFixed(0)} s.`,
    "",
    `Mismos equipos y la misma semilla de partida en todas las configs (pareado). Escenarios medidos: C1 (${f.sizes.c1} partidas por config), ESPEJO (${f.sizes.mirror}), C2 (${f.sizes.c2PerPair} por pareja de familias, 78 parejas) y profundidad (${f.sizes.depth} partidas, solo en ${f.profIds.join(" y ")}). **No se miden** colocación ni tanque (no son de §9.2). Los Δ van en puntos porcentuales (pp) con ± 1,96 error estándar **pareado** partida a partida; \`frágil\` = ese intervalo cruza el umbral.`,
    "",
    "## Configuraciones",
    "",
  );
  table(["Config", "Claves", "Huella"], f.configs.map((c) => [c.id, Object.entries(c.combat).map(([k, v]) => `${k}=${String(v)}`).join("<br>"), `\`${c.sha}\``]));

  // ---- tabla principal
  const c = (id: string, k: string): Criterion | undefined => crit(crits[id]!, k);
  const val = (id: string, k: string): string => {
    const x = c(id, k);
    return x ? `${x.fmt === "pct" ? pct(x.value) : x.fmt === "int" ? String(Math.round(x.value)) : num(x.value)}${x.pass ? "" : " ✗"}` : "—";
  };
  const rem = (id: string): string => {
    const ob = decodeCodes(data[id]!.C1!.codes).remontada;
    return pct(ob.reduce((s, o) => s + o[0], 0) / ob.reduce((s, o) => s + o[1], 0));
  };
  L.push("## Resultados (criterios de v0.4; ✗ = incumple)", "");
  table(["Métrica", ...ids], [
    ["Primer KO → gana (< " + pct(K04.primer_ko_max, 0) + ")", ...ids.map((i) => val(i, "primer_ko"))],
    ["Líder T3 → gana (< " + pct(K04.lider_t3_max, 0) + ")", ...ids.map((i) => val(i, "lider_t3"))],
    ["Remontadas (gana quien sufrió el 1.º KO)", ...ids.map(rem)],
    [`Turnos medios (${K04.turnos_media_min}–${K04.turnos_media_max})`, ...ids.map((i) => val(i, "turnos"))],
    [`Turnos p90 (≤ ${K04.turnos_p90_max})`, ...ids.map((i) => val(i, "p90"))],
    [`Empates (≤ ${pct(K04.empates_max, 0)})`, ...ids.map((i) => val(i, "empates"))],
    [`% gratis (≤ ${pct(K04.gratis_frac_max, 0)})`, ...ids.map((i) => val(i, "gratis"))],
    [`Pagos distintos por ánima (≥ ${K04.pagos_distintos_por_alma_min})`, ...ids.map((i) => val(i, "pagos"))],
    [`Familias fuera de ${pct(K04.familias_min, 0)}–${pct(K04.familias_max, 0)} (de 13)`, ...ids.map((i) => val(i, "familias"))],
    [`Profundidad (> ${pct(K04.profundidad_min, 0)})`, ...ids.map((i) => val(i, "profundidad"))],
  ]);

  // ---- deltas
  L.push(`## Deltas frente a ${BASE} (C1, n = ${n1}, pareado)`, "");
  table(["Config", "Primer KO", "Líder T3", "Remontadas", "Empates", "Turnos medios"], ids.filter((i) => i !== BASE).map((i) => {
    const d = deltasVs(data, i, BASE);
    return [i, ci(d.primerKo), ci(d.lider3), ci(d.remontada), ci(d.empate), `${d.turnos.diff >= 0 ? "+" : "−"}${Math.abs(d.turnos.diff).toFixed(2).replace(".", ",")} ± ${(1.96 * d.turnos.se).toFixed(2).replace(".", ",")}`];
  }));
  const pr = (id: string) => data[id]!.PROF;
  if (pr(BASE) && pr("ambas")) {
    const d = indepDelta(pr("ambas")!.xWins + 0.5 * pr("ambas")!.draws, pr("ambas")!.n, pr(BASE)!.xWins + 0.5 * pr(BASE)!.draws, pr(BASE)!.n);
    L.push(`Profundidad (búsqueda vs reglas): \`ambas\` ${pct(d.a)} frente a ${pct(d.b)} en ${BASE}; Δ ${ci(d)} (independiente, conservador: no hay pareado partida a partida; n = ${d.n}).`, "");
  }

  // ---- última ánima y energía
  const lastRow = (i: string): string[] => {
    const r = data[i]!.C1!;
    const pm = (r.lastPay1 + 2 * r.lastPay2 + 3 * r.lastPay3) / (r.lastTurns || 1);
    const dist = r.lastTurns ? [r.lastPay0, r.lastPay1, r.lastPay2, r.lastPay3].map((x) => pct(x / r.lastTurns, 0)).join(" / ") : "—";
    return [i, r.lastTurns ? num(pm) : "—", dist, r.lastEnergyN ? num(r.lastEnergySum / r.lastEnergyN) : "—", r.soloReached ? pct(r.soloWon / r.soloReached) : "—", r.seqMulti ? pct(r.seqPrio1 / r.seqMulti, 0) : "—"];
  };
  L.push("## Última ánima (C1)", "", `Rangos informativos: pagos por turno ${K05.ultima_pagos_por_turno_inf.join("–")}, WR de la última ${pct(K05.ultima_wr_inf[0], 0)}–${pct(K05.ultima_wr_inf[1], 0)}. El WR de la última es el de los bandos que llegan a una sola ánima viva (en las configs sin D-053 es el WR de quien queda con una sola ánima, referencia).`, "");
  table(["Config", "Pagos por turno de la última", "Reparto 0/1/2/3 pagos", "Energía al empezar como última", "WR de la última", "Huecos con prioridad 1"], ids.map(lastRow));
  L.push("## Energía perdida por partida (C1)", "", `Rango informativo de la spec: ${K05.energia_perdida_por_partida_inf.join("–")}. "Perdida útil" = excluye la energía del turno final en que cae la última ánima del bando perdedor. Sin D-054 la energía se devuelve (0 en la tabla); la comparación con v0.4 es la columna "KO por partida" por la energía comprometida de las caídas.`, "");
  table(["Config", "Por caer", "Por aturdir", "Total", "De ellas, de últimas ánimas", "Perdida útil (sin el turno en que cae la última del perdedor)", "KO por partida", "Energía perdida por KO caído"], ids.map((i) => {
    const r = data[i]!.C1!;
    return [i, num(mean(r.lostKo, r.n)), num(mean(r.lostStun, r.n)), num(mean(r.lostKo + r.lostStun, r.n)), num(mean(r.lostLast, r.n)), num(mean(r.lostKo + r.lostStun - r.lostFinal, r.n)), num(mean(r.kos, r.n)), r.kos ? num(r.lostKo / r.kos) : "—"];
  }));

  // ---- veredicto
  L.push("## Veredicto: ¿mejora la bola de nieve? (§9.3)", "", `"Mejora" exige las cuatro condiciones. "Empeora" (lectura declarada aquí, la spec solo la fija para D-054): el primer KO sube más de ${K05.d054_primer_ko_sube_max_pp} pp o las remontadas bajan al menos ${K05.bola_nieve_remontadas_sube_min_pp} pp. Si no, "neutro".`, "");
  for (const v of verdicts) {
    L.push(`### ${v.id}: **${v.label.toUpperCase()} la bola de nieve**`, "");
    for (const k of v.conds) L.push(`- ${k.ok ? "Cumple" : "No cumple"} (${k.n}): ${k.text}${k.fragile ? " **frágil**" : ""}`);
    L.push("");
  }
  const vA = verdicts.find((v) => v.id === "ambas")!;
  const v54 = verdicts.find((v) => v.id === "solo_D054")!;
  const prof = pr(BASE) && pr("ambas") ? indepDelta(pr("ambas")!.xWins + 0.5 * pr("ambas")!.draws, pr("ambas")!.n, pr(BASE)!.xWins + 0.5 * pr(BASE)!.draws, pr(BASE)!.n) : null;
  const okKo = v54.d.primerKo.diff <= K05.d054_primer_ko_sube_max_pp / 100;
  L.push(
    "### Lectura específica de D-054",
    "",
    `- Primer KO en \`solo_D054\`: ${ci(v54.d.primerKo)} frente a un máximo de +${K05.d054_primer_ko_sube_max_pp} pp: **${okKo ? "no empeora demasiado" : "empeora demasiado"}**${Math.abs(v54.d.primerKo.diff - K05.d054_primer_ko_sube_max_pp / 100) <= 1.96 * v54.d.primerKo.se ? " (frágil)" : ""}.`,
    prof ? `- Profundidad: ${pp(prof.diff)} frente a ${BASE} (máximo de bajada ${K05.d054_profundidad_baja_max_pp} pp): **${prof.diff >= -K05.d054_profundidad_baja_max_pp / 100 ? "cumple" : "no cumple"}**. Se mide en \`ambas\` (D-054 + D-053), no en \`solo_D054\`.` : "- Profundidad no medida.",
    "",
  );

  // ---- aturdir
  const ca = data["ambas"]!.C1!;
  const perStun = ca.stunLastGames ? ca.lostStunLast / ca.stunLastGames : 0;
  L.push(
    "## Aturdir turno entero a la última (D-056)",
    "",
    `En \`ambas\`, una última ánima aturdida antes de actuar ocurre en ${pct(ca.stunLastGames / ca.n)} de las partidas y le cuesta de media **${num(perStun)}** de energía por partida con última aturdida (${num(mean(ca.lostStunLast, ca.n))} por partida en total; umbral de §9.4: ${num(1, 1)}). Conclusión: aturdir "turno entero" **${perStun > 1.0 ? "castiga demasiado" : "no castiga demasiado"}** al que va perdiendo según ese umbral.`,
    "",
  );
  const pb = data[PLAN_B_ID];
  if (pb) {
    const d = deltasVs(data, PLAN_B_ID, "ambas");
    const rec = d.primerKo.diff <= -K05.plan_b_aturdir_mejora_min_pp / 100;
    L.push(`### Plan B (${PLAN_B_ID}), corrido por cumplirse la condición de §9.4`, "", `Frente a \`ambas\`: primer KO ${ci(d.primerKo)}, líder T3 ${ci(d.lider3)}, remontadas ${ci(d.remontada)}, turnos ${d.turnos.diff.toFixed(2).replace(".", ",")}. Umbral para recomendarlo: baja ≥ ${K05.plan_b_aturdir_mejora_min_pp} pp. **${rec ? 'Se recomienda aturdir = "primero"' : "No se recomienda cambiar aturdir"}**.`, "");
  } else L.push(`No se corre ${PLAN_B_ID}: no se cumple la condición de §9.4 (\`ambas\` ${vA.improves ? "mejora" : "no mejora"} la bola de nieve y la energía perdida por aturdir a últimas no supera 1,0).`, "");

  // ---- resumen de criterios
  L.push("## Criterios v0.4 que cada config incumple", "");
  table(["Config", "Incumple"], ids.map((i) => [i, crits[i]!.filter((x) => !x.informative && !x.pass).map((x) => x.label).join("; ") || "ninguno"]));
  const fam = (i: string) => crit(crits[i]!, "familias")?.detail ?? "";
  L.push("Familias (C2): " + ids.map((i) => `${i}: ${fam(i)}`).join(" · "), "");
  void duration; void familyRates;
  const out = official ? "docs/informes/combate-v0.5.md" : `${"sim/out/v05/rapido"}/combate-v0.5.md`;
  mkdirSync(official ? "docs/informes" : "sim/out/v05/rapido", { recursive: true });
  writeFileSync(out, L.join("\n"));
  return out;
}
