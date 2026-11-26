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
   Del lado de UTESA, la contraseña se envía al portal tal como lo hace su propio sitio web; la app no la guarda en ningún momento.
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

## Firestore: avisos en vivo (revisado 2026-11-18)

Las reglas **publicadas** en la consola de Firebase (proyecto `malla-curricular-38175`) son idénticas a `firebase/firestore.rules`. Solo hay tres colecciones:
`users` (cada quien lee solo la suya, nadie escribe), `chatPing` e `inbox` (avisos `{ t: timestamp }`, sin contenido de mensajes). Cualquier cuenta autenticada
puede escribir en cualquier `chatPing/*` válido e `inbox/{pid}`: no se filtra contenido (no hay), pero se puede gastar la cuota o hacer que el cliente de alguien
refresque. El cliente trata un fallo de aviso como no crítico y sigue por sondeo. Mitigación recomendada: App Check.

## Cambios del 2026-11-21 (auditoría run-2)

* **Reportes:** cada reporte guarda una copia del texto del mensaje. Si el autor lo edita o lo borra después, el equipo sigue viendo el texto original (marcado) hasta archivarlo. Esa copia solo la ven moderadores y dueño, igual que antes el texto del mensaje reportado.
* **Inicio directo con UTESA:** si el nombre de carrera que muestra el portal corresponde a una carrera distinta de la del perfil, no se otorgan logros ni porcentaje. Si el nombre no se reconoce, sigue rigiendo la regla del 60 %.
* **Topes:** el máximo de 300 amigos se aplica también al aceptar; los topes de solicitudes pendientes, grupos y miembros son atómicos.

## Cambios del 2026-11-21, segunda tanda

* **Inicio directo:** ya nadie puede bloquear la vinculación de otra persona con intentos desde su propia cuenta (el cupo de 5 es por cuenta y matrícula); por matrícula solo cuentan las contraseñas fallidas (10 por hora). Los contadores siguen en memoria de cada instancia (mejor esfuerzo).
* **Claves de Google:** una kid desconocida provoca como mucho una recarga por minuto, con tiempo límite.
* **Chat:** el límite de 15 mensajes/min y 1,2 s va dentro de la inserción; la rama `since` respeta los bloqueos; las recargas por avisos de Firestore se agrupan (máx. 1 cada 1,5 s).
* **Moderadores:** la degradación quita rol, marco MOD y artículos exclusivos en una sola sentencia, y guardar un marco MOD o un artículo exclusivo exige seguir siendo del equipo en ese instante.
* **Enlace #utesa:** si el importador se abre desde un enlace, la verificación de logros queda desmarcada y hay que confirmarla.

## Materias en curso (2026-11-26)

* Para saber qué materias cursa alguien ahora, el marcador y el inicio de sesión directo abren *Asignaturas inscritas* del portal (`asignaturas-inscritas.aspx`). Esa tabla no tiene calificaciones; se toma **solo la clave** de cada materia (ni horario ni aula salen del navegador o del servidor; `parseCurrent` en `app/_worker.js`, prueba en `tests/server.core.test.mjs`).
* Se guarda en `users.current` (lista de claves) y se borra al reiniciar la cuenta.
