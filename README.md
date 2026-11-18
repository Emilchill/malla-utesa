# Malla UTESA

> **Proyecto estudiantil independiente. NO es un sitio oficial de UTESA ni está afiliado a la universidad.**
> Hecho por y para estudiantes. Los datos del pénsum pueden tener errores: confirma siempre tu avance real con tu coordinación de carrera.

Sitio en producción: **https://malla-utesa.pages.dev**

Malla UTESA es una aplicación web para que los estudiantes de UTESA lleven su **malla curricular** cuatrimestre a cuatrimestre
(18 carreras, pénsum 2023) y, además, formen una **comunidad**: logros y marcos para el avatar, chat por carrera, amigos,
chats privados, grupos y moderación.

## Qué incluye

| Área | Resumen |
|---|---|
| **Malla y avance** | Malla interactiva con ruta de requisitos, tarjetas, gráficos, porcentaje de avance, modo manual o vinculación con UTESA. |
| **Vincular con UTESA** | Inicio de sesión directo (matrícula + contraseña, procesada solo en memoria) o **marcador** (bookmarklet). Verifica el avance y desbloquea logros. |
| **Personaje y temas** | Creador de personajes SVG (34 estilos de ropa, temporada navideña, extras), 6 temas de color. |
| **Logros y marcos** | 368 logros (uno por materia clave), marcos animados únicos para el avatar y rangos por % de carrera. |
| **Comunidad** | Chat General y por carrera, estudiantes y amigos, chat privado, grupos con administradores propios, "en línea", avisos y silenciar chats. |
| **Moderación** | Dueño y moderadores, filtro de malas palabras, reportes, vaciar chats, eliminar usuarios, marcos y artículos exclusivos del equipo. |

El detalle completo está en [`docs/FEATURES.md`](docs/FEATURES.md).

## Pruébalo en tu computador (2 minutos)

Necesitas **Node.js 22.5 o superior** (recomendado 24; ver `.nvmrc`). No hay que instalar nada más: el proyecto no tiene dependencias.

```bash
git clone <URL-de-este-repositorio>
cd malla-utesa
npm run dev        # http://localhost:5190  (elige usuario en /dev.html)
npm test           # pruebas del servidor
npm run check      # sintaxis de todo el JavaScript + escaneo de secretos
```

`npm run dev` levanta la app completa **sin Cloudflare, Firebase ni cuentas**: usa el servidor real (`app/_worker.js`) con una
base SQLite en memoria, Firebase simulado y un portal de UTESA falso. Detalles en [`docs/TESTING.md`](docs/TESTING.md).

## Cómo está organizado

```
app/                  ← LO QUE SE PUBLICA (Cloudflare Pages). Todo lo demás no sale a Internet.
  _worker.js          API completa (un solo archivo, sin dependencias) + sirve los archivos estáticos
  _routes.json        el worker solo se ejecuta en /api/*; lo demás lo sirve Cloudflare gratis
  index.html …        páginas (login, perfil, panel, chat, restablecer contraseña, cuenta eliminada)
  js/ css/ assets/    módulos ES nativos (sin build), estilos y pénsums en PDF
docs/                 documentación (arquitectura, API, datos, despliegue, privacidad, hoja de ruta…)
tests/                pruebas del servidor (corren contra el worker real, sin Cloudflare)
tools/                herramientas: servidor de desarrollo, regenerar datos del worker, revisión de sintaxis
firebase/             reglas de Firestore (se publican a mano en la consola de Firebase)
legacy/netlify/       respaldo antiguo en Netlify (no se usa en producción)
.github/              CI, despliegue automático y plantillas de issues y PR
AGENTS.md             guía para IAs (léela antes de pedirle cambios a un asistente)
```

## Flujo de trabajo: GitHub es donde se trabaja

```
 rama / fork ──► Pull Request ──► CI (revisión + pruebas) ──► merge a main ──► despliegue automático a Cloudflare Pages
```

* **`main` = producción.** Cada merge a `main` publica en https://malla-utesa.pages.dev (mismo proyecto, mismo dominio).
* Los cambios se hacen en ramas y entran por **Pull Request**; el CI debe pasar en verde.
* Guía paso a paso en [`CONTRIBUTING.md`](CONTRIBUTING.md). El despliegue está explicado en [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Trabajar con IAs (Claude, ChatGPT, Copilot…)

Este repositorio está pensado para que una IA pueda ayudarte sin romper nada:

1. Pásale **`AGENTS.md`** (o déjala leerlo; Claude Code lo carga solo vía `CLAUDE.md`). Resume la arquitectura, los comandos y las reglas.
2. Pídele cambios pequeños y claros. Plantillas de instrucciones en [`docs/AI-WORKFLOW.md`](docs/AI-WORKFLOW.md).
3. Antes de aceptar su trabajo: `npm run check && npm test`, y pruébalo con `npm run dev`.

## Documentación

| Documento | Para qué sirve |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Reglas y mapa del proyecto para IAs |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Cómo colaborar (ramas, PR, estilo) |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Cómo funciona por dentro |
| [`docs/API.md`](docs/API.md) | Todas las rutas de `/api/*` |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | Tablas de D1, documentos de Firestore, salas del chat |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | Cloudflare, GitHub Actions, secretos, reversa |
| [`docs/TESTING.md`](docs/TESTING.md) | Pruebas y entorno local |
| [`docs/FEATURES.md`](docs/FEATURES.md) | Qué hace la app, función por función |
| [`docs/PRIVACY-AND-DATA.md`](docs/PRIVACY-AND-DATA.md) | Qué datos se guardan y riesgos conocidos |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Ideas, deuda técnica y trabajo pendiente |
| [`docs/AI-WORKFLOW.md`](docs/AI-WORKFLOW.md) | Cómo pedirle cosas a una IA |
| [`docs/CHANGELOG-FEATURES.md`](docs/CHANGELOG-FEATURES.md) | Historia de decisiones y funciones (bitácora original) |
| [`SECURITY.md`](SECURITY.md) | Secretos, qué es público y cómo reportar fallos |

## Contacto

Reportes, errores y sugerencias: WhatsApp +1 829 642 2334 (también hay un botón dentro de la app).
