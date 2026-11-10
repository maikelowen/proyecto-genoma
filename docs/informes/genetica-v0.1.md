## Informe de simulación — genética v0.1

Proyecto Genoma · Analista de balance · 2026-11-10 · modo completo: 5 semillas por configuración, E1/E2 con N = 500 y 300 generaciones, E3 con N = 100 y 100 generaciones, E4 con 10000 ensayos. 34,6 millones de crías simuladas. Fuente de verdad de los números: CSV en `sim/out/` (este informe se genera a partir de los mismos datos).

## Resumen ejecutivo

1. **Sorpresa**: con los pesos del documento (A) el 66,9 % de las crías muestra en algún locus un rasgo que ningún padre expresaba (objetivo 15–30 %): es casi una lotería. B da 37,0 % y C 26,5 %; **solo C entra en el objetivo**.
2. **No se descontrola**: 0 violaciones de invariantes; mutación al 2 % ⇒ 7,8 % de crías mutadas (objetivo 5–12 %); primera híbrida Vapor en mediana 18 crías y p90 58 (teórico ≈ 17 / 57); determinismo 100 %.
3. **Dos suspensos con causa conocida**: el Genedex se repite demasiado al final (80,1 % de mutaciones en clave ya vista, máx. 80 %) y la deriva E3a sube la velocidad +50,5 % en 20 gen (máx. 30 %), pero solo +29,8 % es deriva de valores: el resto es selección de genes recesivos más rápidos.
4. **Riesgo no cubierto por los criterios**: las híbridas son absorbentes; en población cerrada son el 59,9 % de los D en la gen 300 (con capturas, 2,8 %), y la cría selectiva por velocidad sube la velocidad un 89,2 % y concentra un 40,6 % de los D en una sola clave.
5. **Recomendación v0.2**: pesos_D C (0,47/0,025/0,005), mutación 2 % (igual), σ forma 0,15 → 0,25, κ deriva 0,05 → 0,10. Validada en conjunto: 16/18 criterios de la spec aprobados; der_20 y der_final no aprueban (deriva E3a tal como está definida; propongo redefinirla, ver decisiones).

## Recomendación de parámetros para v0.2

| Parámetro | v0.1 | v0.2 | Dato que lo justifica |
|---|---|---|---|
| herencia.pesos_D | A 0,375/0,094/0,031 | **C 0,47/0,025/0,005** | Sorpresa E1 gen 1–20 (mutación 2 %): A 66,9 %, B 37,0 %, C 26,5 %; objetivo 15–30 %. Con C, 19,9 % viene de recesivos y el resto de mutación. |
| mutacion.prob_por_locus | 0,02 | 0,02 (igual) | 1 %: 3,9 % de crías mutadas (< 5 %), Genedex gen 1–10 37,8/1000 (< 40) y p90 E4 114 (> 100). 3 %: 11,5 % (techo 12 %) y sorpresa 29,7 % (techo 30 %), sin margen. |
| mutacion.sigma_forma | 0,15 | **0,25** | % de mutaciones en clave ya registrada (E2, gen 291–300): 0,10 → 87,1 %, 0,15 → 80,1 %, 0,25 → 64,3 % (rango 10–80 %). Claves nuevas al final: 28,6/1000 crías. |
| deriva.kappa | 0,05 | **0,10** | Deriva pura (E3a homocigoto) Δ velocidad gen 20 / gen 100: κ 0,05 → +29,8 % / +30,6 % (pegado al techo de 30 %); κ 0,10 → +21,3 % / +23,1 % (centrado). Control al azar \|Δ\| ≤ 1,2 %. |
| deriva.sigma | 1,0 | 1,0 (igual) | Con κ 0,10: σ 0,5 → +11,2 %, σ 1,5 → +26,2 % en gen 20; 1,0 queda en medio de la banda. |
| herencia.pesos_R | R0 0,20/0,17/0,13 | R0 (igual) | Sorpresa idéntica (R0 26,5 %, uniforme 26,5 %, =pesos_D 26,7 %); todas aprueban diversidad. No hay motivo con datos para cambiar. |
| mutacion.prob_hibrida_nueva | 0,5 | 0,5 (igual) | E4 mediana / p90: 0,25 → 35 / 116 (p90 > 100); 0,5 → 18 / 58; 1,0 → 9 / 29 (mediana < 10). |

### Validación de la combinación recomendada (todas las escenas, mismas semillas)

| Grupo | Criterio | Umbral | Valor [IC 95 %] | Semillas | Resultado |
|---|---|---|---:|---:|---|
| Sorpresa | E1 % crías con D nuevo (gen 1–20) | 15 %–30 % | 26,5 % [26,0 %; 27,0 %] | 5/5 | APROBADO |
| Diversidad | E1 gen 300: mín. claves distintas por locus | ≥ 12 | 139 [130; 149] | 5/5 | APROBADO |
| Diversidad | E1 gen 300: mín. H todos los slots (bits) | ≥ 2.5 | 6,07 [5,93; 6,22] | 5/5 | APROBADO |
| Diversidad | E1 gen 300: mín. H solo D (bits) | ≥ 2 | 5,98 [5,83; 6,13] | 5/5 | APROBADO |
| Diversidad | E1 gen 300: mín. H / H gen 0 | ≥ 50 % | 144,1 % [140,2 %; 147,9 %] | 5/5 | APROBADO |
| Diversidad | E1 gen 300: máx. frecuencia de una clave en D | ≤ 40 % | 9,3 % [6,8 %; 11,9 %] | 5/5 | APROBADO |
| Mutación | E1 mutaciones / 1000 crías | 80 ± 10 % | 80,5 [80,0; 80,9] | 5/5 | APROBADO |
| Mutación | E1 % crías con ≥1 mutación | 5 %–12 % | 7,8 % [7,8 %; 7,8 %] | 5/5 | APROBADO |
| Genedex | E2 claves nuevas / 1000 crías (gen 1–10) | ≥ 40 | 77,8 [74,8; 80,7] | 5/5 | APROBADO |
| Genedex | E2 claves nuevas / 1000 crías (gen 291–300) | ≥ 5 | 28,6 [26,7; 30,6] | 5/5 | APROBADO |
| Genedex | E2 % mutaciones en clave ya registrada (gen 291–300) | 10 %–80 % | 64,3 % [62,2 %; 66,5 %] | 5/5 | APROBADO |
| Genedex | E2 híbridas distintas vistas | = 7 | 7 | 5/5 | APROBADO |
| Primera híbrida | E4 mediana crías hasta gen Vapor (10000 ensayos) | 10–40 | 18,0 [17,2; 19,2] |  | APROBADO |
| Primera híbrida | E4 p90 crías hasta gen Vapor | ≤ 100 | 58,0 |  | APROBADO |
| Deriva | E3a Δ velocidad total gen 20 | +5 %…+30 % | 41,6 % [21,2 %; 61,9 %] | 2/5 | SUSPENSO (frágil) |
| Deriva | E3a Δ velocidad total gen 100 | ≤ +40 % | 45,1 % [24,0 %; 66,3 %] | 3/5 | SUSPENSO (frágil) |
| Deriva | E3a control \|Δ\| gen 100 | ≤ 5 % | 2,2 % [0,8 %; 3,6 %] | 5/5 | APROBADO |
| Deriva (diagnóstico) | E3a homocigoto Δ velocidad gen 20 (solo deriva de valores) | +5 %…+30 % | 21,3 % [17,5 %; 25,2 %] | 5/5 | APROBADO |
| Deriva (diagnóstico) | E3a homocigoto Δ velocidad gen 100 | ≤ +40 % | 23,1 % [19,2 %; 27,0 %] | 5/5 | APROBADO |
| Invariantes | Violaciones (todas las escenas) | 0 | 0 |  | APROBADO |

### Decisiones que necesita el dueño del juego

1. **Frecuencia de sorpresa (pregunta abierta 1 de la spec)**: los datos confirman la predicción. A = 66,9 %, B = 37,0 %, C = 26,5 %. Opciones: A (lotería), B (sorpresa frecuente, fuera del objetivo), C (controlable). **Recomiendo C.**
2. **Redefinir el criterio de deriva E3a**: tal como está, mide deriva + selección de genes recesivos; con cualquier κ/σ del barrido Δ gen 20 queda entre +32,4 % y +54,6 % (máx. 30 %). Opciones: (a) medir con clones homocigotos (D = R1 = R2), que aísla la deriva; (b) mantener E3a y subir el umbral a ≈ 50 %, aceptando que criar por un rasgo da ~+45 % en 20 generaciones; (c) bajar la ventaja reduciendo el techo `desviacion_max`. **Recomiendo (a)** con κ 0,10.
3. **Híbridas absorbentes**: sin capturas, la fracción de D híbridos crece sin freno (gen 300: 59,9 %; con la estrategia buscadora, 81,9 %). En el juego real habrá capturas (E2: 2,8 %), pero para el mercado conviene decidir si una híbrida debe poder "perderse": opciones (a) aceptar; (b) bajar `prob_hibrida_afinidad` de 0,75 a 0,5 (no simulado aún); (c) añadir un criterio de techo de híbridas en E2. **Recomiendo (a) + (c)** y revisarlo cuando haya economía.

## Criterios §10.2 por configuración (barrido principal)

Valor = media de 5 semillas (E4: ensayos agregados). OK = aprobado, NO = suspendido; * = frágil (el IC 95 % entre semillas cruza el umbral). Configuración = pesos_D (A documento, B, C) y probabilidad de mutación por locus (m1/m2/m3 = 1/2/3 %). La deriva E3a no depende de la mutación (se fuerza a 0). Los criterios "diagnóstico" no son de la spec.

| Criterio (umbral) | A-m1 | A-m2 | A-m3 | B-m1 | B-m2 | B-m3 | C-m1 | C-m2 | C-m3 | v02 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| E1 % crías con D nuevo (gen 1–20) (15 %–30 %) | 65,0 % NO | 66,9 % NO | 68,7 % NO | 33,9 % NO | 37,0 % NO | 39,8 % NO | 23,0 % OK | 26,5 % OK | 29,7 % OK* | 26,5 % OK |
| E1 gen 300: mín. claves distintas por locus (≥ 12) | 87,8 OK | 138 OK | 174 OK | 84,6 OK | 126 OK | 161 OK | 79,6 OK | 120 OK | 151 OK | 139 OK |
| E1 gen 300: mín. H todos los slots (bits) (≥ 2.5) | 5,24 OK | 6,01 OK | 6,52 OK | 5,24 OK | 5,97 OK | 6,43 OK | 5,17 OK | 5,90 OK | 6,31 OK | 6,07 OK |
| E1 gen 300: mín. H solo D (bits) (≥ 2) | 5,22 OK | 5,91 OK | 6,38 OK | 5,18 OK | 5,85 OK | 6,27 OK | 5,08 OK | 5,80 OK | 6,21 OK | 5,98 OK |
| E1 gen 300: mín. H / H gen 0 (≥ 50 %) | 125,8 % OK | 142,5 % OK | 153,9 % OK | 124,8 % OK | 141,0 % OK | 151,3 % OK | 122,4 % OK | 139,7 % OK | 149,8 % OK | 144,1 % OK |
| E1 gen 300: máx. frecuencia de una clave en D (≤ 40 %) | 13,1 % OK | 7,8 % OK | 6,5 % OK | 12,4 % OK | 8,8 % OK | 6,4 % OK | 13,8 % OK | 9,9 % OK | 7,3 % OK | 9,3 % OK |
| E1 mutaciones / 1000 crías (40 ± 10 %) | 40,1 OK | 80,5 OK | 121 OK | 40,1 OK | 80,5 OK | 121 OK | 40,1 OK | 80,5 OK | 121 OK | 80,5 OK |
| E1 % crías con ≥1 mutación (5 %–12 %) | 3,9 % NO | 7,8 % OK | 11,5 % OK | 3,9 % NO | 7,8 % OK | 11,5 % OK | 3,9 % NO | 7,8 % OK | 11,5 % OK | 7,8 % OK |
| E2 claves nuevas / 1000 crías (gen 1–10) (≥ 40) | 37,8 NO* | 74,7 OK | 108 OK | 37,6 NO* | 74,5 OK | 107 OK | 37,8 NO* | 74,8 OK | 107 OK | 77,8 OK |
| E2 claves nuevas / 1000 crías (gen 291–300) (≥ 5) | 12,6 OK | 14,6 OK | 16,5 OK | 12,4 OK | 14,0 OK | 16,6 OK | 12,0 OK | 15,9 OK | 17,6 OK | 28,6 OK |
| E2 % mutaciones en clave ya registrada (gen 291–300) (10 %–80 %) | 68,5 % OK | 81,6 % NO* | 86,1 % NO | 69,0 % OK | 82,4 % NO* | 86,0 % NO | 70,0 % OK | 80,1 % NO* | 85,1 % NO | 64,3 % OK |
| E2 híbridas distintas vistas (= 7) | 7 OK | 7 OK | 7 OK | 7 OK | 7 OK | 7 OK | 7 OK | 7 OK | 7 OK | 7 OK |
| E4 mediana crías hasta gen Vapor (10000 ensayos) (10–40) | 35,0 OK | 18,0 OK | 12,0 OK | 35,0 OK | 18,0 OK | 12,0 OK | 35,0 OK | 18,0 OK | 12,0 OK | 18,0 OK |
| E4 p90 crías hasta gen Vapor (≤ 100) | 114 NO | 58,0 OK | 38,0 OK | 114 NO | 58,0 OK | 38,0 OK | 114 NO | 58,0 OK | 38,0 OK | 58,0 OK |
| E3a Δ velocidad total gen 20 (+5 %…+30 %) | 46,7 % NO* | 46,7 % NO* | 46,7 % NO* | 50,1 % NO* | 50,1 % NO* | 50,1 % NO* | 50,5 % NO* | 50,5 % NO* | 50,5 % NO* | 41,6 % NO* |
| E3a Δ velocidad total gen 100 (≤ +40 %) | 50,9 % NO* | 50,9 % NO* | 50,9 % NO* | 52,4 % NO* | 52,4 % NO* | 52,4 % NO* | 52,9 % NO* | 52,9 % NO* | 52,9 % NO* | 45,1 % NO* |
| E3a control \|Δ\| gen 100 (≤ 5 %) | 3,6 % OK* | 3,6 % OK* | 3,6 % OK* | 3,8 % OK* | 3,8 % OK* | 3,8 % OK* | 2,2 % OK | 2,2 % OK | 2,2 % OK | 2,2 % OK |
| E3a homocigoto Δ velocidad gen 20 (solo deriva de valores) (+5 %…+30 %) | 26,5 % OK* | 26,5 % OK* | 26,5 % OK* | 29,4 % OK* | 29,4 % OK* | 29,4 % OK* | 29,8 % OK* | 29,8 % OK* | 29,8 % OK* | 21,3 % OK |
| E3a homocigoto Δ velocidad gen 100 (≤ +40 %) | 28,8 % OK | 28,8 % OK | 28,8 % OK | 30,1 % OK | 30,1 % OK | 30,1 % OK | 30,6 % OK | 30,6 % OK | 30,6 % OK | 23,1 % OK |
| Violaciones (todas las escenas) (0) | 0 OK | 0 OK | 0 OK | 0 OK | 0 OK | 0 OK | 0 OK | 0 OK | 0 OK | 0 OK |
| **Aprobados (sin diagnóstico)** | 12/18 | 14/18 | 14/18 | 12/18 | 14/18 | 14/18 | 13/18 | 15/18 | 15/18 | 16/18 |

Determinismo (global): misma semilla ⇒ mismo hash de población sí y mismo CSV sí; semilla distinta ⇒ población distinta sí; barrido pareado 2 % vs 3 %: 8866/8866 crías sin mutación idénticas (100,0 %). **APROBADO**.

## Gráficas clave

**Sorpresa por configuración (E1, media gen 1–20, IC 95 %)**

| Config | Sorpresa | IC 95 % | Solo recesivos (sin mutación) |
|---|---:|---:|---:|
| A-m1 | 65,0 % | 64,6 %–65,4 % | 63,3 % |
| A-m2 | 66,9 % | 66,6 %–67,2 % | 63,2 % |
| A-m3 | 68,7 % | 68,5 %–68,9 % | 63,2 % |
| B-m1 | 33,9 % | 33,4 %–34,5 % | 31,0 % |
| B-m2 | 37,0 % | 36,7 %–37,4 % | 31,1 % |
| B-m3 | 39,8 % | 39,5 %–40,1 % | 31,1 % |
| C-m1 | 23,0 % | 22,2 %–23,8 % | 19,8 % |
| C-m2 | 26,5 % | 26,0 %–27,0 % | 19,9 % |
| C-m3 | 29,7 % | 29,1 %–30,3 % | 19,9 % |

**Sorpresa por generación (E1)**

| Generación | A-m2 | B-m2 | C-m2 |
|---:|---:|---:|---:|
| 1 | 63,3 % | 35,0 % | 24,0 % |
| 5 | 67,5 % | 37,8 % | 26,5 % |
| 10 | 66,5 % | 36,5 % | 26,5 % |
| 20 | 68,7 % | 37,4 % | 26,0 % |
| 50 | 70,5 % | 39,7 % | 28,8 % |
| 100 | 67,4 % | 39,0 % | 27,2 % |
| 200 | 68,9 % | 38,3 % | 27,3 % |
| 300 | 69,6 % | 39,4 % | 28,6 % |

**E4: crías hasta el primer gen Vapor (C-m2)**

| Mutación | Mediana | p90 | Mediana 1.ª criatura Vapor | Censurados |
|---|---:|---:|---:|---|
| C-m1 | 35 | 114 | ∞ | 59/100 |
| C-m2 | 18 | 58 | 1946 | 16/100 |
| C-m3 | 12 | 38 | 777 | 1/100 |

**Tamaño del Genedex (E2) según σ forma**

| σ forma | Claves nuevas/1000 (gen 1–10) | Claves nuevas/1000 (gen 291–300) | % repetidas (gen 291–300) | Genedex gen 300 |
|---|---:|---:|---:|---:|
| 0.1 | 70,6 | 10,2 | 87,1 % | 3290 |
| 0.15 | 74,8 | 15,9 | 80,1 % | 4630 |
| 0.25 | 77,8 | 28,6 | 64,3 % | 6893 |

**Fracción de genes D híbridos en la población**

| Generación | E1 cerrada, al azar (C-m2) | E2 con capturas (C-m2) | E1 buscador de híbridas |
|---:|---:|---:|---:|
| 1 | 0,4 % | 0,4 % | 1,0 % |
| 5 | 1,9 % | 1,3 % | 4,3 % |
| 10 | 3,5 % | 2,1 % | 7,9 % |
| 20 | 6,6 % | 2,9 % | 13,7 % |
| 50 | 16,4 % | 2,5 % | 28,3 % |
| 100 | 26,1 % | 3,0 % | 47,3 % |
| 200 | 45,0 % | 2,8 % | 70,9 % |
| 300 | 59,9 % | 2,8 % | 81,9 % |

**Deriva bajo selección por velocidad (E3a)**

| Generación | E3a spec (κ 0,05) | E3a homocigoto (κ 0,05) | E3a homocigoto (κ 0,10, v0.2) | control al azar |
|---:|---:|---:|---:|---:|
| 0 | 0,0 % | 0,0 % | 0,0 % | 0,0 % |
| 5 | 23,3 % | 13,7 % | 11,3 % | 0,9 % |
| 10 | 38,0 % | 22,9 % | 16,8 % | 0,3 % |
| 20 | 50,5 % | 29,8 % | 21,3 % | 0,8 % |
| 50 | 52,8 % | 30,8 % | 23,1 % | 0,9 % |
| 100 | 52,9 % | 30,6 % | 23,1 % | 1,2 % |

## Barridos secundarios

### Estrategias de cría (E1, 300 generaciones)

| Config | Estrategia | Sorpresa gen 1–20 | Mín. claves/locus gen 300 | Mín. H_D (bits) | Máx. clave en D (≤ 40 %) | D híbridos | Δ velocidad total | Genedex |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| A-m2 | azar | 66,9 % | 138,4 | 5,91 | 7,8 % OK | 44,7 % | +1,2 % | 5189 |
| A-m2 | velocidad | 46,8 % | 24,2 | 2,95 | 42,5 % NO | 0,5 % | +86,7 % | 667 |
| A-m2 | purista | 63,3 % | 127,2 | 5,89 | 7,4 % OK | 18,4 % | -1,3 % | 4604 |
| A-m2 | hibridas | 66,2 % | 136,8 | 6,10 | 7,7 % OK | 74,1 % | -2,8 % | 5005 |
| C-m2 | azar | 26,5 % | 120,0 | 5,80 | 9,9 % OK | 59,9 % | -0,2 % | 4930 |
| C-m2 | velocidad | 19,1 % | 24,2 | 2,81 | 40,6 % NO | 0,0 % | +89,2 % | 671 |
| C-m2 | purista | 23,9 % | 120,6 | 5,79 | 8,0 % OK | 18,5 % | -2,1 % | 4313 |
| C-m2 | hibridas | 26,1 % | 126,2 | 5,81 | 8,7 % OK | 81,9 % | -0,3 % | 4954 |

Velocidad: élite del 40 % más rápido, apareada al azar dentro de la élite; el límite de 5 crías obliga a usar 200 padres distintos por generación. Purista: solo cruza criaturas de la misma familia. Buscador de híbridas: elige pareja (entre 50 candidatos) que maximice loci con combinación híbrida. Ninguna estrategia necesitó parejas de relleno.

### pesos_R (base C-m2, E1)

| Config | Sorpresa | Mín. claves/locus | Mín. H_D | Máx. clave en D | D híbridos gen final |
|---|---:|---:|---:|---:|---:|
| C-m2-R0 | 26,5 % | 120,0 | 5,80 | 9,9 % | 59,9 % |
| C-m2-Runi | 26,5 % | 129,6 | 5,90 | 8,8 % | 48,1 % |
| C-m2-RigD | 26,7 % | 102,2 | 5,66 | 8,5 % | 59,7 % |

### Deriva κ × σ (base C-m2, mutación 0)

| κ / σ | E3a Δ gen 20 | E3a Δ gen 100 | Homocigoto Δ gen 20 | Homocigoto Δ gen 100 | Control \|Δ\| |
|---|---:|---:|---:|---:|---:|
| k0.02-s0.5 | 47,2 % | 55,3 % | 28,5 % | 33,0 % | 1,9 % |
| k0.02-s1 | 54,5 % | 55,1 % | 32,8 % | 32,8 % | 2,4 % |
| k0.02-s1.5 | 54,6 % | 54,7 % | 32,6 % | 32,5 % | 1,9 % |
| k0.05-s0.5 | 39,6 % | 48,5 % | 19,9 % | 26,6 % | 1,0 % |
| k0.05-s1 | 50,5 % | 52,9 % | 29,8 % | 30,6 % | 1,2 % |
| k0.05-s1.5 | 52,7 % | 53,3 % | 31,0 % | 30,9 % | 1,3 % |
| k0.1-s0.5 | 32,4 % | 34,4 % | 11,2 % | 12,0 % | 0,8 % |
| k0.1-s1 | 41,6 % | 45,1 % | 21,3 % | 23,1 % | 0,8 % |
| k0.1-s1.5 | 47,7 % | 49,0 % | 26,2 % | 26,7 % | 0,9 % |

Criterio: Δ gen 20 entre +5 % y +30 %; Δ gen 100 ≤ +40 %; control |Δ| ≤ 5 %. E3a tal como está definida aprueban: ninguna combinación. En homocigoto aprueban: k0.02-s0.5, k0.05-s0.5, k0.05-s1, k0.1-s0.5, k0.1-s1, k0.1-s1.5.

### Probabilidad de híbrida nueva (base C-m2)

| Config | E4 mediana | E4 p90 | 1.ª criatura Vapor (mediana) | D híbridos E2 | Híbridas vistas E2 |
|---|---:|---:|---:|---:|---:|
| h0.25 | 35 | 116 | ∞ (67/100 cens.) | 1,5 % | 7 |
| h0.5 | 18 | 58 | 1946 (16/100 cens.) | 2,8 % | 7 |
| h1 | 9 | 29 | 477 (0/100 cens.) | 5,4 % | 7 |

## Hallazgos

1. **La predicción analítica de la spec se cumple**: sorpresa A 66,9 % (predicho 60–65 %), B 37,0 % (≈ 33 %), C 26,5 % (≈ 22 %). La diferencia en B y C es la mutación: sin contarla, C da 19,9 %.
2. **Por locus la sorpresa es pareja** (C-m2: cabeza 7,6 %, cuerpo 7,4 %, extremidades 7,2 %, cola 7,2 %), y estable en el tiempo (gen 291–300: 27,2 %).
3. **La diversidad no colapsa: crece**. En E1 (C-m2) la mínima nº de claves por locus en la gen 300 es 120,0 (umbral 12) y la entropía es 139,7 % de la inicial. El criterio "H ≥ 50 % de gen 0" se cumple con mucha holgura; el riesgo real es el contrario (inflación), que ningún criterio mide.
4. **Mutación conforme a la teoría**: 80,5 mutaciones/1000 crías con p = 2 % (esperado 80) y 7,8 % de crías con alguna (teórico 7,8 %). Un 1,3 % de las mutaciones cae en una clave del catálogo base (no entra en Genedex).
5. **Pregunta abierta del núcleo (nota 9)**: solo el 0,72 % de las mutaciones produce una clave igual a un R1/R2 de algún padre (rango en el barrido: 0,46 %–0,72 %). Es irrelevante para el balance: **recomiendo no añadir la exclusión** (complica §4.4 sin efecto medible).
6. **Híbridas absorbentes**: en E1 al azar la fracción de D híbridos llega al 59,9 % en la gen 300 (A-m2: 44,7 %; C-m3: 69,0 %). Causa: híbrida × componente vuelve a híbrida el 75 % y nunca se crea una base desde dos híbridas iguales. Con 10 % de capturas por generación se estabiliza en 2,8 %.
7. **La primera criatura híbrida es mucho más difícil que el primer gen híbrido**: con padres puros (F1) hacen falta ≥ 2 loci Vapor; mediana 1946 crías (16/100 ensayos sin conseguirla en 5000). El camino del jugador es criar las crías con gen Vapor entre sí o en retrocruce, algo que el diseño ya favorece; conviene que la UI lo enseñe.
8. **Criar por velocidad es muy rentable y concentra genes**: con la élite del 40 % durante 300 generaciones la velocidad total sube 89,2 % (el ancla se redistribuye por mutación hacia velocidad; Σancla = 90 lo paga en potencia/resistencia) y la clave más frecuente ocupa el 40,6 % de los D (umbral 40 %). En E3b (selección fuerte, mutación activa) Δ velocidad en 100 generaciones = +92,6 %. Los especialistas extremos son alcanzables: el spec de combate debe contarlo.
9. **Distribución de familias** (criaturas, C-m2, gen 300). E1: llama 3 %, marea 11 %, brote 2 %, roca 6 %, voltio 10 %, sombra 5 %, vapor 2 %, magma 10 %, tormenta 11 %, plasma 10 %, espora 6 %, abismo 19 %, liquen 5 %.

## Anomalías, fallos y limitaciones

- **Núcleo: sin fallos encontrados.** 0 violaciones de invariantes en todas las escenas; mismo hash con la misma semilla; 8866/8866 crías idénticas en el pareado 2 % vs 3 %; breedingBlocker respetado (las estrategias nunca necesitaron parejas de relleno).
- **Criterio E3a mal planteado** (no es un fallo del núcleo): los clones de E3a son heterocigotos, así que la selección elige también genes recesivos con más ancla de velocidad. El diagnóstico homocigoto (`E3a_homo`, no está en la spec) lo separa.
- **Criterio de Genedex sensible al tamaño**: el % de repetidas al final depende de N y del nº de generaciones; con miles de jugadores se saturará antes. Revisarlo cuando haya simulador de economía.
- **Criterios que no detectan inflación**: diversidad y Genedex solo miden colapso; no hay techo para la fracción de híbridas ni para la velocidad alcanzable por selección.
- **Mutación al 1 %**: suspende tasa (5–12 %), Genedex gen 1–10 (≥ 40) y p90 de E4 por construcción; los umbrales de la spec están pensados para 2 %.
- **Limitaciones del modelo**: generaciones discretas (las crías reemplazan a todos los padres, N fijo); 5 semillas por configuración (IC 95 % con t de Student); la búsqueda de la primera criatura Vapor usa 20 ensayos por semilla con tope 5000 (mediana con censura por la derecha); sin economía ni jugadores.

## Método

- Escenarios de la spec §10.1 sin cambios: E1 cerrada (barajar, parejas consecutivas, 2 crías/pareja, las crías sustituyen a la generación anterior); E2 = E1 + 10 % de la población sustituida al azar por salvajes nuevos tras cada generación; E3a 100 clones, mutación 0, 50 parejas × 5 crías, sobreviven las 100 de mayor velocidad total (control: 100 al azar); E3b igual con población salvaje y mutación activa; E4 llama pura × marea pura, pareja nueva cada 5 crías.
- Sorpresa: % de crías con algún locus cuyo D tiene una clave distinta de los D de ambos padres (incluye mutaciones). Diversidad: claves distintas y entropía de Shannon por locus (todos los slots y solo D); se informa el peor locus. Genedex: claves nuevas por 1000 crías y % de mutaciones (fuera del catálogo) que caen en una clave ya registrada.
- Azar: tres flujos por semilla (`|cria` solo para breed, `|sim` para barajados y selección, `|salvaje` para salvajes), así cambiar la mutación no desalinea la estrategia y los barridos son pareados. Ejecuciones con idéntica configuración efectiva se calculan una vez y se reutilizan.
- Agregación: media entre semillas e IC 95 % (t de Student). Un criterio se aprueba si la media cumple el umbral; se marca frágil si el IC lo cruza.

## Cómo reproducirlo

- `npm run sim -- --quick` (< 30 s, N = 200, 40 gen, 2 semillas) · `npm run sim` (completo, ≈ 7 min con 2 hilos) · `npm run sim -- --help` para filtros (`--barrido`, `--config`, `--escenario`, `--estrategia`, `--semillas`, `--semilla`).
- Salida: `sim/out/<modo>/<barrido>/<escenario>__<config>.csv` (una fila por generación y semilla; E4 una fila por ensayo), `resumen-criterios.csv`, `resumen.json`, `hashes.sha256`. El informe HTML completo es `sim/out/informe-genetica-v0.1.html` y este Markdown `docs/informes/genetica-v0.1.md`.
- Esta ejecución: genoma-1, genoma-2, genoma-3, genoma-4, genoma-5; 440 s.
- Test de determinismo: `sim/genetics/determinism.test.ts` (incluido en `npm test`).
