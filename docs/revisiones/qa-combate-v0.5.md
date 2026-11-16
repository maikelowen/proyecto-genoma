# QA — combate v0.5 (spec + núcleo), rama `combate-v0.5`, commit `de939ea`

Revisor/QA, 2026-11-14. Revisión única de spec y núcleo (D-057).
Entrada: D-052 a D-057, `docs/spec/combate-v0.5.md`, `config/combate.v0.5.json`, `docs/spec/notas-implementacion-combate-v0.5.md` y `git diff 91e776f de939ea -- packages/`.

## Veredicto: **ACEPTAR CON CAMBIOS**

No hay bloqueantes. El núcleo implementa la spec y la spec respeta D-053, D-054, D-056 y D-057. Con las dos claves a `false` el combate es **idéntico** a v0.4 (1000 de 1000 partidas con el mismo hash, no solo el dorado). Los ~4,9 de energía perdida por partida **no son un fallo**: los he reproducido (5,03) y su causa es que la estimación de la spec estaba mal. Pido dos cambios importantes y baratos antes de cerrar el ciclo (I-01 e I-02). Los menores se pueden dejar para otro momento.

## Verificación

| Comprobación | Resultado |
|---|---|
| `npm run check` en el árbol de trabajo | Falla: `sim/v04/setup.ts(31,44)` usa `process.env`. Es un cambio **sin confirmar de otro agente** (el analista), ajeno al commit |
| `npm run check` sobre `git archive de939ea`, dos veces | 249/249 las dos veces, sin fallos intermitentes |
| Tiradas por turno | Son fijas por construcción: las 24 se sacan en dos bucles (`engine.ts:770-772`) antes de cualquier rama. Además lo comprueba un test con las 4 combinaciones de claves |
| Regresión (claves a `false`) frente a `combate.v0.4.json` | **1000/1000 hashes idénticos** con semillas propias `rev05|i` y equipos salvajes `rev05A|i` / `rev05B|i` |
| Determinismo | 1000/1000: la misma semilla da el mismo hash con las dos mecánicas activas |
| Simetría (equipos X–Y / Y–X con la misma semilla, 2000 partidas) | WR del lado A: 0,484 en base y 0,488 con ambas. WR del equipo X con ambas: 0,506. Sin sesgo de lado |

### Cifras recalculadas por un camino independiente
Script propio en el scratchpad que llama directamente a `runBattle` y `energyLost`, con 1000 partidas por config y las mismas semillas en todas:

| Config | Turnos | Energía perdida/partida (KO + aturdir) | De ella, de la última ánima | De ella, **en el turno final del bando que pierde** | Devuelta/partida | Huecos de la última (1/2/3 movimientos) | Huecos con prioridad 1 |
|---|---|---|---|---|---|---|---|
| base (= v0.4) | 9,03 | 0 | — | — | **4,62** | — | — |
| solo_D053 | 8,63 | 0 | — | — | 5,53 | 1932/1083/71 | 33 % |
| solo_D054 | 9,02 | 4,40 (3,45 + 0,94) | 0 | 1,36 | 0 | — | — |
| ambas | 8,80 | **5,03** (4,00 + 1,03) | 1,80 | 1,80 | 0 | 2206/789/16 | 30 % |
| ambas, aturdir "primero" | 8,79 | 5,15 | 1,93 | 1,85 | 0 | 2290/771/9 | 30 % |

- **Energía perdida:** el núcleo dio ≈ 4,9 con 200 partidas y yo 5,03 con 1000. Coincide.
- **Turnos:** el núcleo dio 8,6 con su prueba rápida y yo 8,80. Coincide dentro del error de muestreo y con otras semillas.

## Hallazgos

| ID | Severidad | Dónde | Qué pasa | Reproducción | Arreglo propuesto |
|---|---|---|---|---|---|
| **I-01** | Importante | `engine.ts:194`, `:204`, `:219` (`canAct`, `eligibleActors`, `restingMoves` con `cfg?`) | Si se llaman sin `cfg` aplican la regla de v0.4 y no avisan. (a) `restingMoves(state, side, pos)` sin `cfg` marca como "en descanso" el movimiento pendiente de una ánima que acaba de quedarse última. El estado guarda el contador (lo prueba `combat-v05.test.ts:233`), así que el cliente desactivaría un botón válido justo en su mejor turno, contra §2.4 y §4.2. (b) Sin `cfg`, `eligibleActors` excluye a la última con `skipTurn = turno` en el plan B (`aturdir = "primero"`). Llamadas sin `cfg` en el commit: `client/combat/main.ts:444, 459, 545, 550, 553, 561, 606`, `sim/combat/jobs.ts:131, 145` y `sim/variants/games.ts:128-129`. El cliente ya lo corrige en su trabajo sin confirmar, pero la API no lo garantiza | Partida v0.5 en la que la compañera cae en t después de que la superviviente usara el movimiento k: en t + 1, `restingMoves(s, "A", pos)` devuelve `[k]` y `restingMoves(s, "A", pos, cfg)` devuelve `[]` | Hacer `cfg` **obligatorio** en las tres funciones. El compilador señala todas las llamadas y el cambio es mecánico (los sims v0.2/v0.4 pasan su cfg y no cambian). Es más barato que vigilarlo en cada revisión del cliente |
| **I-02** | Importante | Spec `combate-v0.5.md:238` (§9.5) y criterio `energia_perdida_por_partida_inf` | La estimación "≈ 1–2, rango 0,5–3,0" está mal **desde v0.4**: con la regla antigua ya se **devolvían 4,62 por partida**, en ≈ 3,05 cancelaciones de coste medio ≈ 1,5. Son ≈ 2,1 por KO y ≈ 1,0 por aturdir, frente a los 0,35 × 4 KO y 0,3 que suponía la spec. D-054 solo convierte esa devolución en pérdida (4,40) y D-053 añade ≈ 0,6 porque la última compromete más energía. **No es un fallo del núcleo ni una IA que modele mal D-054.** Además, ≈ 1,8 de los 5,0 (36 %) se pierden en el turno en que cae la última ánima del perdedor: esa energía ya no sirve para nada | Tabla de arriba: fila base, columna "Devuelta", y columna "turno final del bando que pierde" | (1) El diseñador corrige la estimación y el rango (≈ 4–5,5 por partida). (2) El analista informa además de la **energía perdida útil**: excluir las cancelaciones del bando perdedor en el último turno. Si no, el criterio "sale alta" se dispara siempre y lleva a una mejora de IA que no hace falta |
| M-01 | Menor | `ai.ts:396` | El desempate por prioridad del hueco exige `r.value === best.value` exacto. Dos órdenes del mismo subconjunto suman las mismas aportaciones en distinto orden, y con términos no enteros (λ · energía extra, `valor_estado`) pueden diferir en 1 ulp. En ese caso gana el orden sin prioridad. Es determinista, solo que contradice C27 en casos raros. Visto en el código, no lo he medido | Secuencia {energía extra, escudo}: valores (x + 0,9·1) + v y (x + v) + 0,9·1 | Comparar con una tolerancia (`Math.abs(Δ) < 1e-9`), o acumular el valor de cada movimiento en un orden canónico |
| M-02 | Menor | `ai.ts:396` + `engine.ts:511` | El desempate entre opciones depende del orden de `lastAnimaPlans`: lexicográfico de la lista ordenada (`[1] < [1,2] < [1,2,4] < [1,4] < [2] …`, con el gratis en su índice). Es determinista y coherente con v0.2 (gana la primera enumerada), pero la spec §5 dice "combinación menor" sin definirla para conjuntos | — | Una línea en spec §5: "menor = lexicográfica de la lista ascendente de índices". No hace falta tocar el código |
| M-03 | Menor | Spec `combate-v0.5.md:43` | La spec dice que con la clave a `false` el evento lleva `lost = 0`. El núcleo **omite** el campo, a propósito, para no cambiar el hash de v0.4 (notas, punto 1). Es correcto, pero la spec y el código no coinciden | — | Corregir la spec: "sin la clave, no hay campo `lost` (léase 0)" |
| M-04 | Menor | `engine.ts:1099` (notas, punto 7) | Los contadores de descanso de la última siguen bajando. La nota §8.6 decía "no aplicarle los contadores". **No cambia nada jugable**: una ánima última lo es hasta el final y todo lo que lee el descanso (`validatePlan`, IA de referencia y de búsqueda, `restingMoves` con `cfg`) lo ignora para ella. El único efecto visible es I-01 (a), y solo el primer turno, porque después ya no queda nada que marcar | — | Aceptar la desviación y anotarla en la spec, o se resuelve sola con I-01 |
| M-05 | Menor | `combat-v05.test.ts:328` | U10 solo comprueba que sale el evento `taunt`, no que **desvíe** los ataques rivales posteriores del mismo turno. El código recalcula `taunting` en cada movimiento y está bien, pero no hay test que lo fije | B ataca después del hueco de la última, que abre con provocar: el objetivo de B debería ser la última | Añadir un test que compruebe el objetivo del ataque posterior de B |

## Lista de comprobación

- [x] **D-053:** gratis solo, pagos distintos una vez cada uno, como máximo 3, Σ coste ≤ energía y sin descanso (`validatePlan`, `engine.ts:458-476`; `lastAnimaPlans`). Ignorar también el descanso pendiente (C23) es una interpretación coherente con el motivo de D-053.
- [x] **D-054:** `refund = pago ? 0 : coste` y un `cancel` por movimiento (`engine.ts:898`). Afecta a todas las ánimas (U18 con test).
- [x] **D-056 (1):** la última se fija al empezar el turno (`lastPos` en `resolveTurn`; `validatePlan` usa el estado inicial). U1 tiene test.
- [x] **D-056 (2):** un solo hueco y el orden del plan; nadie actúa entre medias; un solo jitter; varianza `L[j]` con test de tiradas reales.
- [x] **D-056 (3):** con "turno", aturdida pierde todo y toda la energía comprometida (U2 con test). Plan B "primero" en config. C26 (extender el plan B al aturdimiento arrastrado) aprobado por el director.
- [x] **D-057:** `planSynergy` cuenta ánimas distintas (`Set`) y no cambia nada para planes normales (validados sin actores repetidos). La IA usa `evaluate` de siempre, con subconjuntos × órdenes y ≤ 16 simulaciones.
- [x] **Claves a `false`:** todos los caminos nuevos están protegidos (`lastIdx` devuelve 0 si la variante está inactiva; `seq = false`; `varSlot = idx`; los campos nuevos de los eventos solo aparecen con su mecánica). La agrupación por actor conserva el orden de inserción, y la ordenación tiene desempate total (`idx`, `side`). Resultado: 1000/1000 hashes idénticos.
- [x] **Secuencia:** se comprueba KO antes de cada movimiento (U5, y U6 si llegara a ocurrir); objetivo y provocar se recalculan en cada movimiento con el estado vivo (U7 con test); la energía extra se suma pero no paga la secuencia (U12 con test); condiciones por movimiento (U14 con test); U8 tiene test.
- [x] **IA:** la regla de reserva va antes; en la IA de búsqueda, con última, candidatos = 2 de referencia + `lastAnimaPlans`, y `rec` se omite.
- [x] **Cobertura U1–U18:** tienen test U1–U5, U7–U12, U14, U16, U17 y U18. Sin test: U6 (no alcanzable con el catálogo actual), U13 y U15 (no tienen código propio). U10 solo a medias (M-05).
- [x] **Parser:** `energia` y `ultima_anima` rechazan claves desconocidas; las claves nuevas son obligatorias en v0.5.

## Para el director
- Los cambios I-01 (núcleo, mecánico, Sonnet) e I-02 (texto de la spec y una columna más del analista) cuestan poco. El I-02 conviene pasárselo **ya** al analista que está trabajando en `sim/`, para que su informe no marque como "energía perdida alta" algo que ya pasaba en v0.4.
- Dato de paso para el analista, sin hallazgo: la IA encadena menos de lo que estimaba la spec. Con ambas mecánicas, el 73 % de los huecos de la última tienen un solo movimiento (gratis incluido) y solo el 0,5 % tienen 3.
