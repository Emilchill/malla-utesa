# Seguridad

## Reportar un problema de seguridad

**No abras un Issue público con detalles de una vulnerabilidad.** Escríbele directamente al dueño (WhatsApp +1 829 642 2334 o por mensaje privado
en GitHub a @Emilchill) con: qué pasa, cómo reproducirlo y qué impacto tiene. Se responde lo antes posible.

## Dónde están los secretos (y por qué NO están en este repositorio)

| Secreto / dato sensible | Dónde vive | En el repo |
|---|---|---|
| Token de API de Cloudflare | Secreto de GitHub Actions `CLOUDFLARE_API_TOKEN` | **No** |
| Account ID de Cloudflare | Secreto de GitHub Actions `CLOUDFLARE_ACCOUNT_ID` (y aparece en `docs/DEPLOY.md`: es un identificador, no un secreto) | Solo como dato de referencia |
| Correo del dueño (`ADMIN_EMAILS`) y `ADMIN_UIDS` | Variables del proyecto en Cloudflare Pages | **No** |
| Base de datos D1 (usuarios, mensajes) | Cloudflare | **No** (solo su esquema) |
| Contraseñas de usuarios | Firebase Auth / Google | **No** |
| Contraseña de UTESA de un estudiante | En ningún lado: solo en memoria durante una petición | **No** |
| Claves de cuenta de servicio de Firebase | No se usan | **No** |

### Lo único "sensible" que sí está en el código: la configuración web de Firebase

`app/js/firebase-config.js` contiene `apiKey`, `projectId`, etc. del proyecto `malla-curricular-38175`. Es la configuración **web** de Firebase:
**es pública por diseño** (cada visitante del sitio la descarga). La protección real está en Firebase Auth y en las reglas de Firestore
(`firebase/firestore.rules`). Aun así, si alguna vez se publica el repo, no reutilices esa llave para otros fines.
Recomendado en la consola de Google Cloud: restringir la API key a los dominios del sitio.

## Reglas

* **Nunca** hagas commit de `.env`, tokens, claves privadas, volcados de base de datos ni datos reales de estudiantes (el `.gitignore` bloquea los más comunes).
* Si se filtra un secreto: **revocarlo primero**, luego crear uno nuevo y actualizar el secreto de GitHub. Borrar el commit no basta.
* **`main` NO está protegido por GitHub**: en cuentas gratuitas GitHub no permite proteger ramas de repos privados (pide GitHub Pro).
  Por eso la regla es **humana**: nadie hace push directo a `main`; todo entra por Pull Request con el CI en verde y la aprobación del dueño.
  Quien tenga permiso de **escritura** puede saltarse esa regla y publicar en producción, y también puede editar `.github/workflows/`
  y usar el token de Cloudflare. En una cuenta personal **todo colaborador invitado recibe escritura** (no existe rol *Read*), así que
  solo invita a gente de confianza total, o mueve el repo a una Organización gratuita para usar *Read* + fork + Pull Request
  (ver `CONTRIBUTING.md`). Si algún día hay GitHub Pro: activa protección de `main` (PR obligatorio + check `check-and-test`).
* El token de Cloudflare (`github-actions-malla-utesa`) tiene el **mínimo permiso** (Account › Cloudflare Pages › Edit), pero **sin fecha de
  vencimiento y para todas las cuentas** del dueño. Rótalo (ver `docs/DEPLOY.md`) si alguien con acceso deja el proyecto o si sospechas una filtración.
* `npm run check:secrets` (también dentro de `npm run check` y del CI) escanea el repo buscando tokens y claves privadas conocidos.
  Es una red de seguridad, no una garantía: revisa tú mismo lo que subes.
* Dependencias: el proyecto casi no tiene (el worker y el frontend no usan paquetes); eso reduce mucho la superficie de ataque. Mantenlo así.

## Modelo de seguridad de la app (resumen)

* El servidor es la autoridad: verifica el token de Firebase (RS256), comprueba `Origin` en escrituras y valida permisos y entradas.
* El `uid` de Firebase nunca llega al navegador de otros usuarios (se usa el `pid`).
* Moderadores y dueño no leen chats privados ni de grupo salvo mensajes reportados.
* Detalle de riesgos conocidos y mejoras pendientes: [`docs/PRIVACY-AND-DATA.md`](docs/PRIVACY-AND-DATA.md) y [`docs/ROADMAP.md`](docs/ROADMAP.md).
