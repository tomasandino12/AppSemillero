# Guías del salto y de las medidas corporales: plan

**Spec:** `docs/superpowers/specs/2026-09-24-guias-salto-design.md`

**Cómo se ejecuta:** en la sesión, sin subagentes. Una task por commit, con TDD donde hay lógica y `npm run test:q` antes de commitear. Modelo: Sonnet (alto). **La task 2 (migración) va con Opus**, como pide el CLAUDE.md. `npx supabase db push` sólo con confirmación de Tomás.

Antes de tocar CSS o una pantalla: leer DESIGN.md (tokens, "Reglas duras", "Checklist"). El HTML nuevo va con `html\`...\`` de `ui/html.js`. Una pantalla que se toca y todavía usa `escaparHtml` a mano se migra sólo en el bloque que se reescribe, sin mezclar los dos estilos en un mismo template.

## Estado (actualizar al cerrar cada task)

| Task | Estado | Commit |
|---|---|---|
| 1 etiqueta pura | hecha | ver git log |
| 2 migración 0046 | aplicada con db push (24/09) | ver git log |
| 3 repo clubes | hecha | ver git log |
| 4 estilos de guía | hecha | ver git log |
| 5 guía de interpretación | hecha | ver git log |
| 6 salto en la ficha | hecha | ver git log |
| 7 protocolo corporal | hecha | ver git log |
| 8 protocolo del salto en tarjetas | hecha | ver git log |
| 9 documentación y cierre | hecha | ver git log |

---

## Task 1: `etiquetaMetodologia` (puro)
- **Archivos:** `src/data/metodologia.js` (nuevo), `tests/metodologia.test.js` (nuevo).
- **Qué:** exporta `MAX_APODOS = 3`, `LARGO_APODO = 20` y `etiquetaMetodologia(club, azar = Math.random)`, con el comportamiento de la pieza 2 del spec. Descarta los apodos inválidos (vacíos, de más de 20 caracteres, que no sean string) en vez de romper.
- **Aceptación:** es puro (lo verifica `arquitectura.test.js`) y la suite está en verde.
- **Tests:** `usa un apodo del club`, `elige con el azar inyectado (0 → primero, 0.99 → último)`, `sin apodos usa club.nombre`, `ignora apodos inválidos`, `sin club devuelve "Metodología del club"`.

## Task 2: migración `0046_apodos_club.sql` (Opus)
- **Archivos:** `supabase/migrations/0046_apodos_club.sql`, `tests/contratoApodos.test.js` (nuevo), `supabase/ESQUEMA.md` (columna nueva).
- **Qué:**
  - `alter table club add column apodos text[]`.
  - Una función `apodos_validos(text[])`, `immutable` y con `set search_path` fijo, que valide: cardinalidad de 1 a 3, cada elemento no nulo, `btrim(x) = x`, `x <> ''` y `char_length(x) <= 20`.
  - El `check (apodos is null or apodos_validos(apodos))`.
  - El seed de Newell's: `'{Leproso,NOB}'` por el id del club piloto (`20000000-0000-0000-0000-000000000001`, de 0004).
  - No agrega grants: `club` sigue siendo sólo `select` (0027). La función lleva `revoke execute ... from public, anon`, como en 0044.
- **Aceptación:** el test de contrato lee la migración y compara 3 y 20 con `MAX_APODOS` y `LARGO_APODO`. `npx supabase db push` corre **sólo después de preguntarle a Tomás**, y queda anotado en la tabla Estado y en la memoria del estado del db push.
- **Tests:** `los límites de apodos_validos coinciden con metodologia.js`, `0046 no agrega grants de escritura sobre club`.

## Task 3: el repo trae los apodos
- **Archivos:** `src/data/repos/clubes.js` (el `select` de la línea 13 y su mapper). No hay test del repo de clubes: el mapper es trivial.
- **Qué:** `obtenerClubes` devuelve `{ id, nombre, apodos }`, con `apodos: fila.apodos ?? []`. `main.js:222` ya pasa el objeto completo a `setClubActual`, así que no hay que tocarlo. El camino del jugador (`main.js:159`) queda sin apodos, a propósito.
- **Aceptación:** la suite está en verde y, con el dev server, `obtenerClubActual().apodos` trae los de Newell's.
- **Tests:** ninguno nuevo.

## Task 4: estilos de las guías
- **Archivos:** `public/css/componentes.css` (tokens nuevos en `tokens.css` sólo si hacen falta) y `src/ui/componentes/iconos.js` (SVG de pierna extendida y flexionada, con `currentColor`).
- **Qué:** `.tag-metodo`, `.guia-cab`, `.guia-paso`, `.guia-clave`, `.chip-rango` y `.cifra-clave`, según la sección "Estilo" del spec. Anchos cómodos a 375 px y en el diálogo de 1024 px.
- **Aceptación:** `tests/estilosTokens.test.js` en verde (sin colores literales; las transiciones sólo tocan `transform` y `opacity`).
- **Tests:** ninguno nuevo; cubre `estilosTokens`.

## Task 5: guía de interpretación del salto
- **Archivos:** `src/ui/componentes/guiaSalto.js` (nuevo).
- **Qué:**
  - `abrirGuiaSalto(club)` abre la hoja con la cabecera y la etiqueta (`etiquetaMetodologia`), las tres secciones de la pieza 4 y el botón "Entendido" (`cerrarHoja`).
  - El ejemplo del pivot y la base **se calcula** con `potenciaSamozino` en el momento, no se escribe a mano: así no se desalinea si cambia la fórmula.
  - La altura de 0,45 s se calcula con `alturaDeSalto`.
- **Aceptación:** se abre a 375 px y a 1440 px sin scroll horizontal, el texto va en voseo y dice 1852 W · 19,5 W/kg y 1485 W · 22,9 W/kg.
- **Tests:** en `tests/salto.test.js`, `el ejemplo de la guía da 1852 W y 19,5 W/kg (pivot) y 1485 W y 22,9 W/kg (base)`. Así queda fijado el texto que promete la guía.

## Task 6: sección Salto de la ficha
- **Archivos:** `src/ui/pantallas/fichaJugador.js` (`seccionSalto`, líneas 213–255).
- **Qué:** la tarjeta de la última sesión con W/kg como cifra clave (o la altura si no hay potencia), tres datos chicos, la línea de consistencia y el botón "¿Cómo interpretarlo?" que llama a `abrirGuiaSalto(obtenerClubActual())`. Abajo, la lista compacta de sesiones anteriores. Abalakov va en un bloque aparte. Se saca el texto largo de la línea 229, porque ahora eso lo explica la guía. El "sin potencia" lleva el botón "¿Cómo medirlas?", que queda conectado en la task 7 (hasta entonces no se muestra).
- **Aceptación:** una ficha con CMJ y potencia, una sin potencia, una con sólo Abalakov y una sin saltos se ven bien. Nunca aparece un 0 en lugar de un dato que falta. Capturas a 375 px.
- **Tests:** si la lógica de "última sesión y anteriores" pasa de ~10 líneas, va a una función pura en `src/data/salto.js` (`ultimaYAnteriores(sesiones, test)`) con los tests `separa la última de las anteriores` y `sin sesiones de ese test devuelve null`.

## Task 7: protocolo de medidas corporales
- **Archivos:** `src/ui/componentes/protocoloCorporal.js` (nuevo), `src/ui/pantallas/fichaJugador.js` (bloque "Agregar una medición", línea 574, y el "sin potencia" de la task 6).
- **Qué:** `abrirProtocoloCorporal(club)` arma las tarjetas de la pieza 5, con los rangos leídos de las constantes de `antropometria.js` y los SVG de la task 4. En la ficha, la `.ayuda` larga pasa a ser una línea corta más el botón "¿Cómo medir?". La carga corporal está en la ficha y no en la hoja, así que abrir la hoja no pierde lo que ya se tipeó.
- **Aceptación:** los dos puntos de entrada abren la hoja. Si se cambia una constante de rango, el chip cambia solo. Captura a 375 px.
- **Tests:** ninguno nuevo (es sólo presentación); la suite sigue en verde.

## Task 8: protocolo del salto en tarjetas
- **Archivos:** `src/ui/componentes/protocoloSalto.js`.
- **Qué:** `protocoloHtml()` pasa a `.guia-paso` numerados, con el mismo contenido. El botón "¿Cómo se mide?" abre la hoja con `.guia-cab` y la etiqueta. En el marcador (`marcadorCuadros.js:100`) sigue adentro del `<details>` y se tiene que ver bien ahí.
- **Aceptación:** la hoja desde MEDIR → Salto y el `<details>` del marcador se ven bien a 375 px.
- **Tests:** ninguno nuevo.

## Task 9: documentación y cierre
- **Archivos:** `DESIGN.md` (sección de componentes: `.tag-metodo`, `.guia-*`, `.chip-rango`, `.cifra-clave`; y en Deuda, que el jugador no trae apodos), la memoria `proyecto-evaluacion-salto.md` (el instructivo visual queda cubierto en parte) y la tabla Estado de este plan.
- **Aceptación:** `npm run test:q` en verde, `graphify update .`, y el recorrido completo en el navegador (ficha → guía, ficha → protocolo corporal, MEDIR → salto → protocolo) con capturas.
- **Tests:** ninguno nuevo.
