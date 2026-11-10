# Proyecto Genoma

Juego web de coleccionar criaturas con breeding genético, PvP y mercado interno.
Este repositorio contiene el **núcleo** (librería TypeScript pura y determinista,
compartida por cliente y servidor), los **simuladores** de balance y, más adelante,
el **cliente**.

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
docs/spec/           especificaciones de diseño
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

## API de combate y movimientos (v0.1)

Specs: `docs/spec/combate-v0.1.md`, `docs/spec/movimientos-v0.1.md` · notas: `docs/spec/notas-implementacion-combate-v0.1.md`.

```ts
import rawC from "./config/combate.v0.1.json" with { type: "json" };
import rawM from "./config/movimientos.v0.1.json" with { type: "json" };
import { parseCombatConfig, parseMovesConfig, generateMove, describeMove, buildCombatant,
         createBattle, resolveTurn, validatePlan, createReferenceAi, runBattle } from "./packages/core/src/index.ts";

const cfg = { combat: parseCombatConfig(rawC), moves: parseMovesConfig(rawM, gcfg) };  // β en raw.estadisticas.beta_calidad
const mv = generateMove(gene, cfg.moves);      // pura en la clave del gen; 8 tiradas propias
describeMove(mv, cfg.moves);                   // "Mordida de Brasa (coste 3): 115 de daño a un enemigo + quemadura"
const r = runBattle(teamA, teamB, "semilla", cfg, createReferenceAi({ reserve: 3 }), createReferenceAi());
r.result; r.turns; r.log; r.hash;              // "A" | "B" | "empate"; log[turno] = eventos
```

Turno a turno (cliente/servidor): `createBattle(combA, combB, cfg)` → `validatePlan(state, "A", plan, cfg)` →
`resolveTurn(state, planA, planB, rng, cfg)` → `{ state, events }` (no muta la entrada; **24 tiradas por turno**).
Una acción es `{ actor: 1–4, move: 0 (golpe) | 1–4 (locus), target: 1–4 }`; un plan inválido se sustituye por golpes básicos.
Otras: `generateMoveForKey`, `validateMove`, `deriveStats`, `withMove` (prueba de sustitución), `planSynergy`,
`damageAmount`, `eligibleActors`, `battleHash`. Para barrer `familias.fuerte`, borra `familias.tabla` en la copia del JSON.

## Convenciones

- Solo sintaxis TypeScript "borrable": nada de `enum`, `namespace` ni
  parameter properties. Los imports relativos llevan extensión `.ts`.
- Todo azar pasa por `createRng(semilla)`; prohibido `Math.random` y el reloj
  en el núcleo.
- `types/node-shim.d.ts` declara lo mínimo de `node:test` y `node:assert/strict`
  porque el entorno de desarrollo no tiene `@types/node`. Si lo instalas, borra
  el shim y pon `"types": ["node"]` en `tsconfig.json`.
