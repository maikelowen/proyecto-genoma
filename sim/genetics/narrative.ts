/**
 * Contenido del informe v0.2. Regla (QA V-02, V-04): ninguna cifra,
 * etiqueta ni conclusión escrita a mano. Las cifras salen de los resultados;
 * la configuración (κ incluido), del JSON; y cada conclusión es una
 * plantilla condicional sobre los datos (si cambian, cambia la frase).
 * Única excepción: las cifras de v0.1 de la tabla comparativa, citadas
 * con su fuente porque el núcleo v0.1 ya no se puede ejecutar.
 */
import { RAW } from "./cfg.ts";
import { critValue, histogram, lineChart, nf, pct, provenance, verdict, type Block, type Data, type Table } from "./report.ts";
import { meanCI, type MeanCI } from "./stats.ts";
import { defaultKappa, USED_SEED_PREFIXES, type Criterion, type ScenarioId } from "./runner.ts";

export interface Narrative {
  readonly title: string;
  readonly blocks: Block[];
}

const X = "v02";
const REF = "referencia_kappa";
const LOCI = ["cabeza", "cuerpo", "extremidades", "cola"];
const MAXCOLS = LOCI.map((L) => `maxfrec_D_${L}`);
const CR = RAW["criterios_sim"];
const MONO_MAX: number = CR.monocultivo_estrategia.max_frecuencia_identidad_D;
const TRAJ_GENS = [20, 50, 100, 300];

/** Cifras citadas de `docs/informes/genetica-v0.1.md` (commit 42d37a5) y de la revisión QA S-01. */
const V01_SOURCE = "informe v0.1 (docs/informes/genetica-v0.1.md, commit 42d37a5; mediana de criatura corregida por QA S-01)";
const V01 = { sorpresa: 0.265, fracMut: 0.078, dexRep: 0.643, e4Gen: "18 / 58", e4Cri: "≈ 1500", hibD_E1: 0.599, hibD_E2: 0.028, monoMax: 0.406, monoHD: 2.81 };

const sgn = (x: number, d = 2): string => `${x >= 0 ? "+" : ""}${nf(x, d)}`;
const kStr = (k: number): string => String(k).replace(".", ",");
const ciPct = (c: MeanCI): string => `${pct(c.mean)} [${pct(c.lo)}; ${pct(c.hi)}]`;
const ciPts = (c: MeanCI): string => `${sgn(c.mean)} [${sgn(c.lo)}; ${sgn(c.hi)}]`;
const list = (xs: readonly string[]): string => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

export function narrative(d: Data): Narrative {
  const b: Block[] = [];
  const plan = d.plan;
  const prov = provenance();
  const k0 = defaultKappa();
  const has = (exp: string, id: string): boolean => d.sum(exp, id) !== undefined;
  const v = (exp: string, id: string, sc: ScenarioId, k: string): number => d.v(exp, id, sc, k);
  const m = (exp: string, id: string, sc: ScenarioId, k: string): MeanCI | undefined => d.m(exp, id, sc, k);
  const get = (exp: string, id: string, cid: string): Criterion | undefined => d.crit(exp, id).find((x) => x.id === cid);
  const seedsOk = (cr?: Criterion): string => (cr?.seedsPass ? `${cr.seedsPass[0]}/${cr.seedsPass[1]}` : "—");
  const gF = plan.e1.gens;
  const e3F = plan.e3.gens;

  b.push({ kind: "h2", text: `Informe de simulación — genética v0.2 (κ ${kStr(k0)}, revalidación con semillas nuevas)` });
  b.push({
    kind: "p",
    text: `Generado por \`sim/genetics\` desde el commit \`${prov.commit}\` (más los cambios locales que hubiera), con \`config/genetica.v0.2.json\` (sha256 \`${prov.configSha}…\`, \`deriva.kappa\` = ${kStr(k0)} leído del JSON). Modo ${plan.mode}. Semillas \`${plan.seeds[0]}\`…\`${plan.seeds[plan.seeds.length - 1]}\` (${plan.seeds.length} por escenario; E5 con ${plan.e5Seeds.length}). Con ellas **no se ha elegido nada**; las usadas para elegir fueron ${USED_SEED_PREFIXES.map((p) => `\`${p}-*\``).join(" y ")}. N = ${plan.e1.N} y ${gF} generaciones en E1/E2/E5; N = ${plan.e3.N} y ${e3F} en E3; E4 con ${(d.sum(X, X)?.e4?.n ?? 0).toLocaleString("es")} ensayos.`,
  });

  if (!has(X, X)) {
    b.push({ kind: "p", text: "Ejecución parcial: falta el barrido `v02`; solo se muestran tablas de criterios." });
    for (const s of d.input.summaries) {
      b.push({ kind: "h3", text: `${s.experiment} / ${s.variant.id}` });
      b.push({ kind: "table", table: critTable(d.crit(s.experiment, s.variant.id)) });
    }
    return { title: "Proyecto Genoma — Informe de genética v0.2", blocks: b };
  }

  // ---------------------------------------------------------------- datos
  const crits = d.crit(X, X);
  const spec = crits.filter((x) => !x.informative);
  const failed = spec.filter((x) => !x.pass);
  const fragile = spec.filter((x) => x.fragile);
  const e4 = d.sum(X, X)?.e4;
  const mono = get(X, X, "mono_maxfrec");
  const monoHD = get(X, X, "mono_H_D");
  const monoCI = m(X, X, "E5", "div_maxfrec_D_max");
  const refs = d.of(REF).map((s) => s.variant);
  const kOf = (id: string): number => (id === X ? k0 : Number(id.replace("kappa", "")));
  const kVariants: { exp: string; id: string; k: number }[] = [{ exp: X, id: X, k: k0 }, ...refs.map((r) => ({ exp: REF, id: r.id, k: kOf(r.id) }))].sort((a, b2) => b2.k - a.k);
  const traj = kVariants.map((kv) => ({
    ...kv,
    at: TRAJ_GENS.filter((g) => g <= gF).map((g) => {
      const xs = d.seedMaxAt(kv.exp, kv.id, "E5", g, MAXCOLS);
      return { g, ci: meanCI(xs), over: xs.filter((x) => x > MONO_MAX).length, n: xs.length };
    }),
  }));
  const early = TRAJ_GENS.filter((g) => g <= Math.min(50, gF));
  const gEarly = early[early.length - 1] ?? 20;
  const meanAt = (t: (typeof traj)[number], g: number): number => t.at.find((a) => a.g === g)?.ci.mean ?? NaN;
  const spread = (g: number): number => Math.max(...traj.map((t) => meanAt(t, g))) - Math.min(...traj.map((t) => meanAt(t, g)));
  const earlyAll = traj.length > 0 && traj.every((t) => meanAt(t, gEarly) > MONO_MAX);
  const recoveryByK = traj.length > 1 && spread(gF) > spread(gEarly) + 0.05;
  const monotoneK = traj.length > 1 && traj.every((t, i) => i === 0 || meanAt(t, gF) <= meanAt(traj[i - 1]!, gF));
  const qDelta = m(X, X, "E5", "calidad_delta_final");

  // ---------------------------------------------------------------- resumen
  b.push({ kind: "h2", text: "Resumen ejecutivo" });
  const s1 = failed.length === 0
    ? `**κ ${kStr(k0)} aprueba con semillas nuevas: ${spec.length}/${spec.length} criterios de §10.2**${fragile.length ? `, aunque ${list(fragile.map((x) => `\`${x.id}\``))} ${fragile.length === 1 ? "es frágil" : "son frágiles"} (el IC 95 % cruza el umbral)` : ", ninguno frágil"}.`
    : `**κ ${kStr(k0)} no aprueba entero con semillas nuevas: ${spec.length - failed.length}/${spec.length} criterios de §10.2**; suspende ${list(failed.map((x) => `\`${x.id}\``))}${fragile.length ? `; frágiles: ${list(fragile.map((x) => `\`${x.id}\``))}` : ""}.`;
  const s2 = monoCI && mono
    ? `**Monocultivo E5 (gen ${gF}, ${monoCI.n} semillas)**: clave más común ${ciPct(monoCI)} de los D en el peor locus (umbral ≤ ${pct(MONO_MAX, 0)}): ${mono.pass ? (mono.fragile ? "aprueba por la media, pero el intervalo cruza el umbral" : "aprueba con margen") : mono.fragile ? "suspende por la media, con el intervalo a ambos lados del umbral" : "suspende"}; cumplen ${seedsOk(mono)} semillas. H_D ${nf(monoHD?.value ?? NaN, 2)} bits (${monoHD?.pass ? "OK" : "NO"}; ${seedsOk(monoHD)}).`
    : "";
  const s3 = traj.length
    ? `**Trayectoria del monocultivo**: ${earlyAll ? `la convergencia es temprana y no depende de κ: en la gen ${gEarly}, con todos los κ simulados (${list(traj.map((t) => kStr(t.k)))}), la clave más común ya supera el ${pct(MONO_MAX, 0)} (${list(traj.map((t) => pct(meanAt(t, gEarly))))})` : `en la gen ${gEarly} la clave más común está en ${list(traj.map((t) => `${pct(meanAt(t, gEarly))} (κ ${kStr(t.k)})`))}`}. ${recoveryByK ? `κ solo decide cuánto se recupera después: en la gen ${gF} queda en ${list(traj.map((t) => `${pct(meanAt(t, gF))} (κ ${kStr(t.k)})`))}${monotoneK ? "; cuanto menor es κ, mayor es la recuperación" : ""}.` : `En la gen ${gF} las diferencias entre κ son pequeñas (${pct(spread(gF))}).`}`
    : "";
  const cri = get(X, X, "e4_cri_med");
  const s4 = `**Resto**: sorpresa ${pct(get(X, X, "sorpresa")?.value ?? NaN)}; primera criatura Vapor en mediana ${nf(e4?.creature.median ?? NaN, 0)} y p90 ${nf(e4?.creature.p90 ?? NaN, 0)} (${cri?.pass && get(X, X, "e4_cri_p90")?.pass ? "aprueba" : "suspende"}); con capturas, ${pct(v(X, X, "E2", "frac_D_hibrido_final"))} de D híbridos (${get(X, X, "hib_D")?.pass && get(X, X, "hib_cri")?.pass ? "aprueba" : "suspende"}); deriva E3a ${sgn(v(X, X, "E3a", "delta_pts_20"))} / ${sgn(v(X, X, "E3a", "delta_pts_final"))} puntos (${get(X, X, "der_20")?.pass && get(X, X, "der_final")?.pass ? "aprueba" : "suspende"}); ${d.input.violations} violaciones de invariantes.`;
  const s5 = failed.length === 0 && !mono?.fragile
    ? `**Recomendación**: κ ${kStr(k0)} queda **validado** con semillas independientes.${earlyAll ? " Aun así, el criterio de monocultivo solo mira la gen final y no detecta la convergencia temprana: propongo que el Diseñador decida si debe medir también la trayectoria (QA V-03)." : ""}`
    : failed.length === 0
      ? `**Recomendación**: κ ${kStr(k0)} aprueba, pero el monocultivo es frágil: lo doy por **validado con reservas**.${earlyAll ? " Como la convergencia temprana no depende de κ, ajustar κ no arregla lo que ve el jugador; propongo que el Diseñador revise el criterio (trayectoria o gen 50) antes de seguir afinando κ (QA V-03)." : ""}`
      : `**Recomendación**: κ ${kStr(k0)} **no se sostiene** con semillas nuevas en ${list(failed.map((x) => `\`${x.id}\``))}.${earlyAll ? " La convergencia temprana no depende de κ, así que antes de cambiar κ propongo que el Diseñador revise qué debe medir el criterio de monocultivo (QA V-03)." : ""} No elijo un κ nuevo con estas semillas.`;
  b.push({ kind: "ol", items: [s1, s2, s3, s4, s5].filter(Boolean) });

  // ---------------------------------------------------------------- criterios
  b.push({ kind: "h2", text: `Criterios §10.2 (config por defecto, κ ${kStr(k0)})` });
  b.push({ kind: "p", text: "Valor = media de semillas con IC 95 % (t de Student). E4: cuantiles de todos los ensayos con IC 95 % de estadísticos de orden. Frágil = el IC cruza el umbral. Las filas informativas no tienen umbral en la spec y no cuentan en aprobados." });
  b.push({ kind: "table", table: critTable(crits) });
  const det = d.input.det;
  const detOk = det.rerunHashEqual && det.rerunCsvEqual && det.differentSeedDiffers && det.pairedIdentical === det.pairedCompared;
  b.push({ kind: "p", text: `**Determinismo** ${detOk ? "APROBADO" : "SUSPENSO"}: misma semilla ⇒ mismo hash ${det.rerunHashEqual ? "sí" : "NO"} y mismo CSV ${det.rerunCsvEqual ? "sí" : "NO"}; semilla distinta ⇒ población distinta ${det.differentSeedDiffers ? "sí" : "NO"}; pareado 2 % vs 3 %: ${det.pairedIdentical}/${det.pairedCompared} crías sin mutación idénticas.` });

  // ---------------------------------------------------------------- monocultivo
  if (traj.length) {
    b.push({ kind: "h2", text: "Monocultivo E5: evolución por generación y efecto de κ (QA V-03)" });
    b.push({
      kind: "p",
      text: `Clave más común en los D del peor locus, media de ${plan.e5Seeds.length} semillas con IC 95 %, y nº de semillas que superan el ${pct(MONO_MAX, 0)}. ${refs.length ? `Los κ ${list(refs.map((r) => kStr(kOf(r.id))))} son **referencias** (los valores vecinos del barrido de la spec), simuladas con las mismas semillas solo para ver cómo responde E5 a κ. Con ellas no se elige nada.` : ""}`,
    });
    b.push({
      kind: "table",
      table: {
        head: ["κ", ...traj[0]!.at.map((a) => `gen ${a.g}`)],
        rows: traj.map((t) => [`${kStr(t.k)}${t.id === X ? " (por defecto)" : ""}`, ...t.at.map((a) => `${ciPct(a.ci)} · ${a.over}/${a.n} > ${pct(MONO_MAX, 0)}`)]),
        num: traj[0]!.at.map((_, i) => i + 1),
      },
    });
    const cmp = (g: number): string => list(traj.map((t) => `${pct(meanAt(t, g))} (κ ${kStr(t.k)})`));
    b.push({
      kind: "ul",
      items: [
        earlyAll
          ? `**La convergencia es temprana**: en la gen ${gEarly}, con cualquier κ, la clave más común está por encima del ${pct(MONO_MAX, 0)} (${cmp(gEarly)}). Es lo que verá un jugador que críe por velocidad: el criterio, que solo mira la gen ${gF}, no lo detecta.`
          : `En la gen ${gEarly}: ${cmp(gEarly)}. No hay convergencia temprana común a todos los κ.`,
        recoveryByK
          ? `**κ solo afecta a la recuperación**: la diferencia entre κ pasa de ${pct(spread(gEarly))} en la gen ${gEarly} a ${pct(spread(gF))} en la gen ${gF} (${cmp(gF)}). Cuanto más tira la deriva hacia el ancla, menos rinde especializar valores y más tarda en volver la diversidad de tipos.`
          : `La diferencia entre κ en la gen ${gF} (${pct(spread(gF))}) no es mayor que en la gen ${gEarly} (${pct(spread(gEarly))}): κ no explica la recuperación con estos datos.`,
      ],
    });
    b.push({
      kind: "chart",
      caption: "Monocultivo E5 por generación",
      html: lineChart({ title: "E5: frecuencia de la clave más común en D (peor locus)", series: traj.map((t, i) => ({ name: `κ ${kStr(t.k)}${t.id === X ? " (por defecto)" : ""}`, slot: i + 1, pts: d.curveMax(t.exp, t.id, "E5", MAXCOLS) })), xLabel: "generación", yLabel: "% de los D con la misma clave", yFmt: (x) => pct(x, 0), band: [0, MONO_MAX], bandLabel: `permitido ≤ ${pct(MONO_MAX, 0)} (evaluado en gen ${gF})`, yMin: 0, note: `Media de ${plan.e5Seeds.length} semillas. La tabla de arriba da el IC y el reparto por semilla en las generaciones ${list(TRAJ_GENS.filter((g) => g <= gF).map(String))}.` }),
    });
  }

  // ---------------------------------------------------------------- §15
  b.push({ kind: "h2", text: "Puntos de §15 de la spec" });
  const ok = (ids: string[]): string => (ids.every((id) => get(X, X, id)?.pass) ? (ids.some((id) => get(X, X, id)?.fragile) ? "APROBADO (frágil)" : "APROBADO") : "SUSPENSO");
  const r5 = (k: string): number => v(X, X, "E1", k);
  const tot = r5("respaldo_N0") + r5("respaldo_N1") + r5("respaldo_N2") + r5("respaldo_N3");
  const n3 = r5("respaldo_N3") + v(X, X, "E5", "respaldo_N3");
  const der20 = m(X, X, "E3a", "delta_pts_20");
  const derF = m(X, X, "E3a", "delta_pts_final");
  b.push({
    kind: "table",
    table: {
      head: ["Punto", "Resultado (medido)", "Veredicto"],
      rows: [
        ["1. Primera criatura híbrida (E4)", e4 ? `mediana ${nf(e4.creature.median, 0)} [${nf(e4.creature.medCI.lo, 0)}; ${nf(e4.creature.medCI.hi, 0)}], p90 ${nf(e4.creature.p90, 0)} [${nf(e4.creature.p90CI.lo, 0)}; ${nf(e4.creature.p90CI.hi, 0)}], ${e4.creature.censored} censurados; MLE geométrico ⇒ mediana ${nf(e4.creature.mle.median, 1)}` : "—", ok(["e4_cri_med", "e4_cri_p90"])],
        ["2. Vigilancia de híbridas (E2)", `D ${ciPct(m(X, X, "E2", "frac_D_hibrido_final")!)}; criaturas ${ciPct(m(X, X, "E2", "frac_criaturas_hibridas_final")!)}`, ok(["hib_D", "hib_cri"])],
        ["3. Deriva E3a homocigoto", `${der20 ? ciPts(der20) : "—"} puntos en gen 20; ${derF ? ciPts(derF) : "—"} en gen ${e3F}`, ok(["der_20", "der_final", "der_ctl"])],
        ["4. D-007 y respaldos", `${nf(r5("mut_por_1000"), 1)} mutaciones/1000; ${nf(r5("mut_clave_de_padre"), 0)} claves de un padre; E1: N1 ${pct(r5("respaldo_N1") / tot, 2)}, N2 ${pct(r5("respaldo_N2") / tot, 2)}, N3 ${nf(r5("respaldo_N3"), 0)}; E5: N3 ${nf(v(X, X, "E5", "respaldo_N3"), 0)}`, n3 === 0 && r5("mut_clave_de_padre") === 0 && get(X, X, "mut_1000")?.pass ? "APROBADO" : "REVISAR"],
        ["5. Sorpresa, diversidad, Genedex", `sorpresa ${ciPct(m(X, X, "E1", "sorpresa")!)}; Genedex repetidas ${pct(v(X, X, "E2", "genedex_repetidas_final10"))}`, ok(["sorpresa", "div_distintas", "div_H_todos", "div_H_D", "div_H_ratio", "div_maxfrec", "dex_1_10", "dex_final", "dex_rep", "dex_hib"])],
        ["6. Monocultivo E5 y calidad", `máx. clave ${monoCI ? ciPct(monoCI) : "—"}; Δ calidad media ${qDelta ? ciPts(qDelta) : "—"} puntos`, ok(["mono_distintas", "mono_H_D", "mono_maxfrec"]) + (qDelta && qDelta.lo > 0 ? "; la calidad sube" : "")],
      ],
    },
  });

  // ---------------------------------------------------------------- comparación
  b.push({ kind: "h2", text: "Comparación con v0.1" });
  b.push({ kind: "p", text: `Las cifras de v0.1 están citadas del ${V01_SOURCE}. Las de v0.2 salen de esta ejecución.` });
  b.push({
    kind: "table",
    table: {
      head: ["Métrica", "v0.1", `v0.2 (κ ${kStr(k0)})`],
      rows: [
        ["Sorpresa E1", pct(V01.sorpresa), pct(v(X, X, "E1", "sorpresa"))],
        ["% crías mutadas", pct(V01.fracMut), pct(v(X, X, "E1", "frac_crias_mutadas"))],
        ["Genedex: % repetidas al final (E2)", pct(V01.dexRep), pct(v(X, X, "E2", "genedex_repetidas_final10"))],
        ["E4 primer gen Vapor (mediana / p90)", V01.e4Gen, `${nf(e4?.gene.median ?? NaN, 0)} / ${nf(e4?.gene.p90 ?? NaN, 0)}`],
        ["E4 primera criatura Vapor (mediana)", V01.e4Cri, nf(e4?.creature.median ?? NaN, 0)],
        [`D híbridos, E1 cerrada gen ${gF}`, pct(V01.hibD_E1), pct(v(X, X, "E1", "frac_D_hibrido_final"))],
        [`D híbridos, E2 gen ${gF}`, pct(V01.hibD_E2), pct(v(X, X, "E2", "frac_D_hibrido_final"))],
        [`Cría por velocidad: máx. clave / H_D (gen ${gF})`, `${pct(V01.monoMax)} / ${nf(V01.monoHD, 2)}`, `${pct(v(X, X, "E5", "div_maxfrec_D_max"))} / ${nf(v(X, X, "E5", "div_H_D_min"), 2)}`],
      ],
    },
  });

  // ---------------------------------------------------------------- gráficas
  b.push({ kind: "h2", text: "Gráficas" });
  if (e4) {
    b.push({
      kind: "chart",
      caption: "E4: crías hasta la primera criatura Vapor",
      html: histogram({ title: `E4: crías hasta la primera criatura de familia Vapor (${e4.n.toLocaleString("es")} ensayos)`, counts: e4.creature.hist, binLabel: (i) => (i === 20 ? "200+" : `${i * 10 + 1}`), xLabel: "crías hasta la primera criatura Vapor (cubetas de 10)", yLabel: "% de ensayos", marks: [{ x: e4.creature.median, label: `mediana ${nf(e4.creature.median, 0)}` }, { x: e4.creature.p90, label: `p90 ${nf(e4.creature.p90, 0)}` }], note: `Umbrales: mediana ≤ ${CR.primera_hibrida.criatura_mediana_max}, p90 ≤ ${CR.primera_hibrida.criatura_p90_max}. Censurados al tope de ${e4.cap}: ${e4.creature.censored}.` }),
    });
  }
  const dSeries = kVariants
    .map((kv, i) => ({ name: `E3a homocigoto, κ ${kStr(kv.k)}${kv.id === X ? " (por defecto)" : ""}`, slot: i + 1, pts: d.curve(kv.exp, kv.id, "E3a", "vel_D_media") }))
    .concat([{ name: `control al azar (κ ${kStr(k0)})`, slot: 4, pts: d.curve(X, X, "E3a_control", "vel_D_media") }])
    .filter((s) => s.pts.length)
    .map((s) => ({ ...s, dashed: s.slot === 4, pts: s.pts.map(([g, y]) => [g, y - (s.pts[0]?.[1] ?? 0)] as [number, number]) }));
  b.push({
    kind: "chart",
    caption: "Deriva E3a homocigoto",
    html: lineChart({ title: "Velocidad por gen D bajo selección, respecto a gen 0 (E3a homocigoto)", series: dSeries, xLabel: "generación", yLabel: "Δ velocidad por gen D (puntos)", yFmt: (x) => nf(x, 1), band: [CR.deriva.gen20_min_puntos, CR.deriva.gen20_max_puntos], bandLabel: `objetivo gen 20: +${kStr(CR.deriva.gen20_min_puntos)}…+${kStr(CR.deriva.gen20_max_puntos)}`, yMin: -0.5, note: `Umbral en gen ${e3F}: ≤ +${kStr(CR.deriva.gen100_max_puntos)}. Media de ${plan.seeds.length} semillas.` }),
  });
  const qSeries = [
    { name: `E5 cría por velocidad (κ ${kStr(k0)})`, slot: 1, pts: d.curve(X, X, "E5", "calidad_media") },
    { name: "E1 cría al azar", slot: 2, pts: d.curve(X, X, "E1", "calidad_media") },
  ].filter((s) => s.pts.length);
  b.push({ kind: "chart", caption: "Calidad media", html: lineChart({ title: "Calidad media de las criaturas (media de los 4 D)", series: qSeries, xLabel: "generación", yLabel: "calidad (puntos)", yFmt: (x) => nf(x, 1), yMin: RAW["calidad"].base - 1, note: `Rango por gen: ${kStr(RAW["calidad"].min)}–${kStr(RAW["calidad"].max)}.` }) });
  const hSeries = [
    { name: "E1 cerrada", slot: 1, pts: d.curve(X, X, "E1", "frac_D_hibrido") },
    { name: "E2 con capturas", slot: 2, pts: d.curve(X, X, "E2", "frac_D_hibrido") },
  ].filter((s) => s.pts.length);
  b.push({ kind: "chart", caption: "D híbridos", html: lineChart({ title: "Fracción de genes D híbridos", series: hSeries, xLabel: "generación", yLabel: "% de D de familia híbrida", yFmt: (x) => pct(x, 0), yMin: 0, note: `Vigilancia en E2, gen ${gF}: D ≤ ${pct(CR.hibridas_vigilancia.max_frac_D_hibridos, 0)}.` }) });

  // ---------------------------------------------------------------- decisiones y hallazgos
  b.push({ kind: "h2", text: "Hallazgos y decisiones pendientes" });
  const items: string[] = [];
  if (earlyAll) items.push(`**Para el Diseñador (criterio de monocultivo)**: la convergencia de E5 ocurre antes de la gen ${gEarly} con cualquier κ, y el criterio solo mira la gen ${gF}. Opciones: (a) dejarlo así (mide la diversidad a largo plazo); (b) evaluarlo también en la gen ${gEarly} o sobre el máximo de la trayectoria, sabiendo que **ningún κ simulado lo aprobaría** (${list(traj.map((t) => `${pct(meanAt(t, gEarly))} con κ ${kStr(t.k)}`))}), así que haría falta otra palanca (p. ej. límite de crías por individuo de élite). Recomiendo (a) y medir la homogeneización real en el simulador de economía.`);
  if (qDelta && qDelta.lo > 0) items.push(`**Calidad seleccionable (sigue abierto en §10.2)**: en E5 la calidad media sube ${ciPts(qDelta)} puntos, porque Σvalores = calidad. No se crea calidad nueva (${d.input.violations} violaciones, ningún gen pasa de ${kStr(RAW["calidad"].max)}). La premisa "la selección por velocidad no selecciona calidad" no se cumple: hay que reescribir el criterio o aceptarlo, y el freno es el combate (§10.3).`);
  else if (qDelta) items.push(`**Calidad en E5**: Δ ${ciPts(qDelta)} puntos; ${qDelta.hi <= 0 ? "no sube" : "no se puede afirmar que suba"}.`);
  items.push(`**Híbridas en población cerrada**: ${pct(v(X, X, "E1", "frac_D_hibrido_final"))} de D híbridos en la gen ${gF} de E1 (con capturas, ${pct(v(X, X, "E2", "frac_D_hibrido_final"))}). Es informativo y no tiene umbral.`);
  items.push(`**Núcleo**: ${d.input.violations === 0 ? "sin fallos encontrados" : `${d.input.violations} violaciones; revisar`}${n3 === 0 ? "; el respaldo N3 no se usó" : `; N3 usado ${n3} veces`}.`);
  b.push({ kind: "ol", items });

  b.push({ kind: "h2", text: "Cambios por la revisión QA v0.2" });
  b.push({
    kind: "ul",
    items: [
      `**V-01**: revalidación con un prefijo de semillas nuevo (\`${plan.seeds[0]?.replace(/-\d+$/, "")}-*\`), 20 semillas en E5. La CLI avisa si se usa un prefijo con el que ya se eligió algo (${USED_SEED_PREFIXES.join(", ")}).`,
      "**V-02/V-06**: el informe se regenera entero desde el código: κ y las etiquetas salen del JSON, y la cabecera indica commit y huella de la config. Ya no se plantean preguntas que el director ha resuelto.",
      "**V-03**: tabla y curva de la trayectoria del monocultivo E5 en las generaciones 20/50/100/300 con κ de referencia.",
      "**V-04**: el resumen y los hallazgos son plantillas condicionales sobre los resultados. Si los datos cambian, cambian las frases.",
    ],
  });

  b.push({ kind: "h2", text: "Método y reproducción" });
  b.push({
    kind: "ul",
    items: [
      "Escenarios de §10.1 v0.2. Reemplazo generacional con N fijo. Flujos RNG por semilla: `|cria`, `|sim` y `|salvaje`; E4 usa `seed|E4|config|ensayo`.",
      `Comandos: \`npm run sim\` (completo, ${nf(d.input.elapsedSec / 60, 1)} min en esta ejecución) · \`npm run sim -- --quick\` · \`npm run sim -- --help\`. Salida en \`sim/out/completo/\`; informe en \`sim/out/informe-genetica-v0.2.html\`, copiado en \`docs/informes/\`.`,
    ],
  });
  return { title: "Proyecto Genoma — Informe de genética v0.2", blocks: b };
}

function critTable(cs: readonly Criterion[]): Table {
  return {
    head: ["Grupo", "Criterio", "Umbral", "Valor [IC 95 %]", "Semillas", "Resultado"],
    rows: cs.map((c) => [c.group, c.label, c.threshold, critValue(c), c.seedsPass ? `${c.seedsPass[0]}/${c.seedsPass[1]}` : "", verdict(c)]),
    num: [3, 4],
  };
}
