# Despliegue

## Resumen

```
merge a main ──► GitHub Actions ──► npm run check + npm test ──► wrangler pages deploy app ──► https://malla-utesa.pages.dev
```

* El proyecto de Cloudflare Pages es **`malla-utesa`** (subido por "Direct Upload", no conectado a Git). Por eso el despliegue
  lo hace **GitHub Actions con Wrangler**: así se conservan el proyecto, el dominio, el binding de D1 y las variables que ya están configuradas.
* Solo se publica la carpeta **`app/`**. Documentación, pruebas, herramientas y `legacy/` no salen a Internet.
* El workflow es [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml). Los cambios entran por Pull Request (el CI está en `ci.yml`).

## Recursos de Cloudflare (identificadores, no secretos)

| Recurso | Valor |
|---|---|
| Cuenta (Account ID) | `bf9294d055efdb106936a4302a9b18aa` |
| Proyecto de Pages | `malla-utesa` → https://malla-utesa.pages.dev |
| Base D1 | `malla-utesa-db` (id `59513f1e-26b2-4d9d-ab15-e42b1462381e`), binding **`DB`** |
| Variable `ADMIN_EMAILS` | correo(s) del dueño, separados por coma (se aplica solo si Firebase confirma que el correo está verificado) |
| Variable `ADMIN_UIDS` | opcional: uids de Firebase con rol de dueño |

Las variables y el binding están en **Cloudflare → Workers y Pages → malla-utesa → Settings → Bindings / Variables and secrets**.
Wrangler **no los toca** porque el repositorio no tiene `wrangler.toml` (la configuración del panel manda).

## Secretos de GitHub necesarios

En **GitHub → Settings → Secrets and variables → Actions** del repositorio:

| Secreto | Qué es |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token de API de Cloudflare con el permiso mínimo: **Account › Cloudflare Pages › Edit**. |
| `CLOUDFLARE_ACCOUNT_ID` | El Account ID de la tabla anterior. |

Los secretos de GitHub **no se pueden leer** una vez guardados (solo reemplazar).

### Cómo rotar el token de Cloudflare (paso a paso)

1. Cloudflare → My Profile → **API Tokens** → *Create Token* → *Create Custom Token* (empezar desde cero).
2. Nombre `github-actions-malla-utesa`; política **Account › Cloudflare Pages › Edit**. Si puedes, limita *Account Resources* a la cuenta
   de `malla-utesa` y ponle fecha de vencimiento (y apunta en `docs/ROADMAP.md` cuándo rotarlo).
3. Copia el token (solo se muestra una vez) y guárdalo: `gh secret set CLOUDFLARE_API_TOKEN --repo Emilchill/malla-utesa`
   (pega el valor cuando lo pida) o en GitHub → Settings → Secrets and variables → Actions.
4. Lanza **Actions → Deploy → Run workflow** y confirma que termina en verde.
5. Solo entonces **revoca el token anterior** en Cloudflare (API Tokens → ⋯ → Roll/Delete).

El token actual se creó el 2026-11-18, sin vencimiento y para todas las cuentas del dueño.

## Qué hace el workflow

1. `test`: Node 24 → `npm run check` (sintaxis + escaneo de secretos), comprueba que `_worker.js` esté al día con `npm run build:data` y corre `npm test`.
2. `deploy` (solo `push` a `main`, después de `test`): reemplaza el `?v=` de los HTML por el commit (cache-busting automático)
   y ejecuta `wrangler pages deploy app --project-name=malla-utesa --branch=main`.
3. Un solo despliegue a la vez (`concurrency`). También se puede lanzar a mano: **Actions → Deploy → Run workflow**.

Si Cloudflare registra el despliegue como *Preview* en vez de *Production*, revisa en el panel la **Production branch** del proyecto
(Settings → Builds / Branches) y que coincida con `--branch=main`.

## Cosas que NO se despliegan solas

* **Reglas de Firestore**: se publican a mano en la consola de Firebase (Firestore → Reglas) copiando
  [`firebase/firestore.rules`](../firebase/firestore.rules). Cámbialas en el repo primero y publícalas después.
* **Variables y bindings de Cloudflare**: se editan en el panel.
* **Datos de D1**: no hay migraciones separadas; el esquema se actualiza solo con la primera petición tras el despliegue.

## Revertir un despliegue malo

Cloudflare → Workers y Pages → `malla-utesa` → **Deployments** → elige uno anterior → **Rollback** (inmediato).
Después corrige en el repo (revierte el commit con `git revert` y haz merge).

## Entornos y vistas previas

Los Pull Requests **no** se publican (el CI solo prueba). Para ver cambios usa `npm run dev` en local.

## Respaldo en Netlify

`legacy/netlify/` conserva el antiguo respaldo estático (sin `/api/user`). No se despliega desde aquí y no es necesario para producción.

## Primera vez (ya hecho; por si hay que repetirlo)

1. Crear el token de Cloudflare (permiso Pages › Edit) y guardar `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` como secretos del repo.
2. Hacer merge a `main` o ejecutar el workflow a mano.
3. Verificar: `curl -s https://malla-utesa.pages.dev/api/user -o /dev/null -w "%{http_code}"` → `401` (la API responde) y la página abre.
