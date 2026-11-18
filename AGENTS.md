# AGENTS.md — guía para IAs que trabajan en este repositorio

Léelo completo antes de cambiar código. Está escrito para asistentes (Claude, ChatGPT, Copilot, Cursor…) y para personas.
El proyecto, la interfaz y los comentarios están en **español**: mantén ese idioma en textos de usuario, comentarios y documentación.

## 1. Qué es esto

**Malla UTESA**: app web estudiantil (NO oficial de UTESA) para llevar la malla curricular y una comunidad (chat, amigos, grupos, logros).
Producción: https://malla-utesa.pages.dev (Cloudflare Pages). El repositorio es **privado**.

## 2. Stack (por qué no hay dependencias)

* **Frontend**: HTML + CSS + **módulos ES nativos**, sin framework y **sin build**. Se publica tal cual desde `app/`.
* **Backend**: `app/_worker.js` (Cloudflare Pages *advanced mode*): **un solo archivo**, sin `import`s ni dependencias.
  Sirve la API en `/api/*` y los archivos estáticos (`env.ASSETS`).
* **Base de datos**: Cloudflare **D1** (SQLite), binding `DB`. El esquema se crea/migra solo (`ensureSchema` en el worker).
* **Identidad**: **Firebase Auth** (Google o correo). El worker verifica el ID token (RS256) con las claves públicas de Google.
* **Avisos en vivo del chat**: **Firestore** solo para "pings" (`chatPing/*`, `inbox/*`); los mensajes viven en D1.
* **Respaldo antiguo**: Netlify (`legacy/netlify/`), no se usa.

## 3. Comandos

```bash
npm run dev         # entorno local completo en http://localhost:5190 (sin Cloudflare/Firebase)
npm test            # 3 suites de pruebas del servidor (node:sqlite, sin red)
npm run check       # sintaxis de todo el JS
npm run build:data  # regenera en _worker.js los bloques generados (logros, códigos por carrera, malas palabras)
```

Node ≥ 22.5 (usa `node:sqlite`). **Siempre corre `npm run check && npm test` antes de dar algo por terminado.**

## 4. Mapa del código

| Ruta | Qué es |
|---|---|
| `app/_worker.js` | TODA la API. Secciones: login directo con UTESA, `/api/user`, chat (`/api/chat*`), personas/amigos/grupos/moderadores (`socialApi`), verificación por marcador (`verifyApi`), perfil público. |
| `app/js/store.js` | Cliente de la API: `api(method, path, body)`, `loadUser`, `saveUser`. Maneja `eliminada` (cuenta borrada). |
| `app/js/dashboard.js` | Panel: malla, tarjetas, progreso, importación de UTESA, medallas, cabecera. |
| `app/js/chat-core.js` | **Chat completo** (lista tipo Messenger, salas, DM, grupos, personas, perfil modal, presencia, moderación). Archivo grande: cambia con cuidado. |
| `app/js/chat-dock.js` | Cuadro de chat fijo (PC) y hoja/botón flotante (teléfono). |
| `app/js/chat-live.js` | Avisos en vivo con Firestore (`chatPing`, `inbox`). |
| `app/js/chat-prefs.js` | Sonido, notificaciones del navegador, silenciar chats. |
| `app/js/character.js` | Creador de personajes SVG (ropa, sombreros, artículos exclusivos). `avatars.js` lo envuelve. |
| `app/js/frames.js` | Marcos animados del avatar (logros + 5 exclusivos de moderación). |
| `app/js/achievements.js` | Los 368 logros (id = código de materia). `ranks.js`: rangos por %. `medal.js`: medallas. |
| `app/js/pensums-data.js` | Pénsum 2023 de las 18 carreras (materias, créditos, requisitos). |
| `app/js/utesa-import.js` | Vinculación con UTESA: inicio directo, marcador y texto pegado. |
| `app/js/settings.js`, `theme.js`, `malla-view.js`, `charts-view.js`, `modal.js` | Configuración, temas, vistas de malla y gráficos, modales. |
| `app/css/style.css` | Todos los estilos. Al final hay bloques por función (chat, marcos, pulido de UX). |
| `tools/build-worker-data.mjs` | Inyecta datos de `achievements.js`, `pensums-data.js` y `tools/malas-palabras.txt` dentro de `_worker.js`. |
| `tests/` | `harness.mjs` (worker real + SQLite + Firebase y UTESA simulados) y las suites. |
| `firebase/firestore.rules` | Reglas de Firestore (se publican a mano en la consola). |

## 5. Reglas que NO se negocian

1. **Nunca** subas secretos: contraseñas, tokens, claves privadas, `.env`. El repo no los necesita (ver `SECURITY.md`).
2. **La contraseña de UTESA** del usuario solo vive en memoria durante una petición. No la guardes, no la registres, no la devuelvas.
3. **El servidor manda.** Todo permiso se comprueba en `_worker.js`; la interfaz solo oculta botones. Nunca confíes en datos del cliente
   (roles, dueños, marcos, artículos exclusivos, `pid`). El `uid` sale SIEMPRE del token verificado, jamás del cuerpo.
4. **No expongas el `uid`** de Firebase a otros usuarios: se usa el `pid` (16 hex derivados con SHA-256).
5. **Un solo archivo para el worker**: no agregues `import` ni dependencias a `_worker.js`.
6. **Sin build, sin frameworks**: módulos ES nativos. No agregues dependencias npm al frontend sin discutirlo.
7. **Cambias datos de logros/pénsum/malas palabras →** corre `npm run build:data` y haz commit de `_worker.js`.
8. **Texto al usuario en español**, tono cercano y respetuoso. Los emojis solo donde ya se usan.
9. **Móvil primero**: objetivos táctiles ≥ 44 px, campos a 16 px (evita el zoom de iPhone), respeta `prefers-reduced-motion`.
10. Todo cambio del servidor lleva **pruebas** en `tests/`. Los errores se devuelven como `{ ok:false, code, message }` con `message` en español.

## 6. Convenciones importantes

* **Salas del chat** (columna `messages.room`): `general`, `c:ISC` (carrera), `dm:<pidA>:<pidB>` (ordenados), `g:<id>` (grupo).
  El cliente pide `room=general|carrera|dm:<pid>|g:<id>` y el servidor lo traduce y autoriza (`resolveRoom`).
* **Ids públicos**: `pid` (usuario). Códigos de materia `ABC-123` (se normalizan con `normCode`).
* **Roles**: dueño = correo/uid en variables de Cloudflare (`ADMIN_EMAILS`, `ADMIN_UIDS`) → `users.is_owner`; moderador = `users.is_mod`
  (solo el dueño lo cambia). En grupos, el admin del grupo es independiente (`group_members.role`).
* **Mensajes borrados** quedan como "tombstone" (`hidden`, `hidden_by`), no se eliminan. El reinicio total cambia `meta.chat_epoch`.
* **Presencia**: `users.last_seen` (se anota cada minuto) y el cliente decide "en línea" (< 2 min) con la hora del servidor.
* **Cache-busting**: los HTML llevan `?v=AAAAMMDD` en CSS/JS; el despliegue automático lo reemplaza por el commit.
* **CSS**: variables por tema en `:root` / `[data-theme=…]` al inicio de `style.css`; usa `var(--…)`, no colores fijos (salvo marcas/estados).
* **Firebase en el cliente** se importa por URL (CDN gstatic). `tools/dev-server.mjs` las sustituye por simulaciones locales.

## 7. Cómo agregar una función (lista de verificación)

1. Lee `docs/ARCHITECTURE.md` y la sección relevante de `docs/API.md` / `docs/DATA-MODEL.md`.
2. ¿Toca datos? Añade columnas/tablas en `ensureSchema` (las migraciones son `ALTER TABLE … ADD COLUMN` tolerantes a "ya existe").
3. Endpoint nuevo: valida entrada, comprueba permisos y origen (`sameOrigin`), limita abuso, responde con `reply/fail`.
4. Cliente: agrega la UI en el módulo correspondiente; accesible (roles ARIA, foco visible) y probada en móvil y PC.
5. Pruebas en `tests/` (permisos, casos límite, abuso). `npm run check && npm test`.
6. Documenta: `docs/API.md`, `docs/DATA-MODEL.md` y, si es visible, `docs/FEATURES.md`.
7. Pull Request con la plantilla. No hagas push directo a `main`.

## 8. Trampas conocidas

* `chat-core.js` mantiene estado por sala en `ROOMS`; los mensajes privados y de grupo tienen `priv: true` y su "no leído" viene del
  servidor (`dm_reads`), no del cliente.
* `app/js/pensums-data.js` es enorme: no lo reformatees.
* Si el worker devuelve `403 eliminada`, el cliente redirige a `cuenta-eliminada.html` (cuenta borrada o baneada).
* D1 admite pocos parámetros por consulta (≈100): las listas largas se procesan por tandas.
* Los tests usan hora real y límites de velocidad (1,2 s entre mensajes del mismo usuario): hay `sleep` a propósito.
* En PowerShell/Windows cuida los escapes al generar archivos con scripts; prefiere editar archivos directamente.

## 9. Despliegue (resumen)

Cloudflare Pages está **conectado a este repo**: push/merge a `main` → build de Cloudflare (`app/` como salida, `?v=` = commit) →
https://malla-utesa.pages.dev. GitHub Actions (`ci.yml`) solo corre `npm run check` y `npm test`; **no bloquea el despliegue**, así que
nunca hagas merge con el CI en rojo. Detalles y reversa en `docs/DEPLOY.md`. Las reglas de Firestore **no** se despliegan solas.
