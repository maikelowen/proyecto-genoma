## Informe de simulación — genética v0.2 (κ 0,075, revalidación con semillas nuevas)

Generado por `sim/genetics` desde el commit `b7422c5` (más los cambios locales que hubiera), con `config/genetica.v0.2.json` (sha256 `c6c88b183174…`, `deriva.kappa` = 0,075 leído del JSON). Modo completo. Semillas `valida03-1`…`valida03-5` (5 por escenario; E5 con 20). Con ellas **no se ha elegido nada**; las usadas para elegir fueron `genoma-*` y `valida02-*`. N = 500 y 300 generaciones en E1/E2/E5; N = 100 y 100 en E3; E4 con 10.000 ensayos.

## Resumen ejecutivo

1. **κ 0,075 aprueba con semillas nuevas: 25/25 criterios de §10.2**, aunque `mono_H_D` y `mono_maxfrec` son frágiles (el IC 95 % cruza el umbral).
2. **Monocultivo E5 (gen 300, 20 semillas)**: clave más común 59,9 % [54,5 %; 65,3 %] de los D en el peor locus (umbral ≤ 60 %): aprueba por la media, pero el intervalo cruza el umbral; cumplen 12/20 semillas. H_D 2,08 bits (OK; 14/20).
3. **Trayectoria del monocultivo**: la convergencia es temprana y no depende de κ: en la gen 50, con todos los κ simulados (0,1, 0,075 y 0,05), la clave más común ya supera el 60 % (71,2 %, 77,0 % y 62,5 %). κ solo decide cuánto se recupera después: en la gen 300 queda en 72,5 % (κ 0,1), 59,9 % (κ 0,075) y 42,0 % (κ 0,05); cuanto menor es κ, mayor es la recuperación.
4. **Resto**: sorpresa 25,9 %; primera criatura Vapor en mediana 24 y p90 76 (aprueba); con capturas, 2,6 % de D híbridos (aprueba); deriva E3a +6,19 / +7,24 puntos (aprueba); 0 violaciones de invariantes.
5. **Recomendación**: κ 0,075 aprueba, pero el monocultivo es frágil: lo doy por **validado con reservas**. Como la convergencia temprana no depende de κ, ajustar κ no arregla lo que ve el jugador; propongo que el Diseñador revise el criterio (trayectoria o gen 50) antes de seguir afinando κ (QA V-03).

## Criterios §10.2 (config por defecto, κ 0,075)

Valor = media de semillas con IC 95 % (t de Student). E4: cuantiles de todos los ensayos con IC 95 % de estadísticos de orden. Frágil = el IC cruza el umbral. Las filas informativas no tienen umbral en la spec y no cuentan en aprobados.

| Grupo | Criterio | Umbral | Valor [IC 95 %] | Semillas | Resultado |
|---|---|---|---:|---:|---|
| Sorpresa | E1 % crías con D nuevo (gen 1–20) | 15 %–30 % | 25,9 % [25,4 %; 26,5 %] | 5/5 | APROBADO |
| Diversidad | E1 gen 300: mín. claves distintas por locus | ≥ 12 | 143 [136; 149] | 5/5 | APROBADO |
| Diversidad | E1 gen 300: mín. H todos los slots (bits) | ≥ 2,5 | 6,11 [5,94; 6,27] | 5/5 | APROBADO |
| Diversidad | E1 gen 300: mín. H solo D (bits) | ≥ 2 | 5,95 [5,78; 6,12] | 5/5 | APROBADO |
| Diversidad | E1 gen 300: mín. H / H gen 0 | ≥ 50 % | 143,6 % [139,5 %; 147,7 %] | 5/5 | APROBADO |
| Diversidad | E1 gen 300: máx. frecuencia de una clave en D | ≤ 40 % | 7,4 % [6,5 %; 8,2 %] | 5/5 | APROBADO |
| Mutación | E1 mutaciones / 1000 crías | 4000·p = 80 ± 10 % | 80,1 [78,6; 81,6] | 5/5 | APROBADO |
| Mutación | E1 % crías con ≥1 mutación | 5 %–12 % | 7,8 % [7,6 %; 7,9 %] | 5/5 | APROBADO |
| Monocultivo dirigido | E5 gen 300: mín. claves distintas por locus | ≥ 10 | 26,8 [25,0; 28,6] | 20/20 | APROBADO |
| Monocultivo dirigido | E5 gen 300: mín. H solo D (bits) | ≥ 2 | 2,08 [1,88; 2,29] | 14/20 | APROBADO (frágil) |
| Monocultivo dirigido | E5 gen 300: máx. frecuencia de una clave en D | ≤ 60 % | 59,9 % [54,5 %; 65,3 %] | 12/20 | APROBADO (frágil) |
| Calidad (§15.6) | E5 Δ calidad media de las criaturas, gen 300 − gen 0 (puntos) | no debe subir (≤ 0) | +1,44 [+1,17; +1,70] | 0/20 | NO (informativo) |
| Genedex | E2 claves nuevas / 1000 crías (gen 1–10) | ≥ 40 | 75,1 [69,2; 81,1] | 5/5 | APROBADO |
| Genedex | E2 claves nuevas / 1000 crías (gen 291–300) | ≥ 5 | 29,2 [27,4; 31,0] | 5/5 | APROBADO |
| Genedex | E2 % mutaciones en clave ya registrada (gen 291–300) | 10 %–80 % | 63,9 % [61,8 %; 66,0 %] | 5/5 | APROBADO |
| Genedex | E2 híbridas distintas vistas | = 7 | 7 | 5/5 | APROBADO |
| Vigilancia de híbridas | E2 gen 300: % de D híbridos | ≤ 10 % | 2,6 % [2,0 %; 3,3 %] | 5/5 | APROBADO |
| Vigilancia de híbridas | E2 gen 300: % de criaturas de familia híbrida | 3 %–25 % | 9,6 % [7,3 %; 12,0 %] | 5/5 | APROBADO |
| Primer gen híbrido | E4 mediana crías hasta gen Vapor (10000 ensayos) | 10–40 | 18,0 [17,0; 18,0] |  | APROBADO |
| Primer gen híbrido | E4 p90 crías hasta gen Vapor | ≤ 100 | 59,0 [57,0; 60,0] |  | APROBADO |
| Primera criatura híbrida | E4 mediana crías hasta criatura Vapor (10000 ensayos) | ≤ 40 | 24,0 [23,0; 25,0] |  | APROBADO |
| Primera criatura híbrida | E4 p90 crías hasta criatura Vapor | ≤ 120 | 76,0 [74,0; 78,0] |  | APROBADO |
| Deriva | E3a homocigoto: Δ velocidad por gen D, gen 20 (puntos) | +1,5 a +7,5 | +6,19 [+6,02; +6,35] | 5/5 | APROBADO |
| Deriva | E3a homocigoto: Δ velocidad por gen D, gen 100 (puntos) | ≤ +8,5 | +7,24 [+7,09; +7,38] | 5/5 | APROBADO |
| Deriva | E3a control al azar: \|Δ\| gen 100 (puntos) | ≤ 1 | +0,19 [-0,00; +0,39] | 5/5 | APROBADO |
| Invariantes | Violaciones (todas las escenas; incluye clave mutada ∈ claves de los padres) | 0 | 0 |  | APROBADO |

**Determinismo** APROBADO: misma semilla ⇒ mismo hash sí y mismo CSV sí; semilla distinta ⇒ población distinta sí; pareado 2 % vs 3 %: 8874/8874 crías sin mutación idénticas.

## Monocultivo E5: evolución por generación y efecto de κ (QA V-03)

Clave más común en los D del peor locus, media de 20 semillas con IC 95 %, y nº de semillas que superan el 60 %. Los κ 0,05 y 0,1 son **referencias** (los valores vecinos del barrido de la spec), simuladas con las mismas semillas solo para ver cómo responde E5 a κ. Con ellas no se elige nada.

| κ | gen 20 | gen 50 | gen 100 | gen 300 |
|---|---:|---:|---:|---:|
| 0,1 | 74,2 % [68,1 %; 80,3 %] · 18/20 > 60 % | 71,2 % [65,2 %; 77,3 %] · 15/20 > 60 % | 68,8 % [63,1 %; 74,6 %] · 15/20 > 60 % | 72,5 % [66,0 %; 78,9 %] · 14/20 > 60 % |
| 0,075 (por defecto) | 79,9 % [76,4 %; 83,4 %] · 20/20 > 60 % | 77,0 % [73,4 %; 80,6 %] · 20/20 > 60 % | 64,6 % [59,6 %; 69,6 %] · 15/20 > 60 % | 59,9 % [54,5 %; 65,3 %] · 8/20 > 60 % |
| 0,05 | 80,2 % [75,4 %; 84,9 %] · 18/20 > 60 % | 62,5 % [56,6 %; 68,4 %] · 11/20 > 60 % | 49,5 % [43,8 %; 55,2 %] · 3/20 > 60 % | 42,0 % [37,1 %; 47,0 %] · 2/20 > 60 % |

- **La convergencia es temprana**: en la gen 50, con cualquier κ, la clave más común está por encima del 60 % (71,2 % (κ 0,1), 77,0 % (κ 0,075) y 62,5 % (κ 0,05)). Es lo que verá un jugador que críe por velocidad: el criterio, que solo mira la gen 300, no lo detecta.
- **κ solo afecta a la recuperación**: la diferencia entre κ pasa de 14,5 % en la gen 50 a 30,4 % en la gen 300 (72,5 % (κ 0,1), 59,9 % (κ 0,075) y 42,0 % (κ 0,05)). Cuanto más tira la deriva hacia el ancla, menos rinde especializar valores y más tarda en volver la diversidad de tipos.

## Puntos de §15 de la spec

| Punto | Resultado (medido) | Veredicto |
|---|---|---|
| 1. Primera criatura híbrida (E4) | mediana 24 [23; 25], p90 76 [74; 78], 0 censurados; MLE geométrico ⇒ mediana 23,0 | APROBADO |
| 2. Vigilancia de híbridas (E2) | D 2,6 % [2,0 %; 3,3 %]; criaturas 9,6 % [7,3 %; 12,0 %] | APROBADO |
| 3. Deriva E3a homocigoto | +6,19 [+6,02; +6,35] puntos en gen 20; +7,24 [+7,09; +7,38] en gen 100 | APROBADO |
| 4. D-007 y respaldos | 80,1 mutaciones/1000; 0 claves de un padre; E1: N1 1,71 %, N2 0,02 %, N3 0; E5: N3 0 | REVISAR |
| 5. Sorpresa, diversidad, Genedex | sorpresa 25,9 % [25,4 %; 26,5 %]; Genedex repetidas 63,9 % | APROBADO |
| 6. Monocultivo E5 y calidad | máx. clave 59,9 % [54,5 %; 65,3 %]; Δ calidad media +1,44 [+1,17; +1,70] puntos | APROBADO (frágil); la calidad sube |

## Comparación con v0.1

Las cifras de v0.1 están citadas del informe v0.1 (docs/informes/genetica-v0.1.md, commit 42d37a5; mediana de criatura corregida por QA S-01). Las de v0.2 salen de esta ejecución.

| Métrica | v0.1 | v0.2 (κ 0,075) |
|---|---|---|
| Sorpresa E1 | 26,5 % | 25,9 % |
| % crías mutadas | 7,8 % | 7,8 % |
| Genedex: % repetidas al final (E2) | 64,3 % | 63,9 % |
| E4 primer gen Vapor (mediana / p90) | 18 / 58 | 18 / 59 |
| E4 primera criatura Vapor (mediana) | ≈ 1500 | 24 |
| D híbridos, E1 cerrada gen 300 | 59,9 % | 47,2 % |
| D híbridos, E2 gen 300 | 2,8 % | 2,6 % |
| Cría por velocidad: máx. clave / H_D (gen 300) | 40,6 % / 2,81 | 59,9 % / 2,08 |

## Gráficas

## Hallazgos y decisiones pendientes

1. **Para el Diseñador (criterio de monocultivo)**: la convergencia de E5 ocurre antes de la gen 50 con cualquier κ, y el criterio solo mira la gen 300. Opciones: (a) dejarlo así (mide la diversidad a largo plazo); (b) evaluarlo también en la gen 50 o sobre el máximo de la trayectoria, sabiendo que **ningún κ simulado lo aprobaría** (71,2 % con κ 0,1, 77,0 % con κ 0,075 y 62,5 % con κ 0,05), así que haría falta otra palanca (p. ej. límite de crías por individuo de élite). Recomiendo (a) y medir la homogeneización real en el simulador de economía.
2. **Calidad seleccionable (sigue abierto en §10.2)**: en E5 la calidad media sube +1,44 [+1,17; +1,70] puntos, porque Σvalores = calidad. No se crea calidad nueva (0 violaciones, ningún gen pasa de 94,5). La premisa "la selección por velocidad no selecciona calidad" no se cumple: hay que reescribir el criterio o aceptarlo, y el freno es el combate (§10.3).
3. **Híbridas en población cerrada**: 47,2 % de D híbridos en la gen 300 de E1 (con capturas, 2,6 %). Es informativo y no tiene umbral.
4. **Núcleo**: sin fallos encontrados; N3 usado 0.05 veces.

## Cambios por la revisión QA v0.2

- **V-01**: revalidación con un prefijo de semillas nuevo (`valida03-*`), 20 semillas en E5. La CLI avisa si se usa un prefijo con el que ya se eligió algo (genoma, valida02).
- **V-02/V-06**: el informe se regenera entero desde el código: κ y las etiquetas salen del JSON, y la cabecera indica commit y huella de la config. Ya no se plantean preguntas que el director ha resuelto.
- **V-03**: tabla y curva de la trayectoria del monocultivo E5 en las generaciones 20/50/100/300 con κ de referencia.
- **V-04**: el resumen y los hallazgos son plantillas condicionales sobre los resultados. Si los datos cambian, cambian las frases.

## Método y reproducción

- Escenarios de §10.1 v0.2. Reemplazo generacional con N fijo. Flujos RNG por semilla: `|cria`, `|sim` y `|salvaje`; E4 usa `seed|E4|config|ensayo`.
- Comandos: `npm run sim` (completo, 5,6 min en esta ejecución) · `npm run sim -- --quick` · `npm run sim -- --help`. Salida en `sim/out/completo/`; informe en `sim/out/informe-genetica-v0.2.html`, copiado en `docs/informes/`.
