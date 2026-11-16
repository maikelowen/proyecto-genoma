# Notas de implementación — combate v0.5 (D-053, D-054, D-056, D-057)

Encargo: `combate-v0.5.md` + `config/combate.v0.5.json` (rama `combate-v0.5`). Código: `packages/core/src/combat/` (`config.ts`, `engine.ts`, `ai.ts`, `search.ts`, `index.ts`). Tests: `packages/core/test/combat-v05.test.ts` (24 nuevos; 249 en total).

Decisiones del director sobre las preguntas abiertas de la spec (§11): prioridad del hueco = `"primero"` (la de la config); el plan B de aturdir (`"primero"`) se aplica también al aturdimiento arrastrado del turno anterior (C26).

## Config

- `version: "0.5"` admitida. Todo lo obligatorio en v0.4 lo es en v0.5 (`is04 = 0.4 || 0.5`). En v0.5 son **obligatorias** `energia.pago_al_confirmar` y `variantes.ultima_anima`; en v0.2/v0.4 valen `false` / desactivada (regresión). En v0.4 el bloque `ultima_anima` **puede** venir (para estudiarlo) y se valida igual.
- `onlyKeys` nuevos: `energia` = `inicial, por_turno, maximo, pago_al_confirmar` (antes `energia` no tenía `onlyKeys`); `variantes` admite `ultima_anima`; dentro, `activo` (bool), `aturdir ∈ {turno, primero}`, `prioridad_hueco ∈ {primero, minimo}`.
- Tipos: `CombatConfig.energy.payOnConfirm`, `CombatConfig.variants.lastAnima = { active, stun, slotPriority }`.
- Tiradas: sin cambios (24 por turno; el parser no cambia la fórmula).

## API nueva o ampliada

| Función | Qué hace |
|---|---|
| `lastAnimaPos(state, side, cfg)` | Casilla (1–4) de la última ánima del bando este turno, o 0 (variante inactiva o ≠ 1 viva). Se calcula del estado al empezar el turno; no hay campo nuevo en el estado. |
| `lastAnimaPlans(state, side, cfg)` | Todos los planes válidos de la última: `[gratis]` + cada orden de cada subconjunto de pagos (≤ 3) con Σ coste ≤ energía. Orden determinista (ver tabla). `[]` si no hay última que elija. Para la IA, el cliente y el analista. |
| `slotPriority(moves, cfg)` | Nivel de prioridad del hueco de una secuencia según `prioridad_hueco`. |
| `energyLost(log)` | Energía perdida por bando: `{ ko, aturdido, last }` (`last` = parte de últimas ánimas). Suma `cancel.lost`. |
| `eligibleActors(state, side, cfg?)`, `canAct(state, s, idx, cfg?)` | Con `cfg`, la última con `skipTurn = turno` es elegible si `aturdir = "primero"`. Sin `cfg`, la regla de siempre (el cliente debe pasar `cfg` si usa el plan B). |
| `restingMoves(state, side, pos, cfg?)` | Con `cfg`, la última no tiene movimientos en descanso. |

## Eventos (forma para el cliente y el analista)

Los campos nuevos **solo existen cuando su mecánica está en uso** (si no, el registro y el hash son los de v0.4):

| Evento | Campos nuevos | Cuándo |
|---|---|---|
| `cancel` | `lost: number` (= coste; `refund` pasa a 0) | con `pago_al_confirmar`. Sin él: `refund = coste` y no hay `lost` (léase `lost ?? 0`). |
| `cancel` | `move: number`, `seq: { index, of }` | movimiento de una última ánima (uno por movimiento cancelado, C25). `reason`: `"ko"` / `"aturdido"`. |
| `action` | `seq: { index, of }` | cada movimiento de la última ("(2/3)" en el registro). También el gratis de la última (`1/1`). |
| `lost` | `move`, `seq` | movimiento ofensivo de la última sin enemigos vivos (U8). |
| `order.queue[i]` | `moves: number[]` | el hueco de una última ánima: su secuencia en orden de ejecución (una sola entrada en la cola, §4.4). |
| `plan` | — | `actions` puede repetir `actor` (la secuencia, en orden). |

Energía perdida por motivo = Σ `cancel.lost` por `reason`; la de últimas ánimas, los que llevan `seq` (`energyLost` lo hace).

## Huecos y decisiones

| # | Tema | Decisión | Motivo |
|---|---|---|---|
| 1 | Garantía de regresión | `lost`, `move`, `seq` y `moves` solo aparecen con su mecánica; con las dos claves a `false` el dorado v0.4 sale idéntico (test). La spec dice "`lost = 0`" con la clave a false: se omite el campo. | Un campo siempre presente cambia el hash (lección v0.3). |
| 2 | Última ánima | No se guarda en el estado: es "exactamente una viva al empezar el turno" y, sin resurrección, una vez última lo es siempre. | Sin campos nuevos en `FighterState` (hashes y semillas de la IA de búsqueda intactos). |
| 3 | Validación §2.3 | La última puede repetir `actor`; error si repite `move`, mezcla el gratis (coste 0) con pagos o pasa de 3. Gratis = acción de coste 0 (también el golpe básico si está activo). Sin la variante, "actor repetido" como siempre. | Una sola función para plan normal y secuencia. |
| 4 | Cola | Un hueco por ánima (`Entry.steps`); el plan se agrupa por actor conservando el orden. Para las no últimas, idéntico a v0.4. Jitter: uno, el de su casilla. | §3.1, nota §8.3. |
| 5 | Ejecución | Bucle por movimiento con el estado vivo; antes de cada uno: KO ⇒ se cancela (U5/U6); aturdida ⇒ con `"turno"` se cancelan todos, con `"primero"` solo el 1.º (también si `skipTurn = turno`, C26). `acted = true` al empezar el primero que se ejecuta. | §3.2, nota §8.4–8.5, U2–U6. |
| 6 | Varianza | Movimiento j ⇒ par de la casilla `L[j]`, `L = [la suya] ++ las otras 3 ascendentes`; el efecto V1 del golpe básico usa también la 2.ª de `L[j]`. | §3.4 (test con tiradas reales). |
| 7 | Descanso | Lo que ejecuta la última no descansa (`usedSlot` no se marca). Sus contadores **siguen bajando** al final de turno (se ignoran igual; así el estado queda limpio). `validatePlan` y la IA no los miran. | Nota §8.6 dice "no aplicarle los contadores"; bajarlos no cambia nada jugable y evita un `rest` congelado. |
| 8 | Sinergia | `planSynergy` cuenta ánimas distintas (el `Set` de actores). Para planes normales no cambia nada (una entrada por actor). | §8.2, U9. |
| 9 | Cancelación | `refund = pago ? 0 : coste`; `energía = min(máx, energía + refund)`. Mismo cálculo que v0.4 con la clave a false. | §1. |
| 10 | IA de referencia | Si el bando tiene última que elige: evalúa cada plan de `lastAnimaPlans` (≤ 16) con la `evaluate` de siempre (simulación en el orden dado, sin reordenar por prioridad). Mejor valor estricto; empate dentro del mismo subconjunto ⇒ más prioridad del hueco; el resto de empates se quedan con el primero (orden lexicográfico por índice; entre opciones, la combinación menor = la primera de la lista ordenada por lista ascendente de movimientos). La regla de reserva (§10.2) se aplica antes, como siempre. No modela D-054 (limitación aceptada por la spec §5). | §5, C27. |
| 11 | IA de búsqueda | Con última: candidatos = los dos planes de referencia + **todos** los de `lastAnimaPlans` (no se usan las combinaciones `topK`, que son por actor). | §5 último punto. |
| 12 | U6, U13, U15 | U6 no es alcanzable con el catálogo (no hay test; el código la cubre con el mismo `if (me.ko)`). U13 y U15 no tienen código propio: el orden se fija antes de ejecutar y el drenaje ya es por movimiento. | Tabla §3.3. |

## Tests (`combat-v05.test.ts`)

Config y `onlyKeys`; dorado v0.4 con las dos claves a false (**sin tocar `GOLDEN04`**); dorado v0.5 nuevo; determinismo y 24 tiradas en secuencias, cancelaciones y planes inválidos con las 4 combinaciones de claves; varianza `L[j]`; cada mecánica aislada (D-054 con U18, D-053); casos U1–U5, U7–U12, U14, U16, U17 y (g), (h) de §8; `planSynergy` (e); IA (≤ 16 opciones, desempate por prioridad con control "minimo", 30 partidas con todos los planes válidos y la de búsqueda).

## Dorados

- **v0.4 intacto**: `GOLDEN04` (B, 8, `c9357368…`) pasa con `combate.v0.5.json` y las dos claves a `false`, y con `combate.v0.4.json`.
- **Nuevo `GOLDEN05`** (ambas activas, config real, mismas criaturas y semilla que el v0.4): B, 6 turnos, `70cee9fd987adfe1c41615c4d04beda1`.

## Para el analista (prueba rápida, no es el estudio)

200 partidas de salvajes con la IA de referencia y la config v0.5 real: 8,6 turnos de media, 0 planes inválidos, 588 huecos de última ánima (459 de 1 movimiento, gratis incluido; 128 de 2; 1 de 3) y **≈ 4,9 de energía perdida por partida**, por encima del rango informativo 0,5–3,0 de la spec (§9.5). No es un fallo del núcleo (cada KO antes de actuar pierde su plan), pero conviene que el estudio lo mire con su desglose por motivo.
