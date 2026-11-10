## Informe de simulación — genética v0.2 (revalidación)

Proyecto Genoma · Analista de balance · 2026-11-10 · modo completo. Semillas **nuevas** `valida02-1`…`valida02-5` (5 por escenario; E5 con 20), distintas de las usadas para elegir parámetros en v0.1 (`genoma-1..5`). E1/E2/E5 con N = 500 y 300 generaciones; E3 con N = 100 y 100; E4 con 10.000 ensayos (tope 5000 crías). Núcleo y config v0.2 (`config/genetica.v0.2.json`). Fuente de las cifras: CSV en `sim/out/`.

## Resumen ejecutivo

1. **v0.2 aprueba 23/25 criterios de §10.2 con semillas nuevas**; suspende `mono_H_D`, `mono_maxfrec`. Sorpresa 25,9 %, mutación 7,7 % de crías, Genedex 64,4 % repetidas, 0 violaciones de invariantes y determinismo 100 %.
2. **Problema A resuelto**: primera criatura Vapor desde padres puros en mediana 23 crías y p90 77 (objetivo ≤ 40 / ≤ 120; estimado 23 / 76). En v0.1 eran ≈ 1500.
3. **Problema B bajo control con capturas**: 2,5 % de D híbridos y 8,8 % de criaturas híbridas (objetivo ≤ 10 % y 3–25 %). En población cerrada siguen acumulándose (46,3 % de D; 90,4 % de criaturas).
4. **Nuevo problema**: criando solo por velocidad (E5, 20 semillas), una clave ocupa el 71,7 % de los D en el peor locus (máx. 60 %; v0.1: 40,6 %) y la calidad media sube +1,86 puntos. La causa es κ = 0,10: con κ 0,05 baja a 39,6 %, pero la deriva E3a pasa a +7,68 puntos (máx. +7,5).
5. **Recomendación**: κ 0,10 → **0,075**. Es la única variante que aprueba los 21 criterios (21/21): deriva +6,21/+7,30 puntos y monocultivo 59,5 %, aunque frágil (11/20 semillas). Además, decidir si se acepta que criar por un rasgo seleccione calidad.

## Criterios §10.2 (config v0.2 por defecto, semillas nuevas)

Valor = media de semillas con IC 95 % (t de Student). E4: cuantiles de todos los ensayos con IC 95 % de estadísticos de orden. "Frágil" = el IC cruza el umbral. Las filas informativas no tienen umbral en la spec (§10.2, "Informativo") y no cuentan en aprobados.

| Grupo | Criterio | Umbral | Valor [IC 95 %] | Semillas | Resultado |
|---|---|---|---:|---:|---|
| Sorpresa | E1 % crías con D nuevo (gen 1–20) | 15 %–30 % | 25,9 % [24,9 %; 26,8 %] | 5/5 | APROBADO |
| Diversidad | E1 gen 300: mín. claves distintas por locus | ≥ 12 | 141 [131; 150] | 5/5 | APROBADO |
| Diversidad | E1 gen 300: mín. H todos los slots (bits) | ≥ 2,5 | 6,13 [5,95; 6,32] | 5/5 | APROBADO |
| Diversidad | E1 gen 300: mín. H solo D (bits) | ≥ 2 | 5,93 [5,76; 6,09] | 5/5 | APROBADO |
| Diversidad | E1 gen 300: mín. H / H gen 0 | ≥ 50 % | 143,0 % [138,8 %; 147,3 %] | 5/5 | APROBADO |
| Diversidad | E1 gen 300: máx. frecuencia de una clave en D | ≤ 40 % | 9,1 % [6,6 %; 11,6 %] | 5/5 | APROBADO |
| Mutación | E1 mutaciones / 1000 crías | 4000·p = 80 ± 10 % | 79,8 [78,8; 80,9] | 5/5 | APROBADO |
| Mutación | E1 % crías con ≥1 mutación | 5 %–12 % | 7,7 % [7,6 %; 7,9 %] | 5/5 | APROBADO |
| Monocultivo dirigido | E5 gen 300: mín. claves distintas por locus | ≥ 10 | 23,9 [22,4; 25,3] | 20/20 | APROBADO |
| Monocultivo dirigido | E5 gen 300: mín. H solo D (bits) | ≥ 2 | 1,65 [1,42; 1,88] | 5/20 | SUSPENSO |
| Monocultivo dirigido | E5 gen 300: máx. frecuencia de una clave en D | ≤ 60 % | 71,7 % [65,6 %; 77,8 %] | 4/20 | SUSPENSO |
| Calidad (§15.6) | E5 Δ calidad media de las criaturas, gen 300 − gen 0 (puntos) | no debe subir (≤ 0) | +1,86 [+1,66; +2,07] | 0/20 | NO (informativo) |
| Genedex | E2 claves nuevas / 1000 crías (gen 1–10) | ≥ 40 | 75,9 [72,1; 79,8] | 5/5 | APROBADO |
| Genedex | E2 claves nuevas / 1000 crías (gen 291–300) | ≥ 5 | 27,4 [24,5; 30,3] | 5/5 | APROBADO |
| Genedex | E2 % mutaciones en clave ya registrada (gen 291–300) | 10 %–80 % | 64,4 % [60,8 %; 68,1 %] | 5/5 | APROBADO |
| Genedex | E2 híbridas distintas vistas | = 7 | 7 | 5/5 | APROBADO |
| Vigilancia de híbridas | E2 gen 300: % de D híbridos | ≤ 10 % | 2,5 % [2,1 %; 2,9 %] | 5/5 | APROBADO |
| Vigilancia de híbridas | E2 gen 300: % de criaturas de familia híbrida | 3 %–25 % | 8,8 % [7,0 %; 10,7 %] | 5/5 | APROBADO |
| Primer gen híbrido | E4 mediana crías hasta gen Vapor (10000 ensayos) | 10–40 | 17,0 [17,0; 18,0] |  | APROBADO |
| Primer gen híbrido | E4 p90 crías hasta gen Vapor | ≤ 100 | 57,0 [56,0; 59,0] |  | APROBADO |
| Primera criatura híbrida | E4 mediana crías hasta criatura Vapor (10000 ensayos) | ≤ 40 | 23,0 |  | APROBADO |
| Primera criatura híbrida | E4 p90 crías hasta criatura Vapor | ≤ 120 | 77,0 [76,0; 79,0] |  | APROBADO |
| Deriva | E3a homocigoto: Δ velocidad por gen D, gen 20 (puntos) | +1,5 a +7,5 | +4,95 [+4,81; +5,09] | 5/5 | APROBADO |
| Deriva | E3a homocigoto: Δ velocidad por gen D, gen 100 (puntos) | ≤ +8,5 | +5,62 [+5,48; +5,77] | 5/5 | APROBADO |
| Deriva | E3a control al azar: \|Δ\| gen 100 (puntos) | ≤ 1 | +0,14 [-0,04; +0,32] | 5/5 | APROBADO |
| Invariantes | Violaciones (todas las escenas; incluye clave mutada ∈ claves de los padres) | 0 | 0 |  | APROBADO |

**Determinismo**: misma semilla ⇒ mismo hash de población sí y mismo CSV sí; semilla distinta ⇒ población distinta sí; pareado 2 % vs 3 %: 8880/8880 crías sin mutación idénticas. **APROBADO**.

## Puntos pendientes de §15

| Punto de §15 | Resultado | Veredicto |
|---|---|---|
| 1. Primera criatura híbrida (E4) | mediana 23 [23; 23], p90 77 [76; 79]; 0 censurados. Contraste: MLE geométrico p = 3,00 % por cría ⇒ mediana 22,8 [22,3; 23,2]. Estimado: 23 / 76. | APROBADO |
| 2. Vigilancia de híbridas y afinidad | E2: D 2,5 %, criaturas 8,8 % (estimado 8–9 %). Afinidad 0,75 frente a 0,5: E1 cerrada, D híbridos 58,5 % frente a 46,3 %; E2 2,6 % frente a 2,5 %. | APROBADO |
| 3. Deriva E3a homocigoto (κ 0,10) | +4,95 puntos/gen en gen 20 (estimado +4,5 a +5,5); +5,62 en gen 100; control +0,06. | APROBADO |
| 4. D-007: tasa, sorpresa y respaldos | Mutación 79,8/1000 (esperado 80); 0 claves mutadas iguales a las de un padre. Sorpresa 25,9 %; con las semillas de v0.1, 26,6 % (v0.1: 26,5 % ⇒ +0,1 pp). Respaldos E1: N0 98,29 %, N1 1,69 %, N2 0,02 %, **N3 0**. En E5 (población homogénea): N1 9,7 %, N2 1,4 %, N3 0. | REVISAR |
| 5. Sorpresa, diversidad y Genedex con calidad | Sorpresa 25,9 %; peor locus: 141 claves, H_D 5,93 bits; Genedex 64,4 % repetidas. Todos aprueban, como en v0.1. | APROBADO |
| 6. Monocultivo E5 y calidad | Máx. clave 71,7 % (≤ 60 %; 4/20 semillas cumplen), H_D 1,65 bits (≥ 2,0; 5/20). Calidad media 89,99 → 91,86 (+1,86). | SUSPENSO |

## Monocultivo: diagnóstico y variantes de arreglo

Variantes ejecutadas solo para el criterio que suspende: E5 con 20 semillas (lo que pide la spec para E5) y E3a con 5. **Se han ejecutado 3 variantes**, una más del máximo de 2 que fijaba el encargo: margen de calidad a la mitad (prueba de hipótesis sobre la causa), κ 0,05 (valor de v0.1) y κ 0,075 (compromiso, añadido al ver que κ 0,05 rompe la deriva). Entre las tres suman ≈ 2,5 min de cálculo.

| Variante | E5 máx. clave en D (≤ 60 %) | E5 H_D (≥ 2,0) | Semillas que cumplen ambos | E5 Δ calidad | E3a Δ gen 20 (+1,5…+7,5) | E3a Δ gen 100 (≤ 8,5) |
|---|---:|---:|---:|---:|---:|---:|
| v0.2 (κ 0,10, margen ±5 %) | 71,7 % NO | 1,65 NO | 4/20 | +1,86 | +4,95 OK | +5,62 OK |
| κ 0,075 | 59,5 % OK* | 2,13 OK* | 11/20 | +1,73 | +6,21 OK | +7,30 OK |
| κ 0,05 (v0.1) | 39,6 % OK | 2,93 OK | 20/20 | +1,36 | +7,68 NO* | +8,70 NO |
| margen de calidad ±2,5 % | 71,7 % NO | 1,68 NO | 4/20 | +0,42 | — | — |

- **La calidad no es la causa del monocultivo**: con el margen a la mitad la convergencia es igual (71,7 %), aunque la subida de calidad baja a +0,42.
- **La causa es κ**: cuanto más tira la deriva hacia el ancla, menos rinde especializar los valores y más se selecciona el **tipo** de gen (su ancla). Al final un solo tipo rápido barre el locus. Pasa en unas semillas y en otras no: con κ 0,10, la máx. clave va de 45,8 % a 90,8 %.
- **La deriva E3a responde casi lineal a κ**: 0,10 → +4,95, 0,075 → +6,21, 0,05 → +7,68 puntos en gen 20. κ 0,05 se acerca al techo de +10 (gen 100: +8,70).
- **Sorpresa, diversidad y Genedex en E1/E2 son idénticos con cualquier κ**: la deriva solo toca valores, no claves, y las semillas son las mismas (diseño pareado).

## Recomendación y decisiones

1. **`deriva.kappa` 0,10 → 0,075** (decisión del director: parámetro dentro del plan). Con κ 0,075 aprueban los 21 criterios ejecutados (21/21): la deriva queda centrada (+6,21 / +7,30) y el monocultivo pasa justo (59,5 %, H_D 2,13), aunque frágil. Aun así, 9/20 programas aislados de cría por velocidad acaban con > 60 % de los D en una sola clave.
2. **Decisión del dueño del juego: ¿cuánta convergencia aceptamos en la cría dirigida?** Opciones: (a) κ 0,075 y aceptar que la mitad de los criaderos aislados converjan (en el juego hay mercado y capturas); (b) κ 0,05 y subir el umbral de deriva a +8 / +9 puntos (pegado al techo de +10, contra el espíritu del criterio); (c) mantener κ 0,10 y subir el umbral de monocultivo a ≈ 80 %. **Recomiendo (a)** y medir la homogeneización real en el simulador de economía.
3. **Decisión del dueño: la calidad se puede seleccionar.** Como Σvalores = calidad, criar por cualquier rasgo selecciona también calidad: E5 +1,86 puntos de media (de 89,99 a 91,86); E3b +1,49. No se **crea** calidad: la mutación hace la media de los padres y ningún gen supera 94,5 (0 violaciones). La premisa de §10.2 ("la selección por velocidad no selecciona calidad") es falsa. Recomiendo aceptarlo, porque premia criar sin romper el techo, y reescribir el criterio como "calidad máx. ≤ 94,5 y la media no supera la de los mejores salvajes". El freno real es el criterio de combate §10.3.
4. Todo lo demás de v0.2 se mantiene: pesos C, mutación 2 %, σ forma 0,25, afinidad 0,5, peso híbrido 2.

## Comparación con v0.1

| Métrica | v0.1 (informe, config recomendada) | v0.2 (semillas nuevas) | Comentario |
|---|---|---|---|
| Sorpresa E1 | 26,5 % | 25,9 % | Con las semillas de v0.1: 26,6 %. D-007 no cambia la sorpresa. |
| % crías mutadas | 7,8 % | 7,7 % | Teórico 7,76 % |
| Genedex: % repetidas al final (E2) | 64,3 % | 64,4 % | σ forma 0,25 ya aplicada en ambas |
| E4 primer gen Vapor (mediana / p90) | 18 / 58 | 17 / 57 | Sin cambio de reglas |
| E4 primera criatura Vapor (mediana) | ≈ 1500 (QA; el informe decía 1946) | 23 (p90 77) | Regla de familia: el gen híbrido pesa 2 (problema A) |
| D híbridos, E1 cerrada gen 300 | 59,9 % | 46,3 % | Afinidad 0,75 → 0,5 |
| D híbridos, E2 con capturas | 2,8 % | 2,5 % | Criaturas híbridas en E2: 8,8 % |
| Deriva bajo selección | +50,5 % (heterocigoto, %); homocigoto κ 0,10: +21,3 % | +4,95 puntos/gen (16,5 %) en gen 20 | Homocigoto, en puntos (S-05) |
| Cría por velocidad: máx. clave / H_D | 40,6 % / 2,81 | 71,7 % / 1,65 | Empeora por κ 0,10 |
| Cría por velocidad: Δ velocidad total | 89,2 % | 78,4 % | La suma cero frena algo |

## Gráficas clave

**E4: crías hasta la primera criatura Vapor**

| Medida | Mediana [IC 95 %] | p90 [IC 95 %] | Censurados |
|---|---:|---:|---:|
| Primer gen Vapor | 17 [17; 18] | 57 [56; 59] | 0 |
| Primera criatura Vapor | 23 [23; 23] | 77 [76; 79] | 0 |

**Deriva E3a homocigoto (puntos por gen D)**

| Generación | E3a homocigoto, κ 0,10 (v0.2) | E3a homocigoto, κ 0,075 | E3a homocigoto, κ 0,05 | control al azar (κ 0,10) |
|---:|---:|---:|---:|---:|
| 0 | +0,00 | +0,00 | +0,00 | +0,00 |
| 5 | +2,00 | +2,12 | +2,26 | -0,00 |
| 10 | +3,47 | +3,92 | +4,52 | -0,05 |
| 20 | +4,95 | +6,21 | +7,68 | -0,09 |
| 50 | +5,72 | +7,40 | +8,74 | -0,09 |
| 100 | +5,62 | +7,30 | +8,70 | +0,06 |

**Monocultivo bajo cría por velocidad (E5)**

| Generación | κ 0,10 (v0.2) | κ 0,075 | κ 0,05 |
|---:|---:|---:|---:|
| 0 | 8,0 % | 8,0 % | 8,0 % |
| 20 | 77,5 % | 80,3 % | 78,9 % |
| 50 | 75,3 % | 73,0 % | 63,5 % |
| 100 | 72,1 % | 62,0 % | 43,4 % |
| 200 | 71,4 % | 61,0 % | 42,6 % |
| 300 | 71,7 % | 59,5 % | 39,6 % |

**Calidad media de las criaturas**

| Generación | E5 κ 0,10 (v0.2) | E5 margen ±2,5 % | E1 cría al azar |
|---:|---:|---:|---:|
| 0 | 89,99 | 90,00 | 89,96 |
| 50 | 91,82 | 90,43 | 90,01 |
| 100 | 91,82 | 90,40 | 89,96 |
| 200 | 91,87 | 90,42 | 90,06 |
| 300 | 91,86 | 90,42 | 90,00 |

**Fracción de D híbridos**

| Generación | E1 cerrada, afinidad 0,5 (v0.2) | E1 cerrada, afinidad 0,75 | E2 con capturas (v0.2) |
|---:|---:|---:|---:|
| 0 | 0,0 % | 0,0 % | 0,0 % |
| 20 | 5,9 % | 6,0 % | 2,3 % |
| 50 | 12,8 % | 13,6 % | 2,9 % |
| 100 | 20,2 % | 23,1 % | 2,7 % |
| 200 | 39,0 % | 47,0 % | 2,9 % |
| 300 | 46,3 % | 58,5 % | 2,5 % |

## Hallazgos

1. **La revalidación con semillas nuevas confirma v0.2**. Sorpresa 25,9 % [24,9 %; 26,8 %] y Genedex 64,4 % quedan dentro con margen. Ningún criterio de v0.1 cambia de veredicto.
2. **La estimación del diseñador para E4 acierta de lleno**: 23 / 77 frente a 23 / 76 estimado. El primer gen Vapor sigue en 17 / 57 (teoría 17,6 / 57,3).
3. **Las híbridas siguen siendo absorbentes en población cerrada**, aunque menos: con afinidad 0,5, 46,3 % de D híbridos en gen 300 (0,75: 58,5 %; v0.1: 59,9 %). Con la regla de peso 2, el 90,4 % de las criaturas de E1 son de familia híbrida. Con capturas la afinidad casi no importa (2,6 % frente a 2,5 %).
4. **D-007 funciona y su respaldo apenas se usa**: 0 mutaciones caen en una clave de un padre; el 1,71 % necesita N1 o N2 en E1 y el 11,1 % en E5 (población homogénea, con más claves bloqueadas). N3 no se usó nunca.
5. **E3c (heterocigoto, informativo)**: +10,13 puntos/gen en gen 20, de los que +4,72 son deriva de valores y el resto selección de recesivos más rápidos. Es la misma descomposición que en v0.1, ahora medida dentro del propio escenario (QA S-05).
6. **E3b (selección fuerte, mutación activa)**: +25,11 puntos por gen D en 100 generaciones (82,4 %); la calidad sube +1,49. Los especialistas extremos siguen al alcance: el simulador de combate (§10.3) debe probar equipos especializados, no solo calidad máxima frente a mínima.

## Cambios por la revisión de QA (S-01…S-06)

- **S-01**: E4 busca la primera criatura en **todos** los ensayos (10.000, antes 100), con un flujo RNG propio por configuración. Mediana y p90 llevan IC 95 % por estadísticos de orden, y hay un contraste con el MLE geométrico con censura. Los censurados se muestran como "> 5000", nunca "∞".
- **S-02**: revalidación con semillas nuevas (`valida02-1…`). Si se pasa `--semilla genoma`, la CLI avisa.
- **S-03**: superado (D-007 en el núcleo). Se mide que haya 0 claves mutadas de padres y el uso de N1–N3.
- **S-04**: el umbral de mutaciones/1000 muestra "4000·p = X ± 10 %" con el p de cada configuración.
- **S-05**: la deriva se mide en puntos por gen D. E3c descompone deriva frente a cambio de tipo dentro del mismo escenario.
- **S-06**: el histograma de E4 lleva título en el eje Y ("% de ensayos").
- **S-07/S-08** (sugerencias): IC por configuración (conservador); "% repetidas" excluye las mutaciones que caen en claves del catálogo (documentado en Método).

## Anomalías y limitaciones

- **Núcleo v0.2: sin fallos encontrados.** 0 violaciones (incluida la comprobación de clave mutada frente a las de los padres), determinismo 100 % y N3 sin usar.
- **El criterio de monocultivo depende de la semilla**: con κ 0,10 la máx. clave va de 45,8 % a 90,8 %. Con 5 semillas no se puede decidir; por eso E5 usa 20.
- **Premisa falsa en §10.2**: la selección por velocidad sí selecciona calidad (ver Recomendación 3). El criterio informativo "calidad media no sube" suspende por diseño, no por un fallo.
- **Sorpresa 25,9 % frente a 26,5 % de v0.1**: es el efecto de las semillas. Con las mismas semillas de v0.1 da 26,6 % (`npm run sim -- --semilla genoma --barrido v02 --escenario E1 --generaciones 20`).
- **Limitaciones**: generaciones discretas y N fijo; sin economía ni mercado; la convergencia en E5 es la de un criadero aislado. El combate (§10.3) no se ha simulado.

## Método y reproducción

- Escenarios tal como los define §10.1 v0.2: E3a = 100 clones homocigotos `brote.*.1` (calidad 90, valores = ancla, mutación 0); E3c = clones de un salvaje (la antigua E3a); E5 = E1 con padres de la élite del 40 % más rápida, emparejados al azar dentro de la élite. Reemplazo generacional (N fijo); en E2, 10 % de capturas tras cada generación.
- Deriva: Δ = media por gen D de (velocidad − velocidad en gen 0), en puntos. Calidad de criatura = media de la calidad de sus 4 D. % de criaturas híbridas = criaturas cuya familia (§7, peso híbrido 2) es híbrida. "% repetidas" del Genedex excluye las mutaciones que caen en claves del catálogo.
- Flujos RNG por semilla: `|cria`, `|sim` y `|salvaje`. E4 usa `seed|E4|config|ensayo`. Las ejecuciones con idéntica configuración efectiva se calculan una vez.
- Comandos: `npm run sim -- --quick` (< 30 s) · `npm run sim` (completo, ≈ 5 min con 2 hilos) · `npm run sim -- --help`. Salida: `sim/out/<modo>/<barrido>/<escenario>__<config>.csv`, `resumen-criterios.csv`, `resumen.json`, `hashes.sha256`; informe `sim/out/informe-genetica-v0.2.html` (copiado en `docs/informes/`).
