# Coordinación: roles, asignaciones y despliegue

## Qué puede cada uno

| | Entrenador | Coordinador | Los dos roles |
|---|---|---|---|
| Jugadores, plantel, fichas, mediciones, partidos | sólo sus categorías asignadas | nada | sus categorías asignadas |
| Biblioteca de ejercicios y notas | todo el club | (no se muestra en su pantalla) | todo el club |
| Panorama agregado y Profes | no | sí | sí, con el botón **Coordinar** |
| Habilitar, asignar, quitar | nunca | a otros, en su club | a otros, en su club |
| Finanzas (rubros y movimientos, 0054) | nada | carga, edita y borra (borrado lógico, con rastro) | igual que el coordinador |

Todo esto lo hace cumplir la base (RLS), no la interfaz. Detalle en
`supabase/ESQUEMA.md`.

**Finanzas.** La pestaña FINANZAS muestra el mes elegido: ingresos, egresos,
resultado, totales por rubro y los movimientos. Los rubros (Patrocinios,
Arbitrajes…) se crean desde ahí y no se borran: se desactivan. Un movimiento
borrado deja de sumar pero queda en la base, con quién y cuándo; cada edición
guarda cómo estaba antes (`movimiento_cambio`). Verificación de permisos:
`tests/verificarFinanzas.sql` en el SQL Editor (todo `OK`). No se publica a las
familias: eso es otro módulo (ver la spec de finanzas).

**Cambio de temporada (0059).** En Profes → *Cambio de temporada*: el
coordinador abre la temporada nueva (se copian los planteles), asigna profes a
los planteles nuevos y recién después pasa a los chicos, que el asistente
propone según su año de nacimiento (Escuelita 2019+, U9 2017–18, U11 2015–16,
U13 2013–14, U15 2011–12, U17 2009–10, U21 2005–08, Mayores antes; corre un año
por temporada). Los que dejan el club pierden sus datos de emergencia; su
historia queda. Los pases se pueden confirmar de a tandas.

**Datos de emergencia (0059).** Teléfono, contacto de urgencia, alertas médicas,
alergias, medicación, obra social. Los carga el profe (Plantel → *Importar
emergencias*) desde la planilla "Emergencias para Semillero"; los ven el profe
de la categoría (ficha y Plantel) y el coordinador (Profes → *Datos de
emergencia*, sólo lectura). No se guardan en el celular.

Lo que **no** se hace desde la app, a propósito:
- Crear un coordinador.
- Darle el rol de entrenador a alguien que ya es coordinador (ni a uno mismo).
- Sacar a alguien del club entero.

## Estado de producción al 2026-09-13

Diagnóstico corrido antes de escribir 0017:

| Cuenta | Rol | Categorías |
|---|---|---|
| Nacho | entrenador | U13M |
| Tomás | coordinador | — |
| Cuenta de prueba | entrenador | U17M, U21M |

Ningún entrenador sin asignaciones: el backfill de 0017 no hace nada. Tomás es
coordinador puro a propósito; lo de entrenador se prueba con la cuenta de prueba.

## Desplegar

**En este orden.** Ningún paso se saltea.

### 1. Diagnóstico (sólo lectura)

Si pasó tiempo desde la tabla de arriba, repetirlo en el SQL Editor:

```sql
select u.email, m.club_id, m.rol,
       count(a.*) as asignaciones,
       string_agg(p.categoria, ', ' order by p.categoria) as categorias
from miembro_club m
join auth.users u on u.id = m.user_id
left join asignacion_plantel a
       on a.miembro_club_user_id = m.user_id and a.miembro_club_club_id = m.club_id
left join plantel p on p.id = a.plantel_id
group by u.email, m.club_id, m.rol
order by m.club_id, u.email;
```

(Después de 0017 la columna `rol` ya no existe: la consulta equivalente usa
`m.es_entrenador, m.es_coordinador`.)

### 2. Aplicar 0017 y 0019

`npx supabase db push` aplica lo que falte, cada migración en su transacción.
Conviene hacerlo cuando nadie esté usando la app.

0019 (nombre en los metadatos de Auth y las cuatro categorías que faltaban)
depende sólo de 0017, y **tiene que estar antes del deploy del frontend**: sin
ella la biblioteca no muestra autores y a las cuentas viejas sin nombre (Nacho)
se les pediría el nombre antes de entrar, en vez de dejarlas pasar.

Si `db push` quiere aplicar también 0018 en el mismo paso, aplicar 0017 y 0019
a mano desde el SQL Editor y dejar 0018 para el paso 7.

**0022 (tiro en partidos en el Panorama)** depende sólo de 0017 y también va
antes del frontend que la usa. Sin ella la pantalla no se rompe, pero en las
categorías con partidos dice "Ningún partido con triples intentados", que es
falso. Verificación: `tests/verificarCoordinacion.sql`, caso 9. Rollback:
`tests/rollback0022.sql`.

Correr `tests/verificarCoordinacion.sql` en el SQL Editor: todo `OK`, salvo los
casos 10 y 11 en `PENDIENTE`.

### 3. Primer coordinador

Ya existe (Tomás, `rol = 'coordinador'`): 0017 lo convierte solo en
`es_coordinador = true`. Para cualquier coordinador futuro, a mano:

```sql
insert into miembro_club (user_id, club_id, es_coordinador)
values ('<uuid de Authentication → Users>', '<uuid de la tabla club>', true)
on conflict (user_id, club_id) do update set es_coordinador = true;
```

### 4. Deploy del frontend

### 5. Revisar asignaciones de la migración

Entrar como coordinador → **Profes**. Las marcadas *"asignada al activar el
panel"* las creó la migración para que nadie perdiera acceso: quitar las que
no correspondan. (Al 2026-09-13 no debería haber ninguna.)

### 6. Si un coordinador también entrena

Antes del paso 7, o se queda sin sus datos. Hoy no aplica a nadie.

```sql
update miembro_club set es_entrenador = true
where user_id = '<uuid>' and club_id = '<uuid del club>';

insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id, origen)
select '<uuid>', club_id, id, 'manual' from plantel
where club_id = '<uuid del club>' and categoria in ('U13M');   -- sus categorías
```

### 7. Aplicar 0018

Aborta sola si hay un club con miembros y sin coordinador. Correr de nuevo
`tests/verificarCoordinacion.sql`: todo `OK`, nada `PENDIENTE`.

Y con credenciales reales (sólo lee, no escribe nada):

```bash
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... \
VERIFICAR_EMAIL=<cuenta de prueba> VERIFICAR_PASSWORD=... \
VERIFICAR_COORD_EMAIL=<coordinador> VERIFICAR_COORD_PASSWORD=... \
node tests/verificarAccesoPorCategoria.js
```

## Volver atrás

- `tests/rollback0018.sql` — el coordinador vuelve a leer datos individuales.
- `tests/rollback0017.sql` — vuelve a la forma de 0016. Aborta si hay alguien
  con los dos roles o asignaciones cerradas, y dice cuáles.

## Consultar la historia

Quién estuvo a cargo de cada categoría, incluidas las cerradas:

```sql
select p.categoria, t.nombre as temporada, u.email,
       a.desde, a.hasta, a.origen,
       ua.email as asignado_por, uc.email as cerrado_por
from asignacion_plantel a
join plantel p     on p.id = a.plantel_id
join temporada t   on t.id = p.temporada_id
join auth.users u  on u.id = a.miembro_club_user_id
left join auth.users ua on ua.id = a.asignado_por
left join auth.users uc on uc.id = a.cerrado_por
order by t.nombre desc, p.categoria, a.desde;
```

## Familias (0057)

Las familias no son un rol de `miembro_club`: son cuentas sin club que se vinculan solas con el mail con el que inscribieron a su hijo (el profe importa la planilla en Plantel → Importar inscriptos). Coordinación las ve en **Familias**, con quién y cuándo, y puede dar de baja cualquier vínculo; la baja no se deshace sola si la familia vuelve a entrar. Un profe que además es padre no se vincula: queda pendiente si hace falta.

## Límite conocido: un solo club

La lista de **Esperando acceso** muestra todas las cuentas confirmadas sin club
de toda la plataforma: una cuenta recién creada no pertenece a ningún club y no
hay forma de saber a cuál va. Con Newell's solo, es exacta. Con un segundo
club, un coordinador vería los mails de quien se registró para el otro. Se
decidió probar primero con usuarios reales y pensarlo recién si hace falta más
de un club.

Desde la cuenta de jugador (0029) hay un límite equivalente, con el mismo
criterio: `clubes_para_solicitar()` le muestra a **cualquier cuenta sin club**
la lista de clubes y categorías de la plataforma, para armar el formulario
"Soy jugador de un club". Son nombres de club y de categoría, información
pública, y con un solo club es exacto. Con un segundo club habría que ofrecer
un código de invitación en vez de un catálogo abierto.

Esa lista de **Esperando acceso** no incluye a quien ya tiene una cuenta de
jugador vigente. Un chico que pidió acceso y todavía no fue aprobado sí puede
aparecer ahí: a un jugador se lo aprueba desde PLANTEL, no desde acá, y
habilitarlo como profe le daría acceso a los datos de otros menores.

## El portal del básquet (`/`) y los formularios de las familias

La página que se reparte a las familias es el **portal**, en la raíz del sitio
(`/`). Semillero, la aplicación de profes, coordinación y jugadores, vive en
`/app` y el portal tiene un botón que lleva ahí. Arriba de todo van las dos
tarjetas que busca un padre, **Inscribir** y **Enviar comprobante**; después,
atajos, "Quiero jugar", el calendario del mes, las categorías, otros
formularios, la foto del club, sponsors y a quién escribirle. **Cada parte sin
datos no se muestra** (nunca un "Próximamente"). No tiene sesión ni muestra
datos de chicos.

### Formularios: se cargan desde la app, sin tocar código

Coordinación → pestaña **Familias** → botón **Formularios de la página del
básquet**. Ahí la coordinación:

- **Agrega** un formulario: título, una línea de "para qué es y qué tienen que
  tener a mano" (la familia la lee antes de abrirlo) y el enlace de Google
  Forms. Ejemplo: *"hay que pagar las rifas"* → se suma "Comprobante de
  rifas", se escribe qué tener a mano (la foto del comprobante) y se pega el
  enlace. La familia lo ve en el portal al toque.
- **Edita** tocando el formulario; **sube o baja** con las flechas; **oculta**
  cuando ya no corresponde (por ejemplo, al cerrar la inscripción). **No se
  borra**: queda oculto y se puede volver a mostrar.
- El enlace tiene que ser de Google Forms (`https://docs.google.com/forms/…` o
  `https://forms.gle/…`); la app y la base rechazan cualquier otro.
- **Esto lo ve cualquiera**, sin entrar con ninguna cuenta: no pongas nombres
  de chicos ni datos personales en el título ni en el texto.
- **Al abrir la temporada:** publicá en Google los formularios de Inscripción y
  de Comprobante, agregalos acá con su enlace y marcalos como "Inscripción" y
  "Comprobante de pago" en "Cómo se muestra en la página". Las tarjetas de
  arriba del portal se prenden solas. (Ya no hay uno precargado: el que había
  era el formulario viejo de 2026.)
- Para ver cómo lo ven las familias, el enlace "Ver cómo lo ven las familias"
  abre el portal en otra pestaña.

Los formularios y lo que suben las familias (DNI, fotos, datos de salud, 
comprobantes) viven en Google y **nunca pasan por Semillero ni por la base**.
Quién los recibe y cómo se organizan en Drive: ver la guía de inscripción en
Google (rama `claude/inscripcion-google-41cf4e`).

### Noticias: se publican desde la app

En Semillero, modo coordinar → **FAMILIAS** → **Noticias de la página del básquet**.

1. **Nueva noticia:** título, resumen (la línea de la tarjeta), texto (párrafos separados por una línea en blanco) y de qué es (Club, Partidos, Eventos, Inscripción).
2. **Fotos (hasta 6):** el celular las achica solo antes de subirlas. Cada una lleva una descripción de qué se ve, **sin nombres de chicos**. Para guardarla con fotos hay que tildar la autorización de imagen: tildala sólo si las familias de los chicos que se ven la firmaron.
3. **Guardar borrador** la deja sin publicar; **Publicar** la muestra en el inicio (las 3 últimas) y en `/noticias`. La fecha que se ve es la de la primera vez que se publicó.
4. **Despublicar** la saca de la página sin borrarla. **Borrar noticia** la borra con sus fotos, y no se puede deshacer.

Lo publicado lo ve cualquiera, sin cuenta.

### Lugares especiales: Inscripción, Comprobante, "Quiero jugar", sponsors y recaudación

Al agregar o editar un formulario, el selector **"Cómo se muestra en la página"**
tiene estas opciones:

- **Común**: va en la lista "Otros formularios" (pase, rifas…).
- **Inscripción (botón grande de arriba)** (desde 0062): **así se abre y se cierra
  la inscripción**. Con el formulario marcado y visible, el primer botón de la
  banda roja y negra de arriba es "Inscribir a mi hijo o hija"; oculto o sin
  marcar, ese lugar es de "Quiero jugar en Newell's".
- **Quiero jugar en Newell's (consultas)**: es el primer botón de arriba mientras
  la inscripción está cerrada (sin formulario activo, se ve apagado). Es el
  formulario al que lleva el QR impreso (ver abajo).
- **Comprobante de pago (botón grande de arriba)** (desde 0062): el segundo botón
  de la banda, con el alias para copiar debajo. Es independiente de la
  inscripción: se puede inscribir alguien sin pagar nada.
- **Sumate al básquet de Newell's (colaboradores)**: su propia sección, para una
  empresa que quiere asociarse o alguien que quiere dar una mano en los eventos.
- **Eventos de recaudación** (desde 0063): es otro formulario que el de
  colaborar, para quien quiere comprar y colaborar (pizzas, rifas, comidas) y
  deja su mail. Es la banda roja de debajo del calendario.

El WhatsApp del coordinador aparece **una sola vez**, al final de las preguntas
frecuentes (el botón "Ayuda" de arriba lleva ahí). Profes y jugadores entran a
Semillero desde "Soy profe o jugador", en el encabezado.

Cada lugar especial es **único**: si marcás un formulario y otro ya lo tenía, la
app te avisa ("Hoy lo tiene «X»: al guardar, ese formulario pasa a ser común") y
se lo saca. Un formulario **oculto** no se muestra aunque conserve su lugar: su
botón se ve apagado. El mail que dejan colaboradores y compradores
lo piden esos formularios y queda en sus planillas de Google, no en Semillero.

### QR para imprimir: `/consultas`

El cartel y el código QR (carpeta `docs/cartel-qr/`, guía en su `LEEME.md`) apuntan
a una **dirección fija**, `/consultas`. Esa dirección **lleva sola al formulario de
consultas que esté vigente**: si cambiás el formulario (editándolo o marcando otro
como "Quiero jugar"), el QR ya impreso sigue funcionando. Si no hay ninguno
abierto, la persona ve un mensaje claro con el enlace al portal.

**El cartel está como BORRADOR ("no imprimir hasta definir el dominio")**: el QR
lleva escrito el dominio, y si el portal cambia de dominio los carteles impresos
quedan apuntando al viejo. Antes de imprimir, escaneá el cartel con un celular.

### Logos de sponsors

La franja de logos del portal está preparada y **oculta mientras no haya ninguno**.
Para sumar uno hoy (es un cambio de código chico, con deploy): poner el archivo
(png, jpg, webp o svg, sin espacios en el nombre) en `public/sponsors/` y agregarlo
a `sponsors` en `src/data/portal.js`:
`{ nombre: 'Ferretería Sur', logo: '/public/sponsors/ferreteria-sur.png', enlace: 'https://…' }`
(el `enlace` es opcional y tiene que ser https). Un logo con otra ruta, sin nombre o
cuyo archivo no está, no se muestra. Si más adelante son muchos o cambian seguido,
la idea es una pantalla "Sponsors" como la de Formularios, con los logos en
Supabase Storage (habría que sumar ese host a `img-src` de la política de
seguridad); no está construida.

### Calendario, categorías, sede, contacto, alias y foto: archivo `src/data/portal.js`

Estos sí son cambios de código (se hacen una vez y casi no cambian). Cada dato
que falta va en `null` y esa parte del portal no se ve.

| Dato | Dónde va | Qué pasa mientras falta |
|---|---|---|
| Temporada que se anuncia | `temporada:` (hoy 2027) | — |
| Clave de Google (API key) | `agenda.clave` | No hay calendario |
| ID del calendario público | `agenda.calendarios[0].id` | No hay calendario |
| Categorías que ofrece el club | `categorias:` (los años NO: se calculan) | — |
| Días y horario de cada categoría | `horario:` de cada categoría | La fila va sin horario |
| Un texto sobre una categoría (opcional) | `detalle:` de cada categoría | No se muestra nada (se ve en `/categorias`) |
| Dónde se entrena | `sede:` `{ nombre, direccion, mapa }` | No se ve |
| WhatsApp del coordinador | `contacto:` | Sin botón "Ayuda" ni "¿Dudas?" |
| Alias para transferir | `alias:` `{ alias, titular }` | La tarjeta del comprobante va sin alias |
| Foto del club | archivo en `public/portal/` + `foto:` | No se ve |
| Logos de sponsors | ver "Logos de sponsors" | No se ven |

**Categorías.** Los años de nacimiento no se escriben a mano: salen de
`temporada` con la misma regla que usa Semillero para ubicar a un chico
(`src/data/categorias.js`). Al pasar de temporada, se cambia sólo `temporada`.

**Calendario.** El portal arma el mes entero con un puntito de color por evento.
Es **un solo calendario de Google**, público, y **el color del evento dice qué
es**. Al cargar un evento en Google Calendar, se toca el color y se elige:

| Color en Google | En el portal |
|---|---|
| **Tomate** (rojo) | Partido (Primera, intermedias…) |
| **Banana** (amarillo) | Evento de recaudación (rifas, pollada, cena) |
| **Pavo real** (celeste) | Charla |
| **Albahaca** (verde) | Entrenamiento especial |
| Sin color, u otro | Lo que diga el título (abajo); si no dice nada, Evento |

**Elegí el color en el evento** (Tomate partido, Banana evento, Pavo real charla),
**o poné la palabra en el título**: "Torneo…", "Charla…". El color
"predeterminado" no cuenta: es el del calendario, cada uno lo ve a su manera y
no le llega a la página. Conviene poner el color del calendario en **Grafito**
(gris): así un evento al que no le elegiste color se nota enseguida.

Sin color elegido, la página mira la primera de estas palabras que aparezca en el
título (da igual con tilde o mayúscula):

| Si el título dice… | En el portal |
|---|---|
| partido, vs, contra, torneo, amistoso, cuadrangular, triangular, final, liga, fecha | Partido |
| charla, reunión, capacitación, clínica | Charla |
| entrenamiento, práctica | Entrenamiento |
| rifa, pollada, cena, venta, recaudación, fiesta | Evento |

Se muestra sólo el título, la hora y el lugar; la descripción nunca. Cada evento
tiene **"Agregar a mi calendario"** (Google o iPhone), y abajo hay un botón para
**seguir el calendario entero** desde el celular: los eventos nuevos le aparecen
solos a la familia. Para conectarlo, una sola vez, desde una compu con la cuenta
de Comisión Básquet:
1. Crear un calendario **aparte** del principal (el principal tiene lo interno
   de la subcomisión): ☰ → Otros calendarios → **+** → Crear calendario →
   nombre *"Básquet NOB · Agenda (PÚBLICO)"*.
2. En su Configuración y uso compartido → "Permisos de acceso" → marcar
   **"Hacer disponible públicamente"** con **"Ver todos los detalles"**. Sin eso,
   Google no da los eventos.
3. En la misma pantalla, "Integrar el calendario" → copiar el **ID de
   calendario** (termina en `@group.calendar.google.com`) y pegarlo en `id:`.
4. **La clave (API key), una sola vez** (ya está hecha y cargada desde el 20/10):
   1. Entrar a <https://console.cloud.google.com> con la cuenta de Comisión
      Básquet. Arriba, "Seleccionar un proyecto" → **Proyecto nuevo** → nombre
      "Portal básquet" → Crear.
   2. Menú ☰ → **APIs y servicios** → **Biblioteca** → buscar **Google Calendar
      API** → **Habilitar**.
   3. **APIs y servicios** → **Credenciales** → **Crear credenciales** → **Clave
      de API**. Copiarla (empieza con `AIza`).
   4. Tocar la clave para editarla. En **Restricciones de aplicaciones**:
      "Sitios web" → agregar `https://app-semillero.vercel.app/*`. En
      **Restricciones de API**: "Restringir clave" → elegir sólo **Google
      Calendar API**. Guardar.
   5. Pegarla en `agenda.clave`. Es pública a propósito (la ve el navegador),
      por eso las dos restricciones: sólo sirve desde el portal y sólo para leer
      calendarios públicos. No tiene costo para este uso.
5. `npm run test:q`, commit y deploy.

> ## ⚠️ El calendario es público: NUNCA nombres de chicos
>
> Cualquiera con el ID ve **todos** los eventos, con su título y su descripción
> (el portal muestra sólo título, hora y lugar, pero Google da todo). **No
> escribas nombres de jugadores** ni datos personales en
> ningún evento. Sí: *"U13 vs. Central, 10 h, cancha 2"*. No: *"U13: convocados
> Pérez, Gómez…"*. Si una persona carga eventos, avisale esto antes de darle
> el permiso.

**Que varias personas carguen eventos.** No hace falta que lo cargue todo una
sola persona. Ejemplo: alguien de la subcomisión va a hacer una pollada y la
carga él mismo en el calendario. Cómo se le da permiso (lo hace **el dueño del
calendario**, o sea la cuenta de Google de la subcomisión que lo creó):
1. Abrir **Google Calendar** desde una compu, con la cuenta dueña del calendario.
2. En la lista de la izquierda ("Mis calendarios"), pasar el mouse por el
   calendario, tocar los **tres puntitos** → **Configuración y uso compartido**.
3. Bajar hasta **"Compartir con personas o grupos específicos"** → **Agregar
   personas y grupos** → escribir el mail de la persona.
4. En "Permisos", elegir **"Hacer cambios en los eventos"** → **Enviar**.
5. Esa persona acepta la invitación (le llega por mail) y, desde la **aplicación
   de Google Calendar de su celular**, elige ese calendario al crear un evento.
   El evento aparece **solo** en el portal, sin tocar nada más (a veces tarda unos
   minutos).

**Para sacarle el acceso**, el dueño vuelve a esa misma lista ("Compartir con
personas o grupos específicos") y toca la **X** al lado del mail. Los eventos que
ya cargó quedan; si hay que sacarlos, se borran desde Google Calendar.

**Tres consejos para que no se cuele nada personal.** Lo personal de cada persona
(su turno médico, su cumpleaños) **no aparece en la página**: sólo aparece lo que
se guarda en el calendario del básquet. El riesgo es guardar un evento personal
ahí por error. Para evitarlo:
1. **Ponerle a cada calendario un nombre que avise que es público**, por ejemplo
   *"Básquet NOB · Eventos (PÚBLICO)"*. Se cambia en Configuración y uso
   compartido → Nombre.
2. **Darle un color propio**, distinto del personal, así se nota de un vistazo
   en cuál se está cargando (tres puntitos del calendario → elegir color).
3. **Antes de guardar un evento, mirar en qué calendario queda.** El que viene
   elegido de entrada es el personal de cada uno; hay que cambiarlo al del
   básquet. Si algo personal se cuela igual, cualquiera con permiso para hacer
   cambios en los eventos lo puede borrar.

Esto **no es lo mismo** que "Hacer disponible públicamente" del paso 1 de arriba:
eso es sólo para que el portal pueda **mostrar** el calendario; los permisos de
las personas de acá arriba son los que dejan **cargar** eventos. Dale el permiso
a cada persona por separado y sólo a quien lo necesita.

**Contacto** (botón "Ayuda" de arriba y "¿Dudas? Escribile al coordinador"): en
`contacto:` va un link de WhatsApp (`https://wa.me/549341…`, con el código de
país y de área, sin `+` ni espacios) o un mail (`mailto:coordinacion@…`). Otro
formato no se acepta.

**Sede**: `mapa` es el link de "Compartir" de Google Maps
(`https://maps.app.goo.gl/…`); otro link no muestra el botón "Cómo llegar".

**Foto del club**: sólo con la **autorización de imagen firmada** por las
familias de todos los chicos que se reconozcan. Archivo jpg o webp de ~1200 px
de ancho en `public/portal/`, y en `foto:` la ruta y un `alt` que cuente qué se
ve (no quiénes son).

### Login de Semillero: la URL de retorno

El login vuelve a `https://app-semillero.vercel.app/app`. Lo cubre el comodín
`https://app-semillero.vercel.app/**` de Supabase → Authentication → URL
Configuration (ver `docs/CONFIGURAR-AUTH.md`); alcanza con confirmar que esa
entrada existe. Los mails viejos que apuntan a `/` los reenvía el portal a
`/app`.
