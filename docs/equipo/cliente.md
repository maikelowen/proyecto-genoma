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
- Animación (`anim.ts`): se anima sobre el DOM del campo sin re-renderizar; un modelo de vista por alma se actualiza con los eventos (`hp`, `ko`, estados, escudo) y al acabar se sincroniza con el estado real. `render()` cancela el reproductor.
- El log no trae tipo de ataque: ataque a distancia = `modifier === "alcance"` o `area` del movimiento (estado previo); aliado/propio = `targetSide === side`. Los eventos no dicen la familia de quien causa quemadura/regeneración (se asume llama / verde).
- Duración: factor global para que un turno no pase de ~7 s a ×1; `Saltar` aplica todo sin esperas. Playwright: la UI se re-renderiza, localizar con `locator().nth()` y no con handles.
- Dificultad: `chooseOpponentAi` en `game.ts` es el enganche; "Difícil" usa `createSearchAi` (~0,3 s/decisión en node) y cae a la IA normal si una decisión pasa de 800 ms.
- Escena (`style.css`, `SPOT` en `main.ts`): las unidades son `position:absolute` con `left/top` en % y `translate:-50% -50%` (la propiedad `translate` no choca con las animaciones WAAPI de `transform`); la caja de la unidad es solo el icono, la info flota fuera con `bottom:100%`, así `getBoundingClientRect` da el centro real para embestidas y proyectiles.
- Flotación por CSS en el `svg` y sombra aparte; el temblor/brillo siguen en `.ico`. El marcador se suma en `commitScore()` al acabar la animación del turno final (o al cancelarla).
- Selección: anillos en el suelo (`sel-actor/foe/ally`); clic en la escena cambia de alma o de objetivo (`focus`, `onPick`).
