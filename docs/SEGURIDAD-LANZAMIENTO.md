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

## Datos de menores

La app guarda nombres, fecha de nacimiento, altura y peso de menores. Antes de
abrirla conviene tener resuelto con el club el consentimiento de las familias y
una política de privacidad (en Argentina rige la Ley 25.326 de protección de
datos personales). Esto no es asesoramiento legal: es un pendiente para hablar
con quien corresponda.

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
