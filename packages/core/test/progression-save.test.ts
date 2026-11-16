/** Progresión v0.1 §7: guardado (ida y vuelta, validación) y vector dorado de una partida corta. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyBattleResult,
  canResonate,
  catchChance,
  chooseStarter,
  gameHash,
  levelOf,
  newGame,
  parseSave,
  playEncounterBattle,
  resonate,
  rollEncounter,
  SaveError,
  serialize,
  setTeam,
  throwLantern,
  zoneUnlocked,
  type GameState,
} from "../src/index.ts";
import { P } from "./progression-helpers.ts";

/**
 * Partida corta y determinista: inicial → encuentros en la zona abierta más alta (equipo = las 3 de
 * más nivel, IA de referencia para el jugador) → faroles a la 1.ª salvaje tras ganar → primera
 * resonancia en cuanto se pueda (a partir del 3.er encuentro).
 */
function shortGame(seed: string): { game: GameState; trace: string[] } {
  let g = chooseStarter(newGame(seed, P), 1, P);
  const trace: string[] = [];
  for (let i = 0; i < 40; i++) {
    const ids = [...g.animas].sort((a, b) => levelOf(b.xp, P) - levelOf(a.xp, P) || a.nacimiento - b.nacimiento).slice(0, 3).map((a) => a.id);
    g = setTeam(g, ids, P);
    const zone = [...P.world.zones].reverse().find((z) => zoneUnlocked(g, z.id, P))!.id;
    const r = rollEncounter(g, zone, P);
    g = r.game;
    const b = playEncounterBattle(g, r.encounter, P);
    const ap = applyBattleResult(g, r.encounter, b.final, P);
    g = ap.game;
    let enc = ap.encounter;
    let caught = "";
    while (catchChance(g, enc, 0, P) !== null) {
      const t = throwLantern(g, enc, 0, P);
      g = t.game;
      enc = t.encounter;
      caught += t.caught ? `+${t.anima!.id}` : `-${t.pct}`;
    }
    trace.push(`${i}:${zone}:${enc.wilds.length}:${ap.report.outcome}:${b.log.length}:${caught}`);
    if (i < 2) continue;
    const mature = g.animas.filter((a) => levelOf(a.xp, P) >= P.unlocks.matureLevel);
    for (let x = 0; x < mature.length; x++) {
      for (let y = x + 1; y < mature.length; y++) {
        if (canResonate(g, mature[x]!.id, mature[y]!.id, P) !== null) continue;
        const res = resonate(g, mature[x]!.id, mature[y]!.id, P);
        trace.push(`res:${res.echo.id}:${res.echo.criatura.family}:${res.cost}`);
        return { game: res.game, trace };
      }
    }
  }
  return { game: g, trace };
}

// Vector dorado de progresión v0.1. Si falla, ha cambiado el algoritmo, el orden de tiradas, la IA,
// una config o el formato de guardado: rompe partidas guardadas y repeticiones.
const GOLDEN = { encounters: 5, hash: "b095dc951f1d7f0d8b3f7c4ea5108150" };

describe("guardado (§7)", () => {
  const { game } = shortGame("guardado");
  it("guardar → cargar → mismo texto y mismo hash; sin tiradas; no muta", () => {
    const text = serialize(game);
    const r = parseSave(text, P);
    assert.deepEqual(r.notes, []);
    assert.equal(serialize(r.game), text);
    assert.equal(gameHash(r.game), gameHash(game));
  });
  const reject: [string, (g: any) => void, RegExp][] = [
    ["formato", (g) => (g.formato = "otra"), /formato/],
    ["versión desconocida", (g) => (g.version = 2), /versión/],
    ["contador negativo", (g) => (g.contadores.encuentros = -1), /entero/],
    ["faroles por encima del tope", (g) => (g.recursos.faroles = 13), /recursos.faroles/],
    ["id ≠ nacimiento", (g) => (g.animas[0].id = "a000009"), /debe ser a000001/],
    ["criatura con otro id", (g) => (g.animas[0].criatura.id = "x"), /coincidir/],
    ["gen roto (invariante de GEN)", (g) => (g.animas[0].criatura.genome.cabeza.D.quality = 50), /calidad/],
    ["familia que no cuadra", (g) => (g.animas[0].criatura.family = "abismo"), /genoma/],
    ["hueco abierto sin nivel", (g) => { g.animas[0].xp = 0; g.animas[0].huecos[2] = { fuente: "gen", locus: "cabeza", variante: false }; }, /huecos\[2\]/],
    ["hueco 0 que no es el gratis", (g) => (g.animas[0].huecos[0] = { fuente: "gen", locus: "cola", variante: false }), /huecos\[0\]/],
    ["locus repetido en dos huecos", (g) => (g.animas[0].huecos[1] = { ...g.animas[0].huecos[0] }), /huecos\[1\]/],
    ["variante sin elegir", (g) => (g.animas[0].huecos[1].variante = true), /sin variante/],
    ["equipo fuera de la colección", (g) => (g.equipo = ["a999999"]), /colección/],
    ["equipo vacío", (g) => (g.equipo = []), /equipo/],
    ["ánimas repetidas", (g) => g.animas.push(g.animas[0]), /repetid/],
    ["nivel_max_alcanzado bajo", (g) => (g.nivel_max_alcanzado = 0), /nivel_max_alcanzado/],
    ["nombre solo de espacios (N-06)", (g) => (g.animas[0].nombre = "   "), /vacío/],
    ["familia inventada en el códice (N-06)", (g) => g.codex.familias.push("dragon"), /familia desconocida/],
    ["nacimiento > contador", (g) => (g.contadores.nacimientos = 0), /nacimiento/],
  ];
  for (const [name, patch, re] of reject) {
    it(`rechaza: ${name}`, () => {
      const g = JSON.parse(serialize(game));
      patch(g);
      assert.throws(() => parseSave(JSON.stringify(g), P), (e: unknown) => e instanceof SaveError && re.test((e as Error).message), name);
    });
  }
  it("rechaza texto que no es JSON o con estructura rota (SaveError, nunca otro error)", () => {
    assert.throws(() => parseSave("{", P), SaveError);
    assert.throws(() => parseSave("[]", P), SaveError);
    const g = JSON.parse(serialize(game));
    g.animas[0].criatura.genome = null;
    assert.throws(() => parseSave(JSON.stringify(g), P), SaveError);
  });
});

describe("vector dorado: inicio → encuentros → captura → resonancia", () => {
  it("misma semilla ⇒ misma partida; hash fijado", () => {
    const a = shortGame("dorado-progresion");
    const b = shortGame("dorado-progresion");
    assert.equal(gameHash(a.game), gameHash(b.game));
    assert.deepEqual(a.trace, b.trace);
    const nEnc = a.game.contadores.encuentros;
    assert.ok(nEnc >= 3, "al menos 3 encuentros");
    assert.ok(a.game.registro.capturas >= 1, "al menos una captura");
    assert.equal(a.game.contadores.resonancias, 1, "una resonancia");
    assert.deepEqual({ encounters: nEnc, hash: gameHash(a.game) }, GOLDEN, a.trace.join(" | "));
  });
});
