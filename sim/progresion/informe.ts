/** Informe de progresión v0.1 generado desde los datos de la simulación (sin cifras escritas a mano). */
import { PROFILE_DOC, PROFILES, type GameResult, type Profile } from "./modelo.ts";

export interface Data {
  readonly meta: { commit: string; configSha: string; configPath: string; prefix: string; partidas: number; maxCombats: number; mode: string; elapsedSec: number; threads: number };
  readonly criteria: any;
  readonly sim: any;
  readonly results: Record<string, GameResult[]>;
  readonly proposal?: { meta: Data["meta"]; results: Record<string, GameResult[]>; diff: string[]; note: string };
}

const ZONES = ["Prado de la Linde", "Marismas Quietas", "Cantil del Farol Roto"];

// ---------------------------------------------------------------- estadística
const sorted = (xs: readonly number[]): number[] => xs.slice().sort((a, b) => a - b);
function quant(xs: readonly number[], q: number): number {
  const s = sorted(xs);
  if (s.length === 0) return NaN;
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1) + 0.5)))]!;
}
/** IC 95 % de un cuantil por estadísticos de orden (aprox. normal de la binomial). */
function quantCI(xs: readonly number[], q: number): [number, number] {
  const s = sorted(xs), n = s.length;
  if (n === 0) return [NaN, NaN];
  const h = 1.96 * Math.sqrt(n * q * (1 - q));
  return [s[Math.max(0, Math.floor(n * q - h))]!, s[Math.min(n - 1, Math.ceil(n * q + h))]!];
}
function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [NaN, NaN];
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [c - h, c + h];
}
const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (x: number, d = 1): string => (Number.isNaN(x) ? "—" : (x * 100).toFixed(d).replace(".", ",") + " %");
const num = (x: number, d = 1): string => (Number.isNaN(x) ? "—" : x.toFixed(d).replace(".", ","));
const th = (x: number): string => String(Math.round(x * 100));
const ci = (a: [number, number], f: (x: number) => string): string => `[${f(a[0])}; ${f(a[1])}]`;

// ---------------------------------------------------------------- métricas por perfil
interface Rate { k: number; n: number; v: number; ci: [number, number] }
const rate = (k: number, n: number): Rate => ({ k, n, v: n ? k / n : NaN, ci: wilson(k, n) });
interface Q { med: number; p10: number; p90: number; medCI: [number, number]; p10CI: [number, number] }
const qstats = (xs: readonly number[]): Q => ({ med: quant(xs, 0.5), p10: quant(xs, 0.1), p90: quant(xs, 0.9), medCI: quantCI(xs, 0.5), p10CI: quantCI(xs, 0.1) });

export interface Metrics {
  profile: Profile; n: number;
  winZone: Rate[]; winEarly: Rate[]; turnsZone: number[]; drawsZone: Rate[]; combatsZone: number[]; dnZone: { mean: number; pos: Rate }[];
  res: Q[]; minutes: Q; minutesS1: Q; fav3: Q; coll: Q[]; essence3: Q; lanterns3: Q;
  c30: { q: Q; censored: number; med: number | null; medCI: [number | null, number | null] };
  catch1: Rate; catchRetry: Rate | null; catchTotalWilds: number;
  lanternsMinMed: number; neverZero: Rate; combatsNoLanterns: Rate; thrown: Rate; noRes1: Rate;
  blocked: Rate; full3: Rate; releaseShare: number; essenceTotal: number;
  firstCombat: Rate; marismasAt: Q; cantilAt: Q | null; cantilReached: Rate;
  comp: { zone: number; team: number; wilds: number; win: Rate }[];
}

export function metricsOf(profile: Profile, rs: readonly GameResult[], cfgCrit: any): Metrics {
  const n = rs.length;
  const zc = (z: number) => rs.flatMap((r) => r.out.map((o, i) => ({ o, i, r })).filter((x) => r.z[x.i] === z));
  const winZone = [0, 1, 2].map((z) => { const c = zc(z); return rate(c.filter((x) => x.o === 0).length, c.length); });
  const winEarly = [0, 1, 2].map((z) => { const c = zc(z).filter((x) => x.i < 18); return rate(c.filter((x) => x.o === 0).length, c.length); });
  const turnsZone = [0, 1, 2].map((z) => mean(zc(z).map((x) => x.r.turns[x.i]!)));
  const drawsZone = [0, 1, 2].map((z) => { const c = zc(z); return rate(c.filter((x) => x.o === 2).length, c.length); });
  const dnZone = [0, 1, 2].map((z) => { const c = zc(z).map((x) => x.r.dn[x.i]!); return { mean: mean(c), pos: rate(c.filter((d) => d > 0).length, c.length) }; });
  const res = [0, 1, 2].map((k) => qstats(rs.map((r) => r.snaps[k]!.res)));
  // resonancias acumuladas (no por sesión): snaps[k].res ya es el acumulado
  const sess = rs.flatMap((r) => r.snaps.map((s) => s.minutes));
  const c30 = rs.map((r) => (r.c30 === null ? Infinity : r.c30));
  const c30q = qstats(c30);
  const cens = c30.filter((x) => x === Infinity).length;
  const fin = (x: number): number | null => (Number.isFinite(x) ? x : null);
  const c0 = rs.reduce((a, r) => a + r.catchStats[0], 0), c1 = rs.reduce((a, r) => a + r.catchStats[1], 0);
  const r0 = rs.reduce((a, r) => a + r.catchStats[2], 0), r1 = rs.reduce((a, r) => a + r.catchStats[3], 0);
  // con reintento: de las salvajes con 1.er intento, las que acaban atrapadas dentro de los 2 farols (solo si hubo reintento posible)
  const retryTried = r0, retryHit = c1 + r1;
  const totCombats = rs.reduce((a, r) => a + r.combats, 0);
  const gainRel = rs.reduce((a, r) => a + r.essence.release, 0);
  const gainAll = rs.reduce((a, r) => a + r.essence.start + r.essence.combat + r.essence.release, 0);
  const cell = new Map<string, { zone: number; team: number; wilds: number; k: number; n: number }>();
  for (const r of rs) r.out.forEach((o, i) => {
    const key = `${r.z[i]}|${r.tn[i]}|${r.wn[i]}`;
    const c = cell.get(key) ?? { zone: r.z[i]!, team: r.tn[i]!, wilds: r.wn[i]!, k: 0, n: 0 };
    c.n++; if (o === 0) c.k++;
    cell.set(key, c);
  });
  const cantilGames = rs.filter((r) => r.firstZone[1] > 0);
  return {
    profile, n, winZone, winEarly, turnsZone, drawsZone, combatsZone: [0, 1, 2].map((z) => zc(z).length), dnZone,
    res, minutes: qstats(sess), minutesS1: qstats(rs.map((r) => r.snaps[0]!.minutes)), fav3: qstats(rs.map((r) => r.snaps[2]!.favLevel)),
    coll: [0, 1, 2].map((k) => qstats(rs.map((r) => r.snaps[k]!.coll))), essence3: qstats(rs.map((r) => r.snaps[2]!.essence)), lanterns3: qstats(rs.map((r) => r.snaps[2]!.lanterns)),
    c30: { q: c30q, censored: cens, med: fin(c30q.med), medCI: [fin(c30q.medCI[0]), fin(c30q.medCI[1])] },
    catch1: rate(c1, c0), catchRetry: retryTried > 0 ? rate(retryHit, c1 + r0) : null,
    catchTotalWilds: c0,
    lanternsMinMed: quant(rs.map((r) => r.lanternsMin), 0.5), neverZero: rate(rs.filter((r) => r.lanternsMin > 0).length, n),
    combatsNoLanterns: rate(rs.reduce((a, r) => a + r.combatsNoLanterns, 0), totCombats), thrown: rate(rs.reduce((a, r) => a + r.wilds[1], 0), rs.reduce((a, r) => a + r.wilds[0], 0)), noRes1: rate(rs.filter((r) => r.snaps[0]!.res === 0).length, n),
    blocked: rate(rs.reduce((a, r) => a + r.blocked, 0), rs.reduce((a, r) => a + r.resMoments, 0)),
    full3: rate(rs.filter((r) => r.snaps[2]!.coll >= 100).length, n), releaseShare: gainAll ? gainRel / gainAll : NaN, essenceTotal: gainAll / n,
    firstCombat: rate(rs.filter((r) => r.out[0] === 0).length, n), marismasAt: qstats(rs.filter((r) => r.firstZone[0] > 0).map((r) => r.firstZone[0])),
    cantilAt: cantilGames.length ? qstats(cantilGames.map((r) => r.firstZone[1])) : null, cantilReached: rate(cantilGames.length, n),
    comp: [...cell.values()].map((c) => ({ zone: c.zone, team: c.team, wilds: c.wilds, win: rate(c.k, c.n) })),
  };
}

// ---------------------------------------------------------------- veredictos
type V = "cumple" | "falla" | "frágil";
interface Row { id: string; criterio: string; umbral: string; valores: Partial<Record<Profile, string>>; veredictos: Partial<Record<Profile, V>>; verdict: V; nota: string }

function judgeRange(lo: number, hi: number, v: number, c: [number, number]): V {
  if (Number.isNaN(v)) return "falla";
  const inside = (x: number) => x >= lo && x <= hi;
  if (!inside(v)) return "falla";
  return inside(c[0]) && inside(c[1]) ? "cumple" : "frágil";
}
const worst = (vs: V[]): V => (vs.includes("falla") ? "falla" : vs.includes("frágil") ? "frágil" : "cumple");

function criteriaRows(M: Metrics[], C: any, profiles: readonly Profile[]): Row[] {
  const rows: Row[] = [];
  const by = (f: (m: Metrics) => { text: string; v: V }, id: string, criterio: string, umbral: string, nota = "", only?: readonly Profile[]): void => {
    const valores: Partial<Record<Profile, string>> = {}, veredictos: Partial<Record<Profile, V>> = {};
    for (const m of M) { if (only && !only.includes(m.profile)) continue; const r = f(m); valores[m.profile] = r.text; veredictos[m.profile] = r.v; }
    rows.push({ id, criterio, umbral, valores, veredictos, verdict: veredictos.normal ?? worst(Object.values(veredictos) as V[]), nota });
  };
  const INF = Infinity;
  const r3 = C.resonancias_3_sesiones;
  by((m) => {
    const q = m.res[2]!;
    const v: V = q.med < r3.mediana_min || q.p10 < r3.p10_min ? "falla" : q.medCI[0] < r3.mediana_min || q.p10CI[0] < r3.p10_min ? "frágil" : "cumple";
    return { text: `${num(q.med, 0)} / ${num(q.p10, 0)}`, v };
  }, "R3", "Resonancias tras 3 sesiones (mediana / p10)", `mediana ≥ ${r3.mediana_min}, p10 ≥ ${r3.p10_min}`, "Se evalúa en todos los perfiles (la spec lo pide en todo el rango de victorias).");
  by((m) => ({ text: `${num(m.res[0]!.med, 0)} (p10 ${num(m.res[0]!.p10, 0)})`, v: m.res[0]!.med >= C.resonancias_sesion_1.mediana_min ? (m.res[0]!.medCI[0] >= C.resonancias_sesion_1.mediana_min ? "cumple" : "frágil") : "falla" }), "R1", "Resonancias en la sesión 1 (mediana)", `≥ ${C.resonancias_sesion_1.mediana_min}`);
  const mn = C.minutos_por_sesion;
  by((m) => ({ text: `${num(m.minutes.med / 60)} min (p10 ${num(m.minutes.p10 / 60)}, p90 ${num(m.minutes.p90 / 60)})`, v: judgeRange(mn.min * 60, mn.max * 60, m.minutes.med, m.minutes.medCI) }), "MIN", "Minutos por sesión (modelo de tiempo, mediana de las 3 sesiones)", `${mn.min}–${mn.max} min`, "Tiempo = turnos × 10 s + 30 s por combate + 40 s por resonancia; no cuenta lanzar faroles ni menús.");
  const fv = C.nivel_favorito_3_sesiones;
  by((m) => ({ text: `${num(m.fav3.med, 0)} (p10 ${num(m.fav3.p10, 0)}, p90 ${num(m.fav3.p90, 0)})`, v: judgeRange(fv.mediana_min, fv.mediana_max, m.fav3.med, m.fav3.medCI) }), "NIV", "Nivel del favorito tras 3 sesiones (mediana)", `${fv.mediana_min}–${fv.mediana_max}`);
  const c3 = C.combates_hasta_nivel_max;
  by((m) => {
    const q = m.c30;
    const text = q.med === null ? `> ${m.n ? "tope" : ""} (${q.censored}/${m.n} censuradas)` : `${num(q.med, 0)} [${q.medCI[0] ?? ">tope"}; ${q.medCI[1] ?? ">tope"}] (${q.censored} censuradas)`;
    const lo = q.medCI[0] ?? INF, med = q.med ?? INF;
    const v: V = med < c3.mediana_min || med > c3.mediana_max ? "falla" : lo < c3.mediana_min ? "frágil" : "cumple";
    return { text, v };
  }, "N30", "Combates hasta nivel 30 (favorito, mediana)", `${c3.mediana_min}–${c3.mediana_max}`, "Censura: las partidas que no llegan al tope de combates cuentan como «> tope».");
  const a1 = C.atrapar_primer_intento, a2 = C.atrapar_con_reintento;
  by((m) => ({ text: `${pct(m.catch1.v)} ${ci(m.catch1.ci, pct)}`, v: judgeRange(a1.min, a1.max, m.catch1.v, m.catch1.ci) }), "A1", "Atrapar al 1.er intento", `${th(a1.min)}–${th(a1.max)} %`, "", PROFILES.filter((p) => profiles.includes(p)));
  by((m) => (m.catchRetry === null ? { text: "sin reintento", v: "cumple" as V } : { text: `${pct(m.catchRetry.v)} ${ci(m.catchRetry.ci, pct)}`, v: judgeRange(a2.min, a2.max, m.catchRetry.v, m.catchRetry.ci) }), "A2", "Atrapada con reintento (salvajes a las que se les lanzó 1.er farol)", `${th(a2.min)}–${th(a2.max)} %`, "«impaciente» no reintenta: no se evalúa.");
  const vz = C.victorias_jugador_por_zona;
  const zmin = [vz.prado_linde, vz.marismas_quietas, vz.cantil_farol_roto_min];
  for (let z = 0; z < 3; z++) {
    by((m) => {
      const r = m.winZone[z]!;
      if (r.n === 0) return { text: "sin datos", v: "cumple" as V };
      const hi = z === 2 ? vz.cantil_farol_roto_max : 1;
      const v: V = r.v < zmin[z]! || r.v > hi ? "falla" : r.ci[0] < zmin[z]! || r.ci[1] > hi ? "frágil" : "cumple";
      return { text: `${pct(r.v)} ${ci(r.ci, pct)} (n=${r.n})`, v };
    }, `V${z + 1}`, `Victorias en ${ZONES[z]}`, z === 2 ? `${th(vz.cantil_farol_roto_min)}–${th(vz.cantil_farol_roto_max)} %` : `≥ ${th(zmin[z]!)} %`);
  }
  by((m) => ({ text: `${pct(m.firstCombat.v)} ${ci(m.firstCombat.ci, pct)}`, v: m.firstCombat.v >= C.primer_combate_victoria_min ? (m.firstCombat.ci[0] >= C.primer_combate_victoria_min ? "cumple" : "frágil") : "falla" }), "PC", "Primer combate (inicial + acompañante)", `≥ ${th(C.primer_combate_victoria_min)} %`);
  const ts = C.turnos_salvaje;
  by((m) => ({ text: `${num(m.turnsZone[0]!)} turnos; empates ${pct(m.drawsZone[0]!.v)}`, v: m.turnsZone[0]! <= ts.prado_linde_max && m.drawsZone[0]!.v <= ts.empates_max ? "cumple" : "falla" }), "T1", "Turnos por combate en el Prado (media) y empates", `≤ ${ts.prado_linde_max} turnos; empates ≤ ${th(ts.empates_max)} %`);
  by((m) => (m.combatsZone[2]! === 0 ? { text: "no llega al Cantil", v: "cumple" as V } : { text: `${num(m.turnsZone[2]!)} turnos; empates ${pct(m.drawsZone[2]!.v)}`, v: m.turnsZone[2]! <= ts.cantil_farol_roto_max && m.drawsZone[2]!.v <= ts.empates_max ? "cumple" : "falla" }), "T3", "Turnos por combate en el Cantil (media) y empates", `≤ ${ts.cantil_farol_roto_max} turnos; empates ≤ ${th(ts.empates_max)} %`);
  by((m) => ({ text: pct(m.blocked.v), v: m.blocked.v <= C.bloqueo_por_esencia_max ? "cumple" : "falla" }), "BE", "Bloqueo por esencia (% de momentos con pareja madura pero sin esencia)", `≤ ${th(C.bloqueo_por_esencia_max)} %`);
  by((m) => ({ text: pct(m.full3.v), v: m.full3.k <= C.coleccion_llena_3_sesiones_max ? "cumple" : "falla" }), "CL", "Colección llena en 3 sesiones", `${C.coleccion_llena_3_sesiones_max} % de partidas`);
  by((m) => ({ text: pct(m.releaseShare), v: m.releaseShare <= C.liberar_fraccion_esencia_max ? "cumple" : "falla" }), "LIB", "Esencia de liberar / esencia total", `≤ ${th(C.liberar_fraccion_esencia_max)} %`, "Solo el perfil «liberador» libera; en los demás es 0.", ["liberador"]);
  return rows;
}

// ---------------------------------------------------------------- informe
const icon = (v: V): string => (v === "cumple" ? "cumple" : v === "falla" ? "**FALLA**" : "frágil");

export function buildReport(d: Data): string {
  const profiles = PROFILES.filter((p) => d.results[p]) as Profile[];
  const M = profiles.map((p) => metricsOf(p, d.results[p]!, d.criteria));
  const rows = criteriaRows(M, d.criteria, profiles);
  const L: string[] = [];
  const P = (s = ""): void => { L.push(s); };
  P("# Informe de progresión v0.1 con combate real");
  P();
  P(`Generado por \`sim/progresion\` desde el commit \`${d.meta.commit}\` (más cambios locales si los hay), config \`${d.meta.configPath}\` + combate v0.5 + movimientos v0.5 + genética v0.2, huella sha256 \`${d.meta.configSha}…\`. Modo ${d.meta.mode}: ${d.meta.partidas} partidas por perfil, semillas \`${d.meta.prefix}-<perfil>-<i>\` (nunca usadas para elegir números), tope de ${d.meta.maxCombats} combates por partida, ${d.meta.elapsedSec} s con ${d.meta.threads} hilos. Todo lo de abajo sale de \`sim/out/progresion/progresion.json\`.`);
  P();
  P("Alcance: economía de la progresión (§9.2 filas de ritmo, atrapar, victorias, turnos, esencia, colección, liberar) con el núcleo real: `newGame`, `chooseStarter`, `rollEncounter`, `playEncounterBattle` (IA de referencia por tu lado, «instinto» en el salvaje), `applyBattleResult`, `throwLantern`, `resonate`, `release`, `setTeam`, `chooseVariant`. **No medido aquí** (otro encargo): espejos 4 contra 3 y 4 contra 2 movimientos, espejo de nivel 30 con variantes, pieza gratis, candidatos por locus, hashes 3 contra 3 (los cubre el test del núcleo).");
  P();
  P("## Perfiles");
  P();
  for (const p of profiles) P(`- **${p}**: ${PROFILE_DOC[p]}.`);
  P();
  P("Todos juegan sesiones de 6 combates, la inicial rota entre las tres (i mod 3), meten en el equipo a sus 3 mejores ánimas con `setTeam` antes de cada combate (por nivel; empate por nacimiento) y eligen las variantes pendientes. Cada combate se juega con la IA de referencia. Todas las cifras de victoria cuentan los combates jugados hasta nivel 30 (no se fuerza una zona).");
  P();
  P("## Resumen ejecutivo");
  P();
  const fails = rows.filter((r) => r.verdict === "falla"), frag = rows.filter((r) => r.verdict === "frágil");
  P(`Se miden ${rows.length} criterios en ${profiles.length} perfiles. **Cumplen ${rows.filter((r) => r.verdict === "cumple").length}, frágiles ${frag.length}, fallan ${fails.length}.** **El veredicto oficial de cada fila es el del perfil «normal»** (el modelo de la spec §9.1; LIB: el del «liberador»). Los otros perfiles miden sensibilidad: la columna «Otros perfiles» dice cuáles fallan.`);
  P();
  const offTxt = (r: Row, v: V): string => (Object.keys(r.valores) as Profile[]).filter((p) => r.veredictos[p] === v && r.verdict !== v ? true : r.veredictos[p] === v).map((p) => `${p} ${r.valores[p]}`).join("; ");
  for (const r of fails) P(`- **Falla ${r.id} — ${r.criterio}** (umbral ${r.umbral}): ${offTxt(r, "falla")}.`);
  for (const r of frag) P(`- Frágil ${r.id} — ${r.criterio}: el IC cruza el umbral (${offTxt(r, "frágil")}).`);
  const sens = rows.filter((r) => r.verdict !== "falla" && (Object.keys(r.valores) as Profile[]).some((p) => r.veredictos[p] === "falla"));
  if (sens.length) { P(); P(`Sensibilidad (cumple el modelo normal pero falla otro perfil): ${sens.map((r) => `${r.id} (${(Object.keys(r.valores) as Profile[]).filter((p) => r.veredictos[p] === "falla").join(", ")})`).join("; ")}.`); }
  P();
  P("## Veredicto por criterio (§9.2)");
  P();
  P(`| Id | Criterio | Umbral | ${profiles.join(" | ")} | Veredicto (normal) | Otros perfiles que fallan |`);
  P(`|---|---|---|${profiles.map(() => "---").join("|")}|---|---|`);
  for (const r of rows) P(`| ${r.id} | ${r.criterio} | ${r.umbral} | ${profiles.map((p) => (r.valores[p] === undefined ? "—" : `${r.valores[p]} (${icon(r.veredictos[p]!)})`)).join(" | ")} | ${icon(r.verdict)} | ${(Object.keys(r.valores) as Profile[]).filter((p) => r.veredictos[p] === "falla" && p !== "normal").join(", ") || "—"} |`);
  P();
  for (const r of rows) if (r.nota) P(`- ${r.id}: ${r.nota}`);
  P();
  P("«Frágil» = el valor está dentro del umbral pero el intervalo de confianza al 95 % (Wilson para proporciones; estadísticos de orden para medianas y p10) lo cruza.");
  P();

  P("## Resonancias, nivel y colección por sesión (acumulado)");
  P();
  P("| Perfil | Partidas sin resonancia en la sesión 1 | Res. ses. 1 mediana (p10) | ses. 2 | ses. 3 | IC mediana ses. 3 | IC p10 ses. 3 | Colección ses. 3 (mediana, p90) | Esencia ses. 3 (mediana) | Faroles ses. 3 (mediana) |");
  P("|---|---|---|---|---|---|---|---|---|---|");
  for (const m of M) P(`| ${m.profile} | ${pct(m.noRes1.v)} | ${num(m.res[0]!.med, 0)} (${num(m.res[0]!.p10, 0)}) | ${num(m.res[1]!.med, 0)} (${num(m.res[1]!.p10, 0)}) | ${num(m.res[2]!.med, 0)} (${num(m.res[2]!.p10, 0)}) | ${ci(m.res[2]!.medCI, (x) => num(x, 0))} | ${ci(m.res[2]!.p10CI, (x) => num(x, 0))} | ${num(m.coll[2]!.med, 0)}, ${num(m.coll[2]!.p90, 0)} | ${num(m.essence3.med, 0)} | ${num(m.lanterns3.med, 0)} |`);
  P();
  P("## Victorias, turnos y diferencia de nivel por zona");
  P();
  P("| Perfil | Zona | Combates | Victorias | Empates | Turnos (media) | Nivel máx. salvaje − nivel máx. equipo (media) | % con salvaje de más nivel que tu equipo |");
  P("|---|---|---|---|---|---|---|---|");
  for (const m of M) for (let z = 0; z < 3; z++) if (m.combatsZone[z]) P(`| ${m.profile} | ${ZONES[z]} | ${m.combatsZone[z]} | ${pct(m.winZone[z]!.v)} ${ci(m.winZone[z]!.ci, pct)} | ${pct(m.drawsZone[z]!.v)} | ${num(m.turnsZone[z]!)} | ${num(m.dnZone[z]!.mean)} | ${pct(m.dnZone[z]!.pos.v)} |`);
  P();
  P("Solo los 18 primeros combates (las 3 sesiones del hito D-066), victorias por zona:");
  P();
  P("| Perfil | Prado | Marismas | Cantil |");
  P("|---|---|---|---|");
  for (const m of M) P(`| ${m.profile} | ${[0, 1, 2].map((z) => (m.winEarly[z]!.n ? `${pct(m.winEarly[z]!.v)} (n=${m.winEarly[z]!.n})` : "—")).join(" | ")} |`);
  P();
  P("## Dónde se atasca el jugador");
  P();
  P("Derrotas por tipo de combate (tamaño de tu equipo sin acompañante contra número de salvajes), solo celdas con ≥ 30 combates y menos de 70 % de victorias o las 3 peores de cada perfil.");
  P();
  P("| Perfil | Zona | Tu equipo | Salvajes | Combates | Victorias |");
  P("|---|---|---|---|---|---|");
  for (const m of M) {
    const c = m.comp.filter((x) => x.win.n >= 30).sort((a, b) => a.win.v - b.win.v);
    const pick = c.filter((x, i) => x.win.v < 0.7 || i < 3).slice(0, 6);
    for (const x of pick) P(`| ${m.profile} | ${ZONES[x.zone]} | ${x.team} | ${x.wilds} | ${x.win.n} | ${pct(x.win.v)} ${ci(x.win.ci, pct)} |`);
  }
  P();
  P("Llegada a las zonas (combate en que se abre y se elige la zona nueva, mediana):");
  P();
  P("| Perfil | Marismas (combate nº) | Cantil (combate nº) | Partidas que llegan al Cantil |");
  P("|---|---|---|---|");
  for (const m of M) P(`| ${m.profile} | ${num(m.marismasAt.med, 0)} | ${m.cantilAt ? num(m.cantilAt.med, 0) : "—"} | ${pct(m.cantilReached.v)} |`);
  P();
  P("## Atrapar y faroles");
  P();
  P("| Perfil | 1.er intento (n) | Con reintento | Faroles mínimos (mediana) | Partidas que nunca llegan a 0 faroles | Combates que empiezan con 0 faroles | Salvajes derrotadas a las que se lanza farol | Primer combate ganado |");
  P("|---|---|---|---|---|---|---|---|");
  for (const m of M) P(`| ${m.profile} | ${pct(m.catch1.v)} (${m.catch1.n}) | ${m.catchRetry ? pct(m.catchRetry.v) : "—"} | ${num(m.lanternsMinMed, 0)} | ${pct(m.neverZero.v)} | ${pct(m.combatsNoLanterns.v)} | ${pct(m.thrown.v)} | ${pct(m.firstCombat.v)} |`);
  P();
  P("## Esencia y liberar");
  P();
  P("| Perfil | Esencia total ingresada por partida (media) | Bloqueo por esencia | % esencia por liberar |");
  P("|---|---|---|---|");
  for (const m of M) P(`| ${m.profile} | ${num(m.essenceTotal, 0)} | ${pct(m.blocked.v)} | ${pct(m.releaseShare)} |`);
  P();
  if (d.proposal) {
    const pr = d.proposal;
    const MP = profiles.filter((p) => pr.results[p]).map((p) => metricsOf(p, pr.results[p]!, d.criteria));
    const rp = criteriaRows(MP, d.criteria, profiles);
    P("## Propuesta de ajuste (validada con semillas nuevas)");
    P();
    P(`Fichero \`${pr.meta.configPath}\` (huella \`${pr.meta.configSha}…\`). Cambios respecto a \`${d.meta.configPath}\`, calculados de los dos JSON:`);
    P();
    for (const x of pr.diff) P(`- \`${x}\``);
    P();
    if (pr.note) P(`Declaración: ${pr.note}`);
    P();
    P(`Validación: ${pr.meta.partidas} partidas por perfil con semillas \`${pr.meta.prefix}-<perfil>-<i>\` (distintas de las de la medición y de las de elegir), ${pr.meta.elapsedSec} s.`);
    P();
    P(`| Id | Criterio | Umbral | Base (normal) | Propuesta (normal) | Veredicto propuesta | Otros perfiles que fallan con la propuesta |`);
    P("|---|---|---|---|---|---|---|");
    rows.forEach((r, i) => { const q = rp[i]!; P(`| ${r.id} | ${r.criterio} | ${r.umbral} | ${(r.valores.normal ?? r.valores.liberador) ?? "—"} (${icon(r.verdict)}) | ${(q.valores.normal ?? q.valores.liberador) ?? "—"} | ${icon(q.verdict)} | ${(Object.keys(q.valores) as Profile[]).filter((p) => q.veredictos[p] === "falla" && p !== "normal").join(", ") || "—"} |`); });
    P();
    const pf = rp.filter((r) => r.verdict === "falla");
    P(pf.length === 0 ? `Con la propuesta no falla ningún criterio medido en el perfil normal (${rp.filter((r) => r.verdict === "frágil").length} frágil/es).` : `Con la propuesta siguen fallando: ${pf.map((r) => r.id).join(", ")}.`);
    P();
  }
  P("## Conclusiones (plantillas sobre los datos)");
  P();
  const nm = M.find((m) => m.profile === "normal") ?? M[0]!;
  const bad = nm.comp.filter((x) => x.win.n >= 30).sort((a, b) => a.win.v - b.win.v)[0];
  if (bad) P(`- **Atasco principal (perfil ${nm.profile})**: ${ZONES[bad.zone]}, tu equipo de ${bad.team} contra ${bad.wilds} salvajes: ${pct(bad.win.v)} de victorias en ${bad.win.n} combates (frente a ${pct(nm.winZone[bad.zone]!.v)} de la zona entera).`);
  const c22 = nm.comp.find((x) => x.zone === 0 && x.team === 2 && x.wilds === 2);
  P(c22 ? `- **Prado, 2 ánimas contra 2 salvajes (perfil ${nm.profile})**: ${pct(c22.win.v)} de victorias en ${c22.win.n} combates.` : `- **Prado, 2 ánimas contra 2 salvajes (perfil ${nm.profile})**: no aparece (0 combates): con el acompañante hasta 3 ánimas ese combate no se da.`);
  const cu = M.find((m) => m.profile === "cuidadoso");
  if (cu) P(`- **Quien espera a estar fuerte se atasca en el Prado**: el perfil cuidadoso entra en las Marismas en el combate ${num(cu.marismasAt.med, 0)} y en el Cantil en el ${cu.cantilAt ? num(cu.cantilAt.med, 0) : "—"} (normal: ${num(nm.marismasAt.med, 0)} y ${nm.cantilAt ? num(nm.cantilAt.med, 0) : "—"}); tras 3 sesiones tiene ${num(cu.res[2]!.med, 0)} resonancias y el favorito está en nivel ${num(cu.fav3.med, 0)}.`);
  P(`- **Faroles**: en el perfil ${nm.profile} el ${pct(nm.combatsNoLanterns.v)} de los combates empieza con 0 faroles y se lanza farol al ${pct(nm.thrown.v)} de las salvajes derrotadas; el ${pct(1 - nm.neverZero.v)} de las partidas se queda sin faroles en algún momento. Tras cada victoria siempre hay al menos 1 (+1 por victoria), así que el atrapar nunca queda bloqueado, pero el ritmo lo marcan los faroles, no las salvajes disponibles.`);
  P(`- **Primera sesión**: el ${pct(nm.noRes1.v)} de las partidas del perfil ${nm.profile} no resuena en la sesión 1 (la inicial madura al nivel 5 y no siempre llega a tiempo); la mediana cumple, la cola no.`);
  P();
  P(fails.length === 0 ? "Todos los criterios medidos se cumplen o son frágiles en el perfil normal; no hace falta ajuste numérico." : `Fallan ${fails.length} criterio(s) en el perfil normal: ${fails.map((r) => r.id).join(", ")}.${d.proposal ? " La propuesta de ajuste y su validación están en la sección anterior." : " Ejecuta con `--propuesta` para validar un ajuste."}`);
  P();
  return L.join("\n") + "\n";
}
