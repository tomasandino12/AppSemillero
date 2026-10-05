# Revisión UX/UI — 2026-10-04

Solo lectura: no se tocó código. Método: `DESIGN.md` + `CLAUDE.md`, reglas de `ui-ux-pro-max` (`--domain ux`, `pro-rules.md`), medición en el navegador integrado y lectura de `src/ui/**` y `public/css/**`.

**Alcance real (importante).** Las pantallas internas exigen login contra el Supabase real y no hay credenciales de prueba, así que **no las recorrí en vivo**. Lo medido en vivo: la landing (375 y 1280 px, sin scroll horizontal, `lang="es-AR"`, viewport correcto) y los componentes de la app, inyectando su marcado real en la página con el CSS cargado (tamaños y colores calculados). Todo lo demás sale de código: donde dice "código", falta confirmarlo con la app logueada. Tablet/desktop internos y modo oscuro no se vieron (la app interna es solo clara por diseño). `prefers-reduced-motion` está cubierto por una regla global en `base.css:56`; no lo emulé.

## 1. Top 10 (impacto / esfuerzo)

**1. Yo-Yo: "Terminar test" pegado a "Deshacer", sin confirmar** — `medirYoyo.js:160-167,224`. En plena prueba, el pulgar toca jugadores y *Deshacer* todo el rato; *Terminar* queda al lado (mitad del ancho cada uno, 8 px de separación) y corta la prueba de un toque. No se puede retomar ("los pitidos no se pueden retomar a mitad"). Salir por la cabecera o una pestaña también la mata sin aviso (`renderYoyo` la cancela). Regla: skill *Confirmation Dialogs*. Arreglo: hoja de confirmación en *Terminar* ("Quedan N en carrera") y avisar al salir. **S**

**2. Borrados de un toque, sin confirmar ni deshacer** — ✕ de nota y de variación (`ejercicio.js:175,282`), ✕ de medición corporal (`fichaJugador.js:652`) y *Descartar* una sesión sin terminar (`medir.js:99`, tira una batería entera cargada). En cambio ejercicio, jugada, inventario, sacar del plantel y baja de profes sí confirman: es inconsistente. Arreglo: toast con *Deshacer* para las ✕ (reversibles) y hoja para *Descartar*. **S** por sitio

**3. "Mandar un recurso": 141×16 px, seis veces en HOY** — `.btn-zona-recurso` (`componentes.css:521`, `padding:0`, sin `min-height`). Medido: 16 px de alto contra los 44 de `--tap`. Es la acción de cada zona y está en el borde inferior de cada tarjeta. Viola `DESIGN.md` checklist 5 y la regla *Touch Target Size*. Arreglo: `min-height:var(--tap)` + padding horizontal. **S**

**4. Los controles casi no se ven a pleno sol** — borde `--linea` sobre blanco = **1,38:1**, sobre papel **1,22:1** (pide 3:1 para límites de control). Afecta `.campo input` y, peor, `.tira .num` (los botones 0–10 de la batería son papel sobre papel, solo un hilo de borde), `.paso` y `.chip-tema`. Arreglo: un token `--borde-control` (= `--gris-cl`, 4,5:1) usado en esos selectores. **S**

**5. "Guardando…" es ilegible** — `.btn:disabled` = blanco sobre `#C9C5BE`: **1,72:1** (medido, 19 px bold). Ese es justo el estado de feedback de guardado ("Guardando…", "Agregando…") en batería, Yo-Yo, ficha y más. Arreglo: deshabilitado en `--fondo-chip` con texto `--gris-cl`, o `--gris-cl` con texto blanco. **S**

**6. El botón Atrás del sistema no hace nada dentro de la app** — `grep` de `pushState|popstate|history.` en `src/ui` = 0 resultados; `main.js` maneja su propia pila. En Android el gesto/botón Atrás saca al usuario de la app (o de la sesión de medición) en vez de volver; tampoco cierra la hoja. Regla: skill *Predictable back*. Arreglo: `pushState` en `ir({push})` y `abrirHoja`, `popstate` → `volver()`/`cerrarHoja()`. **M** (confirmar en un celu real: depende de si se usa instalada o en Chrome)

**7. Más áreas táctiles por debajo de 44** — medido: `.paso` (tira de jugadores de la batería) 38×38, `.chip-tema` 40, ✕ de medición 36×40, ✕ de nota 40×40; en la landing los links legales miden 127×15 y 140×15. Arreglo: `min-height/width:var(--tap)` (el ícono puede seguir chico). **S**

**8. Texto de 10 y 11,5 px** — `--fs-100` (10 px) rotula el club en la cabecera; `--fs-115` (11,5 px) se usa en 43 reglas: `.campo label`, `.det` de cada fila, ayudas, encabezados de tablas de medidas. La skill marca <12 px como anti-patrón; con el sol y una mano pesa. Arreglo: piso de 12 px en el token y revisar que la cabecera y la tabla de 6 columnas no desborden. **S** (+ verificar a 375 px)

**9. Errores de formulario: una frase suelta, sin foco ni anuncio** — hay 80 avisos `class="al"` armados a mano en `src/ui` y **ninguno** con `role="alert"` (solo los de ingreso, en `index.html`, y el de `yoyo-idas`). En ficha (`fichaJugador.js:684`) las frases de varios campos se juntan en un bloque debajo del form, sin marcar el campo ni `aria-describedby`; y un error luce igual que un aviso informativo (mismo filete del club). Arreglo: helper en `errores.js` que ponga `role="alert"`, haga scroll al aviso y marque `aria-invalid`. **M**

**10. El rojo del club está cableado en JS** — `#D9122E` / `#131316` en 18 lugares de 9 archivos (`graficos.js`, `datos.js`, `hoy.js:345`, `fichaJugador.js`, `coordPanorama.js`, `jugProgreso.js`…). Rompe el principio 1 de `DESIGN.md` (multi-club) y `estilosTokens.test.js` no lo ve porque solo escanea CSS. Hoy no se nota (todos son rojos). Arreglo: una función que lea `--primario`/`--tinta` con `getComputedStyle` en `graficos.js`, y que el test escanee también el JS. **M**

## 2. Patrones repetidos (arreglar en un lugar)

- **Hoja de confirmación copiada a mano** (ejercicio, jugada, inventario, sacar del plantel, aprobarJugador, coordProfes ×3): extraer `confirmarEnHoja({titulo, texto, accion})`. Resuelve de paso 1 y 2.
- **Aviso de error inline sin `role`** (80 casos): un helper en `errores.js` (hallazgo 9).
- **Controles con borde `--linea` sobre papel**: un token (hallazgo 4).
- **Botones de texto o ✕ sin `--tap`**: `.btn-zona-recurso`, `.paso`, `.chip-tema`, `.borrar`, `.nota-borrar`. Una regla común `.toque{min-height:var(--tap);min-width:var(--tap)}` o un test que recorra `button` en CSS.
- **Estado de carga**: 26 textos "Cargando…" con tres puntos y 6 con "…", sin `role="status"`; DESIGN.md ya admite que falta un componente.
- **Gráficos SVG sin nombre accesible** (`graficos.js`: ni `role="img"` ni `aria-label`). Un cambio en la función los cubre a todos.

## 3. Quick wins (< 30 min)

1. `min-height:var(--tap)` en `.btn-zona-recurso`.
2. Borde de `.campo input/select` y `.tira .num` con `--gris-cl`.
3. Estilo de `.btn:disabled` legible (≥ 4,5:1).
4. `confirm` en *Descartar* de `medir.js:99`.
5. `role="alert"` en los avisos de error de batería, Yo-Yo y ficha.
6. `padding` vertical en `.pie-legal a` para llegar a 44 px.
7. `aria-hidden="true"` en los glifos `.ic` de `medir.js` ("%", "↑", "→", "⟷") junto a su texto.
8. `role="img"` + `aria-label` en los SVG de `graficos.js`.
9. "Buen día" fijo en HOY (`hoy.js:139`): elegir saludo por hora.
10. Unificar "Cargando…" (un solo carácter de puntos suspensivos).

## 4. Qué está bien (no romper)

- **Batería de tiro**: números de 48 px en grilla de 6, borrador persistido en *cada* toque, `sesionId` reutilizado para reintentar sin duplicar, tocar de nuevo el número lo borra, mensaje de "sin conexión" que dice que quedó en el celular.
- **`NULL` ≠ 0**: "sin medir", "—" e itálica gris en todas las vistas; nada de barras vacías engañosas.
- **Base de accesibilidad**: `:focus-visible` global de 2 px, `prefers-reduced-motion` global, safe-areas en nav/hoja/toast, hoja con `role="dialog" aria-modal`, toast con `role="status"`, campos de ingreso con `autocomplete`/`inputmode`/`enterkeyhint` y 16 px (iOS no hace zoom).
- **Navegación en el chrome**: volver, inicio, modo y perfil siempre en el mismo lugar, hueco reservado para la flecha; jugador y coordinador con 3–4 pestañas.
- **Yo-Yo**: `wakeLock` para que no se apague la pantalla, y confirmaciones de borrado con el verbo en el botón ("Borrar de todos modos").

## 5. Dudas para el dueño

1. **¿Se usa instalada (PWA) o en Chrome?** Define cómo encarar el Atrás del sistema (hallazgo 6).
2. **Seis pestañas en modo entrenar** (HOY, PLANTEL, MEDIR, FÍSICO, RECURSOS, DATOS): la skill recomienda ≤5 y cada una mide ~57 px con letra de 11,5 px. ¿Se puede fusionar alguna?
3. **Nombres completos de menores en pantalla**: Yo-Yo, sprint y "Ver quiénes" de HOY listan a todos con nombre completo, a la vista de otros. ¿Iniciales + número de camiseta en las pantallas de cancha? (La tira de la batería ya usa iniciales.)
4. **"Mandar un recurso" ×6 en HOY** lleva a RECURSOS sin llevar la zona. ¿Dejar un solo botón, o pasar la zona como filtro?
5. **Borrar**: ¿"Deshacer" en un toast o confirmación en hoja? Para notas y mediciones sugiero deshacer; para descartar sesiones, hoja.
6. **Piso tipográfico de 12 px**: cambia la densidad de tablas y la cabecera; ¿se acepta?
7. **Fecha de la batería**: el salto deja elegirla y la batería no (`medirBateria.js:215`). Si se mide un día y se carga al otro, ¿hace falta?
