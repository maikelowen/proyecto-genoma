# Especificación de combate v0.2 — Proyecto Genoma

Estado: v0.2 para implementar y simular (semana 3). Autor: Diseñador de sistemas. Fecha: 2026-11-10.
Configuración: `config/combate.v0.2.json` (**CFG**). Movimientos: `docs/spec/movimientos-v0.2.md` y `config/movimientos.v0.2.json` (**MCFG**). Genética: `docs/spec/genetica-v0.2.md` (sin cambios). Todo número está en CFG con la ruta `[ruta]`; si hay discrepancia, **gana CFG**. **[v0.2]** marca lo que cambia respecto a v0.1.

Notación: `u` = `rng.next()` (1 tirada). `round` = `Math.round`. Solo aritmética permitida (`+ − * /`, comparaciones, `Math.round/floor/min/max/abs`); prohibidos `**`, `pow`, `sqrt`, `log`, `exp`, trigonométricas y `rng.normal`.

---

## 1. Estadísticas derivadas [v0.2]

Entradas por criatura: `P`, `V`, `R` = suma de `valores.potencia/velocidad/resistencia` de sus 4 genes D. `T = P + V + R`. Cuotas: `σP = P/T`, `σV = V/T`, `σR = R/T` (suman 1). Desviación de cuota: `dX = 3σX − 1` (0 en una criatura equilibrada; `dP + dV + dR = 0`).

| Derivada | Fórmula | Equilibrada | Ej. roca puro (σ .36/.20/.44) | Ej. voltio puro (σ .31/.47/.22) |
|---|---|---|---|---|
| Calidad `q` | `1 + 0,04·(T − 360)/360` `[beta_calidad, total_ref]` | 1 | 1 | 1 |
| Vida máx. | `round(220·(1 + 0,45·dR + 0,10·dV)·q)` `[vida.base, vida.coef]` | 220 | 244 (v0.1: 257) | 195 (v0.1: 183) |
| Ataque `fA` | `(1 + 0,50·dP + 0,10·dV)·q` `[ataque.coef]` | 1,00 | 1,01 | 0,99 |
| Iniciativa base | `100 + 50·dV` `[iniciativa.base, iniciativa.coef]` | 100 | 80 | 120 |

Forma general (la que implementa el núcleo): para `D ∈ {vida, ataque}`: `D = base·(1 + Σ_s coef[D][s]·d_s)·q`; para iniciativa: `base + Σ_s coef[s]·d_s` (sin `q`). Los coeficientes con 0 se mantienen en el JSON para que la fórmula sea única.

**Por qué [v0.2].** La iniciativa satura: con jitter ±30, una ventaja de +20 ya hace actuar primero ≈ 83 % de las veces y más velocidad apenas añade. Medido con el núcleo (Monte Carlo propio, equipos espejo C1, energía 3, 3000 combates por punto) moviendo un 10 % de cuota entre estadísticas:

| Desplazamiento de 10 % de cuota | v0.1 (vida ← 0,5·dR, ataque ← 0,5·dP) | v0.2 |
|---|---|---|
| R → V | 40,2 % | 52,6 % |
| P → V | 37,9 % | 50,0 % |
| R → P | ≈ 49,5 % | 49,2 % |

En v0.1, +1 % de cuota en velocidad valía ≈ 1 punto de victoria menos que en resistencia o potencia. En v0.2 la velocidad da además +0,10 por unidad de desviación en vida y ataque ("agilidad": esquiva y golpes rápidos), y la vida baja de 0,5 a 0,45 para no sobrecompensar. Ahora las tres cuotas valen lo mismo dentro de ±0,3 puntos por 1 %.
- Sigue sin haber multiplicaciones entre estadísticas, y la calidad solo entra por `q` (D-008/D-018 intactos; β no se toca).
- Sin defensa ni nivel `[nivel = false]`.

---

## 2. Equipo, filas y objetivos (sin cambios)
- 4 criaturas `[equipo.tamano]`: posiciones 1–2 delantera, 3–4 trasera. La formación se fija antes del combate.
- **Objetivo válido por defecto** (movimiento enemigo sin `alcance`): una criatura viva de la delantera enemiga; si está vacía, la trasera.
- Con `alcance`, cualquier enemigo vivo. Los movimientos de aliado apuntan a cualquier aliado vivo (incluido el usuario).
- `area`: todas las criaturas vivas de **una fila** (la elegida si hay `alcance` o es de aliado; si no, la delantera, o la trasera si la delantera está vacía).
- **Reobjetivo** al ejecutar si el objetivo ya no es válido: primera criatura válida por posición ascendente del mismo bando; si no queda ninguna, la acción se pierde (y se paga).

---

## 3. Estructura del turno
```
turno t = 1, 2, …, 20:
 1. Energía: t = 1 → 3 [energia.inicial]; si no, e = min(10, e + 3) [maximo, por_turno]          // [v0.2] 2 → 3 (D-020)
 2. Elección SIMULTÁNEA: cada bando entrega un plan sin ver el del rival. Una acción por criatura viva no aturdida:
    movimiento (uno de sus 4) + objetivo, o golpe básico + objetivo. Válido si Σcoste ≤ e y los objetivos son válidos ahora.
    Plan inválido (o vacío por temporizador) → todas las criaturas usan golpe básico contra el primer objetivo válido.
 3. Pago: e −= Σcoste. Se calcula la sinergia (sec. 7) con el plan.
 4. Tiradas del turno (sec. 11): jitter ×8 y varianza ×16.
 5. Orden (sec. 4) y ejecución en ese orden:
    - Si el actor está KO o ha sido aturdido este turno antes de actuar: acción cancelada y se devuelve su coste.
    - Se comprueba el objetivo (sec. 2), la condición del movimiento (MCFG) y se aplican los efectos en este orden:
      daño → drenaje → estado → escudo/cura → energía extra.
 6. Fin de turno, en orden A1…A4, B1…B4: quemadura, regeneración, KO, duración −1 y eliminación de estados a 0.
 7. Victoria: si un bando no tiene criaturas vivas, gana el otro; si ninguno tiene, empate. t = 20 sin vencedor: empate.
```
**Golpe básico** `[dano.golpe_basico]`: coste 0, potencia 10, familia = familia de la criatura, objetivo por defecto.

**Energía** compartida por bando. [v0.2] El presupuesto de movimientos es casi lineal (MCFG §1): un movimiento caro ya no rinde mucho más por energía que uno barato; su ventaja es la ráfaga (dejar KO en una acción). La tensión entre gastar y guardar la resuelve la IA con un precio de la energía (sec. 10).

---

## 4. Orden y desempates
```
iniciativa(acción) = iniciativa_base + Σ estados (prisa +30, ralentizar −30) + 30·(2u − 1)    // [orden.jitter]
nivel(acción) = 1 si el movimiento tiene `prioridad` o es de aliado (curación/protección) [v0.2]; si no, 0
clave de orden (mayor prioridad primero):
  1. nivel (0 o 1)   [orden.niveles_prioridad, orden.prioridad_movimientos_aliado]
  2. iniciativa (mayor primero)
  3. lado favorecido: A en turnos impares, B en pares
  4. posición (1 antes que 4)
```
**[v0.2] Los movimientos de aliado actúan con prioridad.** Proteger es reaccionar: un escudo o una cura que llegan después de los golpes del turno valen mucho menos. Medido: con prioridad, sustituir todas las curas y protecciones de un equipo por golpes puros del mismo coste pasa de 64,8 % a 49,3 % (paridad). Por eso el modificador `prioridad` ya no se permite en protección ni curación (MCFG). El golpe básico tiene nivel 0.

---

## 5. Daño, cura y escudo
```
pot   = potencia del movimiento (+50 % si su condición se cumple, MCFG) · (1 + sinergia)
daño  = round(pot · fA(actor) · fam · marca · debilitar · var · desgaste)    (mínimo 1 si pot > 0) [dano.minimo]
  fam       = CFG.familias.tabla[familia del movimiento][familia de la criatura objetivo]
  marca     = 1,20 si el objetivo tiene marca; debilitar = 0,80 si el actor tiene debilitar
  var       = 0,80 + 0,40·u                                   // [dano.varianza] = 0,20
  desgaste  = 1 + 0,25·max(0, t − 10)                          // [desgaste]
aplicar: el escudo absorbe primero (salvo `perforar`); el resto va a la vida.
drenaje: el actor se cura round(0,30 · vida realmente perdida por el objetivo), sin superar su máximo.
cura:    round(pot) sin estadísticas ni varianza, hasta el máximo de vida.
escudo:  + round(pot), con un máximo acumulado de 200 [estados.escudo.maximo]   // [v0.2] 150 → 200
```
- El golpe básico usa `pot = 10` y la misma fórmula (sin sinergia).
- Varianza: 1 tirada por objetivo; en `area`, las 2 tiradas de varianza de la acción por índice dentro de la fila (pos. 1/3 → a, 2/4 → b).
- Quemadura y regeneración son fijas (sin estadísticas, varianza ni desgaste). La quemadura no la absorbe el escudo.

---

## 6. Familias: dos anillos `[familias]` (sin cambios)
Cada familia es **fuerte (×1,25)** contra la siguiente de su anillo y **débil (×0,80)** contra la anterior; si no, neutral. Entre base e híbrida, neutral.
**Anillo base**: Marea → Llama → Brote → Roca → Voltio → Sombra → Marea.
**Anillo híbrido**: Vapor → Magma → Espora → Liquen → Plasma → Tormenta → Abismo → Vapor.
Ventaja media 0 para todas. La tabla 13 × 13 está en `familias.tabla` y debe cuadrar con los anillos.

---

## 7. Sinergia `[sinergia]` (sin cambios)
Cada criatura que usa un **movimiento** (no el golpe básico) pertenece al grupo de su familia (una híbrida, también a los de sus dos componentes). Bonus por el grupo más numeroso: 2 → +10 %, 3 → +20 %, 4 → +30 % a la potencia de daño, cura y escudo. Se fija al pagar el plan.

---

## 8. Estados (lista cerrada) `[estados]`
`duracion` = nº de finales de turno que dura, contando el del turno en que se aplica.

| Estado | Tipo | Efecto | Duración | Apilado |
|---|---|---|---|---|
| Quemadura | − | 12 por pila al final del turno | 3 | pilas, máx. 3; cada aplicación suma 1 y reinicia duración |
| Ralentizar | − | −30 iniciativa | 2 | refresca |
| Aturdir | − | pierde su próxima acción | 1 | refresca; después, inmune 2 turnos `[inmunidad_turnos]` |
| Marca | − | recibe ×1,20 | 2 | refresca |
| Debilitar | − | inflige ×0,80 | 2 | refresca |
| Escudo | + | absorbe daño | 2 | suma, máx. **200** [v0.2] |
| Prisa | + | +30 iniciativa | 2 | refresca |
| Regenerar | + | +15 de vida al final del turno | 3 | refresca |

**Aturdir**: si el objetivo aún no ha actuado, su acción se cancela (y se devuelve la energía al llegar su turno); si ya actuó, no elige acción en t + 1. Inmune hasta t + 2. Contra inmune, el resto del movimiento sí se aplica.

---

## 9. Fin de partida (sin cambios)
Gana quien deja al otro sin criaturas vivas; KO mutuo en el mismo turno = empate. Desgaste desde el turno 11 (+25 % por turno). Turno 20 sin vencedor: empate.

---

## 10. IA de referencia (para el simulador) `[ia]` [v0.2]
Determinista, **sin tiradas**. Unidades de valor: puntos de vida equivalentes. Parámetros: `reserva` (por defecto 0), `kappa`, `bonus_ko`, `valor_estado`, `valor_max_escudo`, `holgura_regenerar`, `objetivos_area_estimados`, `factor_cura_estimada`, `prob_condicion_estimada`, `penalizacion_coste`.

### 10.1 Precio de la energía (planificar el ahorro) — una vez por turno
```
H  = media de (vida + escudo) de los enemigos vivos
para cada movimiento m de cada criatura viva del bando:
  n  = m.area ? objetivos_area_estimados (1,5) : 1
  v̂  = daño:   min(m.potencia · fA, H) · n
       cura:   m.potencia · factor_cura_estimada (0,6) · n
       escudo: min(m.potencia, valor_max_escudo (90)) · n
  si m.condicion: v̂ ·= 1 + 0,5 · prob_condicion_estimada (0,5)
  r(m) = (v̂ − 10 · fA) / m.coste            // rendimiento neto por energía (descontado el golpe básico al que sustituye)
λ  = kappa (0,9) · máx r(m);   c* = coste del m que da el máximo (empate → el primero por posición y locus)
```
Los estados **no** entran en `v̂` (medido: incluirlos inflaba λ y la IA acaparaba energía sin gastarla).

### 10.2 Regla de reserva (se mantiene)
Si `e < reserva`, `e + 3 ≤ 10` y ningún movimiento de daño asequible, solo y sin sinergia, deja KO a un enemigo: plan = golpe básico de todas.

### 10.3 Enumeración y valor del plan
Todas las combinaciones (≤ 5⁴ = 625) con `Σcoste ≤ e`, simuladas en orden de posición sobre una copia de vidas (var = 1, sin escudos enemigos):
```
objetivo de cada acción de daño: el candidato válido AHORA que maximiza Σ_afectados [min(daño, vida) + bonus_ko si daño ≥ vida]   // [v0.2]
  empate → menos vida → menor posición
cura: aliado con menor vida/máx; escudo: delantero con menos vida (si no hay, trasero); otros aliados: el usuario.
valor = Σ min(daño, vida) + bonus_ko (50) por KO
      + Σ min(cura, vida que falta)
      + Σ max(0, min(escudo, valor_max_escudo − escudo actual del objetivo))                 // [v0.2] descuenta el escudo que ya tiene
      + Σ valor_estado[estado] por estado ofensivo aplicado a un objetivo que sobrevive (aturdir sobre inmune: 0)
      + valor_estado.prisa si aplica prisa
      + Σ min(valor_estado.regenerar, vida que falta + holgura_regenerar) por regenerar        // 45 y 15
      + λ por cada energía extra del movimiento
      + λ · min(e − Σcoste, c*, 10 − 3)                                                       // [v0.2] valor de lo que se guarda
      − penalizacion_coste · Σcoste                                                           // solo desempate
Se elige el valor máximo; empate → combinación menor en orden lexicográfico (golpe = 0, movimientos 1–4 por locus).
```
`valor_estado` `[ia.valor_estado]`: quemadura 36 (= 12 × 3), marca 15, debilitar 15, ralentizar 5, prisa 5, aturdir 40, regenerar 45 (con tope por vida que falta).

**Cómo ahorra.** Guardar energía vale `λ` por unidad, pero solo hasta el coste `c*` del movimiento que más rinde (más allá no compra nada) y sin pasar de lo que cabe sin desbordar el siguiente turno. Si el movimiento caro rinde por energía más de 1/κ ≈ 1,11 veces lo que rinden las opciones de ahora, la IA guarda; si no, gasta. `H` limita el valor estimado de los golpes grandes al daño que realmente cabe (sin sobredaño), así que la IA no ahorra para un golpe de 250 cuando a los enemigos les quedan 80 de vida. Coste: O(movimientos) por turno, despreciable frente a la enumeración.

Detalles heredados de v0.1 (notas de implementación 17): candidatos válidos ahora, la simulación solo puntúa; daño esperado con la fórmula completa y var = 1; un enemigo que cae en la simulación no suma más.

---

## 11. Determinismo y orden de tiradas (sin cambios)
- `rng = createRng("combate|" + semilla)` `[semilla.prefijo]`.
- **24 tiradas por turno, fijas** `[tiradas.por_turno]`: t1–t8 jitter de A1…A4, B1…B4; t9–t24 dos de varianza por posición (A1a, A1b, …, B4b). Pertenecen a la posición, no al orden de ejecución.
- **La IA sigue sin consumir tiradas.** Ningún cambio de v0.2 añade ni quita tiradas: 24 por turno en combate y 8 por movimiento en la generación.
- Hash de combate con serialización canónica.

---

## 12. Criterios de éxito `[escenarios_sim]`, `[criterios_sim]`
Escenarios C1–C4 como en v0.1 (C1 aleatorio 20.000 combates; C2 monofamilia 1000 por pareja; C3 calidad 10.000; C4 reservas {0, 3, 5, 7}). La sustitución de movimientos: MCFG §7.

| Criterio | Umbral | Estimación v0.2 (Monte Carlo propio, núcleo v0.1 parcheado en /tmp) |
|---|---|---|
| Duración C1 | media 7–12, mediana 7–11, p90 ≤ 15, empates ≤ 3 % | media 8,8–8,95, mediana 8, p90 13, empates 0,4–0,5 % (3000–5000) |
| Lado C1 | A entre 48,5 % y 51,5 % | 48,6 %–51,4 % según semilla (frágil, como en v0.1) |
| Familias C2 | las 13 entre 45 % y 55 % | **9–10 de 13** (rango 40–61 %), ver sec. 16 |
| D-008 C3 | X ≤ 55 % (objetivo), ≤ 60 % (límite) | β 0,04: 51,4–52,2 %; β 0: 51,1–51,3 % |
| Energía C4 [v0.2] | u = 0 ≥ 45 % contra cualquier reserva; ninguna u > 0 > 55 %; uso de movimientos de coste 4–5 cuando se pueden pagar ≥ 5 % | u 3: 51,6 %, u 5: 47,0 %, u 7: 44,5 % (u = 0 gana 55,5 %); uso c4 11 %, c5 4–5 % |
| Perfiles (nuevo, informativo) | mover 10 % de cuota entre dos estadísticas: 46–54 % | 49,2–52,6 % |
| Iniciativa (inf.) | 50–65 % | sin cambios esperados |

**[v0.2] Por qué cambia C4.** En v0.1 la IA gastaba todo y una reserva externa le ganaba; ahora la IA ya pone precio a la energía, así que una reserva fija no debería ganarle (si gana, la IA está mal calibrada). Lo que hay que vigilar es que ninguna reserva domine y que los movimientos caros se usen.

---

## 13. Barridos sugeridos `[barridos_sim]`
| Parámetro | Valores (negrita = defecto) |
|---|---|
| `estadisticas.beta_calidad` | 0 · **0,04** · 0,06 |
| `estadisticas.vida.coef.velocidad` (y `ataque.coef.velocidad` igual) | 0,05 · **0,10** · 0,15 |
| `ia.kappa` | 0 · 0,6 · 0,8 · **0,9** |
| `orden.jitter` | 20 · **30** · 45 |
| `dano.golpe_basico.potencia` | 0 · **10** · 15 |
| `estadisticas.vida.base` | 200 · **220** · 240 |

---

## 14. Decisiones (para DECISIONES.md)
| # | Decisión | Alternativas descartadas |
|---|---|---|
| C1–C9 | Las de v0.1 siguen vigentes salvo lo que matizan C10–C14 | — |
| C10 [v0.2] | Matriz de coeficientes por cuota; la velocidad aporta 0,10 a vida y ataque; vida 0,45 | Subir solo `iniciativa.coef` (satura: ≥ 83 % ya actúa primero); `alfa_vida` 0,25 sola (el informe: aún 7 familias fuera); evasión por velocidad (añade tiradas) |
| C11 [v0.2] | Movimientos de aliado con prioridad 1 implícita | Subir potencia de cura/escudo (medido: ×2,5 de potencia solo da +3 puntos; el problema es el momento, no la cantidad) |
| C12 [v0.2] | IA con precio sombra de la energía (λ, κ = 0,9, tope c*) | Mirar 2 turnos adelante (625² planes); reserva fija (no distingue cuándo compensa) |
| C13 [v0.2] | Objetivo de daño = el que maximiza valor (con KO), no el de más daño bruto | Más daño bruto (reparte el daño y no remata) |
| C14 [v0.2] | `energia.por_turno` = 3 (D-020, director) | Golpe básico 20 + desgaste antes (acorta por fuerza bruta) |

## 15. Preguntas para el dueño
Ninguna nueva de fondo: β sigue en 0,04 (D-018) y la genética no cambia. **Aviso:** los perfiles pasan a valer lo mismo, así que especializarse en velocidad deja de ser una trampa; quien crió para resistencia en v0.1 verá su ventaja reducida (no hay jugadores aún, sin coste real).

## 16. Cambios respecto a v0.1
| Ruta CFG | v0.1 | v0.2 | Motivo | Efecto estimado |
|---|---|---|---|---|
| `energia.por_turno` | 2 | 3 | D-020 (duración) | media 12,6 → 8,9 |
| `estadisticas.alfa_vida/alfa_potencia` | 0,5 / 0,5 | sustituidos por `vida/ataque/iniciativa.coef` (R 0,45, V 0,10 / P 0,50, V 0,10 / V 50) | los perfiles no valían lo mismo | 10 % de cuota hacia V: 40 % → 50–53 % |
| `orden.prioridad_movimientos_aliado` | — | 1 | el apoyo llegaba tarde | apoyo → golpe: 64,8 % → 49,3 % |
| `estados.escudo.maximo` | 150 | 200 | escudo por punto 6 → 7,5 (MCFG) | — |
| `ia.*` | reserva + valor por puntos de estado | precio sombra λ (κ 0,9, tope c*), valor de estado en vida, objetivo por valor | sec. 10 | usa c4 11 %, c5 4–5 % cuando puede pagarlos |
| `criterios_sim.energia` | reserva u > 0 gana > 52 % | ninguna reserva domina + uso c4–5 ≥ 5 % | la IA ya ahorra sola | — |
| `barridos_sim` | — | + `vida.coef.velocidad`, `ia.kappa` | — | — |
| Tiradas | 24/turno | **24/turno** (sin cambios) | — | — |

Familias C2 (estimación con todo v0.2, combate + movimientos): rango 23–72 % → 40–61 %; fuera de banda 6–8 → 3–4.

## 17. Pendiente de validar en simulación
1. **C2 sigue sin cumplir del todo** en mi estimación (2 semillas × 150 por pareja): espora ≈ 60 %, roca ≈ 40–42 %, llama ≈ 42 %, voltio ≈ 44–46 %; las otras 9–10 dentro (v0.1: 23–72 %). Con kits de forma aleatoria (sin catálogo) salen 12/13 dentro, así que las piezas ya están equilibradas y lo que queda es el **catálogo**: cambiar un solo movimiento de una familia base mueve su C2 entre 10 y 15 puntos. Hay que repetir la búsqueda de sales (movimientos §5.2) con el simulador real y más combates, e incluir las híbridas (que dependen de los D de sus componentes).
2. Todos los criterios de la sec. 12 con el núcleo real (mis cifras salen de una copia del núcleo v0.1 parcheada; no sustituyen al informe).
3. La IA v0.2 empata con la v0.1 en enfrentamiento directo con la config v0.2 (≈ 49 %), y guardar (κ 0,9) frente a no guardar (κ 0) da ≈ 50–51 %: con el presupuesto casi lineal, ahorrar no compensa casi nunca, lo cual es coherente. Si se quiere que los movimientos de coste 5 se usen más, la palanca es `presupuesto_por_coste.5`, no la IA.
4. `alcance` medido con valor negativo (−1,5 puntos por movimiento) incluso gratis: puede ser un defecto de la heurística de objetivo de la IA. Coste 0 hasta revisarlo.
