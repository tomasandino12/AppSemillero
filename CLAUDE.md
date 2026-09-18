# App formativa (v3)

App móvil para clubes formadores de básquet (piloto: Newell's, multi-club desde el diseño). Importa las planillas .xlsx de la CABB, y maneja estadísticas, mediciones físicas, plan físico, biblioteca de ejercicios, inventario de material y coordinación de profes. **Hay datos de menores**: la privacidad no es opcional.

## Stack
- JS vanilla con módulos ES, **sin build ni framework**. El navegador sólo carga `/public/**` y `/src/**` (importmap en `public/index.html`; `supabase-js` y `xlsx` vendorizados en `public/vendor/`).
- Supabase (Postgres + RLS + Auth). Deploy estático en Vercel; `.vercelignore` deja afuera docs, supabase, tests y `*.md`.
- Tests con `node --test`, un archivo por módulo en `tests/`.

## Comandos
- `npm run test:q` — toda la suite, salida mínima (~300 bytes). **Usar este.** Si algo falla, correr sólo ese archivo: `node --test tests/<archivo>.test.js`.
- `npm test` — suite completa con salida TAP de ~60 KB. Evitarlo: gasta ~15k tokens por corrida.
- `npx supabase db push` — aplica migraciones a la base real. Pedir confirmación antes.

## Dónde está cada cosa
- `src/data/repositorio.js` (1.3k líneas): **único** acceso a Supabase. Leerlo por tramos (`offset`/`limit`) o consultar el grafo, nunca entero.
- `src/data/*.js`: lógica pura y testeable (validar, agrupar, preparar payloads). Todo lo nuevo que se pueda probar sin red va acá con su test.
- `src/parser/`: parsers de xlsx (`parserCabb.js`, `parserFisico.js`). Contrato en `PARSER.md`.
- `src/ui/main.js`: navegación (`registrarPantalla`, `ir`, `volver`, `refrescar`). `src/ui/pantallas/*.js`: una pantalla por archivo. `public/css/`: tokens + componentes.
- `supabase/migrations/`: 0001–0026, numeradas. `supabase/ESQUEMA.md` documenta el modelo (le faltan las tablas de 0020–0022). `docs/COORDINACION.md`: roles y despliegue.

## Reglas del proyecto
- **La seguridad la impone RLS, no la interfaz.** Roles: entrenador (sus planteles asignados), coordinador (agregados del club), o ambos.
- **Una migración aplicada no se edita**: se agrega una nueva. Tabla nueva = `revoke all` + `grant` mínimo por columna + RLS + trigger de sellado. Patrón de referencia: `0026_material.sql`. Hay un skill `/nueva-migracion` que lo aplica.
- `NULL` es "no se sabe", nunca `0`. Un jugador es único por club, no por categoría.
- Lo que viene de datos se escapa antes de ir al DOM.
- Los `.xlsx` reales de `tests/fixtures/` **no van a git** (nombres de menores); sólo `tests/fixtures/sintetico/`. Nunca abrirlos ni pegar sus nombres. Sin ellos, los tests que los usan se saltean.
- UI y comentarios en español rioplatense (voseo). Los comentarios explican el porqué, no el qué.
- `CAMBIOS.md` es histórico (v2→v3) y `docs/superpowers/` son planes y specs ya ejecutados: **no leerlos salvo que la tarea sea sobre ellos**.

## Cómo trabajar (ahorro de tokens)
- **Planes y specs cortos.** Esto tiene prioridad sobre el formato por defecto de `writing-plans`: spec de 1–2 páginas; plan de máximo ~10 KB, con una task por commit, cada una con archivos, criterio de aceptación y nombre de los tests a escribir. **No pegar código de implementación dentro del plan.** Si un cambio es chico y claro, no hace falta plan.
- **Ejecutar en la sesión, sin subagentes** (los sub-agentes arrancan sin contexto y salen caros). Único subagente aceptable: el review final de una rama larga.
- **Verificaciones por comando las corre Claude directo** (`test:q`, greps), sin ciclo implementer+reviewer.
- Modelo: Sonnet por defecto en este proyecto. Cambiar a Opus para diseño de specs, migraciones, RLS/RPC y el review final.
- Antes de leer varios archivos: `graphify query "<pregunta>" --budget 1500`. Después de cambiar código: `graphify update .` (sin LLM, gratis).
- Usar `Grep` y `Read` con `offset`/`limit` en vez de leer archivos enteros.
- Al cerrar una unidad de trabajo (commit hecho), sugerir `/clear` en vez de seguir en la misma sesión.
