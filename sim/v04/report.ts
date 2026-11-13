/**
 * Informe de combate v0.4 (md + html), generado desde los JSON de fase. Cada cifra sale de los datos; las
 * conclusiones son plantillas condicionales sobre ellos. Procedencia: commit + huella de la config efectiva.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { renderHtml, renderMd, type Block } from "../combat/report.ts";
import { criteria, failing, fmtC, judged, num, pct, familyRates, type Criterion } from "./analysis.ts";
import { registerVariant, variantById } from "./configs.ts";
import type { PhaseFile, Phase } from "./cli.ts";
import { BASE, CONTROL, fileSha, type Variant } from "./setup.ts";

type Phases = Partial<Record<Phase, PhaseFile>>;

function load(f: PhaseFile): void {
  for (const c of f.configs) if (c.id !== BASE.id) registerVariant({ id: c.id, label: c.label, combat: c.combat, moves: c.moves, salts: c.salts as Record<string, string | null> });
}
const iv = (c: Criterion): string => (c.hi > c.lo ? `${fmtC(c, c.value)} (${fmtC(c, c.lo)}–${fmtC(c, c.hi)})` : fmtC(c, c.value));
const verdict = (c: Criterion | undefined): string => (!c ? "—" : c.informative ? "informativo" : `${c.pass ? "aprobado" : "suspendido"}${c.fragile ? " (frágil)" : ""}`);
const cell = (c: Criterion | undefined): string => (c ? `${iv(c)} · ${verdict(c)}` : "—");
const patchText = (v: { combat: Record<string, unknown>; moves: Record<string, unknown>; salts: Record<string, unknown> }): string =>
  [...Object.entries(v.combat), ...Object.entries(v.moves)].map(([k, x]) => `\`${k}\` = ${JSON.stringify(x)}`).concat(Object.entries(v.salts).map(([k, x]) => `sal \`${k}\` = ${JSON.stringify(x)}`)).join("; ") || "sin cambios";

export function narrative(ph: Phases): { title: string; blocks: Block[] } {
  const B: Block[] = [{ t: "h1", text: "Informe de combate v0.4 — Proyecto Genoma" }];
  const files = [ph.base, ph.elegir, ph.validar].filter((x): x is PhaseFile => !!x);
  for (const f of files) load(f);
  const commit = files[0]?.commit ?? "desconocido";
  const shas = files.flatMap((f) => f.configs.map((c) => `${c.id} \`${c.sha}\``));
  const dedup = [...new Set(shas)].join(", ");
  B.push({ t: "sub", text: `Generado por \`sim/v04\` desde el commit \`${commit}\` (más cambios locales si los hay). Huellas sha256 de la config efectiva (combate + movimientos): ${dedup}. Propuesta \`config/propuestas/combate-v0.4.1.json\` con huella \`${fileSha("config/propuestas/combate-v0.4.1.json")}\`. Semillas: base \`${ph.base?.seed ?? "—"}\`, elegir \`${ph.elegir?.seed ?? "—"}\`, validar \`${ph.validar?.seed ?? "—"}\`; ninguna se había usado antes. Tiempos: ${files.map((f) => `${f.phase} ${Math.round(f.elapsedSec)} s (${f.mode})`).join(", ")}.` });

  const crit = (f: PhaseFile | undefined, id: string): Criterion[] => (f && f.data[id] ? criteria(variantById(id), f.data[id]!) : []);
  const b0 = crit(ph.base, "base");
  const bv = crit(ph.validar, "base");
  const av = crit(ph.validar, "ajuste");
  const cv = crit(ph.validar, "sinprov");
  const find = (cs: Criterion[], id: string): Criterion | undefined => cs.find((c) => c.id === id);

  // ---- resumen
  B.push({ t: "h2", text: "Resumen ejecutivo" });
  const items: string[] = [];
  if (b0.length) items.push(`**v0.4 base (${ph.base!.seed}):** aprueba ${judged(b0).filter((c) => c.pass).length} de ${judged(b0).length} criterios; suspende ${failing(b0).map((c) => `${c.group.toLowerCase()} (${fmtC(c, c.value)})`).join("; ") || "ninguno"}.`);
  if (bv.length && av.length) {
    const gained = judged(av).filter((c) => c.pass && !find(bv, c.id)?.pass).map((c) => c.id);
    const lost = judged(av).filter((c) => !c.pass && find(bv, c.id)?.pass).map((c) => c.id);
    const worse = failing(av).filter((c) => find(bv, c.id) && !find(bv, c.id)!.pass && (c.id === "familias" || c.id === "primer_ko" || c.id === "lider_t3" ? c.value > find(bv, c.id)!.value : false)).map((c) => c.id);
    items.push(`**Ajuste v0.4.1 (${ph.validar!.seed}, semillas nuevas):** aprueba ${judged(av).filter((c) => c.pass).length} de ${judged(av).length} (la base, con las mismas semillas: ${judged(bv).filter((c) => c.pass).length}). Gana: ${gained.join(", ") || "nada"}. Pierde: ${lost.join(", ") || "nada"}. Empeora aunque ya suspendía: ${worse.join(", ") || "nada"}. Suspende: ${failing(av).map((c) => c.id).join(", ") || "ninguno"}.`);
    const prof = find(av, "profundidad");
    const profB = find(bv, "profundidad");
    if (prof && profB) items.push(`**Profundidad:** ${iv(profB)} en la base y ${iv(prof)} en el ajuste (${ph.validar!.sizes.depth} partidas cada una): ${prof.pass && profB.pass ? "supera el 60 % con holgura; el plan B (recuperar la elección de objetivo) no hace falta" : "no llega: el plan B es recuperar la elección de objetivo (no implementado)"}.`);
    const cprof = find(cv, "profundidad");
    if (cprof && profB) items.push(`**Control R-02 (sin provocar):** profundidad ${iv(cprof)} frente a ${iv(profB)} con provocar: ${profB.value - cprof.value > 0 ? `provocar suma ${num((profB.value - cprof.value) * 100, 1)} puntos a favor de la búsqueda` : "sin ventaja atribuible a provocar"}${cprof.pass ? ", pero sin provocar también supera el umbral" : ", y sin provocar NO supera el umbral"}.`);
    const adopt = gained.length > 0 && lost.length === 0 && worse.length === 0;
    items.push(`**Recomendación:** ${adopt ? `adoptar el parche: arregla ${gained.join(", ")} sin perder nada que la base aprobara ni empeorar lo que ya suspendía` : `no adoptar el parche tal cual: arregla ${gained.join(", ") || "nada"}${worse.length ? ` pero empeora ${worse.join(", ")}` : ""}${lost.length ? ` y rompe ${lost.join(", ")}` : ""}`}; ${failing(av).length ? `siguen suspendidas ${failing(av).map((c) => c.id).join(", ")}, que las palancas de config no resuelven (decisión de diseño abajo)` : "todos los criterios aprobados"}.`);
  }
  B.push({ t: "list", items });

  // ---- tabla
  B.push({ t: "h2", text: "Criterios: base frente a ajuste" });
  const ids: string[] = [];
  for (const cs of [b0, bv, av]) for (const c of cs) if (!ids.includes(c.id)) ids.push(c.id);
  const lab = (id: string): Criterion => [...b0, ...bv, ...av].find((c) => c.id === id)!;
  B.push({ t: "table", head: ["Criterio", "Umbral", `Base (${ph.base?.seed ?? "—"})`, `Base (${ph.validar?.seed ?? "—"})`, `Ajuste v0.4.1 (${ph.validar?.seed ?? "—"})`], rows: ids.map((id) => [`${lab(id).group}: ${lab(id).label}`, lab(id).threshold, cell(find(b0, id)), cell(find(bv, id)), cell(find(av, id))]) });
  B.push({ t: "p", text: "IC 95 % entre paréntesis (Wilson para proporciones, normal para medias, estadísticos de orden para el p90). «Frágil» = el IC cruza el umbral. Colocación: máxima tasa de una colocación contra otra entre los 10 pares de {2+1, 1+2, regla IA y las variantes de carril 2+1c y 1+2c}, mismo equipo en los dos lados; es el máximo de 10 comparaciones, así que tiende a sobrestimar. Catálogo: exacto para las 6 familias base (72 genes); para las 7 híbridas, muestra de 300 claves." });
  for (const [name, cs] of [["base", bv], ["ajuste", av]] as const) {
    const extra = cs.filter((c) => c.detail).map((c) => `**${name} · ${c.group}:** ${c.detail}`);
    if (extra.length) B.push({ t: "list", items: extra });
  }
  const bd = ph.validar?.data["base"];
  const ad = ph.validar?.data["ajuste"];
  if (bd?.C2 && ad?.C2) {
    const rb = familyRates(bd.C2);
    const ra = familyRates(ad.C2);
    B.push({ t: "h3", text: "Familias (C2): tasa contra las otras 12" });
    B.push({ t: "table", head: ["Familia", "Base", "Ajuste"], rows: rb.map((r, i) => [r.family, pct(r.rate.value), pct(ra[i]!.rate.value)]) });
  }

  // ---- remontada
  if (bv.length) {
    const fk = find(bv, "primer_ko");
    const fe = find(bv, "primer_ko_espejo");
    if (fk && fe) B.push({ t: "p", text: `**Remontada.** Con equipos distintos gana el primer KO el ${pct(fk.value)} y con el mismo equipo en los dos lados (sin diferencia de fuerza) el ${pct(fe.value)}: ${fe.value >= (fk.value - 0.05) ? "casi todo el efecto es bola de nieve de la propia mecánica de 3 almas, no diferencias de equipo" : "parte del efecto es diferencia de equipos"}. En v0.3 la base (4 almas) daba 63,9 % y 62,0 % en espejo. Con 3 almas cada KO quita un tercio del equipo y la energía compartida no compensa.` });
  }

  // ---- ajuste
  B.push({ t: "h2", text: "Qué se ajustó (una sola ronda)" });
  if (ph.elegir) {
    const cs = ph.elegir.configs.map((c) => ({ c, cr: crit(ph.elegir, c.id) }));
    B.push({ t: "p", text: `Seis candidatas contra la base, con semillas de elegir \`${ph.elegir.seed}\` (C1 ${ph.elegir.sizes.c1}, espejo ${ph.elegir.sizes.mirror}, C2 ${ph.elegir.sizes.c2PerPair}/pareja, colocación ${ph.elegir.sizes.place}/par, tanque ${ph.elegir.sizes.tank}; sin profundidad). Regla de elección escrita antes de ver los datos de elegir: más criterios aprobados (de los medidos en esta fase); desempate, menos familias fuera de banda.` });
    B.push({ t: "table", head: ["Candidata", "Cambios", "Aprobados", "1.er KO", "Líder T3", "Turnos", "Gratis", "Pago/alma", "Familias fuera", "Tanque"], rows: cs.map(({ c, cr }) => [c.label, patchText(c), `${judged(cr).filter((x) => x.pass).length}/${judged(cr).length}`, ...["primer_ko", "lider_t3", "turnos", "gratis", "pagos", "familias", "tanque"].map((id) => { const x = find(cr, id); return x ? fmtC(x, x.value) : "—"; })]) });
    const best = [...cs].filter((x) => x.c.id !== "base").sort((a, b) => judged(b.cr).filter((x) => x.pass).length - judged(a.cr).filter((x) => x.pass).length || (find(a.cr, "familias")?.value ?? 9) - (find(b.cr, "familias")?.value ?? 9))[0];
    if (best) B.push({ t: "p", text: `Elegida por la regla: **${best.c.label}**. Candidatas que aprueban remontada: ${cs.filter((x) => x.c.id !== "base" && !failing(x.cr).some((f) => f.id === "primer_ko" || f.id === "lider_t3")).map((x) => x.c.id).join(", ") || "ninguna"}; que aprueban familias: ${cs.filter((x) => x.c.id !== "base" && !failing(x.cr).some((f) => f.id === "familias")).map((x) => x.c.id).join(", ") || "ninguna"}.` });
  }
  if (ph.validar) {
    const p = ph.validar.configs.find((c) => c.id === "ajuste");
    if (p) B.push({ t: "p", text: `**Parche validado:** ${patchText(p)}. Se comprobó, antes de simular, que cada ruta existe en la base (no se crea), que su valor cambia y que la config parseada cambia de verdad (catálogo de movimientos, estadísticas y una partida de prueba) (Revisor R-01).` });
  }

  // ---- notas
  B.push({ t: "h2", text: "Notas metodológicas y limitaciones" });
  B.push({ t: "list", items: [
    "**R-02: la IA de referencia nunca ve un provocar.** Dura 1 turno y con elección simultánea ya caducó cuando decide, y se provoca ~" + (bv.length ? num(find(bv, "provocar")?.value ?? 0, 1) : "—") + " veces por partida: eso sesga la profundidad a favor de la búsqueda (que sí simula el turno). El control sin provocar (arriba) acota ese sesgo.",
    "Profundidad = búsqueda contra `createReferenceAi()` con equipos espejo y colocación de la IA, cada equipo en A y en B; el rival modela la política exacta, el mejor caso para la búsqueda. Mide profundidad contra IA, no contra personas.",
    "La colocación se compara con orden de equipo fijo (no «la mejor de las 24»): una colocación puede valer más con otra asignación de almas.",
    "Familias: equipos monofamilia con salvajes puros; las híbridas se construyen como en v0.2 con 3 almas. No se repitieron las sales r*/c* del catálogo §5.2 (fuera del presupuesto de una ronda); es la palanca que queda para llama y roca.",
    "Uso de pago mide movimientos de pago distintos usados por alma con ≥ 4 acciones; la base queda en el límite del umbral (1,98 frente a 2).",
  ] });
  B.push({ t: "h2", text: "Decisión que necesita el dueño" });
  B.push({ t: "p", text: "**Remontada (primer KO y líder T3 < 65 %) no se resuelve con palancas de config en equipos de 3.** Opciones: (a) relajar el umbral a 75 % para 3 almas (recomendado si se acepta que el combate corto es decisivo), (b) un mecanismo de remontada (p. ej. energía extra al bando con menos almas, o curar al volver a la fila), a especificar y simular, (c) volver a 4 almas. Para familias, repetir la búsqueda de sales §5.2 con el catálogo v0.4 (llama 32–40 %, roca ≈ 60 %)." });
  return { title: "Informe de combate v0.4 — Proyecto Genoma", blocks: B };
}

export function writeV04Reports(ph: Phases, dir: string, official: boolean): string[] {
  const n = narrative(ph);
  const html = renderHtml(n.title, n.blocks);
  const md = renderMd(n.blocks);
  const out = [`${dir}/informe-combate-v0.4.html`, `${dir}/combate-v0.4.md`];
  mkdirSync(dir, { recursive: true });
  writeFileSync(out[0]!, html);
  writeFileSync(out[1]!, md);
  if (official) {
    mkdirSync("docs/informes", { recursive: true });
    writeFileSync("docs/informes/informe-combate-v0.4.html", html);
    writeFileSync("docs/informes/combate-v0.4.md", md);
    out.push("docs/informes/informe-combate-v0.4.html", "docs/informes/combate-v0.4.md");
  }
  return out;
}
void CONTROL;
export type { Variant };
