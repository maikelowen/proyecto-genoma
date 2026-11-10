# Revisión QA: genética v0.2 (núcleo, cambio de κ, simulador e informe)

Fecha: 2026-11-10 · Revisor/QA · HEAD `d2baefd` (núcleo `f5068a5`; simulador e informe `d2baefd`).

Alcance:
- Las partes [v0.2] de `docs/spec/genetica-v0.2.md`.
- `packages/core/src/genetics/*`.
- El cambio de `deriva.kappa` de 0,10 a 0,075.
- `sim/genetics/*` y `docs/informes/genetica-v0.2.md`/`.html`.

No he ejecutado el modo completo. Sí he ejecutado:
- `npm run check` dos veces (82/82 las dos veces).
- `--quick` con salida en `/tmp/qa2/quick`.
- Scripts propios fuera del repo (`/tmp/qa2/core.ts`, `/tmp/qa2/bad.ts`).
- Lectura de los CSV de `sim/out/completo` (que git ignora).

Solo he creado este fichero y `docs/equipo/revisor.md`.

## Veredicto: **núcleo APROBADO · simulador e informe APROBADO CON CAMBIOS**

**Núcleo v0.2:** sin hallazgos bloqueantes ni mayores. QA-01 a QA-07 están resueltos y lo he comprobado. El cambio de κ es correcto en el JSON y en el código. Los vectores dorados se regeneraron de forma legítima: entre el vector viejo y el nuevo solo cambian 26 `values` de genes copiados con deriva. Los genes mutados, las calidades, las anclas, los ids y las formas no cambian.

**Simulador e informe:** las cifras que he podido contrastar son correctas. Hay tres hallazgos mayores que afectan a cómo se presenta la decisión de κ:
- **V-01:** κ 0,075 se eligió mirando las semillas de validación. Es el problema S-02 otra vez.
- **V-02:** con κ = 0,075 ya en la config, el informe no se puede regenerar sin mezclar etiquetas.
- **V-03:** el monocultivo de E5 aparece con cualquier κ en las primeras generaciones. κ solo cambia cuánto se recupera hacia la generación 300.

Ninguno invalida que v0.2 funcione. Sí obligan a corregir el informe y a tratar κ 0,075 como provisional hasta validarlo con semillas nuevas.

## Comprobaciones independientes

| Qué | Resultado QA | Informe/spec | ¿Coincide? |
|---|---|---|---|
| Deriva con κ 0,075 frente a la fórmula de §6 recalculada a mano (800 genes, sin límites activos) | diferencia máx. 0,0095 (≤ 0,01, el ajuste de redondeo de `repartir`) | §6 | Sí |
| 60 gen × 200, mutación 30 %: claves mutadas que coinciden con alguna de las 6 de los padres | 0 de 14.524 | D-007 | Sí |
| Niveles de respaldo N0/N1/N2/N3 | 98,6 / 1,4 / 0,03 / 0 % | E1: 98,3 / 1,7 / 0,02 / 0 | Sí |
| Calidad de genes base heredada intacta y siempre dentro de [85,5; 94,5]; invariantes | 0 fallos; 0 violaciones | §1.4 | Sí |
| Regla de familia §7: los 3 ejemplos de la spec y 4 casos más (empate entre híbridas, híbrida fuera de la cabeza) | todos correctos | §7 | Sí |
| E4: primera criatura Vapor (200.000 crías F1, p por cría) | p = 2,96 % ⇒ mediana 24, p90 77 | 23 / 77 | Sí |
| Configs inválidas: centro 0, máx. crías 0, id `va\|por`, κ 1,2, calidad.min incoherente, peso híbrido 0 | todas dan `ConfigError` | QA-04/06/07 | Sí |
| `birth` NaN o ausente | `BreedingError` sin consumir tiradas | QA-02 | Sí |
| Monocultivo E5, nº de semillas con máx. clave > 60 % (de 20), en gen 20 / 50 / 100 / 300 | κ 0,10: 19/18/17/16 · κ 0,075: 19/18/12/9 · κ 0,05: 19/13/2/0 | solo se informa gen 300 | Ver V-03 |

## Hallazgos

| ID | Severidad | Fichero:línea | Descripción | Reproducción | Arreglo |
|---|---|---|---|---|---|
| V-01 | **Mayor** | `sim/genetics/runner.ts:86-90`; informe, resumen 5 y Recomendación 1 | κ 0,075 se añadió *después* de ver los resultados de `valida02-*`, y se declara que "aprueba 21/21" con esas mismas semillas. Es validación dentro de la muestra, igual que S-02, y además el resultado es frágil: monocultivo 59,5 % frente a un umbral del 60 %, con 11/20 semillas que cumplen. La propia `docs/equipo/analista.md` dice que lo que se elige con unas semillas se valida con otras. | Informe, tabla de variantes. | Validar κ 0,075 con un prefijo nuevo (p. ej. `--semilla valida021`), con 20 semillas en E5. Hasta entonces, presentar κ 0,075 en el informe como "provisional" y no como "validado". |
| V-02 | **Mayor** | `sim/genetics/narrative.ts:93-94,111,123,149-150,161`; `runner.ts:86-90` | El informe tiene "κ 0,10" escrito a mano como etiqueta de la config por defecto, pero `DEFAULT_VARIANT` ya lee κ 0,075 del JSON. Al regenerarlo, la fila "v0.2 (κ 0,10)" muestra en realidad κ 0,075 y es idéntica a la variante "κ 0,075". Además, `sim/out/` no está en git, así que las cifras del informe publicado ya no se reproducen desde HEAD. | `node sim/genetics/cli.ts --quick --out /tmp/x`: en la tabla de variantes, "v0.2 (κ 0,10…)" y "κ 0,075" salen con los mismos valores (89,0 % · 0,77 · +6,31 · +7,09). | Sacar las etiquetas de κ de `cfg.drift.kappa` y crear una variante explícita `kappa010` como referencia. Regenerar el informe con la config actual, o congelar el informe v0.2 indicando el commit y la config con la que se generó. |
| V-03 | **Mayor** (interpretación) | informe, resumen 4 y "La causa es κ" (`narrative.ts:149`); spec §10.2, monocultivo | El criterio se evalúa solo en la generación 300. En los CSV de E5, con **cualquier** κ, entre 18 y 19 de 20 semillas superan el 60 % en las generaciones 20 y 50 (media de la clave máxima ≈ 75–80 %). κ solo decide cuánta diversidad se recupera después. Así que "la causa es κ" y "κ 0,075 aprueba" se cumplen en gen 300, pero el monocultivo temprano, que es el que verá un jugador, no cambia. | `sim/out/completo/{v02,arreglo_kappa0075,arreglo_kappa005}/E5__*.csv`, columnas `maxfrec_D_*` en gen 20/50/100/300 (tabla de arriba). | Mostrar la curva de E5 por generación junto a la decisión 2 del dueño. Plantear al Diseñador si el criterio de monocultivo debe mirar también la generación 50 o el máximo de la trayectoria. Reformular "la causa es κ" como "κ determina la recuperación a largo plazo". |
| V-04 | Menor | `sim/genetics/narrative.ts:93,149,161` | Las conclusiones están escritas como texto fijo ("La causa es κ", "La calidad no es la causa"). Solo las cifras se rellenan con datos. Con otros datos el texto no cambia: en `--quick`, κ 0,05 da un 90 % (peor que κ 0,10) y el informe sigue diciendo "la causa es κ". | Informe `--quick` en `/tmp/qa2/quick`. | Generar las frases causales a partir de los datos (comparación con umbral), o marcarlas como válidas solo para el modo completo. |
| V-05 | Menor | `docs/spec/genetica-v0.2.md:195,264,282,295,320,344` | κ = 0,075 solo está en la fórmula (línea 192). El resto de la spec sigue diciendo 0,10: "retorno al ancla del 10 %", la estimación de §10, el valor en negrita de §11, la decisión G3′, la tabla de cambios y la pregunta abierta. Además, la línea 192 dice "[v0.2.1]" pero la config sigue con `version: "0.2"`. Gana CFG, así que el comportamiento es correcto, pero el texto se contradice. | `grep -n "0,10\|10 %" docs/spec/genetica-v0.2.md` | Que el Diseñador actualice esas líneas y registre el cambio en DECISIONES.md con fecha y motivo (enlazando V-01/V-03). Decidir si es v0.2.1 o si se queda en v0.2. |
| V-06 | Menor (proceso) | informe, Recomendación 1 y 2 | El cambio a κ 0,075 ya está aplicado en la config, pero la decisión 2 pregunta al dueño "¿cuánta convergencia aceptamos?" y una de sus opciones es precisamente κ 0,075. La configuración se adelanta a la respuesta del dueño. | Lectura. | Dejar claro que κ 0,075 es provisional y que, si el dueño elige (b) o (c), se revierte. |
| V-07 | Sugerencia | `packages/core/test/genetics-breed.test.ts:480-496` | La única prueba que fija el *valor* numérico de la deriva es el vector dorado, y se regenera con el propio código. Con κ ya ha habido una regeneración. | — | Añadir un test de `copyWithDrift` contra la fórmula de §6 calculada a mano, con un caso sin límites activos (como mi comprobación 1). |
| V-08 | Sugerencia | `packages/core/src/genetics/config.ts:100` | La validación de ids usa una expresión regular que se lee de la propia config (`new RegExp(...)`). Si alguien la cambia por `.*`, la validación de QA-07 queda desactivada sin ningún aviso. | — | Fijar la expresión en el código, o comprobar que la de la config es exactamente `^[a-z0-9_]+$`. |

## Checklist

**1. Núcleo v0.2 [v0.2]**
- [x] Calidad ±5 % fijada al nacer el gen, triangular, heredada intacta. La de la mutación es r2 de la media de los padres. Σancla = Σvalores = calidad.
- [x] Deriva y mutación de suma cero con `repartir` (`math.ts:86-125`). Ninguna crea calidad.
- [x] La mutación excluye las 6 claves de los padres (`mutation.ts:150`). El respaldo N1/N2/N3 es determinista y no usa tiradas extra. N3 no se ha usado nunca.
- [x] Tiradas: 205 por salvaje (`uq1`, `uq2` en su sitio) y 280 por cría (con test).
- [x] Familia: el D híbrido pesa 2; en empate gana la híbrida; si sigue el empate, el primer locus (`creature.ts:24-37`).
- [x] Híbrida × componente: 0,5 (config y test).
- [x] QA-01 a QA-07 resueltos y comprobados. QA-08 (genes congelados), QA-10 y QA-11 aplicados según la spec.
- [x] `npm run check`: 82/82, dos veces.

**2. Cambio de κ**
- [x] JSON a 0,075, sin literales en el código (`gene.ts:53`). Tests coherentes.
- [x] Vectores dorados regenerados de forma legítima: solo cambian `values` de genes con deriva.
- [ ] Spec coherente (V-05) y decisión registrada (V-06).

**3. Simulador e informe v0.2**
- [x] S-01: 10.000 ensayos, flujo propio por configuración, IC con estadísticos de orden, contraste con el MLE, "> 5000" en vez de "∞". Recalculado: 24/77 frente a 23/77.
- [x] S-02: el v0.2 por defecto se valida con `valida02-*`.
- [ ] S-02: κ 0,075 se elige y valida con esas mismas semillas (V-01).
- [x] S-03, S-04 ("4000·p"), S-05 (puntos por gen y descomposición dentro de E3c) y S-06 (eje "% de ensayos") resueltos.
- [x] Determinismo: test en `npm test`. En `--quick`, re-ejecución idéntica y pareado 2 % frente a 3 % al 100 %.
- [ ] Afirmaciones respaldadas por los datos: V-02 (reproducibilidad y etiquetas), V-03 (gen 300 frente a la trayectoria) y V-04 (texto fijo).
- [x] El resto de las afirmaciones del resumen está respaldado: 23/25 criterios, E4 23/77, vigilancia de híbridas en E2 y subida de calidad +1,86.
