# Arquitectura

## Vista general

```
                        ┌──────────────────────────── Cloudflare Pages (malla-utesa.pages.dev) ───────────────────────────┐
 Navegador              │                                                                                                  │
 (módulos ES, sin build)│   archivos estáticos (html/js/css/pdf)   ◄── los sirve Cloudflare directo (sin ejecutar código) │
   │                    │                                                                                                  │
   ├── /api/*  ─────────┼──►  _worker.js  (un archivo, sin dependencias)                                                   │
   │                    │         ├── verifica el ID token de Firebase (RS256, claves públicas de Google)                  │
   │                    │         ├── lee/escribe D1 (SQLite)  ◄── binding "DB" (base malla-utesa-db)                      │
   │                    │         └── habla con www.utesa.edu SOLO en el inicio de sesión directo                          │
   │                    └──────────────────────────────────────────────────────────────────────────────────────────────────┘
   │
   ├── Firebase Auth  (iniciar sesión con Google o correo; el navegador obtiene el ID token)
   └── Firestore      (solo "pings" en vivo: chatPing/{sala} e inbox/{pid}; NO guarda mensajes ni datos de usuarios)
```

* `_routes.json` hace que el worker solo se ejecute en `/api/*`. Los archivos estáticos no consumen peticiones del plan gratuito.
* **Todo el estado vive en D1**. Firestore existe únicamente para avisar "algo cambió, vuelve a pedir" y lograr el chat en vivo
  sin sondear cada segundo (si Firestore falla, el cliente sondea cada pocos segundos: sigue funcionando).
* La identidad es de Firebase; los datos de la app son de D1 y se enlazan por `uid` (que **nunca** sale del servidor). Hacia afuera se usa el `pid`.

## Frontend

Páginas HTML con `<script type="module">`; cada módulo importa lo que necesita. No hay empaquetador.

| Página | Módulo principal | Función |
|---|---|---|
| `index.html` | script en línea | Login/registro (Google o correo), restablecer contraseña. |
| `profile.html` | script en línea + `avatars.js` | Primer uso: nombre, carrera, personaje y tema. |
| `dashboard.html` | `dashboard.js` | Panel: malla, tarjetas, gráficos, importar de UTESA, configuración, dock del chat. |
| `chat.html` | `chat.js` | Chat a pantalla completa (misma pieza que el dock). |
| `reset-password.html` | script en línea | Nueva contraseña desde el enlace del correo. |
| `cuenta-eliminada.html` | script en línea | Aviso a cuentas eliminadas/baneadas; limpia el dispositivo y vuelve al login. |

Piezas compartidas: `store.js` (API del servidor), `theme.js` (temas), `modal.js`, `firebase-config.js` (Firebase).
Un script en el `<head>` de cada página aplica el tema guardado **antes del primer pintado** (evita el destello claro).

### El chat (`chat-core.js`)

Una sola pieza reutilizada por el dock (`chat-dock.js`) y la página `chat.html`. Vistas (`root.dataset.view`):
`home` (lista tipo Messenger) · `room` (conversación) · `people` (Ver estudiantes / Amigos / Solicitudes) · `new` (crear grupo) · `ginfo` (info del grupo).

* `ROOMS` guarda el estado por sala (`general`, `carrera`, `dm:<pid>`, `g:<id>`): mensajes, último id, `since` para cambios, `epoch` del reinicio.
* Actualizar una sala = `GET /api/chat?room=…&after=<último id>&since=<marca>` → mensajes nuevos + editados + ocultados.
* **En vivo**: al enviar/borrar/editar, el cliente escribe un "ping" en Firestore (`pingRoom`). Los demás lo reciben (`subscribe`) y piden los cambios.
  Respaldo: sondeo cada 3 s (sala abierta si no hay Firestore) y cada 15 s (todo lo demás, 60 s con el panel cerrado).
* Los chats privados y de grupo son `priv`: su "no leído" lo calcula el servidor (`dm_reads`) y se marca leído al verlos.
* La presencia usa una única regla en el cliente (`isOnline`: visto hace < 2 min con la hora del servidor).

## Backend (`app/_worker.js`)

Un solo archivo. Orden aproximado:

1. **Cabecera, límites y utilidades** (`limited`, `reply`, `fail`).
2. **Login directo con UTESA** (`login`): inicia sesión en `www.utesa.edu/webestudi`, lee "asignaturas pendientes" y el resumen,
   cierra sesión, devuelve solo los pendientes y contadores. Con token de Firebase, además verifica y otorga logros.
3. **Datos generados** entre marcas `/* <<ACH-DATA>> */ … /* <</ACH-DATA>> */` (logros y códigos por carrera) y `/* <<BAD-WORDS>> */`
   (malas palabras). **No se editan a mano**: `npm run build:data`.
4. **Auth y esquema**: `verifyClaims` (JWT RS256 con JWKS de Google), `ensureSchema` (crea/migra tablas), `authed` (usuario + roles + presencia).
5. **Moderación por reglas**: `maskProfanity`, `isBad`.
6. **Usuario** (`userApi`), **chat** (`chatApi`), **personas/amigos/grupos/moderadores** (`socialApi`), **verificación por marcador** (`verifyApi`), **perfil público** (`profileApi`).
7. **Router** (`export default { fetch }`): `/api/*` → handlers; lo demás → `env.ASSETS.fetch`.

### Flujos importantes

**Verificar el avance (logros y %)**

* *Inicio directo*: el servidor lee UTESA él mismo → dato confiable → `users.verified_src = 'direct'`.
* *Marcador*: el navegador del estudiante (con su sesión de UTESA abierta) lee las páginas y la app manda la lista a `/api/utesa-verify`.
  Es un dato **no demostrable**, así que pasa controles (carrera coincidente, contadores coherentes, el avance no retrocede, límite de intentos)
  y queda marcado `verified_src = 'bookmark'` (el perfil lo muestra).
* Logros ganados = materias clave de la carrera que **no** están pendientes (`computeEarned`). Rango = % de la carrera (`progressPct`, `ranks.js`).

**Roles**: dueño (`ADMIN_EMAILS`/`ADMIN_UIDS` en Cloudflare, correo verificado) → moderadores (los nombra el dueño) → estudiantes.
Los grupos tienen sus propios administradores. Moderadores y dueño no leen chats privados ni de grupos salvo mensajes **reportados**.

**Eliminar un usuario** (solo el dueño): borra cuenta, mensajes, chats privados, amistades y membresías; los grupos que creó pasan a otro miembro;
queda en `banned` (no puede crear perfil) y el cliente muestra `cuenta-eliminada.html`.

**Seguridad de escrituras**: toda petición que cambia datos exige `Origin` igual al host (`sameOrigin`) además del token de Firebase.
