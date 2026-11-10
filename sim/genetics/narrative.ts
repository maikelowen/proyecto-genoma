/**
 * Contenido del informe. Todas las cifras se leen de los resultados
 * (Data); el texto interpretativo está escrito para la ejecución completa
 * y se omite por secciones si falta el barrido correspondiente.
 */
import { RAW } from "./cfg.ts";
import { critShort, critValue, dotChart, histogram, lineChart, nf, pct, verdict, type Block, type Data, type Table } from "./report.ts";
import type { Criterion, ScenarioId } from "./runner.ts";

export interface Narrative {
  readonly title: string;
  readonly blocks: Block[];
}

const P = "principal";
const REC = "recomendada";
const REC_ID = "v02";
const BASE = "C-m2";
const GRID_ORDER = ["A-m1", "A-m2", "A-m3", "B-m1", "B-m2", "B-m3", "C-m1", "C-m2", "C-m3"];
const SLOT: Record<string, number> = { A: 1, B: 2, C: 3 };

function sampleCurve(pts: readonly [number, number][], gens: readonly number[]): [number, number][] {
  return gens.map((g) => pts.find((p) => p[0] === g)).filter((p): p is [number, number] => p !== undefined);
}

export function narrative(d: Data): Narrative {
  const b: Block[] = [];
  const plan = d.plan;
  const has = (exp: string, id?: string): boolean => (id ? d.sum(exp, id) !== undefined : d.of(exp).length > 0);
  const v = (exp: string, id: string, sc: ScenarioId, k: string): number => d.v(exp, id, sc, k);
  const sorp = (id: string): number => v(P, id, "E1", "sorpresa");
  const crits = (exp: string, id: string): Criterion[] => d.crit(exp, id);
  const cv = (exp: string, id: string, cid: string): Criterion | undefined => crits(exp, id).find((c) => c.id === cid);
  const e4 = (exp: string, id: string) => d.sum(exp, id)?.e4;
  const gFinal = plan.e1.gens;
  const e3F = plan.e3.gens;
  const lastWin = `gen ${gFinal - 9}–${gFinal}`;

  b.push({ kind: "h2", text: "Informe de simulación — genética v0.1" });
  b.push({
    kind: "p",
    text: `Proyecto Genoma · Analista de balance · 2026-11-10 · modo ${plan.mode}: ${plan.seeds.length} semillas por configuración, E1/E2 con N = ${plan.e1.N} y ${plan.e1.gens} generaciones, E3 con N = ${plan.e3.N} y ${plan.e3.gens} generaciones, E4 con ${plan.e4.trialsPerSeed * plan.seeds.length} ensayos. ${nf(d.totalChildren() / 1e6, 1)} millones de crías simuladas. Fuente de verdad de los números: CSV en \`sim/out/\` (este informe se genera a partir de los mismos datos).`,
  });

  // -------------------------------------------------------------------------
  // Resumen ejecutivo
  // -------------------------------------------------------------------------
  const full = has(P, "A-m2") && has(P, BASE) && has(P, "B-m2");
  if (full) {
    const mutC = v(P, BASE, "E1", "frac_crias_mutadas");
    const e = e4(P, BASE);
    const repBase = v(P, BASE, "E2", "genedex_repetidas_final10");
    const rec = has(REC, REC_ID) ? crits(REC, REC_ID) : [];
    const recSpec = rec.filter((c) => c.group !== "Deriva (diagnóstico)");
    b.push({ kind: "h2", text: "Resumen ejecutivo" });
    b.push({
      kind: "ol",
      items: [
        `**Sorpresa**: con los pesos del documento (A) el ${pct(sorp("A-m2"))} de las crías muestra en algún locus un rasgo que ningún padre expresaba (objetivo 15–30 %): es casi una lotería. B da ${pct(sorp("B-m2"))} y C ${pct(sorp(BASE))}; **solo C entra en el objetivo**.`,
        `**No se descontrola**: ${d.input.violations} violaciones de invariantes; mutación al 2 % ⇒ ${pct(mutC)} de crías mutadas (objetivo 5–12 %); primera híbrida Vapor en mediana ${nf(e?.median ?? NaN, 0)} crías y p90 ${nf(e?.p90 ?? NaN, 0)} (teórico ≈ 17 / 57); determinismo 100 %.`,
        `**Dos suspensos con causa conocida**: el Genedex se repite demasiado al final (${pct(repBase)} de mutaciones en clave ya vista, máx. 80 %) y la deriva E3a sube la velocidad +${pct(v(P, BASE, "E3a", "delta_20"))} en 20 gen (máx. 30 %), pero solo +${pct(v(P, BASE, "E3a_homo", "delta_20"))} es deriva de valores: el resto es selección de genes recesivos más rápidos.`,
        `**Riesgo no cubierto por los criterios**: las híbridas son absorbentes; en población cerrada son el ${pct(v(P, BASE, "E1", "frac_D_hibrido_final"))} de los D en la gen ${gFinal} (con capturas, ${pct(v(P, BASE, "E2", "frac_D_hibrido_final"))}), y la cría selectiva por velocidad sube la velocidad un ${pct(v("estrategia_velocidad", BASE, "E1", "vel_delta_final"))} y concentra un ${pct(v("estrategia_velocidad", BASE, "E1", "div_maxfrec_D_max"))} de los D en una sola clave.`,
        rec.length
          ? `**Recomendación v0.2**: pesos_D C (0,47/0,025/0,005), mutación 2 % (igual), σ forma 0,15 → 0,25, κ deriva 0,05 → 0,10. Validada en conjunto: ${recSpec.filter((c) => c.pass).length}/${recSpec.length} criterios de la spec aprobados; ${recSpec.filter((c) => !c.pass).map((c) => c.id).join(" y ")} no aprueban (deriva E3a tal como está definida; propongo redefinirla, ver decisiones).`
          : "**Recomendación v0.2**: pesos_D C, mutación 2 % (ejecuta el barrido `recomendada` para validarla).",
      ],
    });
  }

  // -------------------------------------------------------------------------
  // Recomendación
  // -------------------------------------------------------------------------
  if (full && has("forma") && has("deriva") && has("hibrida") && has("pesos_R")) {
    const rep = (id: string): number => v("forma", id, "E2", "genedex_repetidas_final10");
    const homo20 = (id: string): number => v("deriva", id, "E3a_homo", "delta_20");
    const homoF = (id: string): number => v("deriva", id, "E3a_homo", "delta_final");
    const t: Table = {
      head: ["Parámetro", "v0.1", "v0.2", "Dato que lo justifica"],
      rows: [
        ["herencia.pesos_D", "A 0,375/0,094/0,031", "**C 0,47/0,025/0,005**", `Sorpresa E1 gen 1–20 (mutación 2 %): A ${pct(sorp("A-m2"))}, B ${pct(sorp("B-m2"))}, C ${pct(sorp(BASE))}; objetivo 15–30 %. Con C, ${pct(v(P, BASE, "E1", "sorpresa_sin_mutacion"))} viene de recesivos y el resto de mutación.`],
        ["mutacion.prob_por_locus", "0,02", "0,02 (igual)", `1 %: ${pct(v(P, "C-m1", "E1", "frac_crias_mutadas"))} de crías mutadas (< 5 %), Genedex gen 1–10 ${nf(v(P, "C-m1", "E2", "genedex_nuevas_1_10"))}/1000 (< 40) y p90 E4 ${nf(e4(P, "C-m1")?.p90 ?? NaN, 0)} (> 100). 3 %: ${pct(v(P, "C-m3", "E1", "frac_crias_mutadas"))} (techo 12 %) y sorpresa ${pct(sorp("C-m3"))} (techo 30 %), sin margen.`],
        ["mutacion.sigma_forma", "0,15", "**0,25**", `% de mutaciones en clave ya registrada (E2, ${lastWin}): 0,10 → ${pct(rep("C-m2-f0.1"))}, 0,15 → ${pct(rep("C-m2-f0.15"))}, 0,25 → ${pct(rep("C-m2-f0.25"))} (rango 10–80 %). Claves nuevas al final: ${nf(v("forma", "C-m2-f0.25", "E2", "genedex_nuevas_final10"))}/1000 crías.`],
        ["deriva.kappa", "0,05", "**0,10**", `Deriva pura (E3a homocigoto) Δ velocidad gen 20 / gen ${e3F}: κ 0,05 → +${pct(homo20("C-m2-k0.05-s1"))} / +${pct(homoF("C-m2-k0.05-s1"))} (pegado al techo de 30 %); κ 0,10 → +${pct(homo20("C-m2-k0.1-s1"))} / +${pct(homoF("C-m2-k0.1-s1"))} (centrado). Control al azar |Δ| ≤ ${pct(Math.max(...["C-m2-k0.05-s1", "C-m2-k0.1-s1"].map((id) => Math.abs(v("deriva", id, "E3a_control", "delta_final")))))}.`],
        ["deriva.sigma", "1,0", "1,0 (igual)", `Con κ 0,10: σ 0,5 → +${pct(homo20("C-m2-k0.1-s0.5"))}, σ 1,5 → +${pct(homo20("C-m2-k0.1-s1.5"))} en gen 20; 1,0 queda en medio de la banda.`],
        ["herencia.pesos_R", "R0 0,20/0,17/0,13", "R0 (igual)", `Sorpresa idéntica (R0 ${pct(v("pesos_R", "C-m2-R0", "E1", "sorpresa"))}, uniforme ${pct(v("pesos_R", "C-m2-Runi", "E1", "sorpresa"))}, =pesos_D ${pct(v("pesos_R", "C-m2-RigD", "E1", "sorpresa"))}); todas aprueban diversidad. No hay motivo con datos para cambiar.`],
        ["mutacion.prob_hibrida_nueva", "0,5", "0,5 (igual)", `E4 mediana / p90: 0,25 → ${nf(e4("hibrida", "C-m2-h0.25")?.median ?? NaN, 0)} / ${nf(e4("hibrida", "C-m2-h0.25")?.p90 ?? NaN, 0)} (p90 > 100); 0,5 → ${nf(e4("hibrida", "C-m2-h0.5")?.median ?? NaN, 0)} / ${nf(e4("hibrida", "C-m2-h0.5")?.p90 ?? NaN, 0)}; 1,0 → ${nf(e4("hibrida", "C-m2-h1")?.median ?? NaN, 0)} / ${nf(e4("hibrida", "C-m2-h1")?.p90 ?? NaN, 0)} (mediana < 10).`],
      ],
    };
    b.push({ kind: "h2", text: "Recomendación de parámetros para v0.2" });
    b.push({ kind: "table", table: t });
    if (has(REC, REC_ID)) {
      b.push({ kind: "h3", text: "Validación de la combinación recomendada (todas las escenas, mismas semillas)" });
      b.push({ kind: "table", table: critTable(crits(REC, REC_ID)) });
    }
    b.push({ kind: "h3", text: "Decisiones que necesita el dueño del juego" });
    b.push({
      kind: "ol",
      items: [
        `**Frecuencia de sorpresa (pregunta abierta 1 de la spec)**: los datos confirman la predicción. A = ${pct(sorp("A-m2"))}, B = ${pct(sorp("B-m2"))}, C = ${pct(sorp(BASE))}. Opciones: A (lotería), B (sorpresa frecuente, fuera del objetivo), C (controlable). **Recomiendo C.**`,
        `**Redefinir el criterio de deriva E3a**: tal como está, mide deriva + selección de genes recesivos; con cualquier κ/σ del barrido Δ gen 20 queda entre +${pct(Math.min(...d.of("deriva").map((s) => v("deriva", s.variant.id, "E3a", "delta_20"))))} y +${pct(Math.max(...d.of("deriva").map((s) => v("deriva", s.variant.id, "E3a", "delta_20"))))} (máx. 30 %). Opciones: (a) medir con clones homocigotos (D = R1 = R2), que aísla la deriva; (b) mantener E3a y subir el umbral a ≈ 50 %, aceptando que criar por un rasgo da ~+45 % en 20 generaciones; (c) bajar la ventaja reduciendo el techo \`desviacion_max\`. **Recomiendo (a)** con κ 0,10.`,
        `**Híbridas absorbentes**: sin capturas, la fracción de D híbridos crece sin freno (gen ${gFinal}: ${pct(v(P, BASE, "E1", "frac_D_hibrido_final"))}; con la estrategia buscadora, ${pct(v("estrategia_hibridas", BASE, "E1", "frac_D_hibrido_final"))}). En el juego real habrá capturas (E2: ${pct(v(P, BASE, "E2", "frac_D_hibrido_final"))}), pero para el mercado conviene decidir si una híbrida debe poder "perderse": opciones (a) aceptar; (b) bajar \`prob_hibrida_afinidad\` de 0,75 a 0,5 (no simulado aún); (c) añadir un criterio de techo de híbridas en E2. **Recomiendo (a) + (c)** y revisarlo cuando haya economía.`,
      ],
    });
  }

  // -------------------------------------------------------------------------
  // Criterios por configuración
  // -------------------------------------------------------------------------
  const grid = GRID_ORDER.filter((id) => has(P, id));
  if (grid.length) {
    b.push({ kind: "h2", text: "Criterios §10.2 por configuración (barrido principal)" });
    b.push({
      kind: "p",
      text: `Valor = media de ${plan.seeds.length} semillas (E4: ensayos agregados). OK = aprobado, NO = suspendido; * = frágil (el IC 95 % entre semillas cruza el umbral). Configuración = pesos_D (A documento, B, C) y probabilidad de mutación por locus (m1/m2/m3 = 1/2/3 %). La deriva E3a no depende de la mutación (se fuerza a 0). Los criterios "diagnóstico" no son de la spec.`,
    });
    const cols = [...grid, ...(has(REC, REC_ID) ? [REC_ID] : [])];
    const all = cols.map((id) => (id === REC_ID ? crits(REC, id) : crits(P, id)));
    const ids = (all[0] ?? []).map((c) => c.id);
    const rows = ids.map((cid) => {
      const first = (all[0] ?? []).find((c) => c.id === cid) as Criterion;
      return [`${first.label} (${first.threshold})`, ...all.map((cs) => {
        const c = cs.find((x) => x.id === cid);
        return c ? `${critShort(c)} ${c.pass ? "OK" : "NO"}${c.fragile ? "*" : ""}` : "—";
      })];
    });
    rows.push(["**Aprobados (sin diagnóstico)**", ...all.map((cs) => {
      const spec = cs.filter((c) => c.group !== "Deriva (diagnóstico)");
      return `${spec.filter((c) => c.pass).length}/${spec.length}`;
    })]);
    b.push({ kind: "table", table: { head: ["Criterio (umbral)", ...cols], rows, num: cols.map((_, i) => i + 1) } });
    b.push({ kind: "p", text: `Determinismo (global): misma semilla ⇒ mismo hash de población ${d.input.det.rerunHashEqual ? "sí" : "NO"} y mismo CSV ${d.input.det.rerunCsvEqual ? "sí" : "NO"}; semilla distinta ⇒ población distinta ${d.input.det.differentSeedDiffers ? "sí" : "NO"}; barrido pareado 2 % vs 3 %: ${d.input.det.pairedIdentical}/${d.input.det.pairedCompared} crías sin mutación idénticas (${pct(d.input.det.pairedIdentical / d.input.det.pairedCompared)}). **${d.input.det.rerunHashEqual && d.input.det.rerunCsvEqual && d.input.det.pairedIdentical === d.input.det.pairedCompared ? "APROBADO" : "SUSPENSO"}**.` });
  }

  // -------------------------------------------------------------------------
  // Gráficas
  // -------------------------------------------------------------------------
  if (grid.length) {
    const c = RAW["criterios_sim"];
    b.push({ kind: "h2", text: "Gráficas clave" });
    const items = grid.map((id) => ({ label: id, ci: d.m(P, id, "E1", "sorpresa")!, slot: SLOT[id[0] as string] ?? 1 }));
    b.push({
      kind: "chart",
      caption: "Sorpresa por configuración (E1, media gen 1–20, IC 95 %)",
      html: dotChart({ title: "Sorpresa por configuración (E1, gen 1–20)", items, band: [c.sorpresa.min, c.sorpresa.max], bandLabel: "objetivo 15–30 %", xFmt: (x) => pct(x, 0), xLabel: "% de crías con algún D que no tenía ningún padre", note: "Punto = media de semillas; línea = IC 95 %. Subir la mutación añade ≈ 3 puntos por cada 1 %." }),
      fallback: { head: ["Config", "Sorpresa", "IC 95 %", "Solo recesivos (sin mutación)"], rows: items.map((i) => [i.label, pct(i.ci.mean), `${pct(i.ci.lo)}–${pct(i.ci.hi)}`, pct(v(P, i.label, "E1", "sorpresa_sin_mutacion"))]), num: [1, 2, 3] },
    });
    const sIds = ["A-m2", "B-m2", "C-m2"].filter((id) => has(P, id));
    const sSeries = sIds.map((id) => ({ name: `pesos_D ${id[0]} (mut. 2 %)`, slot: SLOT[id[0] as string] ?? 1, pts: d.curve(P, id, "E1", "sorpresa").filter((p) => p[0] >= 1) }));
    const gs = [1, 5, 10, 20, 50, 100, 200, gFinal];
    b.push({
      kind: "chart",
      caption: "Sorpresa por generación (E1)",
      html: lineChart({ title: "Sorpresa por generación (E1, población cerrada)", series: sSeries, xLabel: "generación", yLabel: "% crías con D nuevo", yFmt: (x) => pct(x, 0), band: [c.sorpresa.min, c.sorpresa.max], bandLabel: "objetivo 15–30 %", yMin: 0, note: "La sorpresa es estable en el tiempo: sube 1–2 puntos a medida que la población se diversifica por mutación." }),
      fallback: { head: ["Generación", ...sIds], rows: gs.map((g) => [String(g), ...sSeries.map((s) => pct(s.pts.find((p) => p[0] === g)?.[1] ?? NaN))]), num: [0, 1, 2, 3] },
    });
    const e = e4(P, BASE);
    if (e) {
      b.push({
        kind: "chart",
        caption: `E4: crías hasta el primer gen Vapor (${BASE})`,
        html: histogram({ title: `E4: crías hasta el primer gen Vapor (llama pura × marea pura, mutación 2 %, ${e.n} ensayos)`, counts: e.histogram, binLabel: (i) => (i === 20 ? "200+" : `${i * 10 + 1}`), xLabel: "crías hasta el primer gen Vapor (cubetas de 10)", marks: [{ x: e.median, label: `mediana ${nf(e.median, 0)}` }, { x: e.p90, label: `p90 ${nf(e.p90, 0)}` }], note: `Criterio: mediana 10–40, p90 ≤ 100. La primera CRIATURA de familia Vapor (necesita ≥ 2 D Vapor) tarda mucho más: mediana ${nf(e.creatureMedian, 0)} crías en ${e.creatureN} ensayos (${e.creatureCensored} sin aparecer antes de ${plan.e4.creatureCap}).` }),
        fallback: { head: ["Mutación", "Mediana", "p90", "Mediana 1.ª criatura Vapor", "Censurados"], rows: ["C-m1", "C-m2", "C-m3"].filter((id) => e4(P, id)).map((id) => { const x = e4(P, id)!; return [id, nf(x.median, 0), nf(x.p90, 0), nf(x.creatureMedian, 0), `${x.creatureCensored}/${x.creatureN}`]; }), num: [1, 2, 3] },
      });
    }
    if (has("forma")) {
      const fIds = ["C-m2-f0.1", "C-m2-f0.15", "C-m2-f0.25"];
      const fSeries = fIds.map((id, i) => ({ name: `σ forma ${id.split("-f")[1]}`, slot: i + 1, pts: d.curve("forma", id, "E2", "genedex_total") }));
      b.push({
        kind: "chart",
        caption: "Tamaño del Genedex (E2) según σ forma",
        html: lineChart({ title: "Tamaño del Genedex por generación (E2, con capturas)", series: fSeries, xLabel: "generación", yLabel: "claves mutadas registradas", yFmt: (x) => nf(x, 0), yMin: 0, note: `Una σ de forma mayor reparte las mutaciones en más firmas: menos redescubrimientos (${lastWin}: ${fIds.map((id) => `${id.split("-f")[1]} → ${pct(v("forma", id, "E2", "genedex_repetidas_final10"))}`).join(", ")}). Espacio total: 32.500 claves.` }),
        fallback: { head: ["σ forma", "Claves nuevas/1000 (gen 1–10)", `Claves nuevas/1000 (${lastWin})`, `% repetidas (${lastWin})`, `Genedex gen ${gFinal}`], rows: fIds.map((id) => [id.split("-f")[1] as string, nf(v("forma", id, "E2", "genedex_nuevas_1_10")), nf(v("forma", id, "E2", "genedex_nuevas_final10")), pct(v("forma", id, "E2", "genedex_repetidas_final10")), nf(v("forma", id, "E2", "genedex_final"), 0)]), num: [1, 2, 3, 4] },
      });
    }
    const hSeries = [
      { name: `E1 cerrada, al azar (${BASE})`, slot: 1, pts: d.curve(P, BASE, "E1", "frac_D_hibrido") },
      { name: `E2 con capturas (${BASE})`, slot: 2, pts: d.curve(P, BASE, "E2", "frac_D_hibrido") },
      ...(has("estrategia_hibridas", BASE) ? [{ name: "E1 buscador de híbridas", slot: 3, pts: d.curve("estrategia_hibridas", BASE, "E1", "frac_D_hibrido") }] : []),
    ].filter((s) => s.pts.length);
    b.push({
      kind: "chart",
      caption: "Fracción de genes D híbridos en la población",
      html: lineChart({ title: "Fracción de genes D híbridos (las híbridas son absorbentes)", series: hSeries, xLabel: "generación", yLabel: "% de D de familia híbrida", yFmt: (x) => pct(x, 0), yMin: 0 }),
      fallback: { head: ["Generación", ...hSeries.map((s) => s.name)], rows: gs.map((g) => [String(g), ...hSeries.map((s) => pct(s.pts.find((p) => p[0] === g)?.[1] ?? NaN))]), num: hSeries.map((_, i) => i).concat([hSeries.length]) },
    });
    const dSeries = [
      { name: "E3a spec (κ 0,05)", slot: 1, pts: d.curveRel(P, BASE, "E3a", "vel_total_media") },
      { name: "E3a homocigoto (κ 0,05)", slot: 2, pts: d.curveRel(P, BASE, "E3a_homo", "vel_total_media") },
      ...(has(REC, REC_ID) ? [{ name: "E3a homocigoto (κ 0,10, v0.2)", slot: 3, pts: d.curveRel(REC, REC_ID, "E3a_homo", "vel_total_media") }] : []),
      { name: "control al azar", slot: 4, dashed: true, pts: d.curveRel(P, BASE, "E3a_control", "vel_total_media") },
    ].filter((s) => s.pts.length);
    b.push({
      kind: "chart",
      caption: "Deriva bajo selección por velocidad (E3a)",
      html: lineChart({ title: "Velocidad total media vs gen 0 bajo selección (E3a, 100 de 250 crías)", series: dSeries, xLabel: "generación", yLabel: "Δ velocidad total", yFmt: (x) => pct(x, 0), band: [c.deriva.gen20_min, c.deriva.gen20_max], bandLabel: "objetivo gen 20: +5…+30 %", note: "E3a spec usa clones heterocigotos: la selección también elige el tipo de gen más rápido entre D/R1/R2 (cambia el ancla). El homocigoto aísla la deriva de valores, que satura en el techo ±10 por gen." }),
      fallback: { head: ["Generación", ...dSeries.map((s) => s.name)], rows: [0, 5, 10, 20, 50, e3F].map((g) => [String(g), ...dSeries.map((s) => pct(s.pts.find((p) => p[0] === g)?.[1] ?? NaN))]), num: dSeries.map((_, i) => i).concat([dSeries.length]) },
    });
  }

  // -------------------------------------------------------------------------
  // Barridos secundarios
  // -------------------------------------------------------------------------
  if (has("deriva") || has("pesos_R") || d.of("estrategia_velocidad").length || has("hibrida")) b.push({ kind: "h2", text: "Barridos secundarios" });
  const strat = [
    ["azar", P, "E1"],
    ["velocidad", "estrategia_velocidad", "E1"],
    ["purista", "estrategia_purista", "E1"],
    ["hibridas", "estrategia_hibridas", "E1"],
  ] as const;
  const stratIds = ["A-m2", BASE].filter((id) => has("estrategia_velocidad", id));
  if (stratIds.length) {
    const rows: string[][] = [];
    for (const id of stratIds)
      for (const [name, exp] of strat) {
        if (!has(exp, id)) continue;
        const dc = cv(exp, id, "div_maxfrec");
        rows.push([id, name, pct(v(exp, id, "E1", "sorpresa")), nf(v(exp, id, "E1", "div_distintas_min")), nf(v(exp, id, "E1", "div_H_D_min"), 2), `${pct(v(exp, id, "E1", "div_maxfrec_D_max"))} ${dc?.pass ? "OK" : "NO"}`, pct(v(exp, id, "E1", "frac_D_hibrido_final")), `${v(exp, id, "E1", "vel_delta_final") >= 0 ? "+" : ""}${pct(v(exp, id, "E1", "vel_delta_final"))}`, nf(v(exp, id, "E1", "genedex_final"), 0)]);
      }
    b.push({ kind: "h3", text: `Estrategias de cría (E1, ${plan.e1.gens} generaciones)` });
    b.push({ kind: "table", table: { head: ["Config", "Estrategia", "Sorpresa gen 1–20", `Mín. claves/locus gen ${gFinal}`, "Mín. H_D (bits)", "Máx. clave en D (≤ 40 %)", "D híbridos", "Δ velocidad total", "Genedex"], rows, num: [2, 3, 4, 5, 6, 7, 8] } });
    b.push({ kind: "p", text: "Velocidad: élite del 40 % más rápido, apareada al azar dentro de la élite; el límite de 5 crías obliga a usar 200 padres distintos por generación. Purista: solo cruza criaturas de la misma familia. Buscador de híbridas: elige pareja (entre 50 candidatos) que maximice loci con combinación híbrida. Ninguna estrategia necesitó parejas de relleno." });
  }
  if (has("pesos_R")) {
    const ids = d.of("pesos_R").map((s) => s.variant.id);
    b.push({ kind: "h3", text: `pesos_R (base ${BASE}, E1)` });
    b.push({ kind: "table", table: { head: ["Config", "Sorpresa", "Mín. claves/locus", "Mín. H_D", "Máx. clave en D", "D híbridos gen final"], rows: ids.map((id) => [id, pct(v("pesos_R", id, "E1", "sorpresa")), nf(v("pesos_R", id, "E1", "div_distintas_min")), nf(v("pesos_R", id, "E1", "div_H_D_min"), 2), pct(v("pesos_R", id, "E1", "div_maxfrec_D_max")), pct(v("pesos_R", id, "E1", "frac_D_hibrido_final"))]), num: [1, 2, 3, 4, 5] } });
  }
  if (has("deriva")) {
    const ids = d.of("deriva").map((s) => s.variant.id);
    b.push({ kind: "h3", text: `Deriva κ × σ (base ${BASE}, mutación 0)` });
    b.push({ kind: "table", table: { head: ["κ / σ", "E3a Δ gen 20", `E3a Δ gen ${e3F}`, "Homocigoto Δ gen 20", `Homocigoto Δ gen ${e3F}`, "Control |Δ|"], rows: ids.map((id) => [id.replace(`${BASE}-`, ""), pct(v("deriva", id, "E3a", "delta_20")), pct(v("deriva", id, "E3a", "delta_final")), pct(v("deriva", id, "E3a_homo", "delta_20")), pct(v("deriva", id, "E3a_homo", "delta_final")), pct(Math.abs(v("deriva", id, "E3a_control", "delta_final")))]), num: [1, 2, 3, 4, 5] } });
    const c3 = RAW["criterios_sim"]["deriva"];
    const okHomo = ids.filter((id) => { const a = v("deriva", id, "E3a_homo", "delta_20"); return a >= c3.gen20_min && a <= c3.gen20_max && v("deriva", id, "E3a_homo", "delta_final") <= c3.gen100_max; });
    const okSpec = ids.filter((id) => { const a = v("deriva", id, "E3a", "delta_20"); return a >= c3.gen20_min && a <= c3.gen20_max && v("deriva", id, "E3a", "delta_final") <= c3.gen100_max; });
    b.push({ kind: "p", text: `Criterio: Δ gen 20 entre +5 % y +30 %; Δ gen 100 ≤ +40 %; control |Δ| ≤ 5 %. E3a tal como está definida aprueban: ${okSpec.length ? okSpec.map((id) => id.replace(`${BASE}-`, "")).join(", ") : "ninguna combinación"}. En homocigoto aprueban: ${okHomo.map((id) => id.replace(`${BASE}-`, "")).join(", ") || "ninguna combinación"}.` });
  }
  if (has("hibrida")) {
    const ids = d.of("hibrida").map((s) => s.variant.id);
    b.push({ kind: "h3", text: `Probabilidad de híbrida nueva (base ${BASE})` });
    b.push({ kind: "table", table: { head: ["Config", "E4 mediana", "E4 p90", "1.ª criatura Vapor (mediana)", "D híbridos E2", "Híbridas vistas E2"], rows: ids.map((id) => { const x = e4("hibrida", id); return [id.replace(`${BASE}-`, ""), nf(x?.median ?? NaN, 0), nf(x?.p90 ?? NaN, 0), `${nf(x?.creatureMedian ?? NaN, 0)} (${x?.creatureCensored}/${x?.creatureN} cens.)`, pct(v("hibrida", id, "E2", "frac_D_hibrido_final")), nf(v("hibrida", id, "E2", "hibridas_vistas"), 0)]; }), num: [1, 2, 3, 4, 5] } });
  }

  // -------------------------------------------------------------------------
  // Hallazgos
  // -------------------------------------------------------------------------
  if (full) {
    const famRows = [...RAW["familias"]["base"], ...RAW["familias"]["hibridas"].map((h: { id: string }) => h.id)] as string[];
    b.push({ kind: "h2", text: "Hallazgos" });
    b.push({
      kind: "ol",
      items: [
        `**La predicción analítica de la spec se cumple**: sorpresa A ${pct(sorp("A-m2"))} (predicho 60–65 %), B ${pct(sorp("B-m2"))} (≈ 33 %), C ${pct(sorp(BASE))} (≈ 22 %). La diferencia en B y C es la mutación: sin contarla, C da ${pct(v(P, BASE, "E1", "sorpresa_sin_mutacion"))}.`,
        `**Por locus la sorpresa es pareja** (${BASE}: cabeza ${pct(v(P, BASE, "E1", "sorpresa_cabeza"))}, cuerpo ${pct(v(P, BASE, "E1", "sorpresa_cuerpo"))}, extremidades ${pct(v(P, BASE, "E1", "sorpresa_extremidades"))}, cola ${pct(v(P, BASE, "E1", "sorpresa_cola"))}), y estable en el tiempo (gen ${gFinal - 9}–${gFinal}: ${pct(v(P, BASE, "E1", "sorpresa_final10"))}).`,
        `**La diversidad no colapsa: crece**. En E1 (${BASE}) la mínima nº de claves por locus en la gen ${gFinal} es ${nf(v(P, BASE, "E1", "div_distintas_min"))} (umbral 12) y la entropía es ${pct(v(P, BASE, "E1", "div_H_ratio_min"))} de la inicial. El criterio "H ≥ 50 % de gen 0" se cumple con mucha holgura; el riesgo real es el contrario (inflación), que ningún criterio mide.`,
        `**Mutación conforme a la teoría**: ${nf(v(P, BASE, "E1", "mut_por_1000"))} mutaciones/1000 crías con p = 2 % (esperado 80) y ${pct(v(P, BASE, "E1", "frac_crias_mutadas"))} de crías con alguna (teórico 7,8 %). Un ${pct(v(P, BASE, "E1", "frac_mut_catalogo"))} de las mutaciones cae en una clave del catálogo base (no entra en Genedex).`,
        `**Pregunta abierta del núcleo (nota 9)**: solo el ${pct(v(P, BASE, "E1", "frac_mut_coincide_R"), 2)} de las mutaciones produce una clave igual a un R1/R2 de algún padre (rango en el barrido: ${pct(Math.min(...grid.map((id) => v(P, id, "E1", "frac_mut_coincide_R"))), 2)}–${pct(Math.max(...grid.map((id) => v(P, id, "E1", "frac_mut_coincide_R"))), 2)}). Es irrelevante para el balance: **recomiendo no añadir la exclusión** (complica §4.4 sin efecto medible).`,
        `**Híbridas absorbentes**: en E1 al azar la fracción de D híbridos llega al ${pct(v(P, BASE, "E1", "frac_D_hibrido_final"))} en la gen ${gFinal} (A-m2: ${pct(v(P, "A-m2", "E1", "frac_D_hibrido_final"))}; C-m3: ${pct(v(P, "C-m3", "E1", "frac_D_hibrido_final"))}). Causa: híbrida × componente vuelve a híbrida el 75 % y nunca se crea una base desde dos híbridas iguales. Con 10 % de capturas por generación se estabiliza en ${pct(v(P, BASE, "E2", "frac_D_hibrido_final"))}.`,
        `**La primera criatura híbrida es mucho más difícil que el primer gen híbrido**: con padres puros (F1) hacen falta ≥ 2 loci Vapor; mediana ${nf(e4(P, BASE)?.creatureMedian ?? NaN, 0)} crías (${e4(P, BASE)?.creatureCensored}/${e4(P, BASE)?.creatureN} ensayos sin conseguirla en ${plan.e4.creatureCap}). El camino del jugador es criar las crías con gen Vapor entre sí o en retrocruce, algo que el diseño ya favorece; conviene que la UI lo enseñe.`,
        `**Criar por velocidad es muy rentable y concentra genes**: con la élite del 40 % durante ${gFinal} generaciones la velocidad total sube ${pct(v("estrategia_velocidad", BASE, "E1", "vel_delta_final"))} (el ancla se redistribuye por mutación hacia velocidad; Σancla = 90 lo paga en potencia/resistencia) y la clave más frecuente ocupa el ${pct(v("estrategia_velocidad", BASE, "E1", "div_maxfrec_D_max"))} de los D (umbral 40 %). En E3b (selección fuerte, mutación activa) Δ velocidad en ${e3F} generaciones = +${pct(v(P, BASE, "E3b", "delta_final"))}. Los especialistas extremos son alcanzables: el spec de combate debe contarlo.`,
        `**Distribución de familias** (criaturas, ${BASE}, gen ${gFinal}). E1: ${famRows.map((f) => `${f} ${pct(v(P, BASE, "E1", `fam_${f}`), 0)}`).join(", ")}.`,
      ],
    });
  }

  // -------------------------------------------------------------------------
  // Anomalías
  // -------------------------------------------------------------------------
  b.push({ kind: "h2", text: "Anomalías, fallos y limitaciones" });
  b.push({
    kind: "ul",
    items: [
      `**Núcleo: sin fallos encontrados.** ${d.input.violations} violaciones de invariantes en todas las escenas; mismo hash con la misma semilla; ${d.input.det.pairedIdentical}/${d.input.det.pairedCompared} crías idénticas en el pareado 2 % vs 3 %; breedingBlocker respetado (las estrategias nunca necesitaron parejas de relleno).`,
      "**Criterio E3a mal planteado** (no es un fallo del núcleo): los clones de E3a son heterocigotos, así que la selección elige también genes recesivos con más ancla de velocidad. El diagnóstico homocigoto (`E3a_homo`, no está en la spec) lo separa.",
      "**Criterio de Genedex sensible al tamaño**: el % de repetidas al final depende de N y del nº de generaciones; con miles de jugadores se saturará antes. Revisarlo cuando haya simulador de economía.",
      "**Criterios que no detectan inflación**: diversidad y Genedex solo miden colapso; no hay techo para la fracción de híbridas ni para la velocidad alcanzable por selección.",
      "**Mutación al 1 %**: suspende tasa (5–12 %), Genedex gen 1–10 (≥ 40) y p90 de E4 por construcción; los umbrales de la spec están pensados para 2 %.",
      `**Limitaciones del modelo**: generaciones discretas (las crías reemplazan a todos los padres, N fijo); ${plan.seeds.length} semillas por configuración (IC 95 % con t de Student); la búsqueda de la primera criatura Vapor usa ${plan.e4.creatureTrials} ensayos por semilla con tope ${plan.e4.creatureCap} (mediana con censura por la derecha); sin economía ni jugadores.`,
    ],
  });

  // -------------------------------------------------------------------------
  // Método y reproducción
  // -------------------------------------------------------------------------
  b.push({ kind: "h2", text: "Método" });
  b.push({
    kind: "ul",
    items: [
      "Escenarios de la spec §10.1 sin cambios: E1 cerrada (barajar, parejas consecutivas, 2 crías/pareja, las crías sustituyen a la generación anterior); E2 = E1 + 10 % de la población sustituida al azar por salvajes nuevos tras cada generación; E3a 100 clones, mutación 0, 50 parejas × 5 crías, sobreviven las 100 de mayor velocidad total (control: 100 al azar); E3b igual con población salvaje y mutación activa; E4 llama pura × marea pura, pareja nueva cada 5 crías.",
      "Sorpresa: % de crías con algún locus cuyo D tiene una clave distinta de los D de ambos padres (incluye mutaciones). Diversidad: claves distintas y entropía de Shannon por locus (todos los slots y solo D); se informa el peor locus. Genedex: claves nuevas por 1000 crías y % de mutaciones (fuera del catálogo) que caen en una clave ya registrada.",
      "Azar: tres flujos por semilla (`|cria` solo para breed, `|sim` para barajados y selección, `|salvaje` para salvajes), así cambiar la mutación no desalinea la estrategia y los barridos son pareados. Ejecuciones con idéntica configuración efectiva se calculan una vez y se reutilizan.",
      "Agregación: media entre semillas e IC 95 % (t de Student). Un criterio se aprueba si la media cumple el umbral; se marca frágil si el IC lo cruza.",
    ],
  });
  b.push({ kind: "h2", text: "Cómo reproducirlo" });
  b.push({
    kind: "ul",
    items: [
      "`npm run sim -- --quick` (< 30 s, N = 200, 40 gen, 2 semillas) · `npm run sim` (completo, ≈ 7 min con 2 hilos) · `npm run sim -- --help` para filtros (`--barrido`, `--config`, `--escenario`, `--estrategia`, `--semillas`, `--semilla`).",
      "Salida: `sim/out/<modo>/<barrido>/<escenario>__<config>.csv` (una fila por generación y semilla; E4 una fila por ensayo), `resumen-criterios.csv`, `resumen.json`, `hashes.sha256`. El informe HTML completo es `sim/out/informe-genetica-v0.1.html` y este Markdown `docs/informes/genetica-v0.1.md`.",
      `Esta ejecución: ${plan.seeds.join(", ")}; ${nf(d.input.elapsedSec, 0)} s.`,
      "Test de determinismo: `sim/genetics/determinism.test.ts` (incluido en `npm test`).",
    ],
  });
  return { title: "Proyecto Genoma — Informe de genética v0.1", blocks: b };
}

function critTable(cs: readonly Criterion[]): Table {
  return {
    head: ["Grupo", "Criterio", "Umbral", "Valor [IC 95 %]", "Semillas", "Resultado"],
    rows: cs.map((c) => [c.group, c.label, c.threshold, critValue(c), c.seedsPass ? `${c.seedsPass[0]}/${c.seedsPass[1]}` : "", verdict(c)]),
    num: [3, 4],
  };
}

export { sampleCurve };
