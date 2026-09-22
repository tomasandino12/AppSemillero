# Editor de jugadas, ronda 1: cancha y layout — plan

> Ejecutar en la sesión, task por task, sin subagentes (CLAUDE.md). Cada task es un commit. Pasos con checkbox (`- [ ]`).

**Objetivo:** que la cancha respete las medidas FIBA (nada sale del rectángulo), que el editor use el ancho de la compu con la cancha y los pasos en fila, y que la barra de herramientas quede en cuatro grupos claros.

**Arquitectura:** las medidas pasan a un módulo puro nuevo (`src/data/geometriaCancha.js`), que usan `pizarra.js` (para dibujar) y `animacionJugada.js` (para el aro). El layout es sólo CSS: un modificador `.pant.ancha` y la fila del editor en `layout.css`, donde viven los cortes de ancho. La barra es plantilla (`jugadaEditorHerramientas.js`) más un parámetro nuevo que le pasa `jugadaEditor.js`.

**Stack:** JS vanilla con módulos ES, SVG armado como string, `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-21-jugadas-editor-cancha-layout-design.md` (leerlo antes de arrancar: tiene la tabla de medidas).

## Restricciones globales

- Sin base de datos, sin migraciones, sin RLS.
- `src/data/geometriaCancha.js` es puro: sin DOM, sin strings SVG, sin importar UI (lo verifica `tests/arquitectura.test.js`).
- Escala 20 px/m; `W = 300`; `ALTO = { media: 280, entera: 560 }`.
- Colores sólo por clase (`.pz-*`), nunca `fill`/`stroke` con valor en el SVG. Nada de imagen de fondo.
- Media queries de ancho sólo en `public/css/layout.css`, cortes en `40rem` y `64rem`. Espacios y radios con `--sp-*`/`--r*`; único `px` nuevo permitido: bordes/filetes de 1 px.
- Todo lo tocable ≥ `--tap`. HTML con `html\`...\``; textos con voseo.
- Antes de cada commit: `npm run test:q` en verde. Si falla, `node --test tests/<archivo>.test.js`.
- Después de cada commit: `graphify update .`.
- Verificación visual con `preview_start {name: "app"}` (esbuild en :5173). El editor pide sesión: si no hay forma de entrar, dejarlo dicho en el commit/resumen en vez de darlo por verificado.

## Mapa de archivos

| Archivo | Qué cambia |
|---|---|
| `src/data/geometriaCancha.js` (nuevo) | Medidas FIBA en metros, `W`, `ALTO`, `altoDe`, `AROS`, `formasDeUnExtremo(cancha)` |
| `tests/geometriaCancha.test.js` (nuevo) | Que nada salga de la cancha y que el aro sea uno solo |
| `src/data/animacionJugada.js` | `AROS` importado de la geometría y re-exportado |
| `src/ui/componentes/pizarra.js` | `mitadDeCancha`/`fondoDeCancha` dibujan desde la geometría; se borran `W`, `ALTO`, `altoDe` locales |
| `public/index.html` | `class="pant ancha"` en `#p-jugada-editor` |
| `public/css/layout.css` | `.pant.ancha` y la fila del editor a partir de 64rem |
| `public/css/componentes.css` (~674–686) | Grupos de la barra, rótulos, filete, alturas |
| `src/ui/pantallas/jugadaEditorHerramientas.js` | Cuatro grupos, `puedeAgregar` |
| `src/ui/pantallas/jugadaEditor.js` | Pasa `puedeAgregar` a la barra |
| `DESIGN.md` | Excepción `.pant.ancha` en el checklist |

---

### Task 1: geometría FIBA como módulo puro

**Archivos:** crear `src/data/geometriaCancha.js`, `tests/geometriaCancha.test.js`; modificar `src/data/animacionJugada.js`.

**Produce (lo usan las tasks 2 y la ronda 2):**
- `W` (número, 300), `ALTO` (`{ media: 280, entera: 560 }`), `altoDe(cancha)` (con `media` por defecto si viene algo desconocido, como hoy en pizarra).
- `AROS` (`{ media: {x:0.5, y:0.1125}, entera: {x:0.5, y:0.05625} }`), calculado desde las medidas, no escrito a mano.
- `formasDeUnExtremo()` → objeto en px del viewBox con la línea de fondo en `y = 0`:
  `zona {x, y, ancho, alto}`, `circuloLibres {cx, cy, r}`, `triple {rectaIzq:{x, y1, y2}, rectaDer:{x, y1, y2}, arco:{cx, cy, r, desde:{x,y}, hasta:{x,y}}}`, `aro {cx, cy, r}`, `tablero {x1, x2, y}`, y `circuloCentral {r}`.
  No depende de la cancha: un extremo mide lo mismo en media y en entera (el reflejo lo hace pizarra).

**Pasos:**
- [ ] Escribir `tests/geometriaCancha.test.js` con estos tests (estilo de `tests/animacionJugada.test.js`: `node:test` + `assert/strict`, un helper `cerca` con tolerancia):
  - `radio del triple + distancia lateral no pasa la mitad del ancho`: las rectas en `x ≥ 0` y `x ≤ W`, y `arco.cx ± arco.r` recortado por las rectas no pasa `[0, W]`; también que `aro.cy + arco.r ≤ ALTO.media` (la punta del arco no llega a la mitad de cancha).
  - `ninguna forma sale de la cancha` para `'media'` y `'entera'`: bounding box de zona, círculo de libres, rectas, arco (su punto más bajo, `aro.cy + r`), aro y tablero dentro de `[0, W] × [0, altoDe(c)]`; en `entera`, lo mismo reflejado (`y → alto - y`); en `media`, el semicírculo central (centro en `y = 280`) sólo se chequea en x.
  - `las rectas del triple tocan el arco`: la distancia de `(rectaIzq.x, rectaIzq.y2)` y de `(rectaDer.x, rectaDer.y2)` al centro del aro es `6,75 m × 20` ± 0,2 px, y coincide con `arco.desde`/`arco.hasta`.
  - `AROS coincide con el aro dibujado`: para las dos canchas, `AROS[c].y * altoDe(c)` ≈ `formasDeUnExtremo().aro.cy` y `AROS[c].x * W` ≈ `aro.cx`.
  - `altoDe cae en media con una cancha desconocida`.
- [ ] Correr `node --test tests/geometriaCancha.test.js` → falla porque el módulo no existe.
- [ ] Crear `geometriaCancha.js`: constantes en metros con nombre (`ANCHO_M = 15`, `MEDIA_M = 14`, `ARO_DESDE_FONDO_M = 1.575`, `RADIO_ARO_M = 0.225`, `TABLERO_DESDE_FONDO_M = 1.2`, `ANCHO_TABLERO_M = 1.8`, `ZONA_ANCHO_M = 4.9`, `ZONA_LARGO_M = 5.8`, `RADIO_LIBRES_M = 1.8`, `RADIO_TRIPLE_M = 6.75`, `TRIPLE_DESDE_LATERAL_M = 0.9`, `RADIO_CENTRAL_M = 1.8`) y `PX_POR_M = 20`. El corte recta/arco sale de Pitágoras (`y = aro + √(r² − dx²)`, con `dx = 7,5 − 0,9`). Comentario corto con el porqué (fuente FIBA, por qué 20 px/m).
- [ ] En `animacionJugada.js`: borrar la constante `AROS` local, `import { AROS } from './geometriaCancha.js'` y `export { AROS }` para que los tests y `pizarra.js` sigan importándolo de ahí.
- [ ] `npm run test:q` en verde (incluye `animacionJugada.test.js`, que compara contra `AROS.media` simbólicamente).
- [ ] Commit: `fix(jugadas): medidas FIBA de la cancha en un módulo puro`.

**Aceptación:** los 5 tests nuevos pasan; `AROS` ya no está escrito a mano en ningún lado.

---

### Task 2: la pizarra dibuja desde la geometría

**Archivos:** modificar `src/ui/componentes/pizarra.js`.

**Consume:** `W`, `altoDe`, `formasDeUnExtremo` de la task 1.

**Pasos:**
- [ ] Borrar `W`, `ALTO` y `altoDe` locales; importarlos de `../../data/geometriaCancha.js` (las funciones exportadas de pizarra que los usan —`puntoDesdeEvento`, `fichaEnPunto`, `resaltoDeFicha`, `asaDeControl`— no cambian de firma).
- [ ] Reescribir `mitadDeCancha()` sin parámetro de alto: arma, con los números de `formasDeUnExtremo()`, el `rect` de la zona, el `circle` de libres, un solo `path` para el triple (`M rectaIzq.x 0 L rectaIzq.x y2 A r r 0 0 0 rectaDer.x y2 L rectaDer.x 0`; de izquierda a derecha pasando por abajo es `large-arc 0, sweep 0`: el arco cubre menos de 180° porque los extremos quedan debajo del centro del aro), el `circle` del aro y la `line` del tablero. Mismas clases de hoy (`pz-linea`, `pz-aro`, `pz-tablero`).
- [ ] `fondoDeCancha()`: en `entera`, igual que hoy (extremo + reflejo con `translate(0,alto) scale(1,-1)` + línea y círculo central de radio `circuloCentral.r`). En `media`, agregar el semicírculo central: un `path` de arco con centro en `(W/2, alto)` que sube hacia adentro.
- [ ] `npm run test:q` en verde.
- [ ] Verificar en el navegador (`preview_start {name:"app"}`): una jugada de media cancha y una de cancha entera en la biblioteca (miniatura), en el visor y en el editor. El triple entra entero, las rectas laterales se ven, el tiro de la animación termina en el aro.
- [ ] Commit: `fix(jugadas): la pizarra dibuja la cancha con las medidas FIBA`.

**Aceptación:** ninguna línea de la cancha sale del rectángulo en media ni en entera; la miniatura sigue entrando en su `aspect-ratio:1/1` (la entera se ve más angosta, es esperado).

---

### Task 3: el editor usa el ancho y se pone en fila

**Archivos:** modificar `public/index.html` (línea ~353), `public/css/layout.css` (bloque `@media (min-width:64rem)`, cerca de `.cuerpo > .pant.on`, ~309), `public/css/componentes.css` (`.jed-cuerpo`, `.jed-cancha`, `.jed-panel`), `DESIGN.md` (checklist punto 5).

**Pasos:**
- [ ] `index.html`: `<section class="pant ancha" id="p-jugada-editor">`.
- [ ] `layout.css`, dentro del `@media (min-width:64rem)` y **después** de `.cuerpo > .pant.on{…}`: `.cuerpo > .pant.ancha.on{max-width:none}`. Comentario de una línea: por qué el editor rompe `--max-ancho` (lienzo, no formulario) y que la cabecera queda alineada a la columna de siempre a propósito.
- [ ] En el mismo bloque: `.jed-cuerpo` en `flex-direction:row` y `align-items:flex-start`; `.jed-cancha` con `flex:1` y el SVG centrado; `.jed-panel` con ancho fijo (`flex:0 0 18rem`). El SVG del editor topado por alto: `max-height: calc(100dvh - <cabecera> - <barra> - márgenes)`, `width:auto`, `max-width:100%`, `margin-inline:auto`. Medir cabecera y barra en el navegador y expresar la resta con tokens (`--tap`, `--sp-*`) en vez de px; si no cierra exacto, preferir quedarse corto (un poco de aire abajo) antes que generar scroll.
- [ ] `componentes.css`: actualizar el comentario de la sección `.jed` (hoy dice "cancha y panel de pasos abajo"); el `.jed-cuerpo` base sigue en columna (mobile-first).
- [ ] `DESIGN.md`, checklist punto 5: agregar que `.pant.ancha` es la única excepción a `--max-ancho`, sólo para pantallas-lienzo (hoy, el editor de jugadas).
- [ ] `npm run test:q` en verde (`estilosTokens.test.js` revisa que no haya colores literales ni `var()` inexistentes).
- [ ] Navegador con `resize_window`: 1280×800 y 1024×768 → fila, cancha media y entera completas sin scroll vertical; 768×1024 → panel debajo, sin scroll horizontal. Probar que arrastrar una ficha cae donde está el dedo/puntero en los tres tamaños (valida `puntoDesdeEvento` con las franjas). Volver a `preset: desktop` al terminar.
- [ ] Commit: `fix(jugadas): editor en fila y a todo el ancho en compu`.

**Aceptación:** los tres tamaños de arriba se ven como dice el spec; las demás pantallas siguen topadas en `--max-ancho` (mirar una, ej. INICIO, a 1280).

---

### Task 4: barra de herramientas en cuatro grupos

**Archivos:** modificar `src/ui/pantallas/jugadaEditorHerramientas.js`, `src/ui/pantallas/jugadaEditor.js` (`render()`, ~115), `public/css/componentes.css` (`.jed-herramientas`, `.jed-grupo`, `.jed-grupo-fin`).

**Produce (lo usa la ronda 2):** `barraDeHerramientasHtml({ herramienta, puedeDeshacer, puedeRehacer, hayPasos, puedeAgregar })`. Los botones conservan `data-herramienta`, `data-agregar` y los ids `btn-jed-*` de hoy: el cableado de `jugadaEditor.js` no cambia.

**Pasos:**
- [ ] Plantilla: cuatro `<div class="jed-grupo" role="group" aria-label="…">`, cada uno con un rótulo `<span class="jed-grupo-titulo">` visible (`Herramientas`, `Agregar`, `Historial`, `Salir`) y sus botones dentro de un contenedor `.jed-grupo-botones`. Orden y contenido según el spec §3.
- [ ] Grupo Agregar: con `puedeAgregar === false`, los tres botones llevan `disabled` y `title="Las fichas se suman en la formación inicial (paso 1)."`, y el grupo suma `<div class="ayuda">` con el mismo texto (constante única en el archivo, no dos strings).
- [ ] `jugadaEditor.js` `render()`: pasar `puedeAgregar: pasoActual === 0`. La guarda de `agregarNuevaFicha` se deja tal cual.
- [ ] CSS: `.jed-herramientas` con `justify-content:center`, `flex-wrap:wrap`, gap `--sp-4`; `.jed-grupo` en columna (rótulo arriba, botones abajo) con `flex:0 0 auto` para que baje entero al renglón siguiente; filete entre grupos con `border-left:1px solid var(--linea)` y `padding-left:--sp-4` (el primero sin filete, vía `:first-child`); `.jed-grupo-titulo` con `--ff-titulo`, `--fs-115`, mayúsculas, `--gris-cl`; `.jed-herramientas .chip-tema, .jed-herramientas .btn.chico{min-height:var(--tap)}` para que la fila se alinee; borrar `.jed-grupo-fin` (el `margin-left:auto` descentraba la barra) de la plantilla y del CSS.
- [ ] `npm run test:q` en verde.
- [ ] Navegador: 1280×800 y 768×1024. Paso 1 → Agregar habilitado y funciona; pasar a paso 2 → deshabilitado, se ve la ayuda, el `title` aparece al pasar el mouse; tocar no hace nada (ni toast). Con 0 pasos las acciones siguen deshabilitadas como hoy. Medir con `javascript_tool` que todos los botones de `.jed-herramientas` tengan `offsetHeight ≥ 44`.
- [ ] Commit: `fix(jugadas): barra del editor en cuatro grupos y Agregar sólo en el paso 1`.

**Aceptación:** criterios 4 y 5 del spec; la barra se ve centrada y sin botones de alturas distintas.

---

## Cierre

- [ ] `npm run test:q` final y `graphify update .`.
- [ ] Recorrido completo a 1280×800: crear una jugada de cancha entera, sumar fichas, agregar dos pasos con acciones, ver animación, guardar, salir.
- [ ] Sugerir `/clear` antes de la ronda 2 (`docs/superpowers/plans/2026-09-21-jugadas-editor-acciones.md`).
