# Plan: identidad visual

Spec: `docs/superpowers/specs/2026-09-20-identidad-visual-design.md`. Rama `feat/identidad-visual`. Un commit por task; antes de cada commit, `npm run test:q`. Los refactors (T2, T3) no llevan cambios visibles; las features (T4–T8), sí.

**Verificación visual en cada task con cambio visible:** preview `app` (`.claude/launch.json`), capturas a 375 px y a 1280 px de login/landing, HOY, plantel y una hoja abierta. Comparar contra las capturas de T1.

---

### T1 — Medición base de rendimiento (antes)
- **Archivos:** `docs/rendimiento/identidad-visual.md` (nuevo).
- **Cómo:** con el servidor `app` corriendo:
  1. Lighthouse mobile (throttling por defecto), 3 corridas por URL, se anota la mediana: `/` (landing) y la app ya logueada en HOY. Métricas: Performance, LCP, CLS, TBT.
  2. En el preview: bytes transferidos de CSS y de fuentes (`read_network_requests`).
  3. Recorrido con `PerformanceObserver` de tipo `long-animation-frame`: 10 cambios de pantalla, abrir/cerrar la hoja 5 veces, scroll del plantel. Se anota cuántos frames pasan de 50 ms y el peor.
  4. Capturas de referencia (375 y 1280) en la carpeta de scratch, no en git.
- **Aceptación:** la tabla "antes" completa, con el snippet de medición y el comando de Lighthouse copiados en el doc para repetir igual en T9.
- **Tests:** ninguno.

### T2 — refactor: el color del club como variable
- **Archivos:** `public/css/tokens.css`, `base.css`, `layout.css`, `componentes.css`, `publico.css`; `src/ui/pantallas/coordPanorama.js` (comentario que nombra `--rojo`).
- **Qué:** `--club` y `--sobre-club` en `:root`; `--primario`, `--primario-osc`, `--primario-cl` y `--primario-brillo` derivados con `color-mix`; reemplazo mecánico de `--rojo*` → `--primario*`. El color por defecto se mantiene idéntico (`#D9122E`), así que no cambia ningún píxel salvo lo que redondee `color-mix` en `-osc`/`-cl` (verificar el hex resultante contra el actual; si difiere en más de 1–2 unidades por canal, ajustar el porcentaje).
- **Aceptación:** `grep -r "\-\-rojo" public src` vacío. Capturas iguales a T1. Cambiar `--club` a `#1565C0` en devtools recolorea botones, eyebrow, barras y foco de toda la app.
- **Tests:** `tests/estilosTokens.test.js` (nuevo) con `todo var(--x) usado está definido en tokens.css` y `el texto por defecto sobre el color del club llega a 4.5:1`.

### T3 — refactor: hex sueltos y medidas a tokens
- **Archivos:** los 4 CSS + `tokens.css`.
- **Qué:** los `#fff`, `#EFECE6`, `#C9C5BE`, fondos de chip y grises sueltos pasan a tokens (spec, sección Neutros). Radios `--r-s/--r-m/--r-full`; `8px/12px/14px` → `--sp-*`; `'IBM Plex Mono'` literal → `var(--ff-mono)`.
- **Aceptación:** capturas iguales a T1.
- **Tests:** en `estilosTokens.test.js`, `no hay colores hex fuera de tokens.css`.

### T4 — Tokens de movimiento y la regla transform/opacity
- **Archivos:** `tokens.css` (`--dur-1..3`, `--ease-salida`, `--ease-entrada`), `layout.css` (velo, hoja, toast), `componentes.css`.
- **Qué:** todas las transiciones pasan a tokens. La del `summary::after` y las de `background` en `.btn` se revisan: el cambio de color al apretar pasa a ser instantáneo (sólo se anima el `scale`).
- **Aceptación:** la hoja y el toast se sienten igual o más firmes. Con reduced-motion emulado, nada se anima y nada queda oculto.
- **Tests:** `las transiciones sólo animan transform u opacity`, `no hay transition: all`, `los keyframes sólo tocan transform u opacity`.

### T5 — Entrada de pantalla y relleno de barras
- **Archivos:** `layout.css` (`.pant.on`), `componentes.css` (`.barra .relleno`, `.zona-barra .relleno`).
- **Qué:** animaciones 2 y 3 del spec, con keyframes `from`. Las barras dejan de redondear el borde durante la escala si se ve deformado (se prueba primero; si se nota, el radio va en la pista con `overflow:hidden`, que ya existe).
- **Aceptación:** 10 navegaciones seguidas sin parpadeo; `volver` no repite la animación de una forma que moleste (si molesta, sólo se anima la entrada por `ir`, no por `volver`: se decide mirando).
- **Tests:** `los keyframes de entrada sólo definen from` (garantiza el estado final visible con reduced-motion).

### T6 — Componentes: cifra, meta en la barra, tarjeta con acento y tarjeta tocable
- **Archivos:** `componentes.css`, `base.css` (`tabular-nums`), la pantalla HOY (`src/ui/pantallas/…`, la que dibuja `.zona-barra`) y la de mediciones que muestre el dato principal.
- **Qué:** `.cifra`, `.zona-barra .meta`, `.tarj.acento`, `.tarj.tocable` (levantar con `::after`). HTML nuevo con `html\`\``; si la pantalla todavía usa `escaparHtml` y el cambio es chico, se migra en un commit aparte, antes.
- **Aceptación:** en HOY, el % del día se lee como cifra héroe y cada zona muestra dónde está la meta. A 375 px no hay scroll horizontal.
- **Tests:** si la posición de la meta se calcula (clamp 0–100), va en un módulo puro de `src/data/` con `la meta se dibuja dentro de la pista con valores fuera de rango` y `sin meta no se dibuja la marca`.

### T7 — Landing con la profundidad de Stitch
- **Archivos:** `tokens.css` (`--pub-*`), `publico.css`, `layout.css` (escritorio de la landing).
- **Qué:** fondo y tarjetas más profundos, resplandor radial estático con `--primario-brillo` detrás del hero, filete de acento en `.ben` y entrada escalonada de los beneficios (animación 6). No se copia markup de Stitch: se reestilan las clases existentes.
- **Aceptación:** contraste ≥4.5:1 de `--gris-osc` sobre `--pub-tarjeta` (anotado en el comentario del token). LCP de la landing no empeora respecto de T1.
- **Tests:** en `estilosTokens.test.js`, `el texto secundario de la landing llega a 4.5:1 sobre su tarjeta`.

### T8 — Fuentes: sólo los pesos que se usan
- **Archivos:** `public/index.html` (URL de Google Fonts).
- **Qué:** se cruzan los `font-weight` por familia en los 4 CSS y se sacan los pesos que no se usan (candidatos: Barlow 400/500, Inter 700 si no aparece).
- **Aceptación:** bytes de fuentes menores que en T1, sin texto en faux-bold (comparar capturas).
- **Tests:** `cada peso pedido a Google Fonts se usa en algún CSS` (lee `index.html` y los CSS).

### T9 — Medición después y cierre
- **Archivos:** `docs/rendimiento/identidad-visual.md`.
- **Qué:** repetir T1 al pie de la letra y completar la columna "después" con el delta.
- **Aceptación:** LCP, CLS y TBT sin regresión (tolerancia: ±5 % en LCP y TBT, CLS igual o menor). Cero frames nuevos de >50 ms atribuibles a animaciones. Si algo empeora, se corrige antes de cerrar.
- **Tests:** ninguno nuevo; `npm run test:q` en verde.

---

Después de T9: review final de la rama (Opus) y merge. El color desde la base (`clubes.color_primario`) queda para otro spec.
