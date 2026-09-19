# CAMBIOS — v2 → v3

`documentos/prototipo_inferiores_v2.html` no se tocó: sigue byte a byte igual, se usó solo como
referencia de lectura. Todos los flujos, datos de ejemplo y copy en español son
idénticos a v2 — esto es una refactorización de calidad, no un rediseño.

## Correcciones de la auditoría

| # | Punto | Qué se hizo | Archivo / selector |
|---|-------|-------------|---------------------|
| **BLOQUEANTES** | | | |
| 1 | Zoom deshabilitado | `viewport` sin `maximum-scale` ni `user-scalable`; se agregó `viewport-fit=cover` (necesario para `env(safe-area-inset-*)`) | `index.html` `<head>` |
| 2 | `--gris-cl` ilegible sobre fondo claro | Token bajado de `#9C988F` a `#726E65` (4.50:1 sobre `--papel`). Los 5 hex sueltos del SVG (eje Y, unidad, y las 3 líneas de "promedio categoría") leen de `const COL_MUTED='#726E65'` — cero duplicados | `css/tokens.css` (`--gris-cl`), `js/app.js` (`COL_MUTED`, funciones `grafico()`, `pFicha()`, `pStats()`, `pHoy()`) |
| 3 | Teclado sin borrar | Se agregó una 4ta tecla de acción `⌫` (`kbBorrar()`) que hace `C.buf=C.buf.slice(0,-1);pCarga()`. El reset al re-tocar la fila (`activar()`) se dejó igual que en v2 | `index.html` (`.kb`), `js/app.js` (`kbBorrar()`) |
| **IMPORTANTES** | | | |
| 4 | Contraste de estados | `--baja:#B4700E→#985E0C` (4.55:1) · `.cat.on .mini` ahora usa el token `--rojo-cl:#FFEBEE` (4.51:1, antes hex suelto `#FFD9DF`) · `.nav button`/`.nav svg`: `#7E7A75→#817D77` (4.53:1 — se corrigieron **ambos**, texto e ícono, porque comparten el mismo hex y dejar uno viejo se veía como bug) · borde de `.cat.mas`: `#4A4A54→#5E5E6A` | `css/tokens.css` (`--baja`, `--rojo-cl`), `css/app.css` (`.nav button`, `.nav svg`, `.cat.mas`, `.cat.on .mini`) |
| 5 | Targets táctiles | `.stp button` 30×30→40×40px, `gap` 2px→8px · `.pills button` `height:36px`→`min-height:40px`, `gap` 3px→8px, ancho flexible sin tocar (`flex:1 0 27px` igual que v2) | `css/app.css` (`.stp`, `.stp button`, `.pills`, `.pills button`) |
| 6 | Labels sin asociar | Los 5 `<label>` que apuntan a un `<input>` real ahora tienen `for=`/`id` (`in-alt`, `in-peso`, `in-test-nuevo`, `in-rec-link`, `in-rec-nota`). Los 2 campos que en realidad no envuelven un input sino un grupo de botones (`rec-biblio`, `rec-dest`) se resolvieron con `aria-labelledby`+`role="group"` en vez de `for=`, porque `for=` no es válido sobre un `<div>` — ver nota más abajo | `index.html` (todos los `.campo` de los 3 sheets) |
| 7 | Toast sin `aria-live` | `role="status" aria-live="polite"` en `#toast` | `index.html` (`#toast`) |
| 8 | Sin feedback de presión | `transform:scale(.97)` + `transition:transform 120ms ease-out` en `.al`, `.fila`, `.opt`, `.test-fila`, `.btn` (sumado a su cambio de color existente). `.pills`, `.stp` y el teclado numérico se dejaron sin animación a propósito. Ya cubierto por el reset universal `@media(prefers-reduced-motion:reduce){*{transition:none!important}}` que ya traía v2 | `css/app.css` (bloque "feedback de presión", `.btn:active`) |
| 9 | Jerarquía tipográfica plana | Se agregó el peso `400` a la carga de Barlow Condensed y se aplicó a `.f-dat .k` y `.campo label` (antes 600). En `.leyenda` se declaró `font-weight:400` de forma explícita — **nota**: `.leyenda` usa `'IBM Plex Mono'`, no Barlow Condensed, y esa fuente solo carga los pesos 500/600; el navegador ya renderizaba en 400 por defecto (valor inicial de `font-weight`) al no estar declarado, así que este cambio deja explícito lo que ya pasaba pero no altera el pixel — lo marco por si esperaban un efecto visible ahí | `index.html` (`<link>` de Google Fonts), `css/app.css` (`.f-dat .k`, `.campo label`, `.leyenda`) |
| 10 | Hex sueltos / grises duplicados | `--sup-1:#22222A`, `--sup-2:#2C2C34` nuevos. `--gris-osc:#A9A5A0` consolida `#A9A5A0`/`#B9B5B0`/`#8A8781`. `.f-dat .k` usa `--gris-osc` (se descartó el parche `#8C8A84` de la auditoría, como pediste). **Extra no pedido explícitamente pero necesario para el criterio de aceptación**: `.rol button{color:#9C988F}` (línea suelta que coincidía con el valor viejo de `--gris-cl`, no nombrada en el punto 2 porque está sobre fondo oscuro) también se migró a `--gris-osc` (5.65:1 sobre `--sup-2`) — dejarla en `#9C988F` hubiera violado "ningún hex de la familia --gris-cl... aparece duro" y además, con el nuevo `--gris-cl` más oscuro, hubiera quedado con bajo contraste si la hubiera migrado a ese token en cambio | `css/tokens.css`, `css/app.css` (`.head .sub`, `.rol`, `.rol button`, `.cat`, `.cat .mini`, `.cat.mas`, `.f-dat .d`, `.f-dat .k`, `.f-dat .v small`, `.hoy .k`, `.video span`, `.nota`), `js/app.js` (línea de `p-hoy` — ver nota) |
| **NICE-TO-HAVE** | | | |
| 11 | Sombra uniforme en 12 componentes | `--sombra-alta` nuevo, aplicado solo a `.al`. El resto sigue con `--sombra` sin cambios | `css/tokens.css`, `css/app.css` (`.al`) |
| 12 | Timing simétrico del toast | Entrada 250ms / salida 150ms, vía `transition-duration` distinto en `.toast` (estado base = salida) y `.toast.on` (estado activo = entrada) | `css/app.css` (`.toast`, `.toast.on`) |
| 13 | Sheets sin semántica de diálogo | `role="dialog" aria-modal="true" aria-labelledby` apuntando al `<h3>` de cada sheet (se le agregó `id` a cada título). Cierre con `Escape` vía un listener global que llama a `cerrar()`. Sin focus trap, como pediste | `index.html` (los 3 `.sheet`), `js/app.js` (listener de `keydown`) |
| 14 | Escala tipográfica ad hoc | 14 escalones (`--fs-100` a `--fs-300`) documentados en `tokens.css`, con comentario de qué tamaños originales reemplaza cada uno. Deriva máxima real: 0.5px (el límite pedido era 1px). Se aplicó también a los `font-size` del SVG generado por JS (`cancha()`, `grafico()`) y a los `style="font-size:..."` inline que arma `pFicha()`, para que la consolidación sea completa y no solo en CSS | `css/tokens.css`, `css/app.css` (todo el archivo), `js/app.js` (`cancha()`, `grafico()`, `pFicha()`) |
| 15 | Placeholder de video con gradiente | `background` de `.video` pasa de `linear-gradient(135deg,#2A2A32,#16161A)` a `var(--sup-1)` (tono sólido, reutiliza el token ya creado en el punto 10). El ícono de play (el triángulo `::after`) ya existía en v2 y se dejó igual | `css/app.css` (`.video`) |
| **NO APLICADO** | | | |
| 16 | Selector Profe/Jugador en el header | No se tocó. Baja frecuencia de uso (una vez por sesión), la posición arriba es aceptable | — |

## Realismo móvil

| Qué pedía el brief | Qué se hizo |
|---|---|
| Viewport sin límites de zoom | `content="width=device-width, initial-scale=1, viewport-fit=cover"` |
| Altura real | `100dvh` en `body` y `.marco` (nunca `100vh`) |
| Marco de 390px solo para escritorio | Reestructurado mobile-first: las reglas base de `body`/`.marco` son ya el full-bleed (sin marco, sin bordes, sin sombra). El card-de-teléfono de 390px + sombra + `border-radius:26px` quedó adentro de `@media(min-width:520px)`. Esto reemplaza el viejo `@media(max-width:760px)` de v2 (que hacía lo inverso) — se eliminó ese bloque porque quedaba muerto una vez invertida la lógica |
| Safe areas | `env(safe-area-inset-top)` sumado al padding superior de `.head`; `env(safe-area-inset-bottom)` como padding inferior de `.nav`. No se tocaron `.sheet`/`.toast`/`.kb` porque el brief pedía explícitamente solo header y nav — quedan como posible mejora futura si en un iPhone con home indicator se ven pegados al borde |
| Metas de app | `theme-color`, `mobile-web-app-capable`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style="black-translucent"`, `apple-mobile-web-app-title="Inferiores"` |
| `manifest.webmanifest` | `display:"standalone"`, `orientation:"portrait"`, `start_url:"./"`, colores en negro de la app. Ícono: **se agregó `v3/icon.svg`** (no estaba en el árbol de archivos que listaste) — es un SVG monocromo simple (escudo abstracto, mismo motivo del `.escudo` de la app, no una réplica del escudo de ningún club real) porque el manifest necesita un ícono real para ser válido y vos autorizaste explícitamente SVG (solo PNG requería parar a preguntar) |
| Táctil | `overscroll-behavior:none` en `body`; `-webkit-tap-highlight-color:transparent` ya estaba en `*` desde v2, sin cambios; `user-select:none` en el selector global `button` (cubre nav, botones y teclado numérico de una vez) y explícito también en `.nav` |
| Scroll contenido en `.cuerpo` | Ya era así en v2 (`.cuerpo{overflow-y:auto}`, `.marco{overflow:hidden}`, header/nav fuera del contenedor scrolleable) — no hizo falta cambiar la estructura, solo confirmar que se mantiene con `100dvh` |
| Sin service worker / offline | No se agregó nada de eso, como pediste |

## Cosas para que decidas

- **`.pills` con 10 intentos (el default) puede necesitar scroll interno a 390px de ancho.** Con `gap:8px` (punto 5) y el ancho flexible que pediste mantener, el cálculo da ~377px de contenido mínimo contra ~340px disponibles dentro de una `.fila` a 390px de viewport. `.pills` ya tenía `overflow-x:auto` en v2 (igual que `.cats` y `.chips`, que también scrollean), así que no rompe el layout ni genera scroll de página — pero si tocás las pastillas se sienten "apretadas" antes de necesitar arrastrar. Si preferís que 10 intentos entren siempre sin scroll interno, la palanca más simple sería bajar el `gap` de `.pills` específicamente (a costa de alejarte un poco del 8px parejo) o achicar el padding de `.fila`. No lo cambié porque el punto 5 pedía 8px explícito y no quise pisar ese número sin consultarte.
- **`icon.svg` es un archivo nuevo, fuera del árbol que listaste.** Ver fila del manifest arriba.
