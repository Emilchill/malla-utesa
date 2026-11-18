# API (`/api/*`)

Todo lo implementa `app/_worker.js`. Convenciones:

* **Autenticación**: cabecera `Authorization: Bearer <ID token de Firebase>`. Sin token válido → `401` (`code: "sesion"`).
  `/api/utesa-login` también exige token (401 `sesion` sin él) y limita a 10 intentos/hora por cuenta.
* **Escrituras** (POST/PUT/PATCH/DELETE): además exigen `Origin` igual al host (si no, `403 origen`).
* **Respuestas**: `{ ok: true, … }` o `{ ok: false, code, message }` (`message` en español, listo para mostrar).
* **Códigos frecuentes**: `400 entrada`, `401 sesion`, `403 permiso|origen|exclusivo|bloqueo`, `403 eliminada` (cuenta borrada/baneada),
  `404`, `409 sin-perfil|limite|estado`, `410 eliminado` (chat con alguien eliminado), `429 limite`.
* Las rutas con `pid` usan el **id público** (16 hex); el `uid` de Firebase nunca se expone.

## Usuario y perfil

| Método y ruta | Quién | Descripción |
|---|---|---|
| `GET /api/user` | sesión | Mi perfil: `user` con `name, career, theme, avatar, avatarBg, done[], utesaSync, frame, earned[], verifiedAt, verifiedVia, pct, pid, dirHidden, hideOnline, admin, owner`. `404 sin-perfil` si aún no existe. |
| `PUT /api/user` | sesión | `{ fields: {…}, createdAt? }`. Campos permitidos: `name, career, theme, avatar, avatarBg, frame, done, utesaSync, dirHidden, hideOnline`. Crea el perfil si no existe (necesita `name` y `career`). `403 marco` si el marco no es tuyo; `403 exclusivo` si usas artículos o marcos exclusivos sin ser del equipo. |
| `GET /api/profile?pid=` | sesión | Perfil público: `profile{ name, career, avatar, avatarBg, frame, earned[], pct, role, verifiedVia, online, seen, since }`, `rel` (relación de amistad), `blocked`, `me`. `404` si ya no existe (se muestra "Usuario eliminado"). |

## Vincular con UTESA

| Método y ruta | Descripción |
|---|---|
| `POST /api/utesa-login` | `{ matricula, recinto, password }`. Inicia sesión en UTESA **en memoria**, lee pendientes y contadores y cierra sesión. Devuelve `{ carrera, pensum, counts, pending[], verified? }`. Límite: 5 intentos/15 min por matrícula y 20/h por IP (en memoria, mejor esfuerzo). |
| `POST /api/utesa-verify` | `{ pending[], counts{aprob,insc,pend} }`. Verifica con la lista del **marcador** (ver `docs/ARCHITECTURE.md`). `400 contadores|sospechoso`, `409 retroceso`, `429`. Marca `verified_src = 'bookmark'`. |

## Chat

| Método y ruta | Descripción |
|---|---|
| `GET /api/chat?room=&after=&since=&before=&on=1` | `room` = `general`, `carrera`, `dm:<pid>` o `g:<id>`. Devuelve `messages[]` (hasta 60), `removed/hiddenNow/edited` (cambios desde `since`), `epoch`, `more`, `now`, y con `on=1` `seen{pid→última vez}`. `before` pagina hacia atrás (40). `400` si no tienes acceso a la sala; `410` si el amigo fue eliminado. |
| `POST /api/chat` | `{ room, text }` (≤ 500). Enmascara malas palabras (`flagged`, `notice`). Devuelve `id, text, at`. Límite: 15/min y 1,2 s entre mensajes. |
| `PATCH /api/chat` | `{ id, text }`. Solo el autor y hasta 5 min. |
| `DELETE /api/chat?id=` | Autor, o moderador (público), o admin del grupo. En privados/grupos el equipo global solo actúa si el mensaje fue reportado. Queda como mensaje borrado. |
| `POST /api/chat/restore` | `{ id }`. Moderador: restaura un mensaje que ocultó el equipo. |
| `POST /api/chat/report` | `{ id, reason }`. Solo de salas a las que perteneces. |
| `GET /api/chat/reports` | Moderador: mensajes reportados. |
| `POST /api/chat/block` | `{ pid, on }`. Bloquear quita la amistad. |
| `POST /api/chat/wipe` | `{ room: general\|carrera\|all }`. Moderador: vacía una sala pública; `all` solo el dueño. Cambia `chat_epoch` (los clientes se reinician). Los privados no se tocan. |
| `POST /api/dm/read` | `{ pid }`. Marca un chat privado como leído. |

## Personas, amigos y grupos

| Método y ruta | Descripción |
|---|---|
| `GET /api/people?career=&q=&offset=` | Directorio ("Ver estudiantes"): `careers[]` con conteos, `people[]` (60 por página, `more`), cada uno con `rel`, `online`, `seen`, `role`. `career=all` agrupa por carrera. Respeta "ocultarme" y bloqueos. |
| `GET /api/friends` | `friends[]` (con `unread`, `lastAt`), `incoming[]`, `outgoing[]`, `unread`, `now`. |
| `POST /api/friends` | `{ action: request\|accept\|decline\|cancel\|remove, pid }`. No contigo mismo; solicitudes cruzadas se aceptan solas; máx. 40 pendientes y 300 amigos. |
| `GET /api/groups` · `GET /api/groups?id=` | Lista de mis grupos (con `unread`) · detalle con miembros y roles. |
| `POST /api/groups` | `{ action, id?, … }`: `create{name,members[]}` (≤ 10 grupos por persona, solo amigos), `read`, `leave`, `delete` (creador), `rename`, `add{pid}`, `remove{pid}`, `role{pid,on}` (admins del grupo; solo el creador quita admins). Máx. 50 miembros. |

## Moderación y administración

| Método y ruta | Quién | Descripción |
|---|---|---|
| `GET /api/mods` | equipo | Lista de dueño y moderadores. |
| `POST /api/mods` | dueño | `{ pid, on }`. Nombrar/quitar moderador (no a sí mismo ni al dueño). Quitar el rol retira marcos y artículos exclusivos. |
| `POST /api/users/delete` | dueño | `{ pid }`. Elimina por completo (ver arquitectura). No a sí mismo ni al dueño. |

## Datos de desarrollo

`GET /__token?uid=ana` existe **solo** en `tools/dev-server.mjs` (entorno local). No existe en producción.
