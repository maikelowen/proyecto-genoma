/**
 * Guardado de la partida (progresión v0.1 §7): texto JSON con formato y versión.
 * `parseSave` valida sin tiradas; si algo no cuadra lanza `SaveError` y no se pisa nada.
 */
import { cyrb128 } from "../rng.ts";
import { checkInvariants, creatureFamily } from "../genetics/creature.ts";
import { LOCUS_IDS, type Creature, type LocusId } from "../genetics/types.ts";
import { VARIANT_AXES, type ProgressionConfig } from "./config.ts";
import { animaId, combatantOf, levelOf, unlockedSlots, xpForLevel, type Anima, type ChosenVariant, type MoveSlot, type MoveSlots } from "./anima.ts";
import type { GameState } from "./game.ts";
import { variantCandidates, geneMove } from "./variants.ts";

export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveError";
  }
}
function bad(path: string, msg: string): never {
  throw new SaveError(`${path}: ${msg}`);
}

/** progresión §7 — texto del guardado (JSON; el orden de claves es el de construcción). */
export function serialize(game: GameState): string {
  return JSON.stringify(game);
}
/** Huella del estado (cyrb128 del texto guardado). */
export function gameHash(game: GameState): string {
  return cyrb128(serialize(game))
    .map((w) => w.toString(16).padStart(8, "0"))
    .join("");
}

type O = Record<string, unknown>;
function o(v: unknown, p: string): O {
  if (typeof v !== "object" || v === null || Array.isArray(v)) bad(p, "se esperaba un objeto");
  return v as O;
}
function a(v: unknown, p: string): unknown[] {
  if (!Array.isArray(v)) bad(p, "se esperaba una lista");
  return v;
}
function n(v: unknown, p: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) bad(p, `se esperaba un entero en [${min}, ${max}]`);
  return v;
}
function s(v: unknown, p: string): string {
  if (typeof v !== "string" || v.length === 0) bad(p, "se esperaba un texto no vacío");
  return v;
}
function b(v: unknown, p: string): boolean {
  if (typeof v !== "boolean") bad(p, "se esperaba un booleano");
  return v;
}
function strs(v: unknown, p: string): string[] {
  const out = a(v, p).map((x, i) => s(x, `${p}[${i}]`));
  if (new Set(out).size !== out.length) bad(p, "elementos repetidos");
  return out;
}

const ORIGINS = ["inicial", "captura", "eco"] as const;

/**
 * progresión §7.1 — carga y valida (sin tiradas): formato, versión, contadores, invariantes de GEN,
 * huecos coherentes con el nivel, variantes y equipo ⊂ ánimas. Una variante guardada que ya no es
 * válida con el catálogo vigente pasa a pendiente (se quita y su hueco vuelve al original; QA B-08)
 * y se anota en `notes`. Las versiones de config se actualizan a las cargadas.
 */
export function parseSave(text: string, cfg: ProgressionConfig): { game: GameState; notes: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    bad("guardado", "no es JSON");
  }
  try {
    return parseGame(raw, cfg);
  } catch (e) {
    if (e instanceof SaveError) throw e;
    throw new SaveError(`guardado: datos corruptos (${e instanceof Error ? e.message : String(e)})`);
  }
}

function parseGame(raw: unknown, cfg: ProgressionConfig): { game: GameState; notes: string[] } {
  const r = o(raw, "guardado");
  if (r["formato"] !== cfg.save.format) bad("formato", `se esperaba '${cfg.save.format}'`);
  if (r["version"] !== cfg.save.formatVersion) bad("version", `versión de formato desconocida (${String(r["version"])})`);
  const semilla = s(r["semilla"], "semilla");
  const cv = o(r["config"], "config");
  for (const k of ["progresion", "genetica", "movimientos", "combate"]) s(cv[k], `config.${k}`);
  if (cv["progresion"] !== cfg.versions.progresion) bad("config.progresion", `partida de progresión v${String(cv["progresion"])}`);
  const ct = o(r["contadores"], "contadores");
  const contadores = { encuentros: n(ct["encuentros"], "contadores.encuentros"), faroles: n(ct["faroles"], "contadores.faroles"), resonancias: n(ct["resonancias"], "contadores.resonancias"), nacimientos: n(ct["nacimientos"], "contadores.nacimientos", 0, 999999) };
  const rc = o(r["recursos"], "recursos");
  const recursos = { faroles: n(rc["faroles"], "recursos.faroles", 0, cfg.resources.lanternsMax), esencia: n(rc["esencia"], "recursos.esencia", 0, cfg.resources.essenceMax) };
  const nivelMax = n(r["nivel_max_alcanzado"], "nivel_max_alcanzado", 0, cfg.levels.max);
  const ini = o(r["inicial"], "inicial");
  const el = ini["elegida"];
  if (el !== null && el !== 0 && el !== 1 && el !== 2) bad("inicial.elegida", "0, 1, 2 o null");
  const inicial = { elegida: el as 0 | 1 | 2 | null, intro_vista: b(ini["intro_vista"], "inicial.intro_vista") };

  const notes: string[] = [];
  const animasRaw = a(r["animas"], "animas");
  if (animasRaw.length > cfg.collection.max) bad("animas", `más de ${cfg.collection.max}`);
  const animas = animasRaw.map((x, i) => parseAnima(x, `animas[${i}]`, contadores.nacimientos, cfg, notes));
  if (new Set(animas.map((x) => x.id)).size !== animas.length) bad("animas", "ids repetidos");
  if (inicial.elegida === null && animas.length > 0) bad("inicial.elegida", "hay ánimas sin inicial elegida");
  let top = 0;
  for (const x of animas) top = Math.max(top, levelOf(x.xp, cfg));
  if (nivelMax < top) bad("nivel_max_alcanzado", `menor que el nivel de un ánima (${top})`);

  const equipo = strs(r["equipo"], "equipo");
  if (inicial.elegida !== null && (equipo.length < cfg.collection.teamMin || equipo.length > cfg.collection.teamMax)) bad("equipo", `de ${cfg.collection.teamMin} a ${cfg.collection.teamMax}`);
  if (inicial.elegida === null && equipo.length > 0) bad("equipo", "equipo sin inicial");
  for (const id of equipo) if (!animas.some((x) => x.id === id)) bad("equipo", `'${id}' no está en la colección`);

  // QA N-06: las familias del códice y del linaje son familias del catálogo (base o híbrida)
  const knownFamily = (f: string, p: string): string => {
    if (!cfg.genetics.baseFamilies.includes(f) && !cfg.genetics.hybridById.has(f)) bad(p, `familia desconocida '${f}'`);
    return f;
  };
  const cx = o(r["codex"], "codex");
  const codex = {
    genes: strs(cx["genes"], "codex.genes"),
    mutaciones: a(cx["mutaciones"], "codex.mutaciones").map((x, i) => {
      const p = `codex.mutaciones[${i}]`;
      const m = o(x, p);
      return { clave: s(m["clave"], `${p}.clave`), id: s(m["id"], `${p}.id`), resonancia: n(m["resonancia"], `${p}.resonancia`, 1, contadores.resonancias), animaId: s(m["animaId"], `${p}.animaId`) };
    }),
    familias: strs(cx["familias"], "codex.familias").map((f, i) => knownFamily(f, `codex.familias[${i}]`)),
  };
  const linaje = a(r["linaje"], "linaje").map((x, i) => {
    const p = `linaje[${i}]`;
    const l = o(x, p);
    const genesD = a(l["genesD"], `${p}.genesD`).map((g, k) => s(g, `${p}.genesD[${k}]`));
    if (genesD.length !== LOCUS_IDS.length) bad(`${p}.genesD`, "deben ser 4");
    return { id: s(l["id"], `${p}.id`), nombre: s(l["nombre"], `${p}.nombre`), familia: knownFamily(s(l["familia"], `${p}.familia`), `${p}.familia`), genesD };
  });
  const rg = o(r["registro"], "registro");
  const registro = {
    sesiones: n(rg["sesiones"], "registro.sesiones"),
    combates: n(rg["combates"], "registro.combates"),
    victorias: n(rg["victorias"], "registro.victorias"),
    capturas: n(rg["capturas"], "registro.capturas"),
    intentos: n(rg["intentos"], "registro.intentos"),
    resonancias: n(rg["resonancias"], "registro.resonancias"),
  };
  const game: GameState = {
    formato: cfg.save.format,
    version: cfg.save.formatVersion,
    semilla,
    config: { ...cfg.versions },
    contadores,
    recursos,
    nivel_max_alcanzado: nivelMax,
    inicial,
    animas,
    equipo,
    codex,
    linaje,
    registro,
  };
  return { game, notes };
}

function parseSlot(v: unknown, p: string): MoveSlot {
  if (v === null) return null;
  const x = o(v, p);
  if (x["fuente"] === "gen") {
    const L = s(x["locus"], `${p}.locus`);
    if (!(LOCUS_IDS as readonly string[]).includes(L)) bad(`${p}.locus`, `locus '${L}'`);
    return { fuente: "gen", locus: L as LocusId, variante: b(x["variante"], `${p}.variante`) };
  }
  if (x["fuente"] === "habilidad") return { fuente: "habilidad", id: s(x["id"], `${p}.id`) };
  return bad(`${p}.fuente`, "gen | habilidad");
}

function parseAnima(v: unknown, p: string, births: number, cfg: ProgressionConfig, notes: string[]): Anima {
  const x = o(v, p);
  const nacimiento = n(x["nacimiento"], `${p}.nacimiento`, 1, births);
  const id = s(x["id"], `${p}.id`);
  if (id !== animaId(nacimiento)) bad(`${p}.id`, `debe ser ${animaId(nacimiento)}`);
  const nombre = s(x["nombre"], `${p}.nombre`);
  if ([...nombre].length > cfg.collection.nameMaxChars) bad(`${p}.nombre`, "demasiado largo");
  if (nombre.trim() === "") bad(`${p}.nombre`, "vacío"); // QA N-06 (checkName lo rechaza al renombrar)
  const criatura = x["criatura"] as Creature;
  o(criatura, `${p}.criatura`);
  if (criatura.id !== id || criatura.birth !== nacimiento) bad(`${p}.criatura`, "id y nacimiento deben coincidir con los del ánima");
  if (!Number.isInteger(criatura.offspringCount) || criatura.offspringCount < 0 || criatura.offspringCount > cfg.genetics.limits.maxOffspring) bad(`${p}.criatura.offspringCount`, "fuera de rango");
  const errs = checkInvariants(criatura, cfg.genetics);
  if (errs.length > 0) bad(`${p}.criatura`, errs[0] as string);
  if (criatura.family !== creatureFamily(criatura.genome, cfg.genetics)) bad(`${p}.criatura.family`, "no corresponde al genoma");
  const xp = n(x["xp"], `${p}.xp`, 0, xpForLevel(cfg.levels.max, cfg));
  const level = levelOf(xp, cfg);
  const origen = x["origen"];
  if (!(ORIGINS as readonly unknown[]).includes(origen)) bad(`${p}.origen`, ORIGINS.join(" | "));
  const lugar = x["lugar"];
  if (lugar !== null && !cfg.world.zones.some((z) => z.id === lugar)) bad(`${p}.lugar`, "zona desconocida");

  // §8.1 invariantes de huecos
  const hr = a(x["huecos"], `${p}.huecos`);
  if (hr.length !== 4) bad(`${p}.huecos`, "deben ser 4");
  const huecos = hr.map((h, k) => parseSlot(h, `${p}.huecos[${k}]`)) as MoveSlot[];
  const h0 = huecos[0];
  if (h0 === null || h0 === undefined || h0.fuente !== "gen" || h0.locus !== cfg.unlocks.freeLocus) bad(`${p}.huecos[0]`, `debe ser el gen de ${cfg.unlocks.freeLocus}`);
  const open = unlockedSlots(level, cfg);
  const seen = new Set<string>();
  huecos.forEach((h, k) => {
    if ((h !== null) !== open[k]) bad(`${p}.huecos[${k}]`, `abierto ⇔ nivel ≥ ${k === 0 ? 1 : (cfg.unlocks.paidSlots[k - 1] as { level: number }).level}`);
    if (h === null) return;
    const key = h.fuente === "gen" ? `gen:${h.locus}` : `hab:${h.id}`;
    if (seen.has(key)) bad(`${p}.huecos[${k}]`, "repetido");
    seen.add(key);
    if (k > 0 && h.fuente === "gen" && h.locus === cfg.unlocks.freeLocus) bad(`${p}.huecos[${k}]`, "un hueco de pago no apunta al gratis");
    if (h.fuente === "habilidad") bad(`${p}.huecos[${k}]`, "las habilidades llegan en el paso 2");
  });
  const revelados = strs(x["revelados"], `${p}.revelados`);
  for (const r of revelados) {
    const [L, sl, ...rest] = r.split(".");
    if (rest.length > 0 || !(LOCUS_IDS as readonly string[]).includes(L as string) || (sl !== "R1" && sl !== "R2")) bad(`${p}.revelados`, `posición '${r}'`);
  }
  const aprendidas = strs(x["aprendidas"], `${p}.aprendidas`);

  // §4.5 / QA B-03, B-08: variantes
  const vr = o(x["variantes"], `${p}.variantes`);
  const variantes: Partial<Record<LocusId, ChosenVariant>> = {};
  const levelsUsed = new Set<number>();
  for (const L of Object.keys(vr)) {
    const q = `${p}.variantes.${L}`;
    if (!(LOCUS_IDS as readonly string[]).includes(L)) bad(q, "locus desconocido");
    const e = o(vr[L], q);
    const nivel = n(e["nivel"], `${q}.nivel`);
    if (!cfg.variants.levels.includes(nivel)) bad(`${q}.nivel`, "no es nivel de variante");
    if (nivel > level) bad(`${q}.nivel`, `nivel ${level} insuficiente`); // nunca existe con nivel insuficiente
    if (levelsUsed.has(nivel)) bad(`${q}.nivel`, "nivel repetido");
    levelsUsed.add(nivel);
    const eje = e["eje"];
    if (!(VARIANT_AXES as readonly unknown[]).includes(eje)) bad(`${q}.eje`, VARIANT_AXES.join(" | "));
    const pieza = s(e["pieza"], `${q}.pieza`);
    const ok = variantCandidates(geneMove(criatura, L as LocusId, cfg), cfg).some((c) => c.change.eje === eje && c.change.pieza === pieza);
    if (!ok) {
      notes.push(`${id}: la variante de ${L} (${String(eje)} = ${pieza}) ya no es válida con el catálogo vigente; vuelve a estar pendiente`);
      continue;
    }
    variantes[L as LocusId] = { nivel, eje: eje as ChosenVariant["eje"], pieza };
  }
  const fixedSlots = huecos.map((h, k) => {
    if (h === null || h.fuente !== "gen" || !h.variante) return h;
    if (variantes[h.locus] !== undefined) return h;
    if (vr[h.locus] === undefined) bad(`${p}.huecos[${k}].variante`, "sin variante elegida");
    return { ...h, variante: false };
  }) as unknown as MoveSlots;
  const anima: Anima = { id, nombre, criatura, xp, origen: origen as Anima["origen"], lugar: lugar as string | null, nacimiento, huecos: fixedSlots, revelados, aprendidas, variantes };
  combatantOf(anima, cfg); // los genes generan movimientos (claves y familias conocidas)
  return anima;
}
