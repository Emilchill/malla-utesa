# Malla UTESA — Proyecto Estudiantil Independiente

Herramienta web para que estudiantes de UTESA lleven el seguimiento visual de su
avance en el pénsum 2023 de **18 carreras** (Resolución No. 104-22, enero 2023):

| Área | Carreras |
|---|---|
| Ingenierías y arquitectura | Arquitectura (ARQ), Ingeniería Civil (ICV), Eléctrica (IEL), Electrónica (IET), Industrial (IID), Mecánica (IMC), Sistemas Computacionales (ISC) |
| Económicas y sociales | Administración de Empresas (ADM), Administración de Empresas Turísticas y Hoteleras (ATH), Contaduría Pública (CON), Mercadeo (MER) |
| Ciencias y humanidades | Comunicación Social (COM), Derecho (DER), Lenguas Extranjeras (LEX), Psicología (PSI) |
| Ciencias de la salud | Bioanálisis (BIO), Odontología (ODO), Veterinaria y Zootecnia (VET) |

Otras carreras de UTESA (Medicina 2024, Enfermería, Fármaco-Bioquímica, Optometría, Nutrición, Educación) no tienen
pénsum 2023 publicado y no están incluidas.

> ⚠️ **Este proyecto NO es oficial de UTESA.** Es una herramienta hecha por y para
> estudiantes. Los datos del pensum pueden contener errores de transcripción —
> siempre verifica tu avance real con tu coordinación de carrera.

## Actualización de moderación (2026-11-22)

* **Configuración → Moderación** (solo el equipo): resumen del sitio, **Cuentas** (todas, con buscador y filtros), **Reportes**
  (movidos desde el chat), **Registro** de lo que hace el equipo y **Herramientas** (vaciar chats). El panel del chat se quitó.
* **Suspensiones del chat por tiempo** (10 min a 30 días; indefinida solo el dueño) con motivo: la persona sigue leyendo,
  no puede escribir ni editar, ve hasta cuándo y por qué, y se levanta sola al vencer.
* **Reiniciar cuentas**: el equipo puede reiniciar a un estudiante (p. ej. nombre o personaje inapropiado) y cada persona
  puede **empezar de cero** desde Configuración. Se vuelve a pasar por la bienvenida (nombre, personaje, carrera, tema).
  Reiniciar no levanta una suspensión.
* Aviso de novedades una sola vez al entrar.
* Arreglo: en el chaleco de elfo, el traje de Santa y el suéter de reno había piezas que se salían de la silueta del cuerpo.

## Estructura de archivos

```
├── index.html            → Login / registro (es lo primero que se ve)
├── profile.html          → Configuración inicial (nombre, carrera, tema)
├── dashboard.html        → Malla, gráficos y progreso
├── css/style.css         → 6 temas de color + componentes + diseño móvil + impresión
├── js/
│   ├── firebase-config.js → Conexión a Firebase (Auth + Firestore)
│   ├── pensums-data.js    → Datos de los pensums (IEL, IID, ISC, DER)
│   ├── theme.js           → Temas y su persistencia
│   ├── dashboard.js       → Lógica principal (progreso, búsqueda, filtros, detalle, impresión)
│   ├── settings.js        → Ventana de Configuración (perfil, tema, UTESA, contraseña, carrera, sesión)
│   ├── modal.js           → Ayudante único de ventanas (Esc, fondo, foco, bloqueo de scroll)
│   ├── malla-view.js      → Vista "Malla": mapa de ruta con zoom, caminos de prerrequisitos y niveles
│   ├── character.js       → Creador de personajes (personas y animales, SVG) y su editor
│   ├── avatars.js         → Dibuja la foto de perfil (personaje nuevo o avatar antiguo)
│   ├── charts-view.js     → Vista "Gráficos": dona, barras, ritmo y proyección (SVG)
│   └── utesa-import.js    → Sincronización con el portal estudiantil de UTESA
├── netlify/functions/utesa-login.cjs → Inicio de sesión directo con UTESA (servidor)
├── netlify.toml          → Configuración de Netlify (funciones)
└── assets/pensums/*.pdf   → Pénsums oficiales descargables
```

## Vistas

Al entrar siempre se muestran las **Tarjetas**; arriba puedes cambiar de vista.

- **Tarjetas**: cuadrícula por cuatrimestre.
- **Malla**: mapa de ruta tipo videojuego. Una columna por cuatrimestre con anillo de progreso, y
  caminos que unen cada materia con sus prerrequisitos (verde = recorrido, dorado = siguiente paso,
  punteado = bloqueado). **Zoom** con los botones + / − / ver todo / ir a mi progreso, con
  Ctrl + rueda, o pellizcando con dos dedos; se mueve arrastrando. Con un clic (o un toque) en una
  materia se resalta su ruta de requisitos; otro clic, o tocar el fondo, la quita. En este mapa no se abre el
  panel de información.
- **Gráficos**: dona de materias, créditos por cuatrimestre, ritmo de avance frente al plan y una
  proyección de cuántos cuatrimestres faltan según los créditos que quieras tomar.

Tocar una materia abre su detalle (requisitos, qué desbloquea).

## Vincular o modo manual

La primera vez (o mientras la cuenta no esté vinculada) aparece una ventana de bienvenida que invita a
**vincular con UTESA**. Si no vinculas, queda disponible el **modo manual** (marcar materias a mano y
confirmar). En cuanto la cuenta se vincula, el modo manual desaparece y el avance viene de UTESA.

## Configuración

Botón ⚙ del encabezado. Un solo lugar para: foto y nombre, tema de color, estado de la cuenta de UTESA
(vincular, sincronizar o **desvincular** para volver al modo manual), contraseña (con opción de mostrarla
y restablecer por correo), carrera (cambiarla borra el avance, con confirmación), **reiniciar el progreso**
(confirmación de dos toques) y cerrar sesión.

## Primer uso y foto de perfil

Al registrarse, `profile.html` es un asistente de 4 pasos: nombre y sexo (arma un personaje inicial: mujer por defecto, hombre o neutro), personalización del personaje, carrera y tema de color. Después se puede vincular UTESA desde el menú de la cuenta.


Cada quien crea su personaje (`js/character.js`), dibujado en SVG sin imágenes externas:

- **Personas:** tono de piel, forma de cara, 12 peinados con 14 colores, vello facial, ojos (forma y color), cejas,
  nariz, boca, pecas, maquillaje (labios, rubor, sombra, delineador), ropa, lentes, aretes y gorros.
- **Animales:** 10 especies con color de pelaje y de detalles, manchas, ojos, nariz, boca, lentes, gorros y cuello.
- Botones *Aleatorio* y *Restablecer*, y color de fondo a elección.

Se crea al registrarse y desde *Configuración → Personalizar* (se guarda con "Guardar personaje"). Un personaje se
guarda como texto corto en `users/{uid}.avatar` (`c1:{...}`, cada número es la posición de la opción elegida) y el
fondo en `.avatarBg`. Quien ya había elegido uno de los 24 avatares anteriores lo sigue viendo igual.

## Video tutorial

El video (1 min, con música original) está en YouTube como *no listado* (https://youtu.be/_na57-Qsmy0) y se incrusta al
abrirlo desde *Prefiero no dar mi contraseña aquí*, para que el sitio no cargue con sus 8 MB. Incluye cómo activar
la barra de marcadores (Ctrl + Shift + B). Se hizo con Remotion; el proyecto está en la carpeta `tutorial-video`
(no se publica). Si cambias de video, edita `VIDEO_ID` en `js/dashboard.js`.

## Sincronización con UTESA

Hay tres formas de traer tu avance; las tres usan el mismo cálculo (**aprobadas = tu pensum − tus pendientes**) y
te muestran la lista para que confirmes:

1. **Inicio de sesión directo (la más rápida).** Escribes recinto, matrícula y contraseña de UTESA en la app.
   Una función del servidor (`netlify/functions/utesa-login.cjs`) inicia sesión en `www.utesa.edu/webestudi`
   por ti, lee *Asignaturas pendientes* y el resumen, cierra la sesión y devuelve solo la lista de materias.
2. **Marcador** "Enviar a Malla UTESA", para quien no quiera dar su contraseña: se usa dentro del panel de UTESA.
3. **Copiar y pegar** la página *Asignaturas pendientes*.

### Privacidad y seguridad del inicio de sesión directo

- La contraseña viaja por HTTPS, vive solo en memoria durante la petición y **no se guarda ni se registra**; nunca
  vuelve al navegador. El campo se vacía en cuanto se envía y se pide consentimiento explícito.
- La función solo habla con `https://www.utesa.edu` (no sigue redirecciones a otros dominios) y solo acepta
  peticiones POST del propio sitio (cabecera `Origin`).
- Limita los intentos (5 por matrícula cada 15 min y 20 por IP cada hora) para que no sirva para adivinar
  contraseñas. El límite vive en memoria de la instancia, así que se reinicia si Netlify la recicla; para algo
  más estricto habría que guardar los contadores en una base de datos.
- Es una integración no oficial: UTESA podría cambiar su portal o bloquear el acceso automatizado. Lo ideal es
  pedirle a TI/Registro de UTESA una forma oficial ("Iniciar sesión con UTESA" o una API) o su visto bueno.
- Solo se guardan las materias aprobadas y la fecha de sincronización. **No se guardan notas.**

## Impresión

El botón de impresora genera la malla completa en hoja carta horizontal: cuatrimestres 1–6,
7–12 y electivas, con tu nombre, porcentaje de avance y leyenda. Siempre usa colores claros.

## Despliegue

Sube la carpeta a Netlify (arrastrando el zip a la página de Deploys del sitio). Incluye una función (`netlify/functions`), así que el sitio no puede ser solo de archivos estáticos.
Después, en Firebase Authentication → *Authorized domains*, agrega tu dominio de Netlify
(el que te dé tu hosting) para que funcionen el inicio de sesión y Google.

## Configuración de Firebase requerida

`js/firebase-config.js` ya incluye las credenciales del proyecto Firebase. Antes de publicar para
otros estudiantes, configura las **reglas de seguridad de Firestore** para que cada usuario solo
lea y escriba su propio documento:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Y habilita el método **Correo/Contraseña** en Firebase Authentication si aún no está activo.

## Añadir o corregir materias

Todo el contenido académico vive en `js/pensums-data.js`:

```js
m("CLAVE", "Nombre de la materia", HT, HP, TH, créditos, "prerrequisitos")
```

El resto de la aplicación (progreso, bloqueo por prerrequisitos, gráficos, sincronización) se
actualiza automáticamente.

## Alojamiento: Cloudflare Pages (principal) y Netlify (respaldo)

- **Principal:** Cloudflare Pages, proyecto `malla-utesa` → https://malla-utesa.pages.dev. Ancho de banda ilimitado y sin créditos.
  La carpeta se sube completa (arrastrar la carpeta o un zip en *Workers & Pages → Direct Upload*), **sin** `netlify/`, `server.js` ni `package.json`.
- **Login directo con UTESA:** `_worker.js` (modo avanzado de Pages) sirve la web y atiende `POST /api/utesa-login`.
  El cliente siempre llama a `/api/utesa-login`; en Netlify un redirect de `netlify.toml` lo manda a la función de `netlify/functions`.
- **Cuentas:** Firebase Auth (correo y Google). Cada dominio nuevo debe agregarse en
  *Authentication → Configuración → Dominios autorizados*.
- **Datos del usuario:** Cloudflare D1 (`malla-utesa-db`, binding `DB`, tabla `users`), vía `GET/PUT /api/user` en `_worker.js`.
  El Worker verifica el ID token de Firebase en cada petición y cada usuario solo accede a su fila.
  Los usuarios que venían de Firestore se copian a D1 solos la primera vez que entran (`js/store.js`).
- **Respaldo:** `stupendous-chaja-fc0b09.netlify.app` (solo web y login con UTESA; **no** tiene `/api/user`, así que ahí no se cargan los datos) (cada deploy en Netlify gasta créditos, evitarlo salvo emergencia).

## Comunidad, marcos y logros

- **Chats** (`chat.html`, `js/chat.js`): sala *General* (todos los estudiantes con cuenta) y sala *Mi carrera* (solo estudiantes de esa carrera; el servidor decide la sala a partir de la carrera del usuario, nunca del cliente). Se muestra el nombre real de la cuenta. Sondeo cada 4 s, sin servidores extra.
- **Moderación:** reportar, bloquear usuarios, borrar mensajes propios y un panel para administradores (variable `ADMIN_UIDS` en Cloudflare Pages: uids de Firebase separados por comas). Límite de 15 mensajes por minuto y 500 caracteres.
- **Logros y marcos** (`js/achievements.js`, `js/frames.js`): 368 logros por materias clave de las 18 carreras (31 a 60 por carrera) (Cálculo IV = marco dorado con símbolos, Proyecto de Grado = marco diamante, etc.).
  Solo se desbloquean con el **inicio de sesión directo en UTESA**: el Worker lee las materias pendientes del portal, calcula los logros ganados y los guarda en D1 (`users.earned`, `verified_at`). El marcador y el modo manual no los desbloquean. Equipar un marco que no se ganó se rechaza en el servidor.
- **Añadir o cambiar logros:** edita `js/achievements.js` y ejecuta `node tools/build-worker-data.mjs` (actualiza la lista y los códigos de cada pénsum dentro de `_worker.js`) antes de subir.
- **Datos públicos de un perfil:** nombre, carrera, avatar, marco y logros. Nunca matrícula, notas ni avance.

### Marcos únicos y animados
Cada logro tiene un marco distinto: nivel (bronce, plata, oro, diamante) + patrón de aro (liso, cuentas, cuerda, engranaje, laurel, rayos, festón, doble) + color de acento propio + su símbolo; no hay dos iguales.
Todos tienen un destello que recorre el aro; oro y diamante además tienen halo que late, destellos y (diamante) un brillo holográfico. Las animaciones están en `css/style.css` (`.fr-*`) y se apagan con *reducir movimiento* del sistema.

### Creador de personajes
La ropa tiene 18 estilos (camiseta, sudadera, camisa, traje, cuello en V, vestido, polo, bata de laboratorio, toga de graduación, chaleco, cuello alto, rayas, chaqueta deportiva, overol, blusa con moño, cuadros, chaqueta de cuero y sin mangas) y hay 4 gorros nuevos (birrete, casco de obra, boina y diadema). Los avatares ya guardados no cambian: los estilos nuevos van al final de cada lista.

### Chat en vivo, cuadro fijo y botón del teléfono
- **PC:** cuadro fijo abajo a la derecha, siempre encendido (`js/chat-dock.js`). La barra se ve siempre, con el número de mensajes sin leer; se despliega o se cierra y recuerda tu elección (en pantallas de 1200 px o más arranca desplegado). **Teléfono:** botón redondo flotante que abre el chat como hoja a pantalla completa.
- **En vivo de verdad:** los mensajes siguen en D1, pero cada envío o borrado escribe un aviso mínimo en Firestore (`chatPing/{sala}`, `js/chat-live.js`) y todos los que tienen el chat abierto lo reciben al instante y piden los cambios (mensajes nuevos y `removed` = borrados). Respaldo: sondeo cada 30 s (6 s si Firestore falla). El punto verde del encabezado indica que el modo en vivo está activo.
- **Reglas de Firestore (publicadas):** cada usuario solo lee su documento antiguo `users/{uid}` (nadie escribe), y `chatPing/{general | c_XXX}` solo admite `{ t: timestamp }` de usuarios con sesión. Cualquier otra ruta está cerrada.
- **Límite a vigilar:** cada aviso cuenta como 1 lectura de Firestore por persona conectada (50.000 lecturas/día gratis). Si crece mucho, el siguiente paso es un Durable Object con WebSockets en Cloudflare.

### Moderación por reglas, sonido y avisos
- **Malas palabras:** el servidor (`_worker.js`) las cambia por asteriscos (`*******`) antes de guardar el mensaje, así nadie puede saltarse el filtro desde el navegador, y le avisa a quien las escribió ("modera tu forma de hablar"). También detecta trucos comunes (mayúsculas, letras repetidas, `m1erda`, `c@brón`, `p u t a`). Los nombres de usuario con malas palabras se rechazan.
- **La lista** (españolas, dominicanas e inglesas) está en `tools/malas-palabras.txt`; una `*` al final cubre todo lo que empiece igual y las líneas `ok:` son excepciones. Después de editarla: `node tools/build-worker-data.mjs` y subir la web.
- **Sonido y avisos:** suena un "plin" leve cuando escribe otra persona (`js/chat-prefs.js`, Web Audio, sin archivos) y, con la pestaña oculta, puede salir un aviso del navegador. Se enciende o apaga con la campana del chat o en Configuración → Chat de la comunidad; se recuerda por dispositivo.
- **Diseño del chat:** burbujas (las tuyas a la derecha), mensajes seguidos agrupados, botón "Mensajes nuevos", envío con botón redondo; las acciones (reportar, borrar) aparecen al pasar el cursor o tocar el mensaje.

### Cómo se calculan los logros (y por qué se actualizan solos)
- Al vincular con la matrícula, el servidor guarda la lista de materias que UTESA dijo que **faltan** (`users.verified_pending`, códigos normalizados: `INF-117-001`, `INF117` e `inf 117` valen igual).
- Los logros se **recalculan en cada lectura** con la lista actual de logros: un logro nuevo aparece sin que nadie tenga que volver a vincular. Un logro lo tiene quien (1) tiene esa materia en su pénsum y (2) no está entre los pendientes.
- Las cuentas verificadas antes de guardar los pendientes conservan su lista de entonces y ven un aviso ("Hay logros nuevos: vuelve a vincular una vez"); al vincular de nuevo pasan al modo automático.
- Protecciones: si el portal devuelve una lista vacía mientras aún hay pendientes, o la carrera no coincide, no se otorga ningún logro.

### Moderación, mensajes borrados/editados y rangos
- **Moderadores:** se definen en Cloudflare Pages → Settings → Variables: `ADMIN_EMAILS` (correos separados por comas; solo valen si Firebase confirma que el correo está verificado, p. ej. inicio con Google) y/o `ADMIN_UIDS`. Quien es moderador ve la nota "🛡️ Eres moderador", el panel de reportados y puede **Ocultar** cualquier mensaje y **Restaurar** los que ocultó un moderador (ve el texto original al pasar el cursor).
- **Los mensajes no desaparecen:** al borrar uno propio queda "🚫 Mensaje borrado"; si lo oculta un moderador queda "🛡️ Mensaje ocultado por un moderador". El texto original nunca se envía a los demás.
- **Editar:** quien escribió puede editar su mensaje durante **5 minutos** (el servidor lo comprueba); queda marcado "· editado" y se vuelve a pasar por el filtro de malas palabras.
- **Rangos** (`js/ranks.js`): Novato (0%), Aprendiz (10%), Explorador (25%), Avanzado (40%), Veterano (60%), Experto (75%), Leyenda (90%) y Graduado (100%). El % lo calcula el servidor con lo que UTESA verificó; sin vinculación directa se muestra "Sin verificar". Se ve junto al nombre en el chat, en el perfil y en Configuración (con lo que falta para el siguiente rango).
- **Medallas en las materias** (`js/medal.js`): cada materia con logro muestra una esquinota en el mapa y en las tarjetas (de color si ya lo ganaste, gris si aún puedes ganarlo) y el detalle en la hoja de la materia.

### Historial, scroll y reinicio del chat
- **Scroll con historial:** al abrir se cargan los últimos 60 mensajes; al subir con el scroll se cargan de 40 en 40 los anteriores (`GET /api/chat?before=ID`), manteniendo tu posición y el orden, hasta "Inicio de la conversación". Un botón ↓ te lleva al último mensaje cuando estás arriba.
- **Avisos que no se pierden:** si llegaba un aviso en vivo mientras el chat aún se estaba actualizando, ese aviso se descartaba y el mensaje tardaba hasta 30 s (o no aparecía). Ahora se repite la actualización al terminar.
- **Borrar todo el chat:** el servidor guarda una marca de reinicio (`meta.chat_epoch`). Para vaciar los chats, ejecuta en la consola de D1: `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT); INSERT OR REPLACE INTO meta (k,v) VALUES ('chat_epoch', strftime('%s','now')); DELETE FROM reports; DELETE FROM messages;`. Los chats que estén abiertos detectan el cambio y se limpian solos, sin recargar.
- **Dato de diseño:** la raíz del chat en el cuadro es el propio `.cdock-body` (lleva también la clase `.cc-root`), por eso `.cdock-body` debe ser `display:flex` en columna al abrirse; la lista de mensajes va fija dentro de `.chat-stage` para que nunca crezca más que el cuadro.

## Personas: directorio, amigos, chat privado y moderadores
- Pestaña **Personas** del chat: Amigos, Solicitudes y Directorio (por carrera, con búsqueda). Chat privado solo entre amigos aceptados (sala `dm:<pid>` en la tabla `messages`); el equipo solo ve un privado si alguien lo reporta.
- Privacidad: Configuración → «Aparecer en el directorio» (campo `dir_hidden`).
- Roles: el **dueño** sale de `ADMIN_EMAILS`/`ADMIN_UIDS`; nombra/quita moderadores desde el perfil de cada persona (`/api/mods`). Moderadores y dueño pueden vaciar General o su carrera; solo el dueño puede vaciar todo (`/api/chat/wipe`).
- En los mensajes solo se muestra la insignia de Mod/Dueño; el rango queda en el perfil.
- Reglas de Firestore a añadir: `match /inbox/{pid} { allow read: if request.auth != null; allow write: if request.auth != null && request.resource.data.keys().hasOnly(['t']); }`

## Chat tipo Messenger, grupos y en línea
- El chat abre en la **lista de chats** (General, tu carrera, grupos y amigos, con no leídos y punto verde de «En línea»). Botones: **Estudiantes** (Ver estudiantes / Amigos / Solicitudes) y **＋ Grupo**.
- **Grupos** (`chat_groups`, `group_members`, sala `g:<id>`): quien lo crea es administrador y puede nombrar a otros; cada grupo se modera solo. El dueño global no ve grupos salvo mensajes reportados. Avisos en vivo por `chatPing/g_<id>`.
- **En línea**: `users.last_seen` (se anota cada minuto de uso; «en línea» = últimos 2 min). Se puede ocultar en Configuración (`hide_online`).
- Regla de Firestore: en `chatPing/{room}` permitir también `room.matches('g_[0-9]{1,9}')`.

## Eliminar usuarios y pulido de UX
- El **dueño** puede eliminar a alguien por completo (perfil → Más opciones → «Eliminar usuario»): se borran su cuenta, mensajes, **todos sus chats privados**, amistades y lugar en grupos (si creó grupos, pasan a otro miembro). No puede volver a crear perfil (`banned`). Quien lo tenga abierto ve «Usuario eliminado».
- El perfil de otra persona sin vincular se escribe en tercera persona. En el teléfono el perfil se ve por encima del chat a pantalla completa (z-index) y la cabecera del chat abre el perfil o la info del grupo.
- Bloque «Chat · pulido de UX/UI» al final de `css/style.css`: objetivos táctiles ≥44 px, campos a 16 px (sin zoom en iPhone), foco visible, avisos de confirmación (`.chat-toast`).

## Marcos de moderación, cuentas eliminadas y presencia
- **5 marcos exclusivos** (`MOD-1..5`: Arcoíris Cósmico, Amatista Real, Aurora Boreal, Guardián Nebulosa, Llama Arcana) en `js/frames.js`. Solo los puede equipar quien modera (el servidor lo comprueba) y se pierden al perder el rol. Aparecen en Configuración → Marcos, arriba, solo para moderadores.
- **Cuenta eliminada/baneada:** el servidor responde 403 `eliminada`; `store.js` manda a `cuenta-eliminada.html`, que cierra sesión, limpia todo lo guardado en el dispositivo y vuelve al inicio de sesión. Para permitir que una cuenta vuelva: en D1, `DELETE FROM banned WHERE uid = '<uid>'`.
- **Presencia sincronizada:** el servidor solo manda `seen` (última vez visto) y su hora (`now`); toda la app decide «En línea» con la misma regla (menos de 2 min, reloj del servidor), y «Ver estudiantes» refresca la presencia cada 15 s sin mover la lista.

## Contacto
- Enlace `wa.me` (WhatsApp, +1 829 642 2334) con el mensaje «Hey, vengo del proyecto Malla UTESA y me gustaría reportar o sugerir algo:». Está en Configuración → Contacto, al final de la lista de chats y (con otro texto) en `cuenta-eliminada.html`. Para cambiar el número o el texto, edita esos tres sitios.

## Más ropa, temporada navideña y artículos exclusivos
- **Ropa nueva** (`js/character.js`): 16 estilos más (suéter tejido, abrigo, camisa hawaiana, jersey deportivo, blazer, chef, lunares, uniforme escolar, poncho, tie-dye) y 6 navideños (suéter de copos, suéter de reno, traje de Santa, suéter con luces, pijama navideña, chaleco de elfo). **Sombreros nuevos:** gorro de Santa, gorro de elfo, cuernos de reno, corona de acebo, vaquero, copa y pamela.
- **⭐ Exclusivo (solo equipo, 15 artículos):** corona imperial, halo, casco espartano, laurel de oro, orejas de neón, visor ciber, antifaz dorado, monóculo de oro, capa real, hombreras de armadura, collar de oro, alas de ángel, alas de dragón, aura dorada y aura violeta. Campos `xh/xg/xb/xw/xa` del avatar. El servidor rechaza guardarlos a quien no sea dueño/moderador, y se quitan al perder el rol. Todos los ven en los avatares.

## Verificación también con el marcador
- `POST /api/utesa-verify` (con sesión): el marcador deja la lista de pendientes en el navegador y, al confirmar, la app la manda para verificar la cuenta (logros, porcentaje, marcos). Controles en el servidor: carrera coincidente (≥60 %), contadores del portal coherentes con la lista (±6), el avance no puede retroceder de golpe (>8 códigos nuevos → 409), no se acepta lista vacía sospechosa y hay límite de 6 intentos por hora.
- **Límite honesto:** a diferencia del inicio de sesión directo (el servidor lee UTESA él mismo), con el marcador el dato llega desde el navegador del estudiante y no se puede probar criptográficamente. Por eso se guarda `verified_src = 'bookmark'` y el perfil muestra «✓ Verificado con marcador» (frente a «✓ Verificado con inicio de sesión directo»). El texto pegado a mano NO verifica.

## Tema desde el primer pintado
- Un script en el `<head>` de cada página (`malla_theme` en localStorage) aplica el tema elegido antes de pintar: la pantalla de carga («Cargando tu malla…»), el login y el color de la barra del navegador (`theme-color`) ya no salen siempre claros. En un dispositivo sin tema guardado se usa UTESA Clásico hasta cargar el perfil.
