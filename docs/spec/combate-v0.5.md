# Especificación de combate v0.5 — última ánima y energía pagada al confirmar (D-053, D-054)

Estado: propuesta para implementar y simular (rama `combate-v0.5`). Autor: Diseñador de sistemas. Fecha: 2026-11-13.
Base: `combate-v0.4.md` con **energía 3** (D-052: inicial 3, por turno 3, máximo 10), que a su vez remite a `combate-v0.2.md` y `combate-variantes-v0.3.md`. Este documento **solo** recoge lo que cambia; lo marcado **[v0.5]** es autocontenido. Lo que no aparece aquí sigue igual que en v0.4.
Números: `config/combate.v0.5.json`, citados como `[ruta]`. Si no coinciden, manda el JSON. Movimientos: `config/movimientos.v0.4.json` (sin cambios).
Decisiones de Miguel que fijan este documento: D-053, D-054, D-056 y D-057 (`docs/proyecto/DECISIONES.md`). Nada de aquí las cambia.

---

## 0. Dos interruptores independientes [v0.5]

| Clave | Valor v0.5 | Valor que reproduce v0.4 | Mecánica |
|---|---|---|---|
| `[variantes.ultima_anima.activo]` | `true` | `false` | Varios movimientos de la última ánima (D-053, §2) |
| `[energia.pago_al_confirmar]` | `true` | `false` | La energía de una acción cancelada se pierde (D-054, §1) |

Claves auxiliares (solo cuentan con `ultima_anima.activo = true`):

| Clave | Valores | v0.5 | Para qué |
|---|---|---|---|
| `[variantes.ultima_anima.aturdir]` | `"turno"` \| `"primero"` | `"turno"` | D-056 (3): aturdida pierde la secuencia entera; `"primero"` es el plan B (solo el primer movimiento) |
| `[variantes.ultima_anima.prioridad_hueco]` | `"primero"` \| `"minimo"` | `"primero"` | Nivel de prioridad del hueco de la secuencia (§3.1) |

**Garantía de regresión:** con `ultima_anima.activo = false` y `pago_al_confirmar = false`, el resultado de cualquier combate (estado, eventos y tiradas) es **idéntico** al de v0.4 con energía 3. El vector dorado actual debe pasar sin tocarlo cambiando solo `version` y añadiendo las dos claves a `false`.

---

## 1. Energía pagada al confirmar (D-054) [v0.5]

El pago ya se descontaba al confirmar el plan (v0.2 §3, paso 3). Lo que cambia es la **cancelación**:

```
al llegar el hueco de una acción:
  si el actor está KO o aturdido este turno antes de actuar:
     acción cancelada (no descansa, como v0.4)
     si pago_al_confirmar: la energía NO se devuelve  → energía perdida += coste
     si no:                energía = min(maximo, energía + coste)          // v0.2–v0.4
```

- Afecta a todas las ánimas, no solo a la última. El gratis cuesta 0: cancelarlo no pierde nada.
- "Ningún enemigo vivo al ejecutar" sigue como v0.2: la acción se pierde y se paga (ya era así).
- La condición `reserva` sigue mirando la energía tras el pago (`afterPay`): no cambia.
- Evento: el `cancel` de v0.4 lleva `refund = 0` y además la energía perdida (`lost = coste`); con la clave a `false`, `refund = coste` y `lost = 0`. Un evento por movimiento cancelado (en una secuencia, uno por cada movimiento).

---

## 2. Varios movimientos de la última ánima (D-053, D-056) [v0.5]

### 2.1 Quién es "última ánima"
`última(bando, t)` ⇔ al **empezar** el turno t (antes de elegir planes) el bando tiene **exactamente una** ánima viva. Se fija para todo el turno: si la compañera cae a mitad del turno t, la superviviente empieza a ser "última" en t + 1 (D-056 (1)). Una vez última, lo es hasta el final de la partida (no hay resurrección).

### 2.2 Qué puede elegir
Una de estas dos opciones:

| Opción | Contenido | Coste |
|---|---|---|
| **Gratis** | su movimiento gratis, solo, una vez | 0 |
| **Secuencia** | lista **ordenada** de 1 a 3 movimientos de pago **distintos** (cabeza, cuerpo, cola) | Σ coste ≤ energía del bando |

- El gratis nunca se mezcla con pagos ni se repite; ningún pago se repite en el turno.
- El orden de la lista es el orden de ejecución (lo elige el jugador; D-056 (2)).
- Si no le alcanza ningún pago, solo le queda el gratis. Elegir nada no es válido (como v0.4: una opción por ánima viva no aturdida).
- **Sin descanso** (§2.4).

### 2.3 Plan y validación (sin tiradas)
El plan sigue siendo una lista de acciones `{actor, move, target}`. Para la última ánima puede haber **varias entradas con el mismo `actor`**; su orden en la lista es el orden de ejecución. Válido si:
1. todas las entradas del bando son de esa ánima;
2. o hay una sola entrada y es su gratis, o hay 1–3 entradas de pago con `move` distintos;
3. Σ coste ≤ energía; los descansos de la última no se comprueban (§2.4).
Plan inválido o temporizador: el gratis (como v0.4).

### 2.4 Descanso: ni nuevo ni pendiente
Mientras un ánima es última, **sus contadores de descanso se ignoran** (todos sus movimientos de pago están disponibles) y lo que ejecuta no descansa. Si llega a última con un movimiento descansando (lo usó en t − 1 con su compañera viva), en t ya puede usarlo.
Motivo: D-053 quita el descanso porque dejaría a la última sin movimientos; arrastrar uno pendiente reintroduce el problema justo el primer turno, que es cuando más energía acumulada tiene. Además es más fácil de leer ("la última ánima no descansa", sin excepciones). Alternativa descartada: respetar el descanso pendiente un turno (confuso y le quita un tercio de las opciones en su mejor turno).

---

## 3. Orden, ejecución y casos borde [v0.5]

### 3.1 Un único hueco por secuencia
La secuencia ocupa **un hueco** en la cola del turno, con la clave de orden de v0.2 §4 calculada **una sola vez** para el ánima:
- **nivel** = `[prioridad_hueco]`: `"primero"` → el nivel del **primer** movimiento de la secuencia (con `prioridad` o de aliado → 1; si no, 0). `"minimo"` → el menor nivel de los movimientos de la secuencia.
- **iniciativa** = la de siempre (base + prisa/ralentizar vigentes al ordenar + jitter de su casilla). Igual que en v0.4, los estados que cambian la iniciativa y se aplican durante el turno **no reordenan** la cola de ese turno.
- Desempates: los de v0.2 §4 (lado favorecido, posición).

Dentro del hueco, los movimientos se ejecutan **seguidos y en el orden elegido**; nadie actúa entre medias. La secuencia no se reordena por la prioridad de sus movimientos.

**Decisión: el nivel lo da el primer movimiento** (legible: "la secuencia arranca cuando le tocaría a su primer movimiento"; el jugador lo controla con el orden). Es una ventaja para la última (puede abrir con un escudo, que tiene prioridad implícita, y meter los golpes en el mismo hueco), coherente con el objetivo de D-053 de suavizar la bola de nieve. Alternativas: `"minimo"` (queda en config por si el analista ve abuso: solo tiene prioridad si todos la tienen); **máximo** descartado (cualquier escudo arrastraría toda la secuencia y el orden elegido dejaría de importar); iniciativa propia por movimiento descartada por D-056.

### 3.2 Ejecución de cada movimiento de la secuencia
Cada movimiento se resuelve exactamente como una acción de v0.4 (§3 de v0.4: objetivo, condición, daño → drenaje → estado → escudo/cura → provocar → energía extra), **con el estado del momento**, incluido lo que hicieron los movimientos anteriores de la secuencia.

### 3.3 Tabla de casos borde

| # | Caso | Resultado |
|---|---|---|
| U1 | La compañera cae a mitad del turno t | En t la superviviente hace su acción normal (con su descanso). En t + 1 es última. |
| U2 | Aturdida **antes** de su hueco, `aturdir = "turno"` | Pierde la secuencia entera. Con `pago_al_confirmar`: pierde **toda** la energía comprometida; sin él, se le devuelve toda (tope `maximo`). |
| U3 | Aturdida antes de su hueco, `aturdir = "primero"` | Se cancela solo el primer movimiento (su coste se pierde o se devuelve según `pago_al_confirmar`); el resto se ejecuta en el mismo hueco. |
| U4 | Aturdida **después** de actuar (o en t − 1 cuando ya era última, `skipTurn = t`) | `"turno"`: como v0.2, no elige nada en el turno siguiente (no compromete energía, no pierde nada). `"primero"`: elige plan normal y se cancela su primer movimiento al llegar el hueco (como U3). Inmunidad: sin cambios (2 turnos). |
| U5 | Cae (KO) antes de su hueco | Se cancela la secuencia entera; energía perdida o devuelta según `pago_al_confirmar`. |
| U6 | Cae a mitad de su propia secuencia | Con el catálogo actual **no puede ocurrir** (nadie actúa entre sus movimientos y ningún movimiento se hace daño a sí mismo; quemadura y regeneración van al final del turno). Regla por si aparece una pieza que lo permita: los movimientos restantes se cancelan como en U5. |
| U7 | Un rival cae a mitad de la secuencia | El objetivo se recalcula al ejecutar **cada** movimiento con la fila atacable de ese momento (C16). Si cae la delantera rival con el 1.º, el 2.º ya va a la trasera. |
| U8 | Todos los rivales caen a mitad de la secuencia | Los movimientos ofensivos restantes se pierden (pagados, como v0.2 "ningún enemigo vivo"). Los de aliado (escudo/cura) se ejecutan con normalidad. La partida se resuelve al final del turno. |
| U9 | Sinergia | La última nunca tiene sinergia: varios movimientos de la misma ánima cuentan como **una** ánima (D-057), grupo de 1 ⇒ bonus 0. La condición `combo_familia` es siempre falsa. |
| U10 | Un movimiento de la secuencia provoca | Provoca desde ese momento, como v0.4 §3.2: desvía los ataques rivales **posteriores** del turno (y la duración de siempre). No afecta a los movimientos de su propia secuencia. |
| U11 | Escudo o cura en la secuencia | Objetivo automático v0.4 §3.1: con una sola viva, es ella misma. Dos escudos seguidos se apilan con la regla Q-01 (§3.4 de v0.4): suma y renueva solo si el aporte ≥ el escudo actual. Cura con vida llena: sin efecto, se paga. |
| U12 | Energía extra (+1) en la secuencia | Se suma al bando al ejecutarse (tope `maximo`), pero **no puede pagar** otro movimiento de la misma secuencia: la secuencia entera se pagó al confirmar. Sirve para el turno siguiente. Vale igual con o sin `pago_al_confirmar` (el pago siempre es al confirmar; la clave solo decide si se devuelve). |
| U13 | Prisa o ralentizar dentro de la secuencia | No reordenan este turno (§3.1); cuentan para el siguiente, como v0.4. Prisa va al usuario. |
| U14 | Marca, estados y condiciones | Se evalúan por movimiento al ejecutarlo: un movimiento que marca antes de un golpe hace que el golpe ya cuente ×1,20; `objetivo_con_estado` ve el estado puesto por el movimiento anterior; `antes_que_objetivo` mira si el objetivo ha actuado (no cambia dentro del hueco); `vida_baja` mira la vida actual; `reserva` mira la energía tras el pago. |
| U15 | Drenaje | Cura según el daño de **ese** movimiento, como v0.4. |
| U16 | Los dos bandos tienen última ánima | Cada una con su hueco; se ordenan con la clave de §3.1. |
| U17 | Energía insuficiente para cualquier pago | Solo puede elegir el gratis. |
| U18 | Acción de otra ánima del bando (D-054 sin D-053) | §1: si cae o la aturden antes de actuar, pierde lo que costaba; no descansa. |

### 3.4 Tiradas (determinismo) [v0.5]
**Siguen siendo 24 por turno, fijas y en el mismo orden** (t1–t8 jitter por casilla, t9–t24 dos de varianza por casilla, v0.2 §11). Ninguna mecánica de v0.5 añade ni quita tiradas; el parser no cambia la fórmula.

Asignación de la varianza en una secuencia (las casillas de las ánimas caídas y la vacía tienen sus tiradas, que en v0.4 se descartaban):
```
L = [casilla de la última] ++ [las otras 3 casillas de su bando, en orden ascendente]
el movimiento j de la secuencia (j = 0, 1, 2) usa el par de varianza (a, b) de la casilla L[j]
  objetivo único → a;  área → a/b por índice en la fila (como v0.2 §5)
jitter: el de la casilla de la última (una sola tirada para todo el hueco)
```
Ejemplo: última en la casilla 3 → su 1.º movimiento usa la varianza de 3, el 2.º la de 1 y el 3.º la de 2. Así cada movimiento tiene tiradas independientes, el consumo no depende de la elección y los barridos siguen pareados. Con `ultima_anima.activo = false` la asignación es la de v0.4 (solo su casilla).

---

## 4. Lo que ve el jugador (previsión) [v0.5]
Pauta para el cliente (el diseño visual es suyo; textos con el vocabulario del jugador):
1. **Aviso de estado** al empezar el turno de un bando con una sola ánima: "Última ánima: puede encadenar sus movimientos de pago este turno (sin descanso)".
2. **Selección**: tocar el gratis deselecciona los pagos; tocar un pago deselecciona el gratis. Los pagos elegidos muestran su número de orden (1, 2, 3); volver a tocar uno lo quita y renumera. Un pago que ya no cabe en la energía restante se ve desactivado. Ningún botón de la última aparece en descanso.
3. **Contador**: energía del bando − Σ coste de la secuencia, en vivo.
4. **Orden previsto**: la secuencia es **una sola entrada** en la cola del turno (con el icono de prioridad si el primer movimiento la da), listando sus movimientos en orden.
5. **Riesgo (con `pago_al_confirmar`)**: texto fijo en la confirmación de cualquier plan con pagos: "La energía se gasta al confirmar: si el ánima cae o la aturden antes de actuar, se pierde". En el registro del turno, una cancelación muestra "−N de energía perdida".
6. **Registro**: cada movimiento de la secuencia es una línea propia, con "(2/3)" para que se lea que va seguido.

---

## 5. IA de referencia [v0.5]
- **Enumeración de la última**: opciones = {gratis} ∪ {subconjuntos no vacíos de sus pagos con Σ coste ≤ e} → **≤ 8 opciones** (1 + 7). Para cada subconjunto la IA prueba **todos sus órdenes** (≤ 6; en total ≤ 1 + 3 + 6 + 6 = 16 simulaciones, menos que las 64 de un bando con 3 ánimas) y se queda con el mejor.
- Cada orden se valora con la **función de siempre** (v0.2 §10.3 + cambios de v0.4 §8): simulación en orden, var = 1, KO que cambia la fila atacable, marca/condiciones vistas por los movimientos siguientes, `λ · min(e − Σcoste, c*, maximo − por_turno)` por lo que guarda.
- Desempate entre órdenes del mismo subconjunto con igual valor: el que da **mayor nivel de prioridad al hueco** (§3.1); luego el orden lexicográfico por índice de movimiento. Entre opciones: el de v0.2 (combinación menor).
- Descansos de la última: ignorados (§2.4). Sinergia de la última: 0.
- **La IA no modela D-054**: no descuenta el riesgo de que su ánima caiga o la aturdan antes de actuar (limitación conocida; si la energía perdida sale alta, es una mejora aparcable, no de esta versión).
- Sin tiradas, como siempre. La IA de búsqueda del criterio de profundidad debe enumerar también las secuencias (puede usar las 16 órdenes completas).

---

## 6. Cambios respecto a v0.4 (con energía 3)

| Tema | v0.4 (E3, D-052) | v0.5 | Clave |
|---|---|---|---|
| Acción cancelada (KO/aturdida antes de actuar) | se devuelve el coste | se pierde | `energia.pago_al_confirmar` |
| Última ánima viva al empezar el turno | 1 acción, con descanso | gratis solo **o** 1–3 pagos distintos seguidos, sin descanso | `variantes.ultima_anima.activo` |
| Hueco de la secuencia | — | uno; nivel del primer movimiento | `variantes.ultima_anima.prioridad_hueco` |
| Aturdir a la última antes de actuar | pierde su acción | pierde la secuencia (plan B: solo el 1.º) | `variantes.ultima_anima.aturdir` |
| Descanso pendiente al volverse última | — | se ignora | — |
| Varianza de la 2.ª y 3.ª acción de una secuencia | — | pares de las otras casillas del bando | — |
| Tiradas por turno | 24 | 24 | — |
| Sinergia | — | la última nunca suma (grupo de 1) | — |
| IA | ≤ 64 planes | última: ≤ 8 opciones × sus órdenes (≤ 16 simulaciones) | — |
| `version` | "0.4" | "0.5" | — |

## 7. Decisiones (para DECISIONES.md)

| # | Decisión | Alternativas descartadas |
|---|---|---|
| C22 | La secuencia ocupa un hueco con el nivel de prioridad de su primer movimiento (`prioridad_hueco = "primero"`) | Máximo (cualquier escudo arrastra todo; el orden deja de importar); mínimo (queda en config como respaldo); iniciativa por movimiento (D-056) |
| C23 | La última ignora también el descanso pendiente | Respetarlo un turno (le quita opciones justo en su turno de más energía; regla con excepción) |
| C24 | Varianza de los movimientos 2.º y 3.º: pares de las otras casillas del bando en orden | Reutilizar el par propio (mismo azar para dos golpes, correlación); tiradas extra (rompe las 24 fijas y el pareo) |
| C25 | Cancelación: un evento `cancel` por movimiento, con `lost` | Un evento por hueco (complica contar la energía perdida) |
| C26 | Plan B de aturdir (`"primero"`) también cuando el aturdimiento llega después de actuar: cancela el 1.º movimiento del turno siguiente | Perder el turno entero en ese caso (dos reglas distintas para el mismo estado) |
| C27 | IA: subconjuntos × todos sus órdenes, desempate por prioridad del hueco | Orden canónico sin evaluar (pierde marca → golpe y KO → reobjetivo) |

---

## 8. Nota para el núcleo [v0.5]
- **`version`**: admitir `"0.5"`; todo lo que hoy se exige o se rellena para `"0.4"` (`v04(is04, …)`) vale igual para 0.5 (`is04 = version === "0.4" || version === "0.5"`). En 0.5 las claves nuevas son **obligatorias**; en 0.2/0.4 se rellenan con los valores de regresión (`pago_al_confirmar = false`, `ultima_anima.activo = false`).
- **`onlyKeys`**:
  - `energia`: `["inicial", "por_turno", "maximo", "pago_al_confirmar"]` (bool).
  - `variantes`: añadir `"ultima_anima"`; dentro, `["activo", "aturdir", "prioridad_hueco"]`. Validación: `activo` bool; `aturdir ∈ {"turno", "primero"}`; `prioridad_hueco ∈ {"primero", "minimo"}`.
  - `escenarios_sim.configs_v05` y `criterios_sim.v05` son para el analista; el parser no los valida por dentro (como hoy).
- **Cambios en el motor** (todos tras su interruptor):
  1. `validatePlan`: varias entradas por actor solo si es última (§2.3); saltar el descanso de la última.
  2. `planSynergy`: **contar ánimas distintas**, no entradas (hoy contaría dos veces a la misma ánima: sería un fallo).
  3. Cola: una `Entry` por ánima con la lista de movimientos; nivel según `prioridad_hueco`; un solo jitter.
  4. Ejecución: bucle por movimiento con estado vivo; varianza por `L[j]` (§3.4); `acted = true` al empezar el primero.
  5. Cancelación: devolución condicionada a `!pago_al_confirmar`; con `aturdir = "primero"`, solo el primero. Eventos con `lost`.
  6. Descanso al final del turno: no marcar `usedSlot` de la última y no aplicarle los contadores mientras lo sea.
  7. `aturdir = "primero"` y `skipTurn`: la última con `skipTurn = t` sigue siendo elegible y se le cancela el 1.º movimiento.
- **Tests pedidos**: (a) vector dorado v0.4 E3 con las dos claves a `false` → idéntico; (b) secuencia de 3 pagos con KO de la delantera rival en el 1.º → el 2.º va a la trasera; (c) aturdida antes de su hueco, con y sin `pago_al_confirmar`, `"turno"` y `"primero"`; (d) energía extra en el 1.º no permite un plan que la necesite; (e) `planSynergy` con tres entradas de la misma ánima → bonus 0; (f) el consumo de rng es 24 por turno en todos los casos; (g) descanso pendiente ignorado al volverse última; (h) plan con gratis + pago o con pago repetido → inválido → gratis.

---

## 9. Criterios de simulación (para el analista) `[criterios_sim.v05]`, `[escenarios_sim.configs_v05]`

### 9.1 Configs (pareadas)
Mismos equipos C1 y **semillas nuevas** (`[escenarios_sim.configs_v05.semillas_prefijo]` = `"v05|"`; no usar `miguelE3`), un solo juego de semillas, sin barridos (D-057):

| Config | `pago_al_confirmar` | `ultima_anima.activo` |
|---|---|---|
| `base_E3` | false | false |
| `solo_D053` | false | true |
| `solo_D054` | true | false |
| `ambas` | true | true |
| `ambas_aturdir_primero` (condicional, §9.4) | true | true, `aturdir = "primero"` |

### 9.2 Métricas
En las 4 configs, **todos los criterios de `[criterios_sim.v04]`** (primer KO, líder en el turno 3, turnos media/p90/empates, % gratis, pagos distintos por ánima, familias C2 en banda, profundidad), y además:

| Métrica | Definición |
|---|---|
| Pagos por turno de la última | media de movimientos de pago por turno en que actúa una última ánima (el gratis cuenta 0); y su reparto 0/1/2/3 |
| Energía de la última | energía media del bando al empezar sus turnos como última |
| Energía perdida por partida | media por partida, separada en **por caer** y **por aturdir**, y la parte que corresponde a últimas ánimas |
| Remontadas | % de partidas con al menos un KO que gana el bando que **sufrió** el primer KO |
| WR de la última | % de partidas en que un bando se queda con una sola ánima y aun así gana (`[ultima_wr_inf]`, informativo) |
| Huecos con prioridad | % de secuencias de la última cuyo hueco tiene nivel 1 (vigila el abuso de §3.1) |

### 9.3 Qué es "mejora la bola de nieve"
Una config **mejora la bola de nieve** si, frente a `base_E3` con las mismas semillas, cumple **las cuatro**:
1. primer KO baja al menos `[bola_nieve_primer_ko_baja_min_pp]` = 2,0 pp;
2. líder en el turno 3 no sube más de `[bola_nieve_lider_t3_sube_max_pp]` = 1,0 pp;
3. remontadas suben al menos `[bola_nieve_remontadas_sube_min_pp]` = 1,5 pp;
4. duración dentro de `criterios_sim.v04` (media 6–10, p90 ≤ 14, empates ≤ 3 %) y empates no suben más de `[bola_nieve_empates_sube_max_pp]` = 1,0 pp.

Lectura: D-053 está pensada para cumplirla (`solo_D053`). D-054 no busca mejorarla, sino premiar leer al rival: para D-054 se mide que **no la empeore** demasiado (primer KO sube ≤ `[d054_primer_ko_sube_max_pp]` = 1,5 pp en `solo_D054`) y que la profundidad (IA de búsqueda vs reglas) no baje más de `[d054_profundidad_baja_max_pp]` = 3 pp. Si falla, se informa al director (D-054 es de Miguel; no se cambia en la spec).

### 9.4 Plan B de aturdir (D-056 (3))
Se corre `ambas_aturdir_primero` **solo si** `ambas` no mejora la bola de nieve mientras `solo_D053` sí, **o** si la energía perdida por aturdir a últimas ánimas supera 1,0 por partida con última aturdida. Se recomienda `"primero"` si baja el primer KO de `ambas` al menos `[plan_b_aturdir_mejora_min_pp]` = 1,0 pp.

### 9.5 Rangos informativos y estimación a mano (no Monte Carlo)
| Métrica | Rango informativo | Estimación |
|---|---|---|
| Pagos por turno de la última | `[ultima_pagos_por_turno_inf]` 1,2–2,0 | ≈ 1,4–1,8: con E = 3 y una sola ánima, en v0.4 llega a última con ≈ 6–10 de energía acumulada y el primer turno puede lanzar 2–3 pagos; después ≈ 1,2 (3 de energía / coste medio ≈ 2,4). Por encima de 2,0, la última es una "bomba" y conviene vigilar el WR de la última. |
| Energía perdida por partida | `[energia_perdida_por_partida_inf]` 0,5–3,0 | ≈ 1–2 (≈ 4 KO por partida, ≈ 35 % sin haber actuado y con pago comprometido de ≈ 1,5 de media; aturdir ≈ 0,3) |
| Primer KO | — | `solo_D053`: −2 a −5 pp (solo pesa en finales 1 contra 2 o 3); `solo_D054`: +0,5 a +1,5 pp (la energía perdida es casi siempre del bando que ya pierde un ánima); `ambas`: −1 a −4 pp. **Riesgo**: que `solo_D053` no llegue a −2 pp si la mayoría de partidas ya están decididas cuando aparece la última. |
| Duración | — | `solo_D053`: −0,2 a −0,5 turnos (finales más rápidos); `solo_D054`: ≈ igual |
| % gratis | — | baja algo con D-053 (la última deja de usar el gratis por falta de opciones); el incumplimiento aceptado en D-052 seguirá |

---

## 10. Pendiente de validar en simulación
1. §9 completo en las 4 configs (y la 5.ª si toca).
2. Si "huecos con prioridad" sale alto (> 50 % de las secuencias) y la última gana mucho, probar `prioridad_hueco = "minimo"` (cambio de config, sin núcleo).
3. Si el WR de la última pasa de 0,35, la secuencia es demasiado fuerte: palanca natural, limitar a 2 pagos por turno (clave nueva; sería pregunta para Miguel porque D-053 no fija tope).
4. Energía perdida por D-054 con una IA que no la modela: si es alta, valorar una corrección de IA (aparcable).

## 11. Preguntas abiertas (para el director)
Ninguna choca con D-053–D-057. Matices que quizá Miguel quiera ver, sin bloquear la implementación:
1. **Prioridad del hueco (§3.1).** Con `"primero"`, una última que abre con un escudo mete también sus golpes con prioridad. Lo veo coherente con D-053 (ayuda al que va perdiendo) y queda en config, pero es una ventaja nueva que el jugador notará. Opciones: (a) `"primero"` (recomendado), (b) `"minimo"`.
2. **Plan B de aturdir cuando llega después de actuar (C26).** D-056 describe el plan B solo para "aturdida antes de actuar"; lo he extendido al aturdimiento que se arrastra al turno siguiente para no tener dos reglas. Solo importa si se activa el plan B.
