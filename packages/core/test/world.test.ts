/** Mundo caminable v0.1 (docs/spec/mundo-v0.1.md): parser, pasos, encuentros, ruta, interacción, guardado y dorado. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyBattleResult,
  createRng,
  gameHash,
  interact,
  leaveSanctuary,
  newGame,
  newWorld,
  parseWorldConfig,
  parseWorldSave,
  planRoute,
  returnFromZoneList,
  rollEncounter,
  serializeWorld,
  step,
  tileAt,
  worldHash,
  facingTarget,
  ConfigError,
  type Dir,
  type GameState,
  type WorldConfig,
  type WorldState,
} from "../src/index.ts";
import { P } from "./progression-helpers.ts";
import { CHARS, loadWorld, miniWorld, rawWorldClone, W, withStarter } from "./world-helpers.ts";

const at = (w: WorldState, x: number, y: number, mira: Dir = w.mira, extra: Partial<WorldState> = {}): WorldState => ({ ...w, pos: { x, y }, mira, ...extra });
const go = (w: WorldState, g: GameState, d: Dir, cfg: WorldConfig = W) => step(w, g, d, cfg, P);

describe("mundo — parser y validación (§6.2)", () => {
  it("carga el Prado real: 30×24, leyenda de 12 tipos, 6 entidades, 2 activadores", () => {
    const m = W.maps[0]!;
    assert.equal(m.width, 30);
    assert.equal(m.height, 24);
    assert.equal(Object.keys(W.tiles).length, 12);
    assert.equal(m.entities.length, 6);
    assert.equal(m.activators.length, 2);
    assert.equal(tileAt(W, "prado_linde", 14, 3)?.id, "puerta_santuario");
    assert.equal(tileAt(W, "prado_linde", -1, 0), null);
  });
  const rejects = (name: string, patch: (r: any) => void, re: RegExp) =>
    it(`rechaza: ${name}`, () => {
      const r = rawWorldClone();
      patch(r);
      assert.throws(() => parseWorldConfig(r, P, CHARS), (e: unknown) => e instanceof ConfigError && re.test(e.message));
    });
  rejects("clave desconocida en la raíz", (r) => (r.extra = 1), /extra/);
  rejects("errata en un bloque (movimiento)", (r) => (r.movimiento.ms_por_pasos = 1), /ms_por_pasos/);
  rejects("errata en una entidad", (r) => (r.mapas[0].entidades[1].nombres = "x"), /nombres/);
  rejects("fila corta", (r) => (r.mapas[0].filas[3] = r.mapas[0].filas[3].slice(1)), /longitud/);
  rejects("menos filas que el alto", (r) => r.mapas[0].filas.pop(), /filas/);
  rejects("carácter fuera de la leyenda", (r) => (r.mapas[0].filas[5] = "T?" + r.mapas[0].filas[5].slice(2)), /leyenda/);
  rejects("borde pisable", (r) => (r.mapas[0].filas[0] = "T" + ".".repeat(1) + r.mapas[0].filas[0].slice(2)), /borde/);
  rejects("casilla pisable inalcanzable", (r) => {
    // aísla (27,22) con dos árboles
    const f = r.mapas[0].filas;
    f[21] = f[21].slice(0, 27) + "T" + f[21].slice(28);
    f[22] = f[22].slice(0, 26) + "T" + f[22].slice(27);
  }, /inalcanzable/);
  rejects("entidad en casilla no pisable", (r) => (r.mapas[0].entidades[1].x = 9, (r.mapas[0].entidades[1].y = 9)), /no pisable/);
  rejects("dos entidades en la misma casilla", (r) => ((r.mapas[0].entidades[2].x = 16), (r.mapas[0].entidades[2].y = 8)), /dos entidades/);
  rejects("id de entidad repetido", (r) => (r.mapas[0].entidades[2].id = "tasia"), /repetido/);
  rejects("personaje inexistente", (r) => (r.mapas[0].entidades[0].personaje = "nadie"), /personaje/);
  rejects("puerta sin activador", (r) => r.mapas[0].activadores.shift(), /no tiene activador/);
  rejects("activador sobre casilla que no lo es", (r) => ((r.mapas[0].activadores[0].x = 13), (r.mapas[0].activadores[0].y = 4)), /no es de tipo/);
  rejects("zona del mapa inexistente", (r) => (r.mapas[0].zona = "luna"), /zona/);
  rejects("zona de la salida inexistente", (r) => (r.mapas[0].activadores[1].zonas = ["luna"]), /zonas\[0\]/);
  rejects("inicio no pisable", (r) => ((r.mapas[0].inicio.x = 0), (r.mapas[0].inicio.y = 0)), /inicio/);
  rejects("inicio ocupado por una entidad", (r) => ((r.mapas[0].inicio.x = 15), (r.mapas[0].inicio.y = 4)), /ocupada/);
  rejects("encuentro_pct en casilla no pisable", (r) => (r.casillas["~"].encuentro_pct = 5), /pisable/);
  rejects("activa en casilla pisable", (r) => (r.casillas["."].activa = "puerta"), /activa/);
  rejects("coste_ruta 0 en casilla pisable", (r) => (r.casillas["."].coste_ruta = 0), /coste_ruta/);
  rejects("encuentro_pct > 100", (r) => (r.casillas[","].encuentro_pct = 101), /encuentro_pct/);
  rejects("tiradas por paso ≠ 1", (r) => (r.encuentros.tiradas_por_paso_hierba = 2), /tiradas/);
  rejects("orden de direcciones que no es permutación", (r) => (r.movimiento.orden_direcciones = ["n", "n", "s", "o"]), /permutación/);
  rejects("vector no unitario", (r) => (r.movimiento.direcciones.n.dy = -2), /dy/);
  rejects("gracia negativa", (r) => (r.encuentros.gracia_tras_encuentro = -1), /gracia/);
  rejects("pasos_max_sin_encuentro 0", (r) => (r.encuentros.pasos_max_sin_encuentro = 0), /pasos_max/);
  rejects("depende de otra versión de progresión", (r) => (r.depende_de.progresion = "progresion.v0.9.json"), /progresión cargada/);
  it("admite `presentacion` sin mirar dentro y claves _doc", () => {
    const r = rawWorldClone();
    r.presentacion = { cualquier: { cosa: [1, 2] } };
    r._nota = "x";
    assert.doesNotThrow(() => parseWorldConfig(r, P, CHARS));
  });
  it("un mapa mínimo válido se carga y uno con una entidad que corta el paso se rechaza", () => {
    miniWorld(["TTTTT", "T...T", "TTTTT"]);
    assert.throws(
      () => miniWorld(["TTTTT", "T...T", "TTTTT"], { start: { x: 1, y: 1 }, entities: [{ id: "tapon", tipo: "cartel", x: 2, y: 1, texto: ["x"] }] }),
      /inalcanzable/,
    );
  });
});

describe("mundo — pasos y colisiones (§2.1)", () => {
  const g = withStarter("s-col");
  const w0 = newWorld(g, W);
  it("mundo nuevo: delante del santuario, mira a Arnal, contadores a 0", () => {
    assert.deepEqual(w0.pos, { x: 14, y: 4 });
    assert.equal(w0.mira, "e");
    assert.deepEqual(w0.contadores, { pasos_hierba: 0, pasos_totales: 0 });
    assert.equal(w0.gracia_restante, 6);
  });
  it("entidad bloquea; solo gira; no cambia contadores ni partida", () => {
    const r = go(w0, g, "e");
    assert.equal(r.outcome.kind, "blocked");
    assert.equal((r.outcome as any).reason, "entity");
    assert.deepEqual(r.world.pos, w0.pos);
    assert.deepEqual(r.world.contadores, w0.contadores);
    assert.equal(r.game, g);
  });
  it("gira aunque esté bloqueado", () => {
    const r = go(at(w0, 14, 4, "o"), g, "e");
    assert.equal(r.world.mira, "e");
    assert.equal((r.outcome as any).reason, "entity");
  });
  it("puerta: evento sin moverse", () => {
    const r = go(w0, g, "n");
    assert.deepEqual(r.outcome, { kind: "door", to: "santuario" });
    assert.deepEqual(r.world.pos, w0.pos);
    assert.equal(r.world.mira, "n");
  });
  it("muro y agua: solid; fuera del mapa: edge", () => {
    assert.equal((go(at(w0, 13, 4), g, "n").outcome as any).reason, "solid"); // (13,3) muro H
    assert.equal((go(at(w0, 7, 9), g, "e").outcome as any).reason, "solid"); // (8,9) agua? fila 9 "T.,,,,..~~~~~": x=8 '~'
    const m = miniWorld(["TTT", "T.T", "TTT"]);
    const gm = withStarter("s-edge");
    assert.equal((go(at(newWorld(gm, m), 0, 0), gm, "n", m).outcome as any).reason, "edge");
    assert.equal((go(at(newWorld(gm, m), 0, 1), gm, "o", m).outcome as any).reason, "edge");
  });
  it("mueve por camino: pasos_totales sube, sin tirada de hierba", () => {
    const r = go(at(w0, 14, 5, "s"), g, "s");
    assert.equal(r.outcome.kind, "moved");
    assert.deepEqual(r.world.pos, { x: 14, y: 6 });
    assert.deepEqual(r.world.contadores, { pasos_hierba: 0, pasos_totales: 1 });
    assert.equal(r.world.gracia_restante, 6, "andar por el camino no gasta gracia");
    assert.equal(r.world.pasos_sin_encuentro, 0);
  });
  it("la hierba alta está cerrada sin inicial (no_starter) y no consume nada", () => {
    const g0 = newGame("s-sin", P);
    const w = at(newWorld(g0, W), 8, 6, "o"); // (7,6) hierba alta
    const r = go(w, g0, "o");
    assert.equal((r.outcome as any).reason, "no_starter");
    assert.deepEqual(r.world.pos, { x: 8, y: 6 });
    assert.deepEqual(r.world.contadores, w.contadores);
  });
  it("salida cerrada sin zona abierta; abierta cuando zoneUnlocked", () => {
    const w = at(newWorld(g, W), 28, 12, "e");
    const r = go(w, g, "e");
    assert.equal((r.outcome as any).reason, "exit_locked");
    assert.match((r.outcome as any).text, /niebla/);
    assert.deepEqual(r.world.pos, w.pos);
    const open: GameState = { ...g, nivel_max_alcanzado: 5 };
    const r2 = go(w, open, "e");
    assert.deepEqual(r2.outcome, { kind: "exit", zones: ["marismas_quietas", "cantil_farol_roto"] });
  });
  it("semillas distintas entre mundo y partida: error de regla", () => {
    assert.throws(() => go(w0, withStarter("otra"), "s"), /semillas/);
  });
});

describe("mundo — encuentros por paso (§3)", () => {
  // Mapa de hierba alta: con pct 100 hay encuentro en cuanto no hay gracia.
  const rows = ["TTTTTTTT", "T,,,,,,T", "TTTTTTTT"];
  const hot = miniWorld(rows, { patch: (r) => (r.casillas[","].encuentro_pct = 100) });
  const g = withStarter("s-gr");
  const w0 = (cfg: WorldConfig, grace: number): WorldState => ({ ...newWorld(g, cfg), gracia_restante: grace });
  it("gracia: 1 tirada por paso en hierba aunque no haya encuentro; solo baja en hierba", () => {
    let w = w0(hot, 4);
    let gm = g;
    const seen: string[] = [];
    // paso 1..4 de ida y vuelta en gracia, después encuentro
    const dirs: Dir[] = ["e", "e", "e", "e", "e"];
    for (const d of dirs) {
      const r = step(w, gm, d, hot, P);
      seen.push(r.outcome.kind);
      assert.equal(r.world.contadores.pasos_hierba, w.contadores.pasos_hierba + 1, "1 tirada por paso de hierba");
      w = r.world;
      gm = r.game;
    }
    assert.deepEqual(seen, ["moved", "moved", "moved", "moved", "encounter"]);
    assert.equal(w.gracia_restante, 4, "tras el encuentro, gracia_tras_encuentro");
    assert.equal(w.pasos_sin_encuentro, 0);
    assert.equal(gm.contadores.encuentros, 1);
  });
  it("en gracia pasos_sin_encuentro no cambia; fuera de gracia sí", () => {
    const cold = miniWorld(rows, { patch: (r) => (r.casillas[","].encuentro_pct = 1) });
    const gg = withStarter("s-sin-pct");
    let w: WorldState = { ...newWorld(gg, cold), gracia_restante: 2, pasos_sin_encuentro: 7 };
    w = step(w, gg, "e", cold, P).world;
    w = step(w, gg, "e", cold, P).world;
    assert.equal(w.pasos_sin_encuentro, 7);
    assert.equal(w.gracia_restante, 0);
    const r = step(w, gg, "e", cold, P);
    if (r.outcome.kind === "moved") assert.equal(r.world.pasos_sin_encuentro, 8);
  });
  it("garantía: encuentro como mucho al paso 40 fuera de gracia, y en el primer u < pct si antes", () => {
    const cold = miniWorld(["TTTTTTTTTT", "T,,,,,,,,T", "TTTTTTTTTT"], { patch: (r) => (r.casillas[","].encuentro_pct = 1) });
    let exactly40 = 0;
    for (let i = 0; i < 30; i++) {
      const seed = `garantia-${i}`;
      const gg = withStarter(seed);
      let w: WorldState = { ...newWorld(gg, cold), gracia_restante: 0 };
      w = at(w, 1, 1);
      let gm = gg;
      let first = -1;
      let d: Dir = "e";
      for (let n = 1; n <= 40 && first < 0; n++) {
        if (w.pos.x === 8) d = "o";
        if (w.pos.x === 1) d = "e";
        const r = step(w, gm, d, cold, P);
        if (r.outcome.kind === "encounter") first = n;
        w = r.world;
        gm = r.game;
      }
      let expected = 40;
      for (let k = 0; k < 39; k++) if (Math.floor(createRng(`${seed}|paso|${k}`).next() * 100) < 1) { expected = k + 1; break; }
      assert.equal(first, expected, seed);
      if (first === 40) exactly40++;
    }
    assert.ok(exactly40 > 0, "algún caso llega al tope de 40");
  });
  it("el encuentro del mapa es el de rollEncounter con el mismo n (la zona del mapa)", () => {
    const r = step(w0(hot, 0), g, "e", hot, P);
    assert.equal(r.outcome.kind, "encounter");
    const direct = rollEncounter(g, "prado_linde", P);
    assert.deepEqual((r.outcome as any).encounter, direct.encounter);
    assert.deepEqual(r.game, direct.game);
  });
  it("determinismo: misma semilla, mismo paseo, mismos hashes; otra semilla, otro paseo", () => {
    const walk = (seed: string) => {
      const gg = withStarter(seed);
      let w = at(newWorld(gg, W), 8, 6, "o", { gracia_restante: 0 });
      let gm = gg;
      const marks: number[] = [];
      for (let i = 0; i < 120; i++) {
        const r = step(w, gm, i % 14 < 7 ? "o" : "e", W, P);
        if (r.outcome.kind === "encounter") marks.push(i);
        w = r.world;
        gm = r.game;
      }
      return { marks, wh: worldHash(w), gh: gameHash(gm) };
    };
    assert.deepEqual(walk("d1"), walk("d1"));
    assert.notEqual(walk("d1").gh, walk("d2").gh);
  });
  it("recarga: con el mundo guardado unos pasos atrás, el siguiente encuentro cae en el mismo paso k y es el mismo", () => {
    const hotish = loadWorld();
    const gg = withStarter("recarga-3");
    const run = (w: WorldState, gm: GameState, max: number) => {
      for (let i = 0; i < max; i++) {
        const r = step(w, gm, i % 2 === 0 ? "o" : "e", hotish, P);
        if (r.outcome.kind === "encounter") return { k: w.contadores.pasos_hierba, enc: (r.outcome as any).encounter, world: r.world, game: r.game };
        w = r.world;
        gm = r.game;
      }
      throw new Error("sin encuentro");
    };
    const start = at(newWorld(gg, hotish), 4, 6, "o", { gracia_restante: 0 });
    // avanzar 10 pasos y "guardar" (el caso exige no tener encuentro en esos 10 pasos: con la semilla fija es así)
    let w = start;
    let gm = gg;
    for (let i = 0; i < 10; i++) {
      const r = step(w, gm, i % 2 === 0 ? "o" : "e", hotish, P);
      assert.notEqual(r.outcome.kind, "encounter", "cambia la semilla del caso");
      w = r.world;
      gm = r.game;
    }
    const saved = parseWorldSave(serializeWorld(start), gg, hotish).world; // guardado 10 pasos atrás
    const a = run(w, gm, 500); // sin recargar
    const b = run(saved, gg, 500); // recargando atrás: repite las mismas tiradas
    assert.equal(a.k, b.k);
    assert.deepEqual(a.enc, b.enc);
    assert.equal(gameHash(a.game), gameHash(b.game));
  });
});

describe("mundo — ruta táctil (§2.4)", () => {
  const g = withStarter("s-ruta");
  const w0 = newWorld(g, W);
  /** Ejecuta la ruta con `step` y devuelve el mundo y los tipos de casilla pisados. */
  const walk = (w: WorldState, route: Dir[], gm: GameState = g, cfg: WorldConfig = W) => {
    const tiles: string[] = [];
    let last: any = null;
    for (const d of route) {
      const r = step(w, gm, d, cfg, P);
      last = r.outcome;
      w = r.world;
      gm = r.game;
      if (r.outcome.kind === "moved" || r.outcome.kind === "encounter") tiles.push(r.outcome.tile.id);
    }
    return { w, tiles, last, gm };
  };
  it("a la propia casilla: ruta vacía; al agua, fuera o árbol: null", () => {
    assert.deepEqual(planRoute(w0, g, { x: 14, y: 4 }, W), []);
    assert.equal(planRoute(w0, g, { x: 9, y: 9 }, W), null);
    assert.equal(planRoute(w0, g, { x: 0, y: 0 }, W), null);
    assert.equal(planRoute(w0, g, { x: 99, y: 3 }, W), null);
  });
  it("determinista y ejecutable con step; evita la hierba alta en el camino al puente", () => {
    const r1 = planRoute(w0, g, { x: 8, y: 16 }, W)!;
    const r2 = planRoute(w0, g, { x: 8, y: 16 }, W)!;
    assert.deepEqual(r1, r2);
    const { w, tiles } = walk(w0, r1);
    assert.deepEqual(w.pos, { x: 8, y: 16 });
    assert.ok(!tiles.includes("hierba_alta") && !tiles.includes("hierba_espesa"), tiles.join());
  });
  it("rodea la hierba cuando el rodeo es más barato, y entra si es el destino", () => {
    const m = miniWorld(["TTTTTTTTT", "T.......T", "T.,,,,,.T", "TTTTTTTTT"], { start: { x: 1, y: 2 } });
    const gm = withStarter("rodeo");
    const w = newWorld(gm, m);
    const route = planRoute(w, gm, { x: 7, y: 2 }, m)!;
    assert.equal(route.length, 8); // sube, 6 al este, baja
    assert.equal(route[0], "n");
    const into = planRoute(w, gm, { x: 4, y: 2 }, m)!;
    assert.equal(walk(w, into, gm, m).w.pos.y, 2);
  });
  it("sin inicial la hierba alta es inalcanzable como destino", () => {
    const g0 = newGame("s-ruta-0", P);
    assert.equal(planRoute(newWorld(g0, W), g0, { x: 3, y: 6 }, W), null);
  });
  it("a una entidad: termina mirándola; usar da su texto", () => {
    const route = planRoute(w0, g, { x: 16, y: 8 }, W)!; // Tasia
    const { w } = walk(w0, route);
    assert.equal(facingTarget(w, W).entity?.id, "tasia");
    const u = interact(w, g, W, P);
    assert.equal(u.outcome.kind, "talk");
  });
  it("a la puerta: llega mirándola y usar abre", () => {
    const w = at(w0, 14, 8, "s");
    const { w: end } = walk(w, planRoute(w, g, { x: 14, y: 3 }, W)!);
    assert.deepEqual(end.pos, { x: 14, y: 4 });
    assert.deepEqual(interact(end, g, W, P).outcome, { kind: "door", to: "santuario" });
  });
  it("ya al lado de la entidad pero mirando a otro lado: un giro; ya mirando: vacía", () => {
    assert.deepEqual(planRoute(at(w0, 14, 4, "o"), g, { x: 15, y: 4 }, W), ["e"]);
    assert.deepEqual(planRoute(w0, g, { x: 15, y: 4 }, W), []);
  });
  it("más de ruta_max_pasos: null", () => {
    const m = loadWorld((r) => (r.movimiento.ruta_max_pasos = 3));
    assert.equal(planRoute(newWorld(g, m), g, { x: 14, y: 12 }, m), null);
    assert.notEqual(planRoute(newWorld(g, m), g, { x: 14, y: 6 }, m), null);
  });
  it("las entidades no se atraviesan: Arnal bloquea la casilla", () => {
    const route = planRoute(w0, g, { x: 16, y: 4 }, W)!;
    assert.ok(route.length > 2);
    assert.deepEqual(walk(w0, route).w.pos, { x: 16, y: 4 });
  });
});

describe("mundo — interacción (§1.4, §4.2)", () => {
  const g0 = newGame("s-int", P);
  const gs = withStarter("s-int");
  const near = (x: number, y: number, mira: Dir, g: GameState) => at(newWorld(g, W), x, y, mira);
  it("Arnal sin inicial: arnal_intro; con inicial: texto_despues en ciclo (mod 3) y la charla se cuenta", () => {
    assert.deepEqual(interact(newWorld(g0, W), g0, W, P).outcome, { kind: "arnal_intro", id: "arnal", character: "hechicero" });
    let w = newWorld(gs, W);
    const texts: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = interact(w, gs, W, P);
      texts.push((r.outcome as any).text[0]);
      w = r.world;
    }
    assert.equal(w.charlas["arnal"], 4);
    assert.equal(texts[0], texts[3]);
    assert.equal(new Set(texts).size, 3);
  });
  it("vecino y cartel muestran su texto sin cambiar el estado", () => {
    const tas = interact(near(16, 9, "n", gs), gs, W, P);
    assert.equal((tas.outcome as any).name, "Tasia");
    assert.equal(tas.world.charlas["tasia"], undefined);
    const car = interact(near(27, 12, "n", gs), gs, W, P);
    assert.equal(car.outcome.kind, "sign");
  });
  it("nada delante: nothing; puerta y salida", () => {
    assert.deepEqual(interact(near(14, 6, "s", gs), gs, W, P).outcome, { kind: "nothing" });
    assert.deepEqual(interact(near(14, 4, "n", gs), gs, W, P).outcome, { kind: "door", to: "santuario" });
    assert.equal(interact(near(28, 12, "e", gs), gs, W, P).outcome.kind, "exit_locked");
    assert.equal(interact(near(28, 12, "e", { ...gs, nivel_max_alcanzado: 5 }), { ...gs, nivel_max_alcanzado: 5 }, W, P).outcome.kind, "exit");
  });
  it("farol perdido: +1 farol una vez, desaparece (deja pasar); con el tope no se recoge", () => {
    const w = near(3, 2, "n", gs);
    const r = interact(w, gs, W, P);
    assert.equal(r.outcome.kind, "pickup");
    assert.equal(r.game.recursos.faroles, gs.recursos.faroles + 1);
    assert.deepEqual(r.world.recogidos, ["farol_perdido"]);
    // ya recogido: nada delante, la casilla se puede pisar
    assert.equal(interact(r.world, r.game, W, P).outcome.kind, "nothing");
    assert.equal(step(r.world, r.game, "n", W, P).outcome.kind, "moved");
    const full: GameState = { ...gs, recursos: { ...gs.recursos, faroles: P.resources.lanternsMax } };
    const f = interact(w, full, W, P);
    assert.equal(f.outcome.kind, "pickup_full");
    assert.equal(f.game, full);
    assert.deepEqual(f.world.recogidos, []);
    assert.equal(step(w, full, "n", W, P).outcome.kind, "blocked", "sigue ahí y bloquea");
  });
  it("salir del santuario / volver de la lista: aparición y gracia", () => {
    const w = at(newWorld(gs, W), 3, 3, "o", { gracia_restante: 0 });
    const s = leaveSanctuary(w, W);
    assert.deepEqual([s.pos, s.mira, s.gracia_restante], [{ x: 14, y: 4 }, "s", 6]);
    const l = returnFromZoneList(w, W);
    assert.deepEqual([l.pos, l.mira, l.gracia_restante], [{ x: 28, y: 12 }, "o", 4]);
    assert.equal(returnFromZoneList({ ...w, gracia_restante: 6 }, W).gracia_restante, 6, "no baja la gracia que hubiera");
  });
});

describe("mundo — guardado (§5)", () => {
  const g = withStarter("s-save");
  it("ida y vuelta con el mismo texto y hash", () => {
    let w = at(newWorld(g, W), 8, 6, "o", { gracia_restante: 0 });
    let gm = g;
    for (let i = 0; i < 25; i++) {
      const r = step(w, gm, i % 2 ? "e" : "o", W, P);
      w = r.world;
      gm = r.game;
    }
    w = interact(at(w, 3, 2, "n"), gm, W, P).world;
    w = interact(at(w, 14, 4, "e"), gm, W, P).world;
    const text = serializeWorld(w);
    const back = parseWorldSave(text, gm, W);
    assert.deepEqual(back.notes, []);
    assert.equal(serializeWorld(back.world), text);
    assert.equal(worldHash(back.world), worldHash(w));
    assert.deepEqual(back.world, w);
  });
  it("sin clave: inicio delante del santuario, sin aviso", () => {
    const r = parseWorldSave(null, g, W);
    assert.deepEqual(r.world, newWorld(g, W));
    assert.deepEqual(r.notes, []);
  });
  const bad = (name: string, mutate: (o: any) => void, game: GameState = g) =>
    it(`guardado inválido → mundo nuevo con nota: ${name}`, () => {
      const o = JSON.parse(serializeWorld(newWorld(g, W)));
      mutate(o);
      const r = parseWorldSave(JSON.stringify(o), game, W);
      assert.deepEqual(r.world, newWorld(game, W));
      assert.equal(r.notes.length, 1);
    });
  bad("formato", (o) => (o.formato = "otro"));
  bad("versión", (o) => (o.version = 2));
  bad("semilla distinta", () => {}, withStarter("otra-semilla"));
  bad("mapa inexistente", (o) => (o.mapa = "luna"));
  bad("posición fuera", (o) => (o.pos.x = 30));
  bad("posición no pisable", (o) => ((o.pos.x = 0), (o.pos.y = 0)));
  bad("posición ocupada por una entidad", (o) => ((o.pos.x = 15), (o.pos.y = 4)));
  bad("orientación", (o) => (o.mira = "x"));
  bad("contador negativo", (o) => (o.contadores.pasos_hierba = -1));
  bad("contador no entero", (o) => (o.contadores.pasos_totales = 1.5));
  bad("gracia fuera de rango", (o) => (o.gracia_restante = 7));
  bad("pasos_sin_encuentro fuera de rango", (o) => (o.pasos_sin_encuentro = 40));
  bad("recogido que no es un objeto", (o) => (o.recogidos = ["tasia"]));
  bad("recogidos repetidos", (o) => (o.recogidos = ["farol_perdido", "farol_perdido"]));
  bad("charla de entidad inexistente", (o) => (o.charlas = { nadie: 1 }));
  bad("clave extra", (o) => (o.extra = 1));
  bad("config de otra versión", (o) => (o.config.mundo = "0.9"));
  it("texto que no es JSON → mundo nuevo con nota", () => {
    const r = parseWorldSave("{no", g, W);
    assert.equal(r.notes.length, 1);
    assert.deepEqual(r.world, newWorld(g, W));
  });
  it("estar sobre la casilla de un objeto recogido es válido", () => {
    const w = at(newWorld(g, W), 3, 1, "n", { recogidos: ["farol_perdido"] });
    assert.deepEqual(parseWorldSave(serializeWorld(w), g, W).notes, []);
  });
});

describe("mundo — higiene y dorado", () => {
  it("el código del mundo no usa azar propio, reloj ni funciones trascendentes", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["config", "world", "save", "index"]) {
      const src = readFileSync(new URL(`../src/world/${f}.ts`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      assert.ok(!/Math\.random|Date\.now|new Date|performance\.now|\*\*|Math\.(pow|sqrt|log|exp|sin|cos|tan|atan|hypot)/.test(src), `${f}.ts`);
    }
  });

  /** Paseo guionizado: rutas por el Prado (oeste, rincón, camino, sureste) con 300 pasos; los encuentros se huyen. */
  function dorado(seed: string): { w: WorldState; g: GameState; encounters: number; blocked: number } {
    let g = withStarter(seed);
    let w = newWorld(g, W);
    const targets = [{ x: 3, y: 6 }, { x: 3, y: 2 }, { x: 14, y: 8 }, { x: 22, y: 15 }, { x: 16, y: 8 }, { x: 24, y: 3 }, { x: 14, y: 5 }];
    let steps = 0;
    let encounters = 0;
    let blocked = 0;
    for (let t = 0; steps < 300; t++) {
      const route = planRoute(w, g, targets[t % targets.length]!, W);
      assert.notEqual(route, null);
      for (const d of route!) {
        if (steps >= 300) break;
        steps++;
        const r = step(w, g, d, W, P);
        w = r.world;
        g = r.game;
        if (r.outcome.kind === "blocked") blocked++;
        if (r.outcome.kind === "encounter") {
          encounters++;
          g = applyBattleResult(g, r.outcome.encounter, "huida", P).game;
          break; // la ruta se cancela
        }
      }
    }
    return { w, g, encounters, blocked };
  }
  it("dorado: paseo de 300 pasos (hash del mundo y de la partida)", () => {
    const a = dorado("dorado-mundo");
    assert.deepEqual(dorado("dorado-mundo").w, a.w);
    assert.equal(a.w.contadores.pasos_totales + a.blocked, 300);
    assert.equal(a.encounters, a.g.contadores.encuentros);
    assert.deepEqual(
      { pasos: a.w.contadores.pasos_totales, hierba: a.w.contadores.pasos_hierba, encuentros: a.encounters, mundo: worldHash(a.w), partida: gameHash(a.g) },
      GOLDEN,
    );
  });
});

/** Dorado del paseo (mundo v0.1 + progresión v0.1 + combate v0.5). Se regenera solo si cambia una regla del mundo, una tirada o el formato. */
const GOLDEN = { pasos: 297, hierba: 98, encuentros: 6, mundo: "54ce6f4c7d9fd3aa4b319b45253620e7", partida: "23ee24610112609ec7ee49daacf3238c" };
