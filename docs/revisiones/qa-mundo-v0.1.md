# QA — núcleo del mundo caminable v0.1

Revisor/QA, 2026-11-16. Commit `320b596` en `main` (`packages/core/src/world/`, `packages/core/test/world*.ts`). Entrada: `docs/spec/mundo-v0.1.md`, `config/mundo.v0.1.json`, `docs/spec/notas-implementacion-mundo-v0.1.md` (W-01..W-14), D-074. Revisión corta.

## Qué se ha hecho

- `npm run check` dos veces: **456/456** las dos (tests 18,4 s y 15,8 s; con tsc, en el límite de 25 s, como dicen las notas).
- El commit no toca `src/progression/`, `src/combat/` ni ningún dorado anterior (`git show --stat`): la progresión y los dorados de combate quedan intactos.
- Higiene: ni `Math.random`, ni reloj, ni `**`/`pow`/`sqrt`/`log`/`exp`/trigonometría en `src/world/` (búsqueda con grep).
- Script propio (scratchpad, semillas `qa-*`, `rl-*`, `rt-*` que no salen en los tests), con llamadas directas al núcleo:
  1. **Tirada y regla §3.1 recalculadas por otro camino.** 40 semillas × 1500 pasos aleatorios (huyendo de cada encuentro): 18 946 pasos de hierba, 1001 encuentros (86 por la garantía de 40). En cada paso calculo yo `u = createRng(semilla|paso|k).next()` y la regla de la spec. Coinciden todos: el encuentro ocurre exactamente cuando la spec dice; `k` sube 1 por paso de hierba también en gracia; en gracia `pasos_sin_encuentro` no cambia; el camino no toca gracia ni contadores; chocar solo cambia `mira`. El encuentro y la partida son **idénticos byte a byte a `rollEncounter(game, zona)`** llamado aparte. Gracia tras encuentro = 4 y sin-encuentro = 0.
  2. **Recarga.** 30 semillas × 800 movimientos con el protocolo de guardado de §5.1 (cada 10 pasos y en eventos; mundo antes que partida). Corto en un punto aleatorio, recargo las dos claves con `parseSave` y `parseWorldSave` y repito los movimientos desde el último guardado. La secuencia de encuentros (paso y contenido) es **idéntica** a la de la partida sin cortar en los 30 casos, sin notas de carga.
  3. **Rutas.** 400 casos en el Prado real: posición y destino aleatorios, con y sin inicial, con el farol recogido o sin recoger. Salen 238 rutas y 162 `null`. Las 238 son deterministas (dos llamadas, mismo resultado), ≤ 80 pasos, y ninguna atraviesa casillas no pisables, entidades, activadores ni hierba sin inicial. Terminan en el destino, o al lado y mirándolo si el destino es una entidad o un activador. Al ejecutarlas con `step` real no queda ningún paso intermedio bloqueado. El coste coincide con un Bellman-Ford propio en el 100 % (0 subóptimas).
  4. **Guardado.** 15 corrupciones: JSON roto, `null`, lista, semilla ajena, `pos` nula o fraccionaria, sobre Arnal o sobre la puerta, gracia 7, `pasos_sin_encuentro` 40, `__proto__`, recogidos repetidos, negativos, números en texto. Ninguna lanza: todas dan `newWorld` + 1 nota, y la partida no cambia.

## Hallazgos

### Bloqueantes
Ninguno.

### Importantes
Ninguno.

### Menores

**M-01. El farol perdido se puede recoger una y otra vez borrando o corrompiendo la clave `genoma.mundo`.**
- Dónde: `save.ts:39-41` (el respaldo es `newWorld` con `recogidos: []`) y `world.ts:203-209`.
- Escenario: recoger el farol, borrar `genoma.mundo` con las herramientas del navegador, recargar y volver al rincón: +1 otra vez. Se puede repetir hasta el tope de faroles.
- La spec (§5.1) lo acepta como "+1, aceptable", pero no es +1 una sola vez: se repite. Hace falta tocar `localStorage` a mano, así que no afecta a la prueba con amigos.
- Arreglo (si se quiere): anotarlo en la spec como trampa conocida. O, en el respaldo, dar el farol por recogido si la partida ya tiene `contadores.encuentros > 0` (es un parche). No hace falta ahora.

**M-02. Orden de escritura al recoger el farol: es un contrato del cliente que no está escrito.**
- Dónde: §3.4 de la spec y nota W-09.
- §3.4 fija "mundo antes que partida" solo para los encuentros. Si al recoger el farol el cliente escribe primero la partida y se corta antes de escribir el mundo, al recargar el farol sigue en el mapa con +1 ya sumado: es la única forma de duplicarlo sin trampas.
- Arreglo: decir al cliente que también en `pickup` (y en cualquier `interact` que cambie las dos claves) se guarda primero `serializeWorld` y después `serialize`. Una línea en las notas de implementación y comprobarlo en el cliente.

**M-03. Ruta hacia la puerta o la salida: el evento puede dispararse dos veces.**
- Dónde: `world.ts:291-293` y nota W-11.
- El último `step` de la ruta, al girar hacia el activador, ya devuelve `door` o `exit` (§2.1 paso 3). Las notas dicen además que "al terminar, si el destino era entidad o activador, [el cliente] llama a `interact`". Si el cliente hace las dos cosas, abre el santuario o la lista dos veces.
- Arreglo: aclarar en W-11 que si el último paso ya dio `door`, `exit` o `exit_locked`, el cliente no llama a `interact`. Solo lo llama si la ruta terminó sin evento (destino entidad, o ruta vacía porque ya estaba mirando).

**M-04. W-06 puede producir un guardado que la carga rechaza.**
- Dónde: `world.ts:145-147` frente a `save.ts:66`.
- Escenario: si `rollEncounter` lanza en el paso forzado (`pasos_sin_encuentro` = 39), el contador sube a 40. El rango de carga es 0..39, así que el siguiente guardado se descarta entero y el jugador vuelve a `inicio`.
- En la práctica no se alcanza: el Prado está siempre abierto y el paso 5 exige inicial.
- Arreglo: en la rama de error, `pasos_sin_encuentro = min(+1, max − 1)`, o no incrementarlo.

**M-05. `npm run check` está en el límite de 25 s.**
- Tests: 15,8–18,4 s; las notas dan unos 24,5 s en total.
- El siguiente bloque de tests lo pasará. No es un fallo del mundo, pero hay que vigilarlo (por ejemplo, el dorado de 300 pasos y el bucle de 30 erratas del parser son candidatos a abaratar).

## Desviaciones W-01..W-14
Ninguna contradice la spec ni a Miguel (D-074):
- W-03 (gracia 6 en mundo nuevo) y W-12 (carga estricta, nunca lanza) siguen §5.1 y §5.2 al pie de la letra.
- W-10 (hierba cerrada para la ruta sin inicial) es coherente con el paso 5 de `step`.
- W-14 (lanzar si las semillas difieren) es más estricta que la spec, pero razonable, porque el cliente siempre pasa por `parseWorldSave`.
- Las únicas aclaraciones que piden son las de M-02 y M-03, ambas del lado del cliente.

## Veredicto
**Aceptar.** Determinismo, 1 tirada por paso de hierba, gracia, garantía a 40, igualdad con `rollEncounter`, recarga sin cambiar encuentros, rutas válidas y óptimas, y respaldo del guardado: todo comprobado por un camino independiente. Los menores M-02 y M-03 conviene pasarlos al encargo del cliente que está en curso. M-01 y M-04 pueden esperar.
