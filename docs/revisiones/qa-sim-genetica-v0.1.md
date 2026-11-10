# Revisión QA — simulador de genética v0.1 y su informe

Fecha: 2026-11-10 · Revisor/QA (no ha escrito este código).
Alcance: `sim/genetics/*.ts`, `docs/informes/genetica-v0.1.md` y `docs/informes/informe-genetica-v0.1.html` (idéntico a `sim/out/informe-genetica-v0.1.html`), frente a §10–§11 de `docs/spec/genetica-v0.1.md`. No he tocado `docs/spec/genetica-v0.2.*` ni `docs/equipo/`, y no he modificado ningún fichero existente.

## Veredicto: **APROBADO CON CAMBIOS**

Las métricas miden lo que pide la spec. Las conclusiones principales se sostienen, y las he recalculado por un camino independiente:
- pesos_D C es el único que entra en sorpresa;
- mutación al 2 %;
- E3a, tal como está definido, mezcla deriva con cambio de tipo de gen;
- las híbridas se acumulan en población cerrada.

Dos hallazgos mayores cambian cifras o el alcance de lo que se afirma, pero ninguno invierte una recomendación:
1. La "primera criatura Vapor ≈ 1946 crías" está sobrestimada en un ~25–30 %. El valor real es ≈ 1500.
2. La combinación v0.2 se eligió y se validó con las mismas 5 semillas, y además el núcleo v0.2 (QA-01) cambia las mutaciones. Hay que revalidar con semillas nuevas.

Cómo lo he comprobado:
- `npm run check` ejecutado 2 veces: 67/67 tests, incluido `sim/genetics/determinism.test.ts`.
- `npm run sim -- --quick --out /tmp/qa/simquick` (18 s; 885/885 crías pareadas idénticas). Lo saqué a `/tmp` para no sobrescribir `sim/out/rapido`.
- Lectura de `engine.ts`, `runner.ts`, `stats.ts`, `strategies.ts`, `cfg.ts` y de las partes de `narrative.ts`/`report.ts` que generan cifras.
- Recálculo independiente con código propio (`/tmp/qa/indep.ts`, fuera del repo): emparejamiento propio, flujos RNG propios (`qa|*`) y llamadas directas al núcleo.

### Recálculos independientes

| Métrica | Informe | Recálculo QA | ¿Coincide? |
|---|---|---|---|
| Sorpresa E1 C-m2, gen 1–20 (N = 500) | 26,5 % [26,0; 27,0] | 25,2 / 26,6 / 26,4 % (3 semillas; media 26,1 %) | Sí |
| E2 Genedex C-m2: nuevas/1000 gen 1–10 · gen 291–300 · % repetidas | 74,8 · 15,9 · 80,1 % (NO*) | 72,5 · 11,7 · 84,5 % (2 semillas) | Sí: el veredicto se mantiene (suspenso) |
| E2 Genedex v02 (σ forma 0,25) | 77,8 · 28,6 · 64,3 % | 76,6 · 28,1 · 62,9 % | Sí |
| E4 gen Vapor: mediana / p90 | 18 / 58 | 18 / 58 (P(gen Vapor por cría) = 0,0390, con 400.000 crías) | Sí; coincide también con la teoría (17,6 / 57,3) |
| E4 1.ª **criatura** Vapor, C-m2 | mediana 1946 (16/100 censurados) | P por cría = 4,68·10⁻⁴ ± 0,67·10⁻⁴ ⇒ mediana **≈ 1480** [1300; 1730]; teoría 1558; censura esperada al tope de 5000: 9,7 % | **No** (ver S-01) |
| Velocidad bajo selección: "el ancla se redistribuye por mutación" | afirmado | CSV `estrategia_velocidad/E1__C-m2`, gen 300: 100 % de los D con origen mutación, 100 % voltio, desviación media +8,3 | Sí, respaldado |
| E3a: "solo +29,8 % es deriva de valores" | afirmado | Descomposición del propio E3a por semilla: deriva de valores +24…+34 %; cambio de tipo +6…+41 % | Sí en promedio (ver S-05) |

---

## Hallazgos

| ID | Severidad | Fichero:línea | Descripción | Reproducción | Arreglo |
|---|---|---|---|---|---|
| S-01 | **Mayor** (cambia una cifra del informe) | `engine.ts:384-436` (búsqueda de criatura en E4), `runner.ts:309-321`, `narrative.ts:161,240,258` · informe §Gráficas E4 y hallazgo 7 | La mediana de "primera criatura Vapor" sale de solo **100 ensayos** (20 por semilla), con un 16 % de censura cuando lo esperado es un 9,7 % (una muestra con mala suerte). Esos mismos 100 flujos (`${seed}\|E4\|${t}`) se reutilizan en todas las configs, así que el error va en la misma dirección en todas: C-m3 777 frente a ≈ 730; h1 477 frente a ≈ 390–410. Además, cuando hay más de un 50 % de censura se muestra "∞" (C-m1, h0,25), lo que sugiere que es imposible, cuando en realidad la mediana es ≈ 6.000–8.000. | `python3` sobre `sim/out/completo/principal/E4__C-m2.csv`: el MLE geométrico con censura da 1862 [1534; 2368]. `/tmp/qa/indep.ts vapor`: 400.000 crías ⇒ p = 4,68·10⁻⁴ ⇒ mediana 1480. Teoría: 6·0,01²·0,98²·0,75 ≈ 4,45·10⁻⁴ ⇒ 1558. | Estimar p directamente (Bernoulli sobre todas las crías de E4, que ya se generan) y dar mediana = ln2/p con IC. Si se mantienen ensayos, usar ≥ 1000 con flujos distintos por config, o un estimador con censura (MLE o Kaplan–Meier). Mostrar "> 5000", no "∞". En el informe, decir **≈ 1500 crías (IC ~1300–1750)**. Lo cualitativo (≈ 80 veces más difícil que el primer gen) se mantiene. |
| S-02 | **Mayor** (alcance de la validación) | `runner.ts:61-70,85`; informe §"Validación de la combinación recomendada (… mismas semillas)" | v0.2 (σ forma 0,25 y κ 0,10) se eligió mirando los resultados de las semillas `genoma-1..5`, y se "valida" con esas mismas semillas. Es validación dentro de la muestra: los criterios frágiles o que justo pasan el umbral pueden ser un artefacto de esas semillas (dex_rep C-m2 80,1 % frente a un umbral del 80 %). Además, el núcleo v0.2 aplicará QA-01 (excluir los 6 genes de los padres), lo que cambia las mutaciones (≈ 0,5–0,7 %) y todos los hashes. Mi recálculo con semillas nuevas confirma las dos decisiones (v02 62,9 % frente a C-m2 84,5 %), así que no hay indicio de que se inviertan. | `npm run sim -- --barrido recomendada --semilla otra` (con el núcleo v0.2). | Revalidar v0.2 con el núcleo v0.2 y un prefijo de semilla nuevo (p. ej. `--semilla valida`), y cambiar el título a "validación con semillas independientes". |
| S-03 | Menor | `narrative.ts:256`; informe, hallazgo 5 | Recomienda "no añadir la exclusión (sin efecto medible)", pero el propio dato (0,46–0,72 % de las mutaciones) sí es medible, y lo que choca con el diseño es la promesa de "gen nuevo", no el balance. Además, la decisión ya está tomada (QA-01 entra en v0.2). | Lectura. | Reescribirlo como "efecto pequeño (0,5–0,7 % de las mutaciones); resuelto en v0.2 con la exclusión". |
| S-04 | Menor | `narrative.ts:121`; informe, tabla "Criterios §10.2 por configuración" | La etiqueta de la fila usa el umbral de la primera columna: "E1 mutaciones / 1000 crías (40 ± 10 %)". Cada columna se evalúa con su propio 4000·p (`runner.ts:392-393`), así que el OK/NO es correcto, pero la etiqueta induce a error en m2 y m3. | Leer la tabla: A-m2 = 80,5 OK con la etiqueta "40 ± 10 %". | Etiqueta "4000·p ± 10 %". |
| S-05 | Menor | `runner.ts:254-269`, informe §Deriva y decisión 2 | El Δ de E3a es **relativo a la velocidad del clon plantilla** (v0 entre 95,9 y 131,7 según la semilla) y satura en el techo de +10 por gen ⇒ el máximo alcanzable es 40/v0 (30–42 %). Por eso el IC de E3a es enorme (21–62 %), y "κ 0,10 queda centrado" depende de qué plantillas tocaron. La frase "solo +29,8 % es deriva" mezcla dos experimentos (E3a_homo frente a E3a). La descomposición del propio E3a (`delta_deriva_20`) sí la respalda en promedio, pero varía mucho entre semillas. | Leer `principal/E3a__C-m2.csv`: Δ20 = 0,34–0,74 según la semilla. | Informar también Δ absoluto por D (o Δ / techo), y usar la descomposición propia de E3a en el resumen. Si se redefine el criterio (decisión 2a), fijar la plantilla o normalizar por el techo. |
| S-06 | Menor | `narrative.ts:161` (histograma E4) | El eje Y del histograma de E4 no tiene título (nº de ensayos). Las demás gráficas tienen título, leyenda HTML con las series, títulos de eje con unidades, nota y una tabla de datos alternativa: son legibles. | Inspección del SVG 3 del HTML. | Añadir "ensayos" (o "% de ensayos") como título del eje Y. |
| S-07 | Sugerencia | `stats.ts:34-38`, `runner.ts:351-373` | Las semillas y los flujos se comparten entre configs (diseño pareado, correcto y documentado). Eso **no introduce sesgo**, pero los IC son por config y no pareados: sobrestiman la incertidumbre de las diferencias (A frente a C). Es conservador, no invalida nada. Excepción: E4 (S-01), donde el emparejamiento propaga el mismo error a todas las configs. | — | Para comparar configs, dar el IC de la diferencia pareada por semilla. |
| S-08 | Sugerencia | `runner.ts:245` | "% repetidas" excluye las mutaciones que caen en una clave del catálogo (≈ 1,3 %). Es razonable, porque no entran en el Genedex, pero la spec no lo dice. | — | Documentarlo en §Método (ya lo dice entre paréntesis) y en la spec v0.2. |

---

## Checklist

1. **¿Cada métrica mide lo que dice la spec?**
   - [x] **Sorpresa** (`engine.ts:211-223`): compara la clave del D de la cría con los D de los padres *antes* de criar. Incluye mutaciones y se promedia en gen 1–20. Correcta y recalculada.
   - [x] **Diversidad** (`engine.ts:142-160`, `runner.ts:215-221`): claves distintas en D+R1+R2, H con total 3N y solo con los D, peor locus, sobre la **última** generación (300 en el modo completo). El cociente H/H₀ toma el mínimo de ambas entropías. Correcta.
   - [x] **Genedex** (`runner.ts:240-245`): nuevas/1000 en gen 1–10 y en las 10 últimas; repetidas = redescubrimientos / (nuevas + redescubrimientos), sin catálogo (S-08). Correcta y recalculada.
   - [x] **E4, gen** (`engine.ts:423`): solo puede salir Vapor en un D mutado, y los padres son puros. Correcta y recalculada.
   - [ ] **E4, criatura**: sobrestimada (S-01).
   - [x] Mutación, invariantes y E3a con mutación forzada a 0 (`runner.ts:91-93`).
2. **Errores de método**
   - [x] Regla de reemplazo:
     - E1/E2: generaciones discretas con 2 crías por pareja, así que cada individuo tiene exactamente 2 crías. No hay selección oculta, que es lo que pide la spec.
     - E2: reemplaza el 10 % *después* de criar, y los salvajes crían en g+1.
     - E3a: 50 × 5 = 250 → 100.
     Sin sesgos encontrados.
   - [x] Semillas compartidas: flujos `|cria`, `|sim` y `|salvaje` separados, lo que da un diseño pareado correcto. Los IC son conservadores (S-07).
   - [ ] Semillas compartidas: excepción de E4 (S-01) y validación dentro de la muestra (S-02).
   - [x] Intervalos: t de Student con gl = n−1 (2,776 para 5 semillas, correcto). "Frágil" cuando el IC cruza el umbral: razonable.
   - [ ] Mediana de E4 con censura mal tratada (S-01).
   - [x] Generación evaluada: diversidad sobre la última generación, deriva en g = 20 y en la última, sorpresa en 1–20, Genedex en 1–10 y en las 10 últimas. Correcto. En `--quick` las etiquetas dicen la generación real (40/30).
3. **Determinismo**
   - [x] `determinism.test.ts` está incluido en `npm test`. Cubre: misma semilla con las 4 estrategias, semilla distinta, E3a, el pareado 2 % frente a 3 % y E4.
   - [x] `npm run check` pasa 2 de 2 veces (67/67).
   - [x] Con `--quick`: 885/885 crías pareadas idénticas.
4. **¿El informe afirma solo lo que respaldan los datos? ¿Las gráficas son legibles?**
   - [x] Respaldado: sorpresa A/B/C, tasas de mutación, Genedex, híbridas absorbentes (59,9 % en E1, 2,8 % en E2) y la concentración en una sola clave bajo selección por velocidad (comprobada en el CSV).
   - [ ] No respaldado del todo: la cifra de la criatura Vapor (S-01), "validada" (S-02), "sin efecto medible" (S-03) y la atribución de E3a, que depende de la plantilla (S-05).
   - [x] Gráficas: 6 SVG con título, leyenda, ejes con unidades, nota y tabla de datos alternativa.
   - [ ] Falta el título del eje Y en el histograma de E4 (S-06).
   - [ ] Etiqueta de umbral equivocada en la fila de mutaciones/1000 (S-04).

## ¿Cambia alguna conclusión?

- **Recomendaciones de parámetros** (pesos_D C, mutación 2 %, σ forma 0,25, κ 0,10, pesos_R R0, híbrida nueva 0,5): **no cambian**. Mi recálculo independiente confirma la dirección y el veredicto de sorpresa y Genedex. Falta revalidarlas con el núcleo v0.2 y semillas nuevas (S-02).
- **"Primera criatura Vapor ≈ 1946 / ≈ 2000 crías"**: **cambia la cifra**, a **≈ 1500 crías** (IC ~1300–1750). La lectura de diseño se mantiene: hace falta enseñar al jugador a criar entre portadores y a hacer retrocruces.
- **Nota 9 / QA-01**: la recomendación del informe de no añadir la exclusión queda superada por la decisión ya tomada.
