# Editor de jugadas, ronda 2: interacción de las acciones — plan

> Ejecutar en la sesión, task por task, sin subagentes (CLAUDE.md). Cada task es un commit. Pasos con checkbox (`- [ ]`).

**Objetivo:** que cada botón de acción muestre su trazo tal como se ve en la cancha, y que una acción recién creada quede seleccionada con el asa lista para curvarla sin cambiar de herramienta.

**Arquitectura:** `pizarra.js` separa en una función interna el armado del SVG de un trazo (path + flecha + T), que usan la cancha y el ícono nuevo `iconoDeAccion(tipo)`; el estilo sigue viviendo sólo en `.pz-trazo-*`. La curva al toque es estado de pantalla en `jugadaEditor.js`.

**Stack:** JS vanilla con módulos ES, SVG como string, `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-21-jugadas-editor-acciones-design.md`.

**Requisito previo:** la ronda 1 (`docs/superpowers/plans/2026-09-21-jugadas-editor-cancha-layout.md`) mergeada: esta ronda usa `W`/`altoDe` de `src/data/geometriaCancha.js` y la barra con `puedeAgregar` y los cuatro grupos.

## Restricciones globales

- Sin base de datos, sin migraciones, sin RLS.
- Colores sólo por clase; ningún `fill`/`stroke` con valor en el SVG. Punteados, grosores y formas de cada tipo **sólo** en `.pz-trazo-*` de `public/css/componentes.css`.
- HTML con `html\`...\``; el SVG del ícono entra con `crudo()` (es HTML propio).
- Refactor y feature en commits separados (task 1 es refactor puro).
- No se agrega botón de "Borrar" (Supr/Backspace ya lo hace).
- Antes de cada commit: `npm run test:q` en verde; después: `graphify update .`.
- Verificación visual con `preview_start {name: "app"}`; si no se puede entrar al editor, decirlo en vez de darlo por verificado.

## Mapa de archivos

| Archivo | Qué cambia |
|---|---|
| `src/ui/componentes/pizarra.js` | Función interna del trazo compartida; `iconoDeAccion(tipo)` exportada |
| `tests/pizarra.test.js` (nuevo) | El ícono usa las clases reales y no trae trazo de toque |
| `src/ui/pantallas/jugadaEditorHerramientas.js` | Ícono antes del texto de cada acción |
| `public/css/componentes.css` (sección `.pz*`) | `.pz-icono` (tamaño) y el color del trazo en el botón activo |
| `src/ui/pantallas/jugadaEditor.js` | `completarAccion` selecciona; el asa se arrastra con cualquier herramienta |

---

### Task 1: refactor — un solo lugar arma el SVG de un trazo

**Archivos:** modificar `src/ui/componentes/pizarra.js` (`dibujarT`, `dibujarTrazo`, ~105–133).

**Produce (para la task 2):** una función interna, no exportada, `svgDeTrazo({ tipo, desde, hasta, control }, alto, idFlecha, extra = '')` que devuelve el `<path class="pz-trazo pz-trazo-<tipo>">` (con `marker-end="url(#<idFlecha>)"` sólo en corte) y, en cortina, la `<line>` de la T. `desde`/`hasta`/`control` en 0–1; `extra` es el atributo que la cancha agrega a cada elemento (`data-accion-indice="…"`).

**Pasos:**
- [ ] Extraer de `dibujarTrazo` la parte que no depende de la jugada a `svgDeTrazo`. `dibujarTrazo` queda en resolver `desde`/`hasta` (ficha, receptor o aro), llamar a `svgDeTrazo` con `pz-flecha-${uid}` y sumar el `<path class="pz-trazo-toque">`. `dibujarT` pasa a recibir el `extra` en vez de `idx` (mismo contenido).
- [ ] Comentario de una línea en `svgDeTrazo`: la usan la cancha y el ícono de la barra, para que un tipo de acción se vea igual en los dos.
- [ ] `npm run test:q` en verde.
- [ ] Navegador: una jugada con los seis tipos de acción se ve igual que antes en el visor y en el editor (comparar con captura previa al cambio).
- [ ] Commit: `refactor(jugadas): el SVG de un trazo se arma en un solo lugar`.

**Aceptación:** sin cambio visible; el `innerHTML` de la pizarra de una jugada de ejemplo es idéntico antes y después (se puede comparar por `javascript_tool`).

---

### Task 2: mini-ícono por tipo de acción

**Archivos:** crear `tests/pizarra.test.js`; modificar `src/ui/componentes/pizarra.js`, `src/ui/pantallas/jugadaEditorHerramientas.js`, `public/css/componentes.css`.

**Consume:** `svgDeTrazo` (task 1), `W`/`altoDe` de `geometriaCancha.js`, `TIPOS_ACCION` de `src/data/jugadas.js`.

**Produce:** `export function iconoDeAccion(tipo)` → string `<svg class="pz pz-icono" viewBox="…" aria-hidden="true" focusable="false">` con `<defs>` (marcador `pz-flecha-icono-<tipo>`, misma forma que el de la cancha: reusar `defs()` con un parámetro de id en vez de copiarlo) y el trazo de `svgDeTrazo`.

**Pasos:**
- [ ] Escribir `tests/pizarra.test.js` (`node:test` + `assert/strict`; importa `pizarra.js` directo, que no toca DOM al cargarse):
  - `iconoDeAccion usa las clases del trazo real`: para cada tipo de `TIPOS_ACCION`, contiene `pz-trazo-<tipo>` y `class="pz pz-icono"`.
  - `el corte lleva flecha y la cortina su T`: el de corte contiene `marker-end="url(#pz-flecha-icono-corte)"` y su `<marker id="pz-flecha-icono-corte"`; el de cortina tiene dos elementos con `pz-trazo-cortina`; ningún otro tipo tiene `marker-end`.
  - `el dribbling es zigzag`: el `d` del ícono de dribbling tiene al menos 4 comandos `L`; el de pase tiene exactamente uno.
  - `el ícono no trae trazo de toque`: ningún ícono contiene `pz-trazo-toque` ni `data-accion-indice`.
  - `todos los íconos comparten el viewBox`: el atributo `viewBox` es el mismo para los seis.
- [ ] `node --test tests/pizarra.test.js` → falla (`iconoDeAccion` no existe).
- [ ] Implementar `iconoDeAccion`: trazo horizontal en coordenadas de cancha `media`, `desde = {x: 0.44, y: 0.5}`, `hasta = {x: 0.56, y: 0.5}`, sin control. `viewBox` que encierre ese segmento en px (`0.44·W … 0.56·W`, ≈36 de ancho) con margen para la punta de la flecha a la derecha y alto suficiente para la T de la cortina (±9 px): del orden de `"128 128 44 22"` — calcularlo en el código desde `W`, `altoDe('media')` y el largo de la T, no escribirlo a mano. Sacar el largo de la T (`9`) a una constante compartida con `dibujarT`.
- [ ] `node --test tests/pizarra.test.js` → pasa.
- [ ] Plantilla: en `barraDeHerramientasHtml`, cada botón de acción queda `${crudo(iconoDeAccion(t))}${ETIQUETA_ACCION[t]}`; importar `crudo` de `../html.js` e `iconoDeAccion` de `../componentes/pizarra.js`. "Seleccionar" sin ícono.
- [ ] CSS, en la sección `.pz*`: `.pz-icono` con `width`/`height` iguales al `viewBox` (escala 1:1: expresarlo en `rem` equivalente, ej. 44×22 px → `2.75rem`×`1.375rem`), `display:inline-block`, `vertical-align:middle`, `margin-right:var(--sp-1)`, `overflow:visible`, `flex:none`. Botón activo: `.chip-tema.on .pz-trazo{stroke:var(--sobre-club)}` y `.chip-tema.on .pz-flecha{fill:var(--sobre-club)}`, con un comentario de por qué (el gris no se lee sobre `--primario`). Si `.chip-tema` no alinea ícono y texto, sumarle `display:inline-flex;align-items:center` sólo dentro de `.jed-herramientas`.
- [ ] `npm run test:q` en verde (incluye `estilosTokens`).
- [ ] Navegador: comparar cada ícono con el trazo del mismo tipo dibujado en la cancha (mismo punteado, zigzag, flecha, T); ver el botón activo y los botones deshabilitados (0 pasos). A 768×1024 la barra no se desarma.
- [ ] Commit: `feat(jugadas): ícono de cada acción en la barra del editor`.

**Aceptación:** los 5 tests nuevos pasan; ningún punteado ni grosor nuevo en el CSS fuera de `.pz-trazo-*`.

---

### Task 3: curva al toque, sin cambiar de herramienta

**Archivos:** modificar `src/ui/pantallas/jugadaEditor.js` (`completarAccion` ~213, `alPunteroBajar` ~219–265).

**Consume:** `puntoDeControl`, `asaDeControl` de `pizarra.js` (sin cambios); `pintarCancha` ya dibuja el asa con `seleccion.tipo === 'accion'`.

**Pasos:**
- [ ] `completarAccion(accion)`: si `aplicarCambio(...)` devuelve `true`, `seleccion = { tipo: 'accion', indice: datosActuales().pasos[pasoActual].acciones.length - 1 }` (`aplicarAccion` agrega al final); si devuelve `false`, `seleccion = null`. `origenAccion = null` y `render()` como hoy. Comentario de una línea: la acción queda seleccionada para curvarla en el mismo gesto.
- [ ] `alPunteroBajar`: subir el bloque "`evento.target.closest('.pz-asa') && seleccion?.tipo === 'accion'` → `setPointerCapture` + `arrastre = { tipo: 'control', datosBase: datos }` + `return`" al principio, antes de `if (herramienta === 'seleccionar')`, y sacarlo de adentro de esa rama.
- [ ] En la rama de herramientas de acción, cuando `!origenAccion`: limpiar `seleccion = null` antes de decidir. Si no hay ficha: toast de siempre y `render()` (para que el asa desaparezca; hoy no re-renderiza). Si hay ficha: flujo de hoy (tiro completa y queda seleccionado vía `completarAccion`; el resto marca origen y `render()`).
- [ ] Revisar que `alPunteroMover` con `arrastre.tipo === 'control'` sigue usando `seleccion.indice` (no cambia) y que `alPunteroSoltar` empuja un solo estado al historial.
- [ ] `npm run test:q` en verde (no hay test de UI del editor; esta lógica no pasa de ~10 líneas y no justifica módulo puro, según el spec).
- [ ] Navegador, con un paso creado:
  - Corte: ficha → destino → el asa aparece; arrastrarla curva el corte; tocar otra ficha → resalto de origen y el asa anterior se va; destino → corte nuevo con su asa. Cinco cortes seguidos sin tocar la barra.
  - Pase: el asa aparece al tocar al receptor. Tiro: al primer toque.
  - Tocar el vacío con Corte activo y el asa visible → toast y el asa se va.
  - Supr después de crear → se borra; Ctrl+Z después de curvar → vuelve a recta; Ctrl+Z otra vez → la acción desaparece.
  - Con Seleccionar, tocar una línea y arrastrar el asa sigue andando como antes.
- [ ] Commit: `feat(jugadas): la acción recién creada queda lista para curvar`.

**Aceptación:** criterios 3–5 del spec.

---

## Cierre

- [ ] `npm run test:q` final y `graphify update .`.
- [ ] Recorrido completo a 1280×800 y 1024×768: armar una jugada de tres pasos usando sólo las herramientas de acción (sin volver a Seleccionar para curvar), ver animación, guardar.
- [ ] Review final de la rama (Opus) si las dos rondas se hicieron en una misma rama; después, sugerir `/clear`.
