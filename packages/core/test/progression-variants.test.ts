/** Variantes de movimiento de los niveles 15/20/25/30 (progresión v0.1 §4.5, D-068, D-070, QA B-01…B-10). */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assembleExact,
  chooseStarter,
  chooseVariant,
  combatantOf,
  createRng,
  createWildPopulation,
  effectivePoints,
  gainXp,
  generateMove,
  generateMoveForKey,
  geneMove,
  levelOf,
  moveVariants,
  newGame,
  openSlots,
  parseSave,
  pendingVariants,
  serialize,
  toggleVariant,
  validateMove,
  variantCandidates,
  variantOffer,
  xpForLevel,
  LOCUS_IDS,
  type Anima,
  type Creature,
  type GameState,
  type LocusId,
  type Move,
} from "../src/index.ts";
import { CFG as GCFG, catalogGene, makeCreature } from "./genetics-helpers.ts";
import { P, loadProg } from "./progression-helpers.ts";

const M = P.battle.moves;
const pieces = (m: Move): number => (m.modifier ? 1 : 0) + (m.status ? 1 : 0) + (m.condition ? 1 : 0);

/** Comprueba todas las garantías de un candidato frente a su original. */
function checkCandidates(orig: Move): number {
  const pe0 = effectivePoints(orig, M);
  const C = variantCandidates(orig, P);
  for (const c of C) {
    const v = c.move;
    const where = `${orig.key} ${c.change.eje}=${c.change.pieza}`;
    assert.deepEqual(validateMove(v, M), [], where);
    assert.equal(v.cost, orig.cost, where);
    assert.equal(v.archetype, orig.archetype, where);
    assert.equal(v.scalable, orig.scalable, where);
    assert.equal(v.budget, orig.budget, where);
    // difiere en exactamente esa pieza
    const diff = (["modifier", "status", "condition"] as const).filter((k) => v[k] !== orig[k]);
    assert.equal(diff.length, 1, where);
    assert.equal(v.extraEnergy, orig.extraEnergy, where);
    assert.equal(v.taunt, orig.taunt, where);
    // D-072 / N-01: como mucho `tolerancia_puntos` (1) más que el original, y no más de `holgura` por debajo
    assert.ok(c.effectivePoints <= pe0 + P.variants.tolerancePoints + 1e-9, `${where}: ${c.effectivePoints} > ${pe0}`);
    assert.ok(c.effectivePoints >= pe0 - P.variants.slack - 1e-9, `${where}: holgura`);
    // ninguna variante con más piezas y la misma potencia (o más)
    if (pieces(v) > pieces(orig)) assert.ok(v.power < orig.power, `${where}: pieza gratis`);
  }
  return C.length;
}

describe("candidatos (§4.5)", () => {
  it("los 72 genes del catálogo: válidos, una pieza, mismo coste y arquetipo, puntos efectivos ≤ original y ≥ original − holgura", () => {
    let total = 0;
    for (const t of GCFG.catalog) total += checkCandidates(generateMove(t, M));
    assert.ok(total > 72 * 4, `${total} candidatos`);
  });
  it("D-072/N-01: genes del catálogo con < 2 candidatas ≤ 2/72, y ninguna variante gana una pieza gratis", () => {
    let few = 0;
    let freebies = 0;
    for (const t of GCFG.catalog) {
      const m = generateMove(t, M);
      const C = variantCandidates(m, P);
      if (C.length < 2) few++;
      for (const c of C) if (pieces(c.move) > pieces(m) && !(c.move.power < m.power)) freebies++;
    }
    assert.ok(few <= 2, `${few} genes con menos de 2 candidatas`);
    assert.equal(freebies, 0);
    // sin la tolerancia (valor 0, como antes) el catálogo se rompía: la palanca existe y funciona
    const P0 = loadProg((r) => { r.variantes.tolerancia_puntos = 0; });
    let few0 = 0;
    for (const t of GCFG.catalog) if (variantCandidates(generateMove(t, M), P0).length < 2) few0++;
    assert.ok(few0 > 2, `con tolerancia 0 hay ${few0}`);
  });
  it("500 genes de salvajes al azar (todas las familias base) y sus claves mutadas vecinas cumplen lo mismo", () => {
    const pop = createWildPopulation(createRng("var-mut"), GCFG, 40);
    let n = 0;
    for (const c of pop) for (const L of LOCUS_IDS) for (const s of ["D", "R1", "R2"] as const) {
      const g = c.genome[L][s];
      checkCandidates(generateMove(g, M));
      // firma vecina (como una mutación de forma): clave fuera del catálogo
      const sig = g.signature.split("").map((d, i) => (i === 0 ? String((Number(d) + 1) % 5) : d)).join("");
      checkCandidates(generateMoveForKey(`${g.family}|${L}|${sig}`, M));
      n += 2;
    }
    assert.ok(n >= 500);
  });
  it("ejemplo de la spec: golpe de cola coste 3 con alcance → «área» 75 (26,25) y «objetivo_con_estado» 110 (26,85)", () => {
    const base = generateMove(catalogGene("llama.cola.1"), M);
    const orig: Move = { ...base, cost: 3, budget: 27, archetype: "golpe", scalable: "dano", target: "enemigo", modifier: "alcance", status: null, condition: null, area: false, extraEnergy: 0, power: 130, scalablePoints: 26, points: 27, fallback: 0 };
    delete (orig as { taunt?: true }).taunt;
    assert.deepEqual(validateMove(orig, M), []);
    assert.equal(effectivePoints(orig, M), 27);
    const area = assembleExact(orig, { eje: "modificador", pieza: "area" }, M)!;
    assert.deepEqual([area.power, area.area, effectivePoints(area, M)], [75, true, 26.25]);
    const cond = assembleExact(orig, { eje: "condicion", pieza: "objetivo_con_estado" }, M)!;
    assert.equal(cond.power, 110);
    assert.ok(Math.abs(effectivePoints(cond, M) - 26.85) < 1e-9);
    const C = variantCandidates(orig, P).map((c) => `${c.change.eje}:${c.change.pieza}`);
    assert.ok(C.includes("modificador:area") && C.includes("condicion:objetivo_con_estado"));
    assert.ok(!C.includes("modificador:prioridad"), "en la cola solo alcance ↔ área");
    assert.ok(!C.some((x) => x.startsWith("estado")), "golpe: sin eje de estado");
  });
  it("una protección con el escudo en el tope (300) no admite «+prisa» (QA B-01)", () => {
    const orig = generateMoveForKey("sombra|cuerpo|4214", M);
    assert.equal(orig.power, 300);
    assert.ok(!variantCandidates(orig, P).some((c) => c.change.pieza === "prisa"));
    assert.equal(assembleExact(orig, { eje: "estado", pieza: "prisa" }, M) !== null, true, "cabe, pero gasta más puntos efectivos");
  });
  it("assembleExact: null si no cambia nada, si la pieza no existe o si no cabe; nunca toca energía ni provocar", () => {
    const orig = generateMove(catalogGene("llama.cola.1"), M);
    assert.equal(assembleExact(orig, { eje: "condicion", pieza: orig.condition ?? "ninguno" }, M), null);
    assert.equal(assembleExact(orig, { eje: "condicion", pieza: "luna" }, M), null);
    assert.equal(assembleExact({ ...orig, extraEnergy: 1 }, { eje: "estado", pieza: "prisa" }, M), null);
  });
});

describe("sorteo, respaldo y elección (§4.5, QA B-03, B-08, B-09)", () => {
  /** Criatura homocigota con el gen de catálogo `ids[L]` en cada locus (por defecto, variante 1 de llama). */
  const creature = (over: Partial<Record<LocusId, string>> = {}): Creature =>
    makeCreature("a000001", (L) => {
      const id = over[L] ?? `llama.${L}.1`;
      const t = GCFG.catalogById.get(id) ?? [...GCFG.catalog].find((x) => `${x.family}|${x.locus}|${x.signature}` === id);
      const g = catalogGene(t!.id);
      return { D: g, R1: g, R2: g };
    }, { birth: 1 });
  const keyId = (key: string): string => [...GCFG.catalog].find((x) => `${x.family}|${x.locus}|${x.signature}` === key)!.id;

  it("determinista: misma clave y nivel ⇒ mismas A y B; A y B en ejes distintos si se puede; 2 tiradas", () => {
    const m = generateMove(catalogGene("marea.cuerpo.2"), M);
    const v1 = moveVariants(m, 25, P)!;
    assert.deepEqual(moveVariants(m, 25, P), v1);
    assert.ok(v1.B !== null);
    const C = variantCandidates(m, P);
    if (new Set(C.map((c) => c.change.eje)).size > 1) assert.notEqual(v1.A.change.eje, v1.B!.change.eje);
    const rng = createRng(`var|v0.1|${m.key}|25`);
    const u1 = rng.next();
    assert.deepEqual(v1.A.change, C[Math.floor(u1 * C.length)]!.change);
  });

  it("n = 0 en el locus del nivel → pasa al siguiente de orden_respaldo con n ≥ 2 (sorteo con su clave y el mismo nivel)", () => {
    const c = creature({ cuerpo: keyId("sombra|cuerpo|4214") }); // escudo en el tope: sin variante justa
    assert.equal(variantCandidates(geneMove(c, "cuerpo", P), P).length, 0);
    const o = variantOffer(c, 25, new Set(), P)!;
    const next = (["cola", "cabeza", "extremidades"] as const).find((L) => variantCandidates(geneMove(c, L, P), P).length >= 2)!;
    assert.equal(o.locus, next);
    assert.deepEqual(o, variantOffer(c, 25, new Set(), P));
    const direct = moveVariants(geneMove(c, next, P), 25, P)!;
    assert.deepEqual([o.A.change, o.B?.change], [direct.A.change, direct.B?.change]);
  });

  it("n = 1 y nada mejor → solo A; nada → null (el nivel solo revela)", () => {
    const c = creature({ cuerpo: keyId("voltio|cuerpo|1241") });
    assert.equal(variantCandidates(geneMove(c, "cuerpo", P), P).length, 1);
    const taken = new Set<LocusId>(["cola", "cabeza", "extremidades"]);
    const o = variantOffer(c, 25, taken, P)!;
    assert.equal(o.locus, "cuerpo");
    assert.equal(o.B, null);
    assert.equal(variantOffer(c, 25, new Set<LocusId>(LOCUS_IDS), P), null);
  });

  /** Partida con un ánima de nivel `level` hecha de la criatura dada. */
  const gameWith = (c: Creature, level: number): GameState => {
    const g = chooseStarter(newGame("var", P), 0, P);
    const a: Anima = { ...g.animas[0]!, criatura: c, xp: 0, huecos: openSlots(null, 1, P), revelados: [] };
    return { ...g, nivel_max_alcanzado: level, animas: [gainXp(a, xpForLevel(level, P), P).anima] };
  };

  it("captura de nivel 16: la variante de cola queda pendiente, el combate usa el original; elegir guarda {eje, pieza} y activa la variante; se puede volver al original", () => {
    let g = gameWith(creature(), 16);
    const a = g.animas[0]!;
    const pend = pendingVariants(a, P);
    assert.deepEqual(pend.map((o) => [o.level, o.locus]), [[15, "cola"]]);
    assert.deepEqual(combatantOf(a, P).moves[1], geneMove(a.criatura, "cola", P));
    assert.throws(() => chooseVariant(g, a.id, 20, "A", P), /pendiente/);
    g = chooseVariant(g, a.id, 15, "B", P);
    const b = g.animas[0]!;
    assert.deepEqual(b.variantes.cola, { nivel: 15, eje: pend[0]!.B!.change.eje, pieza: pend[0]!.B!.change.pieza });
    assert.deepEqual(pendingVariants(b, P), []);
    assert.deepEqual(combatantOf(b, P).moves[1], pend[0]!.B!.move);
    assert.throws(() => chooseVariant(g, a.id, 15, "A", P), /pendiente/, "definitiva");
    const back = toggleVariant(g, a.id, 1, P);
    assert.deepEqual(combatantOf(back.animas[0]!, P).moves[1], geneMove(a.criatura, "cola", P));
    assert.throws(() => toggleVariant(g, a.id, 2, P), /variante/);
    // guardado como pieza: ida y vuelta
    assert.deepEqual(parseSave(serialize(g), P).game.animas[0]!.variantes, b.variantes);
  });

  it("al cargar, una {eje, pieza} que ya no es válida (catálogo nuevo) vuelve a pendiente y el hueco al original; con nivel insuficiente, se rechaza", () => {
    let g = gameWith(creature(), 15);
    g = chooseVariant(g, "a000001", 15, "A", P);
    const a = g.animas[0]!;
    const broken: GameState = { ...g, animas: [{ ...a, variantes: { cola: { nivel: 15, eje: "modificador", pieza: "perforar" } } }] };
    const r = parseSave(serialize(broken), P);
    assert.deepEqual(r.game.animas[0]!.variantes, {});
    assert.equal(r.notes.length, 1);
    assert.ok(r.game.animas[0]!.huecos.every((s) => s === null || (s.fuente === "gen" && !s.variante)));
    assert.equal(pendingVariants(r.game.animas[0]!, P)[0]!.level, 15);
    const low: GameState = { ...g, animas: [{ ...a, xp: xpForLevel(14, P), huecos: openSlots(null, 14, P), revelados: a.revelados.slice(0, 3) }] };
    assert.throws(() => parseSave(serialize(low), P), /insuficiente/);
    assert.equal(levelOf(a.xp, P), 15);
  });

  it("el gratis (nivel 30) solo varía alcance, drenaje o condición; golpe_estado del gratis, estados de coste ≤ 1", () => {
    for (const t of GCFG.catalog.filter((x) => x.locus === "extremidades")) {
      const m = generateMove(t, M);
      for (const c of variantCandidates(m, P)) {
        if (c.change.eje === "modificador") assert.ok(["alcance", "drenaje", "ninguno"].includes(c.change.pieza));
        if (c.change.eje === "estado") assert.ok(["ralentizar", "marca", "debilitar", "ninguno"].includes(c.change.pieza));
      }
    }
  });
});
