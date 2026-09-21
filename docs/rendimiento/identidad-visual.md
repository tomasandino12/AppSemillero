# Rendimiento: identidad visual

Medición de la rama `feat/identidad-visual` (spec y plan en `docs/superpowers/`). Se mide **antes** (T1, sobre `3e5e082`) y **después** (T9), con el mismo procedimiento.

## Cómo se mide

Todo corre contra el preview `app` (`.claude/launch.json`, puerto 5173) y desde la raíz del repo. Chrome: el instalado en la PC (`CHROME` para cambiarlo).

**Ojo con la URL:** el servidor de desarrollo sirve la landing en `/public/` (en `/` muestra un listado de carpetas y Lighthouse mediría eso). En producción Vercel la sirve en `/`.

1. **Lighthouse mobile** (throttling por defecto), 3 corridas, se anota la mediana:
   ```
   for i in 1 2 3; do npx -y lighthouse@12.8.2 http://localhost:5173/public/ --form-factor=mobile --only-categories=performance --output=json --output-path=.claude/worktrees/_galeria/salida/lh/<antes|despues>-$i.json --chrome-flags="--headless=new --no-sandbox" --quiet; done
   node docs/rendimiento/resumen-lh.mjs <antes|despues>
   ```
2. **Bytes de CSS y fuentes**: en la landing, `performance.getEntriesByType('resource')` sumando `encodedBodySize` de `/public/css/*.css` y de `fonts.gstatic.com`.
3. **Frames largos** con CPU 4x (gama baja) a 375 px: 10 cambios de pantalla, abrir y cerrar la hoja 5 veces, scroll del plantel; se corre 3 veces y se cuentan los frames de `long-animation-frame` (>50 ms) y los de `requestAnimationFrame` de más de 25 ms:
   ```
   npm i --no-save puppeteer-core          # una vez; no toca package.json
   node docs/rendimiento/hacer-galeria.mjs
   node docs/rendimiento/herramienta.mjs recorrido
   ```
4. **Comparación píxel a píxel de los refactors** (T2, T3): `herramienta.mjs base` guarda los estilos computados de cada elemento en 5 vistas × 375 y 1280 px; `herramienta.mjs comparar` lista lo que cambió. `herramienta.mjs capturas <carpeta>` saca los PNG.

**Por qué una galería y no la app real:** HOY, PLANTEL y la hoja necesitan una sesión de Supabase. `hacer-galeria.mjs` toma el `index.html` real y le inyecta el marcado de esas pantallas (copiado de los templates) con datos falsos, sirviéndolo desde el mismo preview. Si cambia el marcado de una pantalla, hay que reflejarlo ahí.

## Antes (T1)

**Landing, Lighthouse mobile, mediana de 3** (corridas: 58/58/58):

| Métrica | Antes |
|---|---|
| Performance | 58 |
| LCP | 12 319 ms (12 333 / 12 319 / 12 021) |
| FCP | 7 482 ms |
| CLS | 0,036 (0,036 / 0,015 / 0,036) |
| TBT | 14 ms |

Los valores absolutos son malos por el entorno, no por el CSS: el servidor de desarrollo habla HTTP/1.1 y la app carga ~100 módulos ES sin bundle, y Lighthouse los simula sobre 4G lenta. Sirven para comparar antes/después, no como cifra de producción.

**Peso transferido (landing):**

| Recurso | Antes |
|---|---|
| CSS propio (5 archivos) | 68 091 B (tokens 2 700, base 2 424, layout 16 738, componentes 38 252, publico 7 977) |
| Fuentes | 166 104 B en 7 archivos: Barlow Condensed ×4 = 87 340 B, Inter ×1 = 48 256 B, IBM Plex Mono ×2 = 30 508 B |

Inter es una fuente variable: un solo archivo cubre todos los pesos, así que quitar pesos de Inter no ahorra bytes. El ahorro posible de T8 está en Barlow (4 archivos) e IBM Plex Mono (2).

**Recorrido con CPU 4x, 375 px** (3 corridas de ~810 frames):

| Corrida | Frames >50 ms (LoAF) | Peor LoAF | Frames >25 ms (rAF) | Peor frame rAF |
|---|---|---|---|---|
| 1 (en frío) | 1 | 60 ms | 4 | 67 ms |
| 2 | 0 | 0 | 0 | 14 ms |
| 3 | 0 | 0 | 0 | 14 ms |

La primera corrida incluye el arranque en frío del navegador; el criterio de T9 compara las corridas 2 y 3 y mira que la 1 no empeore.

## Hallazgos durante la rama

Cada uno se midió con Lighthouse mobile sobre la landing (1 corrida por variante; el entorno es tan estable que las 3 corridas de una misma variante difieren <2 %).

| Variante | FCP | LCP | Decisión |
|---|---|---|---|
| Antes de la rama (T1) | 7 482 | 12 319 | — |
| Fin de T6 (refactors + movimiento + cifra) | 7 331 | 11 876 | Sin regresión |
| T7 con el resplandor como `radial-gradient(… color-mix(…), transparent)` | 7 850 | 13 071 | **Descartado:** el `color-mix()` adentro del gradiente cuesta ~+450 ms de FCP y ~+900 ms de LCP |
| Mismo gradiente con `rgba()` literal | 7 545 | 12 318 | Sin costo, pero pierde el color del club |
| Resplandor en un `::before` con `var(--club)` y `opacity` | 7 706 | 12 633 | Adoptado (con la animación de las tarjetas) |
| Igual, **sin** la animación escalonada de `.ben` | 7 546 | 12 317 | **Adoptado:** la animación sumaba ~+316 ms de LCP (un párrafo de las tarjetas es el LCP y no cuenta hasta que se ve) |

**T8, pesos de fuente: no hay nada que quitar.** Cruzando `font-family` × `font-weight` de los CSS y mirando qué archivos descarga cada vista (`docs/rendimiento/fuentes.mjs`):

- La landing baja sólo Barlow 600 y 700 e Inter: el navegador ya pide de forma perezosa sólo las caras que se usan, así que quitar pesos del `<link>` no achica la landing.
- Las pantallas de la app usan los 4 pesos de Barlow (400 en HOY y en la hoja, 500 en PLANTEL y DATOS, 600, 700) y los 2 de IBM Plex Mono.
- Inter es una fuente variable: un solo archivo (48 KB) cubre 400–700, así que sacar pesos no ahorra un byte.
- Hallazgo para decidir aparte: se pide Plex Mono 500 y 600, pero ningún CSS declara 500. Los ~22 textos mono sin peso explícito (400) caen en el archivo 500 por la regla de emparejamiento de fuentes. Pedir 400 en lugar de 500 los aliviaría visualmente: es una decisión de diseño, no de rendimiento, y no se tocó.

Otras decisiones tomadas midiendo: la entrada de pantalla es sólo fade (con `translateY` sumaba frames largos en el recorrido con CPU 4x y re-ancla a los hijos `position:fixed`).

## Después (T9)

_Se completa al cerrar la rama._
