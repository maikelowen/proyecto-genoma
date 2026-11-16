# QA — núcleo de progresión v0.1

Revisor/QA, 2026-11-16, rama `main` en `e336c68` (diff `5c8ddce..e336c68 -- packages/`). Revisa el trabajo del núcleo, que no ha hecho el revisor. Entrada: `docs/spec/progresion-v0.1.md`, `config/progresion.v0.1.json`, `docs/spec/notas-implementacion-progresion-v0.1.md` y la QA anterior (`qa-progresion-v0.1.md`).

## Veredicto: **APROBADO CON CAMBIOS**

No hay bloqueantes. El núcleo es fiel a la spec y lo he comprobado por caminos propios. Estas cifras coinciden al 100 %: 3 contra 3 idéntico, XP, esencia, faroles, % de atrapar, tiradas, coste de resonar, liberar, 622 tiradas por encuentro, ida y vuelta del guardado y determinismo.

Quedan 3 importantes:
- **N-01:** el 9,7 % de genes sin variantes es un fallo de la **spec**, no del núcleo. Propongo un arreglo medido.
- **N-02:** el parser de progresión acepta claves desconocidas. Hay que arreglarlo **antes** de que el analista barra esta config.
- **N-03:** I-07 combinado con el acompañante deja a la inicial sola tras la primera captura.

`npm run check` dos veces sobre `git archive e336c68` limpio, porque el analista trabaja a la vez en `sim/`: **339/339** en verde las dos veces (24 s).

Scripts propios en el scratchpad de la sesión (fuera del repo): `nr.ts`, `var*.ts`, `game.ts`, `corrupt.ts`, `cfg.ts`, `ai.ts` y `draws.ts`. Comparan con el motor de `5c8ddce` extraído con `git archive`.

---

## Hallazgos

| ID | Sev. | Dónde | Escenario / reproducción | Arreglo |
|---|---|---|---|---|
| **N-01** | **Importante** (spec) | `progresion-v0.1.md:217` (regla 3); `variants.ts:197` (fiel a la spec) | Con el catálogo v0.5, **7 de 72 genes** tienen n < 2: 5 con n = 0 y 2 con n = 1. Eso es el 9,7 %, y el criterio es ≤ 5 %. Lo reproduzco gen a gen, con la misma lista que las notas. En 2000 salvajes al azar (semilla `qa-var5-404`, 8000 niveles de variante), **980 niveles (12 %) van al respaldo, 206 ofrecen solo A y 558 (7 %) no ofrecen nada**. El **34 %** de las ánimas pierde al menos una de sus 4 elecciones completas. **Causa:** `puntosEf(M)` ya descuenta lo que M pierde por redondeo, así que cualquier alternativa que aproveche ese resto supera a M por 0,16–1,05 puntos y se rechaza. Ejemplos: `llama\|cola\|2423`, de 40,95 a 41,25 con «vida_baja» (175 frente a 170); `voltio\|cabeza\|1342`, +0,2 con «alcance». Dos casos sí son correctos: `sombra\|cuerpo\|4214` y `voltio\|cuerpo\|1241` son escudos en el tope (300) sin ninguna variante justa. Ahí el respaldo es la respuesta buena. | Lo decide el director con el diseñador y se avisa a Miguel, porque matiza D-070. **Opción A (recomendada):** cota superior `puntosEf(M) + 1`, que es un paso de redondeo (5 de potencia = 1 punto de daño; en escudo y cura, < 1), más una regla explícita contra la pieza gratis: «si la variante **añade** una pieza en un eje vacío, su potencia tiene que bajar». Medido: n < 2 en **2/72 (2,8 %)**, gratis **0/18**, salvajes al azar 56/2000 (2,8 %), **0** piezas añadidas con la misma potencia. Coste: en ~5,6 % de los candidatos (874 de 15 715) se cambia una pieza por otra más cara con potencia igual o mayor, ganando ≤ 1 punto. Lo debe medir el analista con el espejo de «pieza gratis» (§9.1 c). **Opción B:** dejar la regla y subir el criterio al 10 %, aceptando que el 7 % de los niveles de variante no dé nada. **Descartada:** cota = presupuesto de M. Deja pasar `sombra\|cuerpo\|4214` con área (puntosEf 59,5 frente a 40). |
| **N-02** | **Importante** | `progression/config.ts:132` y siguientes (ningún `onlyKeys`); comparar con `combat/parse.ts:57` | `variantes.holgura_puntoss = 9`, `atrapar.base_pctt = 90` y una clave nueva en la raíz (`recursoss`) se **aceptan sin error**. El valor real sigue siendo el de antes y el barrido no mide nada. Es la misma lección que R-01 y Q-03: el analista va a barrer justo `atrapar`, `recursos`, `resonancia` y `variantes`. | Usar `onlyKeys(bloque, [claves…, "_doc*"])` en **cada** bloque de `progresion.v0.1.json`, como en combate. Añadir un test con una errata en cada bloque. |
| **N-03** | **Importante** (decisión) | `game.ts:216-219` (`companionJoins`: colección < 2); `game.ts:530-534` (la captura no entra en el equipo, I-07) | Eliges la inicial, ganas el combate 1 con el acompañante y atrapas tu 2.ª ánima. A partir de ahí `animas.length = 2`, así que el acompañante se va, pero `equipo = [inicial]`. **Si el jugador no abre la pantalla de equipo, la inicial pelea sola, 1 contra 1–3.** La spec §1.1 da por hecho un «equipo de 2–3». Los simuladores no lo ven porque el jugador modelo rehace el equipo antes de cada combate. | Recomiendo una regla del núcleo: la ánima atrapada entra al final del equipo si `equipo.length < equipo_max`. Para los ecos, que lo decida el cliente, por ejemplo con un botón «llevar». La alternativa es que el cliente lo haga siempre, pero entonces el núcleo tendría que exponerlo. Lo decide el director; es experiencia de usuario dentro de lo que la spec deja abierto. |
| N-04 | Menor (decisión) | `game.ts:404`; `combat/engine.ts:1109-1112` | I-05: «empate = derrota» incluye **también el doble KO** (`!aliveA && !aliveB`), no solo el límite de turnos. En un doble KO están apagadas todas las salvajes, pero el jugador se queda con media XP, sin esencia, sin farol y sin poder atrapar. Frecuencia: 6 de 270 combates (2,2 %) en mis partidas largas del jugador modelo y 20 de 1500 (1,3 %) en combates al azar de 1–3 contra 1–3. | Aceptable. Que el diseñador lo escriba en la spec (§4.2 y §3.1), nombrando el doble KO. |
| N-05 | Menor | `progression/config.ts` (`combate_salvaje`); `combat/placement.ts:66-69` | `colocacion_ia_por_tamano["2"] = [3, 4]` (forma «0+2», que no está en `["2+0","1+1"]`) se acepta, y `referencePlacement` la devuelve sin validarla. | En el parser: cada colocación de la IA tiene que pasar `validatePlacement(p, C, n, sides)`. |
| N-06 | Menor | `save.ts:178`, `:125`, `:132`, `:222-240` | Se aceptan: un nombre solo de espacios (`checkName` recorta, pero `parseSave` no), familias inventadas en `codex.familias` y `linaje[].familia`, una variante que sea **cualquier** candidato válido aunque no sea la A o la B ofrecida ni el locus de ese nivel, y claves extra dentro de `criatura`, que se conservan. Nada de esto rompe la partida, y un guardado local se puede editar de todas formas. | Validar el nombre con `checkName`, familias ∈ GEN y, si sale barato, que `{eje, pieza}` sea la A o la B de `pendingVariants` para su nivel. |
| N-07 | Menor | `wild-ai.ts:178`; `combat/placement.ts:72-79` | I-08: con 3 salvajes, la colocación de referencia ordena por vida, así que el «orden de casilla» **no** coincide con el «orden de equipo» de la spec (§2.5). Es inofensivo, no hay tiradas y es incluso más legible (de delante a atrás). | Cambiar el texto de §2.5 a «en orden de casilla». |
| N-08 | Menor | `test/progression-teams.test.ts:40-46` | El test de no regresión **alterna** con `sides` (pares) y sin `sides` (impares), así que cada partida solo se comprueba en uno de los dos modos. | Rejugar las 200 en los dos modos (cuesta < 1 s). Mi comprobación de abajo lo cubre mientras tanto. |
| N-09 | Menor (nota para el cliente) | `game.ts:279-287`, `:513-538`, `:594-631` | Las semillas por contador impiden repetir una tirada **solo si el cliente guarda el estado devuelto antes de enseñar el resultado** (encuentro, farol, eco). Si muestra primero y guarda después, recargar da otra tirada. Además, `applyBattleResult` no comprueba que el `BattleState` sea el de ese encuentro, y la semilla está en claro en `localStorage`. Esto último se acepta: es un juego local. | Que la guía del cliente diga: «guardar inmediatamente tras `rollEncounter`, `throwLantern` y `resonate`, antes de pintar». |

---

## Comprobaciones (por caminos propios)

| # | Qué | Resultado |
|---|---|---|
| 1 | **3 contra 3 idéntico** | `createBattle` es el único cambio del motor (`engine.ts:597-605`). Sin `sides`, `minN = n` y `validatePlacement(p, C, n, undefined)` usa `cfg.placements`: el mismo camino de antes. `referencePlacement` solo se desvía con `sides` y n < 3. **Hashes de registro y de estado final: 1000/1000 iguales sin `sides` y 1000/1000 con `sides`.** Los obtengo con el motor de `5c8ddce` extraído aparte y con semillas propias (`qa-revisor-nr-77`, `qa<i>`). Un tercio de las partidas lleva colocaciones al azar válidas y otro sexto, colocaciones **inválidas** (para probar el respaldo). |
| 2 | Niveles | `combatantFromSlots` usa `buildCombatant(criatura)` sin nivel: **nunca hay estadísticas**. Nivel 1 = gratis + cola. El tope de 4640 descarta lo que sobra. La tabla es entera y el parser la valida. En 270 combates, el número de movimientos por nivel (2/3/4) coincide con mi cálculo propio. |
| 3 | Variantes | Puntos efectivos y tabla de ejes según §4.5 (`variants.ts:70-182`). Consumo de 2 tiradas fijas por oferta, que es pura (clave + nivel). **0 piezas añadidas con la misma potencia** en 72 genes del catálogo + 2000 al azar (B-01 cerrado). Lo de < 2 candidatas es N-01. |
| 4 | Atrapar, esencia, faroles, liberar, resonancia | Recalculo cada evento con la fórmula de la config en 3 partidas largas de 90 combates, con dos semillas propias. **XP, esencia, faroles, % de atrapar (166 lanzamientos), tirada `floor(u·100) < pct`, coste 5 + ecos, eco a nivel 1 sin variantes y esencia de liberar: 0 discrepancias.** Primer intento: 110/152 (72 %). Explotabilidad: el % se fija con el estado del encuentro (`enc.team`), así que cambiar o liberar a mitad no lo sube. El farol y la resonancia usan contadores globales que se guardan (N-09). |
| 5 | Guardado | 270 idas y vueltas `serialize → parseSave → serialize` con texto idéntico, en partidas con nivel 30, variantes elegidas y conmutadas, 274 resonancias y 99 liberaciones. **38 corrupciones rechazadas con `SaveError`**: JSON truncado, xp null/decimal/negativa/excesiva, huecos incoherentes, equipo inválido, nacimiento > contador, recursos por encima del tope, 6 ecos, familia o gen falsos, gen borrado, variante con nivel insuficiente, eje raro, `variante=true` sin elección, versión 2, progresión 0.2, etc. Huecos que se aceptan: N-06. |
| 6 | Determinismo | Grep sin `Math.random`, `pow`, `sqrt`, `log`, `exp`, trigonométricas ni reloj en `progression/`. Misma semilla y mismas decisiones dan el mismo `gameHash`. **Encuentro: 622 tiradas exactas** en las 3 zonas (200 semillas cada una). IA instinto y de referencia con bandos de 1–3: **0 planes inválidos** en 1500 combates (8296 turnos), así que nunca entra el plan de respaldo en silencio. |
| 7 | Parser | Rechaza bien (`ConfigError`): null, pct_min > pct_max, xp no creciente, fórmula 621, pesos a 0, pieza inexistente, holgura < 0, tiradas 3, intentos 0, divisor 0, equipo 4, R3, faroles iniciales > máx, niveles > 30, rango 0, nombres vacíos. Acepta erratas (N-02) y colocaciones de la IA inválidas (N-05). |

## Decisiones del núcleo (I-xx)

| I | Opinión |
|---|---|
| I-01 | **Correcta según la spec** (§7.1 usa esas claves). La ida y vuelta es exacta porque `parseSave` reconstruye las claves en el mismo orden (comprobado 270 veces). |
| I-05 | **La decide el director o el diseñador.** Es razonable, pero tiene que nombrar también el doble KO (N-04). No hace falta Miguel. |
| I-06 | **Correcta:** es la lectura natural de §3.2, porque la pantalla de faroles va después del reparto. Favorece un poco al jugador (dn menor). |
| I-07 | **La spec lo permite, pero recomiendo cambiarla** (N-03): ahora mismo la inicial pelea sola tras la primera captura. La decide el director. |
| I-08 | **Aceptable.** Difiere del texto de la spec con 3 salvajes (N-07): conviene actualizar la spec, no el código. |
| I-11 | **Correcta y necesaria.** Sin reservar el locus, dos niveles pendientes ofrecerían el mismo. Empezar por el principio de `orden_respaldo` equivale a «el siguiente», porque los loci anteriores ya están tomados. |
| I-12 | **Correcta.** No choca con §4.5 y es reversible gratis. Conviene que el cliente lo diga («variante activa»). |

## Checklist
- [x] `npm run check` dos veces (339/339, árbol limpio)
- [x] Spec frente a código en lo nuevo (§2–§8)
- [x] Más de 2 cifras recalculadas por un camino propio (hashes 3 contra 3, XP, esencia, %, coste, liberar, tiradas)
- [x] Intentos de romperlo (guardados corruptos, config con erratas, colocaciones inválidas, bandos de 1–3)
- [x] Dorados de combate y genética sin tocar (diff `test/fixtures`: solo se añade `hashes-3v3.v0.5.json`)
