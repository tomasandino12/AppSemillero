# Editor de jugadas, ronda 1: cancha y layout — diseño

Pulido de lo que salió en `2026-09-21-jugadas.md`. Sin base de datos ni RLS: JS, CSS y SVG sobre `pizarra.js`, `jugadaEditor.js`, `jugadaEditorHerramientas.js`, `animacionJugada.js` y el CSS existente.

## 1. Geometría de la cancha (bug: el arco de tres sale de la cancha)

**Problema.** `mitadDeCancha()` saca todo del alto (`rArco = mitadAlto * 0.58`) pero el ancho es fijo (`W = 300`): en media cancha el arco mide ~162 px de radio con 150 de medio ancho, y queda afuera. Además el aro que dibuja la pizarra (`mitadAlto * 0.09`) no coincide con `AROS` de `animacionJugada.js` en cancha entera (0.045 contra 0.04): el tiro termina al lado del aro.

**Decisión.** Un módulo puro nuevo, `src/data/geometriaCancha.js`, es la única fuente de las medidas. Guarda las medidas FIBA en metros y una escala de **20 px/m**:

| Elemento | Medida FIBA | En el viewBox |
|---|---|---|
| Ancho (línea de fondo) | 15 m | `W = 300` (no cambia) |
| Media cancha (fondo a mitad) | 14 m | alto `media` = 280 (no cambia) |
| Cancha entera | 28 m | alto `entera` = **560** (hoy 520) |
| Centro del aro | 1,575 m de la línea de fondo, radio 0,225 m | y = 31,5; r = 4,5 |
| Tablero | a 1,2 m del fondo, 1,8 m de ancho | y = 24; 36 px |
| Zona (rectángulo) | 4,9 m × 5,8 m | 98 × 116 |
| Círculo de tiros libres | radio 1,8 m, centro en la línea de libres | r = 36, cy = 116 |
| Arco de tres | radio 6,75 m desde el aro; rectas paralelas a 0,9 m de cada lateral hasta cortar el arco | rectas en x = 18 y x = 282 desde y = 0 hasta y ≈ 59,8; arco de ahí |
| Círculo central | radio 1,8 m | r = 36 (en `media`, sólo la mitad que cae adentro: un arco hacia arriba desde el borde inferior) |

- `geometriaCancha.js` exporta `W`, `ALTO`, `altoDe(cancha)`, `AROS` (normalizado 0–1, derivado de las medidas: media `y = 0.1125`, entera `y = 0.05625`) y una función que devuelve las formas de un extremo en unidades del viewBox (`zona`, `circuloLibres`, `triple` con los puntos de las rectas y el arco, `aro`, `tablero`). Nada de strings SVG ni DOM ahí: sólo números.
- `pizarra.js` deja de tener `W`, `ALTO` y las proporciones sueltas: arma el SVG con esos números. El reflejo de la otra mitad en `entera` sigue igual.
- `animacionJugada.js` importa `AROS` de `geometriaCancha.js` y lo re-exporta (los tests actuales lo importan de ahí).
- **Pasar `entera` de 520 a 560** hace que la proporción sea la real (28:15). Las jugadas guardadas no se rompen: las coordenadas están en 0–1, las fichas quedan en el mismo lugar relativo; lo único que se corre un poco es la cancha dibujada debajo (el aro baja de 0,04 a 0,056). Se acepta.
- Sigue siendo SVG en JS con clases y tokens (`.pz-linea`, `.pz-aro`, `.pz-tablero`); nada de imagen de fondo.

**Test** `tests/geometriaCancha.test.js`:
- `radio del triple + distancia lateral no pasa la mitad del ancho`: el punto más lejano del arco en x y las rectas quedan dentro de `[0, W]`.
- `ninguna forma sale de la cancha` para `media` y `entera`: bounding box de cada forma dentro de `[0, W] × [0, altoDe(cancha)]` (en `entera`, también el extremo reflejado; en `media`, el semicírculo central cuenta sólo su mitad de adentro).
- `las rectas del triple tocan el arco`: el punto final de cada recta está a 6,75 m (±0,01) del aro.
- `AROS coincide con el aro dibujado`: `AROS[c].y * altoDe(c)` = y del aro de la geometría, para las dos canchas.

## 2. Layout del editor (bug: nunca queda en fila)

**Problema.** `.jed-cuerpo` es `flex-direction:column` siempre, y desde 64rem `.cuerpo > .pant.on` topa todo en `--max-ancho` (52rem). En la compu la cancha y los pasos quedan apilados en una columna angosta.

**Decisión.**
- Ninguna pantalla rompe hoy `--max-ancho`, así que no hay patrón que copiar. Se agrega uno mínimo en `layout.css` (ahí viven los cortes de ancho): un modificador `.pant.ancha` que en `≥64rem` cambia el `max-width` de la columna a `none` (con el padding lateral de `.pad` como margen). La cabecera sigue alineada a `--max-ancho`: en el editor el título queda un poco más adentro que la barra, y se acepta. El editor lo lleva en `public/index.html` (`<section class="pant ancha" id="p-jugada-editor">`). Se documenta en `DESIGN.md` como excepción al punto 5 del checklist: sólo para herramientas de lienzo, no para formularios ni listas.
- **≥64rem (compu, tablet horizontal):** `.jed-cuerpo` en fila; la cancha centrada ocupa lo que sobra (`flex:1`) y el panel de pasos va a la derecha con ancho fijo (~18rem). La cancha se topa por alto para que entre entera sin scroll: `max-height` del SVG = alto del viewport menos cabecera y barra de herramientas (un `calc` con `100dvh`), con `width:auto` para que conserve la proporción. `puntoDesdeEvento` ya contempla las franjas de `meet`.
- **<64rem (tablet vertical):** columna como hoy, la cancha al ancho completo y el panel debajo.
- El editor sólo se abre si `min(ancho, alto) ≥ 600` (`pantallaAptaParaEditar`), así que no hay caso celular que cuidar.

## 3. Barra de herramientas

`barraDeHerramientasHtml` arma cuatro grupos, en este orden, cada uno con su rótulo visible chico en mayúsculas (`--ff-titulo`, `--fs-115`, `--gris-cl`) y separados entre sí por un filete de 1 px en `--linea`. La barra entera va centrada (`justify-content:center`) y hace wrap por grupo antes que por botón suelto (un grupo baja entero al renglón siguiente; sólo se parte si no entra ni solo).

1. **Herramientas**: Seleccionar + corte, dribbling, pase, cortina, tiro, handoff (como hoy, deshabilitadas sin pasos).
2. **Agregar**: + Atacante, + Defensor, + Cono. Nuevo parámetro `puedeAgregar` (= `pasoActual === 0`). Fuera del paso 1 los tres llevan `disabled` y `title="Las fichas se suman en la formación inicial (paso 1)."`; además, como en tablet no hay hover, el grupo muestra debajo una ayuda de una línea (`.ayuda`) con ese mismo texto. La guarda de `agregarNuevaFicha` se queda como red de seguridad.
3. **Historial**: Deshacer, Rehacer, Ver animación (ésta sigue apareciendo sólo con pasos).
4. **Salir**: Volver, Guardar.

Tamaños: todo botón de la barra mide al menos `--tap` de alto (hoy `.chip-tema` mide 40 px); el `chip-tema` y el `btn chico` de la barra quedan al mismo alto para que la fila se alinee. Espacios y radios con `--sp-*`/`--r*`, sin `px` nuevos salvo el filete.

## Fuera de alcance

Íconos de las acciones y curvar al toque (ronda 2). Cambiar `pantallaAptaParaEditar`. Tocar el visor o la miniatura más allá de que usan la geometría nueva.

## Criterios de aceptación

- `npm run test:q` en verde, con `geometriaCancha.test.js` nuevo.
- A 1280×800 y 1024×768: cancha y panel en fila, la cancha (media y entera) entra completa sin scroll vertical y ningún trazo de línea sale del rectángulo.
- A 768×1024: panel debajo de la cancha, sin scroll horizontal.
- En paso 2 o más, los tres botones de Agregar están deshabilitados y se lee la ayuda; en paso 1 funcionan.
- Todo lo tocable de la barra mide ≥ `--tap`.
