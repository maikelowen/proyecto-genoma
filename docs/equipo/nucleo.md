# Ingeniero del núcleo — convenciones y lecciones

## Entorno (sin red, sin dependencias)
- Node ≥ 22.18 ejecuta TS por *type stripping*: solo **sintaxis borrable** (nada de `enum`, `namespace`, parameter properties ni `import x = require`). `erasableSyntaxOnly` en tsconfig lo vigila.
- Los imports relativos llevan **extensión `.ts`**. El JSON se importa con `with { type: "json" }`.
- No hay dependencias en tiempo de ejecución ni de tests: `node --test` + `node:assert/strict`, y `tsc -p .` solo para tipos.
- `types/node-shim.d.ts` (y `sim/node-sim.d.ts`) declaran lo mínimo de Node porque aquí no hay `@types/node`. Si lo instalas, borra los shims y pon `"types": ["node"]`. Si un test usa algo de Node nuevo, hay que añadirlo al shim.

## Determinismo (lo no negociable)
- Todo el azar pasa por `createRng(semilla)` (sfc32 + cyrb128). En `src/` no hay `Math.random` ni reloj.
- En genética solo se permiten `+ - * /`, comparaciones y `Math.round/floor/min/max/abs`. Están **prohibidos** `**`, `pow`, `sqrt`, `log`, `exp`, las trigonométricas y `rng.normal` (Box–Muller). La normal se hace con Irwin–Hall de 4 uniformes. `10^d` se calcula multiplicando en el parser. El test de higiene lo comprueba con una regex.
- **El orden y el número de tiradas son fijos** (salvaje 205, cría 280), se usen o no los valores. Así los barridos son pareados. Comprobarlo con `drawsConsumed` en los tests, comparando el estado del RNG.
- Las comparaciones de strings se hacen con `<` (unidades UTF-16), nunca con `localeCompare`. `sort` siempre con desempate total.
- Los respaldos (como la forma mutada de N0 a N3) deben ser deterministas, sin tiradas extra y siempre con solución.

## Diseño de la API
- Funciones puras: `breed` no escribe en los padres y devuelve copias con `offspringCount + 1`. Los genes nacen congelados (QA-08). La única función con efectos es `recordMutations` (Genedex), y está documentada.
- La config se valida en `parseGeneticsConfig` (función pura que recibe el objeto JSON; el núcleo no lee ficheros). Hay que validar la coherencia entre derivados (número de tiradas, normal, calidad min/max) y los ids con regex.
- Toda entrada externa se valida antes de tirar: `Number.isInteger` en nacimiento y crías. Un error no consume tiradas.
- No hay constantes de reglas en el código: todo sale de la config, incluidas las tolerancias. Los literales 3, 4 y 6 son estructurales.
- Hay que comentar cada regla con su sección (`// spec §4.5`). Los huecos de la spec van a `docs/spec/notas-implementacion-vX.Y.md`, nunca se editan la spec ni el JSON.
- Para el simulador se exponen trazas (`trace`, `mutations[].parentKeys`, `fallbackLevel`), así puede medir sin conocer los detalles internos.

## Tests
- Usar **vectores dorados** (salvaje y cría con mutación, en JSON) para detectar cambios accidentales del algoritmo. Se regeneran solo cuando la spec cambia el algoritmo, y hay que decirlo en el informe.
- En los estadísticos, la tolerancia es de 5 errores estándar (`tol5`) con semilla fija: sin inestabilidad y sensibles a errores de ~1 punto.
- Además de las frecuencias, probar las invariantes tras muchas generaciones con mutación alta, los casos borde construidos a mano (`makeCreature`, `hybridGene`) y llamadas directas a funciones internas para los respaldos.
- Los tests de QA (`qa-genetica.test.ts`) no se debilitan: si hay que adaptarlos, solo se cambia lo que exige la API nueva.
- `npm run check` debe tardar menos de 10 s (ahora mismo, ~3,5 s).

## Lecciones
- Una spec con "suma fija" necesita una función común de reparto (`distribute`) con un ajuste de redondeo explícito, no soluciones distintas en cada sitio.
- El parser es la primera línea de defensa del simulador: casi todos los hallazgos de QA de v0.1 eran validaciones que faltaban.
