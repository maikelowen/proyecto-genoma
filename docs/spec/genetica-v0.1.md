# Especificación de genética v0.1 — Proyecto Genoma

Estado: borrador para simulación (Fase 0). Autor: Diseñador de sistemas. Fecha: 2026-11-10.
Configuración: `config/genetica.v0.1.json` (en adelante **CFG**). Todo número de esta spec está en CFG con la ruta indicada como `[ruta]`; si hay discrepancia, **gana CFG** y se abre incidencia.

Notación: `u` = `rng.next()` (uniforme [0,1), 1 tirada). `N()` = normal estándar aproximada (sec. 9.1, 4 tiradas). `r2(x)` = `Math.round(x*100)/100` `[redondeo_decimales]`. `clamp(x,a,b)` = min(max(x,a),b).

---

## 1. Modelo de datos

### 1.1 Constantes de orden (fijas, usadas por los sorteos)
| Concepto | Orden | CFG |
|---|---|---|
| Loci | cabeza, cuerpo, extremidades, cola | `orden_loci` |
| Valores | potencia, velocidad, resistencia | `orden_valores` |
| Familias base | llama, marea, brote, roca, voltio, sombra | `familias.base` |
| Slots al heredar | A.D, A.R1, A.R2, B.D, B.R1, B.R2 | `orden_slots_padres` |
| Parámetros de forma | tamano, alargamiento, angulosidad, ornamento | `forma.parametros` |

### 1.2 Gen (instancia dentro de una criatura)
| Campo | Tipo | Rango / formato |
|---|---|---|
| `id` | string | base: `familia.locus.N` (N∈1..3), p. ej. `llama.cabeza.1`; mutado: `familia.locus.mFFFF`, p. ej. `vapor.cabeza.m2413` |
| `familia` | FamilyId | una de las 6 base o 7 híbridas |
| `locus` | LocusId | uno de los 4 loci |
| `forma` | number[4] | cada uno ∈ {0, 0.25, 0.5, 0.75, 1} `[forma.paso_rejilla]` |
| `firma` | string | 4 dígitos `round(forma[i]*4)` ∈ 0..4 `[forma.niveles]` |
| `movimiento` | string | base: `mov:<id>`; mutado: `mov:prov:<id>` (provisional hasta la gramática de movimientos) |
| `ancla` | {potencia, velocidad, resistencia} | cada uno ∈ [12, 50] `[valores.ancla_min/max]`; **suma = 90** `[valores.suma_ancla]`; 2 decimales |
| `valores` | {potencia, velocidad, resistencia} | cada uno ∈ [5, 60] `[valores.absoluto_min/max]` y `|valor − ancla| ≤ 10` `[valores.desviacion_max]`; 2 decimales |
| `origen` | "base" \| "mutacion" | cómo nació esta línea del gen |

`id`, `familia`, `locus`, `forma`, `firma`, `movimiento` son propiedades del **tipo de gen** (iguales en todas sus copias). `ancla` y `valores` son de la **instancia** (viajan con la copia y la deriva solo toca `valores`).

### 1.3 Locus, genoma, criatura
- `Locus = { D: Gen, R1: Gen, R2: Gen }`. Los tres genes tienen `locus` igual al del locus. Se permite que D, R1 y R2 sean el mismo tipo de gen (homocigoto).
- `Genoma = { cabeza: Locus, cuerpo: Locus, extremidades: Locus, cola: Locus }`.
- `Criatura = { id: string, genoma: Genoma, familia: FamilyId (derivada, sec. 7), generacion: int ≥ 0 (salvaje = 0; cría = max(padres)+1), padres: [idA, idB] | null, crias: int 0..5, nacimiento: int (tick/generación en que nace) }`.
- Revelado de R1/R2 al jugador: fuera de alcance de genética (solo flag de UI).

---

## 2. Catálogo base y criaturas salvajes

### 2.1 Catálogo (72 genes = 6 familias × 4 loci × 3 variantes `[salvaje.variantes_por_familia_y_locus]`)
La lista explícita está en `catalogo_base.genes` y es la autoridad. Se generó así (`catalogo_base.generador`):
- `ancla = perfil_familia + mod_locus + mod_variante` (vectores pot/vel/res; todos los perfiles suman 90 y los modificadores suman 0 ⇒ toda ancla base suma 90).
- `forma = clamp(forma_familia + forma_locus + forma_variante, 0, 1)` (todo en rejilla 0,25). Las 3 variantes de un mismo familia-locus tienen firmas distintas (verificado).

| Perfil familia (pot/vel/res) | | Mod. locus | | Mod. variante | |
|---|---|---|---|---|---|
| llama 40/28/22 | roca 32/18/40 | cabeza +3/0/−3 | extremidades −1/+3/−2 | 1: 0/0/0 | 3: −2/+4/−2 |
| marea 27/27/36 | voltio 28/42/20 | cuerpo −2/−2/+4 | cola 0/−1/+1 | 2: +4/−2/−2 | |
| brote 30/30/30 | sombra 35/35/20 | | | | |

Formas: familia llama [0.5,0.75,0.75,0.5], marea [0.5,0.5,0.25,0.25], brote [0.25,0.5,0.25,0.75], roca [0.75,0.25,0.75,0.25], voltio [0.25,0.75,1,0.5], sombra [0.5,0.75,0.5,0.75]; locus cabeza [0,0,0,0], cuerpo [+0.25,−0.25,0,0], extremidades [0,+0.25,0,−0.25], cola [−0.25,+0.25,0,0]; variante 1 [0,0,0,0], 2 [+0.25,0,−0.25,+0.25], 3 [−0.25,0,+0.25,−0.25].

Las familias híbridas **no** tienen genes en el catálogo: solo existen como genes mutados.

### 2.2 Generación de criatura salvaje — `salvaje(rng, familiaForzada?, puro?)`
Consume exactamente **181 tiradas** `[salvaje.tiradas_por_criatura]`.
```
t = u;  principal = familiaForzada ?? BASE[floor(t*6)]          // 1 tirada, siempre se consume
para locus en ORDEN_LOCI:
  para slot en [D, R1, R2]:
    uc = u; uf = u; uv = u                                        // 3 tiradas
    n  = [N(), N(), N()]                                          // 12 tiradas
    p  = (slot == D) ? 0.70 : 0.40                                // [salvaje.prob_D/R_familia_principal]
    si puro:            fam = principal
    si no, si uc < p:   fam = principal
    si no, si slot==D:  fam = (BASE sin principal)[floor(uf*5)]   // otra familia, uniforme
    si no:              fam = BASE[floor(uf*6)]                   // cualquiera, incl. principal
    tipo = catalogo[fam.locus.(floor(uv*3)+1)]
    ancla = copia de tipo.ancla
    valores[k] = r2(clamp(ancla[k] + 2.0*n[k], max(5, ancla[k]-10), min(60, ancla[k]+10)))   // σ [salvaje.sigma_valores]
generacion = 0; padres = null; crias = 0; familia = sec. 7
```
`puro=true` solo lo usa el simulador (E4). Los salvajes nunca llevan genes mutados ni híbridos.

---

## 3. Herencia

### 3.1 Decisión R1/R2 (ambigüedad resuelta)
Por locus se eligen **3 slots distintos** de los 6 de los padres (sorteo **sin reemplazo de slot**):
- **D** con `pesos_D` por padre: D 0,375 · R1 0,094 · R2 0,031 `[herencia.pesos_D]` (documento de diseño).
- **R1** y luego **R2** con `pesos_R` por padre: D 0,20 · R1 0,17 · R2 0,13 `[herencia.pesos_R]`, poniendo peso 0 a los slots ya elegidos.
- Sin reemplazo de **slot**, no de **tipo**: si dos slots llevan el mismo tipo de gen, la cría puede tenerlo en D y en R1.

Motivo: sin reemplazo evita copiar el mismo slot dos veces (que colapsaría la diversidad oculta); `pesos_R` más planos que `pesos_D` mantienen vivos los recesivos (base de la "sorpresa") pero siguen favoreciendo un poco lo expresado, así el jugador que cría por un rasgo visible lo conserva también oculto.

### 3.2 Pseudocódigo — `criar(p1, p2, rng)`
Precondiciones (si no se cumplen, error sin consumir tiradas): `p1.id ≠ p2.id`; ambos `crias < 5` `[limites_sim.max_crias_por_criatura]`; ambos con edad ≥ 1 generación `[limites_sim.edad_minima_generaciones]` (en el juego, nivel mínimo; fuera de genética).
```
(A, B) = ordenar [p1, p2] por id (comparación de strings, ascendente)   // criar(x,y) == criar(y,x)
para locus L en ORDEN_LOCI:                                             // 70 tiradas por locus
  S = [A.L.D, A.L.R1, A.L.R2, B.L.D, B.L.R1, B.L.R2]
  wD = [.375,.094,.031,.375,.094,.031];  wR = [.20,.17,.13,.20,.17,.13]
  muta = u < 0.02                                       // t1   [mutacion.prob_por_locus]
  iD   = rng.weightedIndex(wD)                          // t2   (se consume aunque muta)
  ex   = muta ? {} : {iD}
  i1   = rng.weightedIndex(wR con 0 en ex)              // t3
  i2   = rng.weightedIndex(wR con 0 en ex ∪ {i1})       // t4
  nDer = 9 × N()  en orden gen(D,R1,R2) × valor(pot,vel,res)   // t5–t40
  uh = u; up = u                                        // t41, t42
  nAn  = 3 × N()  (pot,vel,res)                         // t43–t54
  nFo  = 4 × N()  (forma 0..3)                          // t55–t70
  D  = muta ? mutar(A.L.D, B.L.D, uh, up, nAn, nFo) : copiarConDeriva(S[iD], nDer[0..2])
  R1 = copiarConDeriva(S[i1], nDer[3..5])
  R2 = copiarConDeriva(S[i2], nDer[6..8])
cria.familia = sec. 7; cria.generacion = max(A.gen, B.gen) + 1; A.crias++; B.crias++
```
Total **280 tiradas por cría** `[herencia.tiradas_por_cria]`. `copiarConDeriva` en sec. 6; `mutar` en sec. 4.

Estimación analítica (a verificar): con `pesos_D` del documento, P(D sale de un slot recesivo) = 2·(0,094+0,031) = **25 % por locus**, ⇒ hasta ~68 % de crías con algún D "nuevo". Ver sec. 10 y 13.

---

## 4. Mutación — `mutar(gA, gB, uh, up, nAn, nFo)`
Probabilidad 2 % por locus `[mutacion.prob_por_locus]` ⇒ 1 − 0,98⁴ = **7,8 %** de crías con ≥1 mutación (3 % ⇒ 11,5 %; 4 % ⇒ 15,1 %). Elegimos 2 % por defecto: con 3 % ya se roza el techo de 12 % de la sec. 10. La mutación sustituye al **D** de la cría; R1/R2 se heredan normal. `gA`, `gB` = genes D de los padres en ese locus.

**4.1 Familia** (sin tiradas extra; usa `uh`, `up`). `elegir(x, y) = up < 0.5 ? x : y` `[mutacion.prob_eleccion_padre_A]` (x = familia de gA).
| Caso (fA = gA.familia, fB = gB.familia) | Resultado |
|---|---|
| fA = fB | fA |
| ambas base y {fA,fB} está en la tabla (sec. 5) → H | `uh < 0.5` `[prob_hibrida_nueva]` ? H : elegir(fA,fB) |
| ambas base, par sin híbrida | elegir(fA,fB) |
| una híbrida H y la otra base Z, Z ∈ componentes(H) | `uh < 0.75` `[prob_hibrida_afinidad]` ? H : Z |
| una híbrida H y la otra base Z ∉ componentes(H) | elegir(fA,fB) |
| ambas híbridas distintas | elegir(fA,fB) |

**4.2 Ancla** (presupuesto constante: la mutación redistribuye, nunca suma poder):
```
m[k] = (gA.ancla[k] + gB.ancla[k]) / 2 + 3.0 * (nAn[k] − media(nAn))   // σ [mutacion.sigma_ancla]; ruido de suma 0
m[k] = clamp(m[k], 12, 50)
repetir hasta 3 veces [mutacion.reintentos_reparto_suma]:
  e = 90 − Σm;  si |e| < 1e-9 [mutacion.epsilon_suma]: salir
  libres = (e > 0) ? {k : m[k] < 50} : {k : m[k] > 12}
  para k en libres: m[k] = clamp(m[k] + e/|libres|, 12, 50)
m[k] = r2(m[k]);  m[primer k en orden pot,vel,res con 12 < m[k] < 50] += r2(90 − Σm)   // ajuste de redondeo
```
**4.3 Valores** (conserva la especialización del linaje): `v[k] = r2(clamp(m[k] + ((gA.valores[k]−gA.ancla[k]) + (gB.valores[k]−gB.ancla[k]))/2, max(5, m[k]−10), min(60, m[k]+10)))`.

**4.4 Forma y firma**
```
f[i] = round(clamp((gA.forma[i] + gB.forma[i])/2 + 0.15*nFo[i], 0, 1) * 4) / 4     // σ [mutacion.sigma_forma]
si (familia, firma(f)) coincide con la de gA o gB:          // garantiza que "mutar" cambia algo
  para i en índices ordenados por |nFo[i]| desc (empate: índice menor):
    paso = nFo[i] >= 0 ? +0.25 : −0.25;  si f[i]+paso ∉ [0,1]: paso = −paso
    f' = f con f[i] += paso;  si (familia, firma(f')) ≠ la de gA y la de gB: f = f'; salir
```
(4 candidatos y como mucho 2 bloqueados ⇒ siempre hay solución.)

**4.5 Identidad, id y movimiento**: clave = `familia|locus|firma` (sec. 8). Si coincide con un gen del catálogo, el tipo es ese gen base (toma su `id` y `movimiento`; no entra en Genedex). Si no: `id = familia.locus.m<firma>`, `movimiento = mov:prov:<id>`. `origen = "mutacion"`. Registrar en Genedex si es nueva (sec. 8).

---

## 5. Familias híbridas `[familias.hibridas]`
| Híbrida | Componentes | | Híbrida | Componentes |
|---|---|---|---|---|
| Vapor | Llama + Marea | | Espora | Brote + Sombra |
| Magma | Llama + Roca | | Abismo | Marea + Sombra |
| Tormenta | Voltio + Marea | | Liquen | Brote + Roca |
| Plasma | Llama + Voltio | | | |

- 7 de los 15 pares posibles; cada familia base participa en 2–3 híbridas (llama 3, marea 3, resto 2). Los otros 8 pares no producen híbrida.
- **Sin híbridas de segundo orden**: híbrida + algo nunca crea una familia nueva (tabla 4.1). Universo cerrado: 13 familias.
- Retrocruce (híbrida × su componente) favorece la híbrida (75 %): permite **fijar** la línea híbrida.
- Una híbrida cuenta como su propia familia en el recuento de la sec. 7 (no suma a sus componentes). Su ventaja/desventaja de tipo es materia del spec de combate.

---

## 6. Deriva — `copiarConDeriva(g, n[3])`
Cada gen copiado (no mutado) conserva tipo y `ancla`; sus `valores` derivan:
```
para k en (pot, vel, res):
  v' = g.valores[k] + 0.05*(g.ancla[k] − g.valores[k]) + 1.0*n[k]      // [deriva.kappa], [deriva.sigma]
  v' = r2(clamp(v', max(5, g.ancla[k] − 10), min(60, g.ancla[k] + 10)))
```
Tres límites: (1) **ruido pequeño** σ=1 por generación; (2) **retorno al ancla** κ=5 % (frena la especialización cuanto más se aleja); (3) **techo duro** ±10 sobre el ancla y [5, 60] absoluto. Sin selección, la desviación típica de equilibrio es ≈ σ/√(1−(1−κ)²) ≈ 3,2. Con selección fuerte, la desviación tiende a ≈ ganancia/κ y queda capada en +10 (≈ +35 % sobre un ancla de ~28). El ancla solo cambia por mutación y conserva la suma 90 ⇒ especializar velocidad cuesta potencia/resistencia.

---

## 7. Familia de la criatura
1. Contar las familias de los 4 genes D (híbrida = su propia familia).
2. Gana la de mayor recuento.
3. Empate: gana la familia del D del primer locus en orden cabeza > cuerpo > extremidades > cola entre las empatadas ("la cabeza manda"; legible para el jugador, sin tiradas).

---

## 8. Identidad de gen y Genedex
- **Mismo gen ⇔ misma clave `familia|locus|firma`.** `ancla`, `valores` y linaje no cuentan. Consecuencia: dos genes iguales se ven idénticos (la forma es la firma) y comparten movimiento.
- Espacio: 13 familias × 4 loci × 5⁴ firmas = 32.500 identidades (72 son base).
- **Catálogo** = los 72 base (conocidos de inicio, no cuentan en Genedex). **Genedex** = identidades mutadas. Entrada: `{clave, id, primeraVez (tick/nº de cría global), criaturaId, propietarioId, padres:[idA,idB]}`. Solo se registra la primera aparición; las siguientes cuentan como "redescubrimiento".

---

## 9. Determinismo y orden de tiradas
### 9.1 Primitivas
- Única fuente: el `Rng` del núcleo (`createRng`, sfc32). Se usan `next()` (1 tirada) y `weightedIndex()` (1 tirada, peso 0 nunca sale).
- `N() = (u+u+u+u − 2) × 1,7320508075688772` `[normal]` (Irwin–Hall, 4 tiradas, rango ±3,46). **Prohibido `rng.normal`** en genética: Box–Muller usa `Math.log/Math.cos`, cuyo resultado no está garantizado bit a bit entre motores JS.
- Solo aritmética `+ − × /`, `Math.round`, `Math.floor`, min/max: deterministas en cualquier motor.

### 9.2 Orden
- **Consumo fijo**: salvaje 181, cría 280 (70/locus), se usen o no los valores (p. ej. ruido de mutación cuando no muta). Así, cambiar `prob_por_locus` no desalinea el flujo: en un barrido con la misma semilla, las crías que no mutan en ninguna de las dos configuraciones salen **idénticas** (comparación pareada).
- Orden dentro de cría: loci en `orden_loci`; por locus exactamente t1…t70 de la sec. 3.2.
- Semilla: quien llama pasa el `rng`. Recomendado: un `rng` por evento de cría, `createRng(semillaMundo + "|cria|" + nCriaGlobal)` (servidor); el simulador usa `createRng(semillaEjecucion)` secuencial.

---

## 10. Métricas y criterios de éxito para el simulador `[escenarios_sim]`, `[criterios_sim]`
### 10.1 Escenarios
| Id | Montaje |
|---|---|
| E1 cerrada | 500 salvajes; generaciones discretas: barajar, emparejar consecutivos (250 parejas), 2 crías/pareja → 500; 300 gen; 20 semillas |
| E2 con capturas | igual que E1, pero cada generación se reemplaza un 10 % (al azar) por salvajes nuevos |
| E3a deriva pura | 100 clones del mismo genoma salvaje (mismos tipos, valores con ruido salvaje propio), mutación 0; 50 parejas × 5 crías = 250; se quedan las 100 de mayor **velocidad total** (Σ velocidad de los 4 D); 100 gen; 20 semillas. Control: se quedan 100 al azar |
| E3b selección completa | como E3a pero con población salvaje diversa y mutación activa (solo informativo + invariantes) |
| E4 primera híbrida | padre salvaje `puro` llama × `puro` marea; pareja nueva cada 5 crías; contar crías hasta el primer gen Vapor; 10.000 ensayos |

### 10.2 Criterios (umbral = aprobado)
| Métrica | Definición | Umbral |
|---|---|---|
| Sorpresa | E1, media gen 1–20: % crías con algún D cuya clave ≠ D de A y ≠ D de B en ese locus (incluye mutaciones) | 15 %–30 % |
| Diversidad | E1, gen 300, por locus: nº de claves distintas (D+R1+R2); entropía de Shannon H = −Σ pᵢ log₂ pᵢ sobre claves (todos los slots y solo D) | distintas ≥ 12; H_todos ≥ 2,5 bits; H_D ≥ 2,0 bits; H ≥ 50 % de la de gen 0; ninguna clave > 40 % de los D |
| Tasa de mutación | mutaciones / 1000 crías; % crías con ≥1 mutación | 4000·p ± 10 %; 5 %–12 % |
| Genedex | E2: claves nuevas / 1000 crías; fracción de mutaciones que caen en clave ya registrada | gen 1–10 ≥ 40; gen 291–300 ≥ 5; repetidas gen 291–300 entre 10 % y 80 %; las 7 híbridas vistas |
| Primera híbrida | E4: crías hasta el primer gen Vapor | mediana 10–40; p90 ≤ 100 (teórico ≈ 17 / 57) |
| Deriva | E3a: Δ relativo de velocidad total media vs gen 0 | gen 20: +5 %…+30 %; gen 100: ≤ +40 %; control: \|Δ\| ≤ 5 % en gen 100 |
| Invariantes | todas las escenas, cada gen: valores ∈ [5,60], \|valor−ancla\| ≤ 10, ancla ∈ [12,50], Σancla = 90 ± 0,01 | 0 violaciones |
| Determinismo | misma semilla ⇒ mismo hash de población; barrido 2 % vs 3 %: crías sin mutación en ambos idénticas | 100 % |

Reportar también (sin umbral): sorpresa por locus, distribución de familias de criatura, crías hasta la primera **criatura** de familia Vapor en E4, curva de Genedex.

---

## 11. Barridos sugeridos `[barridos_sim]`
| Parámetro | Valores |
|---|---|
| `mutacion.prob_por_locus` | 0,01 · **0,02** · 0,03 · 0,04 |
| `herencia.pesos_D` | **A (doc) 0,375/0,094/0,031** · B 0,45/0,04/0,01 · C 0,47/0,025/0,005 |
| `herencia.pesos_R` | **R0 0,20/0,17/0,13** · uniforme 0,1667/0,1667/0,1666 · igual a pesos_D |
| `mutacion.prob_hibrida_nueva` | 0,25 · **0,5** · 1,0 |
| `deriva.kappa` / `deriva.sigma` | 0,02 · **0,05** · 0,10 / 0,5 · **1,0** · 1,5 |
| `valores.desviacion_max` | 6 · **10** · 14 |
| `mutacion.sigma_forma` | 0,10 · **0,15** · 0,25 |

Prioridad: primero pesos_D × prob_por_locus (afectan a sorpresa), luego deriva. Predicción de sorpresa (con ~85 % de recesivos distintos al D en E1): A ≈ 60–65 %, B ≈ 33 %, C ≈ 22 %.

---

## 12. Decisiones (para DECISIONES.md)
| # | Decisión | Alternativas descartadas |
|---|---|---|
| G1 | R1/R2: sorteo sin reemplazo de slot con `pesos_R` planos | mismo sorteo con reemplazo (duplica slots, colapsa diversidad); R1/R2 = el D no elegido de cada padre (rígido, pierde recesivos de 2ª línea) |
| G2 | Ancla con suma fija 90; mutación solo redistribuye | ancla libre (power creep vía mutación + selección) |
| G3 | Deriva = ruido + retorno al ancla + techo ±10 | paseo aleatorio libre (sin límite); deriva dirigida explícita por el jugador |
| G4 | Forma en rejilla de 5 niveles; identidad = familia+locus+firma | identidad por hash de valores (todo gen sería único, Genedex sin sentido); rejilla de 11 niveles (demasiado parecidos) |
| G5 | Mutación siempre cambia la firma respecto a los padres | permitir mutaciones "vacías" |
| G6 | 7 híbridas, sin segundo orden; retrocruce 75 % | todas las 15 parejas; híbridas de híbridas (explosión) |
| G7 | Empate de familia: manda la cabeza | por suma de valores (opaco); aleatorio (no determinista sin tirada) |
| G8 | Mutación por defecto 2 % por locus | 3 % (11,5 % de crías, al límite) |
| G9 | Normal Irwin–Hall y consumo fijo de tiradas | Box–Muller (`Math.log/cos` no portables); consumo variable (barridos no pareados) |
| G10 | Padres ordenados por id | orden de llamada (criar(x,y) ≠ criar(y,x)) |

---

## 13. Preguntas abiertas para el dueño del juego
1. **Frecuencia de sorpresa.** Los pesos del documento dan ~60–65 % de crías con algún rasgo visible que ningún padre mostraba (el objetivo orientativo es 15–30 %). ¿Preferís breeding muy sorpresivo (A, poco controlable) o controlable con sorpresas ocasionales (B ≈ 33 % / C ≈ 22 %)? **Recomendación:** C o B, decidido con los datos del simulador; el resto de la spec no cambia.
2. **Ningún gen es "mejor" en total (Σancla = 90 siempre).** Implica que el valor de mercado vendrá de rareza, forma, familia, movimiento y especialización, no de genes con más estadística total. ¿Lo aceptáis como principio de balance? **Recomendación:** sí (protege el PvP y la economía); es irreversible en la práctica una vez haya mercado.
