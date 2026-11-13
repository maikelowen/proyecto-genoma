# Especificación de combate v0.4 — equipos de 3 en cuadrícula 2×2 (D-043)

Estado: propuesta para implementar y simular. Autor: Diseñador de sistemas. Fecha: 2026-11-13.
Base: `combate-v0.2.md` + balance v0.2.1 + variantes v0.3 (V2 descanso **activo**, V4 objetivo automático y provocar como opciones). Este documento **solo** recoge lo que cambia; lo marcado **[v0.4]** es autocontenido. Lo que no aparece aquí sigue igual que en v0.2/v0.3.
Números: parche `config/propuestas/combate-v0.4.json` (**P**), con la ruta entre corchetes `[ruta]`. Si no coinciden, manda P. Movimientos: `movimientos-v0.4.md`. Interfaz: `glosario-v0.4.md`.

---

## 1. Cuadrícula, equipo y colocación [v0.4]

| Casilla (posición) | Fila | Carril |
|---|---|---|
| 1 | delantera | izquierdo |
| 2 | delantera | derecho |
| 3 | trasera | izquierdo |
| 4 | trasera | derecho |

- `carril(pos) = (pos − 1) mod 2` (como v0.3). Las posiciones 1–4 se mantienen en el estado: **una casilla queda vacía** (`null`). `[equipo.tamano] = 3`, `[equipo.casillas] = 4` (clave nueva).
- **Colocaciones válidas** `[equipo.colocaciones]` (nueva): `"2+1"` (casillas 1 y 2 ocupadas + una trasera) o `"1+2"` (una delantera + casillas 3 y 4). Es válida cualquier asignación de las 3 almas a 3 casillas distintas: la casilla vacía decide la forma (vacía 3 o 4 → "2+1"; vacía 1 o 2 → "1+2"). Son 4 × 3! = 24 disposiciones.
- **Elección**: antes del turno 1, simultánea y oculta; se revela al empezar. Validación sin tiradas: exactamente 3 almas, ninguna casilla repetida, forma ∈ colocaciones; si no, se aplica la regla de la IA (§7).
- **Efecto de la casilla vacía**: solo importa a través de los carriles. Un atacante cuyo carril está vacío en la fila atacable pega a la otra alma de esa fila (§3). En "2+1", la casilla trasera elegida decide qué carril enemigo tiene "enfrente" a la trasera cuando caiga la delantera; en "1+2", la delantera elegida recibe los golpes de los dos carriles.
- **Tiradas: sin cambios, 24 por turno.** Las de una casilla vacía (jitter y varianza) se consumen y se descartan. Los barridos siguen pareados y el parser no cambia la fórmula (`8 + 16`).
- Fin de partida, KO mutuo, turno 20: igual que v0.2.

## 2. Botones por alma [v0.4]
Cada alma tiene **4 botones**: 1 **movimiento gratis** (gen de **extremidades**, coste 0) y 3 **de pago** (cabeza, cuerpo, cola). **Desaparece el golpe básico genérico** `[dano.golpe_basico.activo] = false` (clave nueva).

| Regla | Movimiento gratis | Movimientos de pago |
|---|---|---|
| Coste | 0 | 1–5 |
| Presupuesto | `gratis.presupuesto` = 3 puntos (≈ 15 de daño, 20 de escudo, 15 de cura) | v0.2.1 (§ MCFG) |
| Descanso (V2) | **no descansa** `[variantes.descanso.gratis_descansa] = false` | descansa 1 turno |
| Sinergia (§5) | ni cuenta para el grupo ni recibe el bonus | sí |
| Provocar | nunca | según catálogo |
| Prioridad | nivel 0 salvo protección/curación (prioridad implícita, como v0.2) | como v0.2 |

- **Plan inválido / temporizador** [v0.4]: todas las almas usan su movimiento gratis (antes: golpe básico).
- Generación del gratis, arquetipos y piezas: `movimientos-v0.4.md` §2.
- Para la IA (§8), el gratis ocupa el papel del golpe básico en el precio de la energía: `r(m) = (v̂(m) − v̂(gratis del alma)) / coste`.

## 3. Objetivo automático con prioridad de fila [v0.4]
Se activa con `[variantes.objetivo_automatico.activo] = true` y `[variantes.objetivo_automatico.prioridad_fila] = true` (nueva). El plan no lleva objetivo (`target` se normaliza a 0, como v0.3). **Todo se decide al ejecutar la acción**, con el estado de ese momento.

```
filaAtacable(enemigo) = delantera si tiene algún alma viva; si no, trasera
filaTrasera(enemigo)  = trasera si tiene alguna viva; si no, delantera          // para `alcance`
elegirEnFila(fila, actor) =
    el alma viva de esa fila en carril(actor.pos); si no hay, la otra alma viva de la fila

objetivoUnico(actor, mov):                       // golpe, golpe_estado, táctico, gratis ofensivo
  P = provocadores enemigos vivos con provocar activo
  si P ≠ ∅: devolver elegirEn(P, actor)          // carril del actor primero; si no, menor posición
  fila = mov.alcance ? filaTrasera(enemigo) : filaAtacable(enemigo)
  devolver elegirEnFila(fila, actor)

objetivoArea(actor, mov):                        // area, maldición
  fila = mov.alcance ? filaTrasera(enemigo) : filaAtacable(enemigo)
  devolver todas las almas vivas de esa fila     // provocar NO desvía el área
```

### 3.1 Movimientos de aliado (automáticos) [v0.4]
Se mantiene lo automático: la IA nunca elegía otra cosa (notas v0.3, n.º 14) y no hay motivo fuerte para pedir objetivo.

| Tipo | Objetivo | Empate | Si nadie lo necesita |
|---|---|---|---|
| Cura (individual) | aliado vivo con menor `vida/máx` (comparación cruzada sin dividir) | menor posición | va al usuario y no cura (la acción se paga; **regenerar** sí se aplica). La IA lo valora 0. |
| Escudo (individual) | aliado vivo de la **fila propia expuesta** (= `filaAtacable` vista por el rival) con menor `vida + escudo` `[variantes.objetivo_automatico.escudo_fila_expuesta]` (nueva) | menor posición | si todos están en el tope, va al mismo objetivo y no suma; la acción se paga |
| Escudo con provocar | **siempre el usuario** (`escudo_provocar_al_usuario` = true, confirmado) | — | — |
| Cura / escudo de área | todas las almas vivas de la fila propia expuesta | — | — |
| Prisa (táctico) | el usuario | — | — |

### 3.2 Provocar [v0.4]
Durante `[variantes.provocar.duracion] = 1` (el turno en que se ejecuta, desde ese momento) **todos los ataques enemigos de un solo objetivo** (incluido `alcance` y el gratis) van al provocador, **desde cualquier fila**. No desvía el área. Si cae, deja de desviar en ese mismo instante.

### 3.3 Casos borde (todos deterministas y sin tiradas)

| Caso | Resultado |
|---|---|
| La delantera cae a mitad de turno | Las acciones posteriores del mismo turno ven `filaAtacable` = trasera. La acción **nunca se pierde** mientras quede un enemigo vivo. |
| Fila atacable con una sola alma | Todos los atacantes de un objetivo le pegan a ella (es la "concentración" de la forma 1+2). |
| Carril del atacante vacío en la fila | Pega a la otra alma de la fila. |
| Atacante de la fila trasera | Usa su carril igual que uno delantero (el carril no depende de la fila del atacante). |
| `alcance` y la trasera enemiga está vacía (o muerta) | Ataca la delantera con la misma lógica de carril. |
| `alcance` + área (maldición con alcance) | Toda la trasera viva; si no hay, toda la delantera. |
| Dos provocadores en el mismo bando | El del carril del atacante; si ninguno está en su carril, el de menor posición. |
| Provocador KO antes de que actúe el atacante | Regla normal (fila atacable). |
| Provocar con prioridad implícita (protección) frente a un ataque con `prioridad` | Empatan en nivel; decide iniciativa (como v0.3, nota 17). Un táctico con provocar actúa en su orden normal: los ataques anteriores no se desvían. |
| Cura cuando todos están llenos | §3.1: al usuario, sin efecto de cura. |
| Escudo cuando todos están en el tope | §3.1: sin efecto de escudo. |
| Ningún enemigo vivo al ejecutar | La acción se pierde (se paga), como v0.2. |

### 3.4 Apilado de escudos (arreglo de Q-01, general) [v0.4]
`[estados.escudo.renovar] = "si_aporte_mayor_o_igual"` (nueva):
```
nuevo = min(maximo, actual + aporte)
duracion = (aporte ≥ actual) ? max(restante, duracion_escudo) : restante
```
Un escudo pequeño (gratis de 20) **suma pero no renueva** uno grande. Se aplica a todos los escudos (gratis y de pago). Test pedido: escudo 200 con 1 turno + gratis de 20 → 220 que desaparece al final del turno siguiente.

## 4. Escala para equipos de 3 [v0.4]

| Ruta | v0.2.1 (4 almas) | v0.4 propuesta | Motivo |
|---|---|---|---|
| `energia.inicial` / `por_turno` / `maximo` | 3 / 3 / 10 | **4 / 4 / 10** | gratis ≤ 50 % |
| `estadisticas.vida.base` | 220 | **290** | 6–10 turnos con más energía por alma |
| `sinergia.bonus_por_n` | 2: 0,10 · 3: 0,20 · 4: 0,30 | **2: 0,10 · 3: 0,25** | el máximo baja de 4 a 3 almas |
| `desgaste.desde_turno` | 10 | 10 (barrido 8–10) | tope de duración del tanque |

**Razonamiento (estimación a mano; el Analista la valida):**
- **Energía.** Coste medio pagado del catálogo = 3,0; el uso real se inclina a lo barato (≈ 2,4). Pagos por turno ≈ `E / 2,4`. Con 3 almas vivas: E = 3 → 1,25 pagos (gratis ≈ 58 %, **suspende**); E = 4 → 1,67 (gratis ≈ 44 %); E = 5 → 2,1 (≈ 30 %, demasiado rápido y bola de nieve, como V3). Al caer almas, la energía compartida no baja: el bando que pierde un alma gasta más por alma (efecto de remontada natural, a favor del criterio de primer KO).
- **Vida.** Daño por turno ∝ `E·k + n_gratis·15` con k ≈ 35–40 de potencia útil por energía. v0.2.1: `3k + 2,5·10` ≈ 130 sobre 880 de vida → 9,7 turnos (factor de sobredaño/cura/escudo ≈ 1,43). v0.4: `4k + 1,3·15` ≈ 155–180. Para una media de ≈ 8 turnos: `3·V ≈ 8/1,43 · 165 ≈ 920` → **V ≈ 290–305**. Elijo 290 (más cerca del centro de 6–10 si el área, ahora más frecuente, reparte daño).
- **Sinergia.** Con 3 almas y E = 4, que las 3 paguen el mismo turno exige 3 movimientos de coste ≤ 1,33 de media: es raro. +0,25 hace que ese turno valga la pena en equipos monofamilia sin pasar del +0,30 de antes. Con 2: igual (0,10).
- Presupuesto del coste 1: 6 → **7** (MCFG): con el gratis a 3 puntos, el neto del coste 1 sería 3/energía frente a 4 en v0.2.1 (lección "kits baratos pierden").

## 5. Sinergia [v0.4]
Igual que v0.2 pero con `bonus_por_n = {2: 0,10, 3: 0,25}` y **el movimiento gratis no cuenta ni recibe bonus** (si contase, todo equipo monofamilia tendría el máximo cada turno gratis).

## 6. Reparto de provocar y de alcance/área
Detalle en `movimientos-v0.4.md` §3–4. Resumen:
- **Alcance o área garantizado en toda alma**: el locus **cola** es siempre ofensivo y lleva `alcance` salvo que ya tenga área. Cubre las 6 familias base, las 7 híbridas y los genes mutados (una garantía por catálogo no cubría mutados ni híbridas).
- **Provocar**: en protección **y táctico** ("golpe que desafía"), por probabilidad de familia: roca 0,7, marea 0,4, brote 0,25, resto 0; híbridas = **máximo** de sus componentes (liquen y magma 0,7; vapor, tormenta y abismo 0,4; espora 0,25; plasma 0). Cuota de catálogo base: **≥ 4 movimientos** (roca ≥ 2, marea ≥ 1, brote ≥ 1), con sales si hace falta.
- Contra el hundimiento de Brote en v0.3: el escudo de un movimiento con provocar debe llevarse ≥ 50 % del presupuesto, va al usuario, y la IA solo provoca si el usuario aguanta (§8).

## 7. Colocación de la IA [v0.4]
`[ia.colocacion]` (nueva). Determinista, sin tiradas:
```
ordenar almas por vida máx desc (empate: índice en el equipo)
si vida(1.ª) ≥ umbral_1_2 (1,15) · vida(2.ª): "1+2": 1.ª en casilla 1; 2.ª en 3; 3.ª en 4
si no:                                         "2+1": 1.ª en 1; 2.ª en 2; 3.ª en 3
```
Sustituye a `suggestFormation` de v0.3 (que ponía delante a quien lleva provocar). Para el criterio de colocación, el Analista enfrenta además "siempre 2+1" contra "siempre 1+2" con el mismo equipo.

## 8. IA de referencia: cambios [v0.4]
- Enumeración: ≤ 4 opciones por alma (gratis + pagos no en descanso) → ≤ 4³ = 64 planes.
- Simula el plan **en orden de iniciativa estimada** (sin jitter) aplicando §3 (KO a mitad de turno cambia la fila atacable en su simulación). Q-05: debe ver el provocar propio y el del rival activado **este** turno en su simulación.
- `valor(provocar)` = `[variantes.provocar.valor_ia]` (20) **solo si** `vida + escudo del usuario tras el movimiento ≥ media de (vida + escudo) de sus aliados vivos` `[variantes.provocar.ia_exige_aguante]` (nueva); si no, 0.
- Cura con todos llenos y escudo en el tope valen 0 (ya ocurría).

## 9. Criterios de adopción (D-043) `[criterios_sim.v04]` (nuevo bloque)

| Criterio | Medida | Umbral |
|---|---|---|
| Profundidad | IA de búsqueda vs mejor IA de reglas, ≥ 400 partidas | > 60 % |
| Remontada | gana quien hace el primer KO; gana quien lidera en vida tras el turno 3 | ambos < 65 % |
| Duración | media de turnos C1 | 6–10 (p90 ≤ 14, empates ≤ 3 %) |
| Gratis | % de acciones ejecutadas que son el gratis | ≤ 50 % |
| Uso de pago | media por alma (almas con ≥ 4 acciones) de movimientos de pago **distintos** usados en la partida | ≥ 2 (de 3) |
| Colocación | WR de cada colocación (2+1 / 1+2 / regla IA) contra las demás, mismo equipo | ninguna > 60 % |
| Tanque | equipos con un alma de vida ≥ p90 delante y un apoyo (protección o curación) detrás, contra C1 | media de turnos ≤ 10 |
| Familias (C2) | 13 familias monofamilia (3 almas) | 43–57 % |
| Provocar (informativo) | usos por partida en C1 | ≥ 0,3 (v0.3: 0,08) |

**Estimación a mano** (no Monte Carlo; orientativa): duración 7,5–9; gratis 40–48 % (**el más justo**: palanca `energia.por_turno` 4 → 5 o `presupuesto_por_coste.1`); primer KO 60–66 % (con 3 almas cada KO pesa un 33 % del equipo: **riesgo**; palancas `vida.base` y energía compartida); familias: imposible estimar sin simular (el gratis cambia 18 genes del catálogo y la cola, otros 18: habrá que repetir la búsqueda de sales).

## 10. Decisiones (para DECISIONES.md)

| # | Decisión | Alternativas descartadas |
|---|---|---|
| C15 | Cuadrícula de 4 casillas con una vacía; se conservan posiciones 1–4 y las 24 tiradas | Reindexar a 3 posiciones (rompe el orden de tiradas y los carriles de v0.3) |
| C16 | Fila atacable y objetivo se deciden al ejecutar | Fijarlos al inicio del turno (pierde acciones y castiga la iniciativa) |
| C17 | Cura y escudo automáticos; escudo a la fila expuesta con menos vida + escudo | Elección manual (la IA nunca elegía otra cosa); escudo al delantero con menos vida (v0.3: no contaba el escudo ya puesto) |
| C18 | Escudo: suma siempre, renueva solo si el aporte ≥ el actual (Q-01) | `max(actual, aporte)` (anula escudos pequeños de pago); no renovar nunca (dos escudos grandes seguidos se pierden) |
| C19 | Energía 4/turno, vida 290, sinergia 0,10/0,25 | E = 3 (gratis ≈ 58 %); E = 5 (bola de nieve, como V3) |
| C20 | El gratis no cuenta para la sinergia | Que cuente (sinergia máxima gratis cada turno) |
| C21 | IA coloca por vida con umbral 1,15 para 1+2 | Provocador delante (v0.3; el provocar ya funciona desde atrás) |

## 11. Pendiente de validar en simulación
1. Todos los criterios de §9 con el núcleo real; barridos: `energia.por_turno` {4, 5}, `vida.base` {260, 290, 320}, `gratis.presupuesto` {2, 3, 4}, `ia.colocacion.umbral_1_2` {1,0; 1,15; 1,3}, `desgaste.desde_turno` {8, 10}.
2. Valor de `alcance` con la nueva semántica (prueba de pieza gratis): propongo coste 1; puede valer más.
3. Repetir sales C2 con el catálogo nuevo (gratis + cola + provocar).
4. Si "gratis ≤ 50 %" falla con E = 4, subir primero `presupuesto_por_coste.1` (abarata pagar) antes que la energía.
