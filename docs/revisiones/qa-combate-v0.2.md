# Revisión QA: simulador de combate v0.2, estudio de balance y adopción de v0.2.1

Revisor/QA · 2026-11-10 · HEAD `c5607a3`, sin cambios locales. Alcance: `sim/combat/` (incluido `search.ts`), `docs/informes/combate-v0.2.md` y su HTML, `config/propuestas/combate-balance-v0.2.1.json`, commit `c5607a3` (config y tests) y la discrepancia de `--quick`. Scripts propios en `/tmp/qa-dir/`.

## Veredicto

| Bloque | Veredicto | Resumen |
|---|---|---|
| 1. Simulador y estudio de balance | **APROBADO** (con 1 hallazgo mayor de robustez) | Las conclusiones se sostienen. La validación usa `valida03`, que es nueva. El informe sale de los datos (es idéntico byte a byte a `sim/out/combate-v0.2/completo` y los hashes cuadran). Magma al 54,7 % se confirma con una semilla nueva y 3 veces más muestra: 54,5 % [53,5–55,6]. Es un sesgo real al borde de la banda, no ruido. El hallazgo mayor (C-01) es que las erratas en rutas de `movimientos` del parche se siguen ignorando sin avisar. No afecta a esta propuesta. |
| 2. Adopción (c5607a3) | **APROBADO** | `config/*.v0.2.json` contiene exactamente los 17 valores de la propuesta y nada más (aparte de `2.0`→`2` y el salto de línea final, que son cosméticos). `battleConfig(base adoptada)` es profundamente igual a `battleConfig(base + parche)`. Los tests cambiados conservan su rigor, con una salvedad menor (C-05). |
| 3. Discrepancia de `--quick` | **Ruido del modo rápido**, no es un problema real | El modo rápido decide con 24 combates por movimiento y sin 2.ª tanda. Los dos "rotos" (llama.cabeza.1 66,7 % y marea.extremidades.1 58,3 %) son "dudoso" en el CSV. Con 2000 combates dan 49,3 % y 50,4 % (normales), y lo mismo con una semilla nueva. No es una diferencia entre `--patch` y la config base: las configs son idénticas. Los 24 primeros combates cambian solo porque la semilla del combate incluye `variant.id` (C-03). |

`npm run check` ×2: 148/148 en las dos ejecuciones, sin tests inestables.

## Comprobaciones independientes

| Qué | Cómo | Resultado | ¿Coincide? |
|---|---|---|---|
| Semillas de validación | `resumen.json` del modo completo y `busqueda/*.json` | Evaluación con `valida03`; búsqueda con `elige02`, `elige02b` y `elige02d`. La CLI rechaza `explora02`, `elige02` y `valida02` (cli.ts:136) | Sí |
| Informe generado desde los datos | `diff` de `docs/informes/combate-v0.2.{md,html}` con `sim/out/combate-v0.2/completo/`; `sha256sum -c` | Idénticos; `grupos`, `movimientos` y `criterios.csv` OK. Las frases causales salen de condiciones del código (report.ts:177, 345) | Sí |
| Cada parche cambia la config (K-02) | Tabla "Qué cambia" (17 filas, todas con v0.2 ≠ propuesta) y diff de c5607a3 | Los 17 cambios existen y cambian el valor | Sí |
| Adopción exacta | `/tmp/qa-dir/equiv.ts`: `isDeepStrictEqual` de raw y `battleConfig` base frente a base + parche; los 72 movimientos del catálogo × 24 combates con el `id` de variante igualado | Configs iguales; 0 de 72 trabajos distintos | Sí |
| Magma 54,7 % "frágil" | `/tmp/qa-dir/familias.ts 750 qaF-1`: C2 completo con semilla nueva, 750 por pareja (9000 por familia; el informe usó 3000) | Magma 54,5 % [53,5–55,6]; las 13 familias en 46,4–54,5 % | Sí: está en banda por estimación puntual, pero el IC sigue cruzando 55 % |
| Rotos del modo rápido | `/tmp/qa-dir/dirigido.ts 2000`: 3 movimientos × {valida03-1, qaR-1} × {base, base + parche} | Todos "normal" con 2000 combates (46,9–51,1 %); con 24 combates salen roto grave, roto o inútil según la variante | Ruido |
| Erratas en el parche | `/tmp/qa-dir/typo.ts` | `combate` con errata y sal con gen inexistente: rechazados. `movimientos.escalables.dano.max_individal`: **aceptado y sin efecto** | No (C-01) |

## Hallazgos

| ID | Severidad | Fichero:línea | Descripción | Reproducción | Arreglo |
|---|---|---|---|---|---|
| C-01 | **Mayor** (robustez; no cambia ninguna cifra de este informe) | `sim/combat/setup.ts:71` | `movesChanges` pasa las rutas de `movimientos` a forma larga (`p.split(".")`), que crea claves. Por eso K-02 solo quedó cerrado para `combate` y `sales`: una errata en `movimientos` crea una clave nueva, el parser la ignora y la variante es idéntica a la base sin avisar. En esta propuesta no ha pasado (las 9 rutas existen y el diff de c5607a3 lo confirma), pero un barrido de topes o presupuestos con una errata daría un "no cambia nada" falso. | Parche `{"movimientos":{"escalables.dano.max_individal":999}}` → `loadProposal` lo acepta y `battleConfig` queda igual a la base. | Usar la forma corta (`p`, string) para `movimientos`, como en `combate`, y dejar la forma larga solo para las sales. Añadir un test con una errata. |
| C-02 | Menor | `sim/combat/study.ts:59` y `analysis.ts:248` | En `--quick`, los criterios de movimientos se juzgan con 24 combates y sin 2.ª tanda (`movStage2: 0`). Salen como "SUSPENDIDO" sin la marca "frágil", aunque el 100 % de los veredictos son "dudoso" (IC ±20 puntos). Eso es lo que provocó la alarma. | `npm run sim:combat -- --quick --out /tmp/x` → "Catálogo roto (2 de 12) SUSPENDIDO"; en `movimientos.csv` todas las filas tienen `dudoso=sí`. | Si algún veredicto contado es dudoso, marcar el criterio "frágil" o "no concluyente", o no juzgar los criterios §7 en modo rápido. |
| C-03 | Menor | `sim/combat/jobs.ts:178` (`bseed` incluye `job.variant.id`) | Base y propuesta comparten los equipos, pero no los dados del combate. "Comparación pareada" (study.ts:3) es verdad solo a medias. Los IC de la tabla son de muestras independientes, así que ninguna conclusión cambia. Pero dos variantes con la misma config dan resultados distintos, y eso confunde al depurar (es lo que pasó con la discrepancia). | `/tmp/qa-dir/dirigido.ts`: llama.cabeza.1, valida03-1, 24 combates: base 16–8, base + parche 8–16. Con el `id` igualado, son idénticos. | Quitar `variant.id` de `bseed` (pareo completo, menos varianza en las diferencias) o corregir el comentario. |
| C-04 | Menor (etiqueta frente a config viva, como V-02) | `sim/combat/setup.ts:55` | Tras la adopción, `BASE_VARIANT` sigue llamándose "v02 / v0.2 (JSON sin cambios)", pero el JSON ya es v0.2.1. Si se regenera el informe con `--patch`, la tabla "Qué cambia" dirá v0.2 = propuesta en las 17 filas, y "Base v0.2" será en realidad v0.2.1. | `npm run sim:combat -- --quick` → la variante sale como `v02`. | Sacar la etiqueta de `version` en la config o renombrarla a "config actual". Archivar la propuesta como aplicada. |
| C-05 | Menor | `packages/core/test/combat-moves.test.ts:31,296` | Los asserts de presupuesto y número de sales ahora comparan la config consigo misma. Siguen probando el parseo, pero ya ningún test fija los valores de balance v0.2.1 (solo el hash del vector dorado los cubre de forma indirecta). El resto de cambios mantiene el rigor: los ejemplos §8 se anclan a los valores de la spec y el test de escudo es paramétrico con 2S > M. El caso "no creciente" (B3 = B2) es un borde mejor que el anterior. | Lectura de `git show c5607a3 -- packages/core/test`. | Añadir un test de "valores adoptados v0.2.1" con números literales, o un hash del JSON de balance. |
| C-06 | Menor (diseño, sigue K-01) | `config/movimientos.v0.2.json` `escalables.escudo.max` = 300 | Cura: con c5, 60 × 5,5 = 330 = tope, así que queda resuelto. Escudo puro: con c4, 42 × 7,5 = 315 → 300; con c5, 450 → 300 (pierde un 33 %). Las protecciones de coste 5 siguen recortadas. Los criterios pasan, pero conviene que el Diseñador lo sepa. | Cálculo sobre la config. | Decisión del Diseñador: aceptarlo (el escudo de estado también tiene un máximo de 300) o reasignar el sobrante. |
| C-07 | Sugerencia | `sim/combat/search.ts:132` | `search.ts` no rechaza las semillas de evaluación (`valida03`): se podría elegir con ellas sin querer. | `node sim/combat/search.ts --patch F --semilla valida03` se ejecuta. | Prohibir allí `DEFAULT_SEED` y los prefijos ya usados para validar. |
| C-08 | Sugerencia | Prueba de sustitución | Los WR del catálogo van de 46 a 55 % con media 49,7 %, y eso es casi todo ruido de muestreo. No hay un control positivo que demuestre que la prueba detecta un movimiento roto de verdad. | — | Añadir un movimiento "trucado" (p. ej., coste 1 con presupuesto de coste 5) y comprobar que sale "roto". |

Magma: el informe acierta al llamarlo "frágil". Con 12.000 combates en total (3000 + 9000), la estimación es ≈ 54,6 % y el IC llega a ≈ 55,4 %. Es un sesgo sistemático (magma es la 1.ª en las dos muestras), no ruido, así que mi recomendación es la opción (a): aceptarlo y vigilarlo. Con 1000 por pareja, como pide la spec, quedaría resuelto.

## Checklist

- [x] `npm run check` ×2 (148/148)
- [x] Validación con semillas no usadas para elegir (`valida03`; `valida02` vetada en la CLI)
- [x] Tamaños de muestra frente a afirmaciones (magma recalculado con semilla nueva y 3× muestra)
- [x] Cada parche cambia la config (17/17); erratas probadas → C-01
- [x] Informe generado desde los datos (diff y hashes)
- [x] Config adoptada = propuesta, y nada más (diff y `battleConfig` igual)
- [x] Tests cambiados: rigor revisado → C-05
- [x] Discrepancia `--quick` resuelta con ejecución dirigida (ruido) → C-02, C-03
- [ ] Criterios de duración, lado, calidad y energía recalculados de forma independiente (no hecho por presupuesto; solo C2 y sustitución)
