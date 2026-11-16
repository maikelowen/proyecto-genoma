# Revisor/QA: método y lecciones

## Método (en este orden, con el presupuesto ajustado)
1. **`npm run check` dos veces.** Si un test falla de forma intermitente, es inestable y eso ya es un hallazgo. Comprueba también que los tests nuevos se ejecutan de verdad.
2. **Spec frente a código, solo lo que cambia.** Lee las secciones marcadas [vX] y busca en el código su fichero y línea. Cuenta las tiradas con un test de consumo, no a ojo.
3. **Recalcula por un camino independiente** al menos 2 cifras del informe. Usa código propio en `/tmp`, con semillas y emparejamiento propios, y llamadas directas al núcleo. Si coincide, se dice; si no, se cuantifica.
4. **Intenta romperlo**: configs inválidas (deben dar `ConfigError`), entradas NaN o ausentes, casos límite (bordes 12/50, padres homocigotos, rejilla bloqueada) y padres congelados en profundidad.
5. **Lee los CSV, no solo el resumen.** Mira la distribución por semilla y la trayectoria, no solo la media en la generación final.
6. **No toques nada fuera de tu entregable.** Ejecuta el simulador con `--out /tmp/...`: por defecto sobrescribe `sim/out`.

## Qué buscar en un informe de simulación
- **Validación dentro de la muestra:** cualquier parámetro elegido mirando unas semillas tiene que validarse con otras. Se repitió en v0.1 (S-02) y otra vez en v0.2 con κ (V-01).
- **Muestras pequeñas en las colas:** 100 ensayos dan una mediana con ±30 % de error (S-01). Pide IC y un contraste analítico (MLE, teoría).
- **Flujos RNG compartidos entre configuraciones:** no sesgan las diferencias, pero hacen que todas las configuraciones fallen en la misma dirección. Eso parece una señal y no lo es.
- **Censura:** debe mostrarse como "> tope", nunca como "∞".
- **Criterio evaluado en un solo instante:** puede esconder un pico anterior. El monocultivo en gen 300 escondía el ~80 % de gen 20–50 con cualquier κ (V-03).
- **Texto fijo en informes generados:** las frases causales deben salir de los datos. Si no, un nuevo cálculo puede contradecirlas sin que nadie lo vea (V-04).
- **Etiquetas escritas a mano frente a config viva:** si el parámetro cambia en el JSON, el informe se etiqueta mal al regenerarlo (V-02).

## Qué buscar en el núcleo
- Constantes repetidas en el código que ya están en la config, y operaciones no deterministas (`**`, `Math.pow`, `log`, `cos`, `Math.random`, reloj).
- Precondiciones que dejan pasar NaN o undefined (`NaN < x` es `false`).
- Afirmaciones del tipo "siempre hay solución": búscales un contraejemplo y exige un respaldo total.
- **Vectores dorados regenerados:** compara el viejo con el nuevo campo a campo. Solo deben cambiar los campos afectados por el cambio declarado.
- Coherencia entre spec, JSON y tests después de cada cambio de parámetro. Haz grep del valor viejo en la spec.
- **Topes frente a presupuesto:** comprueba con una muestra grande qué fracción de lo generado llega al tope. En v0.2, el 100 % de las curas de coste 4–5 estaban recortadas (K-01). El código era fiel a la spec y el fallo estaba en la spec.
- **Simetría:** un equipo contra sí mismo no prueba nada. Usa un estado espejo (plan de A = plan de B) y parejas X–Y / Y–X con la misma semilla.
- **Parches de config:** si se pueden crear claves y el parser ignora las desconocidas, una errata en un barrido no falla. Hay que probarlo.
- **Cierre de un hallazgo de parches:** pruébalo en cada sección del parche (`combate`, `movimientos`, `sales`). K-02 quedó cerrado en dos de las tres (C-01).
- **Modo rápido:** un "SUSPENDIDO" sacado de 24 combates no es una señal. Mira la columna `dudoso` antes de alarmarte y repite con ≥ 2000 combates (C-02).
- **Configs iguales con resultados distintos:** mira si el `id` de la variante entra en la semilla. Compara configs con `isDeepStrictEqual` antes de culpar a la config (C-03).
- **Tras adoptar una propuesta:** las etiquetas de "base" (`v02`) mienten y los tests autorreferentes dejan de fijar valores (C-04 y C-05).
- **"No depende de X":** mira el IC y el recuento de semillas en cada instante. Con la media sola, una diferencia de 14 puntos pasa por "no depende" (G-01).
- **Efecto gratis sobre un estado con duración:** si una acción de coste 0 usa la misma rutina que un movimiento (`putStatus`), comprueba si renueva la duración de algo grande que ya estaba puesto (Q-01: el escudo de 6 del básico hacía permanente uno de 155).
- **Pieza nueva "en el catálogo":** cuenta cuántos movimientos la llevan, a qué coste y en cuántos equipos aparece, y prueba si la palanca indicada puede subirlo. Si casi no aparece, el estudio mide la variante sin ella (Q-02).
- **"Q-03 arreglado":** prueba una errata en forma larga en **cada** bloque de la config, no solo en los nuevos. En v0.4 seguían pasando en silencio `energia`, `estadisticas`, `desgaste` y `modificadores`, que son justo los que barre el estudio (R-01).
- **Estado con duración 1 leído al empezar el turno:** siempre vale 0. Si una IA lo lee (provocar), nunca lo verá. Comprueba la frecuencia de uso cuando un hallazgo dice "revisar si sube" (R-02).
- **`npm run check` con otro agente trabajando:** si falla por ficheros sin confirmar ajenos al commit, repítelo sobre `git archive <commit>` en `/tmp` y di las dos cosas.

- **Garantía "idéntico a vX con la clave a false":** no te quedes en el dorado. Compara los hashes de ≥ 1000 partidas de la config vieja con los de la nueva con las claves desactivadas (v0.5: 1000/1000).
- **"La métrica nueva sale alta":** mide su contrafactual en la base. En v0.5, la energía "perdida" ya se devolvía en v0.4 (4,6 por partida), así que la estimación de la spec estaba mal desde el principio. Separa también lo que no tiene efecto, como lo perdido en el último turno por el bando que pierde (I-02).
- **Funciones con `cfg?` opcional que cambian de regla según la config:** busca con grep las llamadas sin `cfg` en `client/` y `sim/`, y pide que sea obligatorio (I-01).

## Formato de entrega
- Veredicto (APROBADO / CON CAMBIOS / RECHAZADO), tabla de hallazgos (ID, severidad, fichero:línea, reproducción, arreglo) y checklist marcada.
- Severidad: **bloqueante** = el resultado es incorrecto; **mayor** = cambia una cifra o el alcance de una conclusión; **menor** = texto, robustez o higiene; **sugerencia** = mejora.
- La respuesta al coordinador, corta: el veredicto y solo los hallazgos que cambien alguna conclusión.
- **"Nunca más fuerza" con `potencia ≤ original`:** no basta si el original está en el tope del escalable o tiene holgura por redondeo; añadir una pieza deja la misma potencia. Enumera candidatos con el catálogo real y cuenta "pieza añadida con misma potencia" (progresión v0.1, B-01: 4/72 genes).
- **Probabilidades redondeadas (`r2`) con decimales:** el orden de las operaciones cambia el % en ~0,15 % de los casos; exige una sola función o fórmula entera cuando el % se muestra al jugador (B-07).
- **Economías con "libera/vende":** mide la devolución de lo más barato (ecos de nivel 1), no solo las capturas caras; ahí estaba casi todo el 15 % (B-06).
- **"Sin respaldo, n < 2 alto":** mide el efecto que nota el jugador (niveles que no ofrecen nada, ánimas afectadas), no solo el % por gen. En progresión v0.1, un 9,7 % por gen eran el 7 % de los niveles sin oferta y el 34 % de las ánimas afectadas (N-01).
- **Comparar con `puntosEf(M)`:** M ya ha perdido puntos por redondeo, así que una cota estricta castiga a los originales mal redondeados. Antes de proponer tolerancia, cuenta "pieza añadida con la misma potencia" y "cambio por una pieza más cara con la misma potencia" (N-01).
- **Reglas que se activan con un contador de la colección (acompañante < 2 ánimas):** cruza su condición con quién entra en el equipo. Los simuladores rehacen el equipo y no lo ven (N-03).
- **Parser nuevo:** prueba siempre una errata de clave por bloque. En progresión v0.1 faltaba `onlyKeys` (N-02, lo mismo que R-01).
