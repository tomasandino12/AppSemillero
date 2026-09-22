# Pulido del editor y la ficha de jugadas — Plan

> Ejecutar en la sesión, sin subagentes. Una task = un commit. `npm run test:q` antes de cerrar cada una. Leer `DESIGN.md` antes de tocar CSS (tokens, dark mode, `--tap`). Verificar cada task con el preview (`preview_start`) en 1440×900 y 1920×940; el editor además en 1024×768 (tablet).

**Goal:** dejar el editor con la disposición del boceto de Stitch (herramientas en columna a la izquierda, cancha al centro, panel de pasos a la derecha), íconos en vez de botones grandes, trazos de color por tipo de acción, un "ajuste" de fichas que se vea mientras arrastrás, y la ficha de la jugada entera en pantalla en PC.

## Por qué falló la vuelta anterior (leer antes de arrancar)
- **Visor en PC:** el fix de `637153d` le puso tope a `#jug-visor-completo-cuerpo` (`.jvc`, el visor del *jugador*). La pantalla que se ve gigante es la **ficha de la jugada** (`p-jugada`, `src/ui/pantallas/jugada.js`): ancho 52rem y alto sin tope, así que la cancha mide ~800px de alto y los controles quedan abajo del pliegue.
- **Ajuste:** `ajustarFicha` agrega una acción `ajuste` invisible al paso, pero el editor dibuja el **inicio** del paso (`estadoAlInicioDelPaso`): mientras arrastrás, la ficha no se mueve. Y si la ficha ya tenía un corte en ese paso, la validación ("se mueve dos veces") tira, el `catch` de `alPunteroMover` lo traga y no pasa nada, sin aviso.

## Decisiones cerradas
- Sin migración: todo vive en `datos` (JSON) y en `nombre`, que ya tienen grant (0035).
- **Arrastrar una ficha en un paso = decidir dónde termina ese paso.** Paso 1 (índice 0): mueve la formación, como hoy. Paso >1: si la ficha ya tiene corte/dribbling/cortina/ajuste en ese paso, se mueve la **punta** de esa acción; si no, se crea un `ajuste`. El ajuste se muestra sólo en el editor como una **ficha fantasma** (misma forma y número, ~35% de opacidad, sin flecha) en el destino. En el visor, la exportación y la impresión sigue invisible; en la animación se mueve igual que un corte.
- Deshacer/rehacer: íconos de flecha curva (↶ ↷), con `title`/`aria-label` "Deshacer (Ctrl+Z)" y "Rehacer (Ctrl+Y)".
- Renombrar = ícono de lápiz al lado del nombre. Borrar jugada = ícono de tacho al lado del nombre. Sin botones "Renombrar".
- Color por tipo de acción, igual en la barra, la cancha, el visor y el PNG: corte verde, dribbling amarillo, pase azul, cortina violeta, tiro rojo (`--primario`), handoff rosa. Tokens nuevos en `tokens.css`, con variante de dark mode, y con contraste suficiente contra `--papel`.
- **Fuera de alcance** (del boceto de Stitch): "Focos de corrección", tiempos por paso, título por paso, "Exportar PDF" en el editor y botones de zoom. El título de cada paso sale de su nota.

---

## Task 1 — La ficha de la jugada entra entera en PC
**Archivos:** `public/css/componentes.css` (bloque `.visor-jugada`) o `layout.css` si hace falta el prefijo por cascada (ver el comentario de `.pant.ancha` en `layout.css:373`).
**Qué:** desde 64rem, `.visor-jugada svg.pz` lleva `max-height` = `100dvh` menos lo que ocupan la cabecera, la barra de categorías, `.ficha-top`, la nota, los controles y las velocidades (con tokens, como la resta de `.pant.ancha .jed-cancha svg.pz`). Dejar `width:100%`: el `viewBox` con el `preserveAspectRatio` por defecto centra la cancha sola. Si no alcanza, pasar a dos columnas desde 64rem (cancha a la izquierda, nota, controles y acciones a la derecha). La regla vieja de `.jvc` se queda, no molesta.
**Aceptación:** en 1440×900 y 1920×940, dentro de `p-jugada` y sin scrollear: `document.querySelector('.visor-jugar').getBoundingClientRect().bottom <= innerHeight` y la cancha se ve completa (media y entera). En el celu (375×812) y en el modal "Ver animación" del editor, todo igual que hoy.
**Tests:** ninguno (CSS). Medirlo con `javascript_tool` en el preview.
**Commit:** `fix(jugadas): la ficha de la jugada entra entera en la pantalla de la compu`

## Task 2 — Íconos compartidos y ficha de la jugada con menos botones
**Archivos:** crear `src/ui/componentes/iconos.js`; modificar `src/ui/pantallas/jugada.js` y `public/css/componentes.css`.
**Qué:**
- `iconos.js` exporta `ICONO` (lapiz, tacho, deshacer, rehacer, duplicar, descargar, imprimir, mas, reproducir) como strings de `<svg viewBox="0 0 24 24">` con `stroke="currentColor"`, y `botonIcono({ id, icono, etiqueta, extraClase })`, que arma un `<button type="button" class="btn-icono">` con `aria-label` y `title` = etiqueta. `chrome.js` tiene su propio `ICONOS`: **no** se unifica (sería un refactor, va aparte).
- `.btn-icono`: cuadrado de `--tap`, fondo transparente, color `--gris`, hover y foco con `--tinta` y anillo de foco visible, `disabled` en gris claro.
- En `jugada.js`, la cabecera queda `nombre · [lápiz] [tacho]` (los dos íconos sólo si `esMia`). El lápiz abre la hoja de renombrar que ya existe y el tacho `confirmarBorrado`. Abajo del visor: `Editar` (sólo si `esMia`) y `Asignar a planteles` como botones, y `Duplicar`, `Descargar paso` e `Imprimir` como `btn-icono` en una fila. Migrar esta pantalla ya usa `html`: no mezclar con `escaparHtml`.
**Aceptación:** ya no existen `#btn-jug-renombrar` ni `#btn-jug-borrar` como botones de texto. Con una jugada ajena no aparece ni el lápiz ni el tacho. Renombrar y borrar funcionan igual que antes.
**Tests:** `tests/iconos.test.js`, con `botonIcono escapa la etiqueta y pone aria-label y title` y `cada ICONO es un svg con viewBox 0 0 24 24`.
**Commit:** `feat(jugadas): lápiz y tacho junto al nombre, acciones secundarias como íconos`

## Task 3 — Cada tipo de acción con su color
**Archivos:** `public/css/tokens.css`, `public/css/componentes.css`, `src/ui/componentes/pizarra.js`, `src/ui/componentes/exportarJugada.js` (si el PNG serializa estilos: revisar cómo toma los colores), `tests/pizarra.test.js`.
**Qué:** tokens `--trazo-corte`, `--trazo-dribbling`, `--trazo-pase`, `--trazo-cortina`, `--trazo-tiro` y `--trazo-handoff`, con dark mode. `svgDeTrazo` ya pone `pz-trazo-${tipo}`: sumarle el color por clase. La punta de flecha hoy es un único `<marker>` gris (`.pz-flecha`); pasa a ser **un marker por tipo** (id con `uid` + tipo) con la clase `pz-flecha-${tipo}`. No usar `context-stroke`, porque en Safari no es confiable. `iconoDeAccion` hereda los colores solo. Sacar la regla `.chip-tema.on .pz-trazo` (el ícono ya no va sobre fondo rojo después de la Task 4).
**Aceptación:** en el editor y en el visor, cada trazo y su punta tienen el color de su tipo, en claro y en oscuro. El PNG descargado sale con los mismos colores.
**Tests (pizarra.test.js):** `cada tipo de acción usa su propio marker de flecha` y `el ícono de la barra usa la misma clase de trazo que la cancha`.
**Commit:** `feat(jugadas): color propio para cada tipo de acción`

## Task 4 — Editor: barra superior y herramientas en columna
**Archivos:** `src/ui/pantallas/jugadaEditorHerramientas.js`, `src/ui/pantallas/jugadaEditor.js`, `public/css/componentes.css` y `layout.css` (bloque `.pant.ancha`).
**Qué:**
- `cabeceraEditorHtml({ nombre, tipo, puedeDeshacer, puedeRehacer })`: `‹ Volver` · nombre + lápiz (abre la hoja de renombrar que ya existe) + etiqueta del tipo · a la derecha `↶ ↷` (`botonIcono`) y `Guardar` (botón primario). `Volver` y `Guardar` salen del panel de pasos.
- `barraDeHerramientasHtml` pasa a ser una **columna** (`.jed-barra`): título "Trazos", `Seleccionar` (ícono de cursor) y las 6 acciones, cada una un botón cuadrado de ≥ `--tap` con `iconoDeAccion(t)` arriba y la etiqueta chica abajo. La activa lleva borde y fondo suave del color de su tipo, **no** relleno rojo. Después viene un separador, el título "Fichas" y `+A`, `+D` y el cono (el triángulo chico de `.pz-cono`), deshabilitados fuera del paso 1 con el `title` de `AYUDA_AGREGAR`. "Ver animación" se muda al panel (Task 5).
- Disposición desde 64rem: `barra (≈5rem) | cancha (flex:1) | panel (≈20rem)`, todo a la altura de la pantalla. Recalcular el `max-height` de `.pant.ancha .jed-cancha svg.pz`: ya no hay franja de herramientas arriba, pero sí la cabecera nueva. Entre 48 y 64rem (tablet vertical): la barra queda como fila horizontal de íconos arriba de la cancha y el panel debajo.
- `cablearHerramientas` y los atajos siguen iguales (ids de deshacer/rehacer conservados). Sacar `.jed-grupo*` si queda sin uso.
**Aceptación:** en 1440×900 se ven sin scroll la barra, la cancha completa y el panel. Deshacer y rehacer son íconos y se deshabilitan cuando corresponde. El lápiz renombra. En 1024×768 se puede usar entero.
**Tests:** ninguno nuevo (plantilla y cableado). Correr `tests/arquitectura.test.js` dentro de `test:q`.
**Commit:** `feat(jugadas): editor con barra superior y herramientas en columna`

## Task 5 — Editor: panel "Secuencia de pasos"
**Archivos:** `src/data/jugadas.js`, `src/ui/pantallas/jugadaEditorHerramientas.js`, `src/ui/pantallas/jugadaEditor.js`, `public/css/componentes.css`, `tests/jugadas.test.js`.
**Qué:**
- Nueva función pura `resumenDePaso(paso, indice)`, que devuelve `{ numero, titulo }`. `titulo` es la primera línea de la nota, recortada a ~40 caracteres con "…". Sin nota: "Formación inicial" en el índice 0 y "Sin indicaciones" en el resto.
- `panelDePasosHtml(datos, pasoActual)`, en este orden: (1) cabecera "Secuencia de pasos" + `+ Nuevo paso` (chico, al lado del título); (2) navegación `‹ Paso N de M ›`; (3) **lista** de pasos (`<ol>` de botones con número en círculo y título). Tocar uno llama a `cambiarPaso(i)`, el activo va resaltado (`aria-current="step"`) y **sólo el activo** muestra el tacho a la derecha (`#btn-jed-paso-borrar`), que ya no es un botón suelto abajo. Con muchos pasos, la lista scrollea sola sin empujar el resto; (4) `Ver animación` (botón ancho, con ícono de reproducir); (5) "Indicaciones del paso N": el textarea `#jed-nota` que ya existe. Al guardar la nota (`change`), repintar sólo el título de ese paso en la lista, sin volver a renderizar todo, para no perder el foco.
- Sin pasos: el mensaje actual + `+ Nuevo paso`.
**Aceptación:** agregar, borrar y navegar pasos se hace dentro del mismo recuadro. La lista refleja la nota de cada paso. Borrar un paso es deshacible con Ctrl+Z, como hoy.
**Tests (jugadas.test.js):** `resumenDePaso usa la primera línea de la nota`, `resumenDePaso recorta notas largas con …` y `resumenDePaso sin nota: formación inicial en el 0, sin indicaciones en el resto`.
**Commit:** `feat(jugadas): panel de secuencia de pasos con lista y borrar al lado`

## Task 6 — El ajuste se ve y mueve la punta si ya había movimiento
**Archivos:** `src/data/jugadas.js`, `src/ui/componentes/pizarra.js`, `src/ui/pantallas/jugadaEditor.js`, `public/css/componentes.css`, `tests/jugadas.test.js`, `tests/pizarra.test.js`.
**Qué:**
- `ajustarFicha(datos, k, fichaId, x, y)`, con la regla de "Decisiones": con k>0, si la ficha tiene una acción de `DE_MOVIMIENTO` en el paso k, le cambia `hasta` (conserva `control`: si la curva queda rara se ajusta con el asa); si no, crea o actualiza el `ajuste`. Así ya no tira "se mueve dos veces".
- `dibujarPizarra`, nueva opción `fantasmas: true` (sólo la pasa el editor): por cada `ajuste` del paso visible dibuja la ficha en `hasta` con la clase `pz-fantasma` (opacidad ~.35, `pointer-events` activos) y `data-accion-indice`. El visor, la exportación y la impresión no la pasan.
- En el editor: arrastrar la ficha **o** su fantasma llama a `ajustarFicha`, y el fantasma (o la punta de la flecha) sigue al puntero en vivo. Tocar el fantasma con Seleccionar lo selecciona como acción, y Supr quita el ajuste, no la ficha. Si la validación rechaza el arrastre por otra regla, mostrar un toast una sola vez por arrastre en vez de tragarlo en silencio.
- Hoy `fichaEnPunto` busca en la posición de inicio: hacer que también encuentre fantasmas, o apoyarse en `data-accion-indice` del target, como ya pasa con los trazos.
**Aceptación:** en el paso 3, arrastrar un defensor sin acciones deja un fantasma donde lo soltás, sin flecha, y la animación lo mueve ahí. Arrastrar un atacante que ya tiene un corte estira la flecha. En el paso 1 sigue moviendo la formación. Deshacer revierte cada arrastre de a uno.
**Tests:** en `jugadas.test.js`, `ajustarFicha con corte en el paso mueve la punta del corte`, `ajustarFicha sin movimiento crea un ajuste` y `ajustarFicha dos veces actualiza el mismo ajuste`. En `pizarra.test.js`, `con fantasmas dibuja el ajuste en su destino` y `sin fantasmas el ajuste no dibuja nada`.
**Commit:** `feat(jugadas): el ajuste de una ficha se ve como fantasma en el editor`

---

## Cierre
- `npm run test:q` en verde y `graphify update .`
- Recorrido completo en el preview: crear una jugada, formación, 3 pasos con notas, ajustar un defensor, renombrar con el lápiz, deshacer/rehacer con los íconos, guardar, abrir la ficha en PC (entra entera) y reproducir.
- Push sólo si Tomás lo pide.
