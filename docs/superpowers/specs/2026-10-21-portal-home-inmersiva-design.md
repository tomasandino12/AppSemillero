# Home inmersiva del portal (estilo sitio de Newell's) — diseño

Fecha: 2026-10-21 · Referencia: newellsoldboys.com.ar · Base: rama `feat/portal-multipagina`

## Por qué

El portal ya tiene cinco páginas con la identidad rojinegra (spec `2026-10-21-portal-multipagina-design.md`), pero la **home** todavía no se siente como la del sitio oficial: el sitio de Newell's abre con un video a pantalla completa, una banda roja con letras grandes, noticias en tarjetas con foto, un bloque de "próximo partido", una sección del estadio y el pie negro. El club quiere esa sensación, con **nuestra información real** (básquet formativo, categorías, sede, formularios).

## Objetivos

1. Home que se parece al sitio oficial en lo que se ve y en el orden: hero a pantalla completa con video, banda roja, noticias, lo que viene, categorías, sede, colaborar y pie.
2. Las dos acciones (Inscribir / Quiero jugar, y Enviar comprobante) siguen **en el primer pantallazo** de un celular de 360×640, con la misma regla de hoy.
3. Noticias con el patrón del original: una grande y tres chicas en la home; foto, etiqueta roja, título en mayúscula condensada, fecha y "LEER →".
4. Todo lo que anda sigue andando (formularios, calendario, noticias, CSP, URLs, tests).

## No objetivos / anti-objetivos

- **No se inventa nada**: sin cifras (títulos, socios, años), sin historia, sin línea de tiempo, sin plantel ni profes. Las secciones del original que necesitan eso (cifras del club, historia, "hacete socio" con precios) **no se hacen**. Lo que no tiene dato queda oculto, nunca "Próximamente".
- Sin cuenta regresiva por segundo, sin contadores animados, sin parallax, sin cinta que corre. Es decir, lo que ya prohíbe `DESIGN.md`.
- No se cambia la base de datos, los formularios ni el panel de coordinación.
- No se agregan librerías ni fuentes (sigue Barlow Condensed + Inter, propias).

## Decisiones tomadas por el usuario

- Hero **A**: video/foto de fondo a pantalla completa (elegido en la maqueta del 21/10).
- Mientras no haya material propio, de **placeholder** se usa el video del hero del sitio oficial (`hero-drone.mp4`, 15 s, 1920×1080, 3,2 MB, con su poster). Se baja una vez y se sirve desde `public/portal/` (no se enlaza al sitio de afuera: la CSP no lo permite y le pasaría la IP de cada familia a otro servidor, que el proyecto evita).

## Decisiones mías (a confirmar al leer)

- **El video es un placeholder del club, no nuestro**: se marca `PENDIENTE` en `src/data/portal.js` (`heroVideo`) y en `docs/SEGURIDAD-LANZAMIENTO.md`. Antes de publicar hay que reemplazarlo por material propio (o tener el OK del club por escrito). Un test avisa si `heroVideo` apunta a un archivo que no existe.
- **Excepción acotada a `DESIGN.md`**: un video de fondo es movimiento continuo. Condiciones: `muted`, `playsinline`, sin controles; **se carga el poster primero** y el video sólo si no hay `prefers-reduced-motion`, ni `saveData`, ni conexión lenta; se pausa cuando el hero sale de pantalla (IntersectionObserver) y no hace loop infinito de CSS (es el atributo `loop` del video, una sola excepción documentada). Con reduced-motion queda el poster fijo. El texto y los botones del hero **nunca esperan al video** (son el LCP).
- Un velo oscuro degradado sobre el video garantiza contraste AA del texto blanco.
- **La banda roja** de letras grandes ("ANOTATE · ANOTATE…") va **quieta**, a todo el ancho, debajo del hero; el texto sale de una constante. No es un marquee.
- **"Lo que viene"** toma la forma del bloque de partido del original (fecha enorme, cuándo, dónde), con el próximo evento real del calendario; si no hay, se oculta.
- **Sede** ("Coloso del Parque" en el original): sección con el Estadio Cubierto "Claudio Newell", cómo llegar y los otros lugares de entrenamiento, con los datos de `PORTAL.sede`. Sin cifras de capacidad.
- Poster: una captura del primer cuadro del mismo video (`webp`, ≤150 KB).
- El header de la home es transparente sobre el hero y pasa a negro al scrollear (clase puesta por IntersectionObserver, sólo `opacity`/`background`, sin JS de scroll).

## Partes

1. **Datos** (`src/data/portal.js`): `heroVideo` `{ src, poster, alt }` o `null`; validación pura (`heroVideoValido`) con ruta sólo bajo `/public/portal/`, como `fotoValida`. Test.
2. **Marco y hero** (`portal.html`, `src/ui/portal.js`, `portalMarco.js`, `portal.css`, `layout.css`): hero 100svh, video + poster + velo, título, bajada y las dos tarjetas de acción; header transparente→negro.
3. **Banda roja y noticias**: banda estática; noticias de la home en grilla 1 grande + 3 chicas (CSS sobre las tarjetas que ya existen, sin tocar `/noticias`).
4. **Lo que viene y sede** reestilizados como el original.
5. **Comportamiento del video** (`src/ui/portalHeroVideo.js`): carga diferida según reduced-motion/saveData, pausa fuera de pantalla. Funciones de decisión puras y con test.
6. **Docs**: `DESIGN.md` (excepción del video y qué se copió y qué no), `SEGURIDAD-LANZAMIENTO.md` (pendiente del video), `docs/SEO.md` si cambia el `og:image`.

## Restricciones

- CSP: hoy es `media-src blob:`; se le suma `'self'` en `vercel.json` y se actualiza `tests/csp.test.js`. Sin script inline nuevo.
- Sin colores literales: todo por tokens (el test de `DESIGN.md` lo verifica).
- `.vercelignore` no excluye `public/portal/`.
- Rendimiento: el video no puede empeorar el LCP de la home (medir con Lighthouse mobile antes y después; si sube más de ~300 ms, el video sólo carga en pantallas anchas).
- Peso: video ≤ 4 MB.

## A criterio del implementador

Alturas y espaciados exactos, easing del cambio de header, el texto de la banda roja (propuesta: "ANOTATE"), cómo se parte la grilla de noticias en compu, y el recorte del poster.

## Verificación

`npm run test:q` en verde; home en 360×640 y 1440×900 con las dos acciones visibles; reduced-motion emulado (poster fijo, todo visible); sin conexión a la base (noticias y calendario ocultos, el resto igual); sin `heroVideo` (cae al hero rojo/negro de hoy).
