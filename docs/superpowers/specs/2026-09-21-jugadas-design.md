# Jugadas: pizarra táctica animada — diseño

Fecha: 2026-09-21. Estado: aprobado en charla; pendiente de revisión escrita.

## Por qué

Una profe de primera femenino contó que en el curso de entrenador usan una página vieja que saca PDFs con círculos y triángulos, y que otro club paga una IA que anima jugadas. Dos necesidades:

1. **Coordinación táctica**: que las categorías compartan las mismas presiones, defensas y sistemas (la de U15 se adapta a U13).
2. **Que los chicos entiendan la jugada**: una animación de unos segundos que muestra dónde pararse y qué hace cada uno.

Las herramientas gratuitas (CoachCanvas, Hoops Geek, Playmaker) resuelven lo segundo, pero la biblioteca queda en la cuenta personal de cada profe, con topes de plan gratis. Por eso va dentro de la app. **Sin IA.**

## Decisiones

| Tema | Decisión |
|---|---|
| Qué se guarda | La jugada como **datos** (JSON), nunca video. La animación se genera al abrirla |
| Dibujo | **SVG + JS propio**, sin librerías. Coordenadas normalizadas 0–1 relativas a la cancha |
| Persistencia | Una fila por jugada con columna `datos jsonb`. Se lee y se guarda entera |
| Pasos | Cada paso es un momento: **todas sus acciones se animan a la vez**. Lo que va después, en el paso siguiente |
| Quién edita | Todos los profes del club **ven** toda la biblioteca. **Edita y borra sólo el autor**; los demás **duplican** |
| Cómo llega a los chicos | **Por plantel**: el profe la asigna a planteles suyos y todo el plantel la ve |
| Dónde se edita | **Sólo en pantallas grandes** (compu o tablet). En celular se ve, se asigna, se duplica y se borra, pero "Editar" muestra un aviso |

## Alcance v1

- Cancha **media** y **entera**. Fichas: atacantes con número 1–5, defensores (triángulo con número), pelota (la tiene una ficha), conos.
- Acciones: **corte** (movimiento sin pelota; también es el desplazamiento de un defensor), **dribbling**, **pase**, **cortina**, **tiro** y **handoff**. Recta o curva, con un punto de control.
- **Nota por paso** (texto corto que el visor muestra en ese paso).
- **Formaciones iniciales** fijas en código: 5 abiertos, 1-4 alto, Cuernos, zona 2-3, zona 3-2 y presión 1-2-1-1 en cancha entera.
- **Tipo** de jugada: ataque, presión, defensa, salida de lateral u otro. La biblioteca filtra por tipo.
- **Exportar**: PNG de un paso y "Imprimir / PDF" con todos los pasos (hoja de impresión del navegador).
- **Fuera de v1**: video, IA, recorrido guiado, más de un atacante con el mismo número, plantillas creadas por el usuario.

## Modelo de datos

`jugada`: `id`, `club_id`, `nombre`, `tipo` (check con la lista), `datos jsonb`, `creado_por`, `creado_en`, `actualizado_en`. Checks: `char_length(nombre)`, `jsonb_typeof(datos) = 'object'`, `octet_length(datos::text) <= 65536` y largo de cada nota por paso (función inmutable).

`jugada_plantel`: (`club_id`, `jugada_id`, `plantel_id`), con PK compuesta y FKs compuestas por club.

Forma de `datos` (validada en JS por `src/data/jugadas.js`; la base sólo impone tamaño y notas):

- `cancha`: `'media' | 'entera'`
- `fichas[]`: `{ id, tipo: 'ataque'|'defensa'|'cono', numero?, x, y }`
- `pelota`: id de la ficha que la tiene al empezar (o null)
- `pasos[]`: `{ acciones[], nota }`, donde cada acción es `{ tipo, ficha, hasta?: {x,y}, a?: fichaId, control?: {x,y} }`. Corte, dribbling y cortina usan `hasta`; pase y handoff usan `a`; tiro no usa ninguno.

Reglas de validación: ids únicos; toda acción apunta a fichas existentes; una sola acción de movimiento por ficha y por paso; sólo quien tiene la pelota dribblea, pasa, tira o hace handoff; topes de 12 fichas, 30 pasos y 10 acciones por paso. La posición de cada ficha en el paso *k* **se deriva** de aplicar los pasos anteriores: sólo el paso 0 guarda posiciones.

## Seguridad (RLS)

- Mismo criterio que `ejercicio` después de 0027: `select` de `jugada` y `jugada_plantel` si `es_entrenador_de(club_id)`. Una cuenta de jugador no lee las tablas directo.
- `insert` con `creado_por = auth.uid()` y `es_entrenador_de(club_id)`. `update` y `delete` de `jugada` sólo si además `creado_por = auth.uid()`. Grants por columna: el `update` sólo toca `nombre`, `tipo` y `datos`. Trigger de sellado: `club_id`, `creado_por` y `creado_en` no cambian.
- `jugada_plantel`: insertar o borrar sólo si `puede_escribir_plantel(plantel_id)` (0016). La jugada puede ser de otro autor: asignar una jugada ajena no la modifica.
- Jugador: sin grants sobre las tablas. RPC `mis_jugadas()` (security definer, patrón `mis_recursos` de 0030) devuelve `id`, `nombre`, `tipo` y `datos` de las jugadas asignadas a sus planteles vigentes. Nunca `creado_por`.
- No hay datos de menores en una jugada.

## Pantallas

- **RECURSOS › Jugadas** (tercera sección junto a Jugadores y Ejercicios): biblioteca del club con filtro por tipo y "Nueva jugada" (nombre, tipo y formación). En pantalla chica, "Nueva jugada" y "Editar" muestran: *"El editor de jugadas es para compu o tablet. Desde acá podés verlas, asignarlas y duplicarlas."* Criterio: el lado corto de la ventana es menor a 600 px.
- **Jugada** (`p-jugada`): visor más acciones: Editar (autor), Duplicar, Asignar a planteles, Descargar paso (PNG), Imprimir, Borrar (autor).
- **Editor** (`p-jugada-editor`): cancha al centro; herramientas (Seleccionar, las 6 acciones, sumar atacante, defensor o cono); lista de pasos (nuevo, anterior, siguiente, borrar); nota del paso; deshacer y rehacer (Ctrl+Z, Ctrl+Y), Supr y Guardar. Flujo de una acción: se elige la herramienta, se toca la ficha de origen y después el destino (en pase y handoff, la ficha que recibe). Las fichas se arrastran sólo en el paso 0. La curva se ajusta arrastrando el punto de control. Pointer Events, así que anda igual con mouse y con dedo.
- **Jugador › Jugadas** (`p-jug-jugadas`, cuarta pestaña): lista de las jugadas de su plantel y visor.
- **Visor** (componente compartido): play/pausa, paso anterior y siguiente, velocidad ×0,5 / ×1 / ×2, nota del paso actual. Respeta `prefers-reduced-motion`: salta de paso en paso sin interpolar.

## Riesgos

- CSP: exportar PNG pasa el SVG por un `blob:`; hay que sumar `blob:` a `img-src` en `vercel.json` (y `csp.test.js` si lo verifica).
- El editor es la parte cara: si se atrasa, la v1 puede salir con visor y formaciones, y editor básico sin curvas.
