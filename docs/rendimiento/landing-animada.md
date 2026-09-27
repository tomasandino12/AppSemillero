# Rendimiento: landing animada

Medición de la rama `feat/landing-animada` (spec y plan en `docs/superpowers/`). Mismo procedimiento que `identidad-visual.md` (punto 1): Lighthouse mobile ×3 contra `http://localhost:5173/public/`, mediana. Criterio: el LCP no empeora más de ~5 %.

## Antes (T1, sobre `a4673a7`)

| Métrica | Antes |
|---|---|
| Performance | 57 |
| LCP | 15 617 ms (15 317 / 15 617 / 15 619) |
| FCP | 8 489 ms (8 339 / 8 489 / 8 491) |
| CLS | 0,035 |
| TBT | 6 ms (14 / 5 / 6) |

Los valores absolutos son peores que los de `identidad-visual.md` por el estado de la máquina en el momento de medir; sólo sirven para comparar contra "Después" en la misma sesión.

## Después (T6, sobre `101b128`)

| Métrica | Antes | Después | Diferencia |
|---|---|---|---|
| Performance | 57 | 57 | 0 |
| LCP | 15 617 ms | 15 023 ms (14 730 / 15 025 / 15 023) | -594 ms (-3,8 %) |
| FCP | 8 489 ms | 8 412 ms | -77 ms |
| CLS | 0,035 | 0,026 | -0,009 |
| TBT | 6 ms | 26 ms (30 / 26 / 26) | +20 ms |

**Conclusión:** el criterio (LCP sin empeorar más de ~5 %) se cumple con margen: no hay demo que recortar. Las demos no ocultan texto y sólo animan `transform`/`opacity`, así que el párrafo que es el LCP se pinta desde el primer cuadro. El TBT sube unos 20 ms (JS de `landingAnimada.js` y los observers al arrancar), lejos de ser un problema (umbral "bueno" de Lighthouse: 200 ms). El LCP más bajo se debe en parte a que el hero ahora es más alto y el párrafo más grande queda en otra posición; sirve como "no empeoró", no como mejora atribuible.
