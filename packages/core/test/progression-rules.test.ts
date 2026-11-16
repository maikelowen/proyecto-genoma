/** Progresión v0.1: config, niveles, experiencia, encuentros, atrapar, resonancia y colección (§1–§6). */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyBattleResult,
  breed,
  canResonate,
  catchChance,
  catchPercent,
  chooseStarter,
  combatantOf,
  companionCombatant,
  companionJoins,
  ConfigError,
  createRng,
  creatureQuality,
  defaultName,
  gainXp,
  GameRuleError,
  geneKey,
  levelOf,
  newGame,
  openSlots,
  pendingVariants,
  playEncounterBattle,
  release,
  releaseBlocker,
  releaseEssence,
  rename,
  resonanceCost,
  resonanceOdds,
  resonate,
  rollEncounter,
  rollWildGroup,
  setTeam,
  starterOptions,
  throwLantern,
  unlockedSlots,
  xpForLevel,
  zoneById,
  zoneUnlocked,
  LOCUS_IDS,
  type Anima,
  type BattleState,
  type Creature,
  type Encounter,
  type GameState,
} from "../src/index.ts";
import { CFG as GCFG, drawsConsumed } from "./genetics-helpers.ts";
import { loadProg, P } from "./progression-helpers.ts";

/** Partida con la inicial elegida. */
const started = (seed = "reglas"): GameState => chooseStarter(newGame(seed, P), 0, P);

/** Ánima de la partida con experiencia de un nivel dado (huecos y revelados coherentes). */
function atLevel(a: Anima, level: number): Anima {
  return gainXp({ ...a, xp: 0, huecos: openSlots(null, 1, P), revelados: [] }, xpForLevel(level, P), P).anima;
}
function withAnimas(g: GameState, animas: Anima[]): GameState {
  return { ...g, animas };
}

/** Final de combate sintético: B apagado entero (victoria) o A apagado (derrota), con la vida dada para A. */
function fakeEnd(g: GameState, enc: Encounter, result: "A" | "B", hpA?: number[]): BattleState {
  const teamsA = enc.team.map((id) => combatantOf(g.animas.find((a) => a.id === id)!, P));
  const A = [...teamsA, ...(enc.companion ? [companionCombatant(P)] : [])];
  const pad = <T>(xs: T[]): (T | null)[] => [...xs, null, null, null, null].slice(0, 4);
  const tA = pad(A);
  const tB = pad(enc.wilds.map((w) => ({ ...combatantOf(g.animas[0]!, P), id: w.creature.id })));
  return {
    turn: 5,
    energy: [3, 3],
    teams: [tA, tB],
    fighters: [
      tA.map((c, i) => ({ hp: c ? (result === "B" ? 0 : (hpA?.[i] ?? c.maxHp)) : 0, ko: !c || result === "B" || hpA?.[i] === 0, statuses: [], skipTurn: 0, stunImmuneUntil: 0 })),
      tB.map((c) => ({ hp: 0, ko: true, statuses: [], skipTurn: 0, stunImmuneUntil: 0 })),
    ],
    result,
  } as BattleState;
}

describe("config de progresión (§10.1)", () => {
  it("la config real carga y deriva lo esperado", () => {
    assert.equal(P.levels.max, 30);
    assert.equal(P.world.drawsPerEncounter, 622);
    assert.deepEqual(P.battle.sides?.placementsBySize[2], ["2+0", "1+1"]);
    assert.equal(P.battle.combat.teamSize, 3);
  });
  const bad: [string, (r: any) => void, RegExp][] = [
    ["xp_total corta", (r) => r.niveles.xp_total.pop(), /longitud/],
    ["xp_total no creciente", (r) => (r.niveles.xp_total[5] = r.niveles.xp_total[4]), /creciente/],
    ["xp_total no empieza en 0", (r) => (r.niveles.xp_total[0] = 1), /empezar en 0/],
    ["huecos de pago no crecientes", (r) => (r.desbloqueos.huecos_pago[2].nivel = 3), /crecientes/],
    ["loci de pago repetidos", (r) => (r.desbloqueos.huecos_pago[2].locus_por_defecto = "cola"), /distintos/],
    ["id de zona", (r) => (r.mundo.zonas[0].id = "Prado"), /no cumple/],
    ["pesos de grupo", (r) => (r.mundo.zonas[0].grupo_pesos = [1, 0]), /grupo_max/],
    ["pesos suma 0", (r) => (r.mundo.zonas[0].familias_pesos = { brote: 0 }), /suma/],
    ["familia híbrida en zona", (r) => (r.mundo.zonas[0].familias_pesos = { magma: 1 }), /no es base/],
    ["pct_min > pct_max", (r) => (r.atrapar.pct_min = 96), /pct_max/],
    ["pct no entero", (r) => (r.atrapar.base_pct = 60.5), /entero/],
    ["fórmula de tiradas", (r) => (r.mundo.encuentro.tiradas_por_encuentro = 621), /fórmula 622/],
    ["revelar longitudes", (r) => r.desbloqueos.revelar_ocultos.orden.pop(), /misma longitud/],
    ["revelar posición", (r) => (r.desbloqueos.revelar_ocultos.orden[0] = "cabeza.D"), /inválida/],
    ["variantes: tiradas", (r) => (r.variantes.tiradas = 3), /2/],
    ["variantes: niveles", (r) => (r.variantes.niveles = [15, 15, 25, 30]), /creciente/],
    ["variantes: locus repetido", (r) => (r.variantes.locus_por_nivel["20"] = "cola"), /distinto/],
    ["variantes: orden_respaldo", (r) => (r.variantes.orden_respaldo = ["cola", "cola", "cuerpo", "extremidades"]), /permutación/],
    ["variantes: eje", (r) => (r.variantes.ejes = ["modificador", "color"]), /eje/],
    ["variantes: pieza excluida inexistente", (r) => (r.variantes.piezas_excluidas = ["laser"]), /no existe/],
    ["variantes: holgura negativa", (r) => (r.variantes.holgura_puntos = -1), /rango/],
    ["liberar: divisor 0", (r) => (r.coleccion.liberar.divisor_nivel = 0), /rango/],
    ["liberar: nivel_minimo 0", (r) => (r.coleccion.liberar.nivel_minimo = 0), /rango/],
    ["resonancia: tiradas", (r) => (r.resonancia.tiradas_por_resonancia = 279), /280/],
    ["colocaciones de 3 ≠ combate", (r) => (r.combate_salvaje.colocaciones_por_tamano["3"] = ["2+1"]), /las de combate/],
    ["colocación de 2 mal formada", (r) => (r.combate_salvaje.colocaciones_por_tamano["2"] = ["0+2"]), /inválida/],
    ["flujos", (r) => r.guardado.flujos_rng.pop(), /flujos/],
  ];
  for (const [name, patch, re] of bad) {
    it(`rechaza: ${name}`, () => assert.throws(() => loadProg(patch), (e: unknown) => e instanceof ConfigError && re.test((e as Error).message)));
  }
});

describe("niveles y huecos (§4.1, §4.3, §8.1)", () => {
  it("tabla entera = 5·(L−1)·(L+2), nivel derivado y tope", () => {
    for (let L = 1; L <= 30; L++) assert.equal(xpForLevel(L, P), 5 * (L - 1) * (L + 2));
    assert.deepEqual([0, 19, 20, 49, 50, 139, 140, 4639, 4640, 99999].map((x) => levelOf(x, P)), [1, 1, 2, 2, 3, 4, 5, 29, 30, 30]);
  });
  it("huecos: gratis + cola a nivel 1; cabeza a 3; cuerpo a 10", () => {
    assert.deepEqual(unlockedSlots(1, P), [true, true, false, false]);
    assert.deepEqual(unlockedSlots(3, P), [true, true, true, false]);
    assert.deepEqual(unlockedSlots(10, P), [true, true, true, true]);
    assert.deepEqual(openSlots(null, 10, P).map((s) => s && s.fuente === "gen" && s.locus), ["extremidades", "cola", "cabeza", "cuerpo"]);
    // si el locus por defecto ya está en otro hueco, el primero de pago libre (cola, cabeza, cuerpo)
    const odd = openSlots([{ fuente: "gen", locus: "extremidades", variante: false }, { fuente: "gen", locus: "cabeza", variante: false }, null, null], 3, P);
    assert.deepEqual(odd.map((s) => s && s.fuente === "gen" && s.locus), ["extremidades", "cabeza", "cola", null]);
  });
  it("gainXp: abre huecos, madura, revela ocultos a 8, 11, …, ofrece variantes a 15; descarta lo que pasa de 4640", () => {
    const a = started().animas[0]!;
    const r = gainXp(a, xpForLevel(15, P), P);
    assert.equal(r.progress.levelAfter, 15);
    assert.deepEqual(r.progress.newSlots, ["cabeza", "cuerpo"]);
    assert.equal(r.progress.matured, true);
    assert.deepEqual(r.progress.revealed, ["cabeza.R1", "cuerpo.R1", "extremidades.R1"]);
    assert.deepEqual(r.progress.variantLevels, [15]);
    assert.equal(combatantOf(r.anima, P).moves.length, 4);
    assert.equal(combatantOf(a, P).moves.length, 2);
    assert.equal(combatantOf(a, P).moves[0]!.cost, 0, "gratis primero");
    const top = gainXp(r.anima, 99999, P);
    assert.equal(top.anima.xp, 4640);
    assert.equal(top.anima.revelados.length, 8);
    assert.throws(() => gainXp(a, -1, P), GameRuleError);
  });
});

describe("inicio, nombres y acompañante (§1.3, §1.4, §2.4)", () => {
  it("3 iniciales puras de llama, marea, brote (205 tiradas cada una); la elegida es a000001 y nace con nacimiento 1", () => {
    const g0 = newGame("ini", P);
    const opts = starterOptions(g0, P);
    assert.deepEqual(opts.map((c) => c.family), ["llama", "marea", "brote"]);
    for (const c of opts) for (const L of LOCUS_IDS) assert.equal(c.genome[L].D.family, c.family);
    assert.deepEqual(starterOptions(newGame("ini", P), P), opts);
    assert.notDeepEqual(starterOptions(newGame("otra", P), P)[0]!.genome.cabeza.D.quality, undefined);
    const g = chooseStarter(g0, 2, P, " Brix ");
    const a = g.animas[0]!;
    assert.deepEqual([a.id, a.criatura.id, a.nacimiento, a.criatura.birth, a.nombre, a.origen], ["a000001", "a000001", 1, 1, "Brix", "inicial"]);
    assert.deepEqual(g.equipo, ["a000001"]);
    assert.equal(g.contadores.nacimientos, 1);
    assert.equal(g.codex.genes.length >= 1, true);
    assert.throws(() => chooseStarter(g, 0, P), GameRuleError);
    assert.throws(() => chooseStarter(g0, 3, P), GameRuleError);
    assert.throws(() => chooseStarter(g0, 0, P, "x".repeat(17)), GameRuleError);
  });
  it("nombre por defecto: prefijo + sufijo con el flujo nombre|nacimiento (determinista)", () => {
    const n1 = defaultName({ semilla: "s" }, 4, P);
    assert.equal(n1, defaultName({ semilla: "s" }, 4, P));
    const rng = createRng("s|nombre|4");
    assert.equal(n1, P.names.prefixes[Math.floor(rng.next() * 16)]! + P.names.suffixes[Math.floor(rng.next() * 8)]!);
  });
  it("acompañante: sombra pura de nivel 10 (4 movimientos), fijo, solo mientras tengas < 2 ánimas", () => {
    const c = companionCombatant(P);
    assert.equal(c.family, "sombra");
    assert.equal(c.moves.length, 4);
    assert.deepEqual(companionCombatant(P), c);
    const g = started();
    assert.equal(companionJoins(g, P), true);
    assert.equal(companionJoins(withAnimas(g, [g.animas[0]!, { ...g.animas[0]!, id: "a000002" }]), P), false);
  });
});

describe("encuentros (§2.1, §2.3)", () => {
  it("622 tiradas fijas por encuentro, en todas las zonas", () => {
    for (const z of P.world.zones) assert.equal(drawsConsumed(z.id, (rng) => rollWildGroup(rng, z, 0, P), 700), 622);
  });
  it("determinista; contador incrementado al empezar; ids temporales w<n>-<i> y birth 0; nivel y familia de la zona", () => {
    const g = started();
    const r1 = rollEncounter(g, "prado_linde", P);
    assert.deepEqual(rollEncounter(g, "prado_linde", P), r1);
    assert.equal(r1.game.contadores.encuentros, 1);
    const r2 = rollEncounter(r1.game, "prado_linde", P);
    assert.equal(r2.encounter.n, 1);
    const z = zoneById("prado_linde", P);
    for (let n = 0; n < 40; n++) {
      const ws = rollWildGroup(createRng(`g${n}`), z, n, P);
      assert.ok(ws.length >= 1 && ws.length <= 2, "prado: grupo 1 o 2 (peso 0 al 3)");
      ws.forEach((w, i) => {
        assert.equal(w.creature.id, `w${n}-${i}`);
        assert.equal(w.creature.birth, 0);
        assert.ok(w.level >= 1 && w.level <= 3);
      });
    }
  });
  it("zonas: se abren con max(nivel, nivel_max_alcanzado); liberar no las cierra", () => {
    const g = started();
    assert.equal(zoneUnlocked(g, "marismas_quietas", P), false);
    assert.throws(() => rollEncounter(g, "marismas_quietas", P), GameRuleError);
    const g5 = { ...g, nivel_max_alcanzado: 5 };
    assert.equal(zoneUnlocked(g5, "marismas_quietas", P), true);
    assert.equal(zoneUnlocked(g5, "cantil_farol_roto", P), false);
    assert.throws(() => rollEncounter(newGame("x", P), "prado_linde", P), /inicial/);
  });
});

describe("experiencia, recursos y combate (§2.2, §3.3, §4.2, §5.2)", () => {
  const setup = (): { g: GameState; enc: Encounter } => {
    const g = started("xp");
    const { game, encounter } = rollEncounter(g, "prado_linde", P);
    return { g: game, enc: encounter };
  };
  it("victoria: suma entera para cada ánima (también apagadas), +1 farol, esencia 5 + floor(nivel/2); acompañante sin nada", () => {
    const { g, enc } = setup();
    const sum = enc.wilds.reduce((s, w) => s + 15 + 5 * w.level, 0);
    const ess = enc.wilds.reduce((s, w) => s + 5 + Math.floor(w.level / 2), 0);
    const r = applyBattleResult(g, enc, fakeEnd(g, enc, "A", [0]), P);
    assert.equal(r.report.xpEach, sum);
    assert.equal(r.game.animas[0]!.xp, sum);
    assert.equal(r.game.recursos.faroles, 7);
    assert.equal(r.game.recursos.esencia, 30 + ess);
    assert.equal(r.report.progress.length, 1, "el acompañante no recibe experiencia");
    assert.deepEqual(r.encounter.teamHp, { sv: 0, sm: combatantOf(g.animas[0]!, P).maxHp });
    assert.equal(r.game.registro.victorias, 1);
    assert.throws(() => applyBattleResult(r.game, r.encounter, "huida", P), GameRuleError);
  });
  it("derrota: floor(suma de las apagadas / 2); huida: 0; topes de faroles y esencia", () => {
    const { g, enc } = setup();
    const end = fakeEnd(g, enc, "B");
    // derrota con todas las salvajes apagadas (caso extremo): floor(suma/2), sin faroles ni esencia
    const sum = enc.wilds.reduce((s, w) => s + 15 + 5 * w.level, 0);
    const lost = applyBattleResult(g, enc, { ...end, fighters: [end.fighters[0], end.fighters[1]] }, P);
    assert.equal(lost.report.xpEach, Math.floor(sum / 2));
    assert.equal(lost.game.recursos.faroles, 6);
    assert.equal(applyBattleResult(g, enc, "huida", P).report.xpEach, 0);
    const full = { ...g, recursos: { faroles: 12, esencia: 998 } };
    const r = applyBattleResult(full, enc, fakeEnd(full, enc, "A"), P);
    assert.deepEqual(r.game.recursos, { faroles: 12, esencia: 999 });
  });
  it("combate real 1 + acompañante contra el grupo, con planes válidos", () => {
    const { g, enc } = setup();
    assert.equal(enc.companion, true);
    const b = playEncounterBattle(g, enc, P);
    for (const e of b.log.flat()) if (e.type === "plan") assert.equal(e.valid, true, String(e.reason));
    assert.equal(playEncounterBattle(g, enc, P).hash, b.hash);
  });
});

describe("atrapar (§3)", () => {
  it("porcentajes enteros: ejemplos de la spec (73/93 y 51/71), clamp 25..95", () => {
    const g = started("pct");
    const c = g.animas[0]!.criatura;
    const withQ = (c100: number): Creature => {
      // calidad media de los D = c100/100 (solo se usa creatureQuality)
      const genome = Object.fromEntries(LOCUS_IDS.map((L) => [L, { ...c.genome[L], D: { ...c.genome[L].D, quality: c100 / 100 } }])) as unknown as Creature["genome"];
      return { ...c, genome };
    };
    assert.equal(Math.round(creatureQuality(withQ(9000)) * 100), 9000);
    assert.equal(catchPercent(80, 100, 3, 3, withQ(9000), 0, P), 73);
    assert.equal(catchPercent(80, 100, 3, 3, withQ(9000), 1, P), 93);
    assert.equal(catchPercent(20, 100, 3, 3, withQ(9405), 0, P), 51);
    assert.equal(catchPercent(20, 100, 3, 3, withQ(9405), 1, P), 71);
    assert.equal(catchPercent(0, 100, 16, 1, withQ(9450), 0, P), 25);
    assert.equal(catchPercent(100, 100, 1, 9, withQ(8550), 1, P), 95);
    assert.equal(catchPercent(80, 100, 5, 3, withQ(9000), 0, P), 63, "dn = 2 → −10");
  });
  it("flujo: 1 tirada (farol|k); atrapada → a00000m con su nivel; falla 2 veces → se escapa; bloqueos", () => {
    let g = started("farol");
    const r = rollEncounter(g, "prado_linde", P);
    g = r.game;
    const v = applyBattleResult(g, r.encounter, fakeEnd(g, r.encounter, "A"), P);
    g = v.game;
    let enc = v.encounter;
    assert.equal(catchChance(g, enc, 0, P), catchPercent(enc.teamHp!.sv, enc.teamHp!.sm, enc.wilds[0]!.level, levelOf(g.animas[0]!.xp, P), enc.wilds[0]!.creature, 0, P));
    // forzar fallos y aciertos con el % (sin tocar el azar): pct 0 → falla siempre
    const pct = catchChance(g, enc, 0, P)!;
    const k = g.contadores.faroles;
    const roll = Math.floor(createRng(`${g.semilla}|farol|${k}`).next() * 100);
    const t1 = throwLantern(g, enc, 0, P);
    assert.equal(t1.roll, roll);
    assert.equal(t1.caught, roll < pct);
    assert.equal(t1.game.recursos.faroles, g.recursos.faroles - 1);
    assert.equal(t1.game.contadores.faroles, k + 1);
    if (t1.caught) {
      const a = t1.anima!;
      assert.deepEqual([a.id, a.nacimiento, a.origen, a.lugar, levelOf(a.xp, P)], ["a000002", 2, "captura", "prado_linde", enc.wilds[0]!.level]);
      assert.equal(geneKey(a.criatura.genome.cola.D), geneKey(enc.wilds[0]!.creature.genome.cola.D));
      assert.equal(catchChance(t1.game, t1.encounter, 0, P), null);
    } else {
      assert.equal(t1.encounter.wilds[0]!.state, "libre");
      assert.equal(catchChance(t1.game, t1.encounter, 0, P), Math.min(95, pct + 20));
    }
    // dos fallos seguidos → escapada (se fuerza con un estado de encuentro con el 1.er intento ya gastado y tirada alta)
    enc = { ...enc, wilds: enc.wilds.map((w, i) => (i === 0 ? { ...w, attempts: 1 } : w)) };
    let gg = g;
    for (let tries = 0; tries < 50; tries++) {
      const t = throwLantern(gg, enc, 0, P);
      if (!t.caught) {
        assert.equal(t.escaped, true);
        assert.equal(t.encounter.wilds[0]!.state, "escapada");
        assert.equal(catchChance(t.game, t.encounter, 0, P), null);
        break;
      }
      gg = { ...gg, contadores: { ...gg.contadores, faroles: gg.contadores.faroles + 1 } };
    }
    // bloqueos: sin faroles, colección llena, tras derrota
    assert.equal(catchChance({ ...g, recursos: { ...g.recursos, faroles: 0 } }, enc, 0, P), null);
    const many = { ...g, animas: Array.from({ length: 100 }, () => g.animas[0]!) };
    assert.equal(catchChance(many, enc, 0, P), null);
    assert.equal(catchChance(g, { ...enc, outcome: "derrota" }, 0, P), null);
    assert.throws(() => throwLantern({ ...g, recursos: { ...g.recursos, faroles: 0 } }, enc, 0, P), GameRuleError);
  });
});

describe("resonancia (§5)", () => {
  const pair = (): GameState => {
    const g = started("res");
    const a = atLevel(g.animas[0]!, 5);
    const other = chooseStarter(newGame("res2", P), 1, P).animas[0]!;
    const b = atLevel({ ...other, id: "a000002", nacimiento: 2, criatura: { ...other.criatura, id: "a000002", birth: 2 } }, 6);
    return { ...withAnimas(g, [a, b]), contadores: { ...g.contadores, nacimientos: 2 } };
  };
  it("requisitos: maduras, distintas, < 5 ecos, esencia; coste 5 + ecos previos", () => {
    const g = pair();
    assert.equal(canResonate(g, "a000001", "a000002", P), null);
    assert.match(canResonate(g, "a000001", "a000001", P)!, /distintas/);
    const young = withAnimas(g, [atLevel(g.animas[0]!, 4), g.animas[1]!]);
    assert.match(canResonate(young, "a000001", "a000002", P)!, /madurado/);
    assert.match(canResonate({ ...g, recursos: { ...g.recursos, esencia: 4 } }, "a000001", "a000002", P)!, /esencia/);
    const five = withAnimas(g, [{ ...g.animas[0]!, criatura: { ...g.animas[0]!.criatura, offspringCount: 5 } }, g.animas[1]!]);
    assert.match(canResonate(five, "a000001", "a000002", P)!, /5 ecos/);
    const two = withAnimas(g, [{ ...g.animas[0]!, criatura: { ...g.animas[0]!.criatura, offspringCount: 2 } }, { ...g.animas[1]!, criatura: { ...g.animas[1]!.criatura, offspringCount: 3 } }]);
    assert.equal(resonanceCost(two.animas[0]!, two.animas[1]!, P), 10);
    const odds = resonanceOdds(P);
    assert.ok(Math.abs(odds.fromA + odds.fromB + odds.surprise - 1) < 1e-12);
  });
  it("eco a nivel 1 (a000003, nacimiento 3), sin variantes, padres +1 eco, esencia −coste, 280 tiradas, Codex y revelaciones", () => {
    const g = pair();
    const r = resonate(g, "a000002", "a000001", P);
    assert.equal(r.cost, 5);
    assert.equal(r.game.recursos.esencia, 25);
    assert.deepEqual([r.echo.id, r.echo.nacimiento, levelOf(r.echo.xp, P), r.echo.origen], ["a000003", 3, 1, "eco"]);
    assert.deepEqual(r.echo.variantes, {});
    assert.deepEqual(r.echo.criatura.parents, ["a000001", "a000002"]);
    assert.deepEqual(r.game.animas.map((a) => a.criatura.offspringCount), [1, 1, 0]);
    assert.deepEqual([r.game.contadores.resonancias, r.game.contadores.nacimientos], [1, 3]);
    // mismo resultado que breed directo con el flujo resonancia|0 (280 tiradas)
    const direct = breed(g.animas[1]!.criatura, g.animas[0]!.criatura, createRng("res|resonancia|0"), GCFG, { id: "a000003", birth: 3 });
    assert.deepEqual(r.echo.criatura, direct.child);
    for (const L of LOCUS_IDS) assert.ok(r.game.codex.genes.includes(geneKey(r.echo.criatura.genome[L].D)));
    // revelación: cada R1/R2 que pasa a D del eco queda revelado en su padre
    for (const o of r.origins) {
      if (o.mutated || o.slot === "D") continue;
      const p = r.game.animas.find((a) => a.id === o.parentId)!;
      assert.ok(p.revelados.includes(`${o.locus}.${o.slot}`));
    }
    assert.deepEqual(resonate(g, "a000002", "a000001", P).game, r.game, "determinista");
  });
  it("las variantes del padre no se heredan (el eco nace con los movimientos originales)", () => {
    const g = pair();
    const hi = atLevel(g.animas[0]!, 15);
    const offer = pendingVariants(hi, P)[0]!;
    const withVar: Anima = { ...hi, variantes: { [offer.locus]: { nivel: 15, eje: offer.A.change.eje, pieza: offer.A.change.pieza } } };
    const r = resonate(withAnimas(g, [withVar, g.animas[1]!]), "a000001", "a000002", P);
    assert.deepEqual(r.echo.variantes, {});
    assert.ok(r.echo.huecos.every((s) => s === null || (s.fuente === "gen" && !s.variante)));
  });
});

describe("colección (§6)", () => {
  it("liberar: 0 por debajo de nivel 5; desde ahí 1 + floor(nivel/5); nunca la última ni una del equipo; linaje", () => {
    const g = started("lib");
    const a = g.animas[0]!;
    assert.deepEqual([1, 4, 5, 9, 10, 30].map((L) => releaseEssence(atLevel(a, L), P)), [0, 0, 2, 2, 3, 7]);
    assert.match(releaseBlocker(g, "a000001", P)!, /última/);
    const b: Anima = { ...atLevel(a, 10), id: "a000002", nacimiento: 2, criatura: { ...a.criatura, id: "a000002", birth: 2 } };
    const child: Anima = { ...a, id: "a000003", nacimiento: 3, criatura: { ...a.criatura, id: "a000003", birth: 3, parents: ["a000001", "a000002"] } };
    const g2 = withAnimas(g, [a, b, child]);
    assert.match(releaseBlocker(g2, "a000001", P)!, /equipo/);
    const r = release(g2, "a000002", P);
    assert.equal(r.essence, 3);
    assert.equal(r.game.recursos.esencia, 33);
    assert.deepEqual(r.game.animas.map((x) => x.id), ["a000001", "a000003"]);
    assert.equal(r.game.linaje[0]!.id, "a000002");
    assert.throws(() => release(g, "a000001", P), GameRuleError);
  });
  it("equipo de 1 a 3 sin repetir; renombrar con 1..16 caracteres", () => {
    const g = started("eq");
    assert.throws(() => setTeam(g, [], P), GameRuleError);
    assert.throws(() => setTeam(g, ["a000001", "a000001"], P), GameRuleError);
    assert.throws(() => setTeam(g, ["a000009"], P), GameRuleError);
    assert.deepEqual(setTeam(g, ["a000001"], P).equipo, ["a000001"]);
    assert.equal(rename(g, "a000001", "Luma", P).animas[0]!.nombre, "Luma");
    assert.throws(() => rename(g, "a000001", "   ", P), GameRuleError);
  });
});
