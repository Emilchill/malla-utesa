# Modelo de datos

La base es **Cloudflare D1 (SQLite)**. El esquema lo crea y migra el propio worker en `ensureSchema()` (la primera petición después de
cada arranque): `CREATE TABLE IF NOT EXISTS` y `ALTER TABLE … ADD COLUMN` tolerantes a "ya existe". **No hay archivos de migración**:
para agregar una columna, añádela a la lista correspondiente en `ensureSchema`.

## Tablas

### `users`
Una fila por persona (clave `uid` de Firebase, **nunca expuesta**).

| Columna | Tipo | Descripción |
|---|---|---|
| `uid` | TEXT PK | Id de Firebase Auth. |
| `pid` | TEXT UNIQUE | Id público: primeros 16 hex de `SHA-256("malla-utesa|"+uid)`. |
| `name`, `career` | TEXT | Nombre y carrera (código de 3 letras, p. ej. `ISC`). |
| `theme`, `avatar`, `avatar_bg` | TEXT | Tema de color, personaje (`c1:{json}`) y color de fondo. |
| `done` | TEXT (JSON) | Materias marcadas como aprobadas (`["INF-117", …]`). |
| `utesa_sync` | TEXT (JSON) | Último sincronizado con UTESA (fecha y contadores). |
| `frame` | TEXT | Marco equipado: código de materia (logro) o `MOD-1…MOD-5` (exclusivo del equipo). |
| `earned` | TEXT (JSON) | Logros calculados al verificar (se recalculan en vivo desde `verified_pending`). |
| `verified_at` | INTEGER | Cuándo se verificó el avance. |
| `verified_pending` | TEXT (JSON) | Pendientes que dijo UTESA al verificar (base de logros y %). |
| `verified_src` | TEXT | `direct` (inicio de sesión directo) o `bookmark` (marcador). |
| `is_owner`, `is_mod` | INTEGER | Dueño (sincronizado desde las variables de Cloudflare) y moderador (lo cambia el dueño). |
| `dir_hidden`, `hide_online` | INTEGER | Ocultarse de "Ver estudiantes" / ocultar el estado en línea. |
| `last_seen` | INTEGER | Última actividad (ms). "En línea" = menos de 2 min. |
| `created_at`, `updated_at` | INTEGER | ms. |

Los artículos exclusivos del personaje (`xh, xg, xb, xw, xa`) viven **dentro** de `avatar` (JSON). El servidor los rechaza a quien no sea del equipo.

### `messages`
Todos los mensajes (públicos, privados y de grupo).

`id` PK autoincremental · `room` · `uid` · `text` · `created_at` · `hidden` (0/1) · `hidden_at` · `hidden_by` (`self`/`mod`) · `edited_at`.

Salas (`room`): `general` · `c:ISC` (carrera) · `dm:<pidA>:<pidB>` (pids ordenados) · `g:<id>` (grupo).
Los borrados quedan como "tombstone" (`hidden`); el texto de uno ocultado por el equipo solo lo ve un moderador.
Índices: `(room, id)` y `(uid, created_at)`.

### Social
* `friendships(from_uid, to_uid, status 'pending'|'accepted', created_at)`, PK `(from_uid, to_uid)`.
* `blocks(uid, blocked_pid)` — quién bloqueó a quién.
* `dm_reads(uid, room, last_id)` — hasta qué mensaje leyó cada persona en cada chat privado/grupo (de ahí salen los "no leídos").
* `chat_groups(id, name, owner_uid, created_at)` y `group_members(gid, uid, role 'admin'|'member', joined_at)`.

### Moderación y control
* `reports(message_id, reporter_uid, reason, created_at, text)` — reportes de mensajes. `text` es una copia del mensaje al reportarlo (evidencia aunque el autor lo edite o borre después).
* `meta(k, v)` — pares clave/valor. Hoy: `chat_epoch` (cambia al vaciar chats; los clientes se reinician solos).
* `banned(uid, at)` — cuentas eliminadas: no pueden volver a crear perfil (responden `403 eliminada`).
  Para readmitir a alguien: `DELETE FROM banned WHERE uid = '<uid>'` desde la consola de D1.

## Firestore (solo avisos)

Reglas en [`firebase/firestore.rules`](../firebase/firestore.rules). Documentos de un solo campo `t` (marca de tiempo del servidor):

* `chatPing/general`, `chatPing/c_<CARRERA>`, `chatPing/g_<id>` — "algo cambió en esta sala".
* `inbox/<pid>` — "tienes algo nuevo": mensaje privado, solicitud o respuesta.

No contienen mensajes ni datos personales. Cualquier sesión puede leerlos y escribirlos con ese formato (es solo una campana).

## Datos que NO están en la base

* **La contraseña de UTESA** y la **matrícula**: solo pasan por memoria durante el inicio de sesión directo.
* **Sesiones y credenciales**: las maneja Firebase Auth.

## Consultas útiles (consola de D1)

```sql
SELECT COUNT(*) FROM users;                                   -- usuarios
SELECT career, COUNT(*) FROM users GROUP BY career;            -- por carrera
SELECT name, is_mod, is_owner FROM users WHERE is_mod=1 OR is_owner=1;
DELETE FROM banned WHERE uid = '…';                           -- readmitir a alguien
```
