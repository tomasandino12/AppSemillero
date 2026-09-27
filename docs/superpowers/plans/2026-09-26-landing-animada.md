# Plan: landing animada

**Spec:** `docs/superpowers/specs/2026-09-26-landing-animada-design.md` (leerla antes de arrancar).
**Rama:** `feat/landing-animada`. **Modelo:** Sonnet. Ejecutar en la sesión, sin subagentes.

## Reglas para todas las tasks

- Una task = un commit, que se hace apenas pasa la verificación (sin preguntar). Al final de cada task, `npm run test:q` en verde.
- Leer `DESIGN.md` (Tokens, Reglas duras, Componentes) antes de tocar CSS. Colores sólo como `var(--x)`. `transition` y `@keyframes` sólo con `transform`/`opacity`, y los keyframes sólo con `from`. Duraciones con `--dur-*` y easing con `--ease-*`. Media queries de ancho sólo en `layout.css`, prefijadas con `.publico`. Hover dentro de `@media (hover:hover)`.
- Espaciado y radios con `--sp-*` y `--r*`, sin `px` (salvo bordes de 1px).
- UI y comentarios en rioplatense. Los comentarios explican el porqué.
- Verificación visual con el preview `app` (`.claude/launch.json`) en `http://localhost:5173/public/`, a 375, 768 y 1280 px.
- Actualizar la tabla Estado al cerrar cada task.

## Estado

| Task | Estado | Commit |
|---|---|---|
| T1 Regla, tokens y medición base | hecha | (ver git log) |
| T2 Escudo con anillo | hecha | (ver git log) |
| T3 Grilla bento (sin demos) | hecha | (ver git log) |
| T4 Demos: plantel y estadísticas | hecha | (ver git log) |
| T5 Demos: mediciones y temporadas + contador | hecha | (ver git log) |
| T6 Medición final y DESIGN.md | hecha | (ver git log) |

---

## T1 Regla, tokens y medición base

**Archivos:** `DESIGN.md`, `public/css/tokens.css`, `tests/estilosTokens.test.js`, `docs/rendimiento/landing-animada.md` (nuevo).

- **Medición base, ANTES de tocar nada:** Lighthouse mobile ×3 contra `/public/`, con el procedimiento del punto 1 de `docs/rendimiento/identidad-visual.md`. Anotar la mediana de FCP, LCP, TBT, CLS y el puntaje en `docs/rendimiento/landing-animada.md`, en la sección "Antes", junto con el commit base.
- En `DESIGN.md`, dentro de "Lo que NO se hace": la excepción del anillo (una sola animación continua, sólo en `.publico`, con sus condiciones según la spec). En "Movimiento": las filas de `--dur-giro` y `--dur-demo`. En "Semánticos": `--sube-osc`.
- En `tokens.css`: `--dur-giro` (~25s), `--dur-demo` (~900ms) y `--sube-osc` (verde claro que llegue a 4.5:1 sobre `--pub-tarjeta`).
- Tests nuevos en `tests/estilosTokens.test.js`:
  - `'sólo publico.css tiene una animación infinite, y es una sola'`
  - sumar `['--sube-osc', '--pub-tarjeta']` a los pares de `'el texto de la landing llega a 4.5:1 sobre su tarjeta y su fondo'`.

**Aceptación:** `test:q` en verde, mediciones base anotadas y un commit `docs(diseño): excepción de movimiento para el escudo de la landing y tokens nuevos`.

## T2 Escudo con anillo

**Archivos:** `public/index.html` (sólo `#v-landing`), `public/css/publico.css`, `public/css/layout.css`, `src/ui/landingAnimada.js` (nuevo), `src/ui/publico.js`, `tests/landing.test.js` (nuevo).

- En `#v-landing`, cambiar la `.marca` por un bloque de escudo: el `<img>` de `escudo.png` y un SVG inline `aria-hidden="true"` con un círculo en `<defs>` y un `<text>` con `<textPath>`. El texto es `BÁSQUET · NEWELL'S OLD BOYS ·`, con `textLength` igual a la circunferencia del path y `lengthAdjust="spacing"`. Sumar al hero una línea de texto con el nombre del club, porque el SVG es decorativo.
- CSS: el SVG gira con `@keyframes` `from{transform:rotate(-360deg)}`, de forma lineal, infinita y en `--dur-giro`. El `transform-origin` va en el centro. La clase `.quieto` pone `animation-play-state:paused`.
- `layout.css`: desde 64rem, el hero en dos columnas (texto y escudo), con el escudo más grande.
- `landingAnimada.js`: exporta `iniciarLandingAnimada()`. Un IntersectionObserver pone o saca `.quieto` en el anillo según esté visible o no. Se llama una vez desde `iniciarPublico` en `publico.js`. Los helpers de UI que ya existen (`$` de `ui/dom.js`) se usan. **No importa nada de `repos/` ni `cliente.js`** (lo controla `tests/arquitectura.test.js`).
- Tests en `tests/landing.test.js`, que lee `index.html` con `readFileSync`, como `tests/metadatos.test.js`:
  - `'el anillo del escudo es decorativo (aria-hidden)'`
  - `'el texto del anillo usa textLength para llenar el círculo con cualquier nombre'`
  - `'el nombre del club también está como texto en el hero'`

**Aceptación:** el anillo gira en el preview y se pausa al scrollear fuera de pantalla (comprobarlo con `getComputedStyle(...).animationPlayState`). Con reduced-motion emulado queda quieto y legible. Las otras vistas públicas siguen con su `.marca`. Commit `feat(landing): escudo con anillo de texto girando`.

## T3 Grilla bento (sin demos)

**Archivos:** `public/index.html`, `public/css/layout.css`, `public/css/publico.css` (si hace falta), `tests/landing.test.js`.

- Reordenar las 6 `.ben` según la tabla de la spec (plantel, trabajo, estadísticas, mediciones, ejercicios, celular). Marcar las clases `.ancha` y `.alta` según la tabla y los `data-demo` en las 4 con demo (`plantel`, `temporadas`, `tiro`, `salto`).
- `layout.css`: entre 40 y 64rem, 2 columnas, con las `.ancha` y la 6 ocupando el ancho completo. Desde 64rem, 3 columnas: `.ancha` ocupa 2 columnas y `.alta` 2 filas. Ajustar las reglas que ya existen en las líneas ~370–377 en lugar de duplicarlas. Revisar que los `animation-delay` de `.ben:nth-child` sigan teniendo sentido con el orden nuevo.
- Tests en `tests/landing.test.js`:
  - `'la landing tiene 6 beneficios en el orden de la spec'`
  - `'4 beneficios llevan data-demo'`

**Aceptación:** las capturas a 375, 768 y 1280 px coinciden con la tabla, sin scroll horizontal ni huecos en la grilla. Commit `feat(landing): grilla bento de beneficios`.

## T4 Demos: plantel y estadísticas

**Archivos:** `public/index.html`, `public/css/publico.css`, `src/ui/landingAnimada.js`, `tests/landing.test.js`.

- **Marcado de la demo `plantel`:** la mini planilla, la flecha y los 5 chips con los nombres inventados de la spec, más `+ 9 más`.
- **Marcado de la demo `tiro`:** un SVG con la polilínea de los 10 valores de la spec, el rectángulo que tapa (con `fill` en `var(--pub-tarjeta)`), el punto final y la cifra `44 %`.
- Cada demo lleva su etiqueta "ejemplo" (`--gris-osc`, `--fs-115`).
- CSS de las demos: animaciones con `--dur-demo`, `fill-mode: backwards` y `paused` mientras la `.ben` no tenga `.en-vista`. Los chips escalonados. El tapa-curva sale con `translateX`. El punto y la cifra, con `opacity` al final.
- `landingAnimada.js`: un observer (umbral de ~0.4) que pone `.en-vista` en cada `.ben[data-demo]` y deja de observarla. Si no hay IntersectionObserver, `.en-vista` se pone enseguida.
- Tests:
  - `'cada demo dice ejemplo'`
  - `'la curva de tiro tiene 10 puntos y termina más arriba de donde empieza'`

**Aceptación:**
- Con 375 px y scroll, cada demo se anima una vez al aparecer y no se repite al volver a scrollear.
- Con reduced-motion, se ven en su estado final.
- El texto `.t` y `.d` de las tarjetas se ve desde el primer cuadro.

Commit `feat(landing): demos de plantel y curva de tiro`.

## T5 Demos: mediciones y temporadas + contador

**Archivos:** `src/data/animacion.js` (nuevo), `tests/animacion.test.js` (nuevo), `public/index.html`, `public/css/publico.css`, `src/ui/landingAnimada.js`, `tests/landing.test.js`.

- `animacion.js` (puro, sin DOM): `valorContado(desde, hasta, t)`, con easing de salida, entero y `t` limitado entre 0 y 1. Tests:
  - `'valorContado empieza en desde y termina en hasta'`
  - `'valorContado devuelve enteros'`
  - `'valorContado con t fuera de [0,1] se queda en los extremos'`
- **Demo `salto`:** la etiqueta "Salto CMJ", la cifra en Plex Mono con `42` escrito en el HTML (estado final) y el chip `+4 cm` en `--sube-osc`. Al entrar en vista, JS cuenta de 38 a 42 con `requestAnimationFrame` en `--dur-demo`, leyendo el token con `getComputedStyle`. Si `matchMedia('(prefers-reduced-motion: reduce)')` da true, no cuenta.
- **Demo `temporadas`:** la línea vertical y los 3 nodos de la spec. La línea se llena con `scaleY` desde arriba y los nodos se prenden escalonados con `opacity` y `scale`.
- Test en `tests/landing.test.js`: `'la cifra del salto está en su valor final en el HTML'`.

**Aceptación:** lo mismo que T4 para estas dos demos, y el conteo termina exacto en 42. Commit `feat(landing): demos de salto y temporadas`.

## T6 Medición final y DESIGN.md

**Archivos:** `docs/rendimiento/landing-animada.md`, `DESIGN.md`.

- Lighthouse mobile ×3, con el mismo procedimiento que en T1, anotado en la sección "Después", más la diferencia. **Si el LCP empeora más de ~5 %**, identificar la demo culpable (sacarla en local y volver a medir) y recortarla antes de cerrar.
- `DESIGN.md`, en "Componentes": una entrada corta sobre el escudo con anillo y las demos de la landing, con cuándo se animan, el "ejemplo", los datos inventados y que el texto nunca se oculta.
- `graphify update .`

**Aceptación:** `test:q` en verde, la medición anotada con la conclusión y un commit `docs(rendimiento): medición de la landing animada`. Después, proponer al usuario el merge a `main` (no mergear sin preguntar).
