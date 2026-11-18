# Despliegue

## Resumen

```
merge a main ──► Cloudflare Pages (conectado a este repo) ──► build ──► https://malla-utesa.pages.dev
```

* El proyecto de Cloudflare Pages **`malla-utesa`** está **conectado directamente a este repositorio de GitHub** (desde 2026-11-18;
  antes era "Direct Upload" y se desplegaba con GitHub Actions). Cada push a `main` dispara un build y publica en producción.
* Las ramas y Pull Requests **no** se publican en producción: Cloudflare crea vistas previas (*Preview*) en `https://<rama>.malla-utesa.pages.dev`.
  Esas vistas previas usan la misma base D1 de producción (no hay base de pruebas): no pruebes en ellas con datos que no quieras en producción,
  y trátalas como públicas (el chat es el real). Para probar cambios usa `npm run dev` en local.
* **Configuración de build** (Cloudflare → malla-utesa → Settings → Build):
  * Comando de build: `sed -i -E "s/\?v=[0-9A-Za-z]+/?v=$(printf %.8s "$CF_PAGES_COMMIT_SHA")/g" app/*.html` (cache-busting automático:
    pone el commit en los `?v=` de los HTML). Ojo: el `sh` de Cloudflare **no** admite `${VAR:0:8}` (falla con "Bad substitution").
  * Directorio de salida: `app` (solo esa carpeta sale a Internet; docs, pruebas, herramientas y `legacy/` no).
  * Rama de producción: `main`.
* El `app/_worker.js` de la carpeta de salida es el backend (Pages *advanced mode*): Cloudflare lo detecta solo.
* **El CI (`.github/workflows/ci.yml`) ya NO decide el despliegue**: Cloudflare publica aunque el CI falle. Mira el check de GitHub antes de hacer merge.

## Recursos de Cloudflare (identificadores, no secretos)

| Recurso | Valor |
|---|---|
| Cuenta (Account ID) | `bf9294d055efdb106936a4302a9b18aa` |
| Proyecto de Pages | `malla-utesa` → https://malla-utesa.pages.dev |
| Base D1 | `malla-utesa-db` (id `59513f1e-26b2-4d9d-ab15-e42b1462381e`), binding **`DB`** |
| Variable `ADMIN_EMAILS` | correo(s) del dueño, separados por coma (se aplica solo si Firebase confirma que el correo está verificado) |
| Variable `ADMIN_UIDS` | opcional: uids de Firebase con rol de dueño |

Las variables y el binding están en **Cloudflare → Workers y Pages → malla-utesa → Settings → Bindings / Variables and secrets**.
No hay `wrangler.toml`: manda la configuración del panel. Los cambios de variables/bindings se aplican en el **siguiente despliegue**
(haz un commit o *Retry deployment*).

## Cabeceras de seguridad

[`app/_headers`](../app/_headers) las aplica Cloudflare a los **archivos estáticos** (no a `/api/*`, que pone las suyas desde el worker):
`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` y una **CSP completa y activa** desde 2026-11-18
(antes estuvo un tiempo en modo informe; se probó el login con Google y no hubo violaciones). Permite solo los orígenes que la app usa: `self`, Firebase/Google
(`gstatic`, `*.googleapis.com`, `accounts.google.com`, `*.firebaseapp.com`), Google Fonts y YouTube sin cookies. Mantiene `unsafe-inline` en scripts y estilos
porque el sitio usa `<script>` y `onclick=` en línea.
**Si añades un servicio externo nuevo** (otra API, imágenes, fuentes, un iframe…), agrégalo a `app/_headers` o el navegador lo bloqueará.
Si algo se rompe tras un despliegue, mira la consola: dirá `Refused to ...` con la directiva. `tests/headers.test.mjs` comprueba el formato y los orígenes de los HTML.
Compruébalo tras un despliegue con: `curl -sI https://malla-utesa.pages.dev/dashboard.html`.

## Conexión con GitHub

* Cloudflare accede a GitHub mediante la app **Cloudflare Workers and Pages**, instalada **solo en el repo `Emilchill/malla-utesa`**
  (GitHub → Settings → Applications → Installed GitHub Apps para revisarla o quitarla).
* **No hay secretos de Cloudflare en GitHub**: ya no se necesita token de API ni `CLOUDFLARE_ACCOUNT_ID` como secreto.

## Cosas que NO se despliegan solas

* **Reglas de Firestore**: se publican a mano en la consola de Firebase (Firestore → Reglas) copiando
  [`firebase/firestore.rules`](../firebase/firestore.rules). Cámbialas en el repo primero y publícalas después.
* **Variables y bindings de Cloudflare**: se editan en el panel.
* **Datos de D1**: no hay migraciones separadas; el esquema se actualiza solo con la primera petición tras el despliegue.

## Revertir un despliegue malo

Cloudflare → Workers y Pages → `malla-utesa` → **Deployments** → elige uno anterior → **Rollback** (inmediato).
Después corrige en el repo (revierte el commit con `git revert` y haz merge).

## Si hay que recrear el proyecto (por qué se hizo así)

Un proyecto de Pages creado por subida directa no se puede conectar a Git después: hubo que borrarlo y crearlo de nuevo con el mismo nombre
(para conservar el dominio `malla-utesa.pages.dev`). Pasos, por si se repite:

1. Anota variables y bindings (Settings). La base D1 vive aparte y no se borra con el proyecto.
2. Settings → Delete project (cae el sitio unos minutos).
3. Workers y Pages → Create → Pages → Import an existing Git repository → `Emilchill/malla-utesa`.
4. Nombre `malla-utesa`, rama `main`, comando de build y directorio de salida como arriba, variable `ADMIN_EMAILS`.
5. Settings → Bindings → D1 `DB` → `malla-utesa-db`; vuelve a desplegar.
6. Verifica: `curl -s https://malla-utesa.pages.dev/api/user -o /dev/null -w "%{http_code}"` → `401` (la API responde) y la página abre.

## Respaldo en Netlify

`legacy/netlify/` conserva el antiguo respaldo estático (sin `/api/user`). No se despliega desde aquí y no es necesario para producción.
