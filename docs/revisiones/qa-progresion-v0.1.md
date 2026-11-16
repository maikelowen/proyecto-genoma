# QA en lote — reequilibrio v0.5 (catálogo) y spec de progresión v0.1

Revisor/QA, 2026-11-16, rama `main` en `f22499d`. Revisa trabajo del analista (A) y del diseñador (B), que no ha hecho el revisor.

## Veredictos
- **A) Reequilibrio v0.5 (`movimientos.v0.5.json`, D-069): APROBADO.** Las cifras se reproducen con semillas y emparejamiento propios.
- **B) Spec de progresión v0.1 + `progresion.v0.1.json`: CON CAMBIOS.** Hay 1 bloqueante: la regla de variantes deja pasar variantes estrictamente más fuertes, y eso contradice D-068. Hay además 5 importantes: huecos que obligarían al núcleo a inventar y un criterio de liberar que queda en el límite. Las decisiones de fondo se respetan: los niveles nunca dan estadísticas, se empieza con el gratis y 1 de pago, el máximo es 30, el 3 contra 3 queda idéntico, se puede liberar y los nombres son provisionales. La economía cuadra con las estimaciones de la spec.

`npm run check` dos veces: 251/251 en verde (12,5 s y 12,9 s).

Scripts propios (fuera del repo, en el scratchpad de la sesión): `fam.mts` (familias), `var.mts` (variantes) y `eco.mjs` (Monte Carlo de la economía).

---

## A) Reequilibrio v0.5

| Comprobación | Resultado |
|---|---|
| Sales del fichero = sales validadas | Sí. Diff campo a campo de `movimientos.v0.5.json` frente a `v0.4`: solo cambian `_doc` y las 6 sales del informe (`sombra.cuerpo.1` r2→c3, `sombra.cuerpo.3` c3→c4, `brote.cuerpo.2` c3→c1, `roca.cuerpo.2` —→c1, `sombra.cola.2` —→c2, `llama.cola.2` —→c2). |
| v0.4 y su dorado intactos | Sí. `config/movimientos.v0.4.json` y `combate.v0.4.json` no cambian desde `cc7915d`; `packages/core/test/fixtures` tampoco. Los sims siguen por defecto en v0.4 (`sim/v04/setup.ts:33`, `MOVES_PATH`). |
| Cliente | `client/combat/data.ts:3-4` importa `combate.v0.5.json` y `movimientos.v0.5.json`. Los dos HTML publicados llevan las sales nuevas (`"llama.cola.2":"c2"`, `"roca.cuerpo.2":"c1"`) y `pago_al_confirmar:true`. El nivel superior de `combate.v0.5.json` coincide con `ambas` (los dos interruptores a `true`). |
| Familias con semillas propias | **13/13 en banda**, de 47,0 % a 52,2 %. Prefijo `qaRev07`, 600 combates por pareja (46 800 en total, unos 7 200 por familia, IC ±1,2 pp), lados alternos, `runBattle` del núcleo con los ficheros cargados tal cual (como el cliente). Por familia: marea 47,0, roca 48,5, llama 48,6, magma 48,1, liquen 49,4, vapor 50,1, sombra 50,2, abismo 50,4, brote 50,7, tormenta 51,5, voltio 51,6, plasma 51,8, espora 52,2. Contraste con el catálogo v0.4 y las mismas semillas: 3 fuera (brote 39,9, roca 40,6 y sombra 64,8) y llama en el borde (43,0). Coincide con el informe (46,1–53,3 % y 4 fuera). |
| Primer KO | 71,9 % ± 0,4 (v0.4: 72,8 %). Es la población de C2 y no la de C1, pero está en línea con el 71,2 % del informe: sigue suspendido, como acepta D-069. Empates 0,28 %; 8,6 turnos. |

**A-01 (menor).** `docs/informes/combate-v0.5-reequilibrio.md:3` dice que se generó «desde el commit `2a836af` (más cambios locales si los hay)». La procedencia es floja: las huellas sha256 sí identifican las configs, pero no el código. Arreglo: el próximo informe debería generarse con el árbol limpio o anotar el diff.

---

## B) Spec de progresión v0.1

### Hallazgos

| ID | Sev. | Dónde | Escenario / reproducción | Arreglo propuesto |
|---|---|---|---|---|
| **B-01** | **Bloqueante** | `docs/spec/progresion-v0.1.md:195`; `config/progresion.v0.1.json:127` | La regla 3 (`potencia(candidato) ≤ potencia(M)`) **no garantiza «nunca más fuerza» (D-068)**. Si `M` está en el **tope** del escalable o tiene **holgura por redondeo**, añadir una pieza deja la potencia igual: la variante es `M` + una pieza gratis. Con el catálogo v0.5 real (`var.mts`) salen **4 de 72 genes**: `voltio|cuerpo|1241` (protección c4, escudo 300 en el tope) acepta «+prisa»; `sombra|cuerpo|4214` (protección c5, 300) acepta «+prisa», «+regenerar» y las 5 condiciones; `brote|extremidades|1312` y `roca|extremidades|2240` (gratis 10 con drenaje) aceptan cualquier condición sin perder potencia. En 2000 genes mutados al azar ocurre en el **8 %** (163). | Añadir a la validez: **puntos efectivos del candidato ≤ puntos efectivos de `M`**, con `ptsEf = min(pts, tope/potencia_por_punto)` y `puntosEf = fijo + fac·extra + fac·fEsc·ptsEf`. Exigir también que una pieza añadida baje la potencia. Así se eliminan los 4 casos y no se toca MOV. Test: «ninguna variante tiene más piezas y la misma potencia». |
| **B-02** | Importante | `progresion-v0.1.md:195, 207` | «Potencia por objetivo y sin condición» deja pasar variantes cuyo **pico** supera al original. Con la condición cumplida (×1,5), la variante supera la potencia de `M` en 46 de 72 genes del catálogo; el propio ejemplo de la spec da 180 frente a 145. Con área sobre 2 objetivos, la variante supera a `M` en 34 de 72. Por presupuesto es neutro (MOV pone precio a área y condición), pero D-068 dice «nunca más fuerza», y Miguel puede entender el daño total o el pico. | No es un error de cálculo: es una interpretación de una decisión de Miguel. El director debe registrar en DECISIONES que «más fuerza» = más presupuesto o más potencia base, no el pico condicional ni la suma en área, o llevarlo a PREGUNTAS. El criterio §9.2 «variante concreta > 58 %» lo vigila. |
| **B-03** | Importante | `progresion-v0.1.md:177`; zona `cantil_farol_roto` (`json:252-256`) | Las salvajes del Cantil llegan a **nivel 15–16 (2 de cada 7 niveles, ~29 %)**. La spec dice que «entran con su nivel y todo lo que ese nivel desbloquea», pero no dice si una captura de nivel 15 o 16 trae la **elección de variante de cola** pendiente, sin elegir o elegida por sorteo. El núcleo (`chooseVariant`) y el cliente (pantalla de atrapada) tendrían que inventarlo. | Decidir y escribir: p. ej. «la variante de un nivel ya superado al atraparla queda pendiente y se elige en el santuario», con la invariante de carga correspondiente. Alternativa: bajar el Cantil a 10–14. |
| **B-04** | Importante | `progresion-v0.1.md:102, 228-232, 288`; `creature.ts:51-55` | No se define **qué `id` y qué `birth` lleva una salvaje** (se genera en el encuentro con `createWildCreature`, que exige `id`) **ni si capturar o elegir la inicial incrementa `contadores.nacimientos`**. §5.3 solo lo incrementa al resonar; §7.1 dice «`nacimiento` es el contador de ánimas»; `idAnima(n)` depende de él y `breed` ordena los padres por `id`. Si a una captura se le cambia el id hay que reconstruir la `Creature`, que la spec da por «inmutable» (`:302`). | Escribir: la salvaje se genera con id temporal `w<encuentro>-<i>`; al atraparla `n = ++nacimientos` y se crea `{...criatura, id: idAnima(n), birth: n}` (sin tiradas). La inicial es `n = 1`. Añadir los tests correspondientes. |
| **B-05** | Importante | `progresion-v0.1.md:186-192` | El eje **estado** es ambiguo: «incluido "ninguno" si el arquetipo lo admite». Sin regla no se sabe: si `golpe_estado` o `maldicion` pueden quedarse sin estado (el generador nunca lo hace); qué alternativas tiene un `tactico` con prisa (pool `["prisa"]`); si un movimiento con **provocar** o **energía extra** tiene eje de estado (provocar ocupa su hueco); ni si en la **cola** de `maldicion` (área forzada) caben modificadores sin alcance. Según cómo se resuelva, las cifras de candidatos de abajo cambian. | Tabla explícita por arquetipo: `golpe` sin eje de estado; `golpe_estado`/`maldicion`: los 5 ofensivos sin «ninguno» (aturdir con c ≥ 3; en el gratis, coste ≤ 1); `proteccion`: prisa, regenerar, ninguno; `curacion`: regenerar, ninguno; `tactico`, provocar y energía extra: sin eje de estado. Cola: con área forzada, modificadores libres del arquetipo; si no, solo alcance ↔ área. |
| **B-06** | Importante | `progresion-v0.1.md:255-261, 356`; `json:170-175, 437` | Liberar **no es explotable**: no sube las resonancias más de +1 en 3 sesiones. Pero con la estrategia «libera todo lo que no esté en el equipo ni pueda resonar», mi Monte Carlo da **esencia de liberar / total = 15,5 % / 15,1 % / 14,8 %** (con 100 %, 90/80/70 y 80/70/55 de victorias). El criterio de la spec es ≤ 15 % y su estimación ≈ 10 %. Casi todo sale de **liberar ecos de nivel 1** (1 de esencia cada uno frente a 6–8 de la resonancia, una devolución del ~14 %), que el razonamiento de §6.2 no cuenta. | Si el director quiere aprobar el criterio con margen, `esencia_base` 1 → 0 (nivel 1–4 → 0) o «liberar da esencia solo a partir de `nivel_madurar`». Si no, que el analista lo mida tal cual con combate real. No hace falta preguntar a Miguel: es un ajuste numérico dentro de D-068. |
| B-07 | Menor | `progresion-v0.1.md:122-128`; `json:148` | Probabilidad de atrapar con decimales y `r2`: es determinista (IEEE, sin FMA), pero **el orden de las operaciones cambia el % redondeado** en 141 de 91 001 combinaciones (p. ej. `0,725` → 73 %, mientras que el ejemplo de la spec dice 72 %). Si el cliente muestra un % calculado por otro camino que el del núcleo, el «% visible» puede mentir por 1 punto. | Una sola función del núcleo para el % mostrado y el usado, o versión entera: `pct = clamp(60 + floor(25·Σvida/Σmax) − 5·dn − floor(15·(cal100 − 8550)/900), 25, 95)` (cal100 = calidad en centésimas, entero), `p2 = min(95, pct + 20)`, captura si `floor(u·100) < pct`. La curva de XP ya es entera; `fraccion_derrota` 0,5 → `floor(suma/2)`. |
| B-08 | Menor | `progresion-v0.1.md:275, 317` | El guardado fija `movimientos: "0.4"`, pero el catálogo vigente es v0.5 (D-069; `json:7`). Además, la variante se guarda como letra `"A"/"B"` y se regenera desde la clave: un reequilibrio futuro de sales cambia en silencio la variante que el jugador eligió «para siempre». | `movimientos: "0.5"`. Guardar la variante como `{eje, pieza}` (y regenerar solo el ensamblado), o fijar la versión del catálogo en la partida. |
| B-09 | Menor | `progresion-v0.1.md:203, 209` | Cuando `n = 1`, B = `M` («mantener»), y eso es redundante con el conmutador al original: no hay decisión. Pasa en 3 de 72 genes del catálogo, en el 10 % de los gratis mutados (48/478) y en el ~1 % del resto. | Si `n = 1`, ofrecer solo A (sin elección) o pasar al respaldo de otro locus. |
| B-10 | Menor | `progresion-v0.1.md:207` | El ejemplo usa «coste 3 (presupuesto 30)… potencia 145», pero en `movimientos.v0.5` el presupuesto[3] es 27 (golpe con alcance: 130). | Corregir el ejemplo con números de MOV vigente. |
| B-11 | Menor | `progresion-v0.1.md:118, 143` | §3.5 dice «Si se escapa: desaparece», pero §3.1 permite 2 intentos por salvaje. No queda claro si falla el 1.º y se va. | «Se escapa» = falla el 2.º intento; tras fallar el 1.º sigue disponible para el reintento. |
| B-12 | Menor | `progresion-v0.1.md:92, 96` | Huir antes del turno 1 sale gratis y el contador avanza, así que se puede **repetir el encuentro hasta que salga** la familia o el tamaño de grupo deseado. Solo cuesta tiempo. Que no se pueda recargar no lo impide. | Aceptarlo como decisión consciente o hacer que huir antes del turno 1 cueste algo (p. ej. 1 farol). Decide el director. |
| B-13 | Menor | `progresion-v0.1.md:111` | IA «instinto»: no dice **a quién apunta** ni a qué aliado protege o cura. | «Objetivo: el automático de COM (V4)», para que el núcleo no invente. |
| B-14 | Menor | `progresion-v0.1.md:160, 406` | Con la XP completa para todo el equipo, **un eco de nivel 1 madura en 1 combate del Cantil** (~176 XP ≥ 140). El motivo de PR10 («padres altos fabrican ecos maduros: anula madurar») vuelve a darse un combate más tarde. Con la variante «cuidador» suben las resonancias (mediana 38 frente a 32 con 100 % de victorias). | Es solo una observación de diseño. Si se quiere que madurar pese, que la XP de un ánima por combate no supere un tope (p. ej. 1 nivel); si no, dejarlo y quitar el argumento de PR10. |
| B-15 | Menor | `json:396-399` | Combates hasta nivel 30: el criterio es 35–70, pero **con el 100 % de victorias la mediana es 31**. Un buen jugador suspende el criterio por lo alto. | Bajar el mínimo a ~28 o aclarar que se mide con la tasa de victorias realista. |
| B-16 | Menor | `progresion-v0.1.md:123` | `dn` usa el «nivel máximo de tu equipo» sin decir si cuenta el acompañante (nivel 10). Hoy no cambia nada (Prado 1–3), pero el núcleo tiene que elegir. | «Sin el acompañante», como `fv`. |

### Respetado (sin hallazgo)
- **Los niveles nunca dan estadísticas** (D-029 B, D-065): los niveles solo abren huecos, maduran, revelan genes o dan variantes; las variantes no se heredan (`:211`, `json:132`).
- **Gratis + 1 de pago al empezar y los otros 2 subiendo** (D-067): huecos en los niveles 1/3/10 (`json:58-74`). **Nivel máximo 30** en config (`json:12`), tabla entera de 30 entradas, `5·(L−1)·(L+2)` comprobada en las 30.
- **El 3 contra 3 queda idéntico** (D-068.3): `createBattle` ya rellena las casillas vacías con `null`/`ko: true` (`engine.ts:602-609`); la condición de hashes idénticos en ≥ 200 partidas es obligatoria (`:89`). Para el núcleo: hoy `createBattle` lanza error si `length ≠ teamSize` (`engine.ts:597`), y ese es el punto que hay que cambiar.
- **Liberar** (D-068.2), **equipos de 1 a 3**, **nombres provisionales** con `provisional: true`, **hechicero en santuario** y **farol al ganar** (D-062), y el **vocabulario** de D-063.
- **Determinismo**: los flujos son todos `createRng(semilla|flujo|contador)` y las tiradas fijas (encuentro 1 + 3·(2+205) = 622 ✓; farol 1; resonancia 280 = `tiradas_por_cria` ✓; variantes 2; nombres 2). No hay trascendentes: la `0,922²⁰` de `:359` es informativa, no una regla.
- **Variantes del gratis**: hay opciones. Sin respaldo, con el catálogo v0.5 y mi lectura de B-05: **0 de 72 genes sin candidatos** (media de candidatos: gratis 4,2; cola 6,6; cabeza 6,7; cuerpo 8,4) y 4 de 2000 en mutados (0,2 %). La gramática **no** lo permite sin código nuevo: `generateMoveForKey` ensambla con respaldo y desde tiradas, así que hace falta el `assembleExact` de `:372`. Aun así, `validateMove` sirve tal cual para la validez (mi estimador lo reutiliza: unas 40 líneas).

### Economía (Monte Carlo propio, `eco.mjs`, 2000 partidas; nivel 30 con 500 × 15 sesiones)
Modelo del §9.1: equipo con las 3 de más nivel, la zona más alta abierta, 1 salvaje por combate o todas si quedan ≥ 6 faroles, y resonar con la pareja de menos ecos. Victorias **supuestas** por zona, porque falta el combate real. Turnos supuestos: 5/7/8.

| Victorias Prado/Marismas/Cantil | Res. sesión 1 (med) | Res. tras 3 ses. (med / p10 / p90) | Favorito tras 3 ses. | Combates a nivel 30 (med / p90) | Atrapar al 1.º | Min/sesión | Bloqueo por esencia | Colección |
|---|---|---|---|---|---|---|---|---|
| 100/100/100 | 8 | 32 / 25 / 36 | 22 | 31 / 33 | 64 % | 16,9 | 23 % | 48 |
| 90/80/70 | 7 | 24 / 18 / 29 | 19 | 39 / 45 | 64 % | 15,2 | 30 % | 38 |
| 80/70/55 (mínimos del criterio) | 5 | **20 / 14** / 26 | 17 | 47 / 54 | 63 % | 14,2 | 34 % | 32 |

Lectura: la estimación de la spec (23/17, nivel ≈ 20, 42 combates) cae entre mis escenarios 2 y 3, así que es coherente. El hito de D-066 (20 resonancias en 3 sesiones) **depende de las victorias**: con las tasas mínimas del criterio, la mediana queda justo en 20 y el p10 en 14 (< 15). Si el analista mide victorias cerca de los mínimos, el primer ajuste que propone la spec (`coste_base` 6 → 5) es el correcto. El nivel 30 llega en 31–47 combates (~5–8 sesiones de 6 combates).

## Checklist
- [x] `npm run check` ×2 (251/251)
- [x] Sales de v0.5 = validadas; v0.4, su config y dorados intactos; el cliente usa v0.5
- [x] Familias recalculadas con semillas y emparejamiento propios (N = 600 por pareja), con el primer KO
- [x] Spec frente a D-062, D-063, D-065 a D-068
- [x] Determinismo y consumo de tiradas
- [x] Economía recalculada (resonancias, nivel 30, liberar)
- [x] Cálculo con enteros (XP sí; atrapar: versión entera propuesta en B-07)
- [x] Variantes con el catálogo real (candidatos, n = 0, n = 1, piezas gratis)
- [ ] No se prueba: victorias por zona, espejos 4 contra 3 y 4 contra 2, y el 1 contra 1 en el motor (necesitan el núcleo ampliado; es trabajo del analista)
