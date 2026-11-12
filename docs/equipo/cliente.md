# Ingeniero de cliente — convenciones y lecciones

## Estructura y build
- `client/combat/`: `data.ts` (configs, nombres, paletas), `game.ts` (sin DOM: ofertas, equipos, turno), `narrate.ts` (eventos -> español), `main.ts` (UI), `style.css`.
- `npm run build:combate` (`client/build-combate.mjs`): transpila cada .ts con la API de `typescript` (módulo global si no hay local) a CommonJS y los une con un mini cargador en **un solo HTML** (JS, CSS y JSON de config en línea). Escribe `client/out/combate.html` (ignorado por git) y copia a `docs/jugable/combate.html` (versionado). Hay que volver a ejecutarlo tras cambiar el núcleo, las configs o el cliente.
- `npm run typecheck` incluye `client/tsconfig.json` (lib DOM; sin el shim de Node, que choca con DOM).

## Convenciones
- Solo API pública de `packages/core` (`../../packages/core/src/index.ts`) y `client/art/palette.ts` para colores. Sintaxis TS borrable e imports con `.ts`.
- `Math.random` solo en `newSeed()` y en el equipo aleatorio; las ofertas y el rival salen de `createRng("oferta|"+semilla)` / `"rival|"`, y el combate de `seedPrefix + semilla`. Se pueden reproducir con `?oferta=X&combate=Y` en la URL.
- UI sin framework: `h(tag, attrs, ...hijos)` y re-render completo de `#app` en cada cambio. `innerHTML` solo para los SVG estáticos de `souls.ts` (extraídos de `docs/arte/referencia-almas.svg`).
- Marcador en `localStorage` dentro de try/catch (en file:// puede fallar); si falla queda en memoria.

## Lecciones
- `state.turn` tras `resolveTurn` ya es el turno siguiente (salvo si hay resultado): el informe usa `turn - 1`.
- `validatePlan` exige una acción por cada alma viva no aturdida: el núcleo no permite "no actuar"; el golpe básico gratis lo sustituye.
- Los eventos llevan posiciones, no nombres: `narrate` recibe los nombres por bando y el estado previo (para movimientos y familias).
- Verificación: Playwright (`/opt/npm-tools/node_modules/playwright`) abriendo el file://, a 380 px y a 1100 px, sin errores de consola.
