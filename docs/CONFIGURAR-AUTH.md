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

## 2. Supabase — confirmación de mail y contraseñas

**Authentication → Sign In / Providers → Email**

La opción **Confirm email** cambia qué pasa al crear una cuenta, y la app se
banca las dos:

| Estado | Qué pasa | Qué muestra la app |
|---|---|---|
| **Activada** (por defecto) | Supabase manda un mail y no abre sesión | "Te mandamos un mail a X. Abrilo para confirmar la cuenta y después ingresá." |
| **Desactivada** | La cuenta queda usable al instante | Entra directo |

**Tiene que estar activada.** Coordinación habilita a los profes por su mail,
desde la lista de cuentas pendientes, y esa lista sólo muestra mails
confirmados. Con la confirmación apagada, Supabase da todo mail por confirmado
al instante: cualquiera podría crear la cuenta `profe.real@gmail.com` antes que
el profe, y coordinación la habilitaría con acceso a los datos de los chicos de
esa categoría.

En la misma sección de **Authentication**:

- **Minimum password length: 8**, que es lo que pide la app al crear la cuenta
  y al cambiar la contraseña. Si Supabase pide menos, la app sigue pidiendo 8,
  pero alguien que llame a la API directo podría poner una más corta.
- **Leaked password protection: activada** (en planes que la incluyen).
  Rechaza contraseñas que aparecen en filtraciones conocidas.

`supabase/config.toml` replica esto para el entorno local.

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
| Crear cuenta | Landing → Crear cuenta | Sin nombre y apellido no deja seguir. Llega el mail (o entra directo, según el paso 2) |
| Cuenta sin club | Entrar con esa cuenta nueva | Pantalla "Tu cuenta está lista, falta el acceso" — **no** una app vacía |
| Recuperar | Ingresar → Olvidé mi contraseña | Llega el mail; el link abre la pantalla de contraseña nueva |
| Google | Continuar con Google | Va a Google y vuelve. La primera vez muestra "¿Cómo te llamás?" con el nombre de Google escrito, y no entra hasta confirmarlo |
| Google sin configurar | Antes de hacer los pasos 3 y 4 | Aviso "todavía no está habilitado", **sin** romper la pantalla |

---

## 6. Dar acceso a un club

Desde la app: el coordinador del club lo ve en **Profes → Esperando acceso**,
toca **Habilitar** y elige las categorías. Ninguna cuenta puede darse acceso a
sí misma, ni un entrenador dárselo a otro: lo impide la base, no la pantalla
(ver `supabase/ESQUEMA.md`). Sólo aparecen las cuentas que ya confirmaron el
mail (paso 2).

Lo que sigue siendo a mano, por SQL, está en `docs/COORDINACION.md`: crear un
coordinador y darle además el rol de entrenador a un coordinador.

La persona, una vez habilitada, toca **"Ya me dieron el acceso, reintentar"** y entra.
