# Cómo colaborar

¡Gracias por ayudar! Este proyecto es de estudiantes para estudiantes. Esta guía te lleva de cero a tu primer Pull Request.

## 1. Preparar tu computador

1. Instala **Git** y **Node.js 22.5 o superior** (recomendado 24). Mira `.nvmrc`.
2. Pide acceso al repositorio (es **privado**) al dueño, @Emilchill, y acepta la invitación.
3. Clona y arranca:

```bash
git clone <URL-del-repositorio>
cd malla-utesa
npm test          # debe terminar en TODO OK
npm run dev       # http://localhost:5190  → elige usuario en /dev.html
```

No necesitas cuentas de Cloudflare ni Firebase ni claves: el entorno local trae todo simulado.

## 2. Haz tu cambio

```bash
git switch main && git pull
git switch -c tipo/descripcion-corta      # ejemplos: fix/chat-no-leidos · feat/vista-previa-chat · docs/api
```

* Cambios **pequeños y enfocados** (una idea por Pull Request).
* Lee `AGENTS.md`: tiene las reglas del proyecto (seguridad, un solo archivo de worker, español, móvil primero).
* Si usas una IA, mira `docs/AI-WORKFLOW.md` (plantillas y lista de revisión).
* Prueba en teléfono y PC (herramientas del navegador, modo móvil) y en los temas oscuros.

## 3. Verifica

```bash
npm run check && npm test
```

Si tocaste datos de logros, materias o malas palabras: `npm run build:data` y sube también `app/_worker.js`.

## 4. Commit y Pull Request

```bash
git add -A
git commit -m "fix(chat): marca como leído al abrir un grupo"
git push -u origin tipo/descripcion-corta
```

Abre el Pull Request en GitHub contra `main` y llena la plantilla. El CI correrá `check` y `test`; debe quedar en verde.
Alguien (@Emilchill) revisa y hace el merge. **Al hacer merge a `main` se publica solo** en https://malla-utesa.pages.dev, así que el PR debe estar probado.

### Mensajes de commit
`tipo(área): qué cambió` en español, en presente. Tipos: `feat`, `fix`, `docs`, `style` (solo estilos), `refactor`, `test`, `chore`.

## 5. Reglas de oro

* **Cero secretos en el repo** (tokens, contraseñas, `.env`, datos reales de estudiantes). Si pegaste uno por error, avisa **ya** para rotarlo.
* **El servidor manda**: los permisos se comprueban en `app/_worker.js`.
* **No push directo a `main`.** Todo entra por Pull Request.
* **Respeto**: es una comunidad estudiantil; los textos de la app son cercanos y respetuosos.

## 6. Ideas para empezar

Mira `docs/ROADMAP.md` (hay tareas de todos los tamaños) o los issues etiquetados `good first issue`.

## Reportar un error o proponer algo

Abre un **Issue** con la plantilla correspondiente (error / idea). Para algo urgente: WhatsApp +1 829 642 2334.
