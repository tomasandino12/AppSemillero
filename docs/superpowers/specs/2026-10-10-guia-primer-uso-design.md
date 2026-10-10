# Guía de primer uso — spec

## Problema

La app ya tiene muchas funciones: seis pestañas para el profe, tres para el coordinador y cuatro para el jugador, además del editor de jugadas, las pruebas físicas y el import de la CABB. Quien entra por primera vez no sabe qué hay ni por dónde arrancar. El piloto es con usuarios reales que no van a leer un manual.

## Qué se hace

1. **Intro por modo** (`entrenar`, `coordinar`, `jugador`): la primera vez que alguien entra a un modo, se abre una **hoja** con 2 o 3 pasos. Tiene Anterior y Siguiente, un contador "2 de 3" y "Saltar" siempre visible. En el último paso, Siguiente dice "Empezar".
2. **Pistas de una vez**: un aviso chico arriba de la pantalla, con un botón "Entendido". Sale la primera vez que alguien entra a una pantalla que necesita explicación. No bloquea ni encadena pasos.
3. **"Ver la guía"** en Mi perfil: vuelve a abrir la intro del modo actual.

No se usan globos anclados a botones (coach marks): se rompen con el layout a 320px y la mayoría los cierra sin leer.

## Comportamiento

- La intro se abre **después** de que la pantalla inicial del modo terminó de dibujarse, y nunca encima de otra hoja abierta (por ejemplo, la solicitud de jugador).
- **Cualquier forma de cerrarla cuenta como vista**: Saltar, Empezar, el velo, Escape o Atrás del sistema. Si alguien la cierra, no se la volvemos a mostrar.
- Como es una hoja, Atrás del sistema la cierra sin agregar nada nuevo (`historial.js` ya contempla la hoja).
- Quien tiene los dos roles ve la intro de `entrenar` al entrar y la de `coordinar` la primera vez que cambia de modo. La intro de entrenar suma una línea sobre el botón de cambio de modo sólo si `roles.esCoordinador`.
- Cada guía tiene un **número de versión**. Subirlo la vuelve a mostrar, por ejemplo cuando cambia mucho una pestaña. "Qué hay de nuevo" queda fuera de esta versión.
- Accesibilidad: el contador se anuncia (`aria-live="polite"`). Al cambiar de paso, el foco pasa al título. Las flechas ← → del teclado cambian de paso en escritorio. Los botones tienen como mínimo el alto táctil de DESIGN.md.
- Movimiento: entre pasos se cambia el contenido sin animar, o con un fundido de `--dur-1` como máximo (DESIGN.md: "moverse poco y rápido").

## Dónde se guarda "ya la vio"

En `localStorage`, con la clave `guia.v1.<usuarioId>.<guiaId>` y el valor `{ version }`. Copia el patrón de `src/ui/borradorMedicion.js`: el almacén se inyecta para los tests y todo va con try/catch. Sin storage (modo privado), la guía se muestra en cada sesión, que es molesto pero no rompe nada.

- **No se usa la base**: no hace falta migración ni RLS, y no es un dato sensible. El costo es que en un celular nuevo vuelve a aparecer, y es aceptable.
- La clave lleva el usuario porque en un celular compartido cada cuenta tiene que ver su propia guía.

## Contenido (borrador; ajustar el texto contra cada pantalla al implementar)

Cada paso tiene el ícono de su pestaña (`ICONOS`), un título corto y 1 o 2 frases. Voseo, sin jerga.

**Entrenar** (3 pasos)
1. *Tu categoría y tu plantel*: arriba elegís la categoría. En Plantel están tus jugadores, con la ficha de cada uno.
2. *Medir y Físico*: en Medir tomás salto, sprint, Yo-Yo y batería. Si se corta internet, lo medido queda guardado en este celular. En Físico cargás el plan de fuerza de la categoría.
3. *Datos, Recursos y Hoy*: en Datos subís la planilla del partido que exporta la CABB y ves las estadísticas. En Recursos están los ejercicios y las jugadas para tus jugadores. En Hoy, lo del día. *(+ si coordina)* "Con el botón de arriba pasás a coordinar."

**Coordinar** (3 pasos)
1. *Panorama*: cómo viene el club, con números de todas las categorías y sin datos individuales de los chicos.
2. *Profes*: quién tiene acceso y qué categorías tiene a cargo cada uno.
3. *Inventario*: el material del club, lo que hay y dónde está.

**Jugador** (2 pasos)
1. *Recursos y Jugadas*: lo que te comparte tu profe para practicar y entender las jugadas.
2. *Físico y Mi progreso*: tu plan y cómo vienen tus mediciones.

**Pistas** (v1: sólo estas dos; Datos y Físico ya explican el import en su propia pantalla)
- `medir`: "Elegí la prueba y a quién medís. Lo que vas cargando se guarda en el celular hasta que lo envíes."
- `jugada-editor`: "Tocá una ficha para elegirla y arrastrala para moverla. Las acciones (pase, corte) se arman tocando primero quién la hace."

## Fuera de alcance

Mini-demos animadas (se pueden reusar después las de la landing), "qué hay de nuevo", gestos de deslizar entre pasos, guardar en la base y estados vacíos que enseñan (es una mejora aparte y vale la pena hacerla después: hoy cada pantalla resuelve el suyo con `.p`).

## Cómo se verifica

Tests de la lógica pura y del almacén. Además, una pasada en el navegador con un usuario de prueba de cada rol: que la intro aparezca una sola vez, que Atrás la cierre, que "Ver la guía" la reabra y que a 320px nada se corte.
