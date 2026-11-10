# Especificación de movimientos v0.1 — Proyecto Genoma

Estado: v0.1 para implementar y simular (semana 2). Autor: Diseñador de sistemas. Fecha: 2026-11-10.
Configuración: `config/movimientos.v0.1.json` (**MCFG**). Reglas de combate (estados, daño, filas): `docs/spec/combate-v0.1.md` (**CFG** = `config/combate.v0.1.json`). Todo número está en MCFG con la ruta `[ruta]`; si hay discrepancia, **gana MCFG**. Mismas restricciones aritméticas que en combate.

---

## 1. Modelo: gramática con presupuesto
`movimiento = arquetipo + escalable + [estado] + [energía extra] + [modificador] + [condición]`, con un coste de energía `c ∈ 1..5`. Cada pieza cuesta puntos y la suma tiene que caber en el presupuesto de `c`.

| Coste c | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Presupuesto (puntos) `[presupuesto_por_coste]` | 8 | 18 | 29 | 42 | 56 |
| Puntos por energía | 8 | 9 | 9,7 | 10,5 | 11,2 |

El presupuesto es convexo (un movimiento de 5 da un 40 % más por energía que uno de 1): guardar energía para un movimiento grande compensa, aunque el golpe básico gratuito y el tope de 10 de energía tienen su coste.

### 1.1 Estructura de datos (salida)
`Movimiento = { id, nombre, coste, arquetipo, escalable: "dano"|"cura"|"escudo", potencia, objetivo: "enemigo"|"aliado", area: bool, estado: EstadoId|null, energiaExtra: 0|1, modificador: ModId|null, condicion: CondId|null, puntos: number, presupuesto: number }`. El `id` del movimiento es el campo `movimiento` del gen (genética v0.2 §1.2). `prisa` y `energiaExtra` se aplican al usuario (prisa) o al bando (energía).

---

## 2. Catálogo de piezas

### 2.1 Escalables (absorben el presupuesto sobrante) `[escalables]`
| Pieza | Potencia por punto | Tope | Efecto (combate §5) |
|---|---|---|---|
| dano | 5 | 180 individual; 100 por objetivo en área | daño |
| cura | 4 | 150 | cura |
| escudo | 6 | 150 | escudo (máx. acumulado 150) |
La potencia se redondea hacia abajo a múltiplo de 5 `[escalables.paso]`. Mínimo 2 puntos en el escalable `[escalables.minimo_puntos]`.

### 2.2 Estados (coste fijo) `[estados]`
| Ofensivos | Coste | | Positivos (usuario o aliado) | Coste |
|---|---|---|---|---|
| quemadura | 6 | | prisa | 3 |
| ralentizar | 3 | | regenerar | 7 |
| aturdir | 12 (solo si c ≥ 3) `[aturdir_coste_min]` | | ninguno | 0 |
| marca | 5 | | | |
| debilitar | 5 | | | |
Los ofensivos van al objetivo enemigo; prisa, al usuario; regenerar, al objetivo aliado.

### 2.3 Energía extra `[energia_extra]`
+1 de energía al bando cuando se ejecuta el movimiento (sin pasar de 10); como el plan ya está pagado, solo sirve para los turnos siguientes. Coste 10 puntos; solo con c ≥ 3 y solo en el arquetipo táctico.

### 2.4 Modificadores (máx. 1) `[modificadores]`
| Mod. | Coste | Efecto |
|---|---|---|
| alcance | +3 | elige objetivo en cualquier fila |
| prioridad | +4 | nivel de prioridad 1 (combate §4) |
| perforar | +2 | ignora el escudo |
| area | ×1,5 sobre estado, energía y escalable | afecta a toda una fila |
| drenaje | ×1,3 sobre el escalable de daño | el usuario se cura un 30 % del daño a la vida |

### 2.5 Condiciones (máx. 1) `[condiciones]`
Si la condición se cumple **al ejecutar**, la potencia escalable aumenta un 50 % `[condiciones.bonus]`. Coste: el escalable cuesta ×(1 + 0,5·factor).
| Condición | Factor | Se cumple si… |
|---|---|---|
| objetivo_con_estado | 0,5 | el objetivo tiene algún estado negativo |
| vida_baja | 0,4 | vida del usuario < 50 % de su máximo `[umbral]` |
| combo_familia | 0,6 | otra criatura de su grupo de familia (combate §7) usa un movimiento este turno |
| reserva | 0,6 | la energía del bando tras pagar el plan es ≥ 3 `[umbral]` (premia guardar) |
| antes_que_objetivo | 0,5 | el objetivo aún no ha actuado este turno |
En movimientos de aliado, "el objetivo" es el aliado.

### 2.6 Arquetipos `[arquetipos]`
| Arquetipo | Escalable / objetivo | Estado | Modificadores permitidos | Notas |
|---|---|---|---|---|
| golpe | dano / enemigo | — | alcance, prioridad, perforar, area, drenaje | |
| golpe_estado | dano / enemigo | ofensivo | alcance, prioridad, area | |
| maldicion | dano / enemigo | ofensivo | alcance, prioridad | área siempre (`area_forzada`) |
| proteccion | escudo / aliado | positivo (prisa, regenerar, ninguno) | prioridad, area | |
| curacion | cura / aliado | regenerar o ninguno | prioridad, area | |
| tactico | dano / enemigo | prisa al usuario; con c ≥ 3, +1 energía en su lugar | alcance, prioridad | |

---

## 3. Reglas de validez
Un movimiento es válido si y solo si:
1. `coste ∈ 1..5`; `puntos ≤ presupuesto[coste]`; escalable con ≥ 2 puntos y potencia ≤ su tope.
2. Como mucho 1 estado, 1 modificador y 1 condición; la energía extra solo en táctico con c ≥ 3.
3. Las piezas están permitidas para su arquetipo (tabla 2.6); aturdir solo con c ≥ 3; la energía extra no lleva `area`.
4. `puntos = fijo_mod + fac·(estado + energía) + fac·fEsc·pts_esc` (sec. 4), con `fac = 1,5` si hay área y `fEsc` = producto de los factores de condición y drenaje.
El parser de MCFG valida además: presupuestos crecientes; pesos ≥ 0 y al menos uno > 0 en cada lista de familia base; ids que cumplan `^[a-z0-9_]+$`; 4 raíces de nombre por familia (las 13); `tiradas_por_movimiento = 8`.

---

## 4. Generación procedural — `generarMovimiento(gen)`
Una sola función para los 72 genes del catálogo y para todos los mutados. Es **pura**: depende solo de la clave del gen (`familia|locus|firma`, genética v0.2 §8), de MCFG y, si existe, de una sal de revisión.
```
rng = createRng("mov|v0.1|" + clave [+ "|" + sal])            // [semilla.prefijo]; sal = overrides_catalogo.sales[id] si existe
u1..u8 = 8 tiradas, consumidas siempre                         // [tiradas_por_movimiento]
W(tabla, fam) = pesos_familia[tabla][fam]; si fam es híbrida, suma elemento a elemento de las de sus 2 componentes

c   = clamp(1 + floor(forma[0]·3.5 + u1·1.5), 1, 5)                                    // [coste_energia]
wA  = W(arquetipo, fam) + pesos_locus_arquetipo[locus]
      + 2·forma[2] en golpe y golpe_estado + 2·(1 − forma[2]) en proteccion y curacion // [pesos_forma_arquetipo]
arq = orden_arquetipos[índice ponderado(wA, u2)]
estado según arquetipo (u3):
  ofensivo  → índice ponderado(W(estado_ofensivo, fam) con aturdir = 0 si c < 3, u3)
  positivos → índice ponderado(W(estado_positivo, fam), u3)
  curacion  → entre [regenerar, ninguno] con los pesos W(estado_positivo) de esas dos, u3
  tactico   → prisa; si c ≥ 3, energía extra en su lugar (u3 no se usa)
mod  = (u4 < 0.15 + 0.40·forma[1]) ? índice ponderado(W(modificador, fam) con 0 en los no permitidos, u5) : null
       (si todos los pesos son 0 → null)                                               // [probabilidades]
cond = (u6 < 0.10 + 0.40·forma[3]) ? índice ponderado(W(condicion, fam), u7) : null
nombre = nucleo[arq] + " de " + raiz[fam][floor(u8·4)]                                  // [nombres]
ensamblar (sec. 4.1)
```
`índice ponderado(w, u)`: el primer i con `u·Σw < Σ_{j≤i} w_j`, recorriendo en el orden de la lista correspondiente (`orden_*`).

### 4.1 Ensamblado con respaldo (sin tiradas extra)
```
repetir:
  area = arquetipo.area_forzada o mod == area;  fac = area ? 1.5 : 1
  fijo = coste(mod) si mod ∈ {alcance, prioridad, perforar}, si no 0
  fEsc = (cond ? 1 + 0.5·factor(cond) : 1) · (mod == drenaje ? 1.3 : 1)
  L    = presupuesto[c] − fijo − fac·(coste(estado) + coste(energía))
  pts  = L > 0 ? floor(L / (fac·fEsc)) : 0
  si pts ≥ 2: salir
  si cond: cond = null; repetir          // 1.º se quita la condición
  si mod: mod = null; repetir            // 2.º se quita el modificador
  arq = golpe; estado = null; energía = 0; repetir   // 3.º pasa a golpe (siempre cabe: 8 ≥ 2)
potencia = min(floor(pts · potencia_por_punto / 5) · 5, tope)
puntos   = fijo + fac·(coste(estado)+coste(energía)) + fac·fEsc·pts
```
El sobrante por redondeo o tope se pierde (como mucho, la parte por encima del tope en golpes de coste 5).

### 4.2 Por qué la clave y no los padres directamente
El movimiento depende de los D de los padres **a través de la clave**: la familia sale de las familias de los padres y la forma es la mezcla de sus formas (genética v0.2 §4). Así se mantiene la regla "mismo gen ⇒ mismo movimiento": dos mutaciones con la misma clave, salidas de padres distintos, dan exactamente el mismo movimiento. No hace falta registro global, el servidor lo puede verificar y no cambia las 280 tiradas por cría de la genética.

Identidad temática: la familia condiciona arquetipo, estado, modificador y condición; el locus inclina el arquetipo (cabeza → golpes, cuerpo → protección y cura, extremidades → táctico, cola → maldición); la forma decide el coste (tamaño), la probabilidad de modificador (alargamiento), lo ofensivo frente a lo defensivo (angulosidad) y la probabilidad de condición (ornamento). El aspecto del gen "anuncia" su movimiento.

---

## 5. Catálogo base (72 genes)
- Mismo `generarMovimiento` con la clave de cada gen base. Es determinista: no hace falta listarlos a mano y el núcleo lo verifica con un test dorado (la lista de 72 movimientos generada se guarda como fixture).
- **Revisión**: si la sec. 7 marca un movimiento del catálogo como roto o inútil, el diseñador añade una sal en `overrides_catalogo.sales[id]`, que vuelve a generar ese movimiento sin tocar el resto. Las sales solo se aplican a genes del catálogo.
- Comprobación hecha con un prototipo de la generación (azar distinto de sfc32, solo para ver la distribución): costes 1/2/3/4/5 = 10/14/28/13/7; cada familia tiene entre 4 y 6 arquetipos distintos entre sus 12 genes; voltio sale cargado de golpes (8 de 12) por su forma angulosa. Criterio: ≥ 3 arquetipos por familia `[criterios_sim.min_arquetipos_por_familia_catalogo]`.
- Pendiente para la genética v0.3 (cosmético, sin efecto en tiradas): quitar el prefijo `mov:prov:` de los ids de movimiento mutado, porque el movimiento ya no es provisional.

---

## 6. Ejemplos (prototipo; los valores reales salen del núcleo)
| Gen | c | Movimiento |
|---|---|---|
| llama.cabeza.1 | 3 | Mordida de …: 115 de daño + quemadura |
| llama.cuerpo.1 | 3 | Mordida de …: 50 de daño a una fila + quemadura en área; +50 % si actúa antes que el objetivo |
| llama.extremidades.1 | 4 | Embate de …: 180 de daño, perforar |
| llama.cola.3 | 2 | Égida de …: escudo de 70 a una fila aliada |

---

## 7. Detección de movimientos rotos `[criterios_sim]`
**Prueba de sustitución.** Para cada movimiento m (los 72 del catálogo y 500 mutados al azar `[muestra_mutados]`): equipos espejo de C1 (combate §12); en el equipo X, el movimiento de la criatura 1 con el mismo coste que m se sustituye por m (si no tiene ninguno de ese coste, el de su locus), y en el equipo Y por un **movimiento de referencia** del mismo coste: un golpe puro con todo el presupuesto (`potencia = presupuesto[c]·5`, con tope). 2.000 combates por movimiento, lados alternos, IA reserva 0.
| Veredicto | Condición |
|---|---|
| roto | victorias de X > 58 % `[roto_wr]` |
| roto grave | > 65 % `[roto_grave_wr]` |
| inútil | < 42 % `[inutil_wr]` |
| uso sospechoso | la IA lo usa en > 85 % de los turnos en que puede pagarlo `[uso_sospechoso]` |
**Criterios:** como mucho un 2 % del catálogo roto `[max_frac_rotos_catalogo]`; 0 rotos graves en catálogo y muestra `[max_rotos_graves]`. Informar también la tabla de victorias por arquetipo, estado, modificador y condición: si una pieza aparece en más del 50 % de los rotos, se ajusta su coste en MCFG, no los movimientos uno a uno.

---

## 8. Decisiones (para DECISIONES.md)
| # | Decisión | Alternativas descartadas |
|---|---|---|
| M1 | Movimiento = f(clave del gen), con semilla por clave | f(padres concretos) (rompe "mismo gen ⇒ mismo movimiento"); el primero que lo descubre lo fija en la Genedex (depende del estado global y del orden) |
| M2 | Presupuesto convexo 8/18/29/42/56 | Lineal (guardar no compensa) |
| M3 | 6 arquetipos con piezas permitidas + escalable que absorbe el sobrante | Combinación libre de piezas (muchos inválidos; difícil de leer) |
| M4 | Respaldo: quitar condición → modificador → pasar a golpe | Repetir el sorteo (tiradas variables) |
| M5 | Catálogo generado + sales de revisión | 72 movimientos a mano (lento, sin garantía de presupuesto) |
| M6 | Rotos por prueba de sustitución contra un golpe de referencia | Solo análisis estático de puntos (no capta sinergias ni estados) |

## 9. Pendiente de validar en simulación
1. Prueba de sustitución para los 72 del catálogo y la muestra de mutados.
2. Que los costes de estados y condiciones (sobre todo aturdir, marca y reserva) no concentren los rotos.
3. Distribución real de arquetipos por familia con sfc32 (≥ 3 por familia).
