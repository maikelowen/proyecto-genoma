# Diseñador de sistemas — convenciones y lecciones

## Convenciones de entrega
- Cada spec va en dos ficheros: `docs/spec/<sistema>-vX.Y.md` (reglas) y `config/<sistema>.vX.Y.json` (números). Las versiones anteriores no se editan: la nueva es completa y autocontenida, con **[vX.Y]** en lo que cambia, una tabla "Cambios respecto a…" y "Pendiente de validar en simulación".
- Todo número vive en el JSON, y la spec lo cita con `[ruta]`. Si no coinciden, manda el JSON. Los ejemplos y estimaciones de la spec se marcan como tales.
- Hay que nombrar el campo de cada valor ("tipo" frente a "instancia"). Si no, el implementador tiene que adivinar (nota 7 de v0.1).
- Prioriza tablas y pseudocódigo. Cada decisión lleva su alternativa descartada (para DECISIONES.md).
- Decides tú lo técnico y el ajuste de números. Al dueño solo le llevas lo de fondo o irreversible, como una pregunta concreta con opciones y una recomendación.

## Determinismo
- El orden de tiradas se fija en la spec: qué se sortea, en qué orden y cuántas tiradas consume. El consumo es fijo aunque no se usen los valores, para que los barridos sean pareados.
- Si cambia el número de tiradas, documenta el número nuevo y la fórmula que debe validar el parser.
- Los respaldos (cuando una regla no tiene solución) deben ser deterministas, sin tiradas extra y totales (que siempre den una solución).
- En el núcleo solo se usan `+ - * /`, comparaciones, `Math.round/floor/min/max/abs`. Están prohibidos `**`, `pow`, `sqrt`, `log`, `exp`, las funciones trigonométricas y `rng.normal`. Para la normal, Irwin–Hall con 4 uniformes.
- Las comparaciones de strings se hacen con `<`, nunca con `localeCompare`. Los hashes usan serialización canónica.
- Cuando haya rondas de reparto o recorte, demuestra que terminan y que respetan los límites (ver `repartir`).

## Validación de config (pídela en la spec)
- Rangos y mínimos (p. ej. `max_crias ≥ 1`) y coherencia entre parámetros derivados (centro y factor de la normal, fórmulas de tiradas, min/max a partir de base y margen).
- Los ids usan `^[a-z0-9_]+$` para no romper separadores. Las entradas externas (JSON del servidor) se validan sin consumir tiradas.

## Criterios de simulación
- Antes de fijar un umbral, comprueba que el escenario mida lo que pretende. La E3a de v0.1 mezclaba deriva con selección de recesivos; aislar con controles (clones homocigotos, mutación 0).
- Mide en unidades que no dependan del montaje (puntos por gen frente a %) y sitúa los umbrales lejos de los topes duros, salvo que lo que quieras comprobar sea el tope.
- Separa el "colapso del sistema" (cría al azar) de la "especialización buscada" (estrategias dirigidas): necesitan umbrales distintos.
- Vigila también la inflación (absorción por híbridas, diversidad desbocada), no solo el colapso.
- Antes de entregar, estima cada criterio a mano o con un Monte Carlo mínimo. Si la estimación cae fuera del objetivo, avisa (v0.1 predijo un 66 % de sorpresa con los pesos del documento).
- Ojo con los objetivos del tipo "primer X": distingue "primer gen" de "primera criatura" (v0.1 los confundía: 18 frente a ~1950 crías).

## Balance
- El presupuesto de estadísticas es fijo por gen (D-008). Ninguna regla nueva puede crear puntos: solo redistribuirlos. El valor viene de la rareza, la especialización, los genes ocultos y la estética.
- Los combates espejo entre IAs amplifican cualquier ventaja: un +1 % de daño y vida dio ≈ 58 % de victorias. Con escalas lineales, el efecto de especializarse es ~10 veces el de la calidad, así que no se pueden ajustar por separado. Para que la calidad no pese y la especialización sí, deriva de cuotas (stat/total) y deja la calidad en un término aparte y pequeño.
- La velocidad es la estadística más amplificadora (quien actúa primero consigue el KO). Siempre jitter o desempates rotatorios, nunca orden puro.
- Las tablas de ventajas se generan con una regla simétrica (anillos) y se comprueba que la ventaja media neta sea 0 por familia. Si una regla "derivada" (p. ej. medias) depende de la frecuencia de componentes, desequilibra.
- Lo que deba ser idéntico para el mismo gen (movimiento, aspecto) se deriva de la clave del gen, no de los padres ni del orden de descubrimiento.
