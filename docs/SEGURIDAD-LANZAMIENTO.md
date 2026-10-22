# Seguridad antes de abrir a usuarios reales

Auditoría del 2026-09-18/19. Lo que se corrigió en el código y la base está en
las migraciones 0027 y 0028; esto es lo que **no** se puede hacer desde el
repo: configuración del dashboard de Supabase y decisiones.

## Qué se verificó y estaba bien

- RLS activado en las 28 tablas; la vista usa `security_invoker`; las funciones
  `security definer` fijan `search_path` y no las ejecuta `anon`.
- Escritura por dueño: las policies validan el plantel en `USING` y en
  `WITH CHECK` (no se puede mover un registro a un plantel ajeno) y las claves
  foráneas compuestas `(club_id, x_id)` impiden referenciar datos de otro club.
- Login y registro con mensajes que no revelan qué mails tienen cuenta.
- Producción sin archivos expuestos (`/.env`, `/supabase/`, `/docs/`... dan 404)
  y con CSP, HSTS y demás headers. `npm audit`: 0 vulnerabilidades.

## Corregido en esta pasada

- 0028: largo máximo de todo texto que escribe un usuario, y los RPC de
  escritura sin acceso anónimo.
- `decimalEstricto`: los números tecleados ya no pasan por `Number(texto)`
  (`"1e2"` era 100, `"0x10"` era 16).
- El borrador de medición es de cada usuario (antes lo veía otra cuenta del
  mismo celular).

## Lo que tiene que hacer una persona en el dashboard de Supabase

Antes de abrir la app:

1. **SMTP propio** (Authentication → SMTP). El mail integrado de Supabase tiene
   un límite muy bajo por hora: con usuarios reales no llegarían las
   confirmaciones ni las recuperaciones de clave.
2. **Contraseñas** (Authentication → Sign In / Providers → Email): largo mínimo
   8 o más, exigir minúsculas, mayúsculas y dígitos, y **secure password
   change** activado. Si el plan lo incluye, activar la protección contra
   contraseñas filtradas.
3. **URL Configuration**: Site URL y Redirect URLs sólo con el dominio de
   producción (sin `localhost` ni comodines de dominio).
4. **Confirmación de mail** activada (ya lo está en la config local; verificar
   que producción sea igual).
5. Después de cada `db push`: correr `tests/verificarSeguridad.sql` en el SQL
   Editor y mirar Advisors → Security.
6. **Backups**: con datos de menores conviene tener copias (backups diarios del
   plan o un `pg_dump` periódico) y saber cómo restaurar.

Con más calma:

- **CAPTCHA** (Attack Protection). No activarlo sin más: con el CAPTCHA activo,
  registro e ingreso **fallan** si el frontend no manda el token, y eso exige
  integrar el widget (y permitirlo en la CSP). Es un trabajo aparte.
- **Registro cerrado**: hoy cualquiera puede crear una cuenta, que queda sin
  acceso a nada hasta que coordinación la habilita. Si el club es chico y se
  conoce a todos, cerrar el registro público e invitar por mail desde el
  dashboard es lo más seguro. Contrapartida: coordinación ya no habilita
  gente que se registró sola.

## Cuenta de jugador (0029 y 0030)

Los jugadores tienen cuenta propia, de sólo lectura y sólo sobre lo suyo. Antes
de darle acceso a un chico real:

- **Consentimiento de los padres: pendiente de lanzamiento.** Son datos de
  menores de todas las categorías, U13 incluida. El consentimiento se gestiona
  por el canal de papel que el club ya usa; lo que aporta la app es el rastro
  de quién dio el acceso y cuándo (`cuenta_jugador.aprobado_por` y `desde`). No
  aprobar solicitudes hasta tenerlo resuelto con el club.
- **Revocar es cerrar, no borrar.** "Quitarle el acceso" (en la ficha del
  jugador) pone `hasta` y `revocado_por` en la cuenta; el chico deja de ver
  todo al instante y queda escrito quién le dio y quién le sacó el acceso. No hay
  forma de borrar una cuenta de jugador desde la app.
- **Aplicar las migraciones y correr la verificación.** `npx supabase db push`
  (pide confirmación) y después pegar `tests/verificarCuentaJugador.sql` en el
  SQL Editor: tiene que dar todos los casos en OK, en particular el 8 (cero
  filas en todas las tablas) y el 12 (nada de otro chico en `mi_progreso`). Las
  dos migraciones se escribieron sin una base local a mano: esa corrida es la
  primera vez que se ejecutan.
- El chico ve sus recursos, el plan de su categoría con su propio peso y su
  progreso (partidos, tiro, velocidad). **No** ve medidas corporales ni datos de
  otro jugador, ni siquiera un promedio del plantel.

## Aperturas de recursos (0033 y 0034)

El jugador con cuenta deja anotado que abrió un recurso; el profe ve **cuántos**
abrieron, nunca **quién**. Lo impone la base, no la pantalla:

- `apertura_recurso` no tiene grants ni policies: ni el chico ni el cuerpo
  técnico la leen ni la escriben directo. El chico escribe por
  `registrar_apertura()` (sólo un recurso que se le envió) y el profe lee por
  `resumen_recursos()`, que devuelve conteos y ningún id de jugador.
- **Piso de 3 cuentas:** con menos de 3 jugadores con cuenta en el plantel el
  resumen no dice cuántos abrieron, porque con 1 o 2 el profe sabe quiénes son.
- Sólo cuenta a los que tienen cuenta: no dice nada de los demás.
- El chico ve un aviso en su lista de recursos: "tu profe ve cuántos abrieron,
  no quién".
- **Pendiente:** aplicar 0033 y 0034 (`npx supabase db push`, pide
  confirmación) y correr `tests/verificarAperturaRecurso.sql` en el SQL
  Editor: los 7 casos tienen que dar OK. Se escribió sin una base local: esa
  corrida es la primera vez que se ejecuta.

## Blindaje del 2026-09-22 (0036 a 0039)

Auditoría pre-lanzamiento; plan en `docs/superpowers/plans/2026-09-22-blindaje-lanzamiento.md`.

- **0036:** el alta manual y el import con jugadores nuevos fallaban para todo profe desde 0016 (`insert ... returning` contra `jugador_ver`).
- **0037:** la lista "Esperando acceso" ya no muestra chicos, y aprobar una solicitud de jugador exige el código que el chico ve en su pantalla (el nombre del registro es texto libre).
- **0038:** reintentar un guardado de medición o de recurso ya no duplica.
- **0039:** se puede dar de baja a un profe, y sumar a un chico de otra categoría no abre sus medidas corporales cargadas antes.
- **Pendiente:** `npx supabase db push` (pide confirmación) y correr en el SQL Editor `tests/verificarCrearJugador.sql`, `verificarPendientesYCodigo.sql`, `verificarIdempotencia.sql` y `verificarBajaProfe.sql`: todos los casos tienen que dar OK. Ya dieron OK en la base local, junto con las verificaciones anteriores. **El cliente de B5 (código de solicitud) tiene que deployarse el mismo día que 0037.**

## Historia del jugador (0056)

Un profe lee el recorrido completo de un chico (todas sus temporadas y categorías) por `historia_del_jugador`, una función `security definer` sin policies nuevas. Aplicada en producción el 2026-10-18.

- **Quién:** entrenador de un plantel donde el chico tiene hoy una pertenencia vigente. El coordinador, la cuenta de un jugador, un profe dado de baja y cualquier otro profe reciben `42501`.
- **Riesgo aceptado (decisión de Tomás, 16/10):** la ventana de 0039 (auditoría #8) no se aplica a esta lectura. Un profe que suma a su plantel a un chico de otra categoría ve toda su historia, peso y altura incluidos, sin que el profe de antes se entere. Es lo que se pidió para que quien lo recibe sepa cómo viene. Si en el futuro hace falta cerrarlo: pedir que el profe de origen acepte, o una tabla de auditoría de lecturas que mire coordinación.
- **Verificación:** `tests/verificarHistoria.sql` en la base local (6 casos OK el 2026-10-18). Falta correrlo en el SQL Editor de producción si se quiere dejar constancia; no deja nada (se deshace solo) pero **siembra datos de prueba mientras corre**, así que sólo en local.

## Cuentas de familia (0057)

La familia entra con el mail con el que se inscribió el chico y queda vinculada sola, sin aprobación previa del coordinador (decisión de Tomás, 18/10). Ve nombre y categoría de sus hijos y nada más: no recibe `select` sobre ninguna tabla, sólo `mis_chicos()`; estadísticas, mediciones y misiones quedan fuera por construcción.

- **Riesgo aceptado:** quien inscribe a un chico ajeno con su propio mail queda vinculado a él una vez que el profe importa la inscripción. Lo frenan: el mail de la inscripción es el de la cuenta de Google verificada (formulario con login, prompt 05, opción D2), el profe revisa y tilda cada fila al importar, y el coordinador ve todos los vínculos (con fecha y quién) y puede dar de baja cualquiera (Coordinación → Familias). Hoy lo que ve la familia ya es público en las planillas de la CABB.
- **Pendiente antes de sumar contenido sensible** (asistencia, prompt 04; aranceles, prompt 09): la spec de ese módulo revisa si el vínculo necesita aprobación del coordinador o un código por chico (`vinculo_familia.via` está para eso).
- **Excepción a la decisión 1 del prompt 05** (aprobada por Tomás, 18/10): la planilla "Para Semillero" lleva 6 datos sin DNI (apellido, nombre, fecha de nacimiento, categoría, mail, rama) y el profe la baja a mano. Los DNI y documentos no entran a Supabase.
- **Límites:** un profe que además es padre no se vincula (`vincular_por_mail` rechaza al staff); un mail mal escrito en el formulario no vincula a nadie hasta que el profe lo corrige en la ficha.
- **Verificación:** `tests/verificarCuentasFamilia.sql` (12 casos OK en local el 2026-10-18; con un agujero metido a propósito falla en 5). `grep service_role`: cero en el repo; no hace falta función de servidor.

## Datos de menores

La app guarda nombres, fecha de nacimiento, altura y peso de menores (Ley
25.326). Desde el 2026-09-26:

- **Hecho en la app:** `/privacidad` y `/terminos` (`public/legal/`), la
  pantalla "Antes de seguir" que registra la aceptación por cuenta y versión
  (0051, `VERSION_LEGAL`), fuentes servidas sin Google y el aviso de que las
  mediciones son estimaciones.
- **Pendiente con el club:** `docs/legal/checklist-club.md`. Firmar el acuerdo
  de datos (el club es el responsable y Tomás el encargado), sumar el
  consentimiento a la ficha de inscripción (también para los chicos ya
  cargados) y registrar la base en la AAIP.
- **Pendiente técnico:** `db push` de 0051 **antes** del deploy y
  `tests/verificarAceptacionLegal.sql`.

Esto no es asesoramiento legal: los textos se revisan con el club.

## Si aparece un segundo club

El modelo de datos **ya es multi-club** (todo cuelga de `club_id`, con claves
compuestas y RLS por club), pero la aplicación está armada para uno. Dos
caminos:

**A. Una instalación por club (el primer paso recomendado).** Un proyecto de
Supabase y uno de Vercel por club, del mismo repositorio, cada uno con su
`public/config.js`. Se corren las migraciones con `supabase db push` contra el
proyecto nuevo y se crean el club y el primer coordinador por SQL.

- A favor: aislamiento total (los datos de menores de un club nunca conviven
  con los de otro), un error de RLS no cruza clubes, cada club es dueño de su
  información y no hay que escribir código.
- En contra: cada migración hay que aplicarla N veces (con pocos clubes es un
  script), y hay que pagar N proyectos.
- Falta para poder hacerlo prolijo: la marca (escudo y "Newell's") está fija en
  `public/index.html`, y las semillas de 0004 y las categorías de 0019 son del
  piloto.

**B. Un solo despliegue para varios clubes.** Sólo vale la pena con varios
clubes o si se quiere operar como servicio. Falta construir: alta de clubes,
código o invitación para unirse a *un* club (hoy `usuarios_pendientes` lista a
todos los registrados de la plataforma a cualquier coordinador), coordinadores
por club, marca por club y tests de aislamiento entre clubes.

**Sobre "copiar la app y deployearla para otros".** Es exactamente el camino A,
y es legítimo si la app es tuya. Que el código del frontend sea visible no es
un riesgo: se sirve como archivos estáticos y la seguridad está en la base
(RLS), no en ocultar el código. Lo que sí conviene definir, antes de dársela a
otro club, es quién es dueño de la app y de los datos de cada uno.

## Service worker y app instalable (portal-pwa, 2026-10)

`public/sw.js` existe para que Semillero se pueda instalar; no hace que la app
ande sin conexión. **Sólo rige en `/app`** (alcance `/app`, header
`Service-Worker-Allowed` de `vercel.json`): el portal del básquet en `/` no lo
registra, no es instalable y sus páginas ni pasan por el service worker. Lo que
guarda en el celular (Cache Storage, caché `inferiores-<versión>`):
- **Sí**: `public/vendor/`, `public/fonts/`, `public/icons/`, el escudo, y la
  página `/app` limpia (sólo se usa si no hay red).
- **No**: nada de otro origen. Las respuestas de Supabase ni pasan por el
  service worker, así que no pueden quedar datos de menores en el teléfono.
  Tampoco `/src/**` ni el CSS: siguen con el `no-cache` de `vercel.json`, y
  cada deploy llega al recargar.

`tests/serviceWorker.test.js` ata esas reglas. Si alguien corre `npm run
vendor` o cambia una fuente o un ícono, el test pide actualizar `VERSION` en
`sw.js`; al activarse, la versión nueva borra los cachés viejos.

Para verificarlo en el celular o en Chrome: DevTools → Application → Cache
Storage, después de entrar y navegar la app. No tiene que haber nada de
`supabase.co`.

**Plan de escape.** Si el service worker rompe algo en producción, reemplazar
el contenido de `public/sw.js` por esto y deployar. Cada celular lo toma en la
próxima visita, borra sus cachés y se desregistra:

```js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const n of await caches.keys()) await caches.delete(n);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll()) c.navigate(c.url);
})()));
```

Después, sacar la llamada a `registrarServiceWorker()` de `src/ui/main.js`.
El sitio sigue andando como antes (pierde sólo la instalación).

**iPhone instalado**: guarda la sesión aparte de Safari. Quien entró en Safari
tiene que volver a entrar en la app instalada, y los links de mail (confirmar
cuenta, recuperar clave) se abren en Safari.

## Portal público: la única excepción a "anon no tiene nada" (0058)

0027 le sacó a `anon` todo permiso sobre las tablas. **0058 es la primera
excepción**, aprobada por Tomás el 18/10, para que el portal (`/`) muestre la
lista de formularios sin sesión. Qué hay y qué no:

- **Tabla `formulario_portal`**: título, texto, enlace, orden y activo. **Ningún
  dato de jugadores, familias ni miembros.** `anon` no tiene permisos sobre la
  tabla (`has_table_privilege` da falso; un `GET /rest/v1/formulario_portal` sin
  sesión devuelve 401).
- **Función `formularios_publicos(club)`**: es lo único que `anon` puede
  ejecutar. `security definer`, `search_path` vacío; devuelve sólo título,
  texto, enlace y **destino** (0061: consultas o colaboradores, o nada) de las
  filas **activas** de ese club, hasta 50, en orden. El id del club no es
  secreto. `anon` no tiene permisos sobre la columna `destino` de la tabla.
- **Escribe sólo la coordinación del club**, sin borrar; la base sella quién y
  cuándo. El enlace se limita a Google Forms (`check` de la base + mismo
  patrón en la app); el texto va escapado en la página.
- **Riesgo aceptado**: una cuenta de coordinador comprometida podría publicar un
  enlace malicioso, acotado a dominios de Google. Queda registrado quién lo
  creó y se oculta con un toque.
- **El portal no consulta nada si la URL es la vuelta de un login**
  (`?code=`, `#access_token`): el cliente de Supabase la canjearía en esa
  página, y la sesión es de `/app`.
- **`/consultas`** (la dirección del QR impreso, `public/consultas.html`): sin
  sesión; lee sólo `formularios_publicos`, redirige únicamente a un enlace que
  pasó la validación de Google Forms, y no consulta nada si la URL es la vuelta
  de un login. Se sirve sin caché y `noindex`.
- **Logos de sponsors**: sólo archivos propios de `public/sponsors/` (el CSP
  `img-src 'self'` no deja cargar imágenes de otro sitio); la ruta y el enlace
  se validan (`sponsorsValidos`).
- Contrato: `tests/contratoFormularioPortal.test.js`.
  `tests/contratoDestinoFormulario.test.js` ata 0061: un solo formulario por
  destino y club, y anon sigue ejecutando una sola función.
  **Orden de despliegue de 0061:** aplicarla antes de publicar el código que la
  usa (el panel nuevo pide la columna) y después de 0059 y 0060. Verificación en la base:
  `tests/verificarFormularioPortal.sql` (8 casos); un cambio que le abra algo
  más a `anon` hace fallar los dos.

Privacidad (decidido por Tomás el 18/10): el calendario de Google va embebido, así
que la política dice que Google puede guardar sus cookies y que los formularios
de las familias son tratamiento del club en Google. `VERSION_LEGAL` subió a
`2026-10-19` y todos reaceptan (incluye las cuentas de familia y los datos de emergencia de 0059). Detalle: `docs/legal/cambios-portal.md`.

## Video del hero del portal: PENDIENTE antes de publicar (2026-10-21)

El video y el poster de `public/portal/hero-placeholder.*` son **un placeholder tomado del
sitio oficial del club** (`newellsoldboys.com.ar/videos/hero-drone.mp4`), bajados con el
permiso de quien pidió el cambio pero sin una autorización escrita del club. Se ve a la
hinchada y banderas con retratos de personas reales.

Antes de publicar el portal:

- Reemplazar los dos archivos por material propio (o conseguir el OK del club por escrito
  para usar ese video) y actualizar `PORTAL.heroVideo` (`src/data/portal.js`).
- Si el material nuevo muestra chicos reconocibles: sólo con la autorización de imagen
  firmada por las familias (ver `docs/legal/checklist-club.md`).
- Con `heroVideo: null` el hero vuelve a ser rojo y negro: es la salida segura si no hay
  material a tiempo.
