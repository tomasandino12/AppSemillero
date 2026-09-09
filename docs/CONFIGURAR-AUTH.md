# Configurar la autenticación

Lo que el código **no** puede hacer solo. Todo esto se hace en paneles web, con
credenciales que no viven en el repo.

El código ya está escrito y funciona sin esto, con dos salvedades: el botón de
Google avisa que no está habilitado en vez de romper, y el mail de recuperación
no llega si las URLs de retorno no están permitidas.

---

## 0. Dato que se usa en todos lados

Las dos URLs desde donde se sirve la app:

| Entorno | URL |
|---|---|
| Producción | `https://app-semillero.vercel.app` |
| Local | `http://localhost:3000/public/` (o el puerto que use `npx serve`) |

El código vuelve siempre a **la página desde la que salió**
(`location.origin + location.pathname`, ver `urlDeRetorno()` en
`src/data/repositorio.js`). En producción eso es la raíz; sirviendo local desde
`/public/` es esa subcarpeta. Por eso hay que permitir las dos.

---

## 1. Supabase — URLs de retorno (hace falta sí o sí)

Sin esto no funcionan ni la recuperación de contraseña ni Google.

**Dashboard de Supabase → Authentication → URL Configuration**

1. **Site URL**: `https://app-semillero.vercel.app`
2. **Redirect URLs**: agregar estas dos entradas.
   ```
   https://app-semillero.vercel.app/**
   http://localhost:3000/**
   ```
   Si `npx serve` levanta en otro puerto, agregá ese también. Los `**` son
   necesarios: sin ellos no entra `/public/`.

---

## 2. Supabase — confirmación de mail (decisión tuya)

**Authentication → Sign In / Providers → Email**

La opción **Confirm email** cambia qué pasa al crear una cuenta, y la app se
banca las dos:

| Estado | Qué pasa | Qué muestra la app |
|---|---|---|
| **Activada** (por defecto) | Supabase manda un mail y no abre sesión | "Te mandamos un mail a X. Abrilo para confirmar la cuenta y después ingresá." |
| **Desactivada** | La cuenta queda usable al instante | Entra directo |

**Recomendación: dejala activada.** Sin confirmación, cualquiera crea cuentas
con mails ajenos. No cuesta nada porque igual hace falta que alguien del club
habilite el acceso a mano.

Ojo con el **mailer gratuito de Supabase**: tiene un límite bajo de mails por
hora y a veces cae en spam. Para el piloto alcanza; si se usa en serio, hay que
configurar un SMTP propio en **Project Settings → Auth → SMTP Settings**.

---

## 3. Google Cloud — crear las credenciales

**https://console.cloud.google.com**

1. Creá un proyecto (o elegí uno existente).
2. **APIs & Services → OAuth consent screen**
   - User type: **External**.
   - Completá nombre de la app, mail de soporte y mail de contacto.
   - Scopes: los de siempre alcanzan (`email`, `profile`, `openid`). No agregues
     ninguno más — pedir de más hace que Google exija verificación.
   - Mientras esté en **Testing**, solo entran los mails que agregues en **Test
     users**. Agregá el tuyo y el de los profes del piloto. Para abrirlo a
     cualquiera hay que publicarlo, y ahí Google puede pedir verificación.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**.
   - **Authorized JavaScript origins**:
     ```
     https://app-semillero.vercel.app
     http://localhost:3000
     ```
   - **Authorized redirect URIs** — acá va **la URL de Supabase, no la de la
     app**. Es el error más común:
     ```
     https://lseqvbtdzebomxwtqhwu.supabase.co/auth/v1/callback
     ```
4. Guardá y copiá el **Client ID** y el **Client Secret**.

---

## 4. Supabase — habilitar el proveedor

**Authentication → Sign In / Providers → Google**

1. Activá **Enable Sign in with Google**.
2. Pegá el **Client ID** y el **Client Secret** del paso 3.
3. Guardá.

La URL de callback que Supabase muestra en esa pantalla tiene que ser
**idéntica** a la que pusiste en Authorized redirect URIs. Si no coinciden,
Google devuelve `redirect_uri_mismatch`.

---

## 5. Probar

| Qué | Cómo | Qué tiene que pasar |
|---|---|---|
| Crear cuenta | Landing → Crear cuenta | Llega el mail (o entra directo, según el paso 2) |
| Cuenta sin club | Entrar con esa cuenta nueva | Pantalla "Tu cuenta está lista, falta el acceso" — **no** una app vacía |
| Recuperar | Ingresar → Olvidé mi contraseña | Llega el mail; el link abre la pantalla de contraseña nueva |
| Google | Continuar con Google | Va a Google y vuelve a la app |
| Google sin configurar | Antes de hacer los pasos 3 y 4 | Aviso "todavía no está habilitado", **sin** romper la pantalla |

---

## 6. Dar acceso a un club (sigue siendo a mano, a propósito)

`miembro_club` **no tiene policy de insert** para el cliente autenticado
(ver `supabase/ESQUEMA.md`). Ninguna cuenta puede darse acceso a sí misma, ni
aunque alguien manipule el frontend. Es deliberado: la app maneja datos de
menores y quién entra lo decide una persona.

**Dashboard de Supabase → SQL Editor:**

```sql
insert into miembro_club (user_id, club_id, rol)
values ('<uuid del usuario>', '<uuid del club>', 'entrenador');
```

El `user_id` se saca de **Authentication → Users** (es el mail que la persona
te pasa desde la pantalla de "falta el acceso"). El `club_id`, de la tabla
`club`.

Después de eso, el usuario toca **"Ya me dieron el acceso, reintentar"** y entra.
