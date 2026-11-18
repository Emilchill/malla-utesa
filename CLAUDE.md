# Malla UTESA — instrucciones para Claude Code

Las reglas completas para cualquier IA están en **[AGENTS.md](AGENTS.md)**. Léelo primero y síguelo.

Resumen mínimo:
- Código de la web en `app/` (sin build, módulos ES). Backend: `app/_worker.js` (un solo archivo, sin imports).
- Antes de proponer cambios: `npm run check && npm test`.
- Si tocas logros, pénsum o malas palabras: `npm run build:data` y commitea `app/_worker.js`.
- Nunca subas secretos. Trabaja en una rama y abre Pull Request; `main` se despliega solo a producción.
