# Notas de implementación — mundo caminable v0.1

Núcleo, 2026-11-16. Implementa `docs/spec/mundo-v0.1.md` con `config/mundo.v0.1.json`. Código en `packages/core/src/world/` (`config.ts`, `world.ts`, `save.ts`), exportado desde `src/index.ts`. Tests: `packages/core/test/world.test.ts`. La spec, el JSON y la progresión no se han tocado.

## 1. Decisiones de implementación (huecos de la spec)

| # | Tema | Decisión | Motivo |
|---|---|---|---|
| W-01 | Formato del estado | `WorldState` usa las claves de §5.1 tal cual (`formato`, `version`, `semilla`, `config`, `mapa`, `pos`, `mira`, `contadores`, `gracia_restante`, `pasos_sin_encuentro`, `recogidos`, `charlas`). `serializeWorld` = `JSON.stringify`. | Como en progresión (I-01): la ida y vuelta es exacta. |
| W-02 | Ids de personajes | `parseWorldConfig(json, prog, characterIds?)`: `ProgressionConfig` no conserva `mundo.personajes`, así que el llamador pasa los ids (`raw.mundo.personajes.map(p => p.id)`). Sin el tercer parámetro no se comprueba. | No tocar progresión. |
| W-03 | `newWorld` | Gracia inicial = `gracia_al_salir_santuario` (6), como dice §5.2 para la migración; mapa = el primero de la config. | §5.2. |
| W-04 | Nombre `SpawnPoint` | El tipo de `inicio` y similares se llama `SpawnPoint` (`Placement` ya existe en combate). | Choque de nombres en `index.ts`. |
| W-05 | Salida cerrada | `step` devuelve `blocked` con `reason: "exit_locked"` y `text` (= `texto_cerrada`); `interact` devuelve `exit_locked` con `text`. | §1.5. |
| W-06 | `rollEncounter` lanza `GameRuleError` | El paso queda hecho como no-encuentro (`pasos_sin_encuentro += 1`), el contador de hierba ya incrementado y `outcome.error` con el mensaje (el cliente lo registra en consola). Otro tipo de error se propaga. | §3.1. |
| W-07 | Charlas | Solo los `personaje` cuentan charlas (`charlas[id]` +1 al hablar, índice `mod` nº de textos de `texto_despues`). Vecinos y carteles no cambian el estado. | §4.2 solo lo pide para Arnal. |
| W-08 | Intro de Arnal | `interact` devuelve `arnal_intro` sin tocar la partida; el cliente muestra `texto_inicio`, elige inicial y llama a `markIntroSeen`. | §4.2: lo hace el cliente con las pantallas de hoy. |
| W-09 | Objeto recogido | `interact` suma `min(da.faroles, max − faroles)` y añade el id a `recogidos`; en el tope devuelve `pickup_full` y no cambia nada. Un objeto recogido deja de existir (no bloquea). | §1.4. |
| W-10 | Ruta | Coste por casilla de entrada. Desempate: menor coste, menos pasos, orden de inserción en la frontera (que sigue `orden_direcciones` al expandir). La hierba alta cuenta como cerrada para la ruta si no hay inicial. Las entidades bloquean la ruta salvo como destino. | §2.4. |
| W-11 | Ruta a entidad o activador | Lleva a la vecina alcanzable de menor coste (después menos pasos, después orden de direcciones) y añade un giro final solo si hace falta. **No** ejecuta el efecto: al terminar, el cliente llama a `interact` (para la puerta y la salida también: `interact` da `door` / `exit` / `exit_locked`). El giro final, si existe, queda bloqueado por la entidad. | §2.4 («el cliente ejecuta usar al llegar»). |
| W-12 | Carga | `parseWorldSave` no lanza: sin texto → mundo nuevo sin nota; cualquier fallo (JSON roto, claves extra, rangos, semilla distinta…) → `newWorld` + 1 nota. Claves extra se rechazan (estricto). Una posición sobre un objeto ya recogido es válida. | §5.1. |
| W-13 | Rangos de la carga | `gracia_restante` ≤ máximo de las tres gracias; `pasos_sin_encuentro` ≤ `pasos_max_sin_encuentro − 1`. | §5.1. |
| W-14 | Semilla | `step` e `interact` lanzan `GameRuleError` si `world.semilla ≠ game.semilla` (el cliente debe usar `parseWorldSave`). | Evita mezclar claves de guardado. |

## 2. API pública (`import … from "…/src/index.ts"`)

Todo puro: devuelve estados nuevos. Direcciones `Dir` = `"n" | "e" | "s" | "o"`. `W` = `WorldConfig`, `P` = `ProgressionConfig`.

- **Config:** `parseWorldConfig(raw, P, characterIds?)` → `WorldConfig` (lanza `ConfigError`). `mapById(W, id)`, `tileAt(W, mapa, x, y)` (`null` fuera). `WorldConfig` trae `tiles`, `movement` (`msPerStep`, `routeMaxSteps`, `dirOrder`, `vec`), `encounters`, `maps[]` (`cells`, `entities`, `activators`, `start`, `sanctuaryExit`, `arrivalFromList`) y `save.storageKey` (`"genoma.mundo"`). `presentacion` no pasa por el parser: el cliente la lee del JSON crudo.
- **Estado:** `newWorld(game, W)`, `worldHash(world)`, `leaveSanctuary(world, W)`, `returnFromZoneList(world, W)`.
- **Paso:** `step(world, game, dir, W, P)` → `{ world, game, outcome }`, con `outcome`:
  - `{kind:"moved", tile, error?}` · `{kind:"encounter", tile, encounter}` (la `game` devuelta ya lleva `contadores.encuentros + 1`) · `{kind:"door", to:"santuario"}` · `{kind:"exit", zones}` · `{kind:"blocked", reason: "edge"|"solid"|"entity"|"no_starter"|"exit_locked", text?}`.
  - Orden de escritura que debe respetar el cliente (§3.4): primero `serializeWorld(world)`, luego `serialize(game)`.
- **Interacción:** `interact(world, game, W, P)` → `{world, game, outcome}`: `talk {id,name,text[]}`, `sign`, `pickup {faroles}`, `pickup_full`, `arnal_intro {character}`, `door`, `exit {zones}`, `exit_locked {text}`, `nothing`.
- **Ruta:** `planRoute(world, game, {x,y}, W)` → `Dir[] | null`. El cliente ejecuta cada `Dir` con `step` y se detiene si el resultado no es `moved`; al terminar, si el destino era entidad o activador, llama a `interact`.
- **Consultas:** `facingTarget(world, W)` → `{x, y, tile, entity, activator}`, `entityAt`, `activeEntities` (sin objetos recogidos), `activatorAt`, `exitOpen(game, activador, P)`.
- **Guardado:** `serializeWorld(world)`, `parseWorldSave(texto | null, game, W)` → `{world, notes[]}`. El cliente guarda en `W.save.storageKey`, borra la clave al crear partida nueva y guarda cada 10 pasos / en eventos (§5.1).
- **Qué no hace el núcleo:** tiempos de animación, cola de entradas, textos de pantalla, `localStorage`, `markIntroSeen` y elegir inicial.

## 3. Tests y dorado

- `world.test.ts` (82 tests, < 1 s): parser (30 casos de errata y mapas mínimos), colisiones y orden de comprobación, gracia (1 tirada por paso en hierba, solo baja en hierba), garantía de 40 contra el flujo `paso|k`, igualdad con `rollEncounter`, determinismo, recarga con el mundo guardado 10 pasos atrás, ruta (rodeo, entidad, puerta, límite), interacción (ciclo de Arnal, farol con tope), guardado (ida y vuelta, 17 casos inválidos), higiene (regex sin azar propio ni trascendentes) y dorado.
- **Dorado nuevo:** paseo de 300 llamadas a `step` guionizadas con `planRoute` por el Prado, huyendo de cada encuentro (`applyBattleResult(..., "huida")`): `pasos_totales 297`, `pasos_hierba 98`, 6 encuentros, hash del mundo `54ce6f4c…`, hash de la partida `23ee2461…`. Depende de mundo v0.1 + progresión v0.1 + combate v0.5 (la huida): si cambia una regla del mundo, una tirada, la ruta o el formato, se regenera y se dice.
- No se ha tocado ningún dorado anterior. `npm run check`: 456 tests; tiempo total ≈ 24,5 s en esta máquina (tsc ≈ 8 s, tests ≈ 15,5 s): **en el límite de los 25 s**.
