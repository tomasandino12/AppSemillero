# Etapa 5 — Biblioteca de ejercicios

**Fecha:** 2026-09-06
**Estado:** aprobado para planificar
**Etapa previa:** `2026-09-04-etapa-4-estadisticas-mediciones-recursos-design.md` (mergeada, tag `pre-etapa-5`)

## Objetivo

Una biblioteca de ejercicios del club, compartida entre los entrenadores, donde
cargar cueste poco y donde quede registrado no sólo el ejercicio sino qué pasó
al usarlo.

---

## 1. Sobre qué evidencia se diseña esto

No sobre suposiciones. Un entrenador de premini, mini y sub-13 del club dijo:

| Lo que dijo | Qué significa |
|---|---|
| "Vamos con la idea de lo que queremos trabajar, por ejemplo pase, y de ahí vamos con los ejercicios o improvisamos" | La unidad de planificación real es **el tema**, no la sesión con tiempos |
| "Hay veces que los ejercicios no salen como te los imaginás y lo terminás cambiando en el momento" | Planifican parcialmente y ajustan. **Es normal, no una falla a corregir** |
| "Cuando improviso, lo que se me ocurre. Cuando no, tomo cosas de todos lados" | No hay metodología establecida que reemplazar |
| "Siento que me ha pasado, pero no mucho" (sobre no encontrar ejercicios viejos) | **Señal débil.** Buscar y archivar no duelen hoy |
| "Me acuerdo que salió mal y por qué, pero no queda registrado" | **Señal fuerte.** El conocimiento existe y se pierde |
| "No, no tienen idea" (sobre si los otros profes saben qué usa) | **La más fuerte.** Vacío real, sin solución actual |

### Las tres consecuencias

**1. El orden de valor es compartir > registrar qué pasó > archivar para buscar.**
La búsqueda y el archivo personal se construyen mínimos.

**2. Se organiza por tema, no por sesión.** No se construye un planificador.

**3. Cargar tiene que costar segundos.** Éste es el riesgo central de toda la
funcionalidad: **el que hace el trabajo de escribir no es el que recibe el
beneficio.** El profe que carga no siente hoy el dolor de perder ejercicios; lo
van a sentir el club y quien venga después. Una función que pide esfuerzo hoy a
cambio de un beneficio ajeno y futuro se abandona rápido.

Por eso: **sólo dos campos obligatorios, título y tema.** Todo lo demás
opcional. El beneficio inmediato que el profe sí valoró es que los demás vean lo
suyo y él vea lo de los demás.

---

## 2. Hallazgo que hubo que resolver antes: no existe la autoría

"Siempre se muestra quién lo cargó" no se podía cumplir con lo que había:

- `recurso.creado_por` guarda un UUID de `auth.users`, no un nombre.
- No existe ninguna tabla en `public` con nombres de usuario.
- La policy de `miembro_club` es `user_id = auth.uid()`: **un profe no puede leer
  ni siquiera la fila de membresía de otro**, así que agregarle un `nombre` no
  habría alcanzado.

**Decisión:** tabla nueva `perfil_entrenador` con RLS de club. No se toca
`miembro_club` ni su policy, que es deliberadamente restrictiva.

El nombre se pide **una sola vez, en la misma hoja donde el profe carga su
primer ejercicio o su primera nota**. Sin pantalla de configuración y sin un
ítem nuevo en la navegación.

---

## 3. Esquema — migración `0015_biblioteca_ejercicios.sql`

Mismas convenciones que el resto: `club_id` en toda tabla de dominio, FKs
compuestas `(club_id, x_id)`, RLS con el patrón de membresía de `0002`, y
`GRANT` a `authenticated`.

```sql
perfil_entrenador
  id, club_id, user_id, nombre, creado_en
  unique (club_id, user_id)

ejercicio
  id, club_id,
  titulo       not null,
  tema         not null,          -- sin CHECK, ver abajo
  descripcion, enlace, material, jugadores, categorias,   -- todos nullable
  creado_por   not null default auth.uid(),
  creado_en, actualizado_en
  unique (club_id, id)            -- target de la FK compuesta de nota_ejercicio

nota_ejercicio
  id, club_id, ejercicio_id, texto not null,
  creado_por not null default auth.uid(), creado_en
  foreign key (club_id, ejercicio_id) references ejercicio (club_id, id) on delete cascade
```

### Decisiones del esquema

**`tema` no lleva `CHECK`.** Parece un descuido y es deliberado: la lista de
temas vive en el código y tiene que poder editarse sin una migración. Un `CHECK`
la ataría a una migración cada vez que alguien quiera agregar "transición". Se
valida en la app, contra la lista de `src/data/temas.js`.

**`material`, `jugadores` y `categorias` son texto libre.** "6 a 12 jugadores"
es la respuesta real de un profe; obligarlo a un entero lo hace hacer cuentas.
`categorias` tampoco puede ser FK a `plantel`: el entrevistado trabaja premini,
mini y sub-13, que hoy no existen como planteles.

**Un ejercicio y una nota son una fila cada uno**, así que no necesitan RPC. La
regla del proyecto se mantiene intacta: toda escritura de más de una fila va por
RPC `security invoker` con su script de rollback. Acá la única escritura
multi-fila es mandar un ejercicio a varios jugadores, y usa `guardar_recurso`
(`0011`), que ya existe y **no se toca**.

**Sólo el autor edita o borra lo suyo.** RLS lo garantiza: las policies de
`update` y `delete` de `ejercicio` y `nota_ejercicio` exigen además
`creado_por = auth.uid()`. Es la primera vez en el proyecto que una policy
distingue dentro del club, y va en la base y no en la UI porque una guarda de
interfaz no es una garantía.

---

## 4. Dónde vive: dos secciones en RECURSOS

RECURSOS gana dos pestañas internas: **Jugadores** (lo que ya existe, sin
cambios de comportamiento) y **Ejercicios**. No se agrega un sexto ítem a la
navegación de abajo: en celular ya está al límite.

Pantalla nueva `p-ejercicio` para el detalle de uno, registrada como las demás,
para que la flecha de volver del chrome funcione igual que en el resto.

---

## 5. Cargar en dos campos

La hoja de alta muestra **título** y una fila de **chips de tema tocables**. No
un `<select>`: en celular abre el picker nativo y son tres toques contra uno.
Con esos dos campos, guardar ya está habilitado.

El resto vive detrás de un "Agregar más detalles" plegado, cerrado por defecto.

**"Guardar a medio cargar" no necesita un sistema de borradores.** Como sólo
título y tema son obligatorios, guardar temprano *es* guardar incompleto, y
completar después es editar. Es la interpretación que menos código construye
para el mismo resultado.

---

## 6. Las notas de uso, la pieza que más importa

Es lo que hoy se pierde. Un ejercicio con la nota *"con los de mini no funcionó
hasta que achiqué la cancha"* vale mucho más que el mismo ejercicio sin ella, y
es lo único que no se puede encontrar en internet.

Cumplen dos funciones distintas y las dos importan:

- **Antes de la práctica** son la fuente de ideas ya probadas con chicos del club.
- **Al explicar o ajustar** son la advertencia que evita repetir un tropiezo
  ajeno: *"los chicos no entendieron bien las rotaciones"* le sirve al siguiente
  para explicarlo distinto desde el principio.

**Por eso, en el detalle de un ejercicio, descripción y notas son dos bloques
hermanos con el mismo peso visual.** Las notas no van al pie ni plegadas. Si
quedan escondidas abajo de todo se pierde el valor real de la biblioteca, que es
la experiencia vivida por otros profes y no el archivo del ejercicio.

Cualquier miembro del club agrega una nota a cualquier ejercicio, con autor y
fecha, en pocos toques. Las notas ajenas no se tocan.

### Señal binaria de "ya probado"

En la lista, un ejercicio con al menos una nota se distingue de uno sin
ninguna. **No es un ranking ni un contador**: es una marca de presencia. El dato
ya existe, mostrarlo no cuesta nada, y ayuda a que la biblioteca funcione como
fuente de ideas probadas y no sólo como archivo.

---

## 7. Mandar un ejercicio a jugadores — CONSTRUIDO Y REMOVIDO

Esta sección se implementó y después se sacó, antes de mergear. Queda escrita
para que nadie la vuelva a construir creyendo que es una omisión.

**El error fue de dominio, no de código.** Un ejercicio es para la práctica en
grupo, con el profe presente y la cancha disponible. Un recurso es para que el
chico trabaje solo, por fuera de la práctica. **No existe el caso real de un
profe mandándole un ejercicio de cancha a un chico para que lo haga en su
casa**, así que el "puente natural entre las dos secciones" que este spec daba
por obvio no tenía ningún uso detrás.

Las dos secciones de RECURSOS siguen siendo Jugadores y Ejercicios, sin puente
entre ellas. `guardar_recurso` (`0011`) se sigue usando desde la pestaña
Jugadores, que es su caso legítimo.

---

## 8. Preparado para IA, sin IA todavía

Más adelante se quiere usar un modelo para facilitar la carga y categorizar. No
se construye ahora, pero el diseño no le cierra la puerta:

- **El texto del profe se guarda siempre tal cual, sin transformarlo.** Cualquier
  versión estructurada que se genere será un campo adicional, nunca un reemplazo.
- Los campos estructurados son opcionales y se pueden completar después.
- **Ningún dato de jugador vive dentro de un ejercicio.** Son texto genérico, y
  eso es lo que hará viable mandarlos a una API externa sin exponer datos de
  menores.

Cuando llegue, requerirá una función de servidor (la clave no puede vivir en el
frontend) y regirá el principio del proyecto: **la IA ayuda a escribir y
organizar, no a decidir.**

---

## 9. Estado inicial

La biblioteca arranca vacía. El estado vacío explica para qué sirve y ofrece
cargar el primero, sin parecer una pantalla rota. La lista tiene que verse bien
con uno, con diez y con cien.

---

## 10. Fuera de alcance

- Planificador de sesiones, calendario, registro de prácticas ejecutadas.
- Mensajería, notificaciones, feed, reacciones, métricas de uso, ranking.
- Búsqueda avanzada y taxonomías anidadas. Filtro por tema y poco más.
- IA, funciones de servidor, llamadas a APIs externas.
- Cuentas de jugador.
- Dependencias, frameworks, build steps.

---

## 11. Criterios de aceptación

- [ ] RECURSOS tiene dos secciones, Jugadores y Ejercicios, sin agregar un ítem
      a la navegación.
- [ ] Un ejercicio se crea con **sólo título y tema**, en pocos toques, a 375px
      con una mano.
- [ ] Todos los demás campos son opcionales y se completan después editando.
- [ ] Cualquier miembro del club ve todos los ejercicios, con el autor visible.
- [ ] Cualquier miembro agrega una nota a cualquier ejercicio, con autor y fecha.
- [ ] Un profe sólo puede editar o borrar lo suyo, **garantizado por RLS**.
- [ ] Se puede filtrar por tema.
- [ ] En el detalle, las notas tienen la misma jerarquía visual que la
      descripción; no son un comentario al pie.
- [ ] En la lista, los ejercicios con al menos una nota se distinguen, sin
      contador ni ranking.
- [ ] El texto escrito por el profe se guarda tal cual.
- [ ] Estado vacío claro y útil.
- [ ] RLS activo y `GRANT` a `authenticated` en las tres tablas nuevas.
- [ ] `npm test` pasa completo, incluido `importsResueltos`.
- [ ] Verificado en el navegador a 375px.
- [ ] El resto de la app sigue igual: import, plantel, mediciones, estadísticas.

---

## 12. Condiciones de parada

Parar y preguntar antes de: modificar el parser, las migraciones existentes o la
lógica de import; agregar campos obligatorios más allá de título y tema;
construir algo de la lista de fuera de alcance; integrar IA o una función de
servidor; agregar dependencias; o si la carga rápida pareciera requerir más de
dos campos obligatorios.
