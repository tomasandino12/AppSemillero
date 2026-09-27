# Landing animada: escudo girando y grilla bento con demos

**Fecha:** 26/09/2026 · **Rama:** `feat/landing-animada` · **Plan:** `docs/superpowers/plans/2026-09-26-landing-animada.md`

## Por qué

La landing (`#v-landing` en `public/index.html`) cuenta seis ventajas con seis tarjetas de texto iguales. Las ventajas fuertes (el plantel que se arma solo, la curva de tiro, la medición, el historial que sobrevive al cambio de profe) se entienden mejor viéndolas que leyéndolas. La idea sale de los bloques "Bento" de Watermelon UI. Sus componentes son de React, Tailwind y Framer Motion, así que no se instalan: **se toman las ideas y se rehacen en CSS y JS vanilla**, con los tokens de siempre.

## Alcance

1. **Escudo con anillo de texto** en el hero de la landing, en lugar de la `.marca` chica. Las otras vistas públicas (ingresar, crear, etc.) mantienen su `.marca`.
2. **Grilla bento**: las mismas 6 tarjetas `.ben`, reordenadas, con distinto tamaño y 4 mini demos animadas.
3. **Excepción a la regla de movimiento** en `DESIGN.md`, con un test que la vigila.

Quedan afuera: cargar el nombre o el escudo del club desde la base (sigue fijo en el HTML como hoy, ver Deuda en `DESIGN.md`), cambios en la app por dentro y demos en las 2 tarjetas de texto.

## Regla de movimiento (cambio en DESIGN.md)

`DESIGN.md` prohíbe las animaciones infinitas. La excepción nueva es **una sola animación continua, sólo en `.publico`**: el giro del anillo del escudo. Condiciones:
- Anima sólo `transform`, y el keyframe sólo define `from` (`rotate(-360deg)`), así cumple el test que ya existe.
- Es lineal, con una vuelta de unos 25 s, en el token nuevo `--dur-giro`.
- Se pausa (`animation-play-state`) cuando el escudo sale de pantalla, con un IntersectionObserver.
- Con `prefers-reduced-motion`, `base.css` ya apaga todo y el anillo queda quieto y legible.

Las demos **no** hacen loop: se animan una vez al entrar en pantalla y quedan en su estado final.

## Escudo con anillo

- `escudo.png` al centro y, alrededor, un SVG inline con un `<textPath>` sobre un círculo. Texto: `BÁSQUET · NEWELL'S OLD BOYS ·`, en Barlow Condensed mayúscula, color `--gris-osc`.
- **Multi-club:** el `<text>` lleva `textLength` igual a la circunferencia y `lengthAdjust="spacing"`, así que cualquier nombre de club llena el anillo justo, sin cortarse ni dejar hueco.
- Accesibilidad: el SVG lleva `aria-hidden="true"` y el nombre del club sigue escrito como texto (subtítulo del hero). El `<img>` del escudo mantiene `alt=""` porque es decorativo.
- Tamaño: unos 9rem en el celular, arriba del `h1`. Desde 64rem, el hero pasa a dos columnas, con el texto a la izquierda y el escudo a la derecha, más grande (unos 14rem).

## Grilla bento

Orden en el HTML (también es el orden en el celular):

| # | Tarjeta | Demo | Celular (<40rem) | Tablet (40–64rem) | Compu (≥64rem, 3 col) |
|---|---|---|---|---|---|
| 1 | El plantel se arma solo | sí | 1 col | ancho completo (2) | 2 col |
| 2 | El trabajo no se pierde | sí | 1 col | ancho completo (2) | 1 col, alta (2 filas) |
| 3 | Estadísticas con historia | sí | 1 col | ancho completo (2) | 2 col |
| 4 | Mediciones en la cancha | sí | 1 col | 1 | 1 |
| 5 | Los ejercicios quedan en el club | no | 1 col | 1 | 1 |
| 6 | Pensada para el celular | no | 1 col | ancho completo (2) | 1 |

Las clases de tamaño (`.ben.ancha`, `.ben.alta`) y todos los `grid-column`/`grid-row` van en `layout.css`, dentro de los cortes de 40rem y 64rem que ya existen, prefijados con `.publico`. En el celular no hace falta ninguna regla.

## Las cuatro demos

Todas van escritas en HTML y SVG dentro de su `.ben`, arriba del título, **no las arma JS**. Todas llevan la etiqueta chica "ejemplo" y usan datos inventados, nunca de jugadores reales.

1. **El plantel se arma solo:** una mini planilla con 4×3 celdas en mono y grises, una flecha, y 5 chips de jugadores con número y apellido inventado (`#4 Gómez`, `#7 Ferreyra`, `#9 Ibarra`, `#11 Sosa`, `#15 Molina`) más `+ 9 más`. Los chips entran escalonados con `translateY` y `opacity`.
2. **Estadísticas con historia:** un SVG con una polilínea del % de tiro de campo en 10 partidos, de 31 a 44 %, con bajones en el medio (por ejemplo 31, 35, 29, 36, 38, 33, 40, 37, 42, 44). El trazo es `--primario`. Se "dibuja" con un rectángulo del color `--pub-tarjeta` que tapa la curva y se corre con `translateX`, porque `stroke-dashoffset` no está permitido. Después aparecen el punto final y la cifra `44 %`, en `--sobre-oscuro` y Plex Mono.
3. **Mediciones en la cancha:** "Salto CMJ" y una cifra grande que cuenta de 38 a 42 cm (JS con `requestAnimationFrame`, unos 800 ms). Al lado, un chip `+4 cm` en el verde "sube" para fondo oscuro. Con movimiento reducido, la cifra aparece directamente en 42.
4. **El trabajo no se pierde:** una línea vertical con tres nodos (`Sub-13 · 2025 · Profe A`, `Sub-14 · 2026 · Profe B`, `Sub-15 · 2027 · Profe C`). La línea se llena con `scaleY` y los nodos se prenden en secuencia (`opacity` y `scale`).

**Cuándo se animan:** mientras la tarjeta no está en pantalla, sus animaciones quedan en `paused` con `fill-mode: backwards`, o sea que se ve el primer cuadro. Un IntersectionObserver (umbral de unos 0.4) le pone `.en-vista` a la tarjeta, se desconecta y la animación corre una vez. Si el navegador no tiene IntersectionObserver, `.en-vista` se pone enseguida.

**LCP:** el texto de la tarjeta (`.t` y `.d`) nunca arranca oculto. Sólo se animan los gráficos de las demos. Se mantiene la entrada `subir-ben` que ya existe.

## Color y contraste

- Token nuevo `--sube-osc`: el verde "sube" para fondo oscuro, con al menos 4.5:1 sobre `--pub-tarjeta`. Se suma el par al test de contraste de la landing.
- El rojo del club (`--primario`) sobre oscuro da unos 3.5:1: sirve para la línea, el punto y los nodos (gráfico, pide 3:1), **no** para texto. El texto de las demos va en `--sobre-oscuro` o `--gris-osc`.
- Duraciones: `--dur-giro` para el anillo y `--dur-demo` (unos 900 ms) para las demos. No se escribe ninguna duración suelta.

## Código

- `public/index.html`: el hero con el escudo y el anillo, y las tarjetas reordenadas con sus demos.
- `public/css/publico.css`: estilos del escudo y de las demos. `public/css/layout.css`: la grilla bento por corte. `public/css/tokens.css`: `--dur-giro`, `--dur-demo` y `--sube-osc`.
- `src/ui/landingAnimada.js` (nuevo): `iniciarLandingAnimada()` con el observer de las demos, la pausa del anillo fuera de pantalla y el contador. Se llama desde `iniciarPublico` en `src/ui/publico.js`.
- `src/data/animacion.js` (nuevo, puro): `valorContado(desde, hasta, t)`, con easing de salida, redondeo y `t` limitado entre 0 y 1.

## Verificación

- `npm run test:q` en verde, con estos tests nuevos:
  - `tests/estilosTokens.test.js`: sólo `publico.css` tiene `infinite`, y una sola vez.
  - `tests/landing.test.js`: lee `index.html` y comprueba el anillo, las demos y el orden de las tarjetas.
  - `tests/animacion.test.js`: el contador.
- En el navegador (preview `app`, `/public/`) a 375, 768 y 1280 px: la grilla, las demos animándose una vez y el anillo pausado fuera de pantalla. Con movimiento reducido emulado, todo queda visible y en su estado final.
- Lighthouse mobile antes y después, con el procedimiento de `docs/rendimiento/identidad-visual.md` (3 corridas, mediana), anotado en `docs/rendimiento/landing-animada.md`. **Criterio: el LCP no empeora más de ~5 %.** Si empeora más, se recorta la demo que más cueste.
