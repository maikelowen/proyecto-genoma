# Notas de implementación — combate v0.4 (D-043)

Encargo: `combate-v0.4.md`, `movimientos-v0.4.md`, `glosario-v0.4.md`, parche `config/propuestas/combate-v0.4.json`. Código: `packages/core/src/combat/` (nuevo `placement.ts`) y `packages/core/src/moves/`. Tests: `packages/core/test/combat-v04.test.ts` (25 nuevos; 223 en total).

## Config vigente

**`config/combate.v0.4.json` + `config/movimientos.v0.4.json`** (`version: "0.4"`), generadas aplicando el parche P a las v0.2 (con el balance v0.2.1 ya dentro). Se crean ficheros nuevos porque el cambio es de reglas, no de palancas. Las v0.2 **se conservan sin tocar** y el núcleo las sigue cargando: con ellas el comportamiento es idéntico a v0.2.1 + variantes v0.3 (dorados v0.2, catálogo v0.2 y los 185 tests anteriores pasan sin cambios salvo dos ajustes mecánicos de tipos y un caso del parser, ver abajo). En v0.4 todas las claves nuevas son **obligatorias**; en v0.2 pueden faltar y toman el valor que reproduce lo anterior.

Claves nuevas (combate): `equipo.casillas`, `equipo.colocaciones`, `dano.golpe_basico.activo`, `sinergia.cuenta_gratis`, `estados.escudo.renovar`, `variantes.descanso.gratis_descansa`, `variantes.objetivo_automatico.{prioridad_fila, escudo_fila_expuesta, cura_si_todos_llenos}`, `variantes.provocar.ia_exige_aguante`, `ia.colocacion`, `criterios_sim.v04`, `barridos_sim.*`. Movimientos: `gratis`, `garantia_alcance`, `provocar.{sorteo, loci, probabilidad_familia, hibridas, fraccion_minima_escudo, nombre_tactico}`, `criterios_sim.cuotas_catalogo.*`. Eliminadas en v0.4: `sinergia.bonus_por_n.4`, `provocar.pesos_familia` (el parser la rechaza con sorteo "probabilidad").

**Tiradas: sin cambios.** 24 por turno (8 jitter + 16 varianza, por casilla 1–4 de cada bando; las de la casilla vacía se consumen y se descartan) y 8 por movimiento (en el gratis, u1 se consume sin usarse). El parser valida la fórmula con `casillas`, no con `tamano`.

## Huecos y decisiones

| # | Tema | Decisión | Motivo |
|---|---|---|---|
| 1 | Estado | `teams[s]` tiene 4 entradas, `null` en la casilla vacía; su `FighterState` es `{ hp: 0, ko: true }` y nunca emite eventos. | Todo lo que ya filtraba KO (elegibles, objetivos, victoria) funciona sin casos especiales. |
| 2 | Colocación | `createBattle(A, B, cfg, colocA?, colocB?)`: lista de casillas por alma. Ausente o inválida ⇒ `referencePlacement` (spec §1), sin error ni tiradas. La interfaz debe validar antes con `validatePlacement`. | Mismo criterio que los planes inválidos. |
| 3 | Forma | Se valida como "d+t" contra `equipo.colocaciones` (v0.2: "2+2"). | Genérico; no hay literales "2+1" en el código. |
| 4 | Gratis | Es el movimiento de coste 0 (locus `gratis.locus`). `freeMoveSlot(c)` lo localiza; `createBattle` exige que exista si no hay golpe básico. | El motor no depende del locus. |
| 5 | Gratis: respaldo | En el gratis no se aplica `coste_min` (maldición ya se reasigna) ni hay provocar/energía. | Con c = 0 todo pasaría a golpe_estado. |
| 6 | Cola | Si el modificador sorteado es `area`, se respeta (exime de alcance). **Si el respaldo (paso 2) quita ese área, pone `alcance` en su lugar**; el alcance forzado no se quita nunca (se salta al paso 3). El parser valida que el respaldo termina con el coste del forzado. | Encontrado por el test de 4 000 claves mutadas: 24 genes de cola se quedaban sin alcance ni área. La garantía es para toda alma. |
| 7 | Provocar: táctico | Sale con `u3 < p` en el hueco de prisa (u3 no se usaba en el táctico); nunca con energía extra. Nombre "Desafío de …" (`provocar.nombre_tactico`). Ningún táctico del catálogo base lo lleva hoy (sí mutados/híbridos). | Spec §4. |
| 8 | Provocar: escudo mínimo | La condición `fac·fEsc·pts ≥ 0,5·presupuesto` se añade al bucle del respaldo; si falla, el paso 3 quita provocar. | Spec §4. |
| 9 | Cuota de provocar | Con el catálogo nuevo salen 2/72. Búsqueda voraz `p1…p40` en cabeza/cuerpo sin sal previa, exigiendo apoyo 1–3 en la familia: **`roca.cabeza.2` = p5, `brote.cuerpo.1` = p2** ⇒ 4 (roca 2, marea 1, brote 1). | Spec §4: ≥ 4, ≤ 6. |
| 10 | Sales anuladas | Quitadas las de extremidades y cola. Las r*/c* de cabeza/cuerpo se mantienen; **el Analista debe repetir r*/c*** con el catálogo nuevo. | Spec §5. |
| 11 | Objetivo | `autoTargetPosition` decide al ejecutar con la vista de ese instante (vida, KO, provocar, escudo). Con área devuelve un "ancla" y la acción afecta a las vivas de su fila. Provocadores: los del carril del actor (menor casilla); si no, la menor casilla. | Una sola función para motor, previsión e IA. |
| 12 | Apoyo de área | Cura y escudo de área van a la fila propia expuesta (ligado a `prioridad_fila`). **Escudo de área con provocar: la fila del usuario** (como v0.3). | La spec solo fija el individual ("al usuario"). |
| 13 | Cura "nadie la necesita" | Si la menor vida/máx es la vida llena, va al usuario: cura 0 (evento `heal` con 0), regenerar sí se aplica. | Spec §3.1. |
| 14 | Q-01 | `addShield` común a todos los escudos (movimientos, gratis y efecto V1): `min(máx, actual + aporte)`; renueva a `max(restante, duración)` solo si aporte ≥ actual. En v0.2, "siempre" (anterior). | Spec §3.4; test pedido incluido. |
| 15 | Q-03 | `onlyKeys` en la raíz de ambas configs y en `equipo`, `sinergia`, `dano.golpe_basico`, `estados.*`, `ia`, `ia.colocacion`, `variantes` y sus 4 bloques, cada efecto de V1 según su `tipo`, `provocar`, `gratis` y `garantia_alcance`. | Las erratas en forma larga ya fallan. |
| 16 | IA: orden | Con `prioridad_fila`, la IA simula su plan en orden de prioridad e iniciativa estimada (sin jitter, con prisa/ralentizar). En v0.2, orden de casilla (sin cambios). | Spec §8. |
| 17 | IA: provocar | Vale `valor_ia` solo si vida + escudo del usuario tras el movimiento ≥ media de vida + escudo de los **otros** aliados vivos (si no hay otros, vale). La de búsqueda, en su puntuación rápida, sigue usando `valor_ia` sin condición (solo ordena candidatos; decide la simulación). | Spec §8. |
| 18 | Q-05 | La IA de referencia ve el provocar enemigo ya activo, no el que el rival active este turno: no modela el plan rival (elección simultánea). La de búsqueda sí lo ve (simula con `resolveTurn`). | Anotado; revisar si el Analista ve sesgo. |
| 19 | IA: precio | `r(m) = (v̂(m) − v̂(gratis del alma)) / coste`, sin contar el gratis; plan "ahorrar" = todas el gratis. | Spec §2. |
| 20 | Descripciones | `describeMoveShort` (glosario §2; textos en código, números de config) y `describeMove` larga con la semántica v0.4 ("gratis", "fila atacable", "atrás", "fila expuesta"). | Para el cliente. |

## Dorados

- **Regenerados (nuevos, no sustituyen a los v0.2):** catálogo v0.4 (`test/fixtures/movimientos-catalogo.v0.4.json`) y partida v0.4 (`GOLDEN04`: B, 6 turnos, `244e741c…`). Motivo legítimo: la spec cambia el algoritmo de generación (gratis, cola, provocar, alcance = 1, presupuesto 1 = 7) y las reglas del turno. Se fijaron tras comprobar que el catálogo es válido, cumple la cuota y que 200 partidas dan valores en la estimación de la spec.
- Los dorados v0.2 (catálogo y partida) **no han cambiado**: prueba de que la ruta v0.2 es idéntica.

## Tests cambiados

- `combat-moves.test.ts`: el caso "tamano = 3 debe fallar" pasa a `tamano = 5` (3 ya es válido; > casillas sigue fallando).
- Dos `.map((c) => ({ ...c }))` de tests anteriores con cast a `Combatant` (el tipo de `teams` admite `null`). Ninguna aserción debilitada.

## Prueba rápida (no es el estudio)
200 partidas de salvajes (3 contra 3, colocación de la IA, IA de referencia en ambos lados): 7,6 turnos de media, 48,5 % de acciones con el gratis (justo, como prevé la spec), 0,87 provocar por partida, 0 planes inválidos, A/B 103/96.

## Para los siguientes agentes
- **`sim/` y `client/` compilan y pasan sus tests, pero siguen usando las configs v0.2** (importan `combate.v0.2.json`/`movimientos.v0.2.json`): juegan las reglas antiguas. Para v0.4 hay que cambiar el import, pasar equipos de 3 y colocaciones (`runBattle(..., { A, B })`), y en el cliente quitar el golpe básico (`move: 0`) y usar `describeMoveShort`, `forecastTargets`, `attackable`, `placementOf`. Único ajuste hecho: `client/combat/main.ts` (`?.` por la casilla `null`).
- `suggestFormation` queda obsoleta (`@deprecated`); usar `referencePlacement`.
