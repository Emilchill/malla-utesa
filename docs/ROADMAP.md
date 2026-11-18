# Hoja de ruta, deuda técnica e ideas

Lista viva. Marca con [x] lo que se complete y muévelo a `CHANGELOG-FEATURES.md`. Pensada también como menú de tareas para amigos e IAs.

## Seguridad y confiabilidad (prioridad alta)
- [x] **Exigir sesión en `/api/utesa-login`** (hecho 2026-11-18: token de Firebase obligatorio + 10 intentos/hora por cuenta). Pendiente: valorar eliminar el endpoint si ya no se usa.
- [ ] **Activar la CSP completa**: hoy `app/_headers` la tiene en modo informe (`Content-Security-Policy-Report-Only`). Revisa la consola del navegador (login con Google y correo, chat, video del tutorial) y, si no hay avisos, cámbiale el nombre a `Content-Security-Policy`. Idealmente quitar los scripts y estilos en línea (`onclick=`, `<script>` del tema) para prescindir de `unsafe-inline`.
- [ ] **Límite de intentos persistente** (D1 o regla de Cloudflare) en lugar de memoria del worker, para login y verificación.
- [ ] Turnstile (captcha de Cloudflare) en el inicio de sesión directo.
- [ ] Botón "desvincular y borrar mis datos" (borrar `verified_*`, `done`, `earned`) y aviso de consentimiento más claro.
- [ ] Valorar pedir el visto bueno de UTESA (el uso de credenciales de terceros).
- [ ] Reportar mensajes con una ventana propia (hoy usa `prompt()` del navegador).
- [ ] Reglas de Firestore: limitar por usuario la frecuencia de escritura de pings.

## Chat y comunidad
- [ ] Vista previa del último mensaje en la lista de chats.
- [ ] Notificaciones **push** reales (con la app cerrada): requiere service worker + servicio de push (Firebase Cloud Messaging).
- [ ] Adjuntar imágenes, responder a un mensaje, reacciones con emoji.
- [ ] Mencionar con `@nombre`.
- [ ] Buscar mensajes dentro de un chat.
- [ ] Salas por materia/profesor; anuncios fijados por moderadores.
- [ ] Transferir la propiedad de un grupo manualmente.

## Producto
- [ ] Planificador de cuatrimestre (sugerir materias según requisitos y créditos).
- [ ] Más carreras (Medicina 2024, Enfermería, etc., cuando haya pénsum publicado).
- [ ] Modo oscuro automático según el sistema.
- [ ] PWA instalable (manifest + service worker para uso sin conexión).
- [ ] Calendario académico y recordatorios.

## Técnica
- [ ] Partir `chat-core.js` (≈1.000 líneas) en módulos: salas, personas, grupos, perfil, presencia.
- [ ] Partir `_worker.js` en secciones con comentarios guía o un paso de empaquetado (hoy debe ser un solo archivo).
- [ ] Pruebas de interfaz automatizadas (Playwright) además de las del servidor.
- [ ] Linter y formateador (ESLint/Prettier) en el CI.
- [ ] Migraciones versionadas del esquema de D1 (hoy `ensureSchema` tolerante).
- [ ] Reducir `style.css` (≈2.000 líneas): ordenar por componentes y quitar reglas muertas.
- [ ] Observabilidad: contadores de uso (Workers Analytics) y alarma al acercarse a las cuotas gratuitas.

## Capacidad (plan gratuito)
Estimación: ~200–400 personas activas al día. Cuotas a vigilar: 100 000 peticiones/día de Workers, 5 M lecturas/día de D1,
50 000 lecturas y 20 000 escrituras/día de Firestore. Si se acerca el límite: subir al plan de pago de Workers (≈ 5 USD/mes) y/o
reducir el sondeo del cliente (`tick` en `chat-core.js`).
