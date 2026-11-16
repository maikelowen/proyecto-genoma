# Informe de progresión v0.1 con combate real

Generado por `sim/progresion` desde el commit `6add31f` (más cambios locales si los hay), config `config/progresion.v0.1.json` + combate v0.5 + movimientos v0.5 + genética v0.2, huella sha256 `c64c6a09fd66…`. Modo completo: 500 partidas por perfil, semillas `prog01-<perfil>-<i>` (nunca usadas para elegir números), tope de 120 combates por partida, 46 s con 4 hilos. Todo lo de abajo sale de `sim/out/progresion/progresion.json`.

Alcance: economía de la progresión (§9.2 filas de ritmo, atrapar, victorias, turnos, esencia, colección, liberar) con el núcleo real: `newGame`, `chooseStarter`, `rollEncounter`, `playEncounterBattle` (IA de referencia por tu lado, «instinto» en el salvaje), `applyBattleResult`, `throwLantern`, `resonate`, `release`, `setTeam`, `chooseVariant`. **No medido aquí** (otro encargo): espejos 4 contra 3 y 4 contra 2 movimientos, espejo de nivel 30 con variantes, pieza gratis, candidatos por locus, hashes 3 contra 3 (los cubre el test del núcleo).

## Perfiles

- **normal**: modelo de la spec §9.1: equipo = 3 de más nivel; zona abierta más alta; faroles a la más pura, 2 por salvaje y varias salvajes solo con ≥ 6 faroles; resuena mientras pueda; variante A.
- **cuidadoso**: como normal, pero solo sube de zona cuando el nivel medio del equipo ≥ nivel máx. de la zona − 2; elige la variante B si existe.
- **impaciente**: zona más alta siempre; 1 farol por salvaje (sin reintento); resuena mientras pueda.
- **cuidador**: variante «cuidador» de la spec: el eco más reciente ocupa el 3.er puesto del equipo.
- **liberador**: como normal, y tras cada combate libera toda ánima madura (las inmaduras no dan esencia) que no esté en el equipo ni entre las 6 mejores candidatas a resonar (spec §9.1 «Liberar»).

Todos juegan sesiones de 6 combates, la inicial rota entre las tres (i mod 3), meten en el equipo a sus 3 mejores ánimas con `setTeam` antes de cada combate (por nivel; empate por nacimiento) y eligen las variantes pendientes. Cada combate se juega con la IA de referencia. Todas las cifras de victoria cuentan los combates jugados hasta nivel 30 (no se fuerza una zona).

## Resumen ejecutivo

Se miden 16 criterios en 5 perfiles. **Cumplen 14, frágiles 0, fallan 2.** **El veredicto oficial de cada fila es el del perfil «normal»** (el modelo de la spec §9.1; LIB: el del «liberador»). Los otros perfiles miden sensibilidad: la columna «Otros perfiles» dice cuáles fallan.

- **Falla V3 — Victorias en Cantil del Farol Roto** (umbral 55–80 %): normal 89,3 % [88,7 %; 89,8 %] (n=12303); cuidadoso 89,2 % [88,6 %; 89,7 %] (n=11293); impaciente 89,2 % [88,7 %; 89,8 %] (n=12596); cuidador 87,4 % [86,9 %; 88,0 %] (n=12690); liberador 88,7 % [88,2 %; 89,3 %] (n=12435).
- **Falla T3 — Turnos por combate en el Cantil (media) y empates** (umbral ≤ 9 turnos; empates ≤ 2 %): normal 7,3 turnos; empates 2,2 %; cuidadoso 7,4 turnos; empates 2,5 %; impaciente 7,2 turnos; empates 2,3 %; liberador 7,3 turnos; empates 2,5 %.

Sensibilidad (cumple el modelo normal pero falla otro perfil): R3 (cuidadoso); NIV (cuidadoso); A2 (cuidadoso); BE (cuidador).

## Veredicto por criterio (§9.2)

| Id | Criterio | Umbral | normal | cuidadoso | impaciente | cuidador | liberador | Veredicto (normal) | Otros perfiles que fallan |
|---|---|---|---|---|---|---|---|---|---|
| R3 | Resonancias tras 3 sesiones (mediana / p10) | mediana ≥ 20, p10 ≥ 15 | 32 / 26 (cumple) | 15 / 10 (**FALLA**) | 25 / 18 (cumple) | 38 / 31 (cumple) | 31 / 25 (cumple) | cumple | cuidadoso |
| R1 | Resonancias en la sesión 1 (mediana) | ≥ 2 | 8 (p10 0) (cumple) | 5 (p10 0) (cumple) | 7 (p10 0) (cumple) | 7 (p10 0) (cumple) | 8 (p10 0) (cumple) | cumple | — |
| MIN | Minutos por sesión (modelo de tiempo, mediana de las 3 sesiones) | 10–20 min | 16,7 min (p10 10,8, p90 21,0) (cumple) | 10,5 min (p10 6,2, p90 17,2) (cumple) | 14,8 min (p10 9,5, p90 19,5) (cumple) | 18,7 min (p10 10,2, p90 23,5) (cumple) | 16,7 min (p10 10,7, p90 21,0) (cumple) | cumple | — |
| NIV | Nivel del favorito tras 3 sesiones (mediana) | 15–22 | 21 (p10 18, p90 23) (cumple) | 12 (p10 11, p90 14) (**FALLA**) | 20 (p10 17, p90 22) (cumple) | 20 (p10 18, p90 23) (cumple) | 21 (p10 18, p90 23) (cumple) | cumple | cuidadoso |
| N30 | Combates hasta nivel 30 (favorito, mediana) | 28–70 | 33 [32; 33] (0 censuradas) (cumple) | 43 [43; 43] (0 censuradas) (cumple) | 34 [34; 34] (0 censuradas) (cumple) | 34 [34; 34] (0 censuradas) (cumple) | 33 [33; 34] (0 censuradas) (cumple) | cumple | — |
| A1 | Atrapar al 1.er intento | 60–80 % | 64,6 % [63,8 %; 65,3 %] (cumple) | 66,9 % [66,2 %; 67,5 %] (cumple) | 64,9 % [64,2 %; 65,7 %] (cumple) | 64,6 % [63,8 %; 65,3 %] (cumple) | 64,7 % [64,0 %; 65,5 %] (cumple) | cumple | — |
| A2 | Atrapada con reintento (salvajes a las que se les lanzó 1.er farol) | 85–97 % | 96,1 % [95,8 %; 96,4 %] (cumple) | 97,8 % [97,5 %; 98,0 %] (**FALLA**) | sin reintento (cumple) | 96,2 % [95,9 %; 96,6 %] (cumple) | 95,8 % [95,5 %; 96,2 %] (cumple) | cumple | cuidadoso |
| V1 | Victorias en Prado de la Linde | ≥ 80 % | 92,9 % [91,9 %; 93,9 %] (n=2547) (cumple) | 97,2 % [96,7 %; 97,6 %] (n=6523) (cumple) | 92,5 % [91,4 %; 93,4 %] (n=2568) (cumple) | 92,9 % [91,8 %; 93,8 %] (n=2590) (cumple) | 93,4 % [92,4 %; 94,3 %] (n=2559) (cumple) | cumple | — |
| V2 | Victorias en Marismas Quietas | ≥ 70 % | 93,4 % [92,0 %; 94,5 %] (n=1626) (cumple) | 94,3 % [93,6 %; 95,0 %] (n=3846) (cumple) | 92,0 % [90,7 %; 93,2 %] (n=1838) (cumple) | 89,9 % [88,4 %; 91,3 %] (n=1737) (cumple) | 93,5 % [92,2 %; 94,6 %] (n=1721) (cumple) | cumple | — |
| V3 | Victorias en Cantil del Farol Roto | 55–80 % | 89,3 % [88,7 %; 89,8 %] (n=12303) (**FALLA**) | 89,2 % [88,6 %; 89,7 %] (n=11293) (**FALLA**) | 89,2 % [88,7 %; 89,8 %] (n=12596) (**FALLA**) | 87,4 % [86,9 %; 88,0 %] (n=12690) (**FALLA**) | 88,7 % [88,2 %; 89,3 %] (n=12435) (**FALLA**) | **FALLA** | cuidadoso, impaciente, cuidador, liberador |
| PC | Primer combate (inicial + acompañante) | ≥ 90 % | 93,8 % [91,3 %; 95,6 %] (cumple) | 94,2 % [91,8 %; 95,9 %] (cumple) | 92,6 % [90,0 %; 94,6 %] (frágil) | 91,8 % [89,1 %; 93,9 %] (frágil) | 93,6 % [91,1 %; 95,4 %] (cumple) | cumple | — |
| T1 | Turnos por combate en el Prado (media) y empates | ≤ 6 turnos; empates ≤ 2 % | 3,8 turnos; empates 0,2 % (cumple) | 3,8 turnos; empates 0,1 % (cumple) | 3,8 turnos; empates 0,1 % (cumple) | 3,8 turnos; empates 0,3 % (cumple) | 3,9 turnos; empates 0,1 % (cumple) | cumple | — |
| T3 | Turnos por combate en el Cantil (media) y empates | ≤ 9 turnos; empates ≤ 2 % | 7,3 turnos; empates 2,2 % (**FALLA**) | 7,4 turnos; empates 2,5 % (**FALLA**) | 7,2 turnos; empates 2,3 % (**FALLA**) | 7,1 turnos; empates 1,8 % (cumple) | 7,3 turnos; empates 2,5 % (**FALLA**) | **FALLA** | cuidadoso, impaciente, liberador |
| BE | Bloqueo por esencia (% de momentos con pareja madura pero sin esencia) | ≤ 50 % | 20,7 % (cumple) | 1,4 % (cumple) | 6,4 % (cumple) | 73,6 % (**FALLA**) | 14,2 % (cumple) | cumple | cuidador |
| CL | Colección llena en 3 sesiones | 0 % de partidas | 0,0 % (cumple) | 0,0 % (cumple) | 0,0 % (cumple) | 0,0 % (cumple) | 0,0 % (cumple) | cumple | — |
| LIB | Esencia de liberar / esencia total | ≤ 15 % | — | — | — | — | 8,0 % (cumple) | cumple | — |

- R3: Se evalúa en todos los perfiles (la spec lo pide en todo el rango de victorias).
- MIN: Tiempo = turnos × 10 s + 30 s por combate + 40 s por resonancia; no cuenta lanzar faroles ni menús.
- N30: Censura: las partidas que no llegan al tope de combates cuentan como «> tope».
- A2: «impaciente» no reintenta: no se evalúa.
- LIB: Solo el perfil «liberador» libera; en los demás es 0.

«Frágil» = el valor está dentro del umbral pero el intervalo de confianza al 95 % (Wilson para proporciones; estadísticos de orden para medianas y p10) lo cruza.

## Resonancias, nivel y colección por sesión (acumulado)

| Perfil | Partidas sin resonancia en la sesión 1 | Res. ses. 1 mediana (p10) | ses. 2 | ses. 3 | IC mediana ses. 3 | IC p10 ses. 3 | Colección ses. 3 (mediana, p90) | Esencia ses. 3 (mediana) | Faroles ses. 3 (mediana) |
|---|---|---|---|---|---|---|---|---|---|
| normal | 17,4 % | 8 (0) | 20 (15) | 32 (26) | [31; 32] | [25; 27] | 48, 55 | 34 | 0 |
| cuidadoso | 22,2 % | 5 (0) | 5 (5) | 15 (10) | [15; 17] | [10; 10] | 33, 40 | 50 | 0 |
| impaciente | 25,6 % | 7 (0) | 16 (10) | 25 (18) | [25; 25] | [18; 20] | 38, 46 | 91 | 5 |
| cuidador | 16,6 % | 7 (0) | 22 (16) | 38 (31) | [38; 39] | [30; 32] | 55, 62 | 5 | 0 |
| liberador | 19,4 % | 8 (0) | 20 (15) | 31 (25) | [31; 32] | [24; 26] | 39, 44 | 58 | 0 |

## Victorias, turnos y diferencia de nivel por zona

| Perfil | Zona | Combates | Victorias | Empates | Turnos (media) | Nivel máx. salvaje − nivel máx. equipo (media) | % con salvaje de más nivel que tu equipo |
|---|---|---|---|---|---|---|---|
| normal | Prado de la Linde | 2547 | 92,9 % [91,9 %; 93,9 %] | 0,2 % | 3,8 | -0,6 | 22,9 % |
| normal | Marismas Quietas | 1626 | 93,4 % [92,0 %; 94,5 %] | 1,0 % | 6,4 | 1,2 | 63,3 % |
| normal | Cantil del Farol Roto | 12303 | 89,3 % [88,7 %; 89,8 %] | 2,2 % | 7,3 | -7,3 | 10,2 % |
| cuidadoso | Prado de la Linde | 6523 | 97,2 % [96,7 %; 97,6 %] | 0,1 % | 3,8 | -2,8 | 8,8 % |
| cuidadoso | Marismas Quietas | 3846 | 94,3 % [93,6 %; 95,0 %] | 1,4 % | 6,5 | -2,7 | 10,4 % |
| cuidadoso | Cantil del Farol Roto | 11293 | 89,2 % [88,6 %; 89,7 %] | 2,5 % | 7,4 | -8,3 | 3,3 % |
| impaciente | Prado de la Linde | 2568 | 92,5 % [91,4 %; 93,4 %] | 0,1 % | 3,8 | -0,5 | 23,1 % |
| impaciente | Marismas Quietas | 1838 | 92,0 % [90,7 %; 93,2 %] | 0,7 % | 6,6 | 1,3 | 65,0 % |
| impaciente | Cantil del Farol Roto | 12596 | 89,2 % [88,7 %; 89,8 %] | 2,3 % | 7,2 | -7,2 | 11,3 % |
| cuidador | Prado de la Linde | 2590 | 92,9 % [91,8 %; 93,8 %] | 0,3 % | 3,8 | -0,6 | 23,1 % |
| cuidador | Marismas Quietas | 1737 | 89,9 % [88,4 %; 91,3 %] | 1,2 % | 6,7 | 1,3 | 64,0 % |
| cuidador | Cantil del Farol Roto | 12690 | 87,4 % [86,9 %; 88,0 %] | 1,8 % | 7,1 | -7,3 | 10,0 % |
| liberador | Prado de la Linde | 2559 | 93,4 % [92,4 %; 94,3 %] | 0,1 % | 3,9 | -0,6 | 21,7 % |
| liberador | Marismas Quietas | 1721 | 93,5 % [92,2 %; 94,6 %] | 0,9 % | 6,7 | 1,4 | 65,3 % |
| liberador | Cantil del Farol Roto | 12435 | 88,7 % [88,2 %; 89,3 %] | 2,5 % | 7,3 | -7,3 | 10,2 % |

Solo los 18 primeros combates (las 3 sesiones del hito D-066), victorias por zona:

| Perfil | Prado | Marismas | Cantil |
|---|---|---|---|
| normal | 92,9 % (n=2547) | 93,4 % (n=1626) | 89,2 % (n=4827) |
| cuidadoso | 97,2 % (n=6523) | 94,2 % (n=2453) | 83,3 % (n=24) |
| impaciente | 92,5 % (n=2568) | 92,0 % (n=1838) | 89,6 % (n=4594) |
| cuidador | 92,9 % (n=2590) | 89,9 % (n=1737) | 87,3 % (n=4673) |
| liberador | 93,4 % (n=2559) | 93,5 % (n=1721) | 89,3 % (n=4720) |

## Dónde se atasca el jugador

Derrotas por tipo de combate (tamaño de tu equipo sin acompañante contra número de salvajes), solo celdas con ≥ 30 combates y menos de 70 % de victorias o las 3 peores de cada perfil.

| Perfil | Zona | Tu equipo | Salvajes | Combates | Victorias |
|---|---|---|---|---|---|
| normal | Prado de la Linde | 2 | 2 | 173 | 41,6 % [34,5 %; 49,1 %] |
| normal | Cantil del Farol Roto | 3 | 3 | 3734 | 73,9 % [72,5 %; 75,3 %] |
| normal | Marismas Quietas | 3 | 3 | 327 | 77,1 % [72,2 %; 81,3 %] |
| cuidadoso | Prado de la Linde | 2 | 2 | 177 | 46,9 % [39,7 %; 54,2 %] |
| cuidadoso | Cantil del Farol Roto | 3 | 3 | 3426 | 73,9 % [72,4 %; 75,4 %] |
| cuidadoso | Prado de la Linde | 1 | 2 | 149 | 77,9 % [70,5 %; 83,8 %] |
| impaciente | Prado de la Linde | 2 | 2 | 216 | 53,7 % [47,0 %; 60,2 %] |
| impaciente | Marismas Quietas | 3 | 3 | 356 | 71,1 % [66,2 %; 75,5 %] |
| impaciente | Cantil del Farol Roto | 3 | 3 | 3770 | 72,9 % [71,5 %; 74,3 %] |
| cuidador | Prado de la Linde | 2 | 2 | 185 | 51,4 % [44,2 %; 58,5 %] |
| cuidador | Marismas Quietas | 3 | 3 | 357 | 63,3 % [58,2 %; 68,1 %] |
| cuidador | Cantil del Farol Roto | 3 | 3 | 3704 | 66,9 % [65,4 %; 68,4 %] |
| liberador | Prado de la Linde | 2 | 2 | 166 | 50,6 % [43,1 %; 58,1 %] |
| liberador | Cantil del Farol Roto | 3 | 3 | 3737 | 71,9 % [70,5 %; 73,3 %] |
| liberador | Prado de la Linde | 1 | 2 | 168 | 75,0 % [67,9 %; 80,9 %] |

Llegada a las zonas (combate en que se abre y se elige la zona nueva, mediana):

| Perfil | Marismas (combate nº) | Cantil (combate nº) | Partidas que llegan al Cantil |
|---|---|---|---|
| normal | 6 | 9 | 100,0 % |
| cuidadoso | 14 | 22 | 100,0 % |
| impaciente | 6 | 10 | 100,0 % |
| cuidador | 6 | 10 | 100,0 % |
| liberador | 6 | 10 | 100,0 % |

## Atrapar y faroles

| Perfil | 1.er intento (n) | Con reintento | Faroles mínimos (mediana) | Partidas que nunca llegan a 0 faroles | Combates que empiezan con 0 faroles | Salvajes derrotadas a las que se lanza farol | Primer combate ganado |
|---|---|---|---|---|---|---|---|
| normal | 64,6 % (14993) | 96,1 % | 0 | 1,4 % | 47,8 % | 51,1 % | 93,8 % |
| cuidadoso | 66,9 % (20065) | 97,8 % | 0 | 0,8 % | 57,2 % | 55,0 % | 94,2 % |
| impaciente | 64,9 % (15805) | — | 5 | 100,0 % | 0,0 % | 52,5 % | 92,6 % |
| cuidador | 64,6 % (14469) | 96,2 % | 0 | 2,0 % | 46,3 % | 49,4 % | 91,8 % |
| liberador | 64,7 % (15191) | 95,8 % | 0 | 1,4 % | 48,6 % | 51,5 % | 93,6 % |

## Esencia y liberar

| Perfil | Esencia total ingresada por partida (media) | Bloqueo por esencia | % esencia por liberar |
|---|---|---|---|
| normal | 643 | 20,7 % | 0,0 % |
| cuidadoso | 724 | 1,4 % | 0,0 % |
| impaciente | 658 | 6,4 % | 0,0 % |
| cuidador | 641 | 73,6 % | 0,0 % |
| liberador | 702 | 14,2 % | 8,0 % |

## Propuesta de ajuste (validada con semillas nuevas)

Fichero `config/propuestas/progresion-v0.1.1.json` (huella `30b8493d52b5…`). Cambios respecto a `config/progresion.v0.1.json`, calculados de los dos JSON:

- `mundo.zonas[cantil_farol_roto].grupo_pesos: [0.1,0.6,0.3] → [0.05,0.5,0.45]`
- `ia_salvaje.modo: "instinto" → "referencia"`

Declaración: Propuesta del analista (no vigente hasta que la adopte el director): salvajes con la IA de referencia y el Cantil con más grupos de 3. Elegida con semillas prog02 entre 7 variantes de diagnóstico (A: ia referencia; B: Cantil 0/0,4/0,6; C: acompañante hasta 3 ánimas; D: Cantil nivel 12–18; E: referencia + Cantil 5/50/45 [esta]; F: referencia + 0/50/50; G: referencia + 0/40/60); validada con prog03.

Validación: 500 partidas por perfil con semillas `prog03-<perfil>-<i>` (distintas de las de la medición y de las de elegir), 61 s.

| Id | Criterio | Umbral | Base (normal) | Propuesta (normal) | Veredicto propuesta | Otros perfiles que fallan con la propuesta |
|---|---|---|---|---|---|---|
| R3 | Resonancias tras 3 sesiones (mediana / p10) | mediana ≥ 20, p10 ≥ 15 | 32 / 26 (cumple) | 27 / 21 | cumple | cuidadoso |
| R1 | Resonancias en la sesión 1 (mediana) | ≥ 2 | 8 (p10 0) (cumple) | 8 (p10 0) | cumple | — |
| MIN | Minutos por sesión (modelo de tiempo, mediana de las 3 sesiones) | 10–20 min | 16,7 min (p10 10,8, p90 21,0) (cumple) | 15,3 min (p10 10,0, p90 19,0) | cumple | — |
| NIV | Nivel del favorito tras 3 sesiones (mediana) | 15–22 | 21 (p10 18, p90 23) (cumple) | 19 (p10 17, p90 22) | cumple | cuidadoso |
| N30 | Combates hasta nivel 30 (favorito, mediana) | 28–70 | 33 [32; 33] (0 censuradas) (cumple) | 36 [35; 36] (0 censuradas) | cumple | — |
| A1 | Atrapar al 1.er intento | 60–80 % | 64,6 % [63,8 %; 65,3 %] (cumple) | 63,2 % [62,4 %; 64,0 %] | cumple | — |
| A2 | Atrapada con reintento (salvajes a las que se les lanzó 1.er farol) | 85–97 % | 96,1 % [95,8 %; 96,4 %] (cumple) | 95,8 % [95,4 %; 96,1 %] | cumple | cuidadoso |
| V1 | Victorias en Prado de la Linde | ≥ 80 % | 92,9 % [91,9 %; 93,9 %] (n=2547) (cumple) | 92,4 % [91,3 %; 93,4 %] (n=2602) | cumple | — |
| V2 | Victorias en Marismas Quietas | ≥ 70 % | 93,4 % [92,0 %; 94,5 %] (n=1626) (cumple) | 86,7 % [85,1 %; 88,3 %] (n=1743) | cumple | — |
| V3 | Victorias en Cantil del Farol Roto | 55–80 % | 89,3 % [88,7 %; 89,8 %] (n=12303) (**FALLA**) | 73,7 % [73,0 %; 74,4 %] (n=13782) | cumple | — |
| PC | Primer combate (inicial + acompañante) | ≥ 90 % | 93,8 % [91,3 %; 95,6 %] (cumple) | 91,4 % [88,6 %; 93,6 %] | frágil | — |
| T1 | Turnos por combate en el Prado (media) y empates | ≤ 6 turnos; empates ≤ 2 % | 3,8 turnos; empates 0,2 % (cumple) | 3,7 turnos; empates 0,2 % | cumple | — |
| T3 | Turnos por combate en el Cantil (media) y empates | ≤ 9 turnos; empates ≤ 2 % | 7,3 turnos; empates 2,2 % (**FALLA**) | 6,8 turnos; empates 0,1 % | cumple | — |
| BE | Bloqueo por esencia (% de momentos con pareja madura pero sin esencia) | ≤ 50 % | 20,7 % (cumple) | 20,1 % | cumple | cuidador |
| CL | Colección llena en 3 sesiones | 0 % de partidas | 0,0 % (cumple) | 0,0 % | cumple | — |
| LIB | Esencia de liberar / esencia total | ≤ 15 % | 8,0 % (cumple) | 7,6 % | cumple | — |

Con la propuesta no falla ningún criterio medido en el perfil normal (1 frágil/es).

## Conclusiones (plantillas sobre los datos)

- **Atasco principal (perfil normal)**: Prado de la Linde, tu equipo de 2 contra 2 salvajes: 41,6 % de victorias en 173 combates (frente a 92,9 % de la zona entera).
- **Quien espera a estar fuerte se atasca en el Prado**: el perfil cuidadoso entra en las Marismas en el combate 14 y en el Cantil en el 22 (normal: 6 y 9); tras 3 sesiones tiene 15 resonancias y el favorito está en nivel 12.
- **Faroles**: en el perfil normal el 47,8 % de los combates empieza con 0 faroles y se lanza farol al 51,1 % de las salvajes derrotadas; el 98,6 % de las partidas se queda sin faroles en algún momento. Tras cada victoria siempre hay al menos 1 (+1 por victoria), así que el atrapar nunca queda bloqueado, pero el ritmo lo marcan los faroles, no las salvajes disponibles.
- **Primera sesión**: el 17,4 % de las partidas del perfil normal no resuena en la sesión 1 (la inicial madura al nivel 5 y no siempre llega a tiempo); la mediana cumple, la cola no.

Fallan 2 criterio(s) en el perfil normal: V3, T3. La propuesta de ajuste y su validación están en la sección anterior.

