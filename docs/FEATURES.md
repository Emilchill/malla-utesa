# Funciones de la app

Inventario por área, desde el punto de vista de quien usa la app. (La bitácora histórica con decisiones está en `CHANGELOG-FEATURES.md`.)

## Cuenta y acceso
* Registro e inicio de sesión con **Google** o correo/contraseña (Firebase Auth); restablecer contraseña por correo (`reset-password.html`).
* Primer uso (`profile.html`): nombre, carrera (18), personaje, tema de color.
* **Cuenta eliminada/baneada**: página `cuenta-eliminada.html` con botón de contacto para pedir revisión; limpia el dispositivo y vuelve al login.
* El tema elegido se aplica antes de pintar (la pantalla de carga ya sale con los colores correctos).

## Malla y avance
* **Malla interactiva** (`malla-view.js`) con ruta de requisitos: tocar una materia resalta sus prerrequisitos y lo que abre; zoom y arrastre.
* **Tarjetas** por cuatrimestre, **gráficos** (`charts-view.js`), buscador y filtros (todas/aprobadas/pendientes/electivas).
* Porcentaje, materias aprobadas/pendientes y créditos; lista de "listas para cursar" según requisitos.
* **Modo manual** (marcar a mano) o **vincular con UTESA**: inicio de sesión directo, **marcador** o texto pegado.
* Impresión de la malla en 2 páginas; PDF del pénsum.

## Personaje, temas y marcos
* **Creador de personajes SVG** (`character.js`): personas y animales; piel, pelo, rostro, maquillaje, **34 estilos de ropa** (incluye 6 navideños),
  extras (lentes, aretes, **16 sombreros** con gorro de Santa/elfo/cuernos de reno), color de fondo y botón Aleatorio.
* **6 temas**: UTESA Clásico, Medianoche, Atardecer, Océano, Violeta Nocturno, Coral.
* **368 logros**, uno por materia clave de cada carrera (se desbloquean al verificar el avance). Cada uno da un **marco animado único** para el avatar
  (bronce/plata/oro/diamante, patrón y color propios) y una **medalla** sobre la materia en la malla y las tarjetas.
* **Rangos** según el % de la carrera (Novato … Graduado); en el chat solo se muestran insignias de rol.
* **Verificación**: "con inicio de sesión directo" o "con marcador" (etiqueta visible en el perfil).

## Comunidad (chat)
* Lista de chats tipo **Messenger**: General, tu carrera, grupos y amigos; con no leídos, silenciados y estado "en línea".
* **Chat en vivo** (Firestore como campana + D1 como fuente): editar 5 min, borrar (queda "mensaje borrado"), reportar, bloquear, historial al subir, emojis.
* **Estudiantes**: directorio por carrera con búsqueda; **amigos** (solicitudes, aceptar/rechazar/cancelar/eliminar); **chat privado**.
* **Grupos**: el creador es administrador y nombra a otros admins; agregar/sacar miembros, renombrar, salir, borrar. Moderación propia del grupo.
* **Presencia**: punto verde "en línea" (se puede ocultar). **Avisos**: sonido leve, notificaciones del navegador (con la pestaña abierta) y silenciar chats.
* Filtro de **malas palabras** (lista dominicana e internacional) que enmascara con asteriscos y avisa con amabilidad.

## Moderación y administración
* **Dueño** (variables de Cloudflare) y **moderadores** (los nombra el dueño). Panel "Moderación": reportados, equipo, vaciar chats.
* El dueño puede **eliminar usuarios** por completo (cuenta, mensajes, chats privados; queda baneado).
* **Exclusivos del equipo**: 5 marcos (Arcoíris Cósmico, Amatista Real, Aurora Boreal, Guardián Nebulosa, Llama Arcana) y **15 artículos de personaje**
  (coronas, visores, capas, alas, auras…). Se pierden al perder el rol.
* Los privados y grupos no los lee nadie del equipo salvo mensajes reportados.

## Contacto y ayuda
* Botón de WhatsApp con mensaje prellenado en Configuración, el login, la lista de chats y la página de cuenta eliminada.

## Accesibilidad y UX
* Objetivos táctiles ≥ 44 px en pantallas táctiles, campos a 16 px, foco visible, `prefers-reduced-motion`, confirmaciones breves de cada acción.
* Móvil primero: el chat es una hoja a pantalla completa con botón flotante; en PC es un cuadro fijo abajo a la derecha.
