# Privacidad, datos y riesgos conocidos

Documento interno y transparente: qué datos maneja la app, dónde viven y qué puntos débiles existen hoy.

## Qué se guarda y dónde

| Dato | Dónde | Quién lo ve |
|---|---|---|
| Correo y credenciales de acceso | Firebase Auth (Google) | Solo el dueño del proyecto Firebase. La app no los guarda. |
| Nombre, carrera, avatar, tema | D1 (`users`) | Nombre, carrera, avatar, marco, porcentaje, logros: **otros usuarios** (perfil público). |
| Materias aprobadas (`done`) y pendientes verificados | D1 (`users`) | Solo la propia persona. A otros solo se les muestra el **porcentaje** y los **logros**, nunca la lista de pendientes. |
| Mensajes (públicos, privados, grupos) | D1 (`messages`) | Públicos: todos los de esa sala. Privados/grupos: solo sus participantes; el equipo solo ve lo **reportado**. |
| Estado "en línea" | D1 (`last_seen`) | Amigos/estudiantes; se puede ocultar en Configuración. |
| **Contraseña de UTESA** | **No se guarda.** Pasa por memoria del worker en una sola petición. | Nadie. |
| **Matrícula** | **No se guarda.** Solo se usa en esa petición. | Nadie. |

El dueño del proyecto (quien administra Cloudflare) tiene acceso técnico a toda la base D1. Eso es inherente y debe decirse con claridad a los usuarios.

## Vinculación con UTESA: cómo funciona y qué riesgos tiene

* **Inicio de sesión directo** (`POST /api/utesa-login`): el estudiante escribe matrícula y contraseña; el worker inicia sesión en
  `www.utesa.edu/webestudi` como lo haría el estudiante, lee los pendientes y cierra sesión. La contraseña no se guarda ni se registra
  (no hay `console.log` con datos de usuario) y nunca se devuelve. Habla solo con `utesa.edu`, solo acepta peticiones del propio sitio y
  limita intentos (5 por matrícula/15 min, 20 por IP/hora, **en memoria**).
* **Marcador** (`POST /api/utesa-verify`): el estudiante inicia sesión **él mismo** en UTESA y el marcador envía la lista de pendientes. No pasa
  contraseña por nuestro servidor. Pero el dato no es demostrable: ver "Riesgos".

## Riesgos conocidos (ordenados)

1. **El inicio directo no exige sesión de la app.** Cualquiera podría usar el worker como intermediario para probar contraseñas de UTESA
   (limitado por IP y matrícula, pero el límite vive en memoria y se reinicia). *Mejora:* exigir token de Firebase y mover el límite a D1 (ver `ROADMAP.md`).
2. **La contraseña pasa por nuestro servidor.** Viaja cifrada (HTTPS), pero exige confiar en el operador del proyecto y en Cloudflare.
   El portal de UTESA, además, recibe la contraseña en la URL con un codificado trivial (así funciona su propio sitio) y puede registrarla.
3. **Verificación por marcador falsificable.** Un estudiante técnico podría fabricar una lista. Controles: carrera coincidente, contadores coherentes,
   avance que no retrocede, límite de intentos, y etiqueta visible "Verificado con marcador".
4. **No es oficial.** UTESA podría objetar el uso de credenciales en un sitio de terceros o bloquear el acceso. No hay permiso institucional.
5. **Límite en memoria**: los límites de velocidad del login/verificación se pierden al reciclarse el worker.
6. **Firebase `apiKey` pública**: está en `app/js/firebase-config.js`. Es la configuración **web** de Firebase, pública por diseño (la
   seguridad la dan Auth y las reglas de Firestore). No es un secreto, pero tampoco la uses para otras cosas.

## Qué hacer ante un incidente

* *Credenciales filtradas* (token de Cloudflare/GitHub): revocar en el panel correspondiente, crear uno nuevo, actualizar el secreto de GitHub.
* *Usuario abusivo*: reportar → moderador oculta → dueño elimina (`/api/users/delete`; queda baneado).
* *Cuenta eliminada por error*: `DELETE FROM banned WHERE uid = '…'` en D1 (el perfil y los mensajes ya no se recuperan).

## Cambio del 2026-11-18: la contraseña de UTESA ya no pasa por la app

El formulario de inicio de sesión directo (matrícula + contraseña) se **retiró de la interfaz**. Ahora el estudiante inicia sesión en la página
oficial de UTESA y el marcador (que corre dentro de `www.utesa.edu/webestudi`) lee `asignaturas-pendientes.aspx` y `resumen.aspx`, llama a
`cerrarses.aspx` para **cerrar la sesión de UTESA** y envía solo la lista de pendientes y los contadores a la app (`POST /api/utesa-verify`).
* El endpoint `POST /api/utesa-login` **sigue existiendo en el worker pero ya no se usa**. Recomendado: eliminarlo (y sus pruebas) para quitar
  la superficie de "intermediario de contraseñas" descrita arriba; ver `docs/ROADMAP.md`.
* El cierre de sesión del marcador no se probó contra el portal real (solo con simulación): `cerrarses.aspx` es la misma página que usa el worker.
