# App formativa (v3)

App móvil para clubes formadores de básquet (piloto: Newell's, multi-club desde el diseño). Importa las planillas .xlsx de la CABB, y maneja estadísticas, mediciones físicas, plan físico, biblioteca de ejercicios, inventario de material y coordinación de profes. **Hay datos de menores**: la privacidad no es opcional.

## Stack
- JS vanilla con módulos ES, **sin build ni framework**. El navegador sólo carga `/public/**` y `/src/**` (importmap en `public/index.html`; `supabase-js` y `xlsx` vendorizados en `public/vendor/`).
- Supabase (Postgres + RLS + Auth). Deploy estático en Vercel; `.vercelignore` deja afuera docs, supabase, tests y `*.md`.
- Tests con `node --test`, un archivo por módulo en `tests/` (se descubren solos: `tests/*.test.js`).

## Comandos
- `npm run test:q` — toda la suite, salida mínima (~300 bytes). **Usar este.** Si algo falla, correr sólo ese archivo: `node --test tests/<archivo>.test.js`.
- `npm test` — la misma suite con salida TAP de ~60 KB. Evitarlo: gasta ~15k tokens por corrida.
- `npx supabase db push` — aplica migraciones a la base real. Pedir confirmación antes.

## Dónde está cada cosa
- `src/data/repositorio.js`: **fachada** de 15 líneas, sólo `export * from './repos/<área>.js'`. El código está en `src/data/repos/`: `auth`, `clubes`, `coordinacion`, `ejercicios`, `fisico`, `inventario`, `jugadores`, `mediciones`, `partidos`, `recursos`. `src/data/cliente.js`: el cliente Supabase compartido (`obtenerCliente`, `TAMANIO_PAGINA`).
- `src/data/*.js`: lógica pura y testeable (validar, agrupar, preparar payloads, calcular). Sin red ni DOM.
- `src/parser/`: parsers de xlsx (`parserCabb.js`, `parserFisico.js`). Contrato en `PARSER.md`.
- `src/ui/main.js`: navegación (`registrarPantalla`, `ir`, `volver`, `refrescar`). `src/ui/pantallas/*.js`: una pantalla por archivo. Helpers de UI: `dom.js` (`$`), `errores.js` (mensajes de error), `html.js` (plantilla que escapa), `nav.js` (toast, escaparHtml, formatos).
- `supabase/migrations/`: numeradas. `supabase/ESQUEMA.md` documenta el modelo (le faltan las tablas de 0020–0022). `docs/COORDINACION.md`: roles y despliegue.

## Arquitectura: reglas que verifica `tests/arquitectura.test.js`
Flujo de dependencias: **pantalla → `repositorio.js` → `repos/<área>` → `cliente.js`**, y lógica pura en `src/data/*.js`. No hay clases ni capas extra: son funciones y módulos.
- La UI **nunca** habla con Supabase ni importa de `repos/` o `cliente.js`: pide todo por `repositorio.js`.
- `src/data/*.js` (salvo `cliente.js`, `repositorio.js`, `repos/`) es puro: no importa UI ni repositorio, no usa DOM ni `fetch`. Si una función de un repo pasa de ~10 líneas de lógica sin red (calcular, agrupar, validar), esa lógica va a un módulo puro con su test y el repo sólo consulta y mapea.
- Un repo devuelve objetos de dominio en camelCase (mapper `xDesdeFila`), nunca filas crudas de la base.
- Función de acceso nueva → en el repo de su área. Área nueva → archivo nuevo en `repos/` + una línea en la fachada (el test lo exige).
- `$` se importa de `ui/dom.js`; los errores se cuentan con `textoDeError`, `avisoDeError` o `mensajeAlGuardar` de `ui/errores.js`. **No copiar** el texto de "sin conexión" ni redefinir `$`.
- **HTML nuevo con `html\`...\`` de `ui/html.js`**: escapa todo lo interpolado; `crudo()` sólo para HTML propio. Una pantalla que se toca y todavía usa `escaparHtml` a mano se migra si el cambio es chico; no mezclar los dos estilos en un mismo template.
- Una regla que vive en SQL **y** en JS (listas de tipos, rangos) lleva un test de contrato que lee la migración y la compara (modelo: `tests/contratoMaterial.test.js`).
- Sin patrones de catálogo por adelantado (factory, builder, clases con herencia…): se usan cuando duele algo concreto. Candidatos reales, para cuando llegue el momento: registro de parsers si aparece un tercer formato de planilla; cola de escrituras si hay modo sin conexión.
- Deuda conocida: la paginación (`range` en bucle) se repite en 4 repos y podría ser un helper en `cliente.js`; las pantallas viejas usan `escaparHtml` manual.
- Refactor y feature no van en el mismo commit.

## Reglas del proyecto
- **La seguridad la impone RLS, no la interfaz.** Roles: entrenador (sus planteles asignados), coordinador (agregados del club), o ambos.
- **Una migración aplicada no se edita** (lo bloquea un hook): se agrega una nueva. Tabla nueva = `revoke all` + `grant` mínimo por columna + RLS + trigger de sellado. Patrón: `0026_material.sql`. Skill `/nueva-migracion`.
- `NULL` es "no se sabe", nunca `0`. Un jugador es único por club, no por categoría.
- **Texto que escribe un usuario**: su largo va en `src/data/limites.js` (y `maxlength` en el campo) y en un `check (char_length(...))` de la migración; `tests/contratoLimites.test.js` compara los dos. **Números tecleados**: siempre `decimalEstricto` de `src/data/numeros.js`, nunca `Number(texto)` (`Number("1e2")` da 100).
- Nada de autorización en `user_metadata` (lo edita el propio usuario) ni en el cliente: el cliente decide qué mostrar, la base decide qué se puede. Auditoría y pendientes de lanzamiento: `docs/SEGURIDAD-LANZAMIENTO.md`.
- Los `.xlsx` reales de `tests/fixtures/` **no van a git** (nombres de menores); sólo `tests/fixtures/sintetico/`. Nunca abrirlos ni pegar sus nombres. Sin ellos, los tests que los usan se saltean.
- UI y comentarios en español rioplatense (voseo). Los comentarios explican el porqué, no el qué.
- `CAMBIOS.md` es histórico (v2→v3) y `docs/superpowers/` son planes y specs ya ejecutados: **no leerlos salvo que la tarea sea sobre ellos**.
- No usar junctions ni enlaces simbólicos hacia `node_modules` (ni a nada fuera de la carpeta) en worktrees: al borrar el worktree se borra también el original. En un worktree, correr `npm ci`.

## Cómo trabajar (ahorro de tokens)
- **Planes y specs cortos.** Esto tiene prioridad sobre el formato por defecto de `writing-plans`: spec de 1–2 páginas; plan de máximo ~10 KB, con una task por commit, cada una con archivos, criterio de aceptación y nombre de los tests a escribir. **No pegar código de implementación dentro del plan.** Si un cambio es chico y claro, no hace falta plan.
- **Ejecutar en la sesión, sin subagentes** (arrancan sin contexto y salen caros). Único aceptable: el review final de una rama larga.
- **Verificaciones por comando las corre Claude directo** (`test:q`, greps), sin ciclo implementer+reviewer. Antes de dar algo por terminado: `npm run test:q`.
- **Commitear cada paso verificado**: trabajo sin commitear se pierde si la carpeta o el worktree se cierra.
- Modelo: Sonnet por defecto en este proyecto. Opus para diseño de specs, migraciones, RLS/RPC y el review final.
- Antes de leer varios archivos: `graphify query "<pregunta>" --budget 1500`. Después de cambiar código: `graphify update .` (sin LLM, gratis).
- `Grep` y `Read` con `offset`/`limit` en vez de archivos enteros. Los repos son chicos (50–280 líneas): se pueden leer completos; la fachada ya no tiene nada que leer.
- Al cerrar una unidad de trabajo (commit hecho), sugerir `/clear` en vez de seguir en la misma sesión.
- Skills del proyecto: `/nueva-migracion` y `/nueva-pantalla`.
