# Especificación de progresión v0.1 — colección, atrapar, niveles y resonancia (Fase 2, paso 1)

Estado: propuesta, **actualizada con D-068, D-070 y la revisión QA** (`docs/revisiones/qa-progresion-v0.1.md`; ver §14). Autor: Diseñador de sistemas. Fecha: 2026-11-16.
Primera versión (todo es **[v0.1]**). Configuración: `config/progresion.v0.1.json` (**CFG**); cita `[ruta]`. Si no coinciden, **manda CFG**.
Usa sin cambiarlas: `genetica-v0.2` (**GEN**), la gramática de `movimientos-v0.2` + `movimientos-v0.4` con el catálogo `movimientos.v0.5.json` (**MOV**, D-069) y `combate-v0.5` (**COM**). **No cambia ninguna regla de combate**: amplía el motor a bandos de 1 a 3 ánimas (D-068, §2.2) con 3 contra 3 idéntico al de hoy.
Decisiones que manda: D-062, D-065, D-066, D-067, **D-068, D-070**, D-063 (vocabulario), D-008, D-010, D-011, D-016, D-029 B, D-036 y D-049 (fuera del paso 1).

Notación: `u` = `rng.next()` (1 tirada). `r2(x)` = `Math.round(x·100)/100`. `clamp(x,a,b)`. Solo `+ − * /`, comparaciones y `Math.round/floor/min/max/abs` (sin `**`, `pow`, `sqrt`, `log`, `exp`, trigonométricas). Las cifras marcadas **(estimación)** salen de un Monte Carlo a mano de la economía (sin combate real, victorias supuestas); las valida el analista (§9).

---

## 0. Resumen

| Pieza | Regla v0.1 |
|---|---|
| Inicio | El hechicero Arnal (santuario), 5 líneas de texto; eliges 1 de 3 ánimas puras (Llama, Marea, Brote) de nivel 1 y le pones nombre |
| Encuentros | Tu equipo (1–3) contra 1–3 salvajes, mismo motor v0.5; 3 zonas como datos; las salvajes juegan "por instinto" |
| Atrapar | Tras ganar, un farol por intento, % entero visible antes de lanzar, 2 intentos como máximo por salvaje; faroles: 6 al empezar, +1 por victoria, tope 12 |
| Niveles | 1–30 por experiencia (tabla entera); 3.er movimiento a nivel 3, madurar a nivel 5, 4.º movimiento a nivel 10; **a nivel 15, 20, 25 y 30 se elige una de dos variantes** de un movimiento con el mismo presupuesto (§4.5, D-068); premio menor: revelar genes ocultos. **Nunca estadísticas** |
| Resonancia | Dos ánimas maduras, coste 5 + (ecos previos de ambos) de esencia, máximo 5 ecos por ánima (GEN), el eco nace a nivel 1 |
| Colección | Hasta 100 ánimas, equipo de 3, liberar a cambio de un poco de esencia (D-068, §6.2); Codex de genes |
| Hueco D-067 | 4 huecos de movimiento por ánima; cada hueco apunta a un gen (locus) o, en el paso 2, a una habilidad. La genética no cambia |
| Guardado | `localStorage`, formato versionado; todo el azar de `createRng(semilla de partida | flujo | contador)` |

---

## 1. Bucle de una sesión (10–20 min)

### 1.1 Primera sesión (≈ 15–18 min, estimación)
| Min | Qué hace el jugador | Qué consigue |
|---|---|---|
| 0–2 | Nueva partida → santuario: el hechicero habla (§1.2) → elige 1 de 3 ánimas (§1.3) → le pone nombre | 1 ánima nivel 1 (gratis + 1 de pago), 6 faroles, 30 de esencia |
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
- El jugador puede **huir** antes del turno 1 o en cualquier turno: sin recompensa ni castigo. Huir antes del turno 1 permite "rebuscar" un encuentro (QA B-12): **se acepta a sabiendas**; solo cuesta tiempo, las familias de cada zona ya se ven en la lista y no hay nada raro que cazar (pureza alta es solo el 2 %). Si en la prueba se abusa, huir antes del turno 1 costará 1 farol.
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
**Identidad de las salvajes (QA B-04):** se generan con id temporal `w<n>-<i>` (n = encuentro, i = 0..2) y `birth = 0`; ese id solo vive en el encuentro. Al **atraparla**, `m = ++contadores.nacimientos` y la criatura guardada es `{...criatura, id: idAnima(m), birth: m}` (copia nueva, sin tiradas; los genes no cambian). La inicial elegida es `m = 1` (las dos no elegidas no consumen número). Un eco toma `m` al nacer (§5.3). Así `contadores.nacimientos` = número de ánimas que han sido tuyas y los ids no se repiten.

**622 tiradas por encuentro** `[mundo.encuentro.tiradas_por_encuentro]` = 1 + 3·(2 + 205); el parser valida la fórmula `[validacion_config.formula_tiradas_encuentro]`. El combate usa otro flujo: `createRng(semilla | "combate" | n)` con el mismo `n`.

### 2.4 Acompañante del hechicero `[mundo.acompanante]`
Mientras tengas menos de 2 ánimas, una ánima del hechicero (Sombra, nivel 10, fija para todas las partidas: `salvaje(createRng("acompanante|v0.1"), "sombra", puro = true)`) lucha en tu equipo. No recibe experiencia, no se atrapa, no resuena y no aparece en la colección. Motivo: sin ella, el primer combate sería 1 contra 1 con los mismos botones, casi a cara o cruz; perder el primer combate antes de atrapar nada es la peor entrada posible.

### 2.5 IA salvaje "instinto" `[ia_salvaje]`
Cada salvaje, en orden de equipo, elige el movimiento de pago **más caro** que pueda pagar con la energía que dejan las anteriores y que no esté descansando (empate: hueco menor); si no puede, su gratis. Nunca ahorra; si es la última ánima, usa un solo movimiento. **Objetivo, aliado protegido o curado: siempre el automático de COM** (V4: prioridad de fila, cura y escudo automáticos; QA B-13). Sin tiradas. Es más floja que la de referencia (ahorrar compensa, D-021) y **legible**: el jugador aprende que las salvajes "gastan en cuanto pueden". Plan B por config: `modo = "referencia"`.

---

## 3. Atrapar `[atrapar]`

### 3.1 Cuándo
Solo tras una **victoria**. Cada salvaje del grupo (todas se han apagado) puede recibir hasta `[intentos_max_por_salvaje]` = 2 faroles, en el orden que elija el jugador, mientras le queden faroles. Si la colección está llena (§6) no se puede lanzar.

### 3.2 Probabilidad (visible antes de lanzar)
**[QA B-07] Todo en enteros (porcentaje)**, en una sola función del núcleo (`catchChance`) que da el % que se muestra y el que se usa:
```
SV   = Σ vida actual, SM = Σ vida máxima de TU equipo al acabar (enteros; apagadas cuentan 0; sin el acompañante)
dn   = max(0, nivel_salvaje − nivel máximo de TU equipo, sin el acompañante)          // QA B-16
c100 = Math.round(calidadCriatura · 100)          // entero, centésimas; c100 ∈ [8550, 9450]
pct1 = clamp(60 + floor(25·SV / SM) − 5·dn − floor(15·(c100 − 8550) / 900), 25, 95)
pct2 = min(95, pct1 + 20)                         // segundo farol a la misma salvaje
atrapada si floor(u · 100) < pct                  // 1 tirada, flujo createRng(semilla | "farol" | k)
```
Los coeficientes son `[atrapar.base_pct, bono_vida_pct, penal_nivel_pct, penal_pureza_pct, pct_min, pct_max, bono_reintento_pct]` (enteros). `k` = `contadores.faroles` (se incrementa en cada lanzamiento). Ejemplos: victoria limpia (SV/SM = 0,8) contra pureza media (c100 = 9000) del mismo nivel → 60 + 20 − 7 = **73 %**, reintento 93 %. Victoria apurada (0,2) contra pureza alta (c100 = 9405) → 60 + 5 − 14 = **51 %**, reintento 71 %.

Lectura: **ganar con holgura** sube la probabilidad (premia jugar bien); una salvaje **más pura** cuesta algo más (la rareza vale algo) pero nunca es imposible; las salvajes de más nivel que tu equipo cuestan más.

### 3.3 Faroles `[recursos]`
6 al empezar, **+1 por victoria**, tope 12 (subidos desde 5/10 para que el p10 de resonancias aguante con victorias bajas, §5.5). Sin tienda, sin moneda, sin espera por reloj. La escasez aparece en Marismas y Cantil, donde ganas a 2–3 salvajes y solo puedes intentar con 1–2: **elegir a cuál** es la decisión.

### 3.4 Sin trampa de caja de botín
- El % exacto se muestra **antes** de lanzar; no hay "casi" ni animaciones de suspense alargado (nota para el cliente: el farol tiembla una vez y se resuelve).
- Lo que se arriesga es visible: genes D, familia y pureza de la salvaje se ven al acabar el combate.
- El reintento sube la probabilidad (protección contra la mala racha) y no se paga con nada que se compre.
- Los faroles **no se venden por dinero** en el paso 1 (ver alternativas).

### 3.5 Si falla
Si falla el **1.er** farol, la salvaje sigue ahí para el reintento (y el farol se pierde). Si falla el **2.º**, **se escapa**: desaparece. Si el jugador sale de la pantalla sin reintentar, también se va. Las demás salvajes del grupo siguen disponibles (QA B-11).

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
- **Derrota:** `floor(suma de las salvajes que sí se apagaron / 2)` `[experiencia.divisor_derrota]`. **Huida:** 0.
- Ritmo (estimación): ~33 XP por combate en el Prado, ~100 en Marismas, ~175 en el Cantil. **Nivel 30 a los ~31 / 39 / 47 combates del favorito** con victorias del 100 % / 90-80-70 % / 80-70-55 % (QA, ≈ 5–8 sesiones).
- Observación QA B-14: con XP completa, un eco madura en 1 combate del Cantil. **Se acepta**: madurar no está para frenar la resonancia (de eso se encargan la esencia y el límite de 5 ecos) sino para que el eco pelee al menos un poco antes de resonar. Se quita ese argumento de PR10.

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
- Ánimas atrapadas: entran con su nivel y todo lo que ese nivel desbloquea (una salvaje de nivel 12 llega con 4 movimientos, madura y con 2 ocultos revelados). **Variantes de niveles ya superados (QA B-03):** una salvaje atrapada a nivel 15–16 llega con la elección de la variante de cola **pendiente**: no se sortea ni se elige sola; se muestra en la pantalla de atrapada («Puede aprender una variante: elígela ahora o en el santuario») y hasta entonces usa el original. Invariante de carga: `variantes[locus]` puede faltar aunque el nivel lo permita (= pendiente); nunca puede existir con nivel insuficiente. Las salvajes en combate usan siempre los originales.
- **Ecos al nacer: nivel 1** `[niveles.nivel_eco_al_nacer]`, gratis + cola. Crece contigo: es el apego.

### 4.4 Revelar genes ocultos `[desbloqueos.revelar_ocultos]`
Al alcanzar el nivel `niveles[i]` se revela la posición `orden[i]` (cabeza.R1, cuerpo.R1, extremidades.R1, cola.R1, después los R2). Además (§5.3), al resonar se revela el oculto de un padre que haya pasado a ser D del eco. Revelar no cambia nada del ánima: la ficha muestra ese gen y lo registra en el Codex. Sirve para resonar con intención (GEN §3: los ocultos salen como D del eco con baja probabilidad y pasan a los ocultos del eco a menudo). Es el premio menor de los niveles altos; el mayor son las variantes (§4.5).

### 4.5 Variantes de movimiento (D-068, D-070) `[variantes]`
**Qué es.** A nivel 15, 20, 25 y 30 `[variantes.niveles]` el jugador elige una de **dos variantes** del movimiento de gen de un locus fijo `[variantes.locus_por_nivel]`: 15 → cola, 20 → cabeza, 25 → cuerpo, 30 → extremidades (el gratis, al final porque tiene menos margen). Una variante es el **mismo movimiento con una pieza cambiada**: mismo arquetipo, mismo escalable, mismo coste de energía y **el mismo presupuesto efectivo** (D-070).

**"Sin más fuerza" = mismo presupuesto (D-070, resuelve QA B-02).** La variante gasta, como mucho, los mismos **puntos efectivos** que el original, contando topes y redondeos. Puede rendir más en unas situaciones (área contra una fila llena, potencia en lugar de estado, pico con la condición cumplida) y menos en otras; eso es lo que hace interesante elegir. No se exige que la potencia baje.

**Puntos efectivos (QA B-01).** Para un movimiento con piezas ya ensambladas (MOV §1, §4.1):
```
pe       = potencia_por_punto del escalable (MOV escalables)
ptsEf    = min(potencia, tope) / pe          // potencia ya redondeada a múltiplo de 5 y con el tope aplicado (tope por objetivo si hay área)
puntosEf = fijo_mod + fac·(coste(estado) + coste(energía)) + fac·fEsc·ptsEf
```
Así, si `M` está en el **tope** (p. ej. escudo 300) o tiene holgura por redondeo, añadir una pieza aumenta `puntosEf` y el candidato se rechaza: no hay "pieza gratis".

**Generación (determinista, desde el gen y el nivel).** Sea `M` el movimiento de gen del D del locus (MOV con el catálogo vigente, con su sal si la tiene; para genes mutados, igual). Se enumeran candidatos cambiando **una sola pieza** de `M`, en los ejes `[variantes.ejes]` = modificador, estado, condición, con estas alternativas **(tabla cerrada, QA B-05)**:

| Movimiento `M` | Eje modificador | Eje estado | Eje condición |
|---|---|---|---|
| golpe | los de MOV 2.6 (alcance, prioridad, perforar, área, drenaje) + ninguno | **sin eje** (añadir estado lo haría golpe_estado) | las 5 + ninguna |
| golpe_estado | alcance, prioridad, área + ninguno | los ofensivos (aturdir solo con c ≥ 3) + **ninguno** («potencia en vez de estado», D-070) | las 5 + ninguna |
| maldición (área forzada) | alcance, prioridad + ninguno | los ofensivos (aturdir con c ≥ 3) + ninguno | las 5 + ninguna |
| protección | área + ninguno | prisa, regenerar, ninguno | las 5 + ninguna |
| curación | área + ninguno | regenerar, ninguno | las 5 + ninguna |
| táctico sin energía extra ni provocar | alcance, prioridad + ninguno | prisa, ninguno | las 5 + ninguna |
| táctico con energía extra, o cualquiera con **provocar** | como su fila | **sin eje** (la energía y provocar no se tocan) | como su fila |
| **cola** (MOV §3) | si `M` es maldición: los de su fila; si no, solo **alcance ↔ área** (si el arquetipo admite área; si no, sin eje) | como su fila | como su fila |
| **gratis** (extremidades, MOV v0.4 §2) | solo alcance, drenaje + ninguno | golpe_estado: ralentizar, marca, debilitar + ninguno; protección y curación: sin eje | las 5 + ninguna |

Las alternativas se recorren en el orden de MOV (`orden_modificadores`, `orden_estados_*`, `orden_condiciones`), con "ninguno" al final; se excluye la pieza que ya tiene `M` y las de `[variantes.piezas_excluidas]`. Cada candidato se ensambla con `presupuesto[c]` de `M` con la fórmula de MOV §4.1 **sin respaldo** (función `assembleExact`; si no cabe, se descarta) y es válido si:
1. cumple las reglas de validez de MOV §3 (incluido `fraccion_minima` y los topes);
2. difiere de `M` en exactamente esa pieza;
3. **`puntosEf(candidato) ≤ puntosEf(M)`** (con tolerancia 1e-9) y **`puntosEf(candidato) ≥ puntosEf(M) − holgura`**, `[variantes.holgura_puntos]` = 3: no gasta más que el original ni deja tirada una parte grande del presupuesto (3 puntos cubren el redondeo de `floor` sobre `fac·fEsc` ≤ 2,3 y el paso de 5 de potencia).

Con la lista ordenada `C` (eje, luego orden de la pieza), `n = |C|`, y `rng = createRng("var|v0.1|" + clave del gen + "|" + nivel)`, **2 tiradas fijas** `[variantes.tiradas]`:
```
u1, u2 = rng.next(), rng.next()                          // siempre las 2
si n < 2 (QA B-09): el nivel pasa al siguiente locus de orden_respaldo (cola, cabeza, cuerpo, extremidades) con n ≥ 2 y sin variante;
   si no hay ninguno: el primer locus de ese orden con n = 1 y sin variante ofrece SOLO A ("aprender" o dejarlo pendiente; no hay B);
   si tampoco: ese nivel solo da su revelación (si toca). Total y sin tiradas extra (las 2 del locus final).
A = C[floor(u1·n)]
R = candidatos de C con eje ≠ A.eje; si R vacío, R = C sin A
B = R[floor(u2·|R|)]
```
Las dos opciones suelen tocar ejes distintos («área» frente a «otra condición»): una decisión de verdad. La semilla incluye el nivel para que el respaldo a otro locus dé otro sorteo. Estimación QA con el catálogo v0.5: 0 de 72 genes sin candidatos (media 4,2 en el gratis, 6,6–8,4 en el resto) y 0,2 % en mutados; con el filtro de puntos efectivos bajará algo (lo mide el analista).

Ejemplos (ilustrativos con MOV v0.5, el núcleo da los reales): golpe de cola coste 3 (presupuesto 27) con alcance (1 punto; 26 puntos de daño → potencia 130; `puntosEf` 27) → A: «área» en lugar de alcance (`floor(27/1,75)` = 15 → 75 por objetivo; `puntosEf` 26,25) / B: añade «objetivo_con_estado» (`floor(26/1,175)` = 22 → 110, 165 si se cumple; `puntosEf` 26,85). Una protección de cuerpo coste 5 con el escudo en el tope (300) **no** admite «+prisa»: subiría `puntosEf`.

**Elección y cambio.** La elección entre A y B es **definitiva** para esa ánima (le da identidad: dos ánimas con los mismos genes pueden acabar distintas). Lo que sí se puede cambiar en el santuario, gratis y cuantas veces se quiera, es **usar la variante elegida o el movimiento original** en su hueco (encaja con el hueco de D-067: la variante es una entrada más del repertorio). Elegir mal nunca deja peor que antes. Descartado: A/B reversible (sin identidad); sin vuelta al original (castiga probar).

**Qué se guarda (QA B-08).** La elección se guarda como la **pieza cambiada** `{eje, pieza}` (p. ej. `{eje: "modificador", pieza: "area"}`), no como letra: un reequilibrio futuro del catálogo no puede cambiar en silencio lo que el jugador eligió. Al cargar se reensambla `M` con esa pieza (`assembleExact`); si con un catálogo nuevo ya no es válida, la variante pasa a **pendiente** (se ofrece elegir otra vez con el sorteo del catálogo nuevo) y se usa el original.

**Herencia.** Las variantes son estado **del ánima**, no del genoma: `breed` no las ve y **los ecos no las heredan** (nacen con los movimientos originales de sus genes). Mismo principio que las habilidades enseñables (D-036).

**Balance.** Mismo presupuesto con los precios medidos de MOV: neutro en media. Riesgo conocido: algunas piezas pueden rendir más en ciertos kits (p. ej. aturdir o área en un equipo concreto). Se mide en §9 (espejo con y sin variantes y "pieza gratis" por variante); si una rompe, su pieza va a `piezas_excluidas`.

---

## 5. Resonancia en el juego `[resonancia]`

### 5.1 Requisitos
Dos ánimas distintas de tu colección, las dos **maduras** (nivel ≥ 5) y con menos de 5 ecos (GEN `limites_sim.max_crias_por_criatura`), y esencia suficiente. La edad mínima de GEN (`nacimiento` de la cría − del padre ≥ 1) se cumple siempre porque `nacimiento` es el contador de ánimas (§7). No hace falta que estén en el equipo.

### 5.2 Coste
`coste = 5 + 1·(ecos previos de A + ecos previos de B)` de esencia: de 5 a 13. Sube con el uso para empujar a resonar con ánimas distintas, sin castigar.
Esencia `[recursos]`: 30 al empezar; por cada salvaje apagada en victoria, `5 + floor(nivel/2)` (≈ 8 por combate en el Prado, ≈ 16 en Marismas, ≈ 25 en el Cantil); liberar (§6.2). Tope 999. Con este ritmo la esencia es el freno principal de la resonancia (estimación: sobran ≈ 7 al final de la 3.ª sesión): un combate ≈ una resonancia y media en Marismas.

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
Con el Monte Carlo de economía del revisor (victorias supuestas), primera versión (coste 6, esencia 4 + nivel/2, faroles 5/10): resonancias tras 3 sesiones mediana/p10 = 32/25 (100 % de victorias), 24/18 (90/80/70), **20/14** (80/70/55, por debajo del criterio p10 ≥ 15). Ajustes de esta versión: `coste_base` 6 → 5, `esencia_por_salvaje.base` 4 → 5, faroles 5/10 → 6/12. Resultado con 80/70/55: **mediana 22, p10 16** (con 90/80/70: 26/20; con 100 %: 34/27). Con victorias bajas el freno no es solo la esencia sino las capturas (faroles y victorias): por eso suben también los faroles. Si el analista mide victorias aún más bajas, el siguiente ajuste es la IA salvaje, no la economía.

---

## 6. Colección, Codex y equipo `[coleccion]`

### 6.1 Colección y equipo
- Hasta `[tamano_max]` = 100 ánimas (estimación: ≈ 36 tras 3 sesiones). Llena: no se puede lanzar farol ni resonar hasta liberar.
- **Equipo**: de 1 a 3 ánimas de la colección, en orden (el orden es el de la colocación propuesta). Se cambia fuera de combate. La inicial no tiene nada especial salvo su historia.
- Ficha de un ánima: nombre, familia, nivel y XP hasta el siguiente, pureza, aspecto, sus botones (los bloqueados con «nivel 3» / «nivel 10»), genes D y ocultos revelados (los demás como «?»), ecos (●●○○○), padres (si es eco) y origen («Atrapada en Marismas Quietas», «Eco de Brix y Luma», «Elegida en el santuario»).

### 6.2 Liberar `[coleccion.liberar]` (D-068: sí)
Con confirmación, irreversible. **Por debajo de `nivel_madurar` (5) no da nada (QA B-06)**; desde ahí da `1 + floor(nivel / 5)` de esencia (nivel 5 → 2; 10 → 3; 30 → 7). No se puede liberar la última ánima ni una del equipo. Si un ánima liberada es padre de otra, su ficha mínima queda en `linaje` (§7) para seguir mostrando la familia.

**Por qué no se puede explotar:**
- *Resonar para liberar:* un eco nace a nivel 1 y vale 0 (no se recupera nada de la resonancia, que cuesta ≥ 5); la mayor parte de la esencia de liberar de la primera versión venía de ahí (QA: 15 %). Para que un eco valga ≥ 6 hay que subirlo a nivel 25 (3240 XP, ≈ 25 combates), que por sí mismos dan ≈ 400 de esencia. Pérdida siempre en términos relativos.
- *Atrapar para liberar:* cada captura cuesta un farol (1 por victoria) y una salvaje del Cantil (nivel 10–16) vale 3–4, frente a ≈ 25 que da el propio combate: +15 % como mucho en ese combate (y 0 en el Prado), y a cambio de un farol que no se usa para atrapar algo mejor. Es un extra pequeño, no una fuente.
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
  config: { progresion: "0.1", genetica: "0.2", movimientos: "0.5", combate: "0.5" },
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
- Ids de ánima: `idAnima(n) = "a" + n con 6 dígitos` (`a000001`), n = `nacimiento` (inicial, captura o eco, §2.3); así el orden de `<` en `breed` es el de nacimiento.
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
  variantes: { [locus]: { nivel: 15|20|25|30, eje, pieza } }   // §4.5; definitiva; ausente = no tocada o pendiente
}
Hueco = null (cerrado por nivel)
      | { fuente: "gen", locus: LocusId, variante: boolean }   // variante = usar la elegida en vez del original
      | { fuente: "habilidad", id: string }
```
- Nivel = derivado de `xp` (§4.1); no se guarda aparte.
- **Invariantes** (se validan al cargar): `huecos[0] = {gen, extremidades}` siempre; `huecos[k] ≠ null ⇔ nivel ≥ desbloqueos.huecos_pago[k−1].nivel`; un mismo locus o habilidad no ocupa dos huecos; un hueco de pago nunca apunta a extremidades ni a nada de coste 0; `variante = true` solo si `variantes[locus]` existe.
- Al subir de nivel y abrirse un hueco, se rellena con su `locus_por_defecto` si ese locus no está ya en otro hueco; si lo está (paso 2), con el primer locus de pago libre en el orden `cola, cabeza, cuerpo`.
- **Repertorio** de un ánima = movimientos de sus genes D de cabeza, cuerpo y cola + sus variantes elegidas + `aprendidas`. En el paso 1 lo único que el jugador cambia es `variante` (original o variante, en el santuario, gratis); el paso 2 añade «poner X del repertorio en el hueco k».
- La variante se guarda como la pieza cambiada `{eje, pieza}` (QA B-08), no como letra ni como movimiento: se reensambla desde el movimiento de gen con `assembleExact`.

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
| Resonancias tras 3 sesiones (con victorias en el rango 80/70/55 – 100 %) | mediana ≥ 20, p10 ≥ 15 | 22 / 16 en el peor caso (QA eco.mjs con esta config) |
| Resonancias en la sesión 1 | mediana ≥ 2 | 5–9 |
| Minutos por sesión (modelo de tiempo) | 10–20 | ≈ 15 |
| Nivel del favorito tras 3 sesiones | mediana 15–22 | 17–22 |
| Combates hasta nivel 30 (favorito) | mediana **28**–70 (QA B-15: un jugador que lo gana todo llega en 31; 5 sesiones para el tope está bien, el mínimo vigila que no sea en 3) | 31 / 39 / 47 |
| Atrapar al 1.er intento / con reintento | 60–80 % / 85–97 % | ≈ 64 % (QA) / ≈ 95 % |
| Victorias del jugador modelo | Prado ≥ 80 %, Marismas ≥ 70 %, Cantil 55–80 % | sin estimar (falta combate real) |
| Primer combate (inicial + acompañante) | ≥ 90 % | sin estimar |
| Espejo 4 contra 3 movimientos | 52–65 % para el de 4 | sin estimar |
| Espejo 4 contra 2 movimientos | 60–85 % para el de 4 | sin estimar |
| Turnos por combate salvaje | Prado ≤ 6, Cantil ≤ 9; empates ≤ 2 % | sin estimar |
| Bloqueo por esencia | % de momentos "hay pareja madura pero no esencia" ≤ 50 % | alto (≈ el freno principal) |
| Colección llena en 3 sesiones | 0 % de partidas | ≈ 36 de 100 |
| Espejo nivel 30 con variantes (A o B) vs originales | 45–55 % | ≈ 50 % (mismo presupuesto) |
| Variante concreta más fuerte (pieza gratis) | ninguna > 58 % | sin estimar |
| Locus con n < 2 (respaldo) | ≤ 5 % de genes; gratis ≤ 15 % | QA: n = 0 en 0/72 y n = 1 en 3/72 antes del filtro de puntos efectivos |
| Variantes que gastan más puntos efectivos que `M`, o con más piezas y la misma potencia | 0 (test del núcleo) | 0 por construcción |
| Esencia de liberar / esencia total | ≤ 15 % | < 10 % (sin pago por ecos de nivel < 5) |
| 3 contra 3 con el motor ampliado | 100 % de hashes iguales al motor anterior | 100 % (obligatorio) |

Escenarios de victorias: el analista mide las reales; para la economía sin combate usa los tres del revisor (100 %, 90/80/70, 80/70/55). Informativo: % de victorias sin acompañante en los 2 primeros combates; primera mutación (con 20 ecos, P(≥ 1) ≈ 1 − 0,922²⁰ ≈ 80 %); primera ánima híbrida; % de huecos 1/2/3 abiertos en las salvajes por zona; esencia sobrante; ritmo de la variante "cuidador".

**Lectura**: si fallan victorias por zona, primero `ia_salvaje` y luego los niveles de zona; si falla el ritmo de resonancia, `resonancia.coste_base` y `esencia_por_salvaje`; si el espejo 4 contra 2 pasa de 85 %, adelantar el hueco 2 a nivel 2; si una variante rompe el espejo, se excluye su pieza de los ejes `[variantes.piezas_excluidas]` (nunca se toca MOV). Nunca se tocan estadísticas ni reglas de COM.

---

## 10. Notas para el núcleo y el cliente

### 10.1 Núcleo (`packages/core/src/progression/`, nombres internos en inglés)
- `parseProgressionConfig(json, gen)`: valida rangos, `xp_total` (longitud = `nivel_max`, empieza en 0, estrictamente creciente), huecos de pago con niveles crecientes y loci distintos de pago, ids con `^[a-z0-9_]+$`, pesos ≥ 0 con suma > 0, `grupo_pesos` de longitud `grupo_max`, `pct_min ≤ pct_max` (enteros en 0..100), fórmula de tiradas del encuentro, `revelar_ocultos` con longitudes iguales y posiciones válidas. `variantes`: niveles crecientes ≤ `nivel_max`, un locus distinto por nivel, `orden_respaldo` = permutación de los 4 loci, ejes ⊂ {modificador, estado, condicion}, `holgura_puntos` ≥ 0, `tiradas` = 2, piezas excluidas existentes en MOV. `liberar`: `esencia_base ≥ 0`, `divisor_nivel ≥ 1`, `nivel_minimo` ≥ 1.
- API orientativa (todas puras; devuelven estado nuevo):
  `levelOf(xp)`, `unlockedSlots(level)`, `newGame(seed)`, `starterOptions(game)`, `chooseStarter(game, k, name?)`, `rollEncounter(game, zoneId)` (622 tiradas), `combatantOf(anima, cfg)`, `wildAi` ("instinto"), `applyBattleResult(game, encounter, result, teamHp)` (XP, esencia, faroles, niveles, revelaciones, `nivel_max_alcanzado`), `catchChance(...)`, `throwLantern(game, wildIdx)` (1 tirada), `canResonate(game, a, b)` (motivo o null, sin tiradas), `resonate(game, a, b)` (280), `moveVariants(gene, level, cfg)` → `{A, B}` (2 tiradas, §4.5, pura: solo depende de la clave, el nivel y las configs), `chooseVariant(game, animaId, level, "A"|"B")` (guarda `{eje, pieza}`), `assembleExact(move, cambio)` → movimiento o null, `toggleVariant(game, animaId, slot)`, `release(game, id)`, `setTeam`, `rename`, `serialize(game)` / `parseSave(text)` (sin tiradas).
- **Extensión del motor**: tabla y condición de no regresión de §2.2 (hashes de ≥ 200 partidas 3 contra 3 guardados **antes** de tocar el motor).
- **Variantes**: el ensamblado de MOV §4.1 se reutiliza sin respaldo (función `assembleExact(arq, c, piezas)` que devuelve el movimiento o null); no cambia `generateMove` ni el catálogo ni sus tiradas. `breed` ya expone `trace` (slots) y `mutations`: no hay que cambiarlo.
- Tests mínimos: variantes deterministas (misma clave y nivel ⇒ mismas A y B), `puntosEf` ≤ original y ≥ original − holgura, ninguna variante con más piezas y la misma potencia (QA B-01), capturas con variante pendiente, recarga con `{eje, pieza}` inválida → pendiente, mismo coste y arquetipo, respaldo n = 0 y n = 1, el eco no hereda variantes; liberar no deja liberar la última ni una del equipo; tabla de niveles; huecos por nivel; combatiente con 2 y 3 movimientos (gratis bien localizado, sin hueco fuera de rango); 1 contra 1, 2 contra 3; determinismo de encuentro/farol/resonancia con la misma semilla; guardar → cargar → mismo hash; carga que rechaza invariantes rotos.
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
| PR5 | Faroles: 6 + 1 por victoria, tope 12 | Ilimitados (sin decisión); recarga por tiempo (reloj, presión de móvil); compra |
| PR6 | Curva entera `5·(L−1)·(L+2)`, nivel 30 en ~42 combates | Curva exponencial (prohibida y opaca); lineal (los niveles altos llegan demasiado pronto) |
| PR7 | XP completa para todo el equipo | Dividir entre el equipo (castiga llevar ecos); solo a las que actúan (castiga apoyo) |
| PR8 | Cola a nivel 1, cabeza a 3, cuerpo a 10; madurar a 5 | Que el jugador elija qué gen abre (decisión sin información a nivel 1); kit completo a 30 (desigualdad de combate que dura y afecta al PvP); madurar a 10 (frena la 1.ª resonancia a la 2.ª sesión) |
| PR9 | Niveles 15/20/25/30: una de dos variantes (una pieza cambiada, mismos puntos efectivos de presupuesto, D-070); 8–29 revelan genes ocultos como premio menor (D-068) | Solo revelar genes (descartado por Miguel); estadísticas (D-029 B); nunca más daño ni por objetivo ni en total (descartado en D-070) |
| PR9b | Variante de un locus fijo por nivel (cola, cabeza, cuerpo, gratis) | El jugador elige qué movimiento varía (4 elecciones encadenadas, más pantalla; se puede añadir en el paso 2) |
| PR9c | Elección A/B definitiva, conmutable con el original | Reversible A/B (sin identidad); sin vuelta al original (castiga probar) |
| PR9d | Variantes por enumeración de piezas + 2 tiradas fijas | Sorteo libre de piezas con la gramática (puede repetir el original o no caber; consumo variable) |
| PR16 | Liberar: 0 por debajo de madurar; desde ahí `1 + floor(nivel/5)` | `2 + floor(nivel/3)` (capturas daban hasta un 30 % extra); `1 + floor(nivel/5)` desde nivel 1 (ecos de nivel 1 devolvían el ~14 % de la resonancia: 15 % del total, QA B-06); sin recompensa |
| PR17 | Atrapar en porcentajes enteros, una sola función | Decimales con `r2` (el orden de operaciones cambia el % en 141 de 91 001 casos, QA B-07) |
| PR18 | Variantes con "puntos efectivos ≤ original" (D-070) | "Potencia ≤ original" (dejaba pasar piezas gratis en topes, QA B-01; y D-070 permite más potencia si se quita otra pieza) |
| PR19 | Huir antes del turno 1 gratis | Cobrar 1 farol (castiga explorar; se reserva por si se abusa) |
| PR10 | Eco nace a nivel 1 | Nivel medio de los padres (el eco no tendría historia propia que contar) |
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
Ninguna. Las de la primera versión las contestó Miguel en D-068; la interpretación de «sin más fuerza» en D-070.
Para el director, sin bloquear: si el analista ve que el gratis tiene pocas variantes (> 15 % con n < 2), la variante del nivel 30 pasa a «cualquier movimiento de pago sin variante todavía» (ajuste de esta spec). Huir antes del turno 1 (PR19) queda gratis salvo abuso en la prueba.

## 14. Cambios
Primera versión (2026-11-16), actualizada el mismo día con D-068, D-070 y la revisión QA:
| Sección | Primera versión | Ahora | Origen |
|---|---|---|---|
| Cabecera, §0 | movimientos v0.4 | catálogo `movimientos.v0.5.json`, misma gramática | D-069 |
| §2.2 | extensión de equipos 1–3 propuesta (P-3) | confirmada; tabla de cambios del motor y hashes idénticos en 3 contra 3; huir antes del turno 1 aceptado | D-068, QA B-12 |
| §2.3 | ids y `nacimientos` de salvajes sin definir | id temporal `w<n>-<i>`; al atrapar `m = ++nacimientos`; inicial `m = 1` | QA B-04 |
| §2.5 | objetivo de la IA salvaje sin definir | el automático de COM | QA B-13 |
| §3.2 | probabilidad con decimales y `r2` | porcentajes enteros, una función; `dn` sin acompañante | QA B-07, B-16 |
| §3.3 | faroles 5, tope 10 | 6, tope 12 | economía QA |
| §3.5 | "se escapa" ambiguo | escapa al fallar el 2.º | QA B-11 |
| §4.2 | derrota `floor(0,5·x)` | `floor(x/2)`; nota sobre madurar | QA B-07, B-14 |
| §4.3, §4.5 | solo revelar genes | variantes en 15/20/25/30; capturas con variante pendiente | D-068, QA B-03 |
| §4.5 | potencia ≤ original; ejes ambiguos; n = 1 → «mantener»; se guarda la letra | **puntos efectivos ≤ original** (y ≥ original − 3); tabla cerrada de ejes por movimiento; n < 2 → respaldo; se guarda `{eje, pieza}`; ejemplo con MOV v0.5 | D-070, QA B-01, B-02, B-05, B-08, B-09, B-10 |
| §5.2 | coste 6 + ecos; esencia 4 + nivel/2 | 5 + ecos; 5 + nivel/2 | economía QA (p10 14 → 16) |
| §6.2 | liberar pendiente, luego `1 + floor(nivel/5)` | 0 por debajo de madurar; `1 + floor(nivel/5)` desde ahí | D-068, QA B-06 |
| §7.1 | `movimientos: "0.4"` | `"0.5"` | QA B-08 |
| §9.2 | nivel 30 en 35–70 combates | 28–70; estimaciones con el Monte Carlo del revisor | QA B-15 |
| §1.2, CFG | nombres provisionales (P-4) | marcados `"provisional": true` | D-068 |
