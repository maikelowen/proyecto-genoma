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
- **"No depende de X":** mira el IC y el recuento de semillas en cada instante. Con la media sola, una diferencia de 14 puntos pasa por "no depende" (G-01).

## Formato de entrega
- Veredicto (APROBADO / CON CAMBIOS / RECHAZADO), tabla de hallazgos (ID, severidad, fichero:línea, reproducción, arreglo) y checklist marcada.
- Severidad: **bloqueante** = el resultado es incorrecto; **mayor** = cambia una cifra o el alcance de una conclusión; **menor** = texto, robustez o higiene; **sugerencia** = mejora.
- La respuesta al coordinador, corta: el veredicto y solo los hallazgos que cambien alguna conclusión.
