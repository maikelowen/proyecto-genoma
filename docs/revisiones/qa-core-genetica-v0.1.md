# Revisión QA — núcleo de genética v0.1

Fecha: 2026-11-10 · Revisor/QA (no ha escrito este código).
Alcance: `packages/core/src/rng.ts`, `packages/core/src/genetics/*`, `packages/core/test/*` frente a `docs/spec/genetica-v0.1.md`, `config/genetica.v0.1.json` y `docs/spec/notas-implementacion-v0.1.md`. `sim/` queda fuera de la revisión.

## Veredicto: **APROBADO CON CAMBIOS**

El núcleo cumple la spec en todo lo que afecta a reglas, orden de tiradas y determinismo: **no hay hallazgos bloqueantes**. El Simulador puede usarlo ya. Hay **1 hallazgo mayor**, que es una decisión de diseño pendiente (la mutación puede repetir un recesivo de un padre), y varios menores de robustez y de higiene.

Comprobaciones hechas: `npm run check` ejecutado 2 veces (los 55 tests originales pasan; con los de QA son 62 y pasan también), lectura línea a línea frente a §1–§9 y un script exploratorio en `/tmp/qa/explore.ts` (fuera del repo). Ese script incluye: padres congelados en profundidad, la distribución teórica de R1/R2, un fuzz de 400.000 anclas, 80.000 mutaciones contrastadas con los R de los padres y 21 configs extremas o inválidas.

He añadido un fichero de tests permanente: `packages/core/test/qa-genetica.test.ts` (7 tests, ~0,5 s). No he modificado ningún fichero existente.

---

## Hallazgos

| ID | Severidad | Fichero:línea | Descripción | Cómo reproducir | Arreglo propuesto |
|---|---|---|---|---|---|
| QA-01 | **Mayor** (decisión de diseño) | `packages/core/src/genetics/mutation.ts:77-80` (`clashes`) · spec §4.4 / G5 · nota 9 | La mutación solo garantiza que la clave sea distinta de los **D** de los padres. El documento de diseño dice "aparece un gen nuevo que no tenía ningún padre". Medido: **0,55 %** de las mutaciones dan una clave igual a un R1/R2 de algún padre. Para el jugador sería una "mutación" que en realidad es un recesivo que ya tenía. Por otro lado, un 1,88 % cae en una clave del catálogo base. Eso no contradice el diseño (es nuevo para los padres), aunque no lo sea para el mundo. | `/tmp/qa/explore.ts`, bloque 4: 60 salvajes, 20.000 crías con `prob_por_locus=1`. | Recomiendo alinear con el diseño: excluir las **6** claves de los padres en ese locus (A.D/R1/R2, B.D/R1/R2). Ojo: con 6 claves bloqueadas, el argumento de "4 candidatos ⇒ siempre hay solución" ya no vale (los 4 vecinos podrían estar todos bloqueados). Hace falta un respaldo determinista sin tiradas: probar primero los 4 vecinos en la dirección del ruido, después los 4 en la dirección contraria y después a distancia 2. No cambia el número de tiradas, pero sí el vector dorado. Lo decide el Diseñador o el dueño. Mientras tanto, el Simulador puede medir el efecto. |
| QA-02 | Menor | `breed.ts:62-67` | `breedingBlocker` no valida que sus entradas sean números. Si `birth` es `NaN`/`undefined`, o si `offspringCount` es `NaN`, la comparación da `false` y **se salta la edad mínima y el límite de 5 crías**. Además, la cría sale con `birth: undefined`. TypeScript lo evita en el simulador, pero el servidor recibirá JSON. | `breedingBlocker(a,b,CFG,NaN) === null`; `breed(a,b,rng,CFG,{id:"c"})` → `child.birth === undefined`. | Exigir `Number.isInteger(birth)` y lo mismo para `p.birth` y `p.offspringCount`; si no, lanzar `BreedingError` sin consumir tiradas. |
| QA-03 | Menor | `math.ts:15` | `10 ** config.decimals` usa el operador `**`. §9.1 solo permite `+ − × /`, `round`, `floor`, `min`, `max`, y la especificación de ECMAScript deja `**` como "aproximado por la implementación". En la práctica, 10² = 100 sale exacto en todos los motores, pero el test de higiene (`genetics-config-wild.test.ts:141`) no detecta `**`. | `grep -n '\*\*' packages/core/src/genetics`. | Calcular el factor multiplicando en un bucle en `parseGeneticsConfig` y guardarlo en la config. Añadir `\*\*` a la regex de higiene. |
| QA-04 | Menor | `config.ts:124-129` | No se comprueba que `normal.centro = n/2` y `normal.factor = √(12/n)` cuadren con `n_uniformes`. Si un barrido cambia `n_uniformes` y actualiza las tiradas pero no el centro, el parser lo acepta y la normal sale sesgada. | Con `normal.centro = 0`, la config se acepta y se crían 3000 crías sin error. | Validar `centro === n/2` y `|factor² · n − 12| < 1e-9`. |
| QA-05 | Menor | `creature.ts:141` | `sumTolerance = 0.01` está duplicado como literal. En la config existe `criterios_sim.invariantes.tolerancia_suma_ancla`, pero el parser no lo lee. Es la única constante numérica de reglas duplicada que he encontrado en `src/`. | Lectura. | Parsear `criterios_sim.invariantes` (o al menos la tolerancia) y usarla por defecto. |
| QA-06 | Menor | `config.ts:200` | Se acepta `max_crias_por_criatura = 0`, y entonces cualquier cría lanza error. | Config con valor 0 → `BreedingError` en la primera cría. | Exigir un mínimo de 1. |
| QA-07 | Menor | `config.ts:102,111,231` | Los ids de familia y de gen no se validan. Una familia como `"va|por"` o `"a.b"` rompe el separador de `geneKey` (`|`) y el formato `familia.locus.N`, y la config se acepta igualmente. | Con `familias.hibridas[0].id = "va|por"`, la config se acepta. | Exigir `/^[a-z0-9_]+$/` para los ids de familia. |
| QA-08 | Sugerencia | `gene.ts:33,51`, `mutation.ts:142` | Hay estructura compartida: el `anchor` (y la `shape`) de la cría es **el mismo objeto** que el del padre. Las anclas de catálogo están congeladas; las de los genes mutados y todos los `values`, no. Hoy no hay bug (los tipos son `readonly` y `breed` no escribe), pero si alguien escribe en un hijo desde JS, corrompe a toda la línea. | Bloque 7 del script: `child.R1.anchor === parent.R1.anchor`, y `Object.isFrozen(mutado.anchor) === false`. | Hacer `Object.freeze` de `anchor`/`values`/`shape` al crearlos (coste despreciable), o documentarlo en `types.ts`. |
| QA-09 | Sugerencia | tests | Huecos de la batería original, **cubiertos ahora en `qa-genetica.test.ts`**: (a) la distribución de slots de R1/R2 frente al sorteo sin reemplazo (antes solo se probaba D); (b) híbrida × base no componente y par base sin híbrida (≈ 50/50 por `elegir`); (c) anclas en los bordes 12/50 y fuzz con σ=30; (d) en salvajes, que el D "no principal" nunca sea de la principal y que las variantes salgan uniformes; (e) `breed` con padres congelados en profundidad. Siguen sin cubrir: un test directo de §4.3 (valores mutados = m + media de las desviaciones) y QA-02. | — | Añadir el test de §4.3 cuando se toque `mutation.ts`. |
| QA-10 | Sugerencia | spec §4.4 línea 153 | La spec dice "como mucho 2 bloqueados", pero en realidad es como mucho 1: cada candidato difiere de `f` en un parámetro, así que nunca puede coincidir con la firma con la que choca `f`. No tiene efecto en el código. | — | Corregir el texto al cerrar QA-01. |
| QA-11 | Sugerencia | (para el simulador) | Las comparaciones por `JSON.stringify` dependen del orden de inserción de las claves. Dentro del núcleo es estable, pero un gen construido a mano con otro orden de claves daría otro hash con los mismos datos. | — | Que el "hash de población" del §10.2 use una serialización canónica (con campos en orden fijo). |

---

## Checklist

1. **`npm run check` pasa, sin tests inestables**
   - [x] Pasa 2 de 2 veces (typecheck + 55/55; con QA, 62/62).
   - [x] No puede haber inestabilidad: todos los tests usan semillas fijas, así que son deterministas.
2. **Conformidad spec ↔ código**
   - [x] §1 Modelo: tipos y nombres equivalentes según la nota 16.
   - [x] §2.2 Salvaje: orden `t`, después `uc, uf, uv, 3×N` por slot; mismos límites de recorte; `others` = base sin la principal.
   - [x] §3.1/§3.2 Herencia: D con `pesos_D`; R1/R2 sin reemplazo con `ex = muta ? {} : {iD}`; t1…t70 en el orden exacto (`breed.ts:98-110`). La distribución de R1/R2 coincide con la teoría (diferencia < 0,003).
   - [x] §4.1 Familia de la mutación: los 6 casos de la tabla son correctos. Medido: llama×marea ≈ 50 % Vapor; vapor×marea ≈ 75 %; vapor×roca y llama×brote ≈ 50/50.
   - [x] §4.2 Ancla: recorte, ≤ 3 reintentos y ajuste de redondeo. El fuzz de 400.000 casos (σ = 3 y σ = 30) da 0 violaciones; el error máximo de la suma es 1,4e-14.
   - [x] §4.3 Valores y §4.4 Forma: fórmulas, orden por \|nFo\| y desempate por índice correctos. Cambio respecto a los D: garantizado. Respecto a los R: no (ver QA-01).
   - [x] §4.5 Identidad: si la clave es del catálogo, toma el id y el movimiento base; si no, `m<firma>` y `mov:prov:`.
   - [x] §5 Híbridas: sin segundo orden; retrocruce al 75 %.
   - [x] §6 Deriva: κ, σ y límites [max(5, a−10), min(60, a+10)].
   - [x] §7 Familia de la criatura: mayoría, y en empate el primer locus entre las empatadas.
   - [x] §8 Genedex: solo la primera aparición, con redescubrimientos y el catálogo aparte.
   - [x] §9 Tiradas: **181** por salvaje (normal, forzada y pura) y **280** por cría (con mutación al 0 %, 2 % y 100 %), verificadas por test.
3. **Números desde la config, sin constantes mágicas**
   - [x] Todos los números de reglas salen de la config.
   - [ ] Excepción: la tolerancia 0,01 (QA-05).
   - [x] Los literales 3, 4 y 6 restantes son estructurales (nº de valores, de parámetros de forma y de slots).
   - [x] Los recuentos de tiradas se validan.
4. **Determinismo**
   - [x] Sin `Math.random`, `Date`, `performance` ni funciones trascendentes en genética.
   - [x] `rng.normal` no se usa en genética.
   - [x] `sort` con comparador total.
   - [x] Los `Map` solo se usan para búsquedas o con un desempate explícito por `LOCUS_IDS`.
   - [x] `breed` no muta sus entradas (comprobado con padres congelados en profundidad).
   - [ ] `**` en `math.ts` (QA-03).
5. **Calidad de los tests e intentos de romperlo**
   - [x] Tolerancias de 5 errores estándar: razonables. Detectan desviaciones de ≈1 punto en el slot D y de ≈14 % relativo en la tasa de mutación.
   - [x] Sin inestabilidad, porque las semillas son fijas.
   - [x] Casos probados:
     - Edad límite: `birth − p.birth = 1` se permite y `= 0` se bloquea.
     - Padres con 5 crías: se bloquea (con 4 se permite).
     - Cría consigo mismo: se bloquea sin consumir tiradas.
     - Híbrida × híbrida: correcto.
     - `pesos_R` con R1 = R2 = 0: rechazado con `ConfigError`, que es lo correcto.
     - `pesos_R` con D = 0, `pesos_D` con solo D o con D = 0, `prob_hibrida_nueva` = 1, `desviacion_max` 14/30, σ = 0 y `redondeo_decimales` = 0: se aceptan, y 3000 crías por config dan 0 violaciones de invariantes.
     - `pesos_R = "=pesos_D"`, `kappa` > 1, edad no entera, `ancla_min` inalcanzable, par de híbrida repetido y familia de catálogo híbrida: rechazados.
   - [ ] Configs inválidas que se aceptan: QA-04, QA-06, QA-07. Entradas inválidas que se aceptan: QA-02.
   - [x] Huecos de la batería (QA-09): cubiertos con `qa-genetica.test.ts`.
6. **Valoración de las notas de implementación**: ver la sección siguiente.

## Valoración de las notas de implementación

- **Notas 1–5, 8, 10, 12–16**: correctas y bien argumentadas. Ninguna contradice la spec ni el diseño. La nota 4 (`<` en lugar de `localeCompare`) y la 12 (validar el número de tiradas) son mejoras reales.
- **Nota 6** (ajuste de redondeo que debe quedar en rango): es correcta y estricta. El fuzz confirma que nunca lanza con configs válidas.
- **Nota 7** (una mutación que cae en el catálogo conserva su ancla mutada y lleva `origen = "mutacion"`): es coherente con §1.2, porque el ancla es de la instancia. Efecto a vigilar: dos copias de `llama.cabeza.1` pueden tener anclas distintas, todas con suma 90. Es aceptable, pero que el Diseñador lo confirme explícitamente, porque la UI mostrará "el mismo gen" con estadísticas base diferentes.
- **Nota 9: es la importante.** El documento de diseño dice "un gen nuevo **que no tenía ningún padre**". La spec (G5) lo redujo a "distinto de los D de los padres", y el implementador hizo bien en seguir la spec y avisar. Mi opinión: **la spec se queda corta frente al diseño**. Para el jugador, los R1/R2 de los padres sí son genes "que tenía el padre", sobre todo una vez se revelen en la UI. Que una mutación anunciada como tal le devuelva un recesivo conocido (0,55 % de las mutaciones) choca con la promesa de "sorpresa", además de inflar la métrica de mutaciones y no la de Genedex. El coste de arreglarlo es bajo (QA-01): sin tiradas nuevas, solo cambia el vector dorado. **Recomendación:** que el Diseñador lo decida antes de congelar v0.1. Si no se arregla, que quede escrito en DECISIONES.md como alternativa descartada.
- **Nota 11**: correcta. Exigir ≥ 2 pesos > 0 por padre en `pesos_R` es condición suficiente para que R2 siempre tenga candidato. También es necesaria siempre que `pesos_D.D > 0`.
- **Nota 13**: correcta. Pero los límites de `breedingBlocker` deberían validar el tipo de sus entradas (QA-02).
