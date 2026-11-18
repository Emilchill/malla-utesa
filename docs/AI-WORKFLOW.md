# Cómo trabajar con IAs en este proyecto

Pensado para ti y tus amigos: usar un asistente (Claude, ChatGPT, Copilot, Cursor…) para mejorar la app **sin romper nada ni filtrar secretos**.

## Antes de empezar

1. Clona el repo y crea una rama: `git switch -c mi-mejora`.
2. Dale a la IA el contexto: pídele que lea **`AGENTS.md`** (Claude Code lo hace solo) y, según la tarea, `docs/ARCHITECTURE.md`, `docs/API.md` o `docs/DATA-MODEL.md`.
3. Arranca el entorno local: `npm run dev` (no necesitas cuentas ni claves).
4. **Nunca pegues en un chat con IA**: contraseñas, tokens de Cloudflare/GitHub, contenido de `.env`, datos reales de estudiantes, mensajes privados.

## Plantillas de instrucciones (cópialas y adáptalas)

**Cambio visual o de interfaz**
> Lee AGENTS.md. Quiero [describe el cambio] en `app/js/[archivo].js` y `app/css/style.css`. Debe verse bien en teléfono (390 px) y PC, en los 6 temas
> (Medianoche y Violeta son oscuros), con objetivos táctiles ≥ 44 px y textos en español. No agregues dependencias. Al terminar corre `npm run check && npm test`
> y explícame qué archivos cambiaste.

**Nueva función con servidor**
> Lee AGENTS.md y docs/API.md. Agrega [función]. Reglas: el servidor valida permisos y entrada (nunca confíes en el cliente), el `uid` sale del token,
> los errores devuelven `{ok:false, code, message}` en español, y la base se migra en `ensureSchema`. Escribe pruebas en `tests/` (casos normales, permisos y abuso)
> y actualiza docs/API.md y docs/DATA-MODEL.md.

**Corregir un error**
> Lee AGENTS.md. Hay un bug: [qué pasa, en qué pantalla/dispositivo, qué esperabas]. Encuentra la causa raíz (no un parche), arréglala y agrega una prueba que
> falle antes y pase después si es del servidor. Corre `npm run check && npm test`.

**Revisión de seguridad de un cambio**
> Revisa este diff como auditor de seguridad según AGENTS.md sección 5: permisos solo en el servidor, ningún dato privado hacia otros usuarios, sin secretos,
> `uid` nunca expuesto, sin XSS (todo texto de usuario pasa por `esc()`), límites de abuso. Lista hallazgos con archivo y línea.

**Agregar datos (materias, logros, palabras)**
> Lee AGENTS.md. Quiero [cambio] en `app/js/pensums-data.js` / `app/js/achievements.js` / `tools/malas-palabras.txt`. Después corre `npm run build:data`, `npm run check`
> y `npm test`, y confirma que `app/_worker.js` se actualizó.

## Lista de revisión de lo que entrega una IA

- [ ] ¿Corre `npm run check && npm test` en verde?
- [ ] ¿Lo probaste en `npm run dev` en móvil y PC (y con un segundo usuario si es chat)?
- [ ] ¿Cambió solo lo necesario? (`git diff --stat`; desconfía de reformatear archivos enteros).
- [ ] ¿Hay secretos, correos o datos personales en el diff? (`git diff | grep -iE "token|secret|password|@"`).
- [ ] ¿Los permisos se comprueban en `_worker.js` y no solo ocultando un botón?
- [ ] ¿Textos en español y accesibles?
- [ ] ¿Se actualizó la documentación (`docs/…`) si cambió la API, los datos o una función visible?
- [ ] ¿Pull Request pequeño, con descripción clara y capturas si es visual?

## Cosas que las IAs suelen hacer mal aquí (avísales)

* Añadir `import` o dependencias al `_worker.js` (debe ser un solo archivo sin imports).
* Editar a mano los bloques `<<ACH-DATA>>` / `<<BAD-WORDS>>` del worker (se generan con `npm run build:data`).
* Mostrar el `uid` de Firebase al cliente o aceptar roles/ids desde el cuerpo de la petición.
* Tocar `pensums-data.js` reformateándolo (es enorme; cambia solo las líneas necesarias).
* Olvidar el modo oscuro: usar colores fijos en vez de `var(--…)`.
* Suponer que existe un paso de build: no existe; los módulos corren tal cual en el navegador.
