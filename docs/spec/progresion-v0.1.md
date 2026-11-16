# Especificación de progresión v0.1 — colección, atrapar, niveles y resonancia (Fase 2, paso 1)

Estado: propuesta para revisión, **actualizada con D-068** (respuestas de Miguel; ver §14). Autor: Diseñador de sistemas. Fecha: 2026-11-16.
Primera versión (todo es **[v0.1]**). Configuración: `config/progresion.v0.1.json` (**CFG**); cita `[ruta]`. Si no coinciden, **manda CFG**.
Usa sin cambiarlas: `genetica-v0.2` (**GEN**), la gramática de `movimientos-v0.2` + `movimientos-v0.4` con el catálogo `movimientos.v0.5.json` (**MOV**, D-069) y `combate-v0.5` (**COM**). **No cambia ninguna regla de combate**: amplía el motor a bandos de 1 a 3 ánimas (D-068, §2.2) con 3 contra 3 idéntico al de hoy.
Decisiones que manda: D-062, D-065, D-066, D-067, **D-068**, D-063 (vocabulario), D-008, D-010, D-011, D-016, D-029 B, D-036 y D-049 (fuera del paso 1).

Notación: `u` = `rng.next()` (1 tirada). `r2(x)` = `Math.round(x·100)/100`. `clamp(x,a,b)`. Solo `+ − * /`, comparaciones y `Math.round/floor/min/max/abs` (sin `**`, `pow`, `sqrt`, `log`, `exp`, trigonométricas). Las cifras marcadas **(estimación)** salen de un Monte Carlo a mano de la economía (sin combate real, victorias supuestas); las valida el analista (§9).

---

## 0. Resumen

| Pieza | Regla v0.1 |
|---|---|
| Inicio | El hechicero Arnal (santuario), 5 líneas de texto; eliges 1 de 3 ánimas puras (Llama, Marea, Brote) de nivel 1 y le pones nombre |
| Encuentros | Tu equipo (1–3) contra 1–3 salvajes, mismo motor v0.5; 3 zonas como datos; las salvajes juegan "por instinto" |
| Atrapar | Tras ganar, un farol por intento, % visible antes de lanzar, 2 intentos como máximo por salvaje; faroles: 5 al empezar, +1 por victoria, tope 10 |
| Niveles | 1–30 por experiencia (tabla entera); 3.er movimiento a nivel 3, madurar a nivel 5, 4.º movimiento a nivel 10; **a nivel 15, 20, 25 y 30 se elige una de dos variantes** de un movimiento con el mismo presupuesto (§4.5, D-068); premio menor: revelar genes ocultos. **Nunca estadísticas** |
| Resonancia | Dos ánimas maduras, coste 6 + (ecos previos de ambos) de esencia, máximo 5 ecos por ánima (GEN), el eco nace a nivel 1 |
| Colección | Hasta 100 ánimas, equipo de 3, liberar a cambio de un poco de esencia (D-068, §6.2); Codex de genes |
| Hueco D-067 | 4 huecos de movimiento por ánima; cada hueco apunta a un gen (locus) o, en el paso 2, a una habilidad. La genética no cambia |
| Guardado | `localStorage`, formato versionado; todo el azar de `createRng(semilla de partida | flujo | contador)` |

---

## 1. Bucle de una sesión (10–20 min)

### 1.1 Primera sesión (≈ 15–18 min, estimación)
| Min | Qué hace el jugador | Qué consigue |
|---|---|---|
| 0–2 | Nueva partida → santuario: el hechicero habla (§1.2) → elige 1 de 3 ánimas (§1.3) → le pone nombre | 1 ánima nivel 1 (gratis + 1 de pago), 5 faroles, 30 de esencia |
| 2–5 | Prado de la Linde: 2 combates con el acompañante del hechicero (§2.4). Gana, lanza farol, atrapa su 2.ª ánima y la nombra | El acompañante se despide; la inicial llega a nivel 3: **3.er movimiento** |
| 5–10 | 2–3 combates más con su equipo de 2–3. Atrapa | La inicial **madura** (nivel 5): se abren las Marismas Quietas |
| 10–16 | Marismas (salvajes de nivel 5–10, ya maduras al atraparlas). Vuelve al santuario y **resuena** por primera vez: ve a los padres, el eco y de dónde viene cada gen | 1–6 resonancias (mediana 6, estimación) |

### 1.2 Historia mínima (texto provisional, `[mundo.personajes]`)
Arnal, farolero del santuario:
1. «Llegas tarde. Las ánimas llevan tres noches sin dejarme dormir.»
2. «Son ánimas errantes: chispas sueltas desde que se rompió el Gran Farol. No son almas de nadie; solo tienen mucho carácter.»
3. «Sin un guardián se aburren. Y aburridas, muerden.»
4. «Elige una. Te seguirá, te desobedecerá a ratos y, si la cuidas, resonará con otras y dejará ecos.»
5. «Toma estos faroles. Lo demás lo aprenderás perdiendo.»

Cumple el aviso de `vocabulario.md`: ánimas errantes que se vinculan a guardianes, no almas de personas. **Nombres provisionales (D-068):** Arnal, el Gran Farol, Prado de la Linde, Marismas Quietas y Cantil del Farol Roto; en CFG llevan `"provisional": true` y se cambian sin tocar reglas.

### 1.3 Las tres iniciales `[mundo.iniciales]`
- Familias `llama`, `marea`, `brote`; `salvaje(rng_k, familiaForzada, puro = true)` de GEN §2.2, con `rng_k = createRng(semilla | "inicial" | k)`, k = 0, 1, 2 (205 tiradas cada una). Nivel `[niveles.nivel_inicial]` = 1.
- Puras para que se lean a la primera como "una Llama, una Marea, un Brote"; la variedad de genes ocultos llega al resonar con capturas. Pureza (calidad) normal: dos partidas tienen iniciales distintas.
- Las tres se generan siempre (consumo fijo); las dos no elegidas desaparecen.

### 1.4 Nombres
Cada ánima nueva (inicial, atrapada o eco) recibe un nombre por defecto `prefijo + sufijo` `[nombres]` con 2 tiradas del flujo `nombre|<nacimiento>`, y el jugador lo puede cambiar (máx. `[coleccion.nombre_max_caracteres]` = 16). La pantalla de "atrapada" y la de "eco" piden nombre con el sugerido escrito.

### 1.5 Sesión típica (2.ª y siguientes, estimación)
Elegir zona → combate (1,5–2 min) → atrapar → repetir 5–6 veces → santuario → resonar 6–10 veces (≈ 40 s cada una) → reordenar equipo. Con el modelo del §9: **resonancias acumuladas tras 3 sesiones de 6 combates: mediana 23, p10 17, p90 28**; el favorito llega a **nivel ≈ 20** (p10 17). Cumple el hito D-066 (20 resonancias y un ánima de nivel alto en 3 sesiones) con margen pequeño: lo debe confirmar el analista con combate real.

---

## 2. Encuentros salvajes

### 2.1 Zonas (datos) `[mundo.zonas]`
| Zona (`id`) | Nivel salvajes | Grupo 1/2/3 | Familias (peso) | Se abre cuando |
|---|---|---|---|---|
| Prado de la Linde (`prado_linde`) | 1–3 | 70/30/0 % | brote, marea, llama (1 c/u) | siempre |
| Marismas Quietas (`marismas_quietas`) | 5–10 | 30/50/20 % | marea, roca, voltio (1), brote (0,5) | un ánima tuya llega a nivel 5 |
| Cantil del Farol Roto (`cantil_farol_roto`) | 10–16 | 10/60/30 % | sombra, voltio, roca (1), llama (0,5) | un ánima tuya llega a nivel 10 |

- Desbloqueo: `max(nivel de tus ánimas, nivel_max_alcanzado) ≥ desbloqueo_nivel`. Se guarda `nivel_max_alcanzado` para que liberar no cierre zonas.
- Las seis familias base aparecen; las **híbridas y los genes mutados no salen nunca en estado salvaje** (GEN §2): solo por resonancia. Es el gran incentivo para resonar.
- **Rareza**: la de GEN (familia de cada gen, D 70 % de la familia principal, pureza triangular: P(pureza ≥ 90 %) ≈ 2 %). No hay "rareza" aparte en el paso 1.
- Formato pensado para el paso 2: cada zona es un registro con `id`; la escena ilustrada solo añade presentación (puntos tocables) que apunta a esos `id`.

### 2.2 Formato del combate `[combate_salvaje]`
- **Tu equipo de 1 a 3 contra un grupo de 1 a 3 salvajes**, con el motor de COM (v0.5: energía compartida 3/turno, última ánima, energía pagada al confirmar). Las reglas de 3 contra 3 no cambian.
- **Extensión de tamaño (D-068)**: cada bando tiene `n ∈ [tamano_min, equipo.tamano]` = 1..3 ánimas, cada uno el suyo. Colocaciones permitidas por tamaño `[colocaciones_por_tamano]`: 1 → "1+0"; 2 → "2+0" o "1+1"; 3 → las de COM ("2+1", "1+2"). La IA salvaje coloca con `[colocacion_ia_por_tamano]` (1 → casilla 1; 2 → casillas 1 y 2; 3 → regla de COM §7). Un bando de 1 es "última ánima" desde el turno 1 (COM §2.1).

**Qué cambia en el motor (solo código, ninguna regla):**
| Pieza | Hoy | Con la extensión |
|---|---|---|
| `createBattle` | exige `teamA.length = teamB.length = teamSize` | acepta 1..`teamSize` por bando; las casillas sin ánima ya se crean como hoy la casilla vacía (`null`, `ko: true`) |
| `validatePlacement` / `allPlacements` | longitud = `teamSize`, formas de `equipo.colocaciones` | reciben `n`; formas de `colocaciones_por_tamano[n]` (para n = 3, las mismas de COM) |
| `referencePlacement` (IA) | regla de COM §7 | n = 3: igual; n < 3: `colocacion_ia_por_tamano[n]` |
| Respaldo de colocación inválida | regla de la IA | igual, con la de su tamaño |
| Tiradas | 24 por turno, por casilla | **sin cambio** (jitter y varianza indexados por casilla 1–4; las vacías consumen igual) |
| Fin de partida, última ánima, sinergia, objetivo automático | por casillas vivas | sin cambio: ya tratan casillas vacías como apagadas. Sinergia con n < 3: solo cuenta lo que haya (claves 2..n) |
| Parser de COM | `equipo.tamano` = tamaño fijo | `equipo.tamano` = **máximo**; las formas por tamaño viven en CFG `combate_salvaje` (COM no se edita) |

**Condición de no regresión (obligatoria):** con dos bandos de 3, el motor ampliado da **exactamente** el mismo resultado que hoy: mismos eventos, mismo estado final, mismo consumo de tiradas, para cualquier semilla y plan. Se comprueba con (a) todos los tests y vectores dorados actuales de combate sin modificar, y (b) un test nuevo que juega ≥ 200 partidas 3 contra 3 con semillas fijas (IA de referencia por los dos lados) y compara el hash canónico de cada registro con el obtenido con el motor anterior (hashes guardados antes del cambio). Si un solo hash difiere, la extensión no se acepta. Nota: el núcleo debe revisar si algún índice de `Action.actor` o de sinergia (`team[a.actor − 1]`) supone 3 ánimas en orden de equipo.
- Antes del combate se elige colocación como en COM (el cliente propone la última usada).
- **Al terminar, todas las ánimas recuperan la vida** `[curacion_tras_combate]` ("vuelven al farol"). No hay objetos de curación.
- El jugador puede **huir** antes del turno 1 o en cualquier turno: sin recompensa ni castigo.
- Las salvajes usan los movimientos que les da **su nivel** (§4.3): una de nivel 1–2 tiene 2 botones; de 3–9, 3; de 10 en adelante, 4.

### 2.3 Generación de un encuentro (determinista)
Flujo `rng = createRng(semilla | "encuentro" | n)`, `n` = `contadores.encuentros` (se incrementa **al empezar** el encuentro y se guarda en ese momento: recargar no repite el mismo encuentro ni permite elegir).
```
g  = 1 + weightedIndex(zona.grupo_pesos)              // 1 tirada
para i en 0..2 (siempre 3, consumo fijo):
  fam_i = weightedIndex(zona.familias_pesos)            // 1 tirada (orden de claves de CFG)
  niv_i = zona.nivel_min + floor(u · (nivel_max − nivel_min + 1))   // 1 tirada
  cri_i = salvaje(rng, fam_i, puro = false)             // 205 tiradas (GEN §2.2)
grupo = cri_0..cri_{g−1}
```
**622 tiradas por encuentro** `[mundo.encuentro.tiradas_por_encuentro]` = 1 + 3·(2 + 205); el parser valida la fórmula `[validacion_config.formula_tiradas_encuentro]`. El combate usa otro flujo: `createRng(semilla | "combate" | n)` con el mismo `n`.

### 2.4 Acompañante del hechicero `[mundo.acompanante]`
Mientras tengas menos de 2 ánimas, una ánima del hechicero (Sombra, nivel 10, fija para todas las partidas: `salvaje(createRng("acompanante|v0.1"), "sombra", puro = true)`) lucha en tu equipo. No recibe experiencia, no se atrapa, no resuena y no aparece en la colección. Motivo: sin ella, el primer combate sería 1 contra 1 con los mismos botones, casi a cara o cruz; perder el primer combate antes de atrapar nada es la peor entrada posible.

### 2.5 IA salvaje "instinto" `[ia_salvaje]`
Cada salvaje, en orden de equipo, elige el movimiento de pago **más caro** que pueda pagar con la energía que dejan las anteriores y que no esté descansando (empate: hueco menor); si no puede, su gratis. Nunca ahorra; si es la última ánima, usa un solo movimiento. Sin tiradas. Es más floja que la de referencia (ahorrar compensa, D-021) y **legible**: el jugador aprende que las salvajes "gastan en cuanto pueden". Plan B por config: `modo = "referencia"`.

---

## 3. Atrapar `[atrapar]`

### 3.1 Cuándo
Solo tras una **victoria**. Cada salvaje del grupo (todas se han apagado) puede recibir hasta `[intentos_max_por_salvaje]` = 2 faroles, en el orden que elija el jugador, mientras le queden faroles. Si la colección está llena (§6) no se puede lanzar.

### 3.2 Probabilidad (visible antes de lanzar)
```
fv   = Σ vida actual / Σ vida máxima de TU equipo al acabar (apagadas cuentan 0; el acompañante no cuenta)
dn   = max(0, nivel_salvaje − nivel máximo de tu equipo)
pur  = (calidadCriatura − 85,5) / 9            // ∈ [0,1], lo que el jugador ve como "pureza %"
p1   = r2(clamp(0,60 + 0,25·fv − 0,05·dn − 0,15·pur, 0,25, 0,95))
p2   = r2(min(0,95, p1 + 0,20))                // segundo farol a la misma salvaje
atrapada si u < p                               // 1 tirada, flujo createRng(semilla | "farol" | k)
```
`k` = `contadores.faroles` (se incrementa en cada lanzamiento). Ejemplos (estimación): victoria limpia (fv 0,8) contra pureza media (0,5) del mismo nivel → p1 ≈ 0,72, p2 ≈ 0,92. Victoria apurada (fv 0,2) contra pureza alta (0,95) → p1 ≈ 0,51, p2 ≈ 0,71.

Lectura: **ganar con holgura** sube la probabilidad (premia jugar bien); una salvaje **más pura** cuesta algo más (la rareza vale algo) pero nunca es imposible; las salvajes de más nivel que tu equipo cuestan más.

### 3.3 Faroles `[recursos]`
5 al empezar, **+1 por victoria**, tope 10. Sin tienda, sin moneda, sin espera por reloj. La escasez aparece en Marismas y Cantil, donde ganas a 2–3 salvajes y solo puedes intentar con 1–2: **elegir a cuál** es la decisión.

### 3.4 Sin trampa de caja de botín
- El % exacto se muestra **antes** de lanzar; no hay "casi" ni animaciones de suspense alargado (nota para el cliente: el farol tiembla una vez y se resuelve).
- Lo que se arriesga es visible: genes D, familia y pureza de la salvaje se ven al acabar el combate.
- El reintento sube la probabilidad (protección contra la mala racha) y no se paga con nada que se compre.
- Los faroles **no se venden por dinero** en el paso 1 (ver alternativas).

### 3.5 Si se escapa
Desaparece; el farol se pierde. Las demás salvajes del grupo siguen disponibles.

---

## 4. Experiencia y niveles

### 4.1 Curva `[niveles]`
Nivel derivado de `anima.xp` (experiencia total, entero): el mayor `L` con `xp ≥ xp_total[L−1]`. Tabla entera (autoridad); fórmula de referencia `xp_total(L) = 5·(L−1)·(L+2)` (subir de L a L+1 cuesta 10·L + 10).

| Nivel | 2 | 3 | 5 | 8 | 10 | 15 | 20 | 25 | 30 |
|---|---|---|---|---|---|---|---|---|---|
| XP total | 20 | 50 | 140 | 350 | 540 | 1190 | 2090 | 3240 | 4640 |

Tope `[niveles.nivel_max]` = 30: la experiencia por encima de 4640 se descarta.

### 4.2 Ganar experiencia `[experiencia]`
- Por cada salvaje apagada: `xp = 15 + 5·nivel_salvaje` (nivel 2 → 25; nivel 8 → 55; nivel 13 → 80).
- **Victoria:** cada ánima de tu equipo (también las apagadas) recibe la **suma entera**, sin dividir. Motivo: llevar un eco recién nacido en el equipo debe hacerlo crecer al ritmo de los demás; dividir castigaría usar ecos, que es justo lo que queremos.
- **Derrota:** `floor(0,5 · suma de las salvajes que sí se apagaron)`. **Huida:** 0.
- Ritmo (estimación): ~33 XP por combate en el Prado, ~100 en Marismas, ~175 en el Cantil. **Nivel 30 a los ~42 combates del favorito** (≈ 7 sesiones).

### 4.3 Qué da cada nivel (nunca estadísticas, D-029 B) `[desbloqueos]`
| Nivel | Desbloqueo |
|---|---|
| 1 | Hueco gratis (gen de extremidades) + hueco de pago 1 (gen de **cola**) |
| 3 | Hueco de pago 2 (gen de **cabeza**): 3.er movimiento |
| 5 | **Madura**: puede resonar |
| 10 | Hueco de pago 3 (gen de **cuerpo**): 4.º movimiento, kit completo |
| **15, 20, 25, 30** | **Elegir una de dos variantes** de un movimiento (§4.5): 15 → cola, 20 → cabeza, 25 → cuerpo, 30 → gratis (extremidades) |
| 8, 11, 14, 17, 20, 23, 26, 29 | Premio menor: se **revela un gen oculto** (§4.4) |
| 30 | Nivel máximo (todos los ocultos revelados) |

- Por qué la cola primero: MOV §3 garantiza que el movimiento de cola es **siempre ofensivo con alcance o área**; así un ánima recién nacida siempre puede hacer daño real. Cabeza y cuerpo pueden ser protección o curación.
- Por qué el kit completo a nivel 10 y no a 30: desde el nivel 10 dos ánimas con los mismos genes tienen **los mismos botones y la misma fuerza**; las variantes de 15–30 solo cambian la forma de los movimientos con el mismo presupuesto (§4.5), así que la progresión no rompe el futuro PvP (D-008). El 4.º movimiento llega en la 2.ª sesión para el favorito y en 4–5 combates del Cantil para un eco.
- Ánimas atrapadas: entran con su nivel y todo lo que ese nivel desbloquea (una salvaje de nivel 12 llega con 4 movimientos, madura y con 2 ocultos revelados).
- **Ecos al nacer: nivel 1** `[niveles.nivel_eco_al_nacer]`, gratis + cola. Crece contigo: es el apego.

### 4.4 Revelar genes ocultos `[desbloqueos.revelar_ocultos]`
Al alcanzar el nivel `niveles[i]` se revela la posición `orden[i]` (cabeza.R1, cuerpo.R1, extremidades.R1, cola.R1, después los R2). Además (§5.3), al resonar se revela el oculto de un padre que haya pasado a ser D del eco. Revelar no cambia nada del ánima: la ficha muestra ese gen y lo registra en el Codex. Sirve para resonar con intención (GEN §3: los ocultos salen como D del eco con baja probabilidad y pasan a los ocultos del eco a menudo). Es el premio menor de los niveles altos; el mayor son las variantes (§4.5).

### 4.5 Variantes de movimiento (D-068) `[variantes]`
**Qué es.** A nivel 15, 20, 25 y 30 `[variantes.niveles]` el jugador elige una de **dos variantes** del movimiento de gen de un locus fijo `[variantes.locus_por_nivel]`: 15 → cola, 20 → cabeza, 25 → cuerpo, 30 → extremidades (el gratis, al final porque tiene menos margen). Una variante es el **mismo movimiento con una pieza cambiada**: mismo arquetipo, mismo escalable, mismo coste de energía y mismo presupuesto, y **nunca más potencia** que el original.

**Generación (determinista, desde el gen y el nivel).** Sea `M` el movimiento de gen del D del locus (MOV, con su sal si la tiene; para genes mutados, igual). Se enumeran candidatos cambiando **una sola pieza** de `M`, sobre tres ejes en este orden `[variantes.ejes]`:
| Eje | Alternativas (en el orden de MOV `orden_*`) |
|---|---|
| modificador | cada modificador permitido para el arquetipo (MOV 2.6), incluido "ninguno" |
| estado | cada estado permitido para el arquetipo (aturdir solo con c ≥ 3), incluido "ninguno" si el arquetipo lo admite |
| condicion | cada condición, incluida "ninguna" |
Se respetan las restricciones del locus: **cola** solo admite modificadores que mantengan alcance o área (MOV §3); **extremidades** solo piezas de `gratis` (estados de coste ≤ 1, modificadores alcance/drenaje); **provocar** y la energía extra no se tocan (no son eje). Cada candidato se ensambla con `presupuesto[c]` de `M` con la fórmula de MOV §4.1 **sin respaldo** (si no cabe, se descarta) y es válido si:
1. cumple las reglas de validez de MOV §3 (incluido `fraccion_minima`);
2. difiere de `M` en exactamente esa pieza;
3. `potencia(candidato) ≤ potencia(M)` (por objetivo) `[variantes.potencia_max_relativa]` = 1. Con área, la potencia por objetivo baja (factor 1,75 sobre el presupuesto): llegar a más ánimas no es "más fuerza" según D-068.

Con la lista ordenada `C` (eje, luego orden de la pieza en MOV), `n = |C|`, y `rng = createRng("var|v0.1|" + clave del gen + "|" + nivel)`, **2 tiradas fijas** `[variantes.tiradas]`:
```
u1, u2 = rng.next(), rng.next()                          // siempre las 2
si n = 0: el nivel pasa al siguiente locus en orden_respaldo (cola, cabeza, cuerpo, extremidades) que tenga n ≥ 1 y no tenga ya variante; si ninguno: el nivel solo da su revelación (si toca) — total y sin tiradas extra
A = C[floor(u1·n)]
R = candidatos de C con eje ≠ A.eje; si R vacío, R = C sin A
B = R vacío ? M (opción "mantener") : R[floor(u2·|R|)]
```
Así las dos opciones suelen tocar ejes distintos («más alcance» frente a «otro estado»), que es una decisión de verdad. La semilla incluye el nivel para que el respaldo a otro locus dé otro sorteo.

Ejemplos (ilustrativos, el núcleo da los reales): un golpe de cola coste 3 (presupuesto 30) con alcance (1 punto; potencia 145) → A: «área» en lugar de alcance (potencia 85 por objetivo, toda la fila) / B: añade «objetivo_con_estado» (potencia 120; 180 si el objetivo tiene un estado). Una protección de cabeza coste 2 con prisa → A: estado «regenerar» (escudo menor) / B: «área» (escudo a toda la fila, menor por ánima).

**Elección y cambio.** La elección entre A y B es **definitiva** para esa ánima (le da identidad: dos ánimas con los mismos genes pueden acabar distintas). Lo que sí se puede cambiar en el santuario, gratis y cuantas veces se quiera, es **usar la variante elegida o el movimiento original** en su hueco (encaja con el hueco de D-067: la variante es una entrada más del repertorio). Así no hay elección-trampa: elegir mal nunca deja peor que antes. Alternativa descartada: elección reversible entre A y B (se pierde la identidad y la decisión pesa poco); elección definitiva sin poder volver al original (castiga probar).

**Herencia.** Las variantes son estado **del ánima**, no del genoma: `breed` no las ve y **los ecos no las heredan** (nacen con los movimientos originales de sus genes). Mismo principio que las habilidades enseñables (D-036).

**Balance.** Mismo presupuesto con los precios medidos de MOV: en teoría neutro. Riesgo conocido: los precios de MOV se midieron en promedio y algunas piezas pueden rendir más en ciertos kits (p. ej. aturdir o área en un equipo concreto). Se mide en §9 (espejo con y sin variantes).

---

## 5. Resonancia en el juego `[resonancia]`

### 5.1 Requisitos
Dos ánimas distintas de tu colección, las dos **maduras** (nivel ≥ 5) y con menos de 5 ecos (GEN `limites_sim.max_crias_por_criatura`), y esencia suficiente. La edad mínima de GEN (`nacimiento` de la cría − del padre ≥ 1) se cumple siempre porque `nacimiento` es el contador de ánimas (§7). No hace falta que estén en el equipo.

### 5.2 Coste
`coste = 6 + 1·(ecos previos de A + ecos previos de B)` de esencia: de 6 a 14. Sube con el uso para empujar a resonar con ánimas distintas, sin castigar.
Esencia `[recursos]`: 30 al empezar; por cada salvaje apagada en victoria, `4 + floor(nivel/2)` (≈ 6,5 por combate en el Prado, ≈ 14 en Marismas, ≈ 23 en el Cantil); liberar (§6.2). Tope 999. Con este ritmo la esencia es el freno principal de la resonancia (estimación: sobran ≈ 7 al final de la 3.ª sesión): un combate ≈ una resonancia y media en Marismas.

### 5.3 Resolución
```
(A, B) = las dos elegidas;  n = contadores.nacimientos + 1
rng = createRng(semilla | "resonancia" | contadores.resonancias)
r = breed(A.criatura, B.criatura, rng, GEN, { id: idAnima(n), birth: n })     // 280 tiradas (GEN §3.2)
eco = nueva ánima { criatura: r.child, nivel 1, xp 0, huecos por defecto (§8), nombre por defecto (§1.4) }
A, B ← r.parent1/2 (crias + 1);  esencia −= coste;  contadores.resonancias++, nacimientos = n
revelar en el padre de origen cada slot R1/R2 que r.trace use como D del eco
Codex ← claves de los 4 D del eco; mutaciones nuevas (r.mutations, matchesCatalog = false) como "descubierta por ti"
```

### 5.4 Qué ve el jugador
- **Antes** (pantalla de resonancia): los dos padres, sus D por zona del cuerpo (D-048: un gen = una zona), ecos restantes de cada uno (●●○○○), coste, y por zona la probabilidad de cada origen del D, calculada de `pesos_D` de GEN: «≈ 47 % de A · ≈ 47 % de B · ≈ 6 % sorpresa (oculto o mutación)». Honesto y legible.
- **Después**: el eco con sus 4 zonas; en cada una, una etiqueta de origen: «de A», «de B», «oculto de A» (sorpresa), «¡mutación!». Si la familia del eco es híbrida o hay mutación nueva, aviso propio («Nuevo en el Codex»). Pureza del eco y pedir nombre.
- Nunca se muestran números de estadísticas (D-008: el valor no es de estadísticas); sí pureza, familia, movimientos.

### 5.5 Ritmo (estimación, §9)
Resonancias acumuladas: mediana 6 / 14 / 23 tras las sesiones 1 / 2 / 3. Los padres sobran (≈ 13 capturas maduras × 5 ecos ≫ 40 usos); el freno es la esencia, a propósito: une combatir y resonar. Si el analista ve que la mediana baja de 20, el primer ajuste es `coste_base` 6 → 5 (luego `esencia_inicial`).

---

## 6. Colección, Codex y equipo `[coleccion]`

### 6.1 Colección y equipo
- Hasta `[tamano_max]` = 100 ánimas (estimación: ≈ 36 tras 3 sesiones). Llena: no se puede lanzar farol ni resonar hasta liberar.
- **Equipo**: de 1 a 3 ánimas de la colección, en orden (el orden es el de la colocación propuesta). Se cambia fuera de combate. La inicial no tiene nada especial salvo su historia.
- Ficha de un ánima: nombre, familia, nivel y XP hasta el siguiente, pureza, aspecto, sus botones (los bloqueados con «nivel 3» / «nivel 10»), genes D y ocultos revelados (los demás como «?»), ecos (●●○○○), padres (si es eco) y origen («Atrapada en Marismas Quietas», «Eco de Brix y Luma», «Elegida en el santuario»).

### 6.2 Liberar `[coleccion.liberar]` (D-068: sí)
Con confirmación, irreversible. Da `1 + floor(nivel / 5)` de esencia (nivel 1–4 → 1; 10 → 3; 30 → 7). No se puede liberar la última ánima ni una del equipo. Si un ánima liberada es padre de otra, su ficha mínima queda en `linaje` (§7) para seguir mostrando la familia.

**Por qué no se puede explotar:**
- *Resonar para liberar:* un eco nace a nivel 1 y vale 1; la resonancia más barata cuesta 6. Para que un eco valga ≥ 6 hay que subirlo a nivel 25 (3240 XP, ≈ 25 combates), que por sí mismos dan ≈ 400 de esencia. Pérdida siempre en términos relativos.
- *Atrapar para liberar:* cada captura cuesta un farol (1 por victoria) y una salvaje del Cantil (nivel 10–16) vale 3–4, frente a ≈ 23 que da el propio combate: +15 % como mucho, y a cambio de un farol que no se usa para atrapar algo mejor. Es un extra pequeño, no una fuente.
- Tope de inventario `esencia_max` = 999 igual que siempre.
- Criterio de simulación (§9): la esencia de liberar ≤ 15 % de la total con la estrategia "libera todo lo que no use".

### 6.3 Codex
Registro local de identidades de gen (GEN §8: clave `familia|locus|firma`): 72 base + las mutadas que encuentres. Un gen entra en el Codex cuando lo ves como D en un ánima **tuya** (inicial, atrapada o eco) o se revela como oculto. Las mutaciones nuevas se marcan «descubierta por ti» con el número de resonancia. El Codex muestra también las 13 familias (vistas o no). En el paso 3, la entrada global de Genedex (con nombre del descubridor) llegará con el servidor.

---

## 7. Guardado `[guardado]`

### 7.1 Estado mínimo (formato `genoma-partida`, `version_formato` = 1)
```
{
  formato: "genoma-partida", version: 1,
  semilla: string,                          // la crea el cliente al empezar (crypto); es lo único no derivado
  config: { progresion: "0.1", genetica: "0.2", movimientos: "0.4", combate: "0.5" },
  contadores: { encuentros, faroles, resonancias, nacimientos },     // enteros ≥ 0
  recursos: { faroles, esencia },
  nivel_max_alcanzado: entero,
  inicial: { elegida: 0|1|2, intro_vista: bool },
  animas: [ AnimaGuardada ],               // §8
  equipo: [ id ],                           // 1..3, ids de animas, sin repetir
  codex: { genes: [clave], mutaciones: [ { clave, id, resonancia, animaId } ], familias: [id] },
  linaje: [ { id, nombre, familia, genesD: [4 claves] } ],          // liberadas que son padres
  registro: { sesiones, combates, victorias, capturas, intentos, resonancias }   // para medir el hito D-066
}
```
- **Una sola fuente de azar**: `createRng(semilla + "|" + flujo + "|" + contador)` con los flujos `[guardado.flujos_rng]`: `inicial|k`, `encuentro|n`, `combate|n`, `farol|k`, `resonancia|r`, `nombre|nacimiento`. Ningún otro azar; ni reloj ni `Math.random` en reglas. Misma semilla + mismas decisiones ⇒ misma partida.
- Ids de ánima: `idAnima(n) = "a" + n con 6 dígitos` (`a000001`), n = `nacimiento`; así el orden de `<` en `breed` es el de nacimiento.
- Las criaturas se guardan **completas** (los 12 genes con su instancia): no se regeneran desde la semilla, para que un cambio de config no altere ánimas ya existentes. ≈ 3 KB por ánima → 100 ánimas ≈ 300 KB (cabe en `localStorage`).
- Se guarda tras cada evento (empezar encuentro, fin de combate, farol, resonancia, cambio de nombre/equipo, liberar). El combate a medias **no** se guarda: cerrar a mitad = huida.
- Carga: se valida sin tiradas (formato, versión, invariantes de GEN, huecos coherentes con el nivel, equipo ⊂ animas). Versión desconocida o datos corruptos: no se pisa nada; se ofrece exportar el texto y empezar otra partida.
- Exportar/importar como texto JSON: **recortable** (HOJA-DE-RUTA).
- `registro.sesiones`: el cliente lo incrementa al abrir la página (no es regla; puede usar el reloj).

---

## 8. Huecos de movimiento y cambio de habilidades (D-067)

### 8.1 Representación
```
AnimaGuardada = {
  id, nombre, criatura: Creature (GEN, inmutable), xp: entero, origen: "inicial"|"captura"|"eco",
  lugar: id de zona | null, nacimiento: entero,
  huecos: [Hueco, Hueco, Hueco, Hueco],      // 0 = gratis; 1..3 = de pago
  revelados: [ "cabeza.R1", ... ],
  aprendidas: [ idHabilidad ],                // vacío en el paso 1
  variantes: { [locus]: { nivel: 15|20|25|30, eleccion: "A"|"B" } }   // §4.5; definitiva
}
Hueco = null (cerrado por nivel)
      | { fuente: "gen", locus: LocusId, variante: boolean }   // variante = usar la elegida en vez del original
      | { fuente: "habilidad", id: string }
```
- Nivel = derivado de `xp` (§4.1); no se guarda aparte.
- **Invariantes** (se validan al cargar): `huecos[0] = {gen, extremidades}` siempre; `huecos[k] ≠ null ⇔ nivel ≥ desbloqueos.huecos_pago[k−1].nivel`; un mismo locus o habilidad no ocupa dos huecos; un hueco de pago nunca apunta a extremidades ni a nada de coste 0; `variante = true` solo si `variantes[locus]` existe.
- Al subir de nivel y abrirse un hueco, se rellena con su `locus_por_defecto` si ese locus no está ya en otro hueco; si lo está (paso 2), con el primer locus de pago libre en el orden `cola, cabeza, cuerpo`.
- **Repertorio** de un ánima = movimientos de sus genes D de cabeza, cuerpo y cola + sus variantes elegidas + `aprendidas`. En el paso 1 lo único que el jugador cambia es `variante` (original o variante, en el santuario, gratis); el paso 2 añade «poner X del repertorio en el hueco k».
- La variante se guarda como elección (`"A"`/`"B"`), no como movimiento: el movimiento se regenera con §4.5 desde la clave del gen, igual que el original.

### 8.2 Por qué no rompe la genética
Los movimientos de gen siguen saliendo del gen D (MOV: mismo gen ⇒ mismo movimiento). Los huecos, `variantes` y `aprendidas` son estado **del ánima, no del genoma**: `breed` no los ve, el eco nace con los huecos por defecto, sin variantes, y las habilidades no se heredan (D-036, D-068). Cambiar un hueco nunca toca genes, pureza ni estadísticas.

### 8.3 Al combatir
`combatienteDeAnima(anima)` = `buildCombatant(criatura)` con `moves` = los movimientos de los huecos abiertos (la variante si `variante = true`), **en orden de hueco** (gratis primero): de 2 a 4 movimientos. El motor ya trata la lista por posición y localiza el gratis por coste 0 (comprobado en `engine.ts`); falta un test con 2 y 3 movimientos (§10).

---

## 9. Simulación previa (para el analista)

### 9.1 Montaje `[escenarios_sim]`
Semillas nuevas con prefijo `prog01` (no se han usado para elegir números). 500 partidas.
- **Jugador modelo**: equipo = sus 3 ánimas de más nivel (empate: nacimiento); combate en la zona abierta más alta; controla su equipo con la IA de referencia de COM; tras ganar, lanza faroles a la salvaje de más pureza (luego más nivel), hasta 2 por salvaje, una salvaje por combate salvo que le sobren faroles (≥ 6); tras cada combate resuena mientras pueda: pareja de maduras con menos ecos (empate: más nivel) si hay esencia. Variante "cuidador": mete siempre el eco más reciente en el equipo en lugar de la 3.ª de más nivel (mide si usar ecos frena).
- **Tiempo** de combate = turnos × 10 s + 30 s; resonancia 40 s. Sesión = 6 combates (3 sesiones; y 12 sesiones para el nivel 30).
- **Espejos de nivel**: 3 contra 3 con los mismos genomas (catálogo, IA de referencia por los dos lados), un bando con 4 movimientos y el otro con 3 (sin cuerpo) o 2 (sin cabeza ni cuerpo); 4000 combates alternando lado.
- **Variantes**: (a) sobre los 72 genes base + 500 mutados al azar, por locus: n.º de candidatos, % con n = 0 (respaldo) y n = 1 ("mantener"), reparto por eje; (b) espejo 3 contra 3 de nivel 30 con los mismos genomas: un bando con las 4 variantes A, otro con las originales (y lo mismo con B); (c) "pieza gratis" por variante concreta para cazar variantes rotas (MOV §7).
- **Liberar**: estrategia "libera todo lo que no esté en el equipo ni sea pareja útil".

### 9.2 Métricas y criterios `[criterios_sim]`
| Métrica | Criterio | Estimación |
|---|---|---|
| Resonancias tras 3 sesiones | mediana ≥ 20, p10 ≥ 15 | 23 / 17 |
| Resonancias en la sesión 1 | mediana ≥ 2 | 6 |
| Minutos por sesión (modelo de tiempo) | 10–20 | ≈ 15 |
| Nivel del favorito tras 3 sesiones | mediana 15–22 | 20 |
| Combates hasta nivel 30 (favorito) | mediana 35–70 | 42 |
| Atrapar al 1.er intento / con reintento | 60–80 % / 85–97 % | ≈ 68 % / ≈ 95 % |
| Victorias del jugador modelo | Prado ≥ 80 %, Marismas ≥ 70 %, Cantil 55–80 % | sin estimar (falta combate real) |
| Primer combate (inicial + acompañante) | ≥ 90 % | sin estimar |
| Espejo 4 contra 3 movimientos | 52–65 % para el de 4 | sin estimar |
| Espejo 4 contra 2 movimientos | 60–85 % para el de 4 | sin estimar |
| Turnos por combate salvaje | Prado ≤ 6, Cantil ≤ 9; empates ≤ 2 % | sin estimar |
| Bloqueo por esencia | % de momentos "hay pareja madura pero no esencia" ≤ 50 % | alto (≈ el freno principal) |
| Colección llena en 3 sesiones | 0 % de partidas | ≈ 36 de 100 |
| Espejo nivel 30 con variantes (A o B) vs originales | 45–55 % | ≈ 50 % (mismo presupuesto) |
| Variante concreta más fuerte (pieza gratis) | ninguna > 58 % | sin estimar |
| Locus sin candidatos (respaldo) | ≤ 5 % de genes; gratis ≤ 15 % | sin estimar (el gratis tiene poco margen) |
| Esencia de liberar / esencia total | ≤ 15 % | ≈ 10 % |
| 3 contra 3 con el motor ampliado | 100 % de hashes iguales al motor anterior | 100 % (obligatorio) |

Informativo: % de victorias sin acompañante en los 2 primeros combates; primera mutación (con 20 ecos, P(≥ 1) ≈ 1 − 0,922²⁰ ≈ 80 %); primera ánima híbrida; % de huecos 1/2/3 abiertos en las salvajes por zona; esencia sobrante; ritmo de la variante "cuidador".

**Lectura**: si fallan victorias por zona, primero `ia_salvaje` y luego los niveles de zona; si falla el ritmo de resonancia, `resonancia.coste_base` y `esencia_por_salvaje`; si el espejo 4 contra 2 pasa de 85 %, adelantar el hueco 2 a nivel 2; si una variante rompe el espejo, se excluye su pieza de los ejes `[variantes.piezas_excluidas]` (nunca se toca MOV). Nunca se tocan estadísticas ni reglas de COM.

---

## 10. Notas para el núcleo y el cliente

### 10.1 Núcleo (`packages/core/src/progression/`, nombres internos en inglés)
- `parseProgressionConfig(json, gen)`: valida rangos, `xp_total` (longitud = `nivel_max`, empieza en 0, estrictamente creciente), huecos de pago con niveles crecientes y loci distintos de pago, ids con `^[a-z0-9_]+$`, pesos ≥ 0 con suma > 0, `grupo_pesos` de longitud `grupo_max`, `p_min ≤ p_max`, fórmula de tiradas del encuentro, `revelar_ocultos` con longitudes iguales y posiciones válidas. `variantes`: niveles crecientes ≤ `nivel_max`, un locus distinto por nivel, `orden_respaldo` = permutación de los 4 loci, ejes ⊂ {modificador, estado, condicion}, `potencia_max_relativa` ∈ (0, 1], `tiradas` = 2, piezas excluidas existentes en MOV. `liberar`: `esencia_base ≥ 0`, `divisor_nivel ≥ 1`.
- API orientativa (todas puras; devuelven estado nuevo):
  `levelOf(xp)`, `unlockedSlots(level)`, `newGame(seed)`, `starterOptions(game)`, `chooseStarter(game, k, name?)`, `rollEncounter(game, zoneId)` (622 tiradas), `combatantOf(anima, cfg)`, `wildAi` ("instinto"), `applyBattleResult(game, encounter, result, teamHp)` (XP, esencia, faroles, niveles, revelaciones, `nivel_max_alcanzado`), `catchChance(...)`, `throwLantern(game, wildIdx)` (1 tirada), `canResonate(game, a, b)` (motivo o null, sin tiradas), `resonate(game, a, b)` (280), `moveVariants(gene, level, cfg)` → `{A, B}` (2 tiradas, §4.5, pura: solo depende de la clave, el nivel y las configs), `chooseVariant(game, animaId, level, "A"|"B")`, `toggleVariant(game, animaId, slot)`, `release(game, id)`, `setTeam`, `rename`, `serialize(game)` / `parseSave(text)` (sin tiradas).
- **Extensión del motor**: tabla y condición de no regresión de §2.2 (hashes de ≥ 200 partidas 3 contra 3 guardados **antes** de tocar el motor).
- **Variantes**: el ensamblado de MOV §4.1 se reutiliza sin respaldo (función `assembleExact(arq, c, piezas)` que devuelve el movimiento o null); no cambia `generateMove` ni el catálogo ni sus tiradas. `breed` ya expone `trace` (slots) y `mutations`: no hay que cambiarlo.
- Tests mínimos: variantes deterministas (misma clave y nivel ⇒ mismas A y B), potencia ≤ original, mismo coste y arquetipo, respaldo n = 0 y n = 1, el eco no hereda variantes; liberar no deja liberar la última ni una del equipo; tabla de niveles; huecos por nivel; combatiente con 2 y 3 movimientos (gratis bien localizado, sin hueco fuera de rango); 1 contra 1, 2 contra 3; determinismo de encuentro/farol/resonancia con la misma semilla; guardar → cargar → mismo hash; carga que rechaza invariantes rotos.
- Es **núcleo**: todo lo anterior. Es **cliente**: crear la semilla, `localStorage`, `registro.sesiones`, textos y pantallas.

### 10.2 Cliente (pantallas mínimas)
1. **Título**: continuar / nueva partida (avisa si hay partida).
2. **Santuario**: hechicero con sus 5 líneas (solo la primera vez), elegir inicial entre 3 (aspecto, familia, botones), nombrar. Después: botones «Resonar», «Colección», «Codex», «Salir a explorar».
3. **Zonas**: lista de 3 con nivel y familias; cerradas con «se abre cuando un ánima llegue a nivel X».
4. **Combate**: el de v0.5 con equipos de 1–3; acompañante marcado como «de Arnal».
5. **Tras el combate**: XP ganada por ánima (barra), subidas de nivel y desbloqueos («¡Aprende *X*!», «Ha madurado», «Revela un gen oculto», y en 15/20/25/30 la **elección de variante**: dos tarjetas con el movimiento original y lo que cambia en cada una, aviso «la elección es para siempre; podrás volver al original en el santuario»), esencia y faroles; lista de salvajes con % de atrapar y botón «Lanzar farol (quedan N)»; nombrar la atrapada.
6. **Resonancia**: elegir dos (solo maduras con ecos libres), vista previa (§5.4), confirmar, revelación del eco, nombrar.
7. **Colección y ficha** (§6.1), con equipo (1–3), conmutador original/variante por movimiento y liberar (confirmación con la esencia que da).
8. **Codex**: genes por familia y zona del cuerpo (vistos / ?), mutaciones propias.
Sin arte nuevo obligatorio: el ánima se dibuja con el arte v3 a partir de sus genes; el hechicero puede ser una silueta.

---

## 11. Alternativas descartadas (para DECISIONES.md)

| # | Decisión | Alternativas descartadas |
|---|---|---|
| PR1 | Encuentros de tu equipo (1–3) contra 1–3 salvajes con el motor v0.5 (D-068) | Siempre 3 contra 3 (obliga a prestar 2 ánimas al empezar y hace largos los combates de captura); un modo 1 contra 1 propio (reglas nuevas) |
| PR2 | Acompañante del hechicero mientras tengas < 2 ánimas | Inicial a nivel 3 (contradice D-067); primer combate a cara o cruz; combate guionizado |
| PR3 | IA salvaje "instinto" (gasta en cuanto puede) | IA de referencia (salvajes tan duras como el rival de la Fase 1); IA con azar (más tiradas, menos legible) |
| PR4 | Atrapar con % visible, por vida de tu equipo, nivel y pureza; reintento +20 pp | Vida de la salvaje (siempre 0 al ganar); probabilidad oculta; atrapar a mitad de combate (cambia COM) |
| PR5 | Faroles: 5 + 1 por victoria, tope 10 | Ilimitados (sin decisión); recarga por tiempo (reloj, presión de móvil); compra |
| PR6 | Curva entera `5·(L−1)·(L+2)`, nivel 30 en ~42 combates | Curva exponencial (prohibida y opaca); lineal (los niveles altos llegan demasiado pronto) |
| PR7 | XP completa para todo el equipo | Dividir entre el equipo (castiga llevar ecos); solo a las que actúan (castiga apoyo) |
| PR8 | Cola a nivel 1, cabeza a 3, cuerpo a 10; madurar a 5 | Que el jugador elija qué gen abre (decisión sin información a nivel 1); kit completo a 30 (desigualdad de combate que dura y afecta al PvP); madurar a 10 (frena la 1.ª resonancia a la 2.ª sesión) |
| PR9 | Niveles 15/20/25/30: una de dos variantes (una pieza cambiada, mismo presupuesto, potencia ≤ original); 8–29 revelan genes ocultos como premio menor (D-068) | Solo revelar genes (descartado por Miguel); estadísticas (D-029 B); variantes libres que suban potencia |
| PR9b | Variante de un locus fijo por nivel (cola, cabeza, cuerpo, gratis) | El jugador elige qué movimiento varía (4 elecciones encadenadas, más pantalla; se puede añadir en el paso 2) |
| PR9c | Elección A/B definitiva, conmutable con el original | Reversible A/B (sin identidad); sin vuelta al original (castiga probar) |
| PR9d | Variantes por enumeración de piezas + 2 tiradas fijas | Sorteo libre de piezas con la gramática (puede repetir el original o no caber; consumo variable) |
| PR16 | Liberar da `1 + floor(nivel/5)` de esencia | `2 + floor(nivel/3)` (primera propuesta: liberar capturas daba hasta un 30 % extra); sin recompensa |
| PR10 | Eco nace a nivel 1 | Nivel medio de los padres (padres altos fabrican ecos maduros: anula madurar) |
| PR11 | Esencia como coste creciente de la resonancia (6 + ecos previos) | Gratis (el combate no alimenta la resonancia); coste plano (todas con la misma pareja); coste por monedas (no hay) |
| PR12 | Curación completa tras cada combate | Vida que persiste (necesita objetos y descanso: alcance) |
| PR13 | Huecos de movimiento que apuntan a gen o habilidad, fuera del genoma | Guardar el movimiento dentro del gen (rompe "mismo gen ⇒ mismo movimiento" y la herencia) |
| PR14 | Guardar criaturas completas y semilla; contador de encuentro antes de combatir | Regenerar desde la semilla (un cambio de config cambia ánimas existentes); contador al final (recargar repite encuentros) |
| PR15 | Iniciales puras de 3 familias fijas | Familias al azar (repetición entre partidas difícil de explicar); no puras (pueden no parecer de su familia) |

## 12. Pendiente de validar en simulación
1. Todos los criterios de §9.2, en especial **victorias por zona y primer combate** (no estimados: dependen del combate real con equipos asimétricos y la IA "instinto").
2. Que 20 resonancias quepan en 3 sesiones con combate real (estimado 23, p10 17: margen pequeño).
3. Espejos 4 contra 3 y 4 contra 2 movimientos (que el nivel se note sin ser decisivo).
4. Que el acompañante (Sombra nivel 10) no haga triviales los combates ni se note su marcha.
5. Que la extensión a bandos de 1–2 deje **idénticos** los hashes de 3 contra 3.
6. Variantes: candidatos por locus (sobre todo el gratis), neutralidad del espejo de nivel 30 y ninguna variante rota.
7. Que liberar no supere el 15 % de la esencia total.

## 13. Preguntas abiertas para Miguel
Ninguna de fondo. Las cuatro de la primera versión las contestó Miguel en D-068 (variantes en 15/20/25/30; liberar sí; equipos de 1 a 3; nombres provisionales). Para el director, sin bloquear: si el analista ve que el gratis tiene pocas variantes (> 15 % sin candidatos), la variante del nivel 30 pasa a «cualquier movimiento de pago sin variante todavía»; es un ajuste numérico de esta spec.

## 14. Cambios
Primera versión (2026-11-16), actualizada el mismo día con D-068:
| Sección | Primera versión | Con D-068 |
|---|---|---|
| Cabecera, §0 | movimientos v0.4 | catálogo `movimientos.v0.5.json` (D-069), misma gramática |
| §2.2 | extensión de equipos 1–3 propuesta (P-3) | confirmada; tabla de cambios del motor y condición de hashes idénticos en 3 contra 3 |
| §4.3, §4.5 | niveles 11–30: solo revelar genes | **variantes** en 15/20/25/30 (nuevo §4.5); revelar queda como premio menor |
| §6.2 | liberar pendiente (P-1), `2 + floor(nivel/3)` | liberar sí, `1 + floor(nivel/5)`, con el argumento anti-explotación |
| §8 | huecos sin variantes | `variantes` por locus y `Hueco.variante` |
| §9 | — | criterios de variantes, liberar y no regresión del motor |
| §1.2, CFG | nombres provisionales (P-4) | marcados `"provisional": true` |
| §13 | P-1..P-4 | resueltas |
