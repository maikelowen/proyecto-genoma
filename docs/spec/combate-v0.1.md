# Especificación de combate v0.1 — Proyecto Genoma

Estado: v0.1 para implementar y simular (semana 2). Autor: Diseñador de sistemas. Fecha: 2026-11-10.
Configuración: `config/combate.v0.1.json` (**CFG**). Movimientos: `docs/spec/movimientos-v0.1.md` y `config/movimientos.v0.1.json` (**MCFG**). Genética: `docs/spec/genetica-v0.2.md`. Todo número está en CFG con la ruta `[ruta]`; si hay discrepancia, **gana CFG**.

Notación: `u` = `rng.next()` (1 tirada). `round` = `Math.round`. Solo aritmética permitida (`+ − * /`, comparaciones, `Math.round/floor/min/max/abs`); prohibidos `**`, `pow`, `sqrt`, `log`, `exp`, trigonométricas y `rng.normal`.

---

## 1. Estadísticas derivadas

Entradas por criatura: `P`, `V`, `R` = suma de `valores.potencia/velocidad/resistencia` de sus 4 genes D. `T = P + V + R` (≈ 4 × calidad, 342–378). Cuotas de perfil: `σP = P/T`, `σV = V/T`, `σR = R/T` (suman 1).

| Derivada | Fórmula | Rango típico |
|---|---|---|
| Factor de calidad `q` | `1 + 0.04·(T − 360)/360` `[estadisticas.beta_calidad, total_ref]` | 0,998–1,002 |
| Vida máxima | `round(220 · (1 + 0.5·(3σR − 1)) · q)` `[vida_base, alfa_vida]` | 130–330 (equilibrada 220) |
| Factor de ataque `fA` | `(1 + 0.5·(3σP − 1)) · q` `[alfa_potencia]` | 0,59–1,50 (equilibrada 1,00) |
| Iniciativa base | `100 + 50·(3σV − 1)` `[iniciativa_base, iniciativa_escala]` | 59–150 (equilibrada 100) |

- **Sin defensa** como estadística aparte (la defensa viene de escudos, filas y estados) y **sin nivel** `[estadisticas.nivel = false]`: en PvP todas las criaturas compiten con sus genes.
- **Por qué cuotas y no valores absolutos (D-008):** la calidad escala las tres estadísticas a la vez y deja las cuotas igual, así que su único efecto pasa por `q` (±0,2 %). La especialización (repartir puntos) sí cambia las cuotas y tiene efecto fuerte, pero es un intercambio: más ataque cuesta vida o iniciativa. No hay multiplicaciones entre estadísticas distintas: cada derivada usa una cuota de la misma criatura.
- Hallazgo de calibración (Monte Carlo simplificado, combates espejo IA contra IA): con estadísticas absolutas, una ventaja total de solo un 1 % en daño+vida ya daba ≈ 58 % de victorias, y la velocidad sola un 63 %. Ninguna escala lineal deja la calidad por debajo del 55 % sin dejar también la especialización casi sin efecto. Las cuotas separan las dos cosas.

---

## 2. Equipo, filas y objetivos
- 4 criaturas `[equipo.tamano]` en las posiciones 1–4: 1–2 delantera, 3–4 trasera `[equipo.delantera/trasera]`. El jugador fija la formación antes del combate y no cambia durante él.
- **Objetivo válido por defecto** (movimientos enemigos sin `alcance`): una criatura viva de la fila delantera enemiga. Si la delantera está vacía, la trasera pasa a ser válida.
- Con `alcance`, cualquier criatura enemiga viva. Los movimientos de aliado pueden apuntar a cualquier aliado vivo (incluido el usuario).
- `area`: afecta a todas las criaturas vivas de **una fila** (la elegida si el movimiento tiene `alcance` o es de aliado; si no, la delantera, o la trasera si la delantera está vacía).
- **Reobjetivo** al ejecutar, si el objetivo ya no es válido: primera criatura válida por posición ascendente del mismo bando. Si no queda ninguna, la acción se pierde (y se paga).

---

## 3. Estructura del turno (elección simultánea)
```
turno t = 1, 2, …, 20:
 1. Energía: t = 1 → 3 [energia.inicial]; si no, e = min(10, e + 2) [maximo, por_turno].
 2. Elección SIMULTÁNEA: cada bando entrega un plan sin ver el del rival. Una acción por criatura viva no aturdida:
    movimiento (uno de sus 4) + objetivo, o golpe básico + objetivo. Válido si Σcoste ≤ e y los objetivos son válidos ahora.
    Plan inválido (o vacío por temporizador) → todas las criaturas usan golpe básico contra el primer objetivo válido.
 3. Pago: e −= Σcoste. Se calcula la sinergia (sec. 7) con el plan.
 4. Tiradas del turno (sec. 11): jitter ×8 y varianza ×16.
 5. Orden (sec. 4) y ejecución en ese orden:
    - Si el actor está KO o ha sido aturdido este turno antes de actuar: acción cancelada y se devuelve su coste.
    - Se comprueba el objetivo (sec. 2), la condición del movimiento (MCFG) y se aplican los efectos en este orden:
      daño → drenaje → estado → escudo/cura → energía extra.
 6. Fin de turno, criaturas en orden A1…A4, B1…B4: quemadura, regeneración, KO, duración −1 y eliminación de estados a 0.
 7. Victoria: si un bando no tiene criaturas vivas, gana el otro; si ninguno tiene, empate.
    Si t = 20 [fin.turnos_max] y no hay vencedor: empate.
```
**Golpe básico** `[dano.golpe_basico]`: coste 0, potencia 10, familia = familia de la criatura, objetivo por defecto. Sirve para que nadie esté parado y hace que ahorrar energía tenga un coste moderado.

**Energía**: compartida por bando. La tensión entre gastar y guardar viene de tres cosas: (a) presupuesto convexo, porque un movimiento de 5 da un 40 % más de puntos por energía que uno de 1 (MCFG); (b) la condición `reserva`; (c) la sinergia por actuar juntos.

---

## 4. Orden y desempates
```
iniciativa(acción) = iniciativa_base + Σ estados (prisa +30, ralentizar −30) + 30·(2u − 1)    // [orden.jitter]
clave de orden, de mayor a menor prioridad:
  1. nivel de prioridad (0 o 1; el modificador `prioridad` da 1)   [orden.niveles_prioridad]
  2. iniciativa (mayor primero)
  3. lado favorecido: A en turnos impares, B en pares (no hay "primer jugador")
  4. posición (1 antes que 4)
```
Contra D-008: el jitter de ±30 hace que +1 de iniciativa no decida nunca solo. Con la misma iniciativa base, cada lado actúa primero el 50 %. Con +5, ≈ 58 %. Un especialista en velocidad (σV 0,5 → +25) actúa primero ≈ 83 %. Las comparaciones de iniciativa son entre números en coma flotante sin redondear: los empates exactos casi no ocurren y, si ocurren, deciden 3 y 4.

---

## 5. Daño, cura y escudo
```
pot   = potencia del movimiento (+50 % si su condición se cumple, MCFG) · (1 + sinergia)
daño  = round(pot · fA(actor) · fam · marca · debilitar · var · desgaste)    (mínimo 1 si pot > 0) [dano.minimo]
  fam       = CFG.familias.tabla[familia del movimiento][familia de la criatura objetivo]
  marca     = 1,20 si el objetivo tiene marca, si no 1
  debilitar = 0,80 si el actor tiene debilitar, si no 1
  var       = 0,80 + 0,40·u                                   // [dano.varianza] = 0,20
  desgaste  = 1 + 0,25·max(0, t − 10)                          // [desgaste]
aplicar: si el objetivo tiene escudo y el movimiento no tiene `perforar`, el escudo absorbe primero; el resto va a la vida.
drenaje: el actor se cura round(0,30 · daño a la vida) (sin superar su máximo).
cura:    round(pot) sin estadísticas ni varianza, hasta el máximo de vida.
escudo:  + round(pot), con un máximo de 150 acumulado [estados.escudo.maximo].
```
- El golpe básico usa `pot = 10` y la misma fórmula (sin sinergia).
- Varianza: 1 tirada por objetivo; en `area` se usan las 2 tiradas de varianza de la acción, en orden de posición (como máximo 2 objetivos por fila).
- La quemadura y la regeneración son fijas: no escalan con estadísticas, varianza ni desgaste.

---

## 6. Familias: dos anillos `[familias]`
Cada familia es **fuerte (×1,25)** contra la siguiente de su anillo y **débil (×0,80)** contra la anterior. Fuera de eso, neutral (×1). Entre una familia base y una híbrida, siempre neutral.

**Anillo base**: Marea → Llama → Brote → Roca → Voltio → Sombra → Marea
(la marea apaga la llama; la llama prende el brote; la raíz agrieta la roca; la roca aterra el voltio; el destello disipa la sombra; la sombra se traga la marea).

**Anillo híbrido** (relaciones propias): Vapor → Magma → Espora → Liquen → Plasma → Tormenta → Abismo → Vapor
(el vapor resquebraja la lava; la lava calcina las esporas; el moho invade el liquen; la costra mineral aísla la descarga; el plasma deshace la nube; la tormenta revuelve las profundidades; el abismo se traga la niebla).

Por qué: con 13 familias, cada una tiene exactamente 1 presa y 1 depredador, así que la ventaja media es 0 para todas. Se descartó "híbrida = media de sus componentes": desequilibraba un ±1,7 % de multiplicador medio, porque llama y marea aparecen en 3 híbridas cada una. La tabla 13 × 13 completa está en `familias.tabla`.

---

## 7. Sinergia `[sinergia]`
Grupos de familia en el plan del turno: cada criatura que usa un **movimiento** (el golpe básico no cuenta) pertenece al grupo de su familia. Una híbrida pertenece además a los grupos de sus dos componentes. El bonus de cada criatura es el de su grupo más numeroso: 2 → +10 %, 3 → +20 %, 4 → +30 % sobre la potencia de daño, cura y escudo. Se calcula al pagar el plan y no cambia aunque un miembro caiga antes de actuar.

---

## 8. Estados (lista cerrada) `[estados]`
`duracion` = nº de finales de turno que dura, contando el del turno en que se aplica.

| Estado | Tipo | Efecto | Duración | Apilado |
|---|---|---|---|---|
| Quemadura | − | 12 de daño por pila al final del turno | 3 | pilas, máx. 3; cada aplicación suma 1 pila y reinicia la duración |
| Ralentizar | − | −30 de iniciativa | 2 | refresca |
| Aturdir | − | pierde su próxima acción | 1 | refresca; después, inmune 2 turnos `[inmunidad_turnos]` |
| Marca | − | recibe ×1,20 de daño | 2 | refresca |
| Debilitar | − | inflige ×0,80 de daño | 2 | refresca |
| Escudo | + | absorbe daño | 2 | suma, máx. 150 |
| Prisa | + | +30 de iniciativa | 2 | refresca |
| Regenerar | + | +15 de vida al final del turno | 3 | refresca |

**Aturdir**: si el objetivo aún no ha actuado este turno, su acción se cancela (y se le devuelve la energía). Si ya actuó, queda marcado y en el turno siguiente no puede elegir acción. Contra una criatura inmune, el aturdir no tiene efecto, pero el resto del movimiento sí se aplica. Ralentizar y prisa se suman entre sí.

---

## 9. Fin de partida
Gana el bando que deja al otro sin criaturas vivas. Si ambos quedan sin criaturas en el mismo turno, es empate. A partir del turno 11, el desgaste (+25 % por turno) acorta las partidas largas. Al llegar al turno 20 sin vencedor: empate.

---

## 10. IA de referencia (para el simulador) `[ia]`
Determinista, sin tiradas. Parámetro `reserva` (por defecto 0).
```
1. Si e < reserva, e + 2 ≤ 10 (no se desborda el turno siguiente) y ningún movimiento asequible deja KO a un enemigo:
   plan = golpe básico de todas las criaturas.
2. Si no: enumerar todas las combinaciones (≤ 5⁴ = 625) con Σcoste ≤ e; en cada una, el objetivo de cada acción es:
   - daño: el enemigo válido con más daño esperado (fam, marca y sinergia; var = 1); empate → menos vida → menor posición.
   - cura: el aliado vivo con menor vida/máx; escudo: el aliado delantero con menos vida; otros aliados: el propio usuario.
   valor = Σ min(daño esperado, vida del objetivo) + 50 por cada KO esperado        [bonus_ko]
         + Σ min(cura, vida que le falta) + Σ min(escudo, 60)                         [valor_max_escudo]
         + 5 · (puntos de los estados aplicados, MCFG)                               [valor_punto_estado]
         − 0,001 · Σcoste                                                            [penalizacion_coste]
   Las condiciones se evalúan como si se ejecutara en el orden de posición. Se elige el valor máximo;
   empate → la combinación menor en orden lexicográfico (golpe = 0, movimientos 1–4 por locus).
```

---

## 11. Determinismo y orden de tiradas
- `rng = createRng("combate|" + semilla)` `[semilla.prefijo]`. Misma semilla + mismos planes ⇒ mismo combate (repeticiones y validación de PvP asíncrono en servidor).
- **24 tiradas por turno, fijas** `[tiradas.por_turno]`, en este orden, se usen o no:
  t1–t8: jitter de A1, A2, A3, A4, B1, B2, B3, B4; t9–t24: 2 de varianza por posición, en el mismo orden (A1a, A1b, …, B4b).
  Las tiradas pertenecen a la **posición**, no al orden de ejecución.
- La IA no consume tiradas. Los planes entran al motor como datos validados: un plan inválido no consume tiradas extra.
- El hash del combate (para tests) usa una serialización canónica: bandos A y B, posiciones 1–4, campos en el orden de esta spec.

---

## 12. Criterios de éxito para el simulador de combate `[escenarios_sim]`, `[criterios_sim]`

| Id | Escenario |
|---|---|
| C1 aleatorio | 4 salvajes por bando (genética v0.2), formación en orden de generación, IA reserva 0 en ambos; 20.000 combates; 5 semillas |
| C2 familias | equipos monofamilia de cada una de las 13 familias contra cada otra, 1.000 combates por pareja, lados alternos. Base: salvajes `puro`. Híbridas: cada criatura con 2 D híbridos (forma aleatoria) y 2 D de sus componentes |
| C3 calidad (D-008) | equipos espejo; X con todos los genes a calidad 94,5 e Y a 85,5 (ancla y valores = catálogo escalado con `repartir`); 10.000 combates, lados alternos |
| C4 energía | equipos C1; IA con reserva u ∈ {0, 3, 5, 7} contra reserva 0; 5.000 combates por pareja |

| Criterio | Umbral | Estimación (Monte Carlo simplificado) |
|---|---|---|
| Duración C1 | media 7–12 turnos, mediana 7–11, p90 ≤ 15, empates ≤ 3 %. Con ~25 s/turno, 3–5 min ≈ 7–12 turnos | media 9,1, mediana 9, p90 11, empates 0 % |
| Familias C2 | toda familia entre 45 % y 55 % contra el resto | 50 % por simetría de anillos (pendiente) |
| Lado C1 | victorias de A entre 48,5 % y 51,5 % | 50 % por construcción (alternancia de desempates) |
| D-008 C3 | X ≤ 55 % (objetivo), ≤ 60 % (límite) | 52,9 % |
| Energía C4 | alguna reserva u > 0 gana > 52 % contra u = 0; u = 0 gana ≥ 35 % contra cualquiera | u 3: 54,7 %; u 5: 24 %; u 7: 7 % |
| Iniciativa (informativo) | % de veces que actúa primero la de más iniciativa base, si la diferencia es ≤ 5 | esperado 50–60 % |

Las estimaciones salen de un modelo con solo movimientos de daño y una IA más simple que la de la sec. 10. Sirven para orientar, no aprueban nada.

---

## 13. Barridos sugeridos `[barridos_sim]`
| Parámetro | Valores (negrita = defecto) |
|---|---|
| `estadisticas.beta_calidad` | 0 · 0,02 · **0,04** · 0,06 |
| `orden.jitter` | 20 · **30** · 45 |
| `dano.varianza` | 0,10 · **0,20** |
| `familias.fuerte` | 1,20 · **1,25** · 1,30 |
| `dano.golpe_basico.potencia` | 0 · **10** · 15 |
| `estadisticas.vida_base` | 200 · **220** · 240 |

---

## 14. Decisiones (para DECISIONES.md)
| # | Decisión | Alternativas descartadas |
|---|---|---|
| C1 | Derivadas por cuota de perfil + término de calidad `q` con β = 0,04 | Estadísticas absolutas (la calidad daba 60–90 %); P × R o ataque/defensa (multiplica diferencias) |
| C2 | Vida ← R, ataque ← P, iniciativa ← V; sin defensa ni nivel | Defensa a partir de R (doble uso); nivel en PvP |
| C3 | Turno simultáneo; resolución por iniciativa con jitter ±30 | Turnos alternos (primer jugador); orden por velocidad pura (+1 decide) |
| C4 | Golpe básico de coste 0 | Sin acción gratuita (criaturas paradas; ahorrar sale gratis) |
| C5 | Dos anillos equilibrados (6 base, 7 híbridas) | Híbrida = media de componentes (±1,7 % de desequilibrio); tabla a mano |
| C6 | Sinergia por grupo; la híbrida cuenta también para sus componentes | Solo familia propia (las híbridas no tendrían sinergia) |
| C7 | 8 estados fijos, sin probabilidades | Estados con probabilidad de aplicarse (más azar, menos legible) |
| C8 | Desgaste desde el turno 11; empate en el 20 | Sin desgaste (partidas eternas con curas); desempate por % de vida |
| C9 | 24 tiradas fijas por turno, asociadas a la posición | Consumo por orden de ejecución (no pareable) |

---

## 15. Preguntas para el dueño del juego
1. **La calidad pesa muy poco en combate** (≈ 53 % de victorias con calidad máxima frente a mínima; con β = 0, 50 %). Es lo que pide D-008, pero conviene que lo sepas: hasta un 1 % de ventaja total ya da ≈ 58 % en combates espejo. Opciones: (a) β = 0,04, la calidad decide solo partidas muy igualadas; (b) β = 0, la calidad es prestigio y colección; (c) β = 0,06 (≈ 55 %, en el límite del objetivo). **Recomendación: (a).**

## 16. Pendiente de validar en simulación
Todos los criterios de la sec. 12 con el núcleo real y la IA de la sec. 10. En especial: familias (C2, incluidas las híbridas), valor de la energía con los movimientos generados (la condición `reserva` y los movimientos de coste 4–5) y que ningún estado (aturdir, marca) desplace los resultados.
