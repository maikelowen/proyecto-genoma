# Especificación de movimientos v0.4 — gratis, provocar y alcance garantizado (D-043)

Estado: propuesta. Autor: Diseñador de sistemas. Fecha: 2026-11-13.
Base: `movimientos-v0.2.md` + balance v0.2.1 + pieza provocar de v0.3. **Solo cambios** ([v0.4]); el resto sigue igual. Números en `config/propuestas/combate-v0.4.json` → bloque `movimientos` (**P**).
**Tiradas: sin cambios, 8 por movimiento, consumidas siempre.** Prefijo de semilla sin cambios. Cambian los movimientos de extremidades (18 genes base), de cola (18) y algunos de protección/táctico: **hay que regenerar el dorado del catálogo de 72** y repetir sales (§5).

---

## 1. Resumen de cambios

| Pieza | v0.2.1 / v0.3 | v0.4 |
|---|---|---|
| Locus extremidades | movimiento de pago normal | **movimiento gratis** (coste 0, presupuesto 3) |
| Locus cola | libre | **siempre ofensivo, con `alcance` o área** |
| `alcance` | coste 0 (valor medido negativo con objetivo manual) | coste **1** (ahora salta la fila delantera; a medir) |
| `presupuesto_por_coste.1` | 6 | **7** (mantiene el neto del coste 1 sobre el gratis) |
| Provocar | solo protección; pesos con umbral sobre `u3`; 2/72 | protección **y táctico**; probabilidad por familia; escudo ≥ 50 %; ≥ 4 en el catálogo |
| Cuotas de catálogo | sobre 12 genes | sobre los 9 de pago (+ reglas del gratis) |

## 2. Movimiento gratis (locus extremidades) [v0.4] `[gratis]`

| Parámetro | Valor | Ruta |
|---|---|---|
| Presupuesto | 3 puntos | `gratis.presupuesto` |
| Arquetipos permitidos | golpe, golpe_estado, protección, curación | `gratis.arquetipos` |
| Reasignación | maldición → golpe_estado; táctico → golpe | `gratis.reasignar` |
| Estados | ofensivos de coste ≤ 1 (ralentizar, marca, debilitar); positivos: solo "ninguno" | `gratis.coste_max_estado` = 1 |
| Modificadores | alcance, drenaje (área, prioridad y perforar no caben o no se permiten) | `gratis.modificadores` |
| Condiciones | sí (cualquiera) | — |
| Provocar, energía extra | nunca | — |
| Descanso | no descansa (combate §2) | `combate: variantes.descanso.gratis_descansa` |

Resultados posibles con 3 puntos (potencia por punto v0.2): golpe 15; golpe 10 + marca/ralentizar/debilitar; golpe 10 con alcance (1 + 2 pts); golpe 10 con drenaje; golpe 10 con condición (+50 % → 15); escudo 20; cura 15. Nada supera a un coste 1 (7 puntos = 35 de daño).

```
generarMovimiento(gen) si gen.locus = gratis.locus ("extremidades"):
  u1..u8 = 8 tiradas (u1 se consume y no se usa: c = 0)
  presupuesto = gratis.presupuesto
  wA = como v0.2 sobre orden_arquetipos; luego sumar wA[maldición] a golpe_estado y wA[táctico] a golpe; poner a 0 los no permitidos
  arq = orden_arquetipos[índice ponderado(wA, u2)]
  estado (u3): pesos de la familia con 0 en los de coste > coste_max_estado; positivos → "ninguno"
  mod (u4, u5): igual que v0.2 con 0 en los no permitidos por gratis.modificadores
  cond (u6, u7): igual que v0.2
  nombre (u8): igual que v0.2
  ensamblado §4.1 de v0.2 con presupuesto = 3 y el mismo respaldo
```
**Termina siempre**: tras quitar condición, modificador y estado, `L = 3`, `pts = 3 ≥ minimo_puntos (2)` y `3 ≥ 0,4·3`. El parser valida `gratis.presupuesto ≥ minimo_puntos` y `fraccion_minima·gratis.presupuesto ≤ gratis.presupuesto − max(coste de modificador permitido)`; `coste = 0` solo es válido en el locus gratis.

**Alternativas descartadas:** golpe básico genérico + 4 de pago (D-043 lo descarta); gratis con presupuesto 2 (= golpe básico de 10, sin margen para estado ni escudo útil); permitir provocar en el gratis (no descansa: provocación permanente).

## 3. Garantía de alcance/área (locus cola) [v0.4] `[garantia_alcance]`

```
si gen.locus = garantia_alcance.locus ("cola"):
  wA[protección] = wA[curación] = 0                     // siempre ofensivo
  … arquetipo, estado, mod, cond como v0.2 (mismas tiradas) …
  si no (arq = maldición o mod = area): mod = "alcance"   // sustituye al modificador sorteado o al null
```
- Sin tiradas extra (u4 y u5 se consumen igual). Una maldición sin modificador ya es de área; una maldición con `prioridad` la conserva (área garantizada).
- Efecto: **toda alma** tiene al menos un movimiento que llega a la trasera o a toda una fila, en todas las familias, híbridas y genes mutados.
- Coste: `alcance` pasa a 1 punto `[modificadores.alcance.coste]`. Como en la cola es obligatorio, el coste solo desplaza a todos los movimientos de cola por igual; su valor real lo mide el Analista con la prueba de pieza gratis (§7.1 de v0.2).
- Descartado: sales por familia para meter alcance (no cubre híbridas ni mutados); garantizarlo en cualquier locus (mezcla identidad de locus; la cola ya tenía peso a maldición).

## 4. Provocar [v0.4] `[provocar]`

| Parámetro | v0.3 | v0.4 |
|---|---|---|
| `activo` | false | **true** |
| `arquetipos` | proteccion | **proteccion, tactico** (el parser debe aceptar táctico, que es ofensivo con estado al usuario) |
| Sorteo | umbral `T/(T + w)` sobre `u3` | **`u3 < p_fam`** → provocar; si no, estado con `u3' = (u3 − p)/(1 − p)` (sin tiradas extra) |
| Probabilidad por familia | pesos roca 3, marea 1, brote 1 | `probabilidad_familia`: roca 0,7 · marea 0,4 · brote 0,25 · resto 0 |
| Híbridas | suma de componentes | **máximo** de los componentes (`hibridas: "max"`) |
| Coste | 3 puntos (×área) | 3 (sin cambios) |
| Escudo mínimo | — | protección con provocar: `fac·fEsc·pts ≥ 0,5·presupuesto` `[provocar.fraccion_minima_escudo]` |
| Locus | todos | cabeza, cuerpo (no cola: es ofensiva y con alcance; no extremidades: gratis) |

- En **táctico**, provocar ocupa el hueco de prisa (y no existe si el táctico lleva energía extra). Nombre del núcleo: "Desafío de …".
- **Respaldo**: si con provocar no se cumple el escudo mínimo, el paso 3 del respaldo (quitar estado) quita provocar antes que bajar el escudo.
- **Cuota de catálogo** `[criterios_sim.cuotas_catalogo.provocar]`: en los 72 genes base, total **≥ 4 y ≤ 6**; roca ≥ 2, marea ≥ 1, brote ≥ 1. Si no se cumple, búsqueda voraz de sales `p1…p40` sobre genes de cabeza/cuerpo de esas familias (mismo procedimiento que v0.2 §5.1). Estimación con el catálogo actual (protección + táctico en cabeza/cuerpo/cola: roca 2, marea 3, brote 4) → ≈ 3 sin sales: **hará falta 1–2 sales**.
- Brote (32 % en v0.3): lo corrigen el escudo mínimo, el escudo al usuario y la regla de aguante de la IA (combate §8). Si sigue fuera de banda, `probabilidad_familia.brote` → 0 (Brote se queda sin provocar y tiene área de cura como identidad).

## 5. Cuotas de catálogo por familia base [v0.4] `[criterios_sim.cuotas_catalogo]`
Sobre los **9 genes de pago**: apoyo (protección + curación) entre 1 y 3; ningún arquetipo más de 4; al menos 2 golpes o golpes con estado. Sobre los 3 gratis: al menos 1 ofensivo. Alcance/área: garantizado por la cola (3 por familia). Repetir sales `r*` (cuotas) y `c*` (C2, combate §9) con el simulador real; las sales actuales de extremidades y cola quedan **anuladas** (sus genes cambian de regla).

## 6. Decisiones (para DECISIONES.md)

| # | Decisión | Alternativas descartadas |
|---|---|---|
| M13 | Gratis en extremidades con 3 puntos y piezas baratas | Básico genérico; 2 puntos (sin margen); 4 puntos (compite con el coste 1) |
| M14 | Cola siempre ofensiva con alcance o área | Sales por familia (no cubre mutados/híbridas) |
| M15 | `alcance` 0 → 1 punto, `presupuesto_por_coste.1` 6 → 7 | Mantener 0 (con prioridad de fila vale más que antes) |
| M16 | Provocar en protección y táctico, por probabilidad, híbridas por máximo, escudo ≥ 50 % | Subir pesos (v0.3 Q-02: con 2 protecciones por familia no pasa de 3); forzar por gen (no generaliza) |
