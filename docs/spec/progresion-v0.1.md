# Especificación de progresión v0.1 — colección, atrapar, niveles y resonancia (Fase 2, paso 1)

Estado: propuesta para revisión. Autor: Diseñador de sistemas. Fecha: 2026-11-16.
Primera versión (todo es **[v0.1]**). Configuración: `config/progresion.v0.1.json` (**CFG**); cita `[ruta]`. Si no coinciden, **manda CFG**.
Usa sin cambiarlas: `genetica-v0.2` (**GEN**), `movimientos-v0.4` (**MOV**), `combate-v0.5` (**COM**). **No cambia ninguna regla de combate** para 3 contra 3; solo generaliza el tamaño de equipo para los encuentros salvajes (§2.2, ver P-3).
Decisiones que manda: D-062, D-065, D-066, D-067, D-063 (vocabulario), D-008, D-010, D-011, D-016, D-029 B, D-036 y D-049 (fuera del paso 1).

Notación: `u` = `rng.next()` (1 tirada). `r2(x)` = `Math.round(x·100)/100`. `clamp(x,a,b)`. Solo `+ − * /`, comparaciones y `Math.round/floor/min/max/abs` (sin `**`, `pow`, `sqrt`, `log`, `exp`, trigonométricas). Las cifras marcadas **(estimación)** salen de un Monte Carlo a mano de la economía (sin combate real, victorias supuestas); las valida el analista (§9).

---

## 0. Resumen

| Pieza | Regla v0.1 |
|---|---|
| Inicio | El hechicero Arnal (santuario), 5 líneas de texto; eliges 1 de 3 ánimas puras (Llama, Marea, Brote) de nivel 1 y le pones nombre |
| Encuentros | Tu equipo (1–3) contra 1–3 salvajes, mismo motor v0.5; 3 zonas como datos; las salvajes juegan "por instinto" |
| Atrapar | Tras ganar, un farol por intento, % visible antes de lanzar, 2 intentos como máximo por salvaje; faroles: 5 al empezar, +1 por victoria, tope 10 |
| Niveles | 1–30 por experiencia (tabla entera); 3.er movimiento a nivel 3, madurar a nivel 5, 4.º movimiento a nivel 10; de 8 a 29, cada 3 niveles se revela un gen oculto. **Nunca estadísticas** |
| Resonancia | Dos ánimas maduras, coste 6 + (ecos previos de ambos) de esencia, máximo 5 ecos por ánima (GEN), el eco nace a nivel 1 |
| Colección | Hasta 100 ánimas, equipo de 3, liberar (pendiente de P-1); Codex de genes |
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

Cumple el aviso de `vocabulario.md`: ánimas errantes que se vinculan a guardianes, no almas de personas. Nombres de personaje y zonas **provisionales** (P-4).

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
- **Extensión de tamaño** (para el núcleo): `teamSize` pasa a ser el máximo; cada bando puede tener `n ∈ [tamano_min, 3]`. Colocaciones permitidas por tamaño `[colocaciones_por_tamano]`: 1 → "1+0"; 2 → "2+0" o "1+1"; 3 → las de COM. La IA salvaje coloca con `[colocacion_ia_por_tamano]` (1 → casilla 1; 2 → casillas 1 y 2; 3 → regla de COM §7). Un bando de 1 es "última ánima" desde el turno 1 (COM §2.1). Las 24 tiradas por turno no cambian (dependen de las casillas).
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
| 8, 11, 14, 17, 20, 23, 26, 29 | Se **revela un gen oculto** (§4.4) |
| 30 | Nivel máximo (todos los ocultos revelados) |

- Por qué la cola primero: MOV §3 garantiza que el movimiento de cola es **siempre ofensivo con alcance o área**; así un ánima recién nacida siempre puede hacer daño real. Cabeza y cuerpo pueden ser protección o curación.
- Por qué el kit completo a nivel 10 y no a 30: desde el nivel 10 dos ánimas con los mismos genes son **idénticas en combate**, así que la progresión no rompe el futuro PvP (D-008). El 4.º movimiento llega en la 2.ª sesión para el favorito y en 4–5 combates del Cantil para un eco.
- Ánimas atrapadas: entran con su nivel y todo lo que ese nivel desbloquea (una salvaje de nivel 12 llega con 4 movimientos, madura y con 2 ocultos revelados).
- **Ecos al nacer: nivel 1** `[niveles.nivel_eco_al_nacer]`, gratis + cola. Crece contigo: es el apego.

### 4.4 Revelar genes ocultos `[desbloqueos.revelar_ocultos]`
Al alcanzar el nivel `niveles[i]` se revela la posición `orden[i]` (cabeza.R1, cuerpo.R1, extremidades.R1, cola.R1, después los R2). Además (§5.3), al resonar se revela el oculto de un padre que haya pasado a ser D del eco. Revelar no cambia nada del ánima: la ficha muestra ese gen y lo registra en el Codex. Sirve para resonar con intención (GEN §3: los ocultos salen como D del eco con baja probabilidad y pasan a los ocultos del eco a menudo) y da algo que mirar de nivel 11 a 30 sin tocar el combate. Ver P-2.

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

### 6.2 Liberar `[coleccion.liberar]` (pendiente de P-1)
Propuesta: sí, con confirmación, irreversible. Da `2 + floor(nivel/3)` de esencia. No se puede liberar la última ánima ni una del equipo. Si un ánima liberada es padre de otra, su ficha mínima queda en `linaje` (§7) para seguir mostrando la familia.

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
  aprendidas: [ idHabilidad ]                 // vacío en el paso 1
}
Hueco = null (cerrado por nivel) | { fuente: "gen", locus: LocusId } | { fuente: "habilidad", id: string }
```
- Nivel = derivado de `xp` (§4.1); no se guarda aparte.
- **Invariantes** (se validan al cargar): `huecos[0] = {gen, extremidades}` siempre; `huecos[k] ≠ null ⇔ nivel ≥ desbloqueos.huecos_pago[k−1].nivel`; un mismo locus o habilidad no ocupa dos huecos; un hueco de pago nunca apunta a extremidades ni a nada de coste 0.
- Al subir de nivel y abrirse un hueco, se rellena con su `locus_por_defecto` si ese locus no está ya en otro hueco; si lo está (paso 2), con el primer locus de pago libre en el orden `cola, cabeza, cuerpo`.
- **Repertorio** de un ánima = movimientos de sus genes D de cabeza, cuerpo y cola + `aprendidas`. En el paso 1 el jugador no cambia nada (no hay habilidades); el paso 2 solo añade la acción «poner X del repertorio en el hueco k».

### 8.2 Por qué no rompe la genética
Los movimientos de gen siguen saliendo del gen D (MOV: mismo gen ⇒ mismo movimiento). Los huecos y `aprendidas` son estado **del ánima, no del genoma**: `breed` no los ve, el eco nace con los huecos por defecto y las habilidades no se heredan (D-036). Cambiar un hueco nunca toca genes, pureza ni estadísticas.

### 8.3 Al combatir
`combatienteDeAnima(anima)` = `buildCombatant(criatura)` con `moves` = los movimientos de los huecos abiertos, **en orden de hueco** (gratis primero): de 2 a 4 movimientos. El motor ya trata la lista por posición y localiza el gratis por coste 0 (comprobado en `engine.ts`); falta un test con 2 y 3 movimientos (§10).

---

## 9. Simulación previa (para el analista)

### 9.1 Montaje `[escenarios_sim]`
Semillas nuevas con prefijo `prog01` (no se han usado para elegir números). 500 partidas.
- **Jugador modelo**: equipo = sus 3 ánimas de más nivel (empate: nacimiento); combate en la zona abierta más alta; controla su equipo con la IA de referencia de COM; tras ganar, lanza faroles a la salvaje de más pureza (luego más nivel), hasta 2 por salvaje, una salvaje por combate salvo que le sobren faroles (≥ 6); tras cada combate resuena mientras pueda: pareja de maduras con menos ecos (empate: más nivel) si hay esencia. Variante "cuidador": mete siempre el eco más reciente en el equipo en lugar de la 3.ª de más nivel (mide si usar ecos frena).
- **Tiempo** de combate = turnos × 10 s + 30 s; resonancia 40 s. Sesión = 6 combates (3 sesiones; y 12 sesiones para el nivel 30).
- **Espejos de nivel**: 3 contra 3 con los mismos genomas (catálogo, IA de referencia por los dos lados), un bando con 4 movimientos y el otro con 3 (sin cuerpo) o 2 (sin cabeza ni cuerpo); 4000 combates alternando lado.

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

Informativo: % de victorias sin acompañante en los 2 primeros combates; primera mutación (con 20 ecos, P(≥ 1) ≈ 1 − 0,922²⁰ ≈ 80 %); primera ánima híbrida; % de huecos 1/2/3 abiertos en las salvajes por zona; esencia sobrante; ritmo de la variante "cuidador".

**Lectura**: si fallan victorias por zona, primero `ia_salvaje` y luego los niveles de zona; si falla el ritmo de resonancia, `resonancia.coste_base` y `esencia_por_salvaje`; si el espejo 4 contra 2 pasa de 85 %, adelantar el hueco 2 a nivel 2. Nunca se tocan estadísticas ni reglas de COM.

---

## 10. Notas para el núcleo y el cliente

### 10.1 Núcleo (`packages/core/src/progression/`, nombres internos en inglés)
- `parseProgressionConfig(json, gen)`: valida rangos, `xp_total` (longitud = `nivel_max`, empieza en 0, estrictamente creciente), huecos de pago con niveles crecientes y loci distintos de pago, ids con `^[a-z0-9_]+$`, pesos ≥ 0 con suma > 0, `grupo_pesos` de longitud `grupo_max`, `p_min ≤ p_max`, fórmula de tiradas del encuentro, `revelar_ocultos` con longitudes iguales y posiciones válidas.
- API orientativa (todas puras; devuelven estado nuevo):
  `levelOf(xp)`, `unlockedSlots(level)`, `newGame(seed)`, `starterOptions(game)`, `chooseStarter(game, k, name?)`, `rollEncounter(game, zoneId)` (622 tiradas), `combatantOf(anima, cfg)`, `wildAi` ("instinto"), `applyBattleResult(game, encounter, result, teamHp)` (XP, esencia, faroles, niveles, revelaciones, `nivel_max_alcanzado`), `catchChance(...)`, `throwLantern(game, wildIdx)` (1 tirada), `canResonate(game, a, b)` (motivo o null, sin tiradas), `resonate(game, a, b)` (280), `release(game, id)`, `setTeam`, `rename`, `serialize(game)` / `parseSave(text)` (sin tiradas).
- **Extensión del motor**: bandos de 1 a 3 (`validatePlacement` por tamaño, `allPlacements`, colocación de la IA, sinergia con n < 3). **Vector dorado**: 3 contra 3 idéntico al actual. `breed` ya expone `trace` (slots) y `mutations`: no hay que cambiarlo.
- Tests mínimos: tabla de niveles; huecos por nivel; combatiente con 2 y 3 movimientos (gratis bien localizado, sin hueco fuera de rango); 1 contra 1, 2 contra 3; determinismo de encuentro/farol/resonancia con la misma semilla; guardar → cargar → mismo hash; carga que rechaza invariantes rotos.
- Es **núcleo**: todo lo anterior. Es **cliente**: crear la semilla, `localStorage`, `registro.sesiones`, textos y pantallas.

### 10.2 Cliente (pantallas mínimas)
1. **Título**: continuar / nueva partida (avisa si hay partida).
2. **Santuario**: hechicero con sus 5 líneas (solo la primera vez), elegir inicial entre 3 (aspecto, familia, botones), nombrar. Después: botones «Resonar», «Colección», «Codex», «Salir a explorar».
3. **Zonas**: lista de 3 con nivel y familias; cerradas con «se abre cuando un ánima llegue a nivel X».
4. **Combate**: el de v0.5 con equipos de 1–3; acompañante marcado como «de Arnal».
5. **Tras el combate**: XP ganada por ánima (barra), subidas de nivel y desbloqueos («¡Aprende *X*!», «Ha madurado», «Revela un gen oculto»), esencia y faroles; lista de salvajes con % de atrapar y botón «Lanzar farol (quedan N)»; nombrar la atrapada.
6. **Resonancia**: elegir dos (solo maduras con ecos libres), vista previa (§5.4), confirmar, revelación del eco, nombrar.
7. **Colección y ficha** (§6.1), con equipo (1–3) y liberar.
8. **Codex**: genes por familia y zona del cuerpo (vistos / ?), mutaciones propias.
Sin arte nuevo obligatorio: el ánima se dibuja con el arte v3 a partir de sus genes; el hechicero puede ser una silueta.

---

## 11. Alternativas descartadas (para DECISIONES.md)

| # | Decisión | Alternativas descartadas |
|---|---|---|
| PR1 | Encuentros de tu equipo (1–3) contra 1–3 salvajes con el motor v0.5 | Siempre 3 contra 3 (obliga a prestar 2 ánimas al empezar y hace largos los combates de captura); un modo 1 contra 1 propio (reglas nuevas) |
| PR2 | Acompañante del hechicero mientras tengas < 2 ánimas | Inicial a nivel 3 (contradice D-067); primer combate a cara o cruz; combate guionizado |
| PR3 | IA salvaje "instinto" (gasta en cuanto puede) | IA de referencia (salvajes tan duras como el rival de la Fase 1); IA con azar (más tiradas, menos legible) |
| PR4 | Atrapar con % visible, por vida de tu equipo, nivel y pureza; reintento +20 pp | Vida de la salvaje (siempre 0 al ganar); probabilidad oculta; atrapar a mitad de combate (cambia COM) |
| PR5 | Faroles: 5 + 1 por victoria, tope 10 | Ilimitados (sin decisión); recarga por tiempo (reloj, presión de móvil); compra |
| PR6 | Curva entera `5·(L−1)·(L+2)`, nivel 30 en ~42 combates | Curva exponencial (prohibida y opaca); lineal (los niveles altos llegan demasiado pronto) |
| PR7 | XP completa para todo el equipo | Dividir entre el equipo (castiga llevar ecos); solo a las que actúan (castiga apoyo) |
| PR8 | Cola a nivel 1, cabeza a 3, cuerpo a 10; madurar a 5 | Que el jugador elija qué gen abre (decisión sin información a nivel 1); kit completo a 30 (desigualdad de combate que dura y afecta al PvP); madurar a 10 (frena la 1.ª resonancia a la 2.ª sesión) |
| PR9 | Niveles 8–29 revelan genes ocultos | Variantes de movimiento (gramática nueva, paso 2); estadísticas (D-029 B); nada |
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
5. Que la extensión a bandos de 1–2 deje intacto el vector dorado de 3 contra 3.

## 13. Preguntas abiertas para Miguel (de fondo)

**P-1. ¿Se pueden liberar ánimas?**
- A) Sí, con confirmación, dan un poco de esencia (configurado así). **Recomendada**: la colección no se llena de ánimas que no quieres y la esencia extra suaviza el ritmo.
- B) No; colección ilimitada (más datos guardados, listas largas).
- C) Sí, sin recompensa (evita «atrapar para liberar», que con 1 farol por victoria apenas compensa).
Pesa a futuro: con mercado, liberar retira ánimas de la economía.

**P-2. ¿Qué dan los niveles 11–30, además del 4.º movimiento a nivel 10?**
- A) Revelar un gen oculto cada 3 niveles (configurado así; coste bajo). **Recomendada** para el paso 1.
- B) A + un aura visual por tramos (15/20/25/30) en el arte del ánima (~50–80 k de cliente).
- C) Nada más y bajar el tope a 15 (contradice el 30 orientativo de D-067).
En el paso 2, los niveles altos pueden además dar huecos para habilidades del santuario (D-036).

**P-3. Encuentros con equipos de distinto tamaño (tu 1–3 contra 1–3 salvajes).** No cambia ninguna regla de 3 contra 3, pero amplía el motor congelado.
- A) Sí, como en esta spec. **Recomendada**: combates de captura cortos y empezar con una sola ánima tiene sentido.
- B) Siempre 3 contra 3: el hechicero presta 2 ánimas hasta que tengas 3 propias y los salvajes van siempre en grupos de 3 (combates más largos, ~9 turnos).

**P-4. Nombres provisionales:** hechicero «Arnal, farolero del santuario», «el Gran Farol», zonas «Prado de la Linde», «Marismas Quietas», «Cantil del Farol Roto». ¿Valen o prefieres otros? (No bloquea: están en config.)

## 14. Cambios
Primera versión; no sustituye a ninguna spec.
