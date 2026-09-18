# Etapa 3: Primera versión completa — Design Spec

## Contexto

App para seguimiento del desarrollo de jugadores en categorías inferiores de clubes de básquet argentinos. Piloto en Newell's Old Boys (Rosario), dos categorías (`U21M`, `U17M`).

**El problema de negocio:** pérdida de memoria institucional. Cuando cambia el cuerpo técnico, el trabajo hecho con los jugadores desaparece. Todo el modelo de datos existe para que un jugador tenga historia continua a través de temporadas, categorías y entrenadores.

**Estado de partida (tag `pre-etapa-3`, commit `6d42e86`):** dos aplicaciones que no se conocen.

1. **Prototipo** en la raíz (`index.html`, `js/app.js` 475 líneas, `css/app.css`, `css/tokens.css`): navegación completa, identidad visual resuelta, **todos los datos inventados**. Script clásico con funciones globales llamadas desde `onclick=""`.
2. **Import de partidos** en `public/`: funciona de verdad contra Supabase, transaccional, verificado de punta a punta. **Una pantalla blanca con un botón.**

`npm test`: 41 tests (35 + 6 gated por fixtures reales), 0 fallando.

## Objetivo

Una sola aplicación web, mobile-first pero genuinamente responsive, que reemplace al prototipo y a la pantalla suelta de import. Datos reales donde ya existen datos reales. El criterio principal de terminación es el flujo completo de un entrenador que arranca sin un solo jugador cargado y termina con su plantel armado y sus partidos cargados.

## Principio rector

**No romper lo que funciona.** La lógica del import (parser, mapeo, payload, RPC `importar_partido`) no se toca. Cambia dónde vive su punto de entrada y a dónde vuelve al terminar. Nada más.

---

## Decisión 1 — Responsive real

Se descarta el marco de teléfono de 390px centrado. CSS base = celular, sin ninguna media query; los tamaños grandes se agregan con `min-width`.

| Breakpoint | Qué cambia |
|---|---|
| Base (hasta 639px) | Navegación inferior fija por tabs. Una columna. Tarjetas a todo el ancho. Contenido importante en la mitad inferior. |
| ≥ 640px | Más aire. Listas en dos columnas donde tenga sentido. La navegación sigue abajo. |
| ≥ 1024px | Navegación **lateral fija**. Contenido con ancho máximo ~1100px, centrado. |

**Reglas técnicas, no negociables:**
- Áreas táctiles ≥44×44px en el layout base.
- `hover` solo dentro de `@media (hover: hover)`. Nunca como única señal de estado.
- `rem` para tipografía y espaciado. Nada de `px` fijos para layout.
- `100dvh`, nunca `100vh`.
- `env(safe-area-inset-bottom)` en la navegación inferior.
- `clamp()` para la escala tipográfica de títulos.
- Contraste alto: se usa en un celular, en la cancha. Se entrena bajo techo, NO al sol (corregido por el usuario el 2026-09-18).
- **Todos los breakpoints viven en `layout.css`.** Ningún otro archivo tiene media queries de ancho.

## Decisión 2 — Se reconstruye la cáscara, se conserva el estilo gráfico

El prototipo no permite separar capas ni hacer responsive prolijo sobre su base. La cáscara se reconstruye como ES modules. **La identidad gráfica no se rediseña**: mismos colores, misma tipografía, misma escala de espaciado, mismo tratamiento de tarjetas/botones/tabs.

### Qué se porta y qué no (alcance real, medido sobre las 475 líneas de `js/app.js`)

| Qué | Líneas aprox. | Destino |
|---|---|---|
| `cancha()` y `grafico()` (renderers SVG) | ~60 | **Se portan tal cual** a `src/ui/componentes/graficos.js` |
| Datos inventados (`POS`, `TESTS`, `armar()`, `CATS`, `BIBLIO`, `NOM13/15`) | ~48 | Se portan a `src/ui/datosEjemplo.js` |
| `pResumen`, `pMedir` + `filaTest`, `pRecursos` | ~45 | Se portan con la franja de ejemplo |
| `head`/`cats`/`nav`/`ir`/`volver`/`setCat`/`rol` | ~50 | **Se reemplazan** por router + selector real |
| `pCarga` + teclado numérico + `guardarTest` + `fila` | ~85 | **No se porta** (Scope: no construir carga de tests) |
| `pFicha` | ~66 | **No se porta** (la ficha real es nueva y mínima) |
| `pStats` | ~28 | **No se porta** (DATOS pasa a ser la lista real de partidos) |
| `pHoy` + `hecho` | ~10 | **No se porta** (vista JUGADOR fuera de scope) |
| Hojas y helpers (`abrir`/`cerrar`/`sel`/`agregarTest`/`ofrecer`/`abrirFisicos`) | ~30 | Solo el **mecanismo** de hoja, como componente, para el alta manual |

Total: ~150 líneas portadas, ~250 fuera de scope, ~50 reemplazadas.

`css/tokens.css` y `css/app.css` de la raíz se destilan a `public/css/tokens.css` (única fuente de verdad de color/tipografía/espaciado) y `public/css/componentes.css`.

**Los archivos del prototipo en la raíz quedan intactos** durante toda la etapa. Se borran solo al final, cuando todos los criterios de aceptación pasen.

## Decisión 3 — Separación de capas

```
src/
├── parser/parserCabb.js               ← NO SE TOCA
├── data/                              ← nadie acá toca el DOM
│   ├── cliente.js
│   ├── repositorio.js                 ← ÚNICO lugar con llamadas a Supabase
│   ├── mapearImportacion.js           ← puro
│   └── prepararPayloadImportacion.js  ← puro
└── ui/                                ← nadie acá importa @supabase/supabase-js
    ├── main.js                        ← bootstrap + router
    ├── sesion.js                      ← sesión, club activo, plantel activo
    ├── nav.js                         ← helpers de pantalla/toast/escape (ya existe)
    ├── datosEjemplo.js                ← contenido inventado de HOY/MEDIR/RECURSOS
    ├── componentes/
    │   ├── graficos.js                ← cancha() y grafico(), portados
    │   ├── bannerEjemplo.js
    │   ├── estadoVacio.js
    │   └── hoja.js                    ← bottom sheet (alta manual)
    └── pantallas/
        ├── login.js
        ├── plantel.js                 ← real
        ├── fichaJugador.js            ← real, mínima
        ├── datos.js                   ← real (partidos + entrada al import)
        ├── hoy.js                     ← ejemplo
        ├── medir.js                   ← ejemplo
        ├── recursos.js                ← ejemplo
        ├── confirmacionImport.js      ← movido desde src/ui/pantallaConfirmacion.js
        └── resultadoImport.js         ← movido desde src/ui/pantallaResultado.js
public/
├── index.html                         ← único punto de entrada + import map
└── css/
    ├── tokens.css                     ← color, tipografía, espaciado
    ├── base.css                       ← reset, tipografía, escala fluida
    ├── layout.css                     ← grid, navegación, TODOS los breakpoints
    └── componentes.css                ← estilos de componentes (absorbe import.css)
```

**Reglas verificables:**
- `grep -rl "@supabase/supabase-js" src/ui/` → vacío.
- `grep -rlE "document\.|window\." src/data/` → vacío.
- `grep -lE "@media[^{]*(min|max)-width" public/css/*.css` → solo `layout.css`.

### Qué pasa con los archivos de UI que dejó la Etapa 2B

| Archivo actual | Destino |
|---|---|
| `src/ui/pantallaConfirmacion.js` | Se **mueve** a `src/ui/pantallas/confirmacionImport.js`. Diff limitado a rutas de import y a la línea del callback de retorno; la lógica interna queda byte-idéntica (se verifica con un diff explícito). |
| `src/ui/pantallaResultado.js` | Se **mueve** a `src/ui/pantallas/resultadoImport.js`, mismo criterio. |
| `src/ui/auth.js` | Se **mueve** a `src/ui/pantallas/login.js`. |
| `src/ui/pantallaInicio.js` | Se **borra**. `p-inicio` desaparece como pantalla: su botón "Cargar partido" pasa a vivir arriba de la lista en DATOS. |
| `src/ui/nav.js`, `src/ui/sesion.js` | Se conservan; `sesion.js` se extiende con plantel activo. |
| `public/css/import.css` | Se **borra** después de absorber su contenido en `componentes.css`. |

`public/css/import.css` se absorbe en `componentes.css` **conservando exactamente los nombres de clase** (`.opt`, `.equipos`, `.grupo`, `.grupo-h`, `.grupo-cuerpo`, `.jug-fila`, `.chk`, `.jug-sugerencia`, `.pie-fijo`, `.al`, `.tarj`, `.marcador`, `.campo`, `.btn`, `.eyebrow`, `.h2`, `.p`, `.toast`), porque `confirmacionImport.js` genera markup con ellos y su lógica no se toca. Se cae el media query del marco de teléfono a 520px.

## Decisión 4 — Todo lo que escribe más de una fila es transaccional

Sin excepciones. Motivo: el entrenador está en el gimnasio con wifi inestable; una operación a medias le deja la base en un estado que no puede arreglar desde el celular.

| Operación | Filas | Mecanismo |
|---|---|---|
| Import de partido | muchas | `importar_partido` — **ya existe, verificado, no se toca** |
| Alta manual de jugador | 2 (`jugador` + `pertenencia`) | **RPC nueva** `alta_jugador_manual` |
| Sumar jugador existente a otra categoría | 1 (`pertenencia`) | `crearPertenencia`, llamada simple |

Toda RPC nueva: `security invoker`, migración nueva, y script de verificación de rollback en el espíritu de `tests/verificarRpc.js`.

## Decisión 5 — Migraciones nuevas

**`0007_mediciones_jugador.sql`** — agrega a `jugador` tres columnas nullables:

```sql
alter table jugador
  add column talla_cm integer,
  add column peso_kg numeric(5,2),
  add column fecha_medicion date;
```

`NULL` significa **"no medido"**, nunca cero. Mismo principio que rige todas las estadísticas del proyecto. Esta etapa no construye la carga de mediciones: solo el lugar donde viven y su visualización como "sin medir".

**`0008_rpc_alta_jugador.sql`** — RPC transaccional:

```sql
create or replace function alta_jugador_manual(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_jugador_id uuid;
begin
  begin
    insert into jugador (club_id, nombre_clave, nombre_limpio, desambiguador)
    values (
      (payload->>'clubId')::uuid,
      payload->>'nombreClave',
      payload->>'nombreLimpio',
      coalesce(payload->>'desambiguador', '')
    )
    returning id into v_jugador_id;
  exception when unique_violation then
    raise exception 'JUGADOR_YA_EXISTE' using errcode = 'P0001';
  end;

  insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde)
  values (
    (payload->>'clubId')::uuid,
    v_jugador_id,
    (payload->>'plantelId')::uuid,
    (payload->>'temporadaId')::uuid,
    (payload->>'desde')::date
  );

  return jsonb_build_object('jugadorId', v_jugador_id);
end;
$$;
```

La violación de unicidad de `unique (club_id, nombre_clave, desambiguador)` se relanza como `JUGADOR_YA_EXISTE`, reconocible desde la UI. Es defensa en profundidad: la UI además chequea contra el plantel ya cargado antes de llamar, para dar el mensaje bueno sin ir a la base.

## Decisión 6 — El flujo del entrenador que arranca de cero

Es el criterio principal de terminación. Ninguno de estos pasos puede requerir el dashboard de Supabase ni la consola del navegador.

1. **Entra.** Login. El selector de arriba muestra sus planteles reales.
2. **PLANTEL vacío** → estado vacío que explica y ofrece los dos caminos: "Cargar un partido de la CABB" y "Agregar jugador a mano".
3. **Importa su primer partido** desde DATOS. Todos los jugadores propios caen en "nuevos". Confirma.
4. **Ve su plantel.** Cada jugador con su nombre; talla y peso como **"sin medir"**.
5. **Importa un segundo partido.** Los nuevos se detectan, los existentes se reusan sin duplicar.
6. **Aparece un jugador de la otra categoría.** La app dice que ya está cargado en U17 y ofrece sumarlo a U21 — **pertenencia nueva, nunca perfil nuevo**.
7. **Carga a mano** un jugador que la CABB nunca va a traer. Solo nombre; talla y peso "sin medir".
8. **Ve sus partidos** en DATOS: fecha, rival, resultado.

## Decisión 7 — Real vs. ejemplo

| Pantalla | Contenido |
|---|---|
| **PLANTEL** | **Real.** Jugadores del plantel activo. Estado vacío. Alta manual. Ficha con talla/peso "sin medir". |
| **DATOS** | **Real.** Lista de partidos (fecha, rival, resultado) + botón "Cargar partido". Funcionalidad nueva respecto al prototipo. |
| **HOY**, **MEDIR**, **RECURSOS** | **Ejemplo.** Portadas del prototipo conservando el aspecto, con franja de alto contraste arriba del contenido: "⚠ Datos de ejemplo — no son datos reales del club". Visible sin scrollear. |

**No debe existir ninguna ruta por la que un dato inventado aparezca sin la franja.** El selector de categoría muestra planteles reales; el `+` de agregar categoría y el toggle PROFE/JUGADOR se ocultan.

**Los gráficos de estadísticas sobre datos reales quedan fuera de esta etapa.** La lista de partidos es el mínimo para confirmar que los datos están, no una vista de análisis.

### La ficha del jugador real muestra solo datos reales

Nombre, en qué categorías tiene pertenencia vigente, y talla/peso/fecha de medición como "sin medir" cuando son `NULL`. **Sin los gráficos mock del prototipo adentro**: meterlos exigiría la franja de ejemplo dentro de la ficha de un jugador real, que es peor que no mostrarlos y contradice "no construir vistas de estadísticas sobre datos reales".

### MEDIR porta solo la lista

Tocar un test **no** abre el flujo de carga con teclado numérico. El Scope prohíbe construir la carga de tests, y portar 85 líneas de un flujo que no guarda en ningún lado es trabajo perdido.

## Decisión 8 — Router y navegación

Router basado en estado, **sin hash en la URL**, con una pila de "volver" para sub-pantallas (ficha de jugador, flujo de import). Es como se comportaba el prototipo; el hash routing no se pidió y agrega complejidad.

### Invariante de navegación: un solo dueño por afordancia

Esto existe para no reintroducir el bug de footers superpuestos de la Etapa 2B por otra vía.

**Aclaración de base:** la Etapa 2B nunca tuvo pila de volver. Su mecanismo son llamadas directas y hardcodeadas a `mostrarInicio` (5 sitios en `iniciarConfirmacion`, 2 en `avanzarAJugadores`, 1 en `mostrarGrupos`, 1 en `resultadoImport`). Y el bug **no fue de navegación**: fue acumulación de DOM — `insertAdjacentHTML('beforeend', botonVolver())` metía un segundo `.pie-fijo` encima del existente, y en el segundo fallo consecutivo dejaba dos `#btn-volver-inicio` con el mismo id, quedando visible el muerto.

Reglas:

1. **La pila del router gobierna solo qué pantalla se ve.** Su afordancia de volver vive **únicamente en el chrome** (flecha `‹` del header). El router **nunca** inyecta un botón de volver dentro del contenido de una pantalla.
2. **Los "Volver" del flujo de import viven en el contenido**, los pone la propia pantalla, y el router no los toca. Dos regiones del DOM distintas; ninguna se appendea dentro de la otra.
3. **Ambas rutas llaman a la misma función de destino**, así no pueden divergir en comportamiento.
4. **La limpieza idempotente que arregló el bug se conserva byte-idéntica**: los `?.remove()` al tope de `avanzarAJugadores` y la inserción del botón dentro del `.pie-fijo` existente vía `insertAdjacentHTML('afterend', ...)`.

**Guarda automática.** No hay jsdom y no se pueden agregar dependencias, así que un test de comportamiento del DOM es imposible. Se encodea la invariante que se rompió como test estático en Node: leer el fuente de `confirmacionImport.js` y afirmar que `botonVolver()` nunca aparece junto a `insertAdjacentHTML('beforeend'`. Falla si alguien reintroduce exactamente ese patrón.

## Contratos nuevos

### `src/data/repositorio.js` — funciones nuevas

Las existentes **no se tocan**. En particular `obtenerJugadoresDelClub` queda intacta porque de ella depende `mapearImportacion` en el flujo de import verificado.

```js
// Jugadores del plantel activo, con los campos de medición. Filtra por
// pertenencia vigente (hasta is null) del plantel dado.
obtenerJugadoresDelPlantel(clubId, plantelId)
  → [{ id, nombreClave, nombreLimpio, tallaCm, pesoKg, fechaMedicion }]

// Partidos del plantel activo, más nuevos primero.
obtenerPartidosDelPlantel(clubId, plantelId)
  → [{ id, fecha, rivalNombre, puntosPropios, puntosRival, condicionPropia }]

// Pertenencias vigentes de un jugador, para la ficha ("está en U21M y U17M").
obtenerPertenenciasDeJugador(clubId, jugadorId)
  → [{ plantelId, categoria, desde }]

// RPC transaccional del alta manual. Lanza Error con message
// 'JUGADOR_YA_EXISTE' si el nombreClave ya existe en el club.
altaJugadorManual({ clubId, nombreClave, nombreLimpio, plantelId, temporadaId, desde })
  → { jugadorId }
```

`crearPertenencia` (ya existe) se reusa para "sumar a otra categoría".

### Normalización del nombre en el alta manual

Reusa `limpiarNombre` y `clavearNombre` exportadas por `src/parser/parserCabb.js` — las mismas que usa el import. El campo lleva ayuda visible: **"Como en la CABB: Apellido, Nombre"**, porque el orden determina el `nombreClave` y de eso depende que un import futuro reconozca al jugador en vez de duplicarlo.

## Testing

- `npm test` sigue corriendo sin base de datos, y suma:
  - Tests de la guarda estática de navegación (Decisión 8).
  - Cualquier función pura nueva que aparezca.
- Las funciones que tocan Supabase no tienen test automático (mismo criterio que 2A/2B: no hay base en el entorno de desarrollo); se verifican leyendo y con los scripts manuales.
- `tests/verificarAltaJugador.js` — script manual de rollback de la RPC nueva, en el espíritu de `tests/verificarRpc.js`: llama con un payload que falla en el segundo insert y confirma que no quedó el `jugador` huérfano.
- El flujo completo del entrenador (Decisión 6) se verifica a mano en el navegador, porque no hay herramienta de automatización de browser en este entorno.

## Criterios de aceptación

**Flujo del entrenador:** los 8 pasos de la Decisión 6, verificados a mano contra la base real, incluyendo: un segundo import no duplica (`select count(*) from jugador where nombre_clave = '...'` da 1), un jugador de otra categoría genera pertenencia y no perfil nuevo, el alta manual es transaccional, talla/peso se ven "sin medir", y ningún jugador rival llega a la base.

**Responsive:** usable con una mano a 375px con targets ≥44px; a 1280px navegación lateral y contenido centrado con ancho máximo; ninguna funcionalidad exclusiva de un tamaño; todos los breakpoints en `layout.css`; sin `100vh`; sin `hover` fuera de `@media (hover: hover)`.

**Arquitectura:** las tres verificaciones por `grep` de la Decisión 3; toda RPC nueva `security invoker` con script de rollback; un solo punto de entrada sin build step; sin sesión solo login.

**Ejemplo vs. real:** franja visible sin scrollear en HOY/MEDIR/RECURSOS; selector con planteles reales; ninguna pantalla con dato inventado sin franja.

**General:** `npm test` completo sin base; aspecto reconociblemente el del prototipo.

## Fuera de alcance

Gráficos o vistas de estadísticas sobre datos reales; conectar HOY/MEDIR/RECURSOS; carga de mediciones antropométricas, tests o recursos; cuentas y vista JUGADOR; layout de escritorio más allá de los breakpoints descritos; deploy en Vercel; cualquier dependencia, framework, bundler o build step; borrar los archivos del prototipo antes de que pasen todos los criterios.

## Hechos verificados antes de escribir este spec

- Tag `pre-etapa-3` creado sobre `6d42e86`. `npm test` en ese estado: 41 tests, 0 fallando.
- El fix de footers superpuestos está presente en `main` (`src/ui/pantallaConfirmacion.js:184-185` limpieza idempotente, `:197` y `:211` inserción dentro del `.pie-fijo` existente).
- `repositorio.js` exporta hoy 13 funciones; ninguna cubre plantel-filtrado, partidos, pertenencias por jugador, ni alta manual.
- `jugador` no tiene hoy ninguna columna de medición (`0001_esquema_inicial.sql:49-58`).
- `public/css/import.css` son 76 líneas e incluye el media query del marco de teléfono a 520px que la Decisión 1 elimina.
- La app de la 2B tiene 4 pantallas (`p-login`, `p-inicio`, `p-confirmacion`, `p-resultado`); `p-inicio` desaparece en esta etapa, absorbida por el botón "Cargar partido" de DATOS.
