# Home inmersiva del portal — plan

> **Para quien ejecute:** usar superpowers:executing-plans (en la sesión, sin subagentes, como pide `CLAUDE.md`). Una task = un commit. Antes de cada commit: `npm run test:q`.

**Goal:** que la home (`/`) se vea y se ordene como la del sitio de Newell's, con video de fondo y nuestros datos reales.
**Arquitectura:** lógica de decisión pura en `src/data/heroVideo.js`; armado de HTML y comportamiento en `src/ui/portalHeroVideo.js`; estilos en `portal.css` y cortes de ancho en `layout.css`. Sin librerías nuevas.
**Spec:** `docs/superpowers/specs/2026-10-21-portal-home-inmersiva-design.md` (leerlo: decide qué NO se hace).

## Restricciones globales
- Sin datos inventados (cifras, historia, plantel). Sección sin dato = oculta.
- Sólo tokens de `tokens.css` (nada de colores literales). Sólo se animan `transform` y `opacity`. Sin script inline nuevo (mismo import map, mismo hash de CSP).
- Texto y botones del hero nunca esperan al video (son el LCP). Video ≤ 4 MB, poster webp ≤ 150 KB.
- Voseo rioplatense; comentarios explican el porqué. Refactor y feature no van en el mismo commit.

## Review Focus (cada línea tiene su test en la task indicada)
1. `heroVideo: null` → hero rojo/negro de hoy, con título y botones (T3).
2. `src` o `poster` fuera de `/public/portal/` → rechazado (T1).
3. `prefers-reduced-motion`, `saveData` o conexión `slow-2g`/`2g` → sólo el poster; no se pide el mp4 (T1).
4. El video da error al cargar → queda el poster, los botones siguen andando (T3).
5. Sin `IntersectionObserver` → el encabezado queda negro y el video no se pausa, sin romper nada (T3, T4).

---

### Task 1: Dato y decisión del video (puro)
**Files:** Create `src/data/heroVideo.js`, `tests/heroVideo.test.js`. Modify `src/data/portal.js` (agregar `heroVideo` a `PORTAL`, con comentario `PENDIENTE`: placeholder del sitio oficial, reemplazar antes de publicar).
**Interfaces — Produces:** `heroVideoValido(v) → { src, poster, alt } | null`; `debeCargarVideo({ movimientoReducido, ahorroDeDatos, conexion }) → boolean`.
**Aceptación:** `src` y `poster` sólo bajo `/public/portal/` (`.mp4`/`.webm`; `.webp`/`.jpg`/`.png`), `alt` no vacío; `debeCargarVideo` es `false` si hay movimiento reducido, ahorro de datos o conexión `slow-2g`/`2g`.
**Tests:** `heroVideoValido acepta uno propio`, `rechaza rutas de otro sitio y sin alt`, `rechaza null`, `debeCargarVideo es false con movimiento reducido`, `…con saveData`, `…con 2g`, `…es true sin restricciones`. Comprobar que `portal.js` no importa de `ui/` (lo exige `arquitectura.test.js`).
**Commit:** `feat(portal): validación y decisión del video del hero`

### Task 2: Archivos del placeholder y CSP
**Files:** Create `public/portal/hero-placeholder.mp4`, `public/portal/hero-placeholder.webp`. Modify `vercel.json` (`media-src 'self' blob:`), `tests/csp.test.js` (el test de `media-src` pasa a esperar `['\'self\'', 'blob:']`), `scripts/servir.mjs` (tipos `.mp4`/`.webm` si faltan). Modify `src/data/portal.js` (`heroVideo` apunta a esos archivos, `alt` que cuente qué se ve: vista aérea del estadio).
**Pasos:** bajar `https://www.newellsoldboys.com.ar/videos/hero-drone.mp4` (3,2 MB, autorizado por el usuario como placeholder) a una carpeta nueva; el poster se genera del primer cuadro (ffmpeg si está; si no, canvas en el navegador) y se achica a ≤150 KB.
**Aceptación:** `servir.mjs` entrega el mp4 con `Content-Type: video/mp4` y la CSP nueva; `.vercelignore` no lo excluye.
**Tests:** `tests/heroVideo.test.js` agrega `los archivos de PORTAL.heroVideo existen y pesan lo permitido` (lee el disco).
**Commit:** `feat(portal): video placeholder del hero y media-src self`

### Task 3: Hero a pantalla completa
**Files:** Create `src/ui/portalHeroVideo.js`. Modify `public/portal.html` (`#heroe` contiene el contenedor del fondo y la clase `con-hero` en `#publico`), `src/ui/portal.js` (hero lo pinta con el fondo; los textos del hero no cambian: eyebrow, h1 "Básquet formativo de Newell's" y bajada de hoy; el "El semillero del Coloso" de la maqueta era ilustrativo), `public/css/portal.css`, `public/css/layout.css`.
**Interfaces — Produces:** `htmlFondoHero(video) → html` (poster como `<img>` + `<video muted playsinline loop preload="none">` sin `src`, con el `src` en `data-src`; `html` vacío si `video` es null); `iniciarVideoHero(contenedor, entorno)` (si `debeCargarVideo`, asigna `src` y `play()`; pausa fuera de pantalla con IntersectionObserver; en `error` saca el `<video>` y deja el poster).
**Aceptación:** `#heroe` mide `100svh`, velo oscuro degradado para contraste AA del texto; las dos acciones y el h1 entran en 360×640 y con letra agrandada; con `heroVideo: null` se ve el hero rojo/negro actual; el `<video>` no pide el mp4 con movimiento reducido.
**Tests (`tests/portalHeroVideo.test.js`):** `htmlFondoHero sin video devuelve vacío`, `…pone poster y data-src y no src`, `…escapa el alt`, `iniciarVideoHero no asigna src con movimiento reducido`, `…quita el video si falla`, `…no revienta sin IntersectionObserver`. Actualizar `tests/portalPagina.test.js` si el hero cambia de marcado.
**Commit:** `feat(portal): hero a pantalla completa con video de fondo`

### Task 4: Encabezado transparente sobre el hero — DESCARTADA (ruling de la ejecución)
> El encabezado ya quedó transparente y flotando sobre el hero en la Task 3 (`position:absolute`, se va con el hero, como el encabezado de antes). Volverlo fijo y negro al scrollear choca con la barra de acciones, que en compu flota fija arriba (`top:0`) y es lo que las familias más usan; y en el celular suma una fila fija de ~90 px. Costo si es un error: falta el encabezado sólido al scrollear, que nunca existió. Lo de abajo queda como referencia.
**Files:** Modify `src/ui/portalMarco.js` (`iniciarEncabezadoSobreHero(hero)`, sólo si `#publico.con-hero`), `public/css/portal.css`, `public/css/layout.css`.
**Aceptación:** sobre el hero el encabezado es transparente y pasa a negro cuando el hero sale de pantalla (clase `solido`, sin leer scroll); sin IntersectionObserver queda negro desde el inicio; el HTML del encabezado sigue idéntico en las cinco páginas (`paginasPortal.test.js` lo comprueba).
**Tests (`tests/portalMarco.test.js`):** `el encabezado arranca solido sin IntersectionObserver`, `queda transparente mientras se ve el hero`.
**Commit:** `feat(portal): encabezado transparente sobre el hero`

### Task 5: Banda roja y noticias del inicio
**Files:** Modify `public/portal.html` (banda `#banda` entre el hero y las noticias), `src/ui/portal.js` (constante `TEXTO_BANDA = 'ANOTATE'`; `htmlBanda()`), `src/ui/portalNoticias.js` (`iniciarUltimasNoticias` pide 4), `public/css/portal.css`, `public/css/layout.css` (la primera tarjeta ocupa el ancho grande en compu).
**Aceptación:** banda roja a todo el ancho, letras grandes repetidas, **quieta** (sin `@keyframes` ni `infinite`); noticias: 1 grande + 3 chicas con foto, etiqueta, título en mayúscula, fecha y "LEER →"; sin noticias, la sección sigue oculta.
**Tests:** `htmlBanda repite el texto y no anima`, `la home pide 4 noticias` (en `portalNoticias.test.js`; ajustar el que hoy espera 3).
**Commit:** `feat(portal): banda roja y noticias destacadas en el inicio`

### Task 6: "Lo que viene" y sede
**Files:** Modify `public/portal.html` (sección `#sede` después de `#categorias`), `src/ui/portal.js` (`htmlSedeInicio(sede)` con `sedeValida`; `htmlProximo` con la fecha enorme), `public/css/portal.css`, `public/css/layout.css`.
**Aceptación:** "Lo que viene" con bloque oscuro (fecha grande, cuándo y dónde, `cuandoEs`), oculto sin evento; sede con nombre, dirección y "Cómo llegar" (datos de `PORTAL.sede`, sin capacidad ni cifras); oculta sin sede válida.
**Tests:** `htmlSedeInicio muestra nombre, dirección y mapa`, `…sin sede devuelve vacío`; en `portalPagina.test.js` el orden pasa a `heroe, banda, noticias, proximo, categorias, sede, recaudacion, colaborar, formularios, dudas, club, sponsors` (cambio a propósito, anotarlo en el commit).
**Commit:** `feat(portal): lo que viene y la sede al estilo del sitio del club`

### Task 7: Documentación y verificación final
**Files:** Modify `DESIGN.md` (excepción del video con sus condiciones, y qué del sitio oficial se copió y qué no), `docs/SEGURIDAD-LANZAMIENTO.md` (pendiente: reemplazar el video del club antes de publicar), `tests/estilosTokens.test.js` (sigue permitiendo una sola `infinite` en `publico.css`; la banda y el hero no suman ninguna).
**Verificación:** `npm run test:q` verde; navegador en 360×640 y 1440×900 (acciones visibles, sin scroll horizontal); `prefers-reduced-motion` emulado (poster fijo); sin `heroVideo` (hero rojo/negro); sin conexión a la base (noticias y calendario ocultos); Lighthouse mobile antes/después, el LCP no sube más de ~300 ms (si sube, el video sólo carga en pantallas anchas).
**Commit:** `docs(portal): excepción del video del hero y pendiente de lanzamiento`
