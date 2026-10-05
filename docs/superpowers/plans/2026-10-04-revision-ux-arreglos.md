# Arreglos de la revisión UX — plan

> Ejecutar en la sesión (sin subagentes), una task por commit, `npm run test:q` antes de cada commit. Refactor y feature no se mezclan.

**Meta:** resolver los hallazgos de `docs/revision-ux-2026-10-04.md`, del más barato/impactante al más caro.
**Enfoque:** CSS y tokens primero (sin riesgo), después un helper de confirmación, después accesibilidad de errores y navegación. Sin dependencias nuevas.
**Spec:** `docs/revision-ux-2026-10-04.md` (hallazgos 1–10). Sistema de diseño: `DESIGN.md`.

## Restricciones globales
- Los colores y tamaños salen de `tokens.css`; nada de hex ni px sueltos en componentes (`tests/estilosTokens.test.js` lo exige).
- `--tap` = 44 px es el mínimo táctil. Sólo se agranda el área de toque; el ícono puede seguir chico.
- Texto de usuario con voseo rioplatense. HTML nuevo con `html\`\`` de `ui/html.js`.
- La UI no importa de `repos/` ni `cliente.js`. Los tests de UI son contratos sobre texto fuente (como `estilosTokens`): no hay navegador en `node --test`.
- **Verificación en navegador:** las pantallas internas piden login contra el Supabase real. Las verifica la persona dueña logueándose en el navegador integrado; Claude no teclea contraseñas ahí. Cada task dice qué mirar.

## Decisiones tomadas por defecto (cambiables)
- Borrar: **hoja de confirmación en todos los casos** (consistente con ejercicio, jugada, inventario). El "Deshacer" en toast queda para después si molesta.
- Piso tipográfico de 12 px: se incluye (Task 7), pero se corta ahí si desborda a 375 px.

---

### Task 1 — Contraste de controles y botón deshabilitado (hallazgos 4 y 5)
**Archivos:** `public/css/tokens.css`, `public/css/componentes.css` (`.campo input/select`, `.tira .num`, `.progreso-tira .paso`, `.chip-tema`, `.btn:disabled`), `tests/estilosTokens.test.js`.
**Hecho cuando:** existe `--borde-control` (≥ 3:1 sobre `--papel` y sobre blanco) usado en esos selectores; `.btn:disabled` tiene texto ≥ 4,5:1 sobre su fondo y se distingue de un botón activo (no sólo por color).
**Tests:** `el borde de los controles llega a 3:1 sobre papel y blanco`; `el botón deshabilitado llega a 4.5:1`.
**Mirar:** "Guardando…" en la batería; la grilla 0–10 a pleno brillo.

### Task 2 — Áreas táctiles a 44 px (hallazgos 3 y 7)
**Archivos:** `public/css/componentes.css` (`.btn-zona-recurso`, `.progreso-tira .paso`, `.chip-tema`, `.fila-corporal .borrar`, `.nota .nota-borrar`), `public/css/legal.css`/`publico.css` (`.pie-legal a`).
**Hecho cuando:** esos selectores tienen `min-height` y `min-width` ≥ `var(--tap)`; la grilla de la batería (6 columnas) sigue entrando a 375 px.
**Tests:** `los controles táctiles listados tienen al menos --tap` (lee el CSS, busca cada selector).
**Mirar:** HOY a 375 px (las seis zonas), tira de jugadores de la batería, pie legal.

### Task 3 — Helper `confirmarEnHoja` y Yo-Yo (hallazgo 1)
**Archivos:** nuevo `src/ui/componentes/confirmar.js` (sobre `abrirHoja`/`cerrarHoja` de `hoja.js`); `src/ui/pantallas/medirYoyo.js` (*Terminar test*, y salir de la pantalla con la prueba en curso).
**Contrato:** `confirmarEnHoja({ titulo, texto, verbo, alConfirmar })`; el botón de confirmar lleva el verbo ("Terminar"), Cancelar siempre visible, doble toque protegido (deshabilita al confirmar).
**Hecho cuando:** *Terminar* pide confirmación diciendo cuántos quedan en carrera; separar *Deshacer* de *Terminar* (no mitad y mitad pegados); salir con la prueba en curso avisa que no se puede retomar.
**Tests:** `medirYoyo confirma antes de terminar` (contrato de fuente: el handler de terminar pasa por `confirmarEnHoja`); `arquitectura.test.js` sigue verde.
**Mirar:** Yo-Yo completo con 2–3 jugadores: Terminar → Cancelar → sigue corriendo.

### Task 4 — Borrados con confirmación (hallazgo 2)
**Archivos:** `src/ui/pantallas/medir.js` (*Descartar*), `ejercicio.js` (✕ de nota y de variación), `fichaJugador.js` (✕ de medición corporal). Reusar `confirmarEnHoja`; migrar de paso `inventario.js:confirmarQuitar` sólo si el cambio es chico.
**Hecho cuando:** ningún borrado de datos cargados por el usuario ocurre de un toque. *Descartar* dice cuántas pruebas cargadas se pierden.
**Tests:** `ningún botón de borrar llama a borrar sin confirmar` (contrato: en cada archivo los handlers de `data-descartar`, `data-nota`, `data-borrar-variacion`, `data-borrar` pasan por `confirmarEnHoja`).
**Mirar:** descartar una sesión con borrador; borrar y cancelar una nota.

### Task 5 — Errores accesibles (hallazgo 9)
**Archivos:** `src/ui/errores.js` (helper `avisoInline(texto)` que devuelve el bloque `.al` con `role="alert"` y deja marcar un campo con `aria-invalid`), `tests/errores.test.js`; aplicarlo en `medirBateria.js`, `medirYoyo.js` y `fichaJugador.js`. El resto de los 80 avisos se migra al tocar cada pantalla.
**Hecho cuando:** el error de guardado en esas tres pantallas se anuncia, hace scroll al aviso y marca el campo; un error se distingue de un aviso informativo (variante en `.al`, definida en `DESIGN.md`).
**Tests:** `avisoInline escapa el texto y lleva role=alert`; `los avisos de error de batería, yoyo y ficha usan avisoInline`.

### Task 6 — Etiquetas accesibles en gráficos y glifos (quick wins 7 y 8)
**Archivos:** `src/ui/componentes/graficos.js` (`role="img"` + `aria-label` con resumen en texto), `src/ui/pantallas/medir.js` (`aria-hidden="true"` en los glifos `.ic`), `tests/graficos.test.js`.
**Hecho cuando:** cada SVG de `graficos.js` sale con `role="img"` y `aria-label` no vacío.
**Tests:** `todo gráfico lleva role=img y aria-label`.

### Task 7 — Piso tipográfico de 12 px (hallazgo 8)
**Archivos:** `public/css/tokens.css` (`--fs-100`, `--fs-115`), `public/css/componentes.css`/`layout.css` donde desborde.
**Hecho cuando:** ningún `--fs-*` baja de 0,75 rem; cabecera (club) y la tabla de 6 columnas de medidas no desbordan a 375 px.
**Tests:** `ningún tamaño de fuente del sistema baja de 12px`.
**Mirar:** cabecera y ficha de jugador a 375 px. Si desborda, ajustar el layout, no bajar el piso.

### Task 8 — Botón Atrás del sistema (hallazgo 6)
**Archivos:** `src/ui/main.js` (`ir`, `volver`, escuchar `popstate`), `src/ui/componentes/hoja.js` (la hoja abierta consume un Atrás), `tests/navegacionInvariante.test.js`.
**Hecho cuando:** `ir(..., {push:true})` y abrir una hoja apilan una entrada de historial; `popstate` ejecuta `volver()` o `cerrarHoja()`; en la pantalla inicial del modo, Atrás sale de la app normalmente. La pila interna (`pila`) sigue siendo la fuente de verdad.
**Tests:** extender `navegacionInvariante` con `ir con push apila historial` (con un `history` simulado).
**Mirar:** en celular real, instalada y en Chrome: Atrás desde una medición y desde una hoja. Riesgo medio: es la task más delicada, no mezclarla con otra.

### Task 9 — El color del club fuera del JS (hallazgo 10)
**Archivos:** `src/ui/componentes/graficos.js` (leer `--primario` y `--tinta` con `getComputedStyle` una vez por render), y los 8 archivos con `#D9122E`/`#131316` (`exportarJugada`, `tarjetasDePesos`, `coordPanorama`, `datos`, `datosFisico`, `fichaJugador`, `hoy`, `jugProgreso`); `tests/estilosTokens.test.js`.
**Hecho cuando:** `grep -ri "D9122E\|131316" src/` no da nada. Ojo: `exportarJugada` dibuja en canvas/imagen, donde el CSS no aplica; ahí se pasa el color leído como parámetro.
**Tests:** `no hay colores del club literales en src/ui` (escanea el JS, igual que ya escanea el CSS).

### Task 10 — Retoques chicos (quick wins 9 y 10)
**Archivos:** `src/ui/pantallas/hoy.js:139` (saludo según la hora: buen día / buenas tardes / buenas noches), unificar "Cargando…" (un solo carácter `…`) con un `role="status"` en el contenedor.
**Tests:** `el saludo cambia con la hora` (extraer la función a un módulo puro en `src/data/` con su test); `no queda "Cargando..." con tres puntos`.

---

## Fuera del plan (decide la persona dueña)
Pestañas de 6 en modo entrenar · nombres completos de menores en pantallas de cancha (Yo-Yo, sprint, "Ver quiénes") · un solo botón "Mandar un recurso" vs. uno por zona · fecha elegible en la batería. Si se decide algo de esto, va como plan aparte.

## Orden y cierre
1 → 2 → 3 → 4 → 5 → 6 → 10 → 7 → 9 → 8 (la 8, al final y sola). Tras cada commit: `graphify update .`. Al terminar todo: review final (único uso aceptable de un subagente) y actualizar `DESIGN.md` con `--borde-control`, el piso de fuente y la variante de error.
