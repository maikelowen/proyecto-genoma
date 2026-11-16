# Notas de implementación — progresión v0.1

Núcleo, 2026-11-16. Implementa `docs/spec/progresion-v0.1.md` con `config/progresion.v0.1.json` sobre combate v0.5 y movimientos v0.5. Código en `packages/core/src/progression/` y la extensión de bandos en `packages/core/src/combat/` (`combatant.ts`, `placement.ts`, `engine.ts`). La spec y el JSON no se han tocado.

## 1. Extensión de bandos de 1 a 3 (§2.2)

- `BattleConfig.sides?: SideSizeRules` es opcional. Sin él, el motor es el de siempre: cada bando debe tener exactamente `teamSize`. Con él (`ProgressionConfig.battle` ya lo lleva), cada bando tiene de `minSize` a `teamSize` ánimas.
- `validatePlacement(p, cfg, size?, sides?)`, `allPlacements(cfg, size?, sides?)` y `referencePlacement(team, cfg, sides?)` tienen parámetros nuevos opcionales. Con `size = teamSize` el código que se ejecuta es el anterior.
- **No regresión:** `test/fixtures/hashes-3v3.v0.5.json` guarda 200 partidas 3 contra 3: hash del registro y hash del estado final. Un tercio de ellas lleva colocaciones explícitas. Se generaron con el motor de `5c8ddce` **antes** de tocarlo. El test las rejuega con y sin `sides` y salen 200 de 200 iguales. Los dorados anteriores no se han tocado.
- `Action.actor` y la sinergia (`team[a.actor − 1]`) indexan por casilla (1–4), no por orden de equipo, así que no suponen 3 ánimas. La sinergia con n < 3 solo usa las claves 2..n.

## 2. Decisiones de implementación (huecos de la spec)

| # | Tema | Decisión | Motivo |
|---|---|---|---|
| I-01 | Formato del estado | `GameState` usa directamente las claves en español de §7.1/§8.1 y `serialize` = `JSON.stringify`. Las criaturas son `Creature` de GEN (claves en inglés). | El estado es el formato guardado; así no hace falta traducirlo y la ida y vuelta es exacta. |
| I-02 | `inicial.elegida` antes de elegir | `null`. Sin inicial, el equipo y la colección están vacíos. | La spec solo da 0/1/2. |
| I-03 | Contador en la semilla | Se usa el valor **antes** de incrementarlo (encuentro 0 = el primero). Semilla: `` `${semilla}|${flujo}|${contador}` ``. | Así lo hace §5.3 (`resonancias` se incrementa después). Se aplica igual a encuentro, combate, farol y resonancia. |
| I-04 | Ids de las iniciales | Temporales (`inicial-k`, birth 0). La elegida se copia con `a000001` y birth 1. | Mismo mecanismo que las capturas (QA B-04). |
| I-05 | **Empate (límite de turnos)** | Cuenta como **derrota**: XP `floor(suma/2)` de las apagadas, sin faroles, sin esencia y sin atrapar. | La spec no lo define. Pasa en < 2 % de los combates. **Lo debe confirmar el diseñador.** |
| I-06 | `dn` de atrapar | Nivel actual de tus ánimas del equipo del encuentro, **después** de sumar la XP del combate (sin acompañante). | La pantalla de faroles aparece tras el reparto de XP. |
| I-07 | Capturas y equipo | La atrapada **no** entra sola en el equipo; se usa `setTeam`. | §6.1: "se cambia fuera de combate". El jugador modelo del analista elige el equipo. |
| I-08 | "Orden de equipo" en la IA instinto | Orden de **casilla** (1–4). | El estado del combate solo conoce casillas. Con 1–2 salvajes coincide con el orden de equipo (casillas 1, 2). |
| I-09 | Acompañante | Id `acompanante`, va el último del bando A. Con n = 2 y sin colocación del jugador queda en la casilla 2. Movimientos de nivel 10 (4). | La spec no fija el sitio. |
| I-10 | Pieza "ninguno" | `{eje, pieza: "ninguno"}` en los tres ejes (también condición). | Un solo valor. Se guarda tal cual (QA B-08). |
| I-11 | Respaldo de variantes (QA B-09) | n ≥ 2: primero el locus del nivel y después `orden_respaldo` (sin repetirlo). n = 1: el primero de `orden_respaldo`. Las ofertas pendientes se calculan en orden de nivel y cada una reserva su locus. | "El siguiente" se lee como el siguiente que cumpla en ese orden. Reservar evita que dos niveles pendientes ofrezcan el mismo locus. |
| I-12 | Elegir variante | `chooseVariant` guarda `{nivel, eje, pieza}` y **activa** la variante en su hueco (`variante: true`). `toggleVariant` vuelve al original. | Lo natural tras elegir. Se puede revertir gratis (§4.5). |
| I-13 | Movimiento variante | `VariantMove` = el original con la pieza cambiada. Conserva `id`, `key` y `name`, y lleva el campo `variant: {eje, pieza}`. | Es "el mismo movimiento con una pieza cambiada". El cliente lo distingue por `variant`. |
| I-14 | Variante inválida al cargar | Si no está en los candidatos vigentes: se quita, su hueco vuelve al original y aparece en `notes` (pendiente otra vez). Si el nivel es insuficiente, el nivel no es de variante o el nivel está repetido: `SaveError`. | §4.5 / QA B-08: un cambio de catálogo no es corrupción; romper un invariante sí lo es. |
| I-15 | Versiones de config al cargar | `config.progresion` debe coincidir. Las demás se aceptan y se reescriben con las cargadas, porque las criaturas se guardan completas y las variantes se revalidan. | §7.1. |
| I-16 | Codex | Entran los D y los ocultos revelados de cada ánima tuya: inicial, captura, eco, revelación por nivel o por resonancia. `mutaciones[].resonancia` va en base 1 (1 = la primera). | §6.3. |
| I-17 | Linaje | Solo si el ánima liberada es madre o padre de otra que **sigue** en la colección. | §6.2. |
| I-18 | `registro.combates` | La huida no cuenta como combate; derrota y empate sí. | El registro mide el hito D-066. |
| I-19 | Nombres | Se recortan los espacios. La longitud se cuenta en puntos de código (1..16). | §1.4. |
| I-20 | Huecos de habilidad | En el paso 1, `parseSave` los rechaza y `slotMove` lanza error. | No existen en el paso 1. |
| I-21 | `parseProgressionConfig(raw, battle)` | Recibe la `BattleConfig` (combate + movimientos + genética), no solo la genética. | Valida `piezas_excluidas` contra movimientos, las colocaciones contra combate y las tiradas contra GEN. |
| I-22 | Probabilidades de §5.4 | `resonanceOdds`: D de A = D de B = (1 − p_mut)·w_D / (2·Σw); sorpresa = el resto. | Lo calcula el núcleo para que el cliente no lo rehaga. |
| I-23 | Esencia y faroles con tope | El informe devuelve lo que **de verdad** se sumó (recortado al tope). | Pantalla honesta. |

## 3. Medidas con el catálogo v0.5 (para el analista)

Variantes con la regla de puntos efectivos (D-070), sin respaldo, sobre los 72 genes del catálogo:

- Media de candidatos: cabeza 7,1; cuerpo 8,4; extremidades 3,6; cola 7,2.
- n = 0 en 5 genes: `llama|cola|2423`, `brote|extremidades|1312`, `roca|extremidades|2240`, `voltio|cuerpo|1241`, `sombra|cuerpo|4214`.
- n = 1 en 2 genes: `llama|cabeza|2332`, `voltio|cabeza|1342`.
- En total, 7 de 72 (9,7 %) tienen n < 2: **por encima del criterio de 5 %**. En el gratis son 2 de 18 (11 %, dentro del 15 %).
- Causa típica: el original desperdicia puntos por redondeo y cualquier alternativa los aprovecha, así que gasta más puntos efectivos y se rechaza. El respaldo lo cubre, pero conviene que el analista lo mida con genes mutados.

## 4. API pública para el cliente (`packages/core/src/progression/index.ts`)

Todas las funciones son puras: devuelven un estado nuevo. Las reglas lanzan `GameRuleError` sin consumir tiradas.

- **Config:** `parseProgressionConfig(json, battleConfig)` → `ProgressionConfig` (en `.battle` va la `BattleConfig` con la extensión de bandos).
- **Partida:** `newGame(seed, cfg)`, `starterOptions(game, cfg)` (3 criaturas), `chooseStarter(game, k, cfg, nombre?)` y `markIntroSeen`.
- **Zonas y encuentros:**
  - `zoneUnlocked`, `rollEncounter(game, zona, cfg)` → `{game, encounter}`, `encounterSides`.
  - `startEncounterBattle(game, enc, cfg, colocaciónA?)` → `BattleState`, `encounterBattleRng(game, enc)`.
  - `wildAi(cfg)` / `instinctAi`: la IA del bando B.
  - Los turnos se resuelven con `resolveTurn(state, planA, planB, rng, cfg.battle)` de siempre.
  - `playEncounterBattle(...)` juega el combate entero con IA en los dos bandos (para simuladores).
- **Final del combate:** `applyBattleResult(game, enc, estadoFinal | "huida", cfg)` → `{game, encounter, report}`. El informe trae XP, esencia, faroles y, por ánima, niveles, huecos nuevos, maduración, revelaciones y niveles de variante.
- **Atrapar:** `catchChance(game, enc, i, cfg)` (% entero o null), `catchBlocker`, `throwLantern(game, enc, i, cfg, nombre?)` → `{game, encounter, pct, roll, caught, escaped, anima}`. `catchPercent` es la fórmula pura.
- **Resonancia:** `canResonate(game, a, b, cfg)` (motivo o null), `resonanceCost`, `resonanceOdds`, `resonate(game, a, b, cfg, nombre?)` → `{game, echo, cost, origins, breed}`. `origins` da, por locus, el padre y la posición de origen o la mutación.
- **Colección:** `setTeam`, `rename`, `releaseBlocker`, `releaseEssence`, `release`, `findAnima`.
- **Ánimas:** `levelOf`, `xpForLevel`, `animaLevel`, `isMature`, `unlockedSlots`, `combatantOf(anima, cfg)` (de 2 a 4 movimientos, el gratis primero) y `slotMove`.
- **Variantes:** `pendingVariants(anima, cfg)` / `animaPendingVariants(game, id, cfg)` → ofertas `{level, locus, original, A, B|null}`, `chooseVariant(game, id, nivel, "A"|"B", cfg)`, `toggleVariant(game, id, hueco, cfg)`. Para el analista: `variantCandidates`, `moveVariants`, `variantOffer`, `assembleExact`, `effectivePoints`.
- **Guardado:** `serialize(game)`, `parseSave(texto, cfg)` → `{game, notes}` o `SaveError`, y `gameHash(game)`.

Queda para el cliente (§10.1): crear la semilla, `localStorage` (`cfg.save.storageKey`), `registro.sesiones` y los textos.

## 5. Tests y dorados

- Ficheros nuevos: `progression-teams` (no regresión, bandos de 1 a 3, IA instinto, higiene), `progression-rules`, `progression-variants` y `progression-save`.
- **Dorado nuevo:** partida `dorado-progresion` = inicial, 5 encuentros, 4 capturas y 1 resonancia (`encounters 5`, `hash 8e737661…`). Si cambia el algoritmo, una tirada, la IA, una config o el formato, hay que regenerarlo y decirlo.
- Los dorados de combate y genética no cambian.
