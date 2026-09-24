# DESIGN.md — sistema de diseño de App formativa

Fuente de verdad del diseño. La Parte 1 es para entender la identidad; la Parte 2 es para aplicarla sin releer el CSS. Todo lo que dice sale de `public/css/` y de la rama `feat/identidad-visual` (spec y plan en `docs/superpowers/`, medición en `docs/rendimiento/identidad-visual.md`). Si este documento y el CSS no coinciden, gana el CSS y se corrige el documento.

---

# Parte 1 — Para leer

## Qué es y a quién le habla

Una herramienta de trabajo para clubes formadores de básquet: el profe la abre en la cancha, con el celu en una mano y la pantalla al brillo que venga; el coordinador la mira en la compu. Los datos son de menores. Por eso la app es **clara, densa en datos y sin decorado**: lo que importa es leer un número a un metro de distancia y tocar el botón correcto con el pulgar.

Hay dos mundos, separados a propósito:
- **La app por dentro** (`.pant`): fondo papel, tarjetas blancas, tinta casi negra. No hay tema oscuro: en la cancha lo claro se lee mejor.
- **Lo público** (`.publico`: landing y autenticación): fondo casi negro con profundidad y un resplandor del color del club. Es presentación, no herramienta, y vive en su propio archivo (`publico.css`) para que nada se filtre hacia adentro.

## Carácter visual

Deportivo y sobrio. Títulos en **Barlow Condensed** en mayúsculas con aire entre letras (el lenguaje de un tablero de cancha), cuerpo en **Inter**, y todo número en **IBM Plex Mono** con dígitos de ancho fijo para que no bailen al cambiar. Un solo color de marca, el del club, usado con avaricia: botón principal, la unidad de una cifra, el cuadradito de un eyebrow, el relleno de una barra. El resto es papel, tinta y grises.

## Principios

1. **El color del club es una variable, no un valor.** La app nace multi-club: un club azul no puede tener un token que se llama "rojo". Todo sale de `--club` y `--sobre-club`.
2. **Los colores semánticos no dependen del club.** "Sube" es verde y "baja" es ámbar en cualquier club: si el primario fuera verde, "sube" se confundiría con la marca.
3. **Profundidad sin costo.** Sobre claro, sombras suaves; sobre oscuro, separación de superficies y bordes (las sombras no se ven). Lo que da vida (levantar una tarjeta, el resplandor) se hace con `transform` y `opacity`, que resuelve la GPU sin repintar.
4. **Moverse poco y rápido.** Cada animación confirma algo (apretaste, entró la pantalla, se abrió la hoja). Nada en loop, nada que demore leer.
5. **`NULL` es "no se sabe", nunca 0.** Un dato que falta se muestra como falta ("sin medir", "—", en gris e itálica con `.sin` o `.chip.sin`), nunca como una barra vacía ni un 0 %.
6. **Se mide antes de decidir.** Cada efecto de la identidad pasó por Lighthouse y por un recorrido con CPU 4x; lo que costaba, se sacó (ver Reglas duras).

---

# Parte 2 — Para usar

## Tokens

Todos viven en `public/css/tokens.css`, en `:root`. Es el único archivo con valores literales de color.

### Color del club

| Token | Valor por defecto | Cuándo usarlo |
|---|---|---|
| `--club` | `#D9122E` | Sólo en tokens y en el resplandor de la landing. En componentes usá `--primario`. |
| `--sobre-club` | `#fff` | Texto e íconos encima de `--primario` (botón, chip activo). |
| `--primario` | `var(--club)` | Acción principal, foco, unidad de la cifra, relleno de barras, filetes. |
| `--primario-osc` | `#A00D22` (respaldo) | Botón apretado y hover. |
| `--primario-cl` | `#FFEBEE` (respaldo) | Fondo suave de una opción elegida. |
| `--primario-tenue` | `#FBE5E8` (respaldo) | Fondo de una etiqueta del club. |

**Cómo se cambia por club:** se sobrescriben sólo `--club` y `--sobre-club` en `:root`. Los tres derivados se recalculan solos con `color-mix()` dentro de `@supports`; sin soporte (Android WebView anterior a Chrome 111) quedan los hex de respaldo del rojo por defecto. Quien carga el color elige `--sobre-club` (blanco o negro) según cuál llegue a 4.5:1; hoy nada lo carga desde la base (ver Deuda).

### Neutros y superficies

| Token | Valor | Cuándo usarlo |
|---|---|---|
| `--papel` | `#F3F1ED` | Fondo de la app y de la hoja. |
| `--blanco` | `#fff` | Fondo de tarjetas y avisos. |
| `--tinta` | `#131316` | Texto principal. |
| `--negro` | `#131316` | Fondos oscuros de la app (cabecera, toast), relleno de zona que llegó a la meta. |
| `--gris` | `#6E6B66` | Texto secundario sobre blanco. |
| `--gris-cl` | `#726E65` | Texto secundario sobre papel (4.50:1) y borde del botón secundario. |
| `--gris-osc` | `#A9A5A0` | Texto secundario sobre fondo oscuro. |
| `--linea` | `#DFDBD3` | Bordes, separadores y pista de las barras. |
| `--fondo-chip` | `#EFECE6` | Chips, etiquetas y fondos de ícono en reposo. |
| `--deshabilitado` | `#C9C5BE` | Botón deshabilitado. |
| `--sobre-oscuro` | `#fff` | Texto sobre `--negro`, `--sup-*` y `--pub-*`. |
| `--sup-1` / `--sup-2` | `#22222A` / `#2C2C34` | Superficies sobre oscuro dentro de la app (y avisos de `.publico`). |
| `--linea-osc` | `#3A3A44` | Borde sobre fondo oscuro. |
| `--pub-fondo` | `#0D0D10` | Fondo de landing y autenticación. |
| `--pub-tarjeta` | `#17171C` | Tarjetas de la landing (`--gris-osc` encima da 7.4:1). |
| `--pub-borde` | `#2B2B34` | Borde de esas tarjetas. |

### Semánticos y capas

| Token | Valor | Cuándo usarlo |
|---|---|---|
| `--sube` / `--sube-fondo` | `#15794F` / `#E1F0E9` | Mejora, "llegó", estado bien (`.chip.sube`, `.al.ok`). |
| `--baja` / `--baja-fondo` | `#985E0C` / `#F6ECD9` | Empeora, requiere refuerzo (`.chip.baja`). |
| `--aviso` / `--aviso-fondo` | `#7A4E00` / `#FFE9A8` | Franja de "datos de ejemplo" (8.4:1). |
| `--velo` | `rgba(19,19,22,.5)` | Fondo detrás de la hoja. |
| `--toque-claro` | `rgba(19,19,22,.06)` | Hover de un secundario sobre papel. |
| `--toque-osc` / `--presion-osc` | `rgba(255,255,255,.08)` / `.12` | Hover y apretado sobre fondo oscuro. |

`--negro-puro`, `--placeholder-osc`, `--google-texto` y `--google-hover` son de uso único (video, campos oscuros, botón de Google según su guía de marca): no los reuses para otra cosa.

### Tipografía

| Token | Valor | Cuándo usarlo |
|---|---|---|
| `--ff-titulo` | `'Barlow Condensed'` | Títulos, botones, eyebrows, etiquetas en mayúsculas. |
| `--ff-cuerpo` | `'Inter'` | Texto corrido y campos. |
| `--ff-mono` | `'IBM Plex Mono'` | Todo número: cifras, fracciones, porcentajes, chips. |
| `--fs-cifra` | `clamp(2.5rem,2rem + 2.4vw,3.5rem)` | Sólo la cifra héroe. |
| `--fs-titulo` | `clamp(1.5rem,1.25rem + 1.2vw,2rem)` | `h1`. |
| `--fs-titulo-chico` | `clamp(1.5rem,1.3rem + 1vw,2rem)` | `h2` y `.h2` (título de sección; `.h2` lleva una barra roja debajo). Los `.eyebrow` (subtítulos) van en `--fs-190`, en `--tinta`, nunca en gris. |
| `--fs-100` … `--fs-300` | `0.625rem` … `1.875rem` | Escala fija; el número es el px del prototipo ×10 (`--fs-160` = 1rem). |

Los usados con más frecuencia: `--fs-115` (ayudas, chips, meta), `--fs-125` (eyebrow, etiquetas en mayúsculas), `--fs-135` (texto de tarjeta y avisos), `--fs-145` (texto de fila), `--fs-160` (cuerpo), `--fs-190` (botón). Pesos cargados: Barlow 400–700, Inter 400–700 (variable, un archivo), Plex Mono 500 y 600.

### Espaciado, radios, sombras y layout

| Token | Valor | Cuándo usarlo |
|---|---|---|
| `--sp-1` … `--sp-6` | `0.25rem` … `1.5rem` (pasos de 0.25) | Todo margen, padding y gap. `--sp-4` es el padding de tarjeta y de `.pad`. |
| `--sp-8` | `2rem` | Separación grande (landing, secciones). No hay `--sp-7`. |
| `--r` | `0.6875rem` | Tarjetas, botones, avisos, toast. |
| `--r-btn` | `0.125rem` | Botones: casi rectos, como el sitio del club. |
| `--r-m` | `0.5625rem` | Campos y píldoras de categoría. |
| `--r-s` | `0.3125rem` | Chips y etiquetas. |
| `--r-full` | `999px` | Píldoras. |
| `--sombra` | dos capas suaves | Tarjeta en reposo, botón secundario. Sólo sobre claro. |
| `--sombra-alta` | dos capas más marcadas | Avisos y tarjeta tocable en hover. |
| `--tap` | `2.75rem` (44 px) | Alto mínimo de todo lo que se toca. |
| `--max-ancho` | `52rem` | Ancho máximo de la columna de contenido. |
| `--lateral-w` | `14rem` | Navegación lateral desde 64rem. |

### Movimiento

| Token | Valor | Cuándo usarlo |
|---|---|---|
| `--dur-1` | `120ms` | Feedback al apretar (`scale`). |
| `--dur-2` | `200ms` | Entrada de pantalla, toast, velo, sombra de la tarjeta tocable. |
| `--dur-3` | `280ms` | Hoja y relleno de barras. |
| `--ease-salida` | `cubic-bezier(.16,1,.3,1)` | Lo que entra o responde: frena al llegar. Es el default. |
| `--ease-entrada` | `cubic-bezier(.3,0,.8,.15)` | Lo que se va: acelera al irse (hoy, el velo al cerrarse). |

## Reglas duras

**Las verifica `tests/estilosTokens.test.js`** (si las rompés, `npm run test:q` falla):
- Ningún color literal (hex, `rgb`, etc.) fuera de `tokens.css`. Todo `var(--x)` usado tiene que estar definido.
- `transition` y `@keyframes` sólo tocan `transform` u `opacity`. Nunca `transition: all`.
- Los `@keyframes` sólo definen `from`: con `prefers-reduced-motion` (que en `base.css` apaga toda animación) el elemento queda en su estado final, nunca invisible.
- Nadie usa el nombre viejo `--rojo`. `--sobre-club` sobre `--club` llega a 4.5:1, y el texto de la landing a 4.5:1 sobre su tarjeta y su fondo.

**Las cumple el código, sin test que las ate:**
- Ninguna duración ni easing suelto: siempre `--dur-*` y `--ease-*`.
- Media queries de ancho sólo en `layout.css` (cortes en `40rem` y `64rem`); el resto del CSS es mobile-first sin media queries de ancho. El hover va siempre dentro de `@media (hover:hover)`: en táctil no es señal de nada.
- Una sombra que aparece no se anima: vive en un `::after` y lo que cambia es su `opacity` (modelo: `.tarj.tocable`).

**Para código nuevo** (el código viejo no la cumple del todo, ver Deuda): márgenes, paddings, gaps y radios con `--sp-*` y `--r*`, no en `px`. Un borde de `1px` sí va en px.

**Lo que NO se hace, y por qué (medido):**
- **`color-mix()` adentro de un `radial-gradient`**: costó ~+450 ms de FCP y ~+900 ms de LCP en Lighthouse mobile. El resplandor del club va en un `::before` con `var(--club)` puro e intensidad por `opacity`.
- **Entrada de las tarjetas de la landing con `opacity`**: sumaba ~+316 ms de LCP (+2,6 %), porque un párrafo de `.ben` es el LCP y no cuenta hasta que se ve. Hoy entran subiendo con `translateY` y sin `opacity` (no ocultan nada, así que se pintan desde el primer frame).
- **`translateY` en la entrada de pantalla**: el navegador arma una capa del tamaño de la pantalla (más frames largos con CPU 4x) y un ancestro transformado re-ancla a los hijos `position:fixed` (el teclado de MEDIR). La entrada es sólo fade.
- **Animar `width`, `height`, `top`/`left`, `box-shadow`, `background`, `filter` o `backdrop-filter`**: repintan cada frame. Una barra crece con `scaleX` desde el ancho final, no animando el ancho.
- **Animaciones infinitas, parallax, marquee, blur de fondo, marcas de agua**: decorado de sitio institucional; el blur cuesta en Android gama baja y una marca de agua no escala a multi-club.
- **Una fuente más** (Oswald, Chakra Petch): ~20–30 KB para una diferencia que casi no se nota. **Sacar pesos de Inter**: es variable, no ahorra un byte.
- **Tema oscuro para la app por dentro**: se usa en la cancha, con cualquier brillo.

## Componentes

El marcado nuevo se escribe con `html\`...\`` de `src/ui/html.js`: escapa todo lo interpolado y convierte `null` en vacío, así que el caso "no se sabe" se resuelve con un condicional, no con un 0.

**Cifra héroe** — el número que el profe se lleva de una tarjeta, lo más grande de la pantalla; la unidad va en el color del club. Clase `.cifra` (con `.u` para la unidad).
```js
html`<div class="cifra">${pct}<span class="u">%</span></div>`
```

**Barra con meta** — cuánto se hizo y dónde está la meta del cuerpo técnico, sin texto extra. Clases `.zona-barra`, `.pista`, `.relleno` (`.llego` cuando alcanzó la meta: pasa a negro), `.meta`, `.pct`. El relleno se dibuja con el ancho final en línea y entra con `scaleX`; sin dato, no hay relleno; sin meta, no hay marca.
```js
html`<div class="zona-barra">
  <div class="pista">
    ${pct != null && html`<div class="relleno ${llego ? 'llego' : ''}" style="width:${pct}%"></div>`}
    ${meta != null && html`<div class="meta" style="left:${meta}%" title="Meta del cuerpo técnico: ${meta}%"></div>`}
  </div>
  <span class="pct">${pct == null ? '—' : `${pct}%`}</span>
</div>`
```
Para barras comparativas simples (sin meta) está `.barras` > `.barra` con `.et`, `.pista`, `.relleno`, `.val` (`src/ui/componentes/barras.js`).

**Tarjeta con acento** — algo que pide atención. En la app es el aviso `.al`: tarjeta blanca con filete de 3 px en `--primario` a la izquierda (`.al.ok` lo pasa a `--sube`); es también lo que devuelve `avisoDeError`. En la landing, `.ben` (ver abajo). La variante `.tarj.acento` del spec no existe (ver Deuda).
```js
html`<div class="al"><div class="tx">${texto}<div class="mt">${detalle}</div></div></div>`
```

**Tarjeta tocable** — una tarjeta que abre algo. `.tarj.tocable`: se achica al apretar y, con mouse, sube 2 px y aparece `--sombra-alta` en su `::after`. Como no es un `<button>`, necesita `role` y `tabindex` para el teclado. La tarjeta común, sin interacción, es `.tarj`.
```js
html`<div class="tarj tocable" data-id="${item.id}" role="button" tabindex="0">…</div>`
```

**Hoja** — detalle o formulario encima de la pantalla actual: sube desde abajo en el celu, centrada en escritorio. Se abre con `abrirHoja({ titulo, cuerpo, alCerrar })` de `src/ui/componentes/hoja.js` (que arma `.hoja` con `.asa`, `h2` y `.pad`, y prende `.velo`); se cierra con `cerrarHoja()`. El título lo escapa la función; el cuerpo va con `html`.
```js
abrirHoja({ titulo: jugador.nombre, cuerpo: html`<div class="tarj">…</div>` })
```

**Landing** — la cara pública, dentro de `.publico` (fondo `--pub-fondo`, resplandor del club en `.publico::before`). Bloques: `.marca`, `.hero` (con `.r` para la palabra en color y `.bajada`), `.acciones-landing` y `.beneficios` > `.ben` (tarjeta `--pub-tarjeta`, filete de 3 px en `--primario`, título `.t` y texto `.d`). Es marcado estático de `public/index.html`; los campos oscuros son `.campo-osc`.
```html
<div class="beneficios"><div class="ben"><div class="t">Título</div><div class="d">Texto.</div></div></div>
```

**Guías** — hoja de explicación con cabecera y pasos (`guiaSalto.js`, `protocoloCorporal.js`, `protocoloSalto.js` en `src/ui/componentes/`). `.guia-cab` (ícono, título y `.tag-metodo`, más un `.sub`), `.guia-paso` (tarjeta numerada, número en mono, con `.dibujo` para un SVG y su `.chip-rango`), `.guia-clave` (bloque destacado con el filete del club, como `.al`), `.chip-rango` (un rango en mono, siempre leído de las constantes de `antropometria.js`) y `.cifra-clave` (la cifra héroe de la ficha, con `.u` para la unidad y un `.etq` debajo). `.tag-metodo` es la etiqueta "Metodología <apodo>": la arma `etiquetaMetodologia(club)` con los apodos de `club.apodos` (0046), o `club.nombre` si no hay. Los SVG de pierna viven en `iconos.js` (`ICONO.piernaExtendida`, `ICONO.piernaFlexionada`) con `currentColor`.

**Cronómetro de salida y tarjeta de sprint** — `cronometroSalida.js` es una hoja a pantalla completa (`.crono-salida`, fondo `--papel`: claro, como el resto de la app, aunque la referencia de Stitch era oscura) con el nombre y la distancia (`.crono-quien`), el tiempo en mono enorme (`.crono-tiempo`, unidad en `--primario`) y un botón `.crono-llego` que ocupa casi media pantalla. El reloj en vivo se repinta con `requestAnimationFrame` sobre el texto, sin animaciones CSS. La pantalla `medirSprint.js` usa `.segmentado` (selector 30/20 m, `aria-pressed`), y una `.tarj.sprint-tarj` por jugador con dos `.sprint-celda` (botón *Correr* o el tiempo en `.sprint-tiempo`, con el chip "Mejor"). La sección de la ficha y del progreso es `seccionSprint.js`: `.tarj.salto-tarj` con `.cifra-clave`, chip de variación (`.chip.sube` si el tiempo bajó) y `.tabla-ev` con las sesiones anteriores.

**Piezas chicas que ya existen** (usalas antes de crear otra): `.btn` / `.btn.sec` / `.btn.chico`, `.eyebrow` (con `.der` para un dato a la derecha), `.h2` y `.p`, `.chip` (`.sube`, `.baja`, `.sin`), `.campo` (con `.ayuda`), `.sin` para un dato que falta, `.mono`, `.sr` para texto sólo para lectores de pantalla, y el toast con `toast()` de `src/ui/nav.js`.

## Checklist para una pantalla o función nueva

1. `npm run test:q` en verde: nada de colores literales, `var(--x)` inexistentes ni transiciones prohibidas.
2. Espacios, radios, tamaños de letra y sombras salen de tokens; ningún `px` nuevo salvo bordes de 1 px.
3. Si algo se mueve: sólo `transform`/`opacity`, con `--dur-*` y `--ease-*`, keyframes con `from` solo; y nada que pueda ser el LCP entra animado.
4. Con `prefers-reduced-motion: reduce` emulado, todo queda visible y en su estado final.
5. A 375 px no hay scroll horizontal y todo lo tocable mide al menos `--tap`; a 1280 px el contenido respeta `--max-ancho` y la navegación lateral. Única excepción: `.pant.ancha`, sólo para herramientas-lienzo (hoy, el editor de jugadas), no para formularios ni listas.
6. Texto secundario con el gris de su fondo (`--gris` sobre blanco, `--gris-cl` sobre papel, `--gris-osc` sobre oscuro): así llega a 4.5:1. Nada de color como única señal.
7. Números en `--ff-mono`; el dato principal, si hay uno, como `.cifra`.
8. Tres estados resueltos: cargando (`<div class="p">Cargando …</div>` en `.pad`), error (`avisoDeError`), y vacío con un texto que diga qué falta y qué hacer. Un `NULL` se muestra como `.sin`/"—", nunca como 0.
9. Textos en español rioplatense con voseo ("Revisá", "Tocá"); el texto de error de red sale de `ui/errores.js`, no se reescribe.
10. Marcado con `html\`...\``, reusando las clases de Componentes antes de inventar otra.

## Rendimiento

Presupuesto de la rama: ninguna regresión contra la medición previa, con tolerancia de ±5 % en LCP y TBT, CLS igual o menor, y cero frames nuevos de más de 50 ms atribuibles a animaciones en el recorrido con CPU 4x a 375 px. Se mide con Lighthouse mobile sobre la landing (mediana de 3 corridas), el peso de CSS y fuentes, y el recorrido con `long-animation-frame`. El procedimiento, los comandos y los resultados están en [`docs/rendimiento/identidad-visual.md`](docs/rendimiento/identidad-visual.md); un cambio visual grande (una fuente, un efecto en la landing, una animación nueva) se mide igual antes de mergear.

## Deuda y decisiones abiertas

- **El jugador que entra con su cuenta no trae `club.apodos`** (`main.js`, camino del jugador): la etiqueta "Metodología" cae en `club.nombre`. Es aceptable porque las guías son para los profes; si llegan a la vista del jugador hay que traerlos.
- **IBM Plex Mono se pide en 500 y 600, pero ningún CSS declara 500.** Los textos mono sin peso explícito (400) caen en el archivo 500. Pedir 400 en lugar de 500 los aliviaría: es decisión de diseño, no de rendimiento.
- **El color del club desde la base** (`clubes.color_primario`, `check` de hex, función pura que valide el contraste y elija `--sobre-club`): lleva migración y RLS, queda para otro spec. Hoy ningún JS sobrescribe `--club`: todos los clubes se ven rojos.
- **`.tarj.acento` no existe.** El spec la definía como variante con filete; el filete sólo está en `.al` (aviso) y `.ben` (landing). Si una pantalla necesita una tarjeta con acento que no sea un aviso, hay que crearla.
- **`.var.sube` usa `--primario`**, no `--sube`: contradice el principio de que los semánticos no dependen del club (con un club verde se confundiría). Lo mismo, en nombre, `.tag.rojo`.
- **`.chip.primario` no existe**, aunque el spec la listaba entre las variantes de `.chip`.
- **`px` sueltos en espaciado y radios**: el reemplazo de T3 fue parcial. Quedan, entre otros, gaps de `6px`/`10px`/`14px`, márgenes de `18px` y radios de `7px`/`8px`/`10px`/`20px` en `componentes.css` (barras, metas, zonas, `.chip-tema`). No hay test que lo impida.
- **Tokens que el spec prometía y no están**: `--sp-10` y `--sp-12` (la landing usa `--sp-8` como máximo) y `--primario-brillo` del plan (el resplandor terminó usando `var(--club)` con `opacity`).
- **Valores que difieren del spec**: `--r-s` es `0.3125rem` (el spec decía .375 rem); `--primario-osc` y `--primario-tenue` se mezclan en `srgb` y sólo `--primario-cl` en `oklab` (el spec decía todo en oklab); la hoja usa `1rem` de radio y el `h1` del hero un `clamp` propio, fuera de la escala.
- **Las pantallas que muestran la cifra y la meta (`hoy.js`) todavía escriben HTML con `escaparHtml` a mano**: los fragmentos de este documento son el estilo al que migrar, no copia literal de esa pantalla.
- **No hay componente de estado vacío ni de carga**: cada pantalla usa `.p` con su texto, y `.vacio` sólo existe dentro de `.fuente`.

## Botones y títulos (segunda vuelta de la identidad)

- **Botón principal `.btn`**: rojo del club, letras blancas, casi recto (`--r-btn`), mayúsculas con `letter-spacing:.14em`. **Secundario `.btn.sec`**: negro macizo con letras blancas; con mouse pasa a rojo. Los dos suben 2 px y muestran el brillo del club en el `::after` al pasar el mouse. Sobre fondo oscuro (`.publico`) el secundario sigue siendo contorno.
- **Títulos**: `.h2` grande, en `--tinta` y con barra roja debajo; `.eyebrow` en `--fs-190`, `--tinta`, negrita. `--gris-osc` es para fondo oscuro: no usarlo sobre papel.
- **Acción de un bloque**: `.seccion-cab` pone el botón (`.btn.chico`) a la derecha del título del bloque que afecta (ej. "Cargar partido" en DATOS), en vez de una barra fija abajo.
