# Ingeniero del núcleo — convenciones y lecciones

## Entorno (sin red, sin dependencias)
- Node ≥ 22.18 ejecuta TS por *type stripping*: solo **sintaxis borrable** (nada de `enum`, `namespace`, parameter properties ni `import x = require`). `erasableSyntaxOnly` en tsconfig lo vigila.
- Los imports relativos llevan **extensión `.ts`**. El JSON se importa con `with { type: "json" }`.
- No hay dependencias en tiempo de ejecución ni de tests: `node --test` + `node:assert/strict`, y `tsc -p .` solo para tipos.
- `types/node-shim.d.ts` (y `sim/node-sim.d.ts`) declaran lo mínimo de Node porque aquí no hay `@types/node`. Si lo instalas, borra los shims y pon `"types": ["node"]`. Si un test usa algo de Node nuevo, hay que añadirlo al shim.

## Determinismo (lo no negociable)
- Todo el azar pasa por `createRng(semilla)` (sfc32 + cyrb128). En `src/` no hay `Math.random` ni reloj.
- En genética solo se permiten `+ - * /`, comparaciones y `Math.round/floor/min/max/abs`. Están **prohibidos** `**`, `pow`, `sqrt`, `log`, `exp`, las trigonométricas y `rng.normal` (Box–Muller). La normal se hace con Irwin–Hall de 4 uniformes. `10^d` se calcula multiplicando en el parser. El test de higiene lo comprueba con una regex.
- **El orden y el número de tiradas son fijos** (salvaje 205, cría 280), se usen o no los valores. Así los barridos son pareados. Comprobarlo con `drawsConsumed` en los tests, comparando el estado del RNG.
- Las comparaciones de strings se hacen con `<` (unidades UTF-16), nunca con `localeCompare`. `sort` siempre con desempate total.
- Los respaldos (como la forma mutada de N0 a N3) deben ser deterministas, sin tiradas extra y siempre con solución.

## Diseño de la API
- Funciones puras: `breed` no escribe en los padres y devuelve copias con `offspringCount + 1`. Los genes nacen congelados (QA-08). La única función con efectos es `recordMutations` (Genedex), y está documentada.
- La config se valida en `parseGeneticsConfig` (función pura que recibe el objeto JSON; el núcleo no lee ficheros). Hay que validar la coherencia entre derivados (número de tiradas, normal, calidad min/max) y los ids con regex.
- Toda entrada externa se valida antes de tirar: `Number.isInteger` en nacimiento y crías. Un error no consume tiradas.
- No hay constantes de reglas en el código: todo sale de la config, incluidas las tolerancias. Los literales 3, 4 y 6 son estructurales.
- Hay que comentar cada regla con su sección (`// spec §4.5`). Los huecos de la spec van a `docs/spec/notas-implementacion-vX.Y.md`, nunca se editan la spec ni el JSON.
- Para el simulador se exponen trazas (`trace`, `mutations[].parentKeys`, `fallbackLevel`), así puede medir sin conocer los detalles internos.

## Tests
- Usar **vectores dorados** (salvaje y cría con mutación, en JSON) para detectar cambios accidentales del algoritmo. Se regeneran solo cuando la spec cambia el algoritmo, y hay que decirlo en el informe.
- En los estadísticos, la tolerancia es de 5 errores estándar (`tol5`) con semilla fija: sin inestabilidad y sensibles a errores de ~1 punto.
- Además de las frecuencias, probar las invariantes tras muchas generaciones con mutación alta, los casos borde construidos a mano (`makeCreature`, `hybridGene`) y llamadas directas a funciones internas para los respaldos.
- Los tests de QA (`qa-genetica.test.ts`) no se debilitan: si hay que adaptarlos, solo se cambia lo que exige la API nueva.
- `npm run check` debe tardar menos de 25 s (nov 2026: ~20 s en esta máquina con combate v0.5; vigílalo).

## Lecciones
- Una spec con "suma fija" necesita una función común de reparto (`distribute`) con un ajuste de redondeo explícito, no soluciones distintas en cada sitio.
- El parser es la primera línea de defensa del simulador: casi todos los hallazgos de QA de v0.1 eran validaciones que faltaban.
- Combate: el estado guarda la energía *disponible* del turno (la IA la ve antes de elegir); las 24 tiradas se sacan todas al empezar el turno, por posición, antes de ejecutar nada.
- La IA elige objetivos válidos *ahora* y usa la simulación solo para puntuar; si no, genera planes inválidos que el motor convierte en golpes sin avisar (lo detecta un test que exige `plan.valid` en todas las partidas).
- Los JSON de config llevan claves `_doc`: los parsers cuentan claves con `dataKeys` (ignora `_…`).
- En tests de reglas, controla todo lo que multiplica: `varianza = 0`, `jitter = 0`, golpe de potencia 0 y familias distintas en el equipo (la sinergia se cuela si 2+ usan movimiento).
- Si una tabla derivable (familias) está en la config, se valida contra su regla y se permite borrarla para los barridos.
- v0.2: reproducir los ejemplos y estimaciones de la spec (movimientos §8, cuotas §5.1, uso c4/c5, duración) valida a la vez la spec y el núcleo; hazlo antes de regenerar dorados.
- Palancas: también los números "implícitos" de la IA salen de config (10·fA = `golpe_basico.potencia`, +50 % = `condiciones.bonus`, 10 − 3 = `maximo − por_turno`). Barridos con `patchRawConfig`/`buildBattleConfig` (rutas estrictas; forma larga para claves con puntos, como las sales).
- Si un respaldo "siempre termina", el parser valida la desigualdad del peor caso (`fraccion_minima·B ≤ B − fac_area`) y un test comprueba que el último nivel no se alcanza.
- Tests de IA: un solo actor vivo y huecos rellenos con movimientos inasequibles (coste 9), para calcular a mano el valor de cada plan.
- IA con búsqueda: el plan del rival no depende del nuestro (elección simultánea), así que se modela una vez por decisión; números aleatorios comunes entre candidatos (simulación i = misma semilla) para que las diferencias sean del plan, no del azar.
- Honestidad de la IA: su azar sale de `createRng("search|bando|turno|hash del estado")` y nunca recibe el RNG de la partida; el test sustituye `Math.random`/reloj por funciones que lanzan. Presupuesto en nº de simulaciones, no en ms.
- Medir una IA de búsqueda contra el mismo rival que modela es su mejor caso: añade siempre un control contra un rival fuera del modelo.
- Variantes en estudio: opción de config desactivada por defecto y bloque opcional en el parser; los campos nuevos de estado, movimiento y eventos solo existen cuando la variante se usa (un campo siempre presente cambia los hashes y las semillas de la IA de búsqueda).
- Azar nuevo sin tiradas nuevas: usar una tirada fija que la acción no gasta (la 2.ª de varianza en un golpe de un objetivo) mantiene las 24 por turno y los barridos pareados.
- Una pieza nueva de la gramática se sortea en la cola de una tirada existente (`u ≥ T/(T + w)`): por debajo del umbral el catálogo no cambia, y el cambio al activarla es mínimo y enumerable.
- Reglas de objetivo en una sola función sobre una "vista" (vivos, vida, provocar): la usan el motor al ejecutar, la previsión de la interfaz y la simulación de la IA; en tests de planes, cuidado con Σcoste > energía (el plan inválido se vuelve golpes y el test mide otra cosa).
- v0.4: un cambio de reglas va en configs nuevas (`*.v0.4.json`) con claves obligatorias, y el parser sigue cargando la versión anterior con valores que la reproducen: los dorados viejos prueban la regresión y los nuevos fijan las reglas nuevas.
- Casilla vacía = `null` en `teams` y `FighterState` en KO: todo lo que ya filtraba KO funciona solo. Índices de tiradas por casilla (`slots`), nunca por `tamano`.
- Las garantías de la gramática ("toda cola con alcance o área") se prueban con miles de claves mutadas, no con el catálogo: el respaldo puede quitar lo que garantizaba.
- v0.5: una acción con varios movimientos se modela como un hueco con `steps` (cola agrupada por actor conservando el orden del plan): para planes de una entrada por actor el algoritmo es idéntico y el dorado viejo lo prueba. Los eventos nuevos (`lost`, `seq`, `moves`) solo se añaden con su mecánica activa.
- Un estado derivable ("última ánima" = una sola viva al empezar el turno) no se guarda en `FighterState`: se recalcula con una función pública que usan motor, IA y cliente.
- Funciones viejas que necesitan la config para una regla nueva (`eligibleActors`, `restingMoves`): parámetro `cfg?` opcional; sin él, la regla de siempre (no rompe cliente ni simuladores).
- Tests de desempate de la IA: añade el control con la palanca contraria ("minimo") para demostrar que de verdad había empate; y calcula λ antes de diseñar el caso (guardar energía puede valer más que el movimiento que quieres probar).
