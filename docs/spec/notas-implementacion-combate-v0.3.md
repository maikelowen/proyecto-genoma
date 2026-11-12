# Notas de implementación — variantes de combate v0.3

Encargo: `docs/spec/combate-variantes-v0.3.md` §2 (V1–V4 y "provocar"). Código: `packages/core/src/combat/` y `packages/core/src/moves/`. Tests: `packages/core/test/combat-variants.test.ts`. Siguen vigentes las notas de combate v0.1 y v0.2.

**Garantías.** Todas las variantes están desactivadas por defecto (y también si los bloques `variantes` / `provocar` faltan en el JSON). Con todas desactivadas el comportamiento es idéntico al de v0.2.1: los vectores dorados (partida y catálogo de 72) y los 153 tests anteriores pasan sin tocar nada, y el estado no lleva campos nuevos. **Ninguna variante ni combinación cambia las tiradas: 24 por turno y 8 por movimiento.** No se ha regenerado ningún dorado.

## Claves de config

| Variante | Fichero | Claves | Valor por defecto |
|---|---|---|---|
| V1 golpe básico con efecto | combate | `variantes.golpe_basico_efecto.activo`, `.componente_hibrida` (0/1), `.efectos.<familia base>` = `{tipo: estado, estado, probabilidad}` · `{tipo: cura\|escudo, cantidad}` · `{tipo: ninguno}` | `false`; 0; tabla de abajo |
| V2 descanso | combate | `variantes.descanso.activo`, `.turnos` | `false`; 1 |
| V3 más energía | combate | `energia.por_turno` (ya existía; también `inicial`, `maximo`) | 3 (estudio: 4) |
| V4 objetivo automático | combate | `variantes.objetivo_automatico.activo`, `.escudo_provocar_al_usuario` | `false`; `true` |
| Provocar (motor e IA) | combate | `variantes.provocar.duracion`, `.valor_ia` | 1; 20 |
| Provocar (gramática) | movimientos | `provocar.activo`, `.coste`, `.arquetipos`, `.pesos_familia.<familia base>` | `false`; 3; `["proteccion"]`; roca 3, marea 1, brote 1, resto 0 |

Para el estudio de V4 hay que activar **las dos** claves: `variantes.objetivo_automatico.activo` (combate) y `provocar.activo` (movimientos). Son independientes a propósito (se puede medir V4 sin provocar).

```ts
const cfg = buildBattleConfig(rawC, rawM, gcfg, {
  combat: { "variantes.golpe_basico_efecto.activo": true, "variantes.descanso.activo": true, "energia.por_turno": 4, "variantes.objetivo_automatico.activo": true },
  moves: { "provocar.activo": true },
});
```

## Números elegidos (la spec no los fija; los valida el Analista)

**V1.** Referencia: un movimiento de coste 1 tiene presupuesto 6 puntos = 30 de potencia, 20 más que el golpe básico. Cada efecto se ha calibrado a ≈ 4–5 de vida equivalente (≈ 1 punto de presupuesto, la cuarta parte de esa diferencia), con los valores medidos de las piezas (movimientos §7.1):

| Familia | Efecto | Valor estimado |
|---|---|---|
| llama | quemadura con probabilidad 0,15 | 0,15 × 6,4 puntos ≈ 4,8 |
| marea | ralentizar con probabilidad 0,75 | 0,75 × 1,1 puntos ≈ 4,1 |
| brote | se cura 5 | ≤ 5 |
| roca | escudo de 6 al usuario | 6 × 5/7,5 ≈ 4 |
| voltio | prisa al usuario con probabilidad 0,5 (dura hasta el turno siguiente) | 0,5 × 1,9 puntos ≈ 4,8 |
| sombra | marca (probabilidad 1) | 0,6–1,0 puntos ≈ 3–5 |

**Provocar.** Coste 3 puntos (entre prisa, 2, y regenerar, 5; ≈ 22 de escudo menos). Duración 1 (el turno en que se usa). Pesos: roca 3, marea 1, brote 1. `valor_ia` 20 (como un escudo pequeño).

## Huecos y decisiones

| # | Tema | Hueco | Decisión | Motivo |
|---|---|---|---|---|
| 1 | V1 | "Baja probabilidad" necesita azar. | La probabilidad usa la **2.ª tirada de varianza de la posición del actor** (`u < probabilidad`), que un golpe de un solo objetivo no gasta. | Sin tiradas nuevas: siguen siendo 24 y los barridos siguen pareados. |
| 2 | V1 | Efectos posibles. | Solo estados existentes (no hay estados nuevos): los ofensivos van al objetivo si sobrevive (aturdir respeta la inmunidad); prisa y regenerar, al usuario. Cura y escudo: cantidad fija al usuario, sin estadísticas, sinergia ni varianza. Se aplican después del daño. | La lista de estados es cerrada; así no cambia `estados` ni la interfaz. |
| 3 | V1 | Híbridas. | Usan el efecto de su componente nº `componente_hibrida` (por defecto 0, la primera de `familias.hibridas[].componentes`). `basicEffectOf(combatiente, cfg)` lo expone. | "Una de sus componentes", determinista. |
| 4 | V1 | Golpes del plan de respaldo (plan inválido). | También llevan el efecto. | Son golpes básicos. |
| 5 | V1 | IA. | La de referencia suma el valor esperado del efecto (probabilidad × `ia.valor_estado`, cura que cabe, escudo con el tope de `valor_max_escudo`) y lo descuenta en el precio de la energía, igual que el golpe al que sustituye un movimiento. | Si no, infravalora el golpe y gasta de más. |
| 6 | V2 | ¿Qué cuenta como "usado"? | El movimiento **ejecutado** (aunque se quede sin objetivo). Una acción cancelada por KO o aturdimiento (con devolución de energía) no descansa. | Coherente con la devolución: lo que no ocurrió no cuesta. |
| 7 | V2 | Elegir un movimiento en descanso. | `validatePlan` devuelve "movimiento N en descanso" y, como cualquier plan inválido, el motor lo cambia por golpes básicos. La interfaz debe impedirlo: `FighterState.rest` (turnos que le quedan a cada movimiento; solo existe con V2 activa) y `restingMoves(state, bando, pos)`. | Misma regla que el resto de planes inválidos. |
| 8 | V2 | Aturdida el turno siguiente. | El descanso corre igual (se descuenta al final de cada turno). | "No se puede usar el turno siguiente", sin casos especiales. |
| 9 | V3 | — | No hay código nuevo: `energia.por_turno` ya era palanca y la IA la lee (tope de ahorro `maximo − por_turno`). | — |
| 10 | V4 | Forma del plan. | `Action.target` **se ignora**: puede faltar o valer cualquier cosa; por convenio, 0. El motor normaliza el plan a `target: 0` (evento `plan`); los objetivos reales salen en el evento `action`, como siempre. El tipo `Action` no cambia. | No rompe el cliente ni el simulador. |
| 11 | V4 | Carril. | `carril = (posición − 1) mod 2`: 1 y 3 izquierda, 2 y 4 derecha, y cada posición se enfrenta a la misma posición rival. Orden: delantera de su carril, la otra delantera, trasera de su carril, la otra trasera (`laneOrder`). | Determinista con la posición en el equipo. |
| 12 | V4 | ¿Cuándo se decide? | **Al ejecutar** la acción (si el objetivo de su carril ya ha caído, pasa al siguiente; la acción no se pierde mientras quede un enemigo). `autoTarget(state, bando, actor, movimiento, cfg)` da la previsión para la interfaz. | Con elección simultánea no hay otro momento sin información oculta. |
| 13 | V4 | `area`. | Sin cambios: la fila del objetivo automático (delantera, o trasera si está vacía; con `alcance`, primero la trasera). | Literal. |
| 14 | V4 | Curas y escudos. | Cura: menor vida/máx (comparación exacta, sin dividir). Escudo: delantero con menos vida absoluta; sin delanteros, el aliado con menos vida. Empates: menor posición. Incluye al usuario. Son las reglas que ya usaba la IA. **No veo motivo para mantener la elección**: la IA nunca elegía otra cosa. | Spec §2. |
| 15 | Provocar | ¿A quién va el escudo del movimiento que provoca? | Al **usuario** (`escudo_provocar_al_usuario`, palanca; `false` = regla general del escudo). | Quien atrae los golpes es quien necesita el escudo; con la regla general, una trasera que provoca escudaría a otra. **Decisión mía, a confirmar.** |
| 16 | Provocar | Alcance del efecto. | Desvía los ataques enemigos de **un solo objetivo** (golpe básico y movimientos, también con `alcance`); los de área no. Con varias almas provocando, cada atacante va a la primera de su orden de carriles. Se acaba si cae. | Literal. |
| 17 | Provocar | Momento. | Empieza al ejecutarse el movimiento (protección tiene prioridad implícita, así que actúa antes que los ataques normales, no antes que los de `prioridad` más rápidos) y dura `duracion` finales de turno. No es un estado de la lista cerrada: va en `FighterState.taunt` (solo existe si es > 0) y en el evento nuevo `taunt`. | No toca `estados` ni la interfaz actual. |
| 18 | Provocar | Con objetivo manual (V4 desactivada). | También funciona: desvía al ejecutar. La IA de reglas no lo tiene en cuenta al apuntar en ese modo. | Evita una pieza sin efecto si alguien activa solo la gramática. |
| 19 | Provocar | Gramática sin tiradas extra y sin cambiar el catálogo desactivada. | Ocupa el hueco del estado (campo `Move.taunt`, solo presente si lo lleva). Se sortea con la misma `u3`: si `u3 ≥ T/(T + w)` (T = suma de pesos de estado positivo, w = peso de provocar; híbridas: suma de componentes) sustituye al estado sorteado; por debajo, el movimiento queda **igual** que sin la variante. El respaldo §4.1 lo quita en el paso 3, con el estado. | Cambio mínimo del catálogo. |
| 20 | Provocar | Cambio de catálogo al activarla. | Determinista: con los valores por defecto cambian **2 de 72**: `roca.extremidades` (firma 3230, escudo de fila 180 → 155 + provocar) y `brote.cabeza` (firma 2204, escudo de fila 50 → 30 + provocar). El resto, idéntico. Las criaturas híbridas y mutadas con roca, marea o brote también pueden llevarla. | Para más presencia: subir `provocar.pesos_familia.roca`. |
| 21 | IA | V4. | Referencia: predice el objetivo con la regla de carriles sobre su simulación del plan y devuelve `target: 0`. Búsqueda: una opción por movimiento (objetivo previsto solo para puntuar) y planes con `target: 0`. Con V2, ninguna propone movimientos en descanso. La de búsqueda sigue sin recibir el RNG de la partida. | Spec §3. |
| 22 | IA | Formación. | `suggestFormation(equipo)`: delante quien lleva provocar y, después, quien tiene más vida máxima. Es un punto de partida; el motor usa el orden que reciba `createBattle`. | Spec §3 ("formación si aplica"). |

## Observación para el Analista (prueba rápida, no es el estudio)
150 partidas de salvajes por combinación, IA de referencia en los dos lados, 0 planes inválidos:

| | base | V1 | V2 | V1+V2 | V1+V2+V3 | V4 | V4+V1+V2 | V4+V1+V2+V3 |
|---|---|---|---|---|---|---|---|---|
| Turnos (media) | 9,6 | 9,4 | 9,8 | 9,8 | 8,0 | 9,9 | 9,2 | 7,7 |
| % de acciones con golpe básico | 62,7 | 62,6 | 63,0 | 62,8 | 55,7 | 63,2 | 64,8 | 57,3 |

Con equipos de salvajes, provocar se usa poco (50–80 veces en 150 partidas): solo 2 movimientos del catálogo lo llevan.
