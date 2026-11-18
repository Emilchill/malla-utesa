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

1. **(Mitigado 2026-11-18)** El inicio directo ya exige sesión de la app (token de Firebase) y limita a 10 intentos por hora por cuenta. Aún queda el riesgo de que una cuenta de la app se use para probar contraseñas de UTESA: el límite por matrícula e IP vive en la memoria del worker y se reinicia. *Mejora:* mover el límite a D1 o a una regla de Cloudflare (ver `ROADMAP.md`).
2. **La contraseña pasa por nuestro servidor.** Viaja cifrada (HTTPS), pero exige confiar en el operador del proyecto y en Cloudflare.
   El portal de UTESA, además, recibe la contraseña en la URL con un codificado trivial (así funciona su propio sitio) y puede registrarla.
3. **Verificación por marcador falsificable.** Un estudiante técnico podría fabricar una lista. Controles: carrera coincidente, contadores coherentes,
   avance que no retrocede, límite de intentos, y etiqueta visible "Verificado con marcador".
   **Mitigado 2026-11-18:** una lista **vacía** (declararse con la carrera 100 % terminada, incluso con contadores en 0) ya no se acepta por marcador; quien terminó la carrera verifica con matrícula (inicio directo). **Sigue siendo posible** que alguien con conocimientos técnicos fabrique una lista con pocas materias pendientes: no se puede evitar sin leer UTESA desde el servidor. Por eso la etiqueta «Verificado con marcador» se muestra siempre.
4. **No es oficial.** UTESA podría objetar el uso de credenciales en un sitio de terceros o bloquear el acceso. No hay permiso institucional.
5. **Límite en memoria**: los límites de velocidad del login/verificación se pierden al reciclarse el worker.
6. **Firebase `apiKey` pública**: está en `app/js/firebase-config.js`. Es la configuración **web** de Firebase, pública por diseño (la
   seguridad la dan Auth y las reglas de Firestore). No es un secreto, pero tampoco la uses para otras cosas.

## Qué hacer ante un incidente

* *Credenciales filtradas* (token de Cloudflare/GitHub): revocar en el panel correspondiente, crear uno nuevo, actualizar el secreto de GitHub.
* *Usuario abusivo*: reportar → moderador oculta → dueño elimina (`/api/users/delete`; queda baneado).
* *Cuenta eliminada por error*: `DELETE FROM banned WHERE uid = '…'` en D1 (el perfil y los mensajes ya no se recuperan).
