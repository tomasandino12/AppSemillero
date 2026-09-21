# Plan: rediseño de RECURSOS (ideas de Stitch)

Objetivo: llevar la pestaña **Jugadores** de RECURSOS al diseño que propuso Stitch (tarjeta con miniatura y datos, filosofía arriba, panel de resultados abajo) sin romper la regla de privacidad: **el profe ve cuántos, nunca quién**.

## Qué se toma y qué no

| Idea de Stitch | Decisión |
|---|---|
| Tarjeta alargada con miniatura 16:9 y botón play | Sí. Miniatura de YouTube (`i.ytimg.com/vi/<id>/mqdefault.jpg`); sin YouTube, un fondo con ícono según el tipo de link (Drive, PDF, otro). |
| Eyebrow con tipo + fecha, dos cajitas "Frecuencia / Dedicación" | Sí. Datos nuevos que carga el profe (opcionales). |
| Duración del video (08:42) | No: pedirla a YouTube exige su API. La "dedicación" en minutos la reemplaza. |
| Botones: Ver video (rojo) + Material (secundario), Enviar a más (negro, ancho completo) | Sí. |
| Tarjeta de filosofía arriba + tipos de material aceptados | Sí, reemplaza el párrafo actual. Sólo links (YouTube no listado, Drive, PDF): no hay almacenamiento de archivos. |
| Chips de filtro por tipo (Todos, Tiro, Pies…) | Sí, con conteo. |
| "Ofrecer un recurso" en el encabezado | Sí en escritorio; en celular sigue en el pie fijo (DESIGN.md). |
| Barra "abrieron X de Y" por recurso | Sí, **agregado y anónimo** (ver Task 4). |
| "11 lo practicaron" | No por ahora: no hay dato. Requeriría que el jugador marque "lo hice"; queda anotado como idea. |
| Panel de impacto: abrieron / recurso más consultado / tendencia | Sí, sin nombres. |
| "Mayor constancia voluntaria: Facundo Rossi" | **No.** Nombrar a un chico es exactamente el control que la pantalla promete no ejercer. |

Denominador honesto: "abrieron" sólo puede contar a jugadores **con cuenta** en la app. El panel lo dice ("de los 14 con cuenta"), no inventa sobre los 31.

## Tasks (una por commit)

### Task 1 — Migración 0033: datos del recurso
- Archivos: `supabase/migrations/0033_recurso_metadatos.sql`, `src/data/limites.js` si hace falta, `tests/contratoRecurso.test.js`.
- `recurso` suma `tipo text` (lista cerrada: tiro, pies, manejo, fisico, lectura, otro), `frecuencia_semanal smallint` (1–7) y `minutos smallint` (1–180), todas nullable (`NULL` = no lo dijo). Grants por columna, nueva versión de `guardar_recurso` que acepta las tres claves del payload.
- Aceptación: la migración aplica en limpio; el test de contrato compara la lista de tipos y los rangos SQL contra el módulo JS (modelo: `contratoMaterial.test.js`).
- Tests: `contratoRecurso.test.js` → "los tipos de recurso coinciden con la migración", "los rangos de frecuencia y minutos coinciden".
- Pedir confirmación antes de `db push`.

### Task 2 — Lógica pura de recursos
- Archivos: `src/data/recursos.js` (nuevo), `src/data/youtube.js` (miniatura), `src/data/repos/recursos.js` (mapear columnas nuevas), `tests/recursos.test.js`, `tests/youtube.test.js`.
- `TIPOS_RECURSO` con etiqueta; `validarMetadatos` (usa `decimalEstricto`, rechaza fuera de rango, vacío → `null`); `contarPorTipo` y `filtrarPorTipo` para los chips; `urlDeMiniatura(enlace)` armada con el ID validado; `claseDeEnlace(enlace)` → youtube/drive/pdf/otro.
- Tests: "valida frecuencia y minutos con decimalEstricto", "vacío es null, no 0", "cuenta por tipo incluyendo sin tipo", "miniatura sólo con ID válido", "clasifica links de Drive y PDF".

### Task 3a — Refactor: `recursos.js` a `html\`\``
- Sólo migrar la pantalla de `escaparHtml` a `html` de `ui/html.js`. Sin cambios visibles. Commit de refactor aparte.
- Aceptación: `npm run test:q` verde, la pantalla se ve igual.

### Task 3b — Tarjeta nueva, filosofía, filtros y alta
- Archivos: `src/ui/pantallas/recursos.js`, `public/css/componentes.css`, `vercel.json` (CSP `img-src` suma `https://i.ytimg.com`).
- Grilla de tarjetas (1 columna en celular, 2–3 en escritorio), tarjeta de filosofía con tipos aceptados, chips por tipo, formulario de alta con tipo / veces por semana / minutos. Leer `DESIGN.md` antes: tokens, hover con brillo, botones rectos rojo/negro.
- Aceptación: verificado en el navegador en claro y oscuro, celular y escritorio; un recurso viejo sin metadatos se ve bien (sin cajitas vacías).
- Tests: extender `estilosTextoLargo.test.js` si aplica a la tarjeta nueva.

### Task 4 — Migración 0034: aperturas anónimas
- Archivos: `supabase/migrations/0034_apertura_recurso.sql`, `src/data/repos/recursos.js`, `src/data/repos/miCuenta.js` (o el repo del jugador), `src/ui/pantallas/jugRecursos.js`, `tests/verificarAperturaRecurso.sql`.
- Tabla `apertura_recurso (recurso_id, jugador_id, primera_vez)`, unique por par. El jugador sólo inserta vía RPC `registrar_apertura(recurso_id)` y sólo para un recurso que se le envió. **El staff no tiene `select` sobre la tabla**: lee por RPC `resumen_recursos(club_id, plantel_id)` que devuelve sólo conteos (enviados, con cuenta, abrieron) por recurso.
- En `jugRecursos.js`, abrir video o material registra la apertura (una vez, sin bloquear si falla) y un texto chico le avisa al chico: "Tu profe ve cuántos abrieron cada recurso, no quién".
- Aceptación: el script SQL prueba que un profe no puede leer filas individuales, que un jugador no registra aperturas de recursos ajenos, y que el resumen no expone IDs de jugadores.
- Actualizar el comentario de `tarjetaRecurso` (hoy dice "sin marcas de lectura") y `docs/SEGURIDAD-LANZAMIENTO.md`.

### Task 5 — Barra de alcance y panel de impacto
- Archivos: `src/data/recursos.js` (`resumenDeImpacto`, pura), `src/ui/pantallas/recursos.js`, `public/css/componentes.css`, `tests/recursos.test.js`.
- Por tarjeta: "N jugadores · abrieron X de los Y con cuenta" con barra. Al pie: recursos ofrecidos, jugadores que abrieron al menos uno, recurso más abierto, comparación con el mes anterior. Sin nombres en ningún lado.
- Tests: "sin jugadores con cuenta no calcula porcentaje (muestra 'sin datos')", "el más abierto desempata por más reciente", "tendencia null si no hay mes anterior".
- Aceptación: `npm run test:q` verde, verificado en navegador, `graphify update .`.

## Fuera de alcance
Subir archivos o grabaciones del celular (necesita Storage), "lo practicaron", notificaciones push, pestaña Ejercicios.
