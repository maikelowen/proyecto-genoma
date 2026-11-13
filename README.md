# Proyecto Genoma

Juego web de **Ánimas** coleccionables con cría genética, combate por turnos y PvP.
Este repositorio contiene el **núcleo** (librería TypeScript pura y determinista,
compartida por cliente y servidor), los **simuladores** de balance y el **cliente**
jugable en el navegador.

- **Jugar:** https://maikelowen.github.io/proyecto-genoma/
- **Trabajar en el proyecto con Claude Code:** lee `CLAUDE.md` (empieza con `/empezar`).
- **Estado y plan:** `docs/proyecto/` (ESTADO, BACKLOG, HOJA-DE-RUTA, DECISIONES, PREGUNTAS).

## Requisitos

- Node.js **>= 22.18** (ejecuta TypeScript de forma nativa, sin compilar).
- Cero dependencias en tiempo de ejecución y de tests.
- `tsc` solo para comprobar tipos (`npm install` instala `typescript` como
  devDependency; también vale un `tsc` global).

## Uso

```sh
npm test            # tests con el runner nativo (node --test)
npm run typecheck   # comprobación de tipos (tsc -p .)
npm run check       # ambos
```

## Estructura

```
packages/core/src/   núcleo determinista (RNG con semilla, genetics/, moves/, combat/)
packages/core/test/  tests del núcleo (*.test.ts)
sim/                 simuladores de balance (salidas en sim/out/, ignorado por git)
client/              juego en el navegador (combate, arte de las ánimas, galería)
docs/proyecto/       estado, plan, decisiones y preguntas pendientes
docs/spec/           especificaciones de diseño (mandan sobre el plan)
docs/jugable/        juego publicado con GitHub Pages
.claude/             subagentes y comandos de Claude Code
config/              datos de configuración del juego
types/               shim mínimo de tipos de Node (ver más abajo)
```

## API de genética (v0.2)

Spec: `docs/spec/genetica-v0.2.md` · notas: `docs/spec/notas-implementacion-v0.2.md` · convenciones: `docs/equipo/nucleo.md`. El núcleo solo carga la config v0.2.

```ts
import raw from "./config/genetica.v0.2.json" with { type: "json" };
import { parseGeneticsConfig, createRng, createWildPopulation, breed, expressedStats,
         creatureFamily, geneKey, createGenedex, recordMutations, checkInvariants } from "./packages/core/src/index.ts";

const cfg = parseGeneticsConfig(raw);           // valida y tipa (barridos: clona raw, cambia, vuelve a parsear)
const rng = createRng("semilla");
const [a, b] = createWildPopulation(rng, cfg, 2);           // 205 tiradas por salvaje
const r = breed(a, b, rng, cfg, { id: "c1", birth: 1 });    // 280 tiradas, puro
r.child; r.parent1; r.parent2;   // copias de los padres con crías + 1
r.trace;      // por locus: mutated, dSlot, r1Slot, r2Slot
r.mutations;  // clave, parentKeys (las 6 bloqueadas), fallbackLevel, para métricas/Genedex
expressedStats(r.child);         // suma de valores de los 4 D
geneKey(r.child.genome.cabeza.D);  // "familia|locus|firma"
```

Otras: `createWildCreature(rng, cfg, {id, family?, pure?, birth?})`, `breedingBlocker`, `creatureFamily(genome, cfg)`, `creatureQuality`, `qualityPercent`, `checkInvariants`, `expressedGenes`, `allGenes`, `locusKeys`, `isCatalogKey`, `distribute` (repartir §1.5), `makeGene`. Cada gen lleva `quality` (Σanchor = Σvalues = quality) y está congelado.

## API de combate v0.4 (vigente)

Specs: `docs/spec/combate-v0.4.md`, `docs/spec/movimientos-v0.4.md`, `docs/spec/glosario-v0.4.md` · notas: `docs/spec/notas-implementacion-combate-v0.4.md`.
**Config vigente: `config/combate.v0.4.json` + `config/movimientos.v0.4.json`.** Las v0.2 se siguen cargando (solo para regresión).

```ts
const cfg = { combat: parseCombatConfig(rawC04), moves: parseMovesConfig(rawM04, gcfg) };
// equipos de 3; colocación = casilla (1–4) de cada alma, elegida a ciegas y a la vez
validatePlacement([1, 3, 4], cfg.combat);         // null | motivo ("1+2"/"2+1"; 24 válidas: allPlacements)
referencePlacement(team, cfg.combat);             // regla de la IA (combate §7)
const s = createBattle(teamA, teamB, cfg, [1, 2, 3], [1, 3, 4]); // inválida o ausente ⇒ regla de la IA
s.teams[0][3];                                    // null = casilla vacía (su FighterState: ko, vida 0)
placementOf(s, "B", cfg);                         // { positions: [1, 3, 4], shape: "1+2" }
attackable(s, "B", cfg);                          // { row, back, taunting }: fila atacable, lo que alcanza "atrás", provocadores
forecastTargets(s, "A", actor, move, cfg);        // { side, positions } a quien iría AHORA (se decide al ejecutar)
restingMoves(s, "A", actor);                      // huecos en descanso (el gratis nunca)
freeMoveSlot(combatant);                          // hueco del gratis (extremidades = 3)
describeMoveShort(mv, cfg.moves);                 // "35 · Quema · ×1,5 en combo" (≤ 3 fragmentos); larga: describeMove
runBattle(teamA, teamB, seed, cfg, aiA, aiB, { A: [1, 2, 3], B: [1, 3, 4] });
```
Acción: `{ actor: casilla, move: 1–4, target: 0 }` (no hay golpe básico: `move: 0` es inválido; plan inválido ⇒ todas usan el gratis).
**24 tiradas por turno** (las de la casilla vacía se descartan) y **8 por movimiento**, como antes.

## API de combate y movimientos (v0.2)

Specs: `docs/spec/combate-v0.2.md`, `docs/spec/movimientos-v0.2.md` · notas: `docs/spec/notas-implementacion-combate-v0.2.md` (y las de v0.1, que siguen vigentes). El núcleo solo carga las configs v0.2.

```ts
import rawC from "./config/combate.v0.2.json" with { type: "json" };
import rawM from "./config/movimientos.v0.2.json" with { type: "json" };
import { parseCombatConfig, parseMovesConfig, buildBattleConfig, patchRawConfig, generateMove, describeMove,
         buildCombatant, createBattle, resolveTurn, validatePlan, createReferenceAi, energyPrice, runBattle } from "./packages/core/src/index.ts";

const cfg = { combat: parseCombatConfig(rawC), moves: parseMovesConfig(rawM, gcfg) };
const mv = generateMove(gene, cfg.moves);      // pura en la clave del gen; 8 tiradas propias
describeMove(mv, cfg.moves);                   // "Mordida de Pira (coste 3): 120 de daño a un enemigo + quemadura"
const r = runBattle(teamA, teamB, "semilla", cfg, createReferenceAi({ reserve: 3 }), createReferenceAi({ kappa: 0 }));
r.result; r.turns; r.log; r.hash;              // "A" | "B" | "empate"; log[turno] = eventos
energyPrice(state, "A", cfg);                  // { lambda, targetCost (c*), bestRate } de la IA (§10.1)
```

IA con búsqueda (más fuerte que la de referencia; misma interfaz `Ai`): `createSearchAi({ simulations: 24, horizon: 2, topK: 3, candidates: 10 })`.
Monte Carlo de horizonte corto con su propio RNG (`"search|bando|turno|hash"`): no ve el de la partida. ≈ 50 ms por decisión en Node.
Medida de profundidad (búsqueda contra la mejor IA de reglas): `npm run sim:profundidad` → `docs/informes/profundidad-v0.1.md`.

Estudio de variantes de combate v0.3 (base y 7 combinaciones: profundidad, remontada, variedad, familias, duración): `npm run sim:variantes` (`--quick` < 30 s) → `docs/informes/variantes-v0.3.md` + `informe-variantes-v0.3.html`.

Turno a turno (cliente/servidor): `createBattle(combA, combB, cfg)` → `validatePlan(state, "A", plan, cfg)` →
`resolveTurn(state, planA, planB, rng, cfg)` → `{ state, events }` (no muta la entrada; **24 tiradas por turno**).
Una acción es `{ actor: 1–4, move: 0 (golpe) | 1–4 (locus), target: 1–4 }`; un plan inválido se sustituye por golpes básicos.
Otras: `generateMoveForKey`, `validateMove`, `deriveStats`, `withMove` (prueba de sustitución), `planSynergy`,
`actionPriority`, `damageAmount`, `eligibleActors`, `battleHash`. `Move.fallback` ∈ 0..4 (respaldo §4.1).

### Configs modificadas (barridos)

```ts
const cfg2 = buildBattleConfig(rawC, rawM, gcfg, {
  combat: { "ia.kappa": 0, "familias.tabla": undefined },             // undefined borra (la tabla se deriva de los anillos)
  moves: { "presupuesto_por_coste.5": 60, "pesos_familia.arquetipo.llama.0": 5 },
});
const rawM2 = patchRawConfig(rawM, [[["overrides_catalogo", "sales", "roca.cuerpo.3"], "c1"]]);  // forma larga: claves con puntos o nuevas
```

`patchRawConfig` copia el JSON (no toca el original) y exige que cada ruta exista (una errata lanza `ConfigError`);
después el parser valida todo. Cambiar sales o costes en el JSON **real** rompe a propósito el vector dorado del catálogo.

### Palancas de balance (todas en config; el núcleo no tiene números de reglas)

| Config | Claves |
|---|---|
| movimientos | `presupuesto_por_coste.1..5` (curva de presupuesto) · `coste_energia.{desplazamiento, escala_tamano, escala_azar}` · `escalables.{dano,cura,escudo}.potencia_por_punto`, topes (`max`, `max_individual`, `max_area_por_objetivo`), `minimo_puntos`, `fraccion_minima` · costes de pieza: `estados.ofensivos.*`, `estados.positivos.{prisa,regenerar}`, `energia_extra.coste`, `modificadores.{alcance,prioridad,perforar}.coste`, `modificadores.area.factor`, `modificadores.drenaje.{factor,fraccion}`, `condiciones.*.factor`, `condiciones.bonus` · mínimos de coste: `estados.aturdir_coste_min`, `energia_extra.coste_min`, `arquetipos.maldicion.coste_min` · pesos: `pesos_familia.{arquetipo,estado_ofensivo,estado_positivo,modificador,condicion}.<familia>[i]`, `pesos_locus_arquetipo`, `pesos_forma_arquetipo`, `probabilidades.*` · sales: `overrides_catalogo.sales` |
| combate | `estadisticas.{vida,ataque,iniciativa}.{base, coef.potencia/velocidad/resistencia}`, `beta_calidad` · `energia.{inicial,por_turno,maximo}` · `orden.{jitter, prioridad_movimientos_aliado}` · `dano.varianza`, `dano.golpe_basico.potencia` · `familias.{fuerte,debil}` (borrando `tabla`) · `sinergia.bonus_por_n` · `estados.*` (valores y duraciones; `escudo.maximo`) · `desgaste.*` · IA: `ia.{kappa, bonus_ko, valor_estado.*, holgura_regenerar, valor_max_escudo, objetivos_area_estimados, factor_cura_estimada, prob_condicion_estimada, penalizacion_coste, reserva_por_defecto}` |

### Variantes de combate v0.3 (en estudio, desactivadas por defecto)

Spec: `docs/spec/combate-variantes-v0.3.md` · notas: `docs/spec/notas-implementacion-combate-v0.3.md`. Con todas desactivadas el combate es idéntico a v0.2.1. Ninguna cambia las 24 tiradas por turno.

| Variante | Claves (`combate` salvo que se indique) |
|---|---|
| V1 golpe básico con efecto por familia | `variantes.golpe_basico_efecto.{activo, componente_hibrida, efectos.<familia>.{tipo, estado, probabilidad, cantidad}}` |
| V2 descanso de un turno | `variantes.descanso.{activo, turnos}` → `FighterState.rest`, `restingMoves(state, bando, pos)` |
| V3 más energía | `energia.por_turno` (3 → 4) |
| V4 objetivo automático por carriles | `variantes.objetivo_automatico.{activo, escudo_provocar_al_usuario}` → `Action.target` se ignora (0); `autoTarget(state, bando, actor, mov, cfg)` da la previsión; `laneOrder`, `suggestFormation` |
| Provocar | `variantes.provocar.{duracion, valor_ia}` y, en movimientos, `provocar.{activo, coste, arquetipos, pesos_familia.<familia>}` → `Move.taunt`, evento `taunt` |

```ts
const v = buildBattleConfig(rawC, rawM, gcfg, {
  combat: { "variantes.golpe_basico_efecto.activo": true, "variantes.descanso.activo": true, "energia.por_turno": 4, "variantes.objetivo_automatico.activo": true },
  moves: { "provocar.activo": true },   // cambia 2 de los 72 movimientos del catálogo (determinista)
});
```

Estructurales (el parser las fija): 24 tiradas por turno, 8 por movimiento, prefijos de semilla, 4 criaturas, órdenes de listas.

## Convenciones

- Solo sintaxis TypeScript "borrable": nada de `enum`, `namespace` ni
  parameter properties. Los imports relativos llevan extensión `.ts`.
- Todo azar pasa por `createRng(semilla)`; prohibido `Math.random` y el reloj
  en el núcleo.
- `types/node-shim.d.ts` declara lo mínimo de `node:test` y `node:assert/strict`
  porque el entorno de desarrollo no tiene `@types/node`. Si lo instalas, borra
  el shim y pon `"types": ["node"]` en `tsconfig.json`.
