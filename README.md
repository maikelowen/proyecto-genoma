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
packages/core/src/   núcleo determinista (RNG con semilla, genetics/; luego combate...)
packages/core/test/  tests del núcleo (*.test.ts)
sim/                 simuladores de balance (salidas en sim/out/, ignorado por git)
docs/spec/           especificaciones de diseño
config/              datos de configuración del juego
types/               shim mínimo de tipos de Node (ver más abajo)
```

## API de genética (v0.1)

Spec: `docs/spec/genetica-v0.1.md` · notas: `docs/spec/notas-implementacion-v0.1.md`.

```ts
import raw from "./config/genetica.v0.1.json" with { type: "json" };
import { parseGeneticsConfig, createRng, createWildPopulation, breed, expressedStats,
         creatureFamily, geneKey, createGenedex, recordMutations, checkInvariants } from "./packages/core/src/index.ts";

const cfg = parseGeneticsConfig(raw);           // valida y tipa (barridos: clona raw, cambia, vuelve a parsear)
const rng = createRng("semilla");
const [a, b] = createWildPopulation(rng, cfg, 2);           // 181 tiradas por salvaje
const r = breed(a, b, rng, cfg, { id: "c1", birth: 1 });    // 280 tiradas, puro
r.child; r.parent1; r.parent2;   // copias de los padres con crías + 1
r.trace;      // por locus: mutated, dSlot, r1Slot, r2Slot
r.mutations;  // claves nuevas, para métricas/Genedex
expressedStats(r.child);         // suma de valores de los 4 D
geneKey(r.child.genome.cabeza.D);  // "familia|locus|firma"
```

Otras: `createWildCreature(rng, cfg, {id, family?, pure?, birth?})`, `breedingBlocker`, `expressedGenes`, `allGenes`, `locusKeys`, `isCatalogKey`.

## Convenciones

- Solo sintaxis TypeScript "borrable": nada de `enum`, `namespace` ni
  parameter properties. Los imports relativos llevan extensión `.ts`.
- Todo azar pasa por `createRng(semilla)`; prohibido `Math.random` y el reloj
  en el núcleo.
- `types/node-shim.d.ts` declara lo mínimo de `node:test` y `node:assert/strict`
  porque el entorno de desarrollo no tiene `@types/node`. Si lo instalas, borra
  el shim y pon `"types": ["node"]` en `tsconfig.json`.
