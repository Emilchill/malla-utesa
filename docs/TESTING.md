# Pruebas y entorno local

Requisito: **Node.js ≥ 22.5** (las pruebas usan `node:sqlite`). Sin dependencias: no hace falta `npm install`.

## Comandos

```bash
npm test          # corre las 3 suites (≈ 20 s)
npm run check     # sintaxis de todo el JavaScript + escaneo de secretos (rápido); por separado: check:js y check:secrets
npm run dev       # app completa en http://localhost:5190
```

## Pruebas del servidor (`tests/`)

Cada suite ejecuta el **`_worker.js` real** contra SQLite en memoria; no hay red ni Cloudflare.

| Archivo | Cubre |
|---|---|
| `harness.mjs` | Banco común: base SQLite, tokens de Firebase falsos (RS256), portal de UTESA falso, helpers `call()`, `ok()`, `tok()`. |
| `server.core.test.mjs` | Perfiles, inicio directo y logros, marcos, chat público, edición/borrado/ocultar, moderación, historial y borrado total. |
| `server.social.test.mjs` | Directorio, amistades, chat privado, grupos y sus roles, moderadores, vaciar chats, eliminar usuarios, presencia, marcos y artículos exclusivos, verificación por marcador. |
| `moderation.test.mjs` | Filtro de malas palabras: lo ofensivo se enmascara, lo legítimo ("500 mg", "cuerpo"…) no. |

### Escribir una prueba

```js
import { ok, call, tok, prof, sleep, finish } from "./harness.mjs";

await call("PUT", "/api/user", tok("ana"), prof("Ana", "ISC"));          // crea un perfil
const r = await call("GET", "/api/user", tok("ana"));                     // r = [status, json]
ok("el perfil existe", r[0] === 200 && r[1].user.name === "Ana", r);

await sleep(1300);   // el servidor limita a 1 mensaje cada 1,2 s por usuario
finish();            // imprime TODO OK / N FALLOS y sale con el código adecuado
```

* `tok(uid, { email, email_verified })` fabrica un token válido; un correo **verificado** igual a `ADMIN_EMAILS` (`boss@x.com` en el banco) da rol de dueño.
* Cada archivo arranca con una base vacía. Los usuarios de una suite no existen en otra.
* Si tu prueba envía muchos mensajes seguidos, espera (`sleep`) o usa usuarios distintos para no chocar con el límite de velocidad.

## Entorno local (`npm run dev`)

`tools/dev-server.mjs` copia `app/` a `.dev-site/` (ignorado por git), sustituye Firebase por simulaciones y levanta el worker real con una
base en memoria. Entra a `http://localhost:5190/dev.html` para elegir usuario:

| Usuario | Rol |
|---|---|
| `ana` | **Dueña** (administradora), ISC |
| `bob`, `dan`, `eva` | Estudiantes ISC |
| `cat` | Estudiante DER |

* Para entrar como otro usuario en la consola del navegador: `localStorage.setItem('uid','bob'); location.reload()`.
* El inicio de sesión directo con UTESA funciona con **cualquier** matrícula/contraseña: el portal es falso y responde con datos de ISC.
* Sin Firestore, el chat se actualiza por sondeo (cada pocos segundos). Es normal.
* Los datos se pierden al detener el servidor. Cambia el puerto con `PORT=5200 npm run dev`.

## Revisión manual antes de un Pull Request

1. `npm run check && npm test`.
2. `npm run dev` y probar lo que tocaste **en tamaño teléfono y PC** (herramientas del navegador → modo móvil).
3. Si tocaste el chat: entrar con dos usuarios en dos ventanas (uno en ventana privada) y comprobar mensajes, no leídos y permisos.
4. Si tocaste estilos: revisar los 6 temas (sobre todo Medianoche y Violeta, que son oscuros).
