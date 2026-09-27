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

## Después (T6)

Pendiente.
