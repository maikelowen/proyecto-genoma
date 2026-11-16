# Combate v0.5: bola de nieve con D-053 y D-054

Generado desde los datos por `npm run sim:v05` (modo completo). Commit `77eb4cf`, huella de `config/combate.v0.5.json` `bc3e8365edbb`, semillas `v05|`, 3 hilos, 213 s.

Mismos equipos y la misma semilla de partida en todas las configs (pareado). Escenarios medidos: C1 (12000 partidas por config), ESPEJO (2000), C2 (150 por pareja de familias, 78 parejas) y profundidad (400 partidas, solo en base_E3 y ambas). **No se miden** colocación ni tanque (no son de §9.2). Los Δ van en puntos porcentuales (pp) con ± 1,96 error estándar **pareado** partida a partida; `frágil` = ese intervalo cruza el umbral.

## Configuraciones

| Config | Claves | Huella |
| --- | --- | --- |
| base_E3 | energia.pago_al_confirmar=false<br>variantes.ultima_anima.activo=false | `41b1279515aa` |
| solo_D053 | energia.pago_al_confirmar=false<br>variantes.ultima_anima.activo=true | `2b27458d350d` |
| solo_D054 | energia.pago_al_confirmar=true<br>variantes.ultima_anima.activo=false | `e718fa08f43f` |
| ambas | energia.pago_al_confirmar=true<br>variantes.ultima_anima.activo=true | `9b7286111b3f` |
| ambas_aturdir_primero | energia.pago_al_confirmar=true<br>variantes.ultima_anima.activo=true<br>variantes.ultima_anima.aturdir=primero | `aad252cb8dc7` |

## Resultados (criterios de v0.4; ✗ = incumple)

| Métrica | base_E3 | solo_D053 | solo_D054 | ambas | ambas_aturdir_primero |
| --- | --- | --- | --- | --- | --- |
| Primer KO → gana (< 65 %) | 69,7 % ✗ | 68,5 % ✗ | 71,5 % ✗ | 70,3 % ✗ | 70,4 % ✗ |
| Líder T3 → gana (< 65 %) | 64,4 % | 63,1 % | 66,0 % ✗ | 65,1 % ✗ | 65,1 % ✗ |
| Remontadas (gana quien sufrió el 1.º KO) | 30,0 % | 31,3 % | 28,2 % | 29,5 % | 29,4 % |
| Turnos medios (6–10) | 8,89 | 8,59 | 8,89 | 8,69 | 8,69 |
| Turnos p90 (≤ 14) | 13,00 | 12,00 | 13,00 | 12,00 | 12,00 |
| Empates (≤ 3 %) | 0,9 % | 0,4 % | 0,9 % | 0,5 % | 0,5 % |
| % gratis (≤ 50 %) | 59,1 % ✗ | 57,9 % ✗ | 60,9 % ✗ | 60,0 % ✗ | 60,0 % ✗ |
| Pagos distintos por ánima (≥ 2) | 1,72 ✗ | 1,71 ✗ | 1,67 ✗ | 1,65 ✗ | 1,65 ✗ |
| Familias fuera de 43 %–57 % (de 13) | 0 | 0 | 2 ✗ | 3 ✗ | 3 ✗ |
| Profundidad (> 60 %) | 86,4 % | — | — | 86,8 % | — |

## Deltas frente a base_E3 (C1, n = 12000, pareado)

| Config | Primer KO | Líder T3 | Remontadas | Empates | Turnos medios |
| --- | --- | --- | --- | --- | --- |
| solo_D053 | −1,2 pp ± 0,8 | −1,3 pp ± 0,8 | +1,3 pp ± 0,8 | −0,5 pp ± 0,2 | −0,30 ± 0,03 |
| solo_D054 | +1,8 pp ± 0,6 | +1,6 pp ± 0,7 | −1,8 pp ± 0,6 | −0,0 pp ± 0,2 | −0,00 ± 0,03 |
| ambas | +0,6 pp ± 0,8 | +0,7 pp ± 0,8 | −0,5 pp ± 0,8 | −0,4 pp ± 0,2 | −0,21 ± 0,04 |
| ambas_aturdir_primero | +0,7 pp ± 0,8 | +0,7 pp ± 0,8 | −0,6 pp ± 0,8 | −0,4 pp ± 0,2 | −0,21 ± 0,04 |

Profundidad (búsqueda vs reglas): `ambas` 86,8 % frente a 86,4 % en base_E3; Δ +0,4 pp ± 4,7 (independiente, conservador: no hay pareado partida a partida; n = 400).

## Última ánima (C1)

Rangos informativos: pagos por turno 1.2–2, WR de la última 15 %–35 %. El WR de la última es el de los bandos que llegan a una sola ánima viva (en las configs sin D-053 es el WR de quien queda con una sola ánima, referencia).

| Config | Pagos por turno de la última | Reparto 0/1/2/3 pagos | Energía al empezar como última | WR de la última | Huecos con prioridad 1 |
| --- | --- | --- | --- | --- | --- |
| base_E3 | — | — | — | 30,9 % | — |
| solo_D053 | 1,36 | 6 % / 54 % / 37 % / 3 % | 5,43 | 38,8 % | 61 % |
| solo_D054 | — | — | — | 28,3 % | — |
| ambas | 1,19 | 9 % / 63 % / 27 % / 1 % | 4,77 | 33,4 % | 64 % |
| ambas_aturdir_primero | 1,18 | 9 % / 64 % / 26 % / 0 % | 4,73 | 33,4 % | 63 % |

## Energía perdida por partida (C1)

Rango informativo de la spec: 4–5.5. "Perdida útil" = excluye la energía del turno final en que cae la última ánima del bando perdedor. Sin D-054 la energía se devuelve (0 en la tabla); la comparación con v0.4 es la columna "KO por partida" por la energía comprometida de las caídas.

| Config | Por caer | Por aturdir | Total | De ellas, de últimas ánimas | Perdida útil (sin el turno en que cae la última del perdedor) | KO por partida | Energía perdida por KO caído |
| --- | --- | --- | --- | --- | --- | --- | --- |
| base_E3 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 4,27 | 0,00 |
| solo_D053 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 4,47 | 0,00 |
| solo_D054 | 3,45 | 0,91 | 4,35 | 0,00 | 2,96 | 4,17 | 0,83 |
| ambas | 3,91 | 0,93 | 4,83 | 1,72 | 3,07 | 4,31 | 0,91 |
| ambas_aturdir_primero | 3,92 | 1,04 | 4,96 | 1,84 | 3,13 | 4,31 | 0,91 |

## Veredicto: ¿mejora la bola de nieve? (§9.3)

"Mejora" exige las cuatro condiciones. "Empeora" (lectura declarada aquí, la spec solo la fija para D-054): el primer KO sube más de 1.5 pp o las remontadas bajan al menos 1.5 pp. Si no, "neutro".

### solo_D053: **NEUTRO la bola de nieve**

- No cumple (1): primer KO baja ≥ 2 pp (Δ −1,2 pp ± 0,8)
- Cumple (2): líder T3 no sube más de 1 pp (Δ −1,3 pp ± 0,8)
- No cumple (3): remontadas suben ≥ 1.5 pp (Δ +1,3 pp ± 0,8) **frágil**
- Cumple (4): duración en v04 (media 6–10, p90 ≤ 14, empates ≤ 3 %) y empates no suben más de 1 pp (Δ −0,5 pp ± 0,2)

### solo_D054: **EMPEORA la bola de nieve**

- No cumple (1): primer KO baja ≥ 2 pp (Δ +1,8 pp ± 0,6)
- No cumple (2): líder T3 no sube más de 1 pp (Δ +1,6 pp ± 0,7) **frágil**
- No cumple (3): remontadas suben ≥ 1.5 pp (Δ −1,8 pp ± 0,6)
- Cumple (4): duración en v04 (media 6–10, p90 ≤ 14, empates ≤ 3 %) y empates no suben más de 1 pp (Δ −0,0 pp ± 0,2)

### ambas: **NEUTRO la bola de nieve**

- No cumple (1): primer KO baja ≥ 2 pp (Δ +0,6 pp ± 0,8)
- Cumple (2): líder T3 no sube más de 1 pp (Δ +0,7 pp ± 0,8) **frágil**
- No cumple (3): remontadas suben ≥ 1.5 pp (Δ −0,5 pp ± 0,8)
- Cumple (4): duración en v04 (media 6–10, p90 ≤ 14, empates ≤ 3 %) y empates no suben más de 1 pp (Δ −0,4 pp ± 0,2)

### Lectura específica de D-054

- Primer KO en `solo_D054`: +1,8 pp ± 0,6 frente a un máximo de +1.5 pp: **empeora demasiado** (frágil).
- Profundidad: +0,4 pp frente a base_E3 (máximo de bajada 3 pp): **cumple**. Se mide en `ambas` (D-054 + D-053), no en `solo_D054`.

## Aturdir turno entero a la última (D-056)

En `ambas`, una última ánima aturdida antes de actuar ocurre en 4,3 % de las partidas y le cuesta de media **2,99** de energía por partida con última aturdida (0,13 por partida en total; umbral de §9.4: 1,0). Conclusión: aturdir "turno entero" **castiga demasiado** al que va perdiendo según ese umbral.

### Plan B (ambas_aturdir_primero), corrido por cumplirse la condición de §9.4

Frente a `ambas`: primer KO +0,1 pp ± 0,2, líder T3 +0,0 pp ± 0,2, remontadas −0,1 pp ± 0,2, turnos 0,00. Umbral para recomendarlo: baja ≥ 1 pp. **No se recomienda cambiar aturdir**.

## Criterios v0.4 que cada config incumple

| Config | Incumple |
| --- | --- |
| base_E3 | Gana quien hace el primer KO; Acciones que son el movimiento gratis; Movimientos de pago distintos por alma (de 3; almas con ≥ 4 acciones) |
| solo_D053 | Gana quien hace el primer KO; Acciones que son el movimiento gratis; Movimientos de pago distintos por alma (de 3; almas con ≥ 4 acciones) |
| solo_D054 | Gana quien hace el primer KO; Gana el líder de vida tras el turno 3; Acciones que son el movimiento gratis; Movimientos de pago distintos por alma (de 3; almas con ≥ 4 acciones); Familias fuera de 43 %–57 % (de 13) |
| ambas | Gana quien hace el primer KO; Gana el líder de vida tras el turno 3; Acciones que son el movimiento gratis; Movimientos de pago distintos por alma (de 3; almas con ≥ 4 acciones); Familias fuera de 43 %–57 % (de 13) |
| ambas_aturdir_primero | Gana quien hace el primer KO; Gana el líder de vida tras el turno 3; Acciones que son el movimiento gratis; Movimientos de pago distintos por alma (de 3; almas con ≥ 4 acciones); Familias fuera de 43 %–57 % (de 13) |

Familias (C2): base_E3: de 43,3 % (llama) a 54,4 % (magma); fuera: ninguna · solo_D053: de 43,6 % (marea) a 55,1 % (magma); fuera: ninguna · solo_D054: de 41,7 % (llama) a 60,4 % (sombra); fuera: llama 41,7 %, sombra 60,4 % · ambas: de 41,2 % (brote) a 61,7 % (sombra); fuera: brote 41,2 %, roca 42,3 %, sombra 61,7 % · ambas_aturdir_primero: de 41,3 % (brote) a 61,9 % (sombra); fuera: brote 41,3 %, roca 42,1 %, sombra 61,9 %
