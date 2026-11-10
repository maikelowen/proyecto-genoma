# Especificación de movimientos v0.2 — Proyecto Genoma

Estado: v0.2 para implementar y simular (semana 3). Autor: Diseñador de sistemas. Fecha: 2026-11-10.
Configuración: `config/movimientos.v0.2.json` (**MCFG**). Reglas de combate: `docs/spec/combate-v0.2.md` (**CFG** = `config/combate.v0.2.json`). Todo número está en MCFG con la ruta `[ruta]`; si hay discrepancia, **gana MCFG**. Mismas restricciones aritméticas que en combate. **[v0.2]** marca lo que cambia.

---

## 1. Modelo: gramática con presupuesto
`movimiento = arquetipo + escalable + [estado] + [energía extra] + [modificador] + [condición]`, con coste de energía `c ∈ 1..5`. Cada pieza cuesta puntos y la suma cabe en el presupuesto de `c`.

| Coste c | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Presupuesto `[presupuesto_por_coste]` [v0.2] | 11 | 20 | 30 | 41 | 53 |
| (v0.1) | 8 | 18 | 29 | 42 | 56 |
| Neto por energía `(B − 2)/c` | 9,0 | 9,0 | 9,3 | 9,75 | 10,2 |

**[v0.2] Presupuesto casi lineal con término fijo.** Cada movimiento ocupa la acción de la criatura, que si no daría un golpe básico (10 de potencia = 2 puntos). Lo que importa es el rendimiento **neto** `(B − 2)/c`. En v0.1 era 6/8/9/10/10,8: un movimiento de coste 5 rendía un 80 % más por energía que uno de coste 1, y las familias de formas pequeñas (brote, voltio) salían con kits baratos y débiles. En v0.2 la convexidad neta es del 13 % entre coste 1 y 5, lo justo para que guardar compense a veces. Lo que da un movimiento caro es **ráfaga**, no eficiencia.

### 1.1 Estructura de datos (salida) (sin cambios)
`Movimiento = { id, nombre, coste, arquetipo, escalable, potencia, objetivo, area, estado, energiaExtra, modificador, condicion, puntos, presupuesto }`. El `id` es el campo `movimiento` del gen.

---

## 2. Catálogo de piezas

### 2.1 Escalables `[escalables]` [v0.2]
| Pieza | Potencia por punto | Tope | (v0.1) |
|---|---|---|---|
| dano | 5 | 250 individual; 125 por objetivo en área | 5; 180 / 100 |
| cura | **5,5** | **180** | 4; 150 |
| escudo | **7,5** | **200** (acumulado máx. 200, CFG) | 6; 150 |
Potencia redondeada hacia abajo a múltiplo de 5 `[paso]`. Mínimos: `pts ≥ 2` `[minimo_puntos]` y **[v0.2] el escalable debe llevarse al menos el 40 % del presupuesto**: `fac·fEsc·pts ≥ 0,4·presupuesto[c]` `[fraccion_minima]`. Esto evita movimientos basura del tipo "escudo de 10 + regenerar + condición" (v0.1: 25 inútiles, 22 de coste 2).

### 2.2 Estados (coste fijo) `[estados]` [v0.2]
| Ofensivos | Coste v0.2 | (v0.1) | | Positivos | Coste v0.2 | (v0.1) |
|---|---|---|---|---|---|---|
| quemadura | 6 | 6 | | prisa | **2** | 3 |
| ralentizar | **1** | 3 | | regenerar | **5** | 7 |
| aturdir | **2** (solo si c ≥ 3) | 12 | | ninguno | 0 | 0 |
| marca | **1** | 5 | | | | |
| debilitar | **1** | 5 | | | | |
Costes = valor medido (sec. 7.1). Los ofensivos van al objetivo enemigo; prisa, al usuario; regenerar, al objetivo aliado.

### 2.3 Energía extra `[energia_extra]` [v0.2]
+1 de energía al bando al ejecutarse (máx. 10). Coste **8** (v0.1: 10); solo con c ≥ 3 y solo en táctico.

### 2.4 Modificadores (máx. 1) `[modificadores]` [v0.2]
| Mod. | Coste v0.2 | (v0.1) | Efecto |
|---|---|---|---|
| alcance | **+0** | +3 | objetivo en cualquier fila (sec. 9.4) |
| prioridad | **+8** | +4 | nivel de prioridad 1 |
| perforar | **+1,5** | +2 | ignora el escudo |
| area | **×1,75** sobre estado, energía y escalable | ×1,5 | toda una fila |
| drenaje | **×1,1** sobre el escalable de daño | ×1,3 | cura al usuario el 30 % del daño a la vida |

### 2.5 Condiciones (máx. 1) `[condiciones]` [v0.2]
Si se cumple **al ejecutar**, la potencia escalable aumenta un 50 % `[bonus]`. Coste: el escalable cuesta ×(1 + 0,5·factor).
| Condición | Factor v0.2 | (v0.1) | Se cumple si… |
|---|---|---|---|
| objetivo_con_estado | **0,35** | 0,5 | el objetivo tiene algún estado negativo |
| vida_baja | **0,3** | 0,4 | vida del usuario < 50 % `[umbral]` |
| combo_familia | **0,3** | 0,6 | otra criatura de su grupo usa un movimiento este turno |
| reserva | **0,15** | 0,6 | energía del bando tras pagar ≥ 3 `[umbral]` |
| antes_que_objetivo | **0,4** | 0,5 | el objetivo aún no ha actuado este turno |

### 2.6 Arquetipos `[arquetipos]` [v0.2]
| Arquetipo | Escalable / objetivo | Estado | Modificadores permitidos | Notas |
|---|---|---|---|---|
| golpe | dano / enemigo | — | alcance, prioridad, perforar, area, drenaje | |
| golpe_estado | dano / enemigo | ofensivo | alcance, prioridad, area | |
| maldicion | dano / enemigo | ofensivo | alcance, prioridad | área siempre; **[v0.2] solo con c ≥ 2** `[coste_min]` |
| proteccion | escudo / aliado | prisa, regenerar, ninguno | **area** [v0.2] | prioridad implícita (combate §4) |
| curacion | cura / aliado | regenerar o ninguno | **area** [v0.2] | prioridad implícita |
| tactico | dano / enemigo | prisa al usuario; con c ≥ 3, +1 energía en su lugar | alcance, prioridad | |

---

## 3. Reglas de validez
Un movimiento es válido si y solo si:
1. `coste ∈ 1..5`; `puntos ≤ presupuesto[coste]`; escalable con `pts ≥ 2`, `fac·fEsc·pts ≥ fraccion_minima·presupuesto[coste]` [v0.2] y potencia ≤ su tope.
2. Como mucho 1 estado, 1 modificador y 1 condición; energía extra solo en táctico con c ≥ 3.
3. Piezas permitidas para su arquetipo (tabla 2.6); aturdir solo con c ≥ 3; maldición solo con c ≥ 2 [v0.2]; energía extra sin `area`.
4. `puntos = fijo_mod + fac·(estado + energía) + fac·fEsc·pts_esc`, `fac = 1,75` si hay área, `fEsc` = producto de factores de condición y drenaje.

El parser valida además: presupuestos crecientes; pesos ≥ 0 y al menos uno > 0 en cada lista de familia base; ids `^[a-z0-9_]+$`; 4 raíces de nombre por familia; `tiradas_por_movimiento = 8`; [v0.2] `0 < fraccion_minima < 1`; `coste_min` de maldición en 1..5; que la regla de respaldo siempre termine: `fraccion_minima·presupuesto[c] ≤ presupuesto[c] − fac_max` para todo c (con 0,4 y 1,75: 4,4 ≤ 9,25 en c = 1) y `minimo_puntos ≤ floor(presupuesto[1]/1,75)`; `proteccion` y `curacion` sin `prioridad` en su lista.

---

## 4. Generación procedural — `generarMovimiento(gen)`
Pura en la clave del gen (`familia|locus|firma`), MCFG y, si existe, la sal de revisión.
```
rng = createRng("mov|v0.1|" + clave [+ "|" + sal])        // [semilla.prefijo]: [v0.2] el prefijo NO cambia (identifica el flujo, no la versión)
u1..u8 = 8 tiradas, consumidas siempre                     // [tiradas_por_movimiento] — sin cambios
W(tabla, fam) = pesos_familia[tabla][fam]; híbrida → suma de sus 2 componentes

c   = clamp(1 + floor(0,25 + forma[0]·2,0 + u1·2,5), 1, 5)    // [v0.2] [coste_energia.desplazamiento, escala_tamano, escala_azar]
wA  = W(arquetipo, fam) + pesos_locus_arquetipo[locus]
      + 1·forma[2] en golpe y golpe_estado + 1·(1 − forma[2]) en proteccion y curacion   // [v0.2] 2 → 1 [pesos_forma_arquetipo]
arq = orden_arquetipos[índice ponderado(wA, u2)]
si arq = maldicion y c < 2: arq = golpe_estado                // [v0.2] [arquetipos.maldicion.coste_min], sin tiradas
estado según arquetipo (u3): igual que v0.1 (aturdir con peso 0 si c < 3)
mod  = (u4 < 0,15 + 0,40·forma[1]) ? índice ponderado(W(modificador, fam) con 0 en los no permitidos, u5) : null
cond = (u6 < 0,10 + 0,40·forma[3]) ? índice ponderado(W(condicion, fam), u7) : null
nombre = nucleo[arq final] + " de " + raiz[fam][floor(u8·4)]
ensamblar (sec. 4.1)
```
**[v0.2] Coste.** Con la fórmula de v0.1 el coste medio iba de 2,2 (forma 0,25) a 3,8 (forma 0,75); ahora va de 2,5 a 3,5 (forma 0,5 → 3,0). La forma sigue anunciando el tamaño del movimiento, con menos extremos.

| forma[0] | 0 | 0,25 | 0,5 | 0,75 | 1 |
|---|---|---|---|---|---|
| c medio v0.2 (cálculo exacto) | 2,0 | 2,5 | 3,0 | 3,5 | 4,0 |

### 4.1 Ensamblado con respaldo (sin tiradas extra) [v0.2]
```
repetir:
  area = arquetipo.area_forzada o mod == area;  fac = area ? 1.75 : 1
  fijo = coste(mod) si mod ∈ {alcance, prioridad, perforar}, si no 0
  fEsc = (cond ? 1 + 0.5·factor(cond) : 1) · (mod == drenaje ? 1.1 : 1)
  L    = presupuesto[c] − fijo − fac·(coste(estado) + coste(energía))
  pts  = L > 0 ? floor(L / (fac·fEsc)) : 0
  si pts ≥ 2 y fac·fEsc·pts ≥ 0.4·presupuesto[c]: salir
  si cond: cond = null; repetir                                   // 1.º condición
  si mod: mod = null; repetir                                     // 2.º modificador
  si estado o energía: estado = null; energía = 0; repetir        // [v0.2] 3.º estado/energía (conserva el arquetipo)
  arq = golpe; repetir                                            // 4.º golpe (con las reglas actuales no llega a usarse)
potencia = min(floor(pts · potencia_por_punto / 5) · 5, tope)
puntos   = fijo + fac·(coste(estado)+coste(energía)) + fac·fEsc·pts
```
**Termina siempre**: cada paso quita una pieza; tras el 3.º, `L = presupuesto[c]` y `fac·pts ≥ presupuesto[c] − fac ≥ 0,4·presupuesto[c]` (validado por el parser, sec. 3). Un táctico sin prisa ni energía, una curación con "ninguno" o una maldición sin estado son movimientos válidos (el nombre usa el arquetipo final). `fallback` ∈ 0..4.

### 4.2 Identidad temática (sin cambios)
La familia condiciona arquetipo, estado, modificador y condición; el locus inclina el arquetipo; la forma decide coste, probabilidad de modificador, ofensivo/defensivo y probabilidad de condición.

---

## 5. Catálogo base (72 genes) [v0.2]
Mismo `generarMovimiento` con la clave de cada gen base y la sal de `overrides_catalogo.sales[id]` si existe. Test dorado con la lista de 72 (hay que regenerar el fixture).

### 5.1 Cuotas de catálogo por familia base `[criterios_sim.cuotas_catalogo]`
Sobre sus 12 genes: apoyo (protección + curación) entre 2 y 4; ningún arquetipo más de 4; al menos 2 golpes y 2 golpes con estado. Las sales `r*` salen de una búsqueda voraz y determinista: mientras haya incumplimiento, probar cada gen sin sal con `r1…r40` y aplicar el cambio que más reduce el incumplimiento total (empate: menor índice de gen, menor sal).

### 5.2 Sales dirigidas por C2
Las sales `c*` salen de una búsqueda voraz contra C2 (combate §12): para cada familia base fuera de 45–55 %, probar cada gen con `c1…c4` y quedarse con el cambio que más acerca su C2 al 50 % (máx. 2 cambios por ronda, 30 combates por pareja), y comprobarlo con otra semilla. Sales actuales (17): `llama.cabeza.1 r6, llama.extremidades.1 c4, marea.cabeza.3 r3, marea.cuerpo.3 r1, brote.cabeza.1 r4, brote.cabeza.2 c1, brote.cola.1 c4, roca.cabeza.3 r1, roca.cuerpo.3 c2, voltio.cuerpo.2 r2, voltio.cabeza.2 c2, voltio.cola.3 c3, sombra.cabeza.1 r4, sombra.cabeza.2 r1, sombra.cuerpo.1 r2, sombra.cuerpo.3 c3, sombra.cola.3 c1`. **Están ajustadas con mi Monte Carlo, no con el simulador real: el analista debe repetir 5.2 con su simulador** (procedimiento fijo, sin criterio a ojo).

Pendiente cosmético para genética v0.3: quitar el prefijo `mov:prov:` de los ids mutados.

---

## 6. Pesos de familia `[pesos_familia]` [v0.2]
Arquetipo (orden: golpe, golpe_estado, maldición, protección, curación, táctico). Cada familia suma **9 de daño y 3 de apoyo**; el sabor está en cómo los reparte:
| Familia | v0.2 | (v0.1) |
|---|---|---|
| llama | 4, 3, 1, 2, 1, 1 | 5, 4, 2, 1, 0, 1 |
| marea | 3, 2, 2, 1, 2, 2 | 3, 3, 1, 2, 3, 1 |
| brote | 3, 3, 1, 1, 2, 2 | 2, 2, 2, 2, 4, 1 |
| roca | 3, 3, 1, 2, 1, 2 | 3, 2, 1, 5, 1, 1 |
| voltio | 3, 2, 1, 2, 1, 3 | 3, 3, 1, 1, 0, 4 |
| sombra | 2, 3, 3, 2, 1, 1 | 2, 3, 4, 1, 1, 2 |
Por qué: en combates monofamilia, un kit con mucho apoyo no puede rematar y pierde aunque cada pieza esté bien pagada (brote v0.1 tenía 8 de 12 defensivos). Estados, modificadores y condiciones por familia: sin cambios.

---

## 7. Detección de movimientos rotos `[criterios_sim]`
Prueba de sustitución como en v0.1 (mismo coste, referencia = golpe puro con todo el presupuesto y tope), umbrales sin cambios (roto > 58 %, grave > 65 %, inútil < 42 %, uso sospechoso > 85 %). Con la energía de v0.2 y la IA nueva se usan los costes 4–5 (uso cuando se pueden pagar: c4 11 %, c5 4–5 %).

### 7.1 Cómo se han fijado los precios (método, para repetirlo)
1. **Equivalencia**: multiplicar ×1,1 la potencia de todos los movimientos de daño de un equipo (≈ 10 de 16) da 61,6 % (×0,9: 37,1 %). Es decir, 1 punto de victoria ≈ 2,4 puntos de presupuesto en un movimiento de coste 3.
2. **Valor de cada pieza**: equipos espejo C1 (2000 combates); en X, todos los movimientos de daño reciben la pieza sin cambiar su potencia; en Y, ninguno. Valor por movimiento = (WR − 50)/8,9 × 2,4 puntos.

| Pieza | WR de X | Puntos/mov. | Coste v0.2 |
|---|---|---|---|
| quemadura | 73,8 % | 6,4 | 6 |
| aturdir | 56,9 % | 1,9 | 2 |
| ralentizar | 54,1 % | 1,1 | 1 |
| marca | 52–54 % | 0,6–1,0 | 1 |
| debilitar | 49–53 % | 0–0,9 | 1 |
| prisa | 57,2 % | 1,9 | 2 |
| prioridad | 79,1 % | 7,8 | 8 |
| perforar | 55,6 % | 1,5 | 1,5 |
| alcance | 44,6 % | −1,5 | 0 |
| drenaje (gratis) | 61,6 % | ≈ 10 % del escalable | ×1,1 |
| cond. objetivo_con_estado / antes / vida_baja / combo / reserva | 65,8 / 68,0 / 64,4 / 56,8 / 54,2 % | 4,3 / 4,9 / 3,9 / 1,8 / 1,1 | factor = 2·valor/25: 0,35 / 0,4 / 0,3 / 0,3* / 0,15 |
\* combo_familia sube a 0,3 porque en equipos de una familia se cumple casi siempre.

3. **Arquetipos**: en X, sustituir todos los movimientos de un arquetipo por golpes puros del mismo coste. Final v0.2: apoyo → golpe 49,3 %; golpe_estado → golpe 55,2 %; maldición → golpe 51,5 %; táctico → golpe 50,9 %; todos → golpe 51–52 % (v0.1 con la misma prueba: 70 %).

---

## 8. Ejemplos (generados con el prototipo; los valores reales salen del núcleo)
| Gen | c | Movimiento v0.2 |
|---|---|---|
| brote\|cabeza\|0222 | 1→2 | v0.1: golpe de 40. v0.2: maldición, 45 a una fila + debilitar; +50 % con reserva (cambia el arquetipo porque cambian los pesos) |
| brote\|extremidades\|0321 | 2→3 | v0.1: cura 10 a una fila + regenerar (basura). v0.2: cura 60 a una fila + regenerar; +50 % con reserva |
| roca\|cabeza\|3131 | 4 | escudo 200 a un aliado, con prioridad implícita |
| llama\|cola\|2423 | 3 | 120 de daño + quemadura |

---

## 9. Notas para el núcleo
1. `parseMovesConfig` admite potencia por punto no entera (5,5 y 7,5) y costes de pieza no enteros (1,5); `puntos ≤ presupuesto + 1e-9` como en v0.1.
2. El arquetipo final (tras `coste_min` y respaldo) decide el nombre.
3. El nº de tiradas no cambia: **8 por movimiento**, consumidas siempre.
4. `alcance` cuesta 0 pero sigue siendo un modificador (ocupa el hueco y se sortea igual).

## 10. Decisiones (para DECISIONES.md)
| # | Decisión | Alternativas descartadas |
|---|---|---|
| M1–M6 | Siguen vigentes (M2 queda sustituida por M7) | — |
| M7 [v0.2] | Presupuesto 11/20/30/41/53 (neto casi lineal) | Convexo 8/18/29/42/56 (castiga kits baratos ×1,8); lineal puro (nadie ahorra nunca) |
| M8 [v0.2] | Escalable ≥ 40 % del presupuesto; respaldo quita estado antes que arquetipo | Pasar a golpe (pierde identidad); sin mínimo (basura) |
| M9 [v0.2] | Costes de pieza = valor medido por la prueba de pieza gratis | Ajuste a ojo; por movimiento con sales (no generaliza a mutados) |
| M10 [v0.2] | Pesos de arquetipo 9 daño / 3 apoyo por familia | Pesos libres (kits monofamilia sin daño) |
| M11 [v0.2] | Coste con menos peso de la forma (2,0) y más azar (2,5) | Mantener 3,5/1,5 (kits extremos por familia) |
| M12 [v0.2] | Sales de catálogo por cuotas + búsqueda C2 | Editar movimientos a mano |

## 11. Cambios respecto a v0.1
| Ruta MCFG | v0.1 | v0.2 | Motivo |
|---|---|---|---|
| `presupuesto_por_coste` | 8/18/29/42/56 | 11/20/30/41/53 | kits baratos penalizados; coste 2 inútil |
| `coste_energia` | 1 + floor(f·3,5 + u·1,5) | 1 + floor(0,25 + f·2,0 + u·2,5) | menos kits extremos por familia |
| `escalables` | cura 4/150, escudo 6/150, daño tope 180/100 | cura 5,5/180, escudo 7,5/200, daño 250/125, `fraccion_minima` 0,4 | apoyo débil; movimientos basura |
| `estados` | 6/3/12/5/5; prisa 3, regenerar 7 | 6/1/2/1/1; prisa 2, regenerar 5 | valor medido (7.1) |
| `energia_extra.coste` | 10 | 8 | táctico con energía por debajo de un golpe |
| `modificadores` | alcance 3, prioridad 4, perforar 2, área ×1,5, drenaje ×1,3 | 0, 8, 1,5, ×1,75, ×1,1 | valor medido |
| `condiciones.*.factor` | 0,5/0,4/0,6/0,6/0,5 | 0,35/0,3/0,3/0,15/0,4 | valor medido |
| `arquetipos` | protección y curación con prioridad | solo área (prioridad implícita en combate); maldición `coste_min` 2 | — |
| `pesos_familia.arquetipo`, `pesos_forma_arquetipo` | libres; forma 2/2 | 9 daño + 3 apoyo; forma 1/1 | kits monofamilia sin daño |
| `overrides_catalogo.sales` | vacío | 17 sales | cuotas (5.1) + C2 (5.2) |
| `criterios_sim.cuotas_catalogo` | — | nuevo | 5.1 |
| Tiradas | 8 por movimiento | **8** (sin cambios); el prefijo de semilla tampoco cambia | — |

## 12. Pendiente de validar
1. Prueba de sustitución completa con el simulador real. Estimación propia (72 + 200 mutados, 200 combates cada uno): 5 por debajo de 42 % y 4 por encima de 58 %, compatible con ruido (error típico ≈ 3,5 puntos); media por coste 49–51 % (v0.1: coste 2 con 43,8 %).
2. Repetir la búsqueda de sales 5.2 con el simulador real (C2 aún 9–10/13).
3. Revisar `alcance` (valor negativo aunque sea gratis).
