# Identidad visual: tokens, componentes base y movimiento

**Fecha:** 2026-09-20 · **Rama:** `feat/identidad-visual` · **Referencia:** Stitch, proyecto "Landing Page Newell's Básquet"

## Qué hay y qué se toma de Stitch

**Stitch** tiene tres pantallas: una web institucional del club (no es esta app), una landing de beneficios (es la nuestra: mismo texto, "Lo que se trabaja en inferiores, queda") y un tablero de batería de tiro (nuestra pantalla HOY). El proyecto no tiene design system cargado (`list_design_systems` vuelve vacío, `designTheme` vacío), así que no hay DESIGN.md que bajar. Los tokens salen del `:root` y del `tailwind.config` de cada HTML: rojo `#D3151E`, fondos casi negros `#0B0C0E` / tarjetas `#14171D` / borde `#232732`, Oswald + Inter (Chakra Petch en el tablero), easing `cubic-bezier(.16,1,.3,1)`.

**La app hoy** ya tiene una identidad coherente en `public/css/tokens.css`: rojo `#D9122E`, fondo papel `#F3F1ED`, Barlow Condensed + Inter + IBM Plex Mono, un único radio y dos sombras. El problema no es la identidad, sino estas tres cosas: (1) el rojo está cableado (55 `var(--rojo)`, y `--rojo-osc`/`--rojo-cl` a mano), así que otro club no puede tener su color; (2) quedan ~40 hex sueltos fuera de `tokens.css` (`#fff`, fondos de chip, deshabilitado); (3) el movimiento está disperso (duraciones 120/150/200/250 ms y easings distintos) y no hay nada que impida animar propiedades caras.

| De Stitch | ¿Entra? | Por qué |
|---|---|---|
| Superficies oscuras más profundas + borde sutil + resplandor rojo radial arriba del hero | **Sí, sólo en `.publico`** | La landing ya es oscura; con más separación entre fondo y tarjeta gana profundidad. El gradiente es estático y no cuesta nada |
| Filete de acento a la izquierda en tarjetas | **Sí**: en `.ben` de la landing y como variante `.tarj.acento` | Marca jerarquía sin sumar color de fondo. En la app, sólo para lo que pide atención |
| Cifra héroe (30 %, unidad en color) | **Sí**, componente `.cifra` | Es el dato que el profe busca en HOY y en mediciones. Hoy no tiene tamaño propio |
| Barra con marca de meta (zonas de tiro) | **Sí**, se agrega a `.zona-barra` | Muestra "cuánto falta" sin texto extra. Es el único agregado funcional |
| Chips de estado ("Llegó a la meta", "Requiere refuerzo") | **Ya existe** `.chip.sube/.baja` | Sólo pasan a tokens |
| Levantar la tarjeta al pasar el mouse | **Sí**, con `hover:hover` | Transform + opacidad de una sombra en pseudo-elemento, sin animar `box-shadow` |
| Oswald / Chakra Petch | **No** | Barlow Condensed cumple el mismo papel y ya está cargada. Una fuente más son ~20–30 KB para una diferencia que casi no se nota |
| Tema oscuro para la app entera | **No** (ahora) | La app se usa en la cancha, con la pantalla al brillo que venga. `publico.css` ya dejó asentado que la herramienta es clara |
| Cinta marquee, marca de agua "NOB", grilla de fondo, `backdrop-filter` en la cabecera | **No** | Decorado de sitio institucional. El blur cuesta en Android gama baja y la marca de agua no escala a multi-club |
| Glow animado, `transition: all` | **No** | Animan propiedades que obligan a repintar |

## Tokens

- **Color de club.** `--club` (por defecto `#D9122E`) y `--sobre-club` (texto sobre el color del club, por defecto `#fff`) son **los únicos dos valores** que cambian por club. De esos dos salen los derivados con `color-mix(in oklab, …)`: `--primario`, `--primario-osc` (apretado/hover), `--primario-cl` (fondo suave) y `--primario-tenue` (fondo de etiqueta). El resplandor de la landing no lleva derivado: es un gradiente de `--club` con `opacity` en un pseudo-elemento (con `color-mix` adentro del gradiente costaba ~+450 ms de FCP en Lighthouse mobile). `--rojo*` se renombra a `--primario*`: un club de azul no puede tener un token que se llama rojo. Los semánticos (`--sube`, `--baja`, `--aviso`) **no** dependen del club: si el primario de un club fuera verde, "sube" se confundiría con la marca.
- **Neutros:** no cambian. Se suman `--fondo-chip`, `--sube-fondo`, `--baja-fondo`, `--deshabilitado` y `--sobre-oscuro`, que reemplazan los hex sueltos. Superficies de `.publico`: `--pub-fondo`, `--pub-tarjeta`, `--pub-borde`. Se toma la profundidad de Stitch, pero se ajusta para que `--gris-osc` siga en ≥4.5:1.
- **Tipografía:** las mismas tres familias. Se agregan `--fs-cifra` (clamp 2.5→3.5 rem) y `font-variant-numeric: tabular-nums` en números. Se cargan sólo los pesos que se usan (a medir; hoy se piden 4 de Barlow y 4 de Inter).
- **Espaciado:** la escala actual `--sp-1…8` alcanza. Se agregan `--sp-10` (2.5 rem) y `--sp-12` (3 rem) para las secciones de la landing, y se reemplazan los `8px`/`12px`/`14px` sueltos.
- **Radios:** `--r-s` .375 rem (chips), `--r-m` .5625 rem (campos, hoy suelto), `--r` .6875 rem (tarjetas, el de siempre), `--r-full` (píldoras y pistas de barra).
- **Sombras:** `--sombra` y `--sombra-alta` quedan igual. En fondo oscuro no se usan sombras: la profundidad sale del borde y de la superficie.
- **Movimiento:** `--dur-1` 120 ms (feedback al apretar), `--dur-2` 200 ms (entrada de pantalla, toast), `--dur-3` 280 ms (hoja, barras). `--ease-salida` `cubic-bezier(.16,1,.3,1)` (tomado de Stitch) y `--ease-entrada` `cubic-bezier(.3,0,.8,.15)` para lo que se va.

## Componentes base

`.btn` / `.btn.sec` (sin cambio de forma, sólo tokens) · `.tarj` + `.tarj.acento` (filete de 3 px en `--primario`) · `.tarj.tocable` (con levantar en hover) · `.chip` (sube/baja/sin/primario) · `.cifra` (número grande, unidad en `--primario`, etiqueta debajo) · `.barra` y `.zona-barra` con `.meta` (una línea vertical en la posición de la meta) · `.eyebrow` (ya existe) · `.campo` · hoja, velo y toast (ya existen, pasan a tokens de movimiento).

## Animaciones permitidas

Sólo `transform` y `opacity`, y sólo estas:

1. **Apretar:** `scale(.97)` en `--dur-1` (ya existe).
2. **Entrada de pantalla:** `.pant.on` entra con opacidad 0→1 en `--dur-2`. Una vez por navegación. Sin `translateY` (decidido midiendo en T5): con transform el navegador arma una capa del tamaño de la pantalla y suma frames largos en el primer recorrido con CPU 4x; además un ancestro transformado re-ancla a los hijos `position:fixed` (teclado de MEDIR).
3. **Relleno de barras:** `scaleX(0)`→1 con origen a la izquierda, en `--dur-3`, al dibujar la barra por primera vez.
4. **Levantar en hover** (`@media (hover:hover)`): `translateY(-2px)` + la opacidad de un `::after` que lleva `--sombra-alta`.
5. **Hoja, velo y toast:** los que ya hay, con tokens.
6. ~~**Landing:** los beneficios entran uno tras otro.~~ **Descartada en T7:** medida en Lighthouse mobile subía el LCP ~+316 ms (+2,6 %); sin ella el LCP queda igual que antes.

**Prohibido:** animar `width`, `height`, `top/left`, `box-shadow`, `background`, `filter`, `backdrop-filter`; `transition: all`; animaciones infinitas (salvo un spinner si alguna vez hace falta); parallax; marquee.

**`prefers-reduced-motion: reduce`:** se mantiene la regla global de `base.css`. Todas las animaciones se escriben con keyframes `from` (sin `to` ni `fill-mode: both`): así, con `animation: none` el elemento queda en su estado final y nunca invisible.

**Lo garantiza un test** (`tests/estilosTokens.test.js`): no hay hex fuera de `tokens.css`; todo `var(--x)` usado está definido; las propiedades de toda `transition` y de todo `@keyframes` están en {transform, opacity}; no hay `transition: all`; y el contraste de `--sobre-club` sobre `--club` por defecto es ≥4.5:1 (se calcula leyendo `tokens.css`).

## Fuera de alcance

- **Cargar el color desde la base** (`clubes.color_primario` + `check` de hex + función pura que valide el contraste y elija `--sobre-club`). Lleva migración y RLS: es otro spec. Acá sólo queda el punto de enganche: se setean dos variables en `:root`.
- Tema oscuro para la app, íconos nuevos y rediseño de pantallas.
