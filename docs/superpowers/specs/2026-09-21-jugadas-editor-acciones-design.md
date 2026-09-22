# Editor de jugadas, ronda 2: interacción de las acciones — diseño

Segunda vuelta de pulido del editor (la primera: `2026-09-21-jugadas-editor-cancha-layout-design.md`, que tiene que estar mergeada antes). Sin base de datos ni RLS. Toca `pizarra.js`, `jugadaEditorHerramientas.js`, `jugadaEditor.js` y el CSS de `.pz*`/`.jed*`.

## 1. Mini-ícono por tipo de acción

**Qué.** Cada botón de acción de la barra (corte, dribbling, pase, cortina, tiro, handoff) muestra, a la izquierda de su texto, un trazo chico que se ve exactamente como esa acción en la cancha: recta con flecha (corte), zigzag (dribbling), punteado (pase, handoff), punteado fino (tiro), recta con T (cortina). "Seleccionar" queda sólo con texto.

**Cómo, sin duplicar el estilo.**
- En `pizarra.js`, la parte de `dibujarTrazo` que arma el SVG de un trazo a partir de `desde`, `hasta`, `control` y `tipo` (path visible, flecha del corte, T de la cortina) se separa en una función interna que usan **las dos**: la cancha y el ícono. El path sale de `trazoSvg` (el zigzag incluido) y las clases son las mismas `.pz-trazo .pz-trazo-<tipo>` y `.pz-flecha`. El trazo invisible de toque (`.pz-trazo-toque`) y `data-accion-indice` sólo los agrega la cancha.
- Nueva exportación `iconoDeAccion(tipo)` en `pizarra.js`: devuelve un `<svg class="pz pz-icono" aria-hidden="true">` con su propio `<defs>` de flecha (id fijo por tipo, `pz-flecha-icono-<tipo>`, que no choca con los `pz-flecha-u<n>` de la cancha). El trazo es horizontal, de izquierda a derecha, en coordenadas de cancha (un segmento de ~0,12 de ancho de `media`), y el `viewBox` recorta esa franja con el alto justo para que entren la T de la cortina (18 px) y la punta de la flecha; todos los íconos comparten ese mismo `viewBox` para quedar alineados. **Escala 1:1**: el ícono se muestra al mismo tamaño en px CSS que su `viewBox`, así el grosor, el punteado y el diente del zigzag son los mismos que en la cancha.
- `barraDeHerramientasHtml` lo inserta con `crudo()` (es HTML propio, no texto de usuario).
- CSS: `.pz-icono` sólo fija tamaño y alineación (`vertical-align:middle`, margen con `--sp-*`). La única regla de color nueva es para el botón activo, donde el gris no se lee sobre `--primario`: `.chip-tema.on .pz-trazo{stroke:var(--sobre-club)}` y `.chip-tema.on .pz-flecha{fill:var(--sobre-club)}`. Punteados, grosores y formas siguen viviendo sólo en `.pz-trazo-*`.
- Botón deshabilitado (sin pasos): el ícono se ve con la misma opacidad que el resto del botón; no hace falta regla propia.

**Test** (en `tests/pizarra.test.js`, nuevo: `pizarra.js` sólo importa módulos de `src/data/`, así que corre en node sin DOM):
- `iconoDeAccion usa las clases del trazo real`: para cada tipo de `TIPOS_ACCION`, el string contiene `pz-trazo-<tipo>`.
- `el corte lleva flecha y la cortina su T`: el ícono de corte tiene `marker-end` con su id; el de cortina, un segundo `<line class="pz-trazo pz-trazo-cortina">`.
- `el dribbling es zigzag`: el `d` del ícono tiene varios tramos `L` (no un `M…L` simple).
- `el ícono no trae trazo de toque`: ningún ícono contiene `pz-trazo-toque` ni `data-accion-indice`.

## 2. Curva al toque, sin cambiar de herramienta

**Hoy.** Después de crear una acción, `completarAccion()` limpia todo; para curvarla hay que pasar a "Seleccionar" y acertarle a la línea.

**Ahora.**
- `completarAccion(accion)`: si `aplicarCambio` sale bien, `seleccion = { tipo: 'accion', indice: <última del paso> }` (`aplicarAccion` hace `push`, así que es `acciones.length - 1`) y `origenAccion = null`. Si falla (el toast de siempre), la selección queda en `null`. La herramienta **no** cambia. Vale también para el tiro, que se completa en el primer toque.
- `pintarCancha` ya dibuja el asa cuando `seleccion.tipo === 'accion'`: aparece al instante.
- `alPunteroBajar`: el chequeo "el toque cayó en `.pz-asa` y hay una acción seleccionada → arrastrar el control" pasa **antes** de la bifurcación por herramienta, así funciona con cualquier herramienta activa, no sólo con Seleccionar. El asa tiene prioridad sobre una ficha que esté debajo.
- **Encadenar acciones**: con una herramienta de acción, un toque que no cae en el asa sigue el flujo de hoy y además limpia la selección: si cae en una ficha, arranca la acción siguiente (resalto de origen, sin asa); si cae en el vacío, el toast de siempre ("Tocá primero la ficha…") y el asa desaparece. Así, para encadenar cinco cortes seguidos no hay ningún paso extra respecto de hoy.
- Supr/Backspace sobre la acción recién creada la borra (ya funciona con `borrarSeleccion()`): no se agrega botón de borrar.
- Cambiar de herramienta, de paso, deshacer o rehacer siguen limpiando la selección como hoy.

Toda esta lógica es estado de la pantalla (menos de 10 líneas de cálculo): se queda en `jugadaEditor.js`, sin módulo puro nuevo.

## Fuera de alcance

Botón visible de "Borrar". Íconos para Seleccionar o para Agregar. Arrastrar el destino de una acción ya creada (sólo se curva).

## Criterios de aceptación

- `npm run test:q` en verde, con `tests/pizarra.test.js` nuevo.
- En la barra, cada acción muestra su trazo con el mismo punteado, zigzag, flecha o T que en la cancha; en el botón activo el trazo se ve en `--sobre-club`.
- Con "Corte" activo: tocar ficha → tocar destino deja el corte dibujado con el asa visible; arrastrar el asa lo curva sin tocar la barra; tocar otra ficha arranca el corte siguiente y el asa del anterior se va.
- Con "Pase": el asa aparece al tocar al receptor. Con "Tiro": al primer toque.
- Supr después de crear una acción la borra; Ctrl+Z la deshace.
