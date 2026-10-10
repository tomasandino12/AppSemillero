# Guía de primer uso — plan

> Ejecutar en la sesión, sin subagentes (CLAUDE.md). Una task = un commit. Antes de cada commit: `npm run test:q`. Después: `graphify update .`.

**Objetivo:** la primera vez que alguien entra a un modo, ve una intro de 2 o 3 pasos en una hoja. Las pantallas difíciles muestran una pista una sola vez, y "Ver la guía" en Mi perfil la reabre.

**Spec:** `docs/superpowers/specs/2026-10-10-guia-primer-uso-design.md` (los textos de los pasos están ahí).

**Rama:** `feat/guia-primer-uso`.

## Restricciones globales

- Lo que se puede testear en node va en `src/data/guias.js`, que es puro: sin DOM ni storage (`tests/arquitectura.test.js`).
- El almacén va en `src/ui/guiaVista.js` y copia el patrón de `src/ui/borradorMedicion.js`: almacén inyectable, try/catch en todo y la clave con el usuario.
- HTML nuevo con `html\`...\`` de `ui/html.js`; `$` de `ui/dom.js`. La hoja se abre con `abrirHoja` y no se toca `history` a mano.
- Como máximo 3 pasos por guía. Texto en voseo. Sin animaciones salvo un fundido de `--dur-1` como mucho.
- Cerrar de cualquier forma cuenta como vista.

## Estado

| Task | Estado |
|---|---|
| 1. Lógica pura y almacén | hecha |
| 2. Componente de la guía | pendiente |
| 3. Mostrarla al entrar y "Ver la guía" | pendiente |
| 4. Pistas de una vez y DESIGN.md | pendiente |
| 5. Prueba en el navegador por rol | pendiente |

---

### Task 1: lógica pura y almacén

**Archivos:** crear `src/data/guias.js`, `src/ui/guiaVista.js`, `tests/guias.test.js` y `tests/guiaVista.test.js`.

**Qué produce:**
- `GUIAS`: objeto con `{ entrenar, coordinar, jugar }` (los modos de `sesion.js`). Cada guía tiene `{ version: entero, pasos: [{ pestana, titulo, texto }] }`. `pestana` es el id de una pestaña (`'p-medir'`). `ICONOS` es privado de `chrome.js`, así que la UI busca el ícono en `TABS`, `TABS_COORDINACION` o `TABS_JUGADOR`, que ya se exportan.
- `pasosDeGuia(guiaId, roles)`: los pasos de esa guía. En `entrenar` con `roles.esCoordinador` suma al último paso la frase del cambio de modo. Con una guía desconocida devuelve `[]`.
- `estadoDePaso(indice, total)`: devuelve `{ contador: '2 de 3', hayAnterior, textoSiguiente: 'Siguiente' | 'Empezar' }`.
- `PISTAS`: `{ medir: texto, 'jugada-editor': texto }`.
- `guiaVista.js`: `claveGuia(usuarioId, id)` (`guia.v1.<usuario|sin-cuenta>.<id>`), `yaVista(clave, version, almacen?)` y `marcarVista(clave, version, almacen?)`. Las pistas usan las mismas funciones con `version` 1.

**Criterio:** `yaVista` da verdadero sólo si lo guardado tiene una versión mayor o igual a la pedida. Un JSON roto o un almacén que tira da falso sin romper nada.

**Tests:**
- `guias.test.js`: `cada guía tiene entre 1 y 3 pasos`, `cada paso apunta a una pestaña de su modo`, `la línea de cambio de modo sólo aparece si coordina`, `una guía desconocida no tiene pasos`, `el último paso dice Empezar y el primero no tiene Anterior`. El test de pestañas lee los `id: 'p-…'` de `src/ui/chrome.js` como texto, porque `chrome.js` no se puede importar en node.
- `guiaVista.test.js`: `sin registro no está vista`, `misma versión está vista`, `subir la versión la vuelve a mostrar`, `JSON roto no está vista`, `almacén que tira no rompe`, `cada usuario tiene su clave`.

**Commit:** `feat(guia): pasos por modo y registro local de guía vista`

### Task 2: componente de la guía

**Archivos:** crear `src/ui/componentes/guia.js` y modificar `public/css/componentes.css`.

**Qué produce:** `abrirGuia({ guiaId, roles, usuarioId })`. Abre la hoja con el título del paso, el ícono, el texto, el contador (`aria-live="polite"`), y los botones Anterior, Siguiente/Empezar y Saltar. Cambia de paso re-renderizando el cuerpo de la hoja, sin abrirla de nuevo. Pasa el foco al título y toma las flechas ← → mientras está abierta. Se marca como vista en `alCerrar`, así cuentan el velo, Escape y Atrás. Saltar y Empezar llaman a `cerrarHoja()`.

**Criterio:** cerrar la hoja con cualquiera de los mecanismos deja `yaVista` en verdadero. El listener de teclado se saca al cerrar. Los estilos sólo usan tokens (`tests/estilosTokens.test.js`). A 320px los tres botones entran sin cortarse.

**Tests:** la lógica ya está cubierta en la Task 1. Agregar `abrir y cerrar la guía no deja listeners de teclado colgados` sólo si se puede sin DOM; si no, se verifica en el navegador (Task 5). Tiene que seguir pasando `estilosTokens`.

**Commit:** `feat(guia): hoja de la guía con pasos, Saltar y teclado`

### Task 3: mostrarla al entrar y "Ver la guía"

**Archivos:** modificar `src/ui/main.js` (después de `ir(pantallaInicialDelModo())` en `entrarConSesion`, `entrarComoJugador` y `cambiarModo`) y `src/ui/pantallas/miPerfil.js` (un botón `btn sec` "Ver la guía" arriba de "Cerrar sesión").

**Qué produce:** `abrirGuiaSiFalta()` en `main.js`. Toma `obtenerModo()`, que ya coincide con el id de la guía, y abre la guía sólo si `!hojaAbierta()` y `!yaVista(...)`. Mi perfil llama a `abrirGuia` del modo actual sin mirar si ya se vio.

**Criterio:** una cuenta nueva ve la intro una vez. Al recargar no aparece. Quien tiene los dos roles ve la intro de coordinar la primera vez que cambia de modo. Con la solicitud de jugador abierta, la guía no se abre encima. `tests/navegacionInvariante.test.js` sigue pasando.

**Tests:** extraer la decisión a una función pura `guiaParaAbrir({ modo, hojaAbierta, vista })` en `guias.js` y testearla: `el modo jugar abre la guía del jugador`, `no se abre sobre otra hoja`, `ya vista no se abre`.

**Commit:** `feat(guia): la intro se abre al entrar a cada modo y se repite desde Mi perfil`

### Task 4: pistas de una vez y DESIGN.md

**Archivos:** crear `src/ui/componentes/pista.js`; modificar `src/ui/pantallas/medir.js`, `src/ui/pantallas/jugadaEditor.js`, `public/css/componentes.css` y `DESIGN.md`.

**Qué produce:** `pistaUnaVez(pistaId, usuarioId)`. Devuelve el HTML (`html`) de un aviso con el texto de `PISTAS[pistaId]` y un botón "Entendido", o vacío si ya se vio. Además está `conectarPista(pistaId, usuarioId)`, que al tocar "Entendido" marca la pista y saca el aviso. En el editor de jugadas, la pista no puede tapar la cancha: va arriba de las herramientas.

**Criterio:** la pista aparece una vez por usuario y no se repite al volver a la pantalla. DESIGN.md suma un apartado "Guía y pistas" (cuándo usar cada una y el tope de 3 pasos) y un punto del checklist de pantalla nueva: "¿Necesita una pista? Sólo si no se entiende sin ella."

**Tests:** `cada pista tiene texto y no pasa de 160 caracteres` en `guias.test.js`.

**Commit:** `feat(guia): pistas de una vez en Medir y el editor de jugadas`

### Task 5: prueba en el navegador por rol

**Sin código, salvo arreglos.** Con un usuario de prueba de cada rol (profe, coordinador, los dos roles a la vez, jugador), recorrer:
1. La intro aparece al entrar y no al recargar.
2. Anterior y Siguiente funcionan, y en el último paso dice Empezar.
3. Atrás del sistema la cierra y no sale de la app.
4. "Ver la guía" la reabre.
5. A 320px y en oscuro se ve bien.
6. Las dos pistas aparecen una sola vez.

Lo que se rompa se arregla en commits `fix(guia): …`. Al final, actualizar la tabla Estado y la memoria del proyecto.

**Criterio:** los 6 puntos verificados en los 4 roles, con capturas de pantalla.
