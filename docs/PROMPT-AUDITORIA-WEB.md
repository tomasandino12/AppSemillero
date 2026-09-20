# Prompt de auditoría para una web hecha con IA

Para pegar al empezar (o al terminar) cualquier proyecto web generado con
ayuda de una IA. Está escrito como instrucciones para el asistente, no para
vos: completá los `{{...}}` del contexto y mandalo tal cual.

Sirve para lo mismo en cualquier stack: la IA escribe código que *funciona en
la demo*. Lo que no escribe sola es lo que aparece recién con usuarios reales,
con un atacante, o seis meses después.

---

## El prompt

```
Sos el responsable técnico de esta aplicación antes de que la use gente real.
No vengo a que me agregues features: vengo a que encuentres lo que se va a
romper, lo que se puede hackear y lo que nadie va a ver hasta que sea tarde.

CONTEXTO
- Qué hace la app: {{qué hace, quién la usa}}
- Stack: {{framework, base de datos, hosting}}
- Datos sensibles que maneja: {{datos personales, de menores, de salud, pagos,
  ninguno}}
- Cuánta gente esperamos: {{10 / 1.000 / 100.000}}
- Dominio de producción: {{dominio}}

CÓMO QUIERO QUE TRABAJES
1. Primero leé el código y decime qué encontraste. NO arregles nada todavía.
2. Cada hallazgo con archivo:línea, qué pasa concretamente (el caso que lo
   rompe, con datos de ejemplo) y qué tan grave es. Si algo no lo podés
   verificar leyendo el código, decí "no lo puedo verificar desde acá" en vez
   de suponer. Prefiero tres hallazgos reales que veinte genéricos.
3. Ordená por "qué pasa si esto sale mal", no por qué tan fácil es de
   arreglar.
4. Separá en dos listas: lo que podés arreglar vos en el código, y lo que sólo
   puede hacer una persona a mano (panel del hosting, DNS, backups, rotar
   claves, configurar el proveedor de mails). La segunda dámela como checklist
   para hacer yo.
5. Cuando yo apruebe, arreglá de a un tema por vez, con su verificación. Un
   refactor y un arreglo no van en el mismo cambio.

QUÉ REVISAR

A. Quién puede ver y hacer qué (lo que más duele si está mal)
- ¿Quién impone los permisos: el servidor y la base, o la interfaz? Si la
  respuesta es "la pantalla no muestra el botón", está mal: cualquiera puede
  llamar a la API directo. El cliente decide qué mostrar; el servidor decide
  qué se puede.
- ¿Dónde está guardado el rol de cada usuario? Si está en algo que el propio
  usuario puede editar (la metadata de su cuenta, localStorage, un campo que
  él manda), es un agujero: se asciende solo a administrador.
- Permiso mínimo: ¿la app puede escribir columnas que no debería (quién creó
  el registro, las fechas, a qué organización pertenece)? Esas las pone el
  servidor, no el cliente. Revisá que no se puedan mandar en un alta ni en una
  edición.
- ¿Se puede pedir el dato de otro usuario cambiando un id en la URL o en el
  cuerpo del pedido? Probá mentalmente cada endpoint con el id de un tercero.
- Si hay varias organizaciones (clientes, clubes, empresas) en la misma base:
  ¿algo puede referenciar un registro de otra? Las claves foráneas compuestas
  (organizacion_id + id) lo impiden; las simples no.
- Secretos: ¿hay claves, tokens o cadenas de conexión en el código, en el
  repositorio, en el bundle que baja el navegador o en un .env que se sirve?
  ¿Qué clave del proveedor usa el front: la pública o la de servidor?
- Dependencias: corré el audit de vulnerabilidades del gestor de paquetes y
  reportá lo que tenga arreglo.
- Exposición: ¿el hosting sirve archivos que no debería (.env, la carpeta de
  migraciones, docs, .git)? ¿Están los headers de seguridad básicos?

B. Todo lo que escribe un usuario
- HTML: ¿se mete texto de usuario en el DOM sin escapar? Que el escapado sea
  lo que pasa por defecto, no algo que hay que acordarse de hacer: un solo
  lugar olvidado alcanza.
- Largos: todo texto libre necesita un tope en la base de datos, no sólo en el
  formulario. Sin eso, un usuario habilitado guarda megabytes en un título que
  después se le manda a todos en cada lectura.
- Números tecleados: revisá que no se conviertan con el parseo laxo del
  lenguaje. En JS, Number("1e2") es 100 y Number("0x10") es 16: alguien
  escribe algo raro y queda guardado un número que nunca tecleó.
- Si la misma regla vive en dos lados (la lista de tipos válidos, un rango, un
  largo máximo: en el código y en la base), escribí un test que lea los dos y
  los compare. Si no, se desincronizan y nadie se entera hasta que falla en
  producción.
- Archivos subidos: tipo, tamaño, y que no se sirvan desde el mismo origen que
  la app.

C. Errores: que nada se pierda en silencio
- ¿Qué ve el usuario cuando algo falla? Una pantalla a medio dibujar hace que
  piense que la app se colgó. Tiene que haber un aviso, siempre.
- ¿Hay manejadores globales para las excepciones que nadie atrapa y para las
  promesas rechazadas sin catch? Sin eso, el único que se entera de un error
  es quien tenga la consola abierta, o sea nadie.
- Si se guardan los errores, OJO CON LOS DATOS PERSONALES: las bases escriben
  el valor adentro del texto del error ("Key (nombre)=(Juan Perez) already
  exists"). Guardar el mensaje crudo es publicar el nombre de una persona en
  una tabla de logs que nadie mira hasta que hay un incidente. Limpiá el texto
  antes de guardarlo (valores entre paréntesis, mails, números de cuatro
  dígitos o más) y no juntes contexto de más: ni la URL, ni el almacenamiento
  local, ni qué registro estaba abierto.
- Poné un tope de reportes por carga de página. Un error adentro de un bucle
  de renderizado dispara cientos por segundo, y cada uno sería una escritura.
- El código que reporta errores no puede fallar: si tira una excepción, el
  manejador global vuelve a entrar por la misma puerta y no para más. Que
  trague todo y siga.
- La tabla de logs sólo se escribe: sin editar ni borrar desde la app, sin que
  la lea cualquiera, y sin escritura anónima (sería un endpoint de escritura
  abierto a internet).
- Mensajes de login y de "olvidé mi contraseña" que no revelen qué mails
  tienen cuenta.
- Sin conexión: un solo lugar que decida el texto del error, para no terminar
  con quince maneras distintas de decir "no hay internet".

D. Los estados del usuario que nadie prueba
La demo prueba "entró y anda". La realidad tiene más estados, y cada uno
necesita una pantalla que diga qué hacer:
- llegó sin cuenta; se registró pero todavía no lo habilitaron; entró pero no
  pertenece a ninguna organización; le revocaron el acceso con la app abierta;
  la sesión venció; abrió dos pestañas; comparte el dispositivo con otra
  persona (¿los borradores y el "recordame" son de cada cuenta o del
  celular?).
- El primer dibujo de la pantalla no debería esperar a la red: si el usuario
  no tiene sesión guardada, eso se sabe sin preguntarle a nadie. Esperar una
  respuesta para pintar la portada es medio segundo en blanco en un celular
  con mala señal.
- Decime cuáles de estos estados no tienen pantalla y qué pasa hoy en cada
  uno.

E. Qué pasa con muchos usuarios (y con muchos datos)
- Consultas que traen todo: ¿hay paginación? ¿Qué pasa cuando esa tabla tenga
  50.000 filas en vez de 50?
- N+1: una consulta adentro de un bucle. Es el clásico y no se nota con datos
  de prueba.
- Índices sobre las columnas por las que se filtra y se ordena de verdad.
- ¿Qué crece sin techo? Logs, historiales, archivos subidos. Decime qué va a
  crecer y cómo se limpia.
- Tamaño de lo que baja el navegador en la primera carga, y qué puede cargarse
  después.
- No optimices nada sin un número que lo justifique: decime qué medir y cómo,
  y recién después lo tocamos.

F. Que Google la encuentre y que el link se vea bien
- ¿Qué URLs son públicas y cuáles están detrás de la sesión? Si el contenido
  privado es de personas, no puede ser indexable, y no alcanza con que "no
  haya un link".
- Cada página pública con title y description propios, canonical, y etiquetas
  og:* y twitter:* para cuando alguien comparte el link por WhatsApp.
- robots.txt y sitemap.xml servidos DESDE LA RAÍZ del dominio: si los archivos
  viven en una subcarpeta, configurá el rewrite. El robots declara el sitemap.
- No bloquees con Disallow el CSS ni el JS: Google ve la página rota y encima
  no lee el canonical que resuelve el duplicado.
- Si es una sola página sin ruteo real, decilo en la documentación en vez de
  inventar un sitemap que no existe.
- El dominio suele quedar escrito a mano en cuatro o cinco archivos. Escribí
  un test que los compare, así el día que cambie no queda uno viejo.
- Si el contenido lo pinta JavaScript, verificá que haya algo legible sin JS.

G. Que esto no se pierda
- Backups: ¿los hay? ¿Alguien probó restaurar uno?
- ¿Hay tests y corren solos? Un arreglo sin test se vuelve a romper.
- Un documento corto con lo necesario para retomar el proyecto en seis meses.

FORMATO DE LA RESPUESTA
1. Tabla: hallazgo | archivo:línea | qué pasa si sale mal | esfuerzo.
2. Los tres que arreglaría primero, y por qué esos.
3. La checklist de lo que tengo que hacer yo a mano.
4. Lo que revisaste y estaba bien (corto, pero decilo: me sirve para saber qué
   no hace falta volver a mirar).
```

---

## Notas de uso

- **Contestá el contexto con precisión.** "Maneja datos de menores" cambia por
  completo qué es grave y qué no.
- **No lo mandes junto con "y arreglá todo".** La lista primero: la mitad de
  los hallazgos se descartan cuando los ves, y arreglar a ciegas mezcla
  cambios que después no se pueden separar.
- **El bloque A es el que importa.** Si hay poco tiempo, mandá sólo A, C y D.
  B se arregla siempre; E y F se pueden hacer después de lanzar. Un agujero de
  permisos, no.
- **Lo que la IA no puede hacer sola** (bloque 4 del prompt) es donde se
  quedan los proyectos: rotar una clave filtrada, activar backups, revisar la
  configuración del panel del proveedor. Esa checklist es tuya.
