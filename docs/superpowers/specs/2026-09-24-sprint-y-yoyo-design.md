# Sprint de 30 m y Yo-Yo (diseño)

Recupera la medición de velocidad que se borró en 0045, esta vez con el método del CReAR/ENARD (sprint de 30 m; Yo-Yo endurance de 20 m) y **sin tecnología**: sólo el celular del profe, un cronómetro y pitidos. Sin postes, sin foto de llegada, sin video en cámara lenta. Contexto y fuentes: `docs/evaluaciones-fisicas/FUNDAMENTO.md` §2 y §6.

Se hace en dos etapas, cada una con su plan: **A. Sprint** y **B. Yo-Yo**. Diseño de pantallas: prompt para Stitch en `2026-09-24-sprint-yoyo-stitch.md`.

## Principios
- **Un solo error humano.** El cronómetro manual clásico suma dos reacciones (arranque y llegada). Acá la app da la voz y el pitido de salida y **arranca sola el reloj con el pitido**; el profe toca una vez, en la llegada. Queda una reacción, siempre la misma persona.
- **Comparable contra uno mismo, no contra el CReAR.** El CReAR usa fotocélulas; no decimos que nuestros tiempos equivalen a los suyos. Se muestran en décimas (no en centésimas: sería falsa precisión).
- **Datos del CReAR, si los conseguimos.** Cada resultado lleva `origen`: `propio` (medido acá) o `crear` (traído del CReAR, con marca visible "CReAR · más exacto"). Cargar datos del CReAR no entra en este spec: sólo queda la columna y la marca para no tener que migrar después.
- **Se guarda el dato crudo** (`tiempo_ms`, `distancia_m`); velocidad media (m/s) y comparaciones se calculan en `src/data/sprint.js`, como con el salto.

## Etapa A: Sprint

**Prueba.** 30 m desde parado, salida de pie detrás de la línea. Distancia configurable por sesión (30 por defecto, 20 si la cancha no da; una sesión es de una sola distancia, como `test_salto`, así los tiempos de distinta distancia no se mezclan). **Dos intentos**, cuenta el mejor. Un mismo profe cronometra a todos.

**Flujo (pantalla `medirSprint.js`, mismo patrón que `medirSalto.js`).**
1. Elegir distancia y fecha; lista del plantel.
2. Por jugador y intento: botón *Correr* → cuenta "Listos… " → **pitido** (Web Audio) que arranca el reloj → botón grande *Llegó* que congela el tiempo → confirmar o repetir el intento (falsa largada, no llegó). Se puede cargar el tiempo a mano si el profe usó su cronómetro.
3. Guardar la sesión completa; borrador local con `sesionId` para reintentos idempotentes (igual que 0038).

**Base (migración 0048, patrón de 0043/0044).**
- `sesion_medicion.tipo` suma `sprint`, y `distancia_sprint_m` (20 | 30) es obligatoria sólo en ese tipo (`(tipo = 'sprint') = (distancia_sprint_m is not null)`).
- `medicion_sprint`: `sesion_id`, `jugador_id`, `intento` (1–2), `tiempo_ms` integer (2500–12000), `origen` (`propio` | `crear`, default `propio`), `unique (sesion_id, jugador_id, intento)`. `tiempo_ms` NULL = ausente, una fila (intento 1). RLS por el plantel de la sesión; `revoke all` + `select`/`insert` por columna; trigger de sellado.
- `guardar_sesion_medicion` suma la rama `sprint` (sin perder ninguna garantía de 0038/0044); `mi_progreso` suma `sprints` propios.
- Contratos: `tests/contratoSprint.test.js` (rangos SQL vs JS) y `tests/contratoRpcSprint.test.js` (la RPC conserva todas las ramas).

**Ver el resultado.** En la ficha del jugador y en su Progreso: mejor tiempo de cada sesión, velocidad media y variación contra la sesión anterior **de la misma distancia**; una sola sesión = sin variación. Tarjetas de "Cómo medir" (guía corta, igual que la del salto): marcar las dos líneas, mismo piso y calzado, entrada en calor, 3 min de pausa entre intentos, mismo profe.

**Lógica pura (`src/data/sprint.js`, con test):** validar y normalizar tiempo (`decimalEstricto`), mejor intento, velocidad media, agrupar por sesión y distancia, variación. `prepararPayloadSprint` en `prepararPayloadMedicion.js`.

**Fuera de alcance:** parciales de 10 m, aceleración/perfil F-V, carga de datos del CReAR, comparación entre categorías.

## Etapa B: Yo-Yo endurance (20 m, con pitidos)
Test largo y agotador (hasta ~15 min): se hace pocas veces al año, después de la etapa A.

**Protocolo:** Yo-Yo Endurance Test Level 1 de Bangsbo, continuo (sin pausa), idas de 20 m. 20 niveles de ~1 min: arranca a 8,0 km/h y sube 0,5 por nivel hasta 17,5; idas por nivel 7, 8, 8, 8, 9, 9, 10, 10, 11, 11, 11, 12, 12, 13, 13, 13, 14, 14, 15, 15 (223 idas, 4460 m). Tabla: theyoyotest.com/table-YYEL1.htm. **Antes de usarlo con el CReAR, confirmar con ellos que es la misma versión**; si no lo es, sólo cambia la tabla en `src/data/yoyo.js`.

**Flujo:** la app programa todos los pitidos con Web Audio (un pitido por ida, uno doble al cambiar de nivel) y mantiene la pantalla prendida (Wake Lock). Cada jugador es un botón: primer toque = aviso (no llegó a la línea a tiempo), segundo toque = afuera, y ahí la app anota las idas completas. Deshacer el último toque. Regla: afuera al segundo aviso seguido.

**Base (0049):** `sesion_medicion.tipo` suma `yoyo`; `medicion_yoyo` con `idas` (0–223, NULL = ausente), `origen` y `unique (sesion_id, jugador_id)`. Se guarda el crudo (idas); nivel y metros los calcula `yoyo.js`.

## Riesgos
- El tiempo por toque en pantalla depende del dispositivo: no se puede prometer exactitud, sólo repetibilidad. Por eso se compara contra uno mismo.
- La cuenta y el pitido necesitan audio habilitado por un gesto del usuario (política de los navegadores): el botón *Correr* es ese gesto.
- 30 m no entra en una cancha de 28 m: se usa un largo despejado; si no hay, 20 m.
