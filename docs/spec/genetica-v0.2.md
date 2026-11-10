# Especificación de genética v0.2 — Proyecto Genoma

Estado: v0.2 para implementación y re-simulación (Fase 0). Autor: Diseñador de sistemas. Fecha: 2026-11-10.
Sustituye a `genetica-v0.1.md` (que se conserva). Configuración: `config/genetica.v0.2.json` (**CFG**). Todo número de esta spec está en CFG con la ruta `[ruta]`; si hay discrepancia, **gana CFG** y se abre incidencia. **[v0.2]** marca lo que cambia respecto a v0.1.

Notación: `u` = `rng.next()` (uniforme [0,1), 1 tirada). `N()` = normal estándar aproximada (sec. 9.1, 4 tiradas). `r2(x)` = `Math.round(x*F)/F` con `F = 10^redondeo_decimales` calculado por multiplicación en el parser (`[redondeo_decimales]` = 2). `clamp(x,a,b)` = min(max(x,a),b). `media(n)` = media aritmética del vector.

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
| `id` | string | base: `familia.locus.N` (N∈1..3); mutado: `familia.locus.mFFFF`, p. ej. `vapor.cabeza.m2413` |
| `familia` | FamilyId | una de las 6 base o 7 híbridas |
| `locus` | LocusId | uno de los 4 loci |
| `forma` | number[4] | cada uno ∈ {0, 0.25, 0.5, 0.75, 1} `[forma.paso_rejilla]` |
| `firma` | string | 4 dígitos `round(forma[i]*4)` ∈ 0..4 `[forma.niveles]` |
| `movimiento` | string | base: `mov:<id>`; mutado: `mov:prov:<id>` |
| **[v0.2]** `calidad` | number | ∈ [85,5; 94,5] `[calidad.min/max]` = 90 ± 5 % `[calidad.base, calidad.margen]`; 2 decimales |
| `ancla` | {potencia, velocidad, resistencia} | cada uno ∈ [12, 50] `[valores.ancla_min/max]`; **[v0.2] Σancla = calidad** |
| `valores` | {potencia, velocidad, resistencia} | cada uno ∈ [max(5, ancla−10), min(60, ancla+10)] `[valores.absoluto_min/max, desviacion_max]`; **[v0.2] Σvalores = calidad** |
| `origen` | "base" \| "mutacion" | propiedad de la instancia, no de la clave |

Tipo de gen (igual en todas sus copias): `id`, `familia`, `locus`, `forma`, `firma`, `movimiento`. Instancia (viaja con la copia): `calidad`, `ancla`, `valores`, `origen`. **[v0.2]** Una mutación que cae en una clave del catálogo toma `id` y `movimiento` del gen base, pero conserva su `calidad`, `ancla` y `origen = "mutacion"` (confirma la nota de implementación 7): dos copias del "mismo gen" pueden repartir sus puntos distinto; la UI debe mostrar el reparto de la instancia.

**[v0.2] Inmutabilidad (QA-08):** `forma`, `ancla` y `valores` se crean congelados (`Object.freeze`); ninguna función escribe en un gen existente.

### 1.3 Locus, genoma, criatura
- `Locus = { D, R1, R2 }`, los tres del mismo locus; pueden ser el mismo tipo de gen.
- `Genoma = { cabeza, cuerpo, extremidades, cola }` (cada uno un `Locus`).
- `Criatura = { id, genoma, familia (derivada, sec. 7), generacion (salvaje 0; cría max(padres)+1), padres: [idA,idB] | null, crias: entero 0..5, nacimiento: entero }`. `id` y `nacimiento` los da quien llama.
- **[v0.2]** `calidadCriatura` (derivada, solo UI/mercado) = media de `calidad` de los 4 D; porcentaje mostrado = (calidadCriatura − 85,5) / 9 × 100.

### 1.4 Presupuesto de estadísticas [v0.2] (D-008, irreversible a la baja)
Cada gen tiene un total fijo (`calidad`), asignado **al nacer el gen** y copiado intacto en toda herencia. La deriva y la mutación **solo redistribuyen** puntos entre potencia/velocidad/resistencia; nunca los crean. La única fuente de calidad es la captura (sec. 2.2); la mutación hereda la media de los padres. El valor de mercado debe venir de rareza (familia, Genedex), especialización (reparto), genes ocultos y estética, no de totales.

### 1.5 Función común `repartir(x[3], lo[3], hi[3], S)` [v0.2]
Ajusta un vector a suma S dentro de límites. Precondición: Σlo ≤ S ≤ Σhi (siempre se cumple en esta spec). Sin tiradas.
```
x[k] = clamp(x[k], lo[k], hi[k])
repetir hasta 3 veces [mutacion.reintentos_reparto_suma]:
  e = S − Σx;  si |e| < 1e-9 [mutacion.epsilon_suma]: salir
  libres = (e > 0) ? {k : x[k] < hi[k]} : {k : x[k] > lo[k]}
  para k en libres: x[k] = clamp(x[k] + e/|libres|, lo[k], hi[k])
x[k] = r2(x[k])
r = r2(S − Σx)                                  // |r| ≤ 0,02, múltiplo de 0,01
mientras r ≠ 0:                                  // pasos de 0,01, orden pot → vel → res
  s = signo(r) · 0,01
  k = primer índice con lo[k] ≤ x[k] + s ≤ hi[k];  x[k] = r2(x[k] + s);  r = r2(r − s)
```
Con 3 estadísticas, 3 rondas bastan (cada ronda que deja residuo fija ≥1 estadística en su límite). El bucle final siempre encuentra hueco porque todo está en múltiplos de 0,01 y Σlo ≤ S ≤ Σhi. (Sustituye a la "nota 6" de implementación.)

Límites de uso: anclas `lo = 12, hi = 50`; valores `lo[k] = max(5, ancla[k]−10)`, `hi[k] = min(60, ancla[k]+10)`.

---

## 2. Catálogo base y criaturas salvajes

### 2.1 Catálogo (72 genes = 6 familias × 4 loci × 3 variantes `[salvaje.variantes_por_familia_y_locus]`)
Lista explícita en `catalogo_base.genes` (autoridad); su `ancla` corresponde a calidad 90. Generada con `catalogo_base.generador`:
- `ancla = perfil_familia + mod_locus + mod_variante` (perfiles suman 90, modificadores suman 0).
- `forma = clamp(forma_familia + forma_locus + forma_variante, 0, 1)`; las 3 variantes de cada familia-locus tienen firmas distintas.

| Perfil familia (pot/vel/res) | | Mod. locus | | Mod. variante | |
|---|---|---|---|---|---|
| llama 40/28/22 | roca 32/18/40 | cabeza +3/0/−3 | extremidades −1/+3/−2 | 1: 0/0/0 | 3: −2/+4/−2 |
| marea 27/27/36 | voltio 28/42/20 | cuerpo −2/−2/+4 | cola 0/−1/+1 | 2: +4/−2/−2 | |
| brote 30/30/30 | sombra 35/35/20 | | | | |

Formas: familia llama [0.5,0.75,0.75,0.5], marea [0.5,0.5,0.25,0.25], brote [0.25,0.5,0.25,0.75], roca [0.75,0.25,0.75,0.25], voltio [0.25,0.75,1,0.5], sombra [0.5,0.75,0.5,0.75]; locus cabeza [0,0,0,0], cuerpo [+0.25,−0.25,0,0], extremidades [0,+0.25,0,−0.25], cola [−0.25,+0.25,0,0]; variante 1 [0,0,0,0], 2 [+0.25,0,−0.25,+0.25], 3 [−0.25,0,+0.25,−0.25].

Las híbridas no tienen genes de catálogo: solo existen como genes mutados.

### 2.2 Criatura salvaje — `salvaje(rng, familiaForzada?, puro?)`
**[v0.2] 205 tiradas** `[salvaje.tiradas_por_criatura]` = 1 + 12·(5 + 3·4).
```
t = u;  principal = familiaForzada ?? BASE[floor(t*|BASE|)]
para locus en ORDEN_LOCI, para slot en [D, R1, R2]:
  uc = u; uf = u; uv = u; uq1 = u; uq2 = u                    // 5 tiradas  [v0.2: +uq1, uq2]
  n  = [N(), N(), N()]                                          // 12 tiradas
  p  = (slot == D) ? 0.70 : 0.40                                // [salvaje.prob_D/R_familia_principal]
  fam = puro ? principal
      : uc < p ? principal
      : slot == D ? (BASE sin principal)[floor(uf*(|BASE|−1))]
      : BASE[floor(uf*|BASE|)]
  tipo = catalogo[fam.locus.(floor(uv*3)+1)]
  Q = r2(90 + 90·0.05·(uq1 + uq2 − 1))                         // [v0.2] triangular en [85,5; 94,5]  [calidad]
  ancla = repartir(tipo.ancla[k] · Q / 90, 12, 50, Q)
  valores = repartir(ancla[k] + 2.0·(n[k] − media(n)), loV, hiV, Q)    // σ [salvaje.sigma_valores]
generacion = 0; padres = null; crias = 0; familia = sec. 7
```
**[v0.2] Por qué triangular y no uniforme:** P(Q ≥ 93,6) = 2 % (uniforme: 10 %); un gen de calidad máxima es raro al capturar (valor de rareza), sin que la mayoría de capturas sean "basura" (P(Q ≤ 87,3) = 8 %). La ventaja en combate está acotada por el criterio de la sec. 10.3.

---

## 3. Herencia

### 3.1 Elección de D, R1, R2
Por locus se eligen 3 **slots distintos** de los 6 de los padres (sin reemplazo de slot; el mismo tipo de gen sí puede repetirse):
- **D** con `pesos_D` por padre: **[v0.2] D 0,47 · R1 0,025 · R2 0,005** `[herencia.pesos_D]` (variante C; sorpresa medida 26,5 %).
- **R1**, luego **R2**, con `pesos_R` por padre: D 0,20 · R1 0,17 · R2 0,13 `[herencia.pesos_R]`, con peso 0 en los slots ya elegidos.

### 3.2 `criar(p1, p2, rng)`
**Precondiciones** (si falla alguna: `BreedingError` **sin consumir tiradas**):
- **[v0.2] (QA-02)** `nacimiento` de la cría, `p.nacimiento` y `p.crias` de ambos son enteros (`Number.isInteger`) y `p.crias ≥ 0`.
- `p1.id ≠ p2.id`; ambos `crias < 5` `[limites_sim.max_crias_por_criatura]` (**[v0.2]** el parser exige ≥ 1); `nacimiento − p.nacimiento ≥ 1` `[limites_sim.edad_minima_generaciones]`.
```
(A, B) = ordenar [p1, p2] por id con el operador < de JS (unidades UTF-16)
para locus L en ORDEN_LOCI:                                             // 70 tiradas por locus
  S = [A.L.D, A.L.R1, A.L.R2, B.L.D, B.L.R1, B.L.R2]
  muta = u < 0.02                                       // t1   [mutacion.prob_por_locus]
  iD   = rng.weightedIndex(wD)                          // t2   (se consume aunque muta)
  ex   = muta ? {} : {iD}
  i1   = rng.weightedIndex(wR con 0 en ex)              // t3
  i2   = rng.weightedIndex(wR con 0 en ex ∪ {i1})       // t4
  nDer = 9 × N()  orden gen(D,R1,R2) × valor(pot,vel,res)       // t5–t40
  uh = u; up = u                                        // t41, t42
  nAn  = 3 × N()                                        // t43–t54
  nFo  = 4 × N()                                        // t55–t70
  D  = muta ? mutar(A.L.D, B.L.D, S, uh, up, nAn, nFo) : copiarConDeriva(S[iD], nDer[0..2])
  R1 = copiarConDeriva(S[i1], nDer[3..5]);  R2 = copiarConDeriva(S[i2], nDer[6..8])
cría: familia (sec. 7); generacion = max(A,B)+1; padres = [A.id, B.id]; devolver copias de A y B con crias+1
```
**280 tiradas por cría** `[herencia.tiradas_por_cria]` (**sin cambio** respecto a v0.1).

---

## 4. Mutación — `mutar(gA, gB, S, uh, up, nAn, nFo)`
2 % por locus `[mutacion.prob_por_locus]` ⇒ 7,8 % de crías con ≥1 mutación. Sustituye al D de la cría. `gA`, `gB` = D de los padres en el locus; `S` = los 6 genes de los padres en el locus.

**4.1 Familia.** `elegir(x,y) = up < 0.5 ? x : y` `[mutacion.prob_eleccion_padre_A]` (x = familia de gA).
| Caso | Resultado |
|---|---|
| fA = fB | fA |
| ambas base, par en tabla (sec. 5) → H | `uh < 0.5` `[prob_hibrida_nueva]` ? H : elegir(fA,fB) |
| ambas base, par sin híbrida | elegir(fA,fB) |
| híbrida H + base Z ∈ componentes(H) | **[v0.2]** `uh < 0.5` `[prob_hibrida_afinidad]` ? H : Z (antes 0,75) |
| híbrida H + base Z ∉ componentes(H) | elegir(fA,fB) |
| dos híbridas distintas | elegir(fA,fB) |

**4.2 Calidad [v0.2].** `Q = r2((gA.calidad + gB.calidad)/2)`. Sin ruido: la media de dos valores de 2 decimales redondeada queda entre ambos, así que nunca supera al mejor padre ni sale de [85,5; 94,5].

**4.3 Ancla** (redistribución, suma Q): `m = repartir((gA.ancla[k]+gB.ancla[k])/2 + 3.0·(nAn[k] − media(nAn)), 12, 50, Q)` `[mutacion.sigma_ancla]`.

**4.4 Valores** (conserva la especialización del linaje): `v = repartir(m[k] + ((gA.valores[k]−gA.ancla[k]) + (gB.valores[k]−gB.ancla[k]))/2, loV(m), hiV(m), Q)`.

**4.5 Forma, firma y bloqueo [v0.2] (D-007).**
`Bloq` = conjunto de claves `familia|locus|firma` de **los 6 genes de S** (D, R1, R2 de ambos padres). La clave mutada nunca puede estar en `Bloq`. Solo cuentan los de la misma familia resultante (las demás claves no pueden coincidir).
```
f0[i] = round(clamp((gA.forma[i]+gB.forma[i])/2 + 0.25·nFo[i], 0, 1)·4)/4     // σ [mutacion.sigma_forma] = 0,25 [v0.2]
orden = índices 0..3 por |nFo[i]| descendente (empate: índice menor)
dir[i] = nFo[i] ≥ 0 ? +1 : −1
candidatos, en este orden, y se toma el primero con clave ∉ Bloq:
  N0: f0
  N1: para i en orden: f0 con f[i] += 0.25·dir[i]        (se salta si sale de [0,1])
  N2: para i en orden: f0 con f[i] −= 0.25·dir[i]        (se salta si sale de [0,1])
  N3: las 625 firmas de la rejilla ordenadas por (distancia L1 en pasos a f0, firma como string ascendente)
```
Sin tiradas extra (todo usa `nFo` ya consumido). N3 garantiza solución: hay como mucho 6 claves bloqueadas de 625. N1+N2 aportan entre 4 y 8 vecinos distintos de f0, así que N3 solo se alcanza si los 6 bloqueos caen todos alrededor de f0 (casi imposible; existe para que el algoritmo sea total). `[mutacion.paso_respaldo_max]` = 2 documenta que N1–N2 son vecinos a 1 paso en ambos sentidos. (Corrige QA-10: en v0.1 el texto decía "como mucho 2 bloqueados".)

**4.6 Identidad, id y movimiento.** Clave = `familia|locus|firma`. Si es una clave del catálogo, el tipo es ese gen base (id y movimiento base; no entra en Genedex; conserva calidad, ancla y valores de la mutación). Si no: `id = familia.locus.m<firma>`, `movimiento = mov:prov:<id>`. `origen = "mutacion"`. Registrar en Genedex si es nueva.

---

## 5. Familias híbridas `[familias.hibridas]`
| Híbrida | Componentes | | Híbrida | Componentes |
|---|---|---|---|---|
| Vapor | Llama + Marea | | Espora | Brote + Sombra |
| Magma | Llama + Roca | | Abismo | Marea + Sombra |
| Tormenta | Voltio + Marea | | Liquen | Brote + Roca |
| Plasma | Llama + Voltio | | | |

7 de los 15 pares; sin híbridas de segundo orden (13 familias en total). **[v0.2]** El retrocruce con un componente ya no favorece a la híbrida (50 %, sec. 4.1): la meta "criatura híbrida" se alcanza por la regla de familia (sec. 7), no fijando la línea genética, y así se frena la absorción de la población (problema B, sec. 10.4).

---

## 6. Deriva — `copiarConDeriva(g, n[3])` [v0.2]
Conserva tipo, `calidad`, `ancla` y `origen`. Los valores derivan **con suma cero**:
```
d[k]  = g.valores[k] − g.ancla[k]                                   // Σd = 0
d'[k] = (1 − 0.10)·d[k] + 1.0·(n[k] − media(n))                     // [deriva.kappa] = 0,10 [v0.2]; [deriva.sigma]
valores = repartir(g.ancla[k] + d'[k], loV, hiV, g.calidad)
```
Límites: ruido σ = 1 por generación (efectivo ≈ 0,82 por estadística al restar la media), retorno al ancla del 10 %, techo duro ±10 sobre el ancla y [5, 60]. Subir velocidad cuesta potencia/resistencia en el mismo gen. El ancla solo cambia por mutación (sec. 4.3), también con suma fija.

---

## 7. Familia de la criatura [v0.2]
1. Puntuación por familia = Σ de los 4 genes D: gen base cuenta 1 `[familia_criatura.peso_gen_base]`, **gen híbrido cuenta 2** `[familia_criatura.peso_gen_hibrido]`.
2. Gana la puntuación más alta.
3. Empate: **gana una híbrida** si hay alguna entre las empatadas; si siguen empatadas, la del D del primer locus (cabeza > cuerpo > extremidades > cola).

Ejemplos: Vapor + Llama + Llama + Marea → 2 vs 2 vs 1 → **Vapor**. Vapor + Llama ×3 → 2 vs 3 → **Llama** (una sola parte no "convierte" a una criatura muy marcada). Vapor + Magma + Llama + Roca → 2-2-1-1 → empate entre híbridas → manda la cabeza.

**Por qué así (problema A):** en v0.1 hacían falta ≥2 D Vapor y la primera criatura Vapor desde padres puros tardaba ~1950 crías. Con peso 2 + empate híbrido, en la F1 Llama×Marea basta 1 gen Vapor siempre que los otros 3 loci no sean de la misma familia (P = 0,75). Estimación (Monte Carlo del modelo F1, 20.000 ensayos): **mediana 23 crías, p90 76** (objetivo ≤ 40 / ≤ 120). Con peso 1 + empate híbrido: 1177 / 3872. Alternativa descartada: "cualquier D híbrido manda" (18/58): demasiado barata y contradice el aspecto (3 partes llama, 1 vapor).

---

## 8. Identidad de gen y Genedex
- **Mismo gen ⇔ misma clave `familia|locus|firma`.** Calidad, ancla, valores y linaje no cuentan. 13 × 4 × 625 = 32.500 identidades (72 base).
- **Catálogo** = 72 base (conocidos de inicio). **Genedex** = identidades mutadas; entrada `{clave, id, primeraVez, criaturaId, propietarioId, padres}`; solo la primera aparición. `recordMutations` es la única función con efecto (modifica el registro que recibe).

---

## 9. Determinismo y orden de tiradas
### 9.1 Primitivas
- Única fuente: el `Rng` del núcleo (sfc32). Se usan `next()` y `weightedIndex()` (1 tirada cada una; peso 0 nunca sale).
- `N() = (u+u+u+u − 2) × 1,7320508075688772` `[normal]`. **[v0.2] (QA-04)** el parser valida `centro == n_uniformes/2` y `|factor²·n_uniformes − 12| < 1e-9` `[validacion_config.tolerancia_normal_factor]`.
- **[v0.2] (QA-03) Operaciones permitidas en genética:** `+ − * /`, comparaciones, `Math.round`, `Math.floor`, `Math.min`, `Math.max`, `Math.abs`. **Prohibidos**: `**`, `Math.pow`, `Math.sqrt`, `Math.log`, `Math.exp`, trigonométricas y `rng.normal`. `F = 10^decimales` se calcula multiplicando en el parser. El test de higiene busca también `\*\*`.

### 9.2 Orden
- Consumo fijo: **salvaje 205 [v0.2]**, **cría 280** (70/locus), se usen o no los valores. Fórmulas validadas por el parser: `1 + 12·(5 + 3n)` y `6 + 16n` por locus `[validacion_config.formula_tiradas_*]`.
- Por locus, exactamente t1…t70 (sec. 3.2). Salvaje: `t`, luego por locus y slot `uc, uf, uv, uq1, uq2, 3×N`.
- Semilla: quien llama pasa el `rng`. Servidor: `createRng(semillaMundo + "|cria|" + nCriaGlobal)`. Simulador: flujos separados `|cria`, `|sim`, `|salvaje` por semilla.
- Hash de población (QA-11): serialización canónica, campos en el orden de la sec. 1 y loci en `orden_loci`.

### 9.3 Validaciones de config [v0.2] (QA-04..07)
Además de las de v0.1: ids de familia y locus cumplen `^[a-z0-9_]+$` `[validacion_config.regex_ids]`; `max_crias_por_criatura ≥ 1` `[validacion_config.max_crias_minimo]`; `calidad.min = base·(1−margen)` y `calidad.max = base·(1+margen)` (±1e-9); toda ancla de catálogo suma `calidad.base`; Σlo ≤ calidad.min y calidad.max ≤ Σhi para anclas (36 ≤ 85,5; 94,5 ≤ 150); la tolerancia de invariantes se lee de `criterios_sim.invariantes.tolerancia_suma` (QA-05, sin literales).

---

## 10. Métricas y criterios de éxito `[escenarios_sim]`, `[criterios_sim]`

### 10.1 Escenarios
| Id | Montaje |
|---|---|
| E1 cerrada | 500 salvajes; generaciones discretas: barajar, parejas consecutivas, 2 crías/pareja; 300 gen; 20 semillas |
| E2 con capturas | E1 + 10 % de la población sustituida al azar por salvajes nuevos tras cada generación |
| **[v0.2]** E3a deriva homocigoto | 100 clones idénticos: en cada locus D = R1 = R2 = `brote.<locus>.1`, calidad 90, valores = ancla. Mutación 0. 50 parejas × 5 crías; sobreviven las 100 de mayor velocidad total (Σ velocidad de los 4 D; empate: id menor). Control: 100 al azar. 100 gen; 20 semillas |
| E3b selección completa | como E3a pero con 100 salvajes diversos y mutación activa (informativo + invariantes) |
| **[v0.2]** E3c heterocigoto | la E3a de v0.1 (clones de un salvaje). Informativo: mide deriva + selección de recesivos |
| E4 primera híbrida | F1 de salvaje `puro` llama × `puro` marea; pareja nueva cada 5 crías; hasta 5000 crías `[tope_crias]`; 10.000 ensayos. Mide primer gen Vapor y **[v0.2]** primera criatura de familia Vapor |
| **[v0.2]** E5 estrategia velocidad | E1, pero los padres son la élite del 40 % de mayor velocidad total, emparejada al azar dentro de la élite |

### 10.2 Criterios
| Métrica | Definición | Umbral |
|---|---|---|
| Sorpresa | E1, gen 1–20: % crías con algún D cuya clave ≠ D de A y ≠ D de B en ese locus | 15 %–30 % |
| Diversidad | E1 gen 300, peor locus: claves distintas (D+R1+R2); Shannon H = −Σ pᵢ log₂ pᵢ (todos / solo D) | ≥ 12; ≥ 2,5 bits; ≥ 2,0 bits; ≥ 50 % de gen 0; ninguna clave > 40 % de los D |
| **[v0.2]** Monocultivo dirigido | E5 gen 300, peor locus | claves ≥ 10; H_D ≥ 2,0 bits; ninguna clave > 60 % de los D |
| Tasa de mutación | mutaciones/1000 crías; % crías con ≥1 | 4000·p ± 10 %; 5 %–12 % |
| Genedex | E2: claves nuevas/1000 crías; % mutaciones en clave ya registrada | gen 1–10 ≥ 40; gen 291–300 ≥ 5; repetidas gen 291–300 10 %–80 %; 7 híbridas vistas |
| Primer gen híbrido | E4: crías hasta el primer gen Vapor | mediana 10–40; p90 ≤ 100 |
| **[v0.2]** Primera criatura híbrida | E4: crías hasta la primera criatura de familia Vapor | mediana ≤ 40; p90 ≤ 120 (estimado 23 / 76) |
| **[v0.2]** Vigilancia de híbridas | E2 gen 300: % de D híbridos; % de criaturas de familia híbrida | D ≤ 10 %; criaturas 3 %–25 % |
| **[v0.2]** Deriva | E3a homocigoto: Δ = media por gen D de (velocidad − velocidad en gen 0), en puntos | gen 20: +1,5 a +7,5; gen 100: ≤ +8,5 (no saturar el techo de +10); control \|Δ\| ≤ 1,0 |
| Invariantes | todas las escenas, cada gen: **[v0.2]** calidad ∈ [85,5; 94,5]; \|Σancla − calidad\| y \|Σvalores − calidad\| ≤ 0,01; ancla ∈ [12,50]; valores ∈ [max(5,a−10), min(60,a+10)]; ninguna clave mutada ∈ claves de sus padres | 0 violaciones |
| Determinismo | misma semilla ⇒ mismo hash; barrido 2 % vs 3 %: crías sin mutación idénticas | 100 % |

Informativo (sin umbral): sorpresa por locus, familias de criatura, % de D híbridos en E1 (v0.1: 59,9 %; con afinidad 0,5 debe bajar), curva de Genedex, E3b, E3c, Δ velocidad de E5, distribución de calidad de las criaturas de E1/E5 (la calidad media de E5 no debe subir: la selección por velocidad no selecciona calidad directamente).

**Por qué cambian los criterios:**
- **Deriva (C):** E3a v0.1 usaba clones heterocigotos y medía también la selección de recesivos rápidos (+50 %). Con homocigotos solo queda la deriva de valores. Se mide en **puntos por gen** (techo +10) para no depender del genoma. Estimación con κ 0,10 y deriva de suma cero: v0.1 homocigoto daba +21,3 % ≈ +6 puntos/gen; la suma cero reduce el ruido efectivo a ×0,82 ⇒ ≈ +4,5 a +5,5 en gen 20, ≈ +5 a +6 en gen 100. El umbral de gen 100 (≤ 8,5) comprueba que el freno es el retorno al ancla y no el techo duro.
- **Monocultivo (D):** el 40,6 % salió criando solo por velocidad en una población aislada: eso es especialización buscada por el jugador, no colapso del sistema. Se mantiene ≤ 40 % para cría al azar (E1, v0.1: 9,3 %) y se crea un criterio aparte, más laxo, para la estrategia dirigida (v0.1: 40,6 %, 24 claves, H_D 2,81 bits ⇒ pasaría). En el juego las poblaciones son abiertas (mercado, capturas); la homogeneización a escala de servidor se vigilará en el simulador de economía.

### 10.3 Criterio para el simulador de combate (semana 2) [v0.2] `[criterios_combate]`
Equipos espejo de 4 criaturas (mismos tipos de gen y movimientos); el equipo X con todos sus genes a calidad 94,5 y el Y a 85,5 (ancla y valores = catálogo × Q/90 con `repartir`). ≥ 10.000 combates alternando quién empieza. **Victorias de X: objetivo ≤ 55 %, límite ≤ 60 %.** Si se supera, **se reduce el margen de calidad** (decisión D-008 del dueño del juego). Reducirlo es posible mientras no haya mercado; una vez abierto el mercado el margen solo puede ampliarse. Antes de reducirlo conviene revisar que ninguna fórmula de combate amplifique los totales (p. ej. multiplicaciones entre estadísticas).

### 10.4 Problema B: absorción por híbridas
La regla de la sec. 7 solo cambia la **etiqueta** de la criatura, no la frecuencia de genes, así que no agrava directamente la absorción. Sí puede hacer que los jugadores busquen más las híbridas. Contrapartida: `prob_hibrida_afinidad` 0,75 → 0,5 (la vía principal por la que una línea híbrida "se traga" a su componente). Estimación con capturas: D híbridos ≈ 2–3 % (v0.1: 2,8 %) ⇒ criaturas con ≥1 D híbrido ≈ 1 − 0,975⁴ ≈ 10 %, de las que ~85 % ganan la familia ⇒ **≈ 8–9 % de criaturas híbridas** (dentro de 3–25 %).

---

## 11. Barridos sugeridos `[barridos_sim]`
| Parámetro | Valores (negrita = por defecto) | Para qué |
|---|---|---|
| `mutacion.prob_por_locus` | 0,01 · **0,02** · 0,03 · 0,04 | control |
| `mutacion.prob_hibrida_afinidad` | **0,5** · 0,75 | efecto de la contrapartida B en E1/E2 |
| `familia_criatura.peso_gen_hibrido` | 1 · **2** · 3 | confirmar A y su efecto en % de criaturas híbridas |
| `calidad.distribucion_salvaje` | **triangular** · uniforme | rareza de calidad alta |
| `deriva.kappa` | 0,05 · **0,10** · 0,15 | criterio de deriva con la suma cero |
| `mutacion.sigma_forma` | 0,15 · **0,25** | control de Genedex |
| `mutacion.prob_hibrida_nueva` | 0,25 · **0,5** · 1,0 | control |

`pesos_D` = C y `pesos_R` = R0 quedan fijados (decididos con datos).

---

## 12. Decisiones (para DECISIONES.md)
| # | Decisión | Alternativas descartadas |
|---|---|---|
| G1 | R1/R2 sin reemplazo de slot con `pesos_R` planos | con reemplazo; R1/R2 fijos por padre |
| G2′ [v0.2] | Calidad por gen 90 ± 5 %, fijada al nacer, copiada intacta; Σancla = Σvalores = calidad (D-008) | ancla libre; suma fija 90 sin margen (v0.1) |
| G3′ [v0.2] | Deriva de suma cero + retorno κ 0,10 + techo ±10 | deriva que suma puntos (v0.1); κ 0,05 |
| G4 | Forma en rejilla de 5 niveles; identidad = familia+locus+firma | hash de valores; rejilla de 11 |
| G5′ [v0.2] | La mutación excluye las 6 claves de los padres; respaldo N0–N3 sin tiradas (D-007) | excluir solo los D (v0.1) |
| G6′ [v0.2] | 7 híbridas, sin segundo orden; afinidad 0,5 | afinidad 0,75 (absorbente); 15 pares |
| G7′ [v0.2] | Familia: gen híbrido pesa 2; empate gana híbrida; luego la cabeza | ≥2 D híbridos (v0.1, ~1950 crías); cualquier D híbrido manda; más prob. de mutación híbrida si un padre ya lleva híbridos (cambia genes, agrava B) |
| G8 | Mutación 2 % por locus | 1 % (suspende tasa/E4); 3 % (al límite) |
| G9 | Irwin–Hall, consumo fijo de tiradas, solo aritmética | Box–Muller; consumo variable |
| G10 | Padres ordenados por id con `<` | orden de llamada; `localeCompare` |
| G11 [v0.2] | Calidad salvaje triangular | uniforme (10 % de capturas en la franja alta) |
| G12 [v0.2] | Pesos C (0,47/0,025/0,005); σ forma 0,25 | A (66,9 % sorpresa), B (37,0 %); σ 0,15 (80,1 % repetidas) |
| G13 [v0.2] | Deriva medida con homocigotos, en puntos/gen | E3a heterocigoto en % (mezclaba selección de recesivos) |
| G14 [v0.2] | Monocultivo: ≤ 40 % al azar, ≤ 60 % en cría dirigida | un único umbral de 40 % para todo |

---

## 13. Preguntas abiertas
Ninguna de fondo. Para el director, sin bloquear: si el simulador de combate (10.3) diera > 60 %, se reduce el margen (D-008); confirmar antes que ninguna fórmula de combate amplifica los totales (p. ej. multiplicaciones entre estadísticas).

---

## 14. Cambios respecto a v0.1
| Sección | v0.1 | v0.2 | Origen |
|---|---|---|---|
| 3.1 pesos_D | 0,375/0,094/0,031 | 0,47/0,025/0,005 | Informe (sorpresa 26,5 %) |
| 4.5 σ forma | 0,15 | 0,25 | Informe (Genedex repetidas 64,3 %) |
| 6 κ deriva | 0,05 | 0,10 | Informe |
| 1.2, 1.4, 2.2, 4.2 | Σancla = 90 | Calidad por gen ∈ [85,5; 94,5]; Σancla = Σvalores = calidad | D-008 |
| 1.5 | reparto solo en 4.2 | función común `repartir`; ajuste de redondeo en pasos de 0,01 | D-008, nota 6 |
| 2.2 tiradas salvaje | 181 | 205 (+uq1, uq2 por gen) | D-008 |
| 2.2 valores salvajes | ruido independiente | ruido de suma cero + reparto | D-008 |
| 4.3–4.4 mutación | ancla con reparto; valores sin suma | ancla y valores con `repartir` a Q = media de calidades | D-008 |
| 4.5 bloqueo | solo los D de los padres | las 6 claves de los padres; respaldo N0–N3 | D-007, QA-01, QA-10 |
| 4.1 afinidad | 0,75 | 0,5 | Problema B |
| 6 deriva | suma puntos | suma cero | D-008 |
| 7 familia | mayoría simple; empate cabeza | híbrido pesa 2; empate gana híbrida; luego cabeza | Problema A |
| 1.2 nota 7 | sin definir | confirmada | QA nota 7 |
| 3.2 precondiciones | — | enteros validados sin tiradas | QA-02 |
| 9.1 operaciones | lista corta | lista cerrada; `**` prohibido | QA-03 |
| 9.3 config | — | normal, regex de ids, max_crias ≥ 1, calidad, tolerancia desde CFG | QA-04..07 |
| 1.2 inmutabilidad | — | genes congelados | QA-08 |
| 9.2 hash | — | serialización canónica | QA-11 |
| 10 | E3a heterocigoto en % | E3a homocigoto en puntos; E3c, E5; criterios de monocultivo, primera criatura híbrida, vigilancia de híbridas, combate | Problemas A–D, D-008 |
| 11 | barridos amplios | barridos reducidos | Informe |

Tiradas por cría: **280 (sin cambio)**. Tiradas por salvaje: **181 → 205**. Cambian los vectores dorados de salvaje, deriva, mutación y familia.

## 15. Pendiente de validar en simulación
1. Primera criatura híbrida en E4: mediana ≤ 40, p90 ≤ 120 (estimado 23 / 76).
2. Vigilancia de híbridas en E2 (D ≤ 10 %; criaturas 3–25 %; estimado ≈ 8–9 %) y efecto de afinidad 0,5 vs 0,75 en E1 cerrada.
3. Deriva E3a homocigoto con suma cero y κ 0,10 (estimado +4,5 a +5,5 puntos/gen en gen 20).
4. Que D-007 no cambie la tasa de mutación ni la sorpresa (debería ser ±0,1 pp) y que el respaldo N3 no se use nunca o casi nunca (informar nº de usos de N1, N2, N3).
5. Que con calidad, sorpresa, diversidad y Genedex sigan aprobando como con la combinación v0.2 del informe (16/18 + nuevos).
6. Monocultivo dirigido E5 (≤ 60 %) y que la calidad media no suba en E5.
7. Semana 2 (combate): calidad máx. vs mín. ≤ 55 % (objetivo), ≤ 60 % (límite).
