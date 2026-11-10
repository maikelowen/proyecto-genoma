# Revisión QA — lote semana 2 (remate de genética v0.2 + núcleo de combate y movimientos v0.2)

Revisor/QA · 2026-11-10 · HEAD `e9c1ae9` (árbol con cambios locales solo en `sim/combat/`, fuera de alcance). No he revisado `sim/combat/` ni `docs/informes/combate-*`.

## Veredictos

| Bloque | Veredicto | Resumen |
|---|---|---|
| 1. Remate de genética (informe v0.2, commit 714e356) | **CON CAMBIOS** (de texto) | V-01, V-02, V-04 y V-06 resueltos; V-03 y V-05 casi. Las cifras salen de los datos y se reproducen byte a byte desde HEAD. Sobra una afirmación: "la convergencia temprana no depende de κ" (G-01). |
| 2. Núcleo de combate y movimientos v0.2 | **APROBADO** (núcleo) · **1 hallazgo mayor de diseño** | El código cumple la spec: determinismo, 24/8 tiradas, IA (λ, ahorro, remate), prioridad de aliado, regla del 40 %, configs inválidas → `ConfigError`, sin sesgo A/B. El problema mayor está en la spec, no en el código: los topes de cura y escudo se comen el presupuesto de los apoyos de coste 4–5 (K-01). |

`npm run check` ×2: 147/147 en las dos ejecuciones (5,8 s y 5,6 s), sin tests inestables.

## Comprobaciones independientes

| Qué | Cómo | Resultado | ¿Coincide? |
|---|---|---|---|
| Trayectoria E5 (gen 20/50/100/300), κ 0,1 / 0,075 / 0,05, y H_D gen 300 | Script propio sobre los CSV (`/tmp/qa_e5.py`), máximo por locus de `maxfrec_D_*` | 79,9/77,0/64,6/59,9 % con 20/20/15/8 semillas > 60 %; H_D 2,08 (14/20); referencias idénticas a la tabla | Sí, todas las cifras |
| Reproducibilidad del informe | `node sim/genetics/cli.ts --config v02 --escenario E5 --out /tmp/qa_gen_e5` en HEAD | `E5__v02.csv` **idéntico** (cmp) al de `sim/out/completo` | Sí |
| Semillas | Prefijo de los CSV | Todas `valida03-1..20`; `valida03` no está en `USED_SEED_PREFIXES` y con ella no se ha elegido nada | Sí |
| Simetría de la IA | `/tmp/qa-combat/check.ts`: estado espejo (equipos, vidas y energía intercambiados) ⇒ plan de B = plan de A | 0 planes distintos en 1291 turnos (150 partidas) | Sí |
| Sesgo de lado en el motor | 1000 parejas X–Y jugadas en los dos órdenes con la misma semilla | A gana 990/1988 decididas = 49,8 % | Sin sesgo |
| Topes de escalable | 3600 genes salvajes + fixture del catálogo | Ver K-01 | — |
| Configs rotas | NaN, negativos, rutas con errata, `__proto__`/`constructor` en `patchRawConfig` | Todas dan `ConfigError`, salvo las de K-02 y K-03 | Casi |

## Hallazgos

| ID | Severidad | Fichero:línea | Descripción | Reproducción | Arreglo |
|---|---|---|---|---|---|
| K-01 | **Mayor** (diseño; el código es fiel a la spec) | `config/movimientos.v0.2.json` `escalables.{cura.max, escudo.max}`; spec movimientos §1 y §2.1 | Los topes (cura 180, escudo 200) están por debajo de lo que compra el presupuesto de coste 4–5. Escudo puro: c4 = 41 × 7,5 = 307 → 200 (pierde el 35 %); c5 = 397 → 200 (pierde el 50 %). Cura: c4 = 225 → 180 (20 %); c5 = 291 → 180 (38 %). Con 3600 genes salvajes, salen recortados el **100 %** de las curaciones de coste 4 y 5, el 100 % de las protecciones de coste 5 y el 61 % de las de coste 4. En el catálogo hay 5 apoyos recortados: brote cura c5, roca/voltio protección c4, voltio cura c4 y sombra protección c5 (el ejemplo §8 "roca escudo 200" ya está en el tope). Una cura de coste 5 cura lo mismo que una de coste 4. Esto contradice "presupuesto casi lineal" en los apoyos y puede explicar parte del C2 de roca y sombra. | `/tmp/qa-combat/check.ts` (sección 3) y el script en Python sobre `test/fixtures/movimientos-catalogo.v0.2.json`. | Diseñador: subir los topes, limitar los apoyos a coste ≤ 3, o pasar el sobrante a estado o área. El Analista debería tenerlo en cuenta antes de repetir la búsqueda de sales C2 (§5.2). |
| K-02 | Menor | `packages/core/src/combat/patch.ts:50`; parsers | La forma larga de `patchRawConfig` puede crear **cualquier** clave nueva, y los parsers ignoran las desconocidas. Así, `[[["ia","kapa"], 0]]` se acepta y no hace nada: un barrido de κ con una errata correría entero con κ 0,9 sin que nadie lo vea. La forma corta sí detecta la errata. | `buildBattleConfig(rawC, rawM, G, {combat: [[["ia","nuevo"],1]]})` → acepta. | Limitar la creación a `overrides_catalogo.sales`, o que los parsers rechacen claves desconocidas (salvo las `_doc`). |
| K-03 | Sugerencia | `packages/core/src/combat/config.ts:195,306` | El parser acepta `energia.por_turno` 11 con `maximo` 10 (el tope de lo guardado queda en 0, sin error) y `ia.kappa` 5 (κ > 1: guardar vale más que el mejor movimiento). | `/tmp/qa-combat/check.ts` (sección 4). | Exigir `por_turno ≤ maximo` y `κ ∈ [0, 1]`, o documentar κ > 1. |
| K-04 | Sugerencia | `packages/core/test/combat-determinism.test.ts` ("equipos idénticos…") | El test de simetría enfrenta un equipo contra sí mismo, así que no detecta asimetrías de la IA con equipos distintos. | — | Añadir el test de estado espejo (mi comprobación: 0/1291) y el de parejas X–Y / Y–X. |
| K-05 | Sugerencia | `packages/core/test/combat-moves.test.ts:276`; `src/moves/generate.ts:182` | El test copia las cuotas de catálogo como literales en vez de leer `criterios_sim.cuotas_catalogo`, y `Math.floor(u8 * 4)` usa un 4 literal (el parser fija 4 raíces, así que hoy es estructural). | Lectura. | Leer las cuotas de la config y usar `roots.length`. |
| G-01 | **Mayor** (interpretación) | `docs/informes/genetica-v0.2.md`, resumen 3 y 5, viñeta "La convergencia es temprana" y hallazgo 1(b); `sim/genetics/narrative.ts:88` | "La convergencia temprana **no depende de κ**" y "ningún κ simulado lo aprobaría [en gen 50]" solo valen para la **gen 20** (74–80 % con todos los κ). En la gen 50, κ 0,05 ya está en el umbral: 62,5 % [56,6; 68,4], con 9/20 semillas que cumplen. Además, κ 0,075 da 77,0 % (20/20 > 60 %), frente a 71,2 % (15/20) con κ 0,1. `earlyAll` compara solo la media con el umbral, sin IC ni recuento de semillas. Las cifras están bien; lo que se pasa de largo es el alcance de la recomendación ("ajustar κ no arregla lo que ve el jugador"). | Tabla de trayectoria del propio informe y `/tmp/qa_e5.py`. | Que `earlyAll` exija que el IC quede por encima del umbral (o una mayoría de semillas) y diga en qué generación deja de cumplirse. Reformular: "hasta la gen 20 no depende de κ; en la gen 50, κ 0,05 ya está en el umbral". |
| G-02 | Menor | `sim/genetics/narrative.ts:144` | Queda texto fijo causal (resto de V-04): "Cuanto más tira la deriva hacia el ancla, menos rinde especializar valores y más tarda en volver la diversidad". Es un mecanismo que no se ha medido. | Lectura. | Quitarlo o marcarlo como hipótesis. |
| G-03 | Menor | `sim/genetics/narrative.ts:171,235`; informe §15 punto 4 y hallazgo 4 | El punto 4 pone "N3 0" (redondeado) con el veredicto REVISAR porque `n3 = 0,05 ≠ 0`. El hallazgo 4 dice "sin fallos… N3 usado 0.05 veces" (punto decimal inglés y una media presentada como recuento). La spec pide "nunca o casi nunca", así que 0,05 por semilla aprobaría. | Informe. | Mostrar N3 con 2 decimales, criterio "casi nunca" con umbral explícito, y formato es-ES. |
| G-04 | Menor | `docs/spec/genetica-v0.2.md:345` | Resto de V-05: el punto 3 de §17 sigue diciendo "+6,21/+7,30 … pendiente revalidar con semillas nuevas", cuando ya está revalidado (+6,19/+7,24 con `valida03`). | `sed -n 345p` | Que el Diseñador actualice la línea. |
| G-05 | Menor | `docs/informes/genetica-v0.2.md` (cabecera y "Gráficas"); `sim/genetics/cli.ts:258` | (a) La cabecera cita el commit `b7422c5` "más los cambios locales que hubiera": el código que generó el informe se commiteó después, en 714e356. Lo he podido reproducir, pero la cabecera no lo garantiza. (b) La sección "Gráficas" sale vacía en el `.md`. (c) `--escenario E5` escribe el CSV y luego falla con "Cannot read properties of undefined (reading 'mean')", y la CLI solo imprime el mensaje, sin la traza. | `node sim/genetics/cli.ts --config v02 --escenario E5 --out /tmp/x` | Indicar si el árbol estaba sucio (`git status --porcelain`), enlazar o omitir las gráficas en el `.md`, y tolerar filtros parciales o avisar de que el informe necesita todos los escenarios. |

## Estado de V-01..V-06 (qa-v0.2)

| ID | Estado | Comentario |
|---|---|---|
| V-01 | **Resuelto** | Revalidado con `valida03-*` (20 semillas en E5) sin elegir nada con ellas. La CLI avisa si se usa un prefijo ya usado para elegir. 25/25 criterios; el monocultivo se presenta como frágil (IC que cruza el umbral, 12/20 semillas). |
| V-02 | **Resuelto** | κ y etiquetas salen del JSON (`defaultKappa`, `kappaReferences`) y la cabecera incluye el sha256 de la config. CSV reproducido byte a byte. Detalle de la cabecera en G-05(a). |
| V-03 | **Resuelto en datos**, interpretación a medias | Tabla y curva de gen 20/50/100/300 con IC y recuento por semilla: correctas. La conclusión se pasa de largo (G-01). |
| V-04 | **Casi** | Frases condicionales sobre los datos; queda una causal fija (G-02). |
| V-05 | **Casi** | κ 0,075 en G3′ y en la tabla de barrido; queda la línea 345 (G-04). La línea 264 es una estimación histórica con κ 0,10 y es aceptable. |
| V-06 | **Resuelto** | El informe ya no le pregunta al dueño por κ y cita D-012 y D-013 (no puedo verificar `DECISIONES.md`, porque está en el proyecto y no en el repo). |

## Checklist

**Remate de genética**
- [x] Semillas nuevas `valida03-*`, comprobadas en los CSV; nada elegido con ellas.
- [x] Cifras generadas desde los datos; recalculadas desde los CSV (trayectoria y H_D) y CSV E5 reproducido idéntico desde HEAD.
- [x] Etiquetas de κ desde la config; IC y recuento de semillas; censura y fragilidad indicadas.
- [ ] Conclusiones dentro del alcance de los datos (G-01, G-02).
- [ ] Spec coherente (G-04).

**Núcleo de combate y movimientos v0.2**
- [x] `npm run check` ×2 en verde (147 tests); test de higiene (sin `**`, `pow`, reloj ni `Math.random`).
- [x] 24 tiradas por turno: test de consumo con plan normal, plan inválido y KO; el parser fija 8 + 16 = 24. 8 por movimiento: bucle fijo con un rng propio por clave; el respaldo no consume tiradas.
- [x] Palancas de balance leídas de config (golpe básico, `condiciones.bonus`, umbrales, `energia_extra.cantidad`, prioridad de aliado, topes, estados, IA). Sin números de reglas en `engine.ts` ni `ai.ts`. Solo literales estructurales (posiciones 1–4, 4 raíces: K-05).
- [x] `patchRawConfig`/`buildBattleConfig`: no mutan el original, detectan erratas en la forma corta y bloquean `__proto__`/`constructor`. Excepciones en K-02 y K-03.
- [x] IA frente a §10: λ = κ·máx r con `H` y el descuento del golpe; λ acotado en 0 (nota 1); `c*` con desempate por posición y locus; guardar con `min(e − Σc, c*, máx − por_turno)`; remate con `bonus_ko`; escudo que descuenta el ya puesto; regenerar tras la cura; aturdir sobre inmune = 0; desempate lexicográfico. Los tests calculan a mano el valor de los planes.
- [x] Prioridad de aliado: solo `target = aliado` (curación y protección); táctico y golpe en nivel 0; palanca 0/1 validada.
- [x] Regla del 40 %: `fac·fEsc·pts ≥ fraccion_minima·presupuesto` en la generación (con ε en `validateMove`); el respaldo conserva el arquetipo; test sobre 2000 claves. La regla se aplica sobre los puntos y no sobre la potencia ya recortada (K-01).
- [x] Vectores dorados: el catálogo v0.2 está anclado a los 4 ejemplos de la spec §8 (fuente independiente) y a las cuotas §5.1. La partida dorada es nueva: todo cambia con v0.2, así que no se puede comparar campo a campo con la v0.1. El test de repetición reproduce el hash.
- [x] Simetría A/B: el orden usa lado favorecido por paridad y después posición; el fin de turno resuelve A y B antes de comprobar la victoria. IA espejo: 0/1291. Motor: 49,8 % para A con parejas intercambiadas.
- [ ] Topes de escalable coherentes con el presupuesto (K-01, Diseñador).
