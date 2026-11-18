// settings.js
// Ventana de Configuración: perfil (foto y nombre), tema, cuenta de UTESA,
// contraseña, carrera/progreso y cierre de sesión.
// No guarda estado propio: lee y modifica al usuario a través de la "api" que le pasa dashboard.js.

import { auth } from "./firebase-config.js";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { PENSUMS } from "./pensums-data.js";
import { buildThemePicker, setLocalTheme } from "./theme.js";
import { avatarSvg, buildCharacterEditor } from "./avatars.js";
import { achievementsForPensum, TIERS, GLYPHS } from "./achievements.js";
import { framedAvatar, MOD_FRAMES, MOD_BY_ID } from "./frames.js";
import { rankCardHtml } from "./ranks.js";
import { isOn as chatNotifOn, turnOn as chatNotifOn_, turnOff as chatNotifOff } from "./chat-prefs.js";
import { openModal, closeModal } from "./modal.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

/** Botón de dos pasos: el primer toque pide confirmar, el segundo ejecuta (se desarma a los 4 s). */
function twoStep(btn, armedLabel, action) {
  if (btn.dataset.armed) {
    clearTimeout(btn.__t);
    delete btn.dataset.armed;
    btn.textContent = btn.dataset.label;
    btn.classList.remove("is-armed");
    action();
    return;
  }
  btn.dataset.label = btn.textContent;
  btn.dataset.armed = "1";
  btn.textContent = armedLabel;
  btn.classList.add("is-armed");
  btn.__t = setTimeout(() => {
    delete btn.dataset.armed;
    btn.textContent = btn.dataset.label;
    btn.classList.remove("is-armed");
  }, 4000);
}

function setMsg(el, text) {
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("show", !!text);
}

export function initSettings(api) {
  let pendingCareerKey = null;

  /* ---------- Cabecera de perfil ---------- */
  function renderProfile() {
    const u = api.getUser();
    const p = api.getPensum();
    const av = $("set-avatar");
    av.className = "set-avatar" + (u.avatar ? " has-avatar" : "");
    if (u.avatar) { av.style.background = "none"; av.innerHTML = framedAvatar(u.avatar, u.avatarBg || null, u.frame || null, 72); }
    else { av.style.background = p.color; av.textContent = p.key; }
    $("set-profile-name").textContent = u.name || "";
    const email = api.getEmail();
    $("set-profile-email").textContent = email || "";
    $("set-profile-email").hidden = !email;
    const chip = $("set-profile-career");
    chip.textContent = `${p.nombre}`;
    chip.style.setProperty("--chip", p.color);
  }

  /* ---------- Personaje (foto de perfil) ---------- */
  let editor = null;
  let draft = null;

  function setEditorOpen(open) {
    $("avatar-editor").hidden = !open;
    const btn = $("set-avatar-toggle");
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "Cerrar" : "Personalizar";
    if (open) {
      const u = api.getUser();
      draft = null;
      $("avatar-save").disabled = true;
      editor?.destroy();
      editor = buildCharacterEditor($("avatar-host"), { avatar: u.avatar || null, bg: u.avatarBg || null }, (st) => {
        draft = st;
        $("avatar-save").disabled = false;
      }, { admin: !!u.admin });
      $("avatar-editor").scrollIntoView({ block: "nearest", behavior: "smooth" });
    } else {
      editor?.destroy();
      editor = null;
      draft = null;
    }
  }

  async function saveAvatar() {
    if (!draft) return;
    const btn = $("avatar-save");
    btn.disabled = true;
    try {
      await api.saveUser({ avatar: draft.avatar, avatarBg: draft.bg });
      const u = api.getUser();
      u.avatar = draft.avatar;
      u.avatarBg = draft.bg;
      api.refreshHeader();
      renderProfile();
      renderFrames();
      setEditorOpen(false);
      api.toast("Personaje guardado ✓");
    } catch {
      btn.disabled = false;
      api.toast("No se pudo guardar el personaje. Revisa tu conexión.");
    }
  }

  /* ---------- Nombre ---------- */
  async function saveName() {
    const btn = $("set-name-save");
    const msg = $("set-name-msg");
    const name = $("set-name-in").value.trim().replace(/\s+/g, " ");
    setMsg(msg, "");
    if (!name) return setMsg(msg, "Escribe tu nombre para continuar.");
    if (name === (api.getUser().name || "")) return api.toast("Ese ya es tu nombre.");
    btn.disabled = true;
    const label = btn.textContent;
    btn.innerHTML = '<span class="spinner" style="border-top-color:#fff;"></span>';
    try {
      await api.saveUser({ name });
      api.getUser().name = name;
      api.refreshHeader();
      renderProfile();
      api.toast("Nombre actualizado ✓");
    } catch (e) {
      setMsg(msg, (e && e.serverMessage) || "No se pudo guardar el nombre. Intenta de nuevo.");
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  /* ---------- Tema ---------- */
  function renderTheme() {
    buildThemePicker($("set-theme"), async (themeId) => {
      setLocalTheme(themeId);
      try { await api.saveUser({ theme: themeId }); api.toast("Tema guardado ✓"); }
      catch { api.toast("No se pudo guardar el tema, pero se aplicó en este dispositivo."); }
    });
  }

  /* ---------- Cuenta de UTESA ---------- */
  function renderUtesa() {
    const sync = api.getUser().utesaSync;
    const status = $("set-utesa-status");
    const actions = $("set-utesa-actions");
    if (sync) {
      const when = new Date(sync.at).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" }).replace(/\.$/, "");
      status.innerHTML = `<span class="set-dot ok"></span><b>Vinculada con UTESA.</b> Última sincronización: ${esc(when)}. Tu avance viene de UTESA.`;
      actions.innerHTML = `
        <button type="button" class="btn btn-primary btn-sm" data-set-utesa>Sincronizar ahora</button>
        <button type="button" class="btn btn-ghost btn-sm" id="set-unlink">Desvincular</button>`;
    } else {
      status.innerHTML = `<span class="set-dot"></span><b>Sin vincular.</b> Marcas tus materias a mano (modo manual). Vincula tu cuenta para traer tu avance real de UTESA.`;
      actions.innerHTML = `<button type="button" class="btn btn-primary btn-sm" data-set-utesa>Vincular con UTESA</button>`;
    }
  }

  /* ---------- Contraseña ---------- */
  function renderPassword() {
    const section = $("pw-section");
    const hasPassword = auth.currentUser?.providerData?.some(p => p.providerId === "password");
    if (!hasPassword) {
      section.innerHTML = `
        <h4 class="set-title">Contraseña</h4>
        <p class="set-text">Iniciaste sesión con Google, así que aquí no manejas una contraseña. Cámbiala desde tu cuenta de Google.</p>`;
      return;
    }
    section.innerHTML = `
      <h4 class="set-title">Contraseña</h4>
      <div class="field"><input class="input" type="password" id="set-pw-current" placeholder="Contraseña actual" autocomplete="current-password" aria-label="Contraseña actual"></div>
      <div class="field"><input class="input" type="password" id="set-pw-new" placeholder="Nueva contraseña (mínimo 6 caracteres)" autocomplete="new-password" aria-label="Nueva contraseña"></div>
      <div class="field"><input class="input" type="password" id="set-pw-new2" placeholder="Repite la nueva contraseña" autocomplete="new-password" aria-label="Repite la nueva contraseña"></div>
      <label class="set-check"><input type="checkbox" id="set-pw-show"> Mostrar contraseñas</label>
      <div class="set-row set-actions">
        <button class="btn btn-primary btn-sm" id="set-pw-save">Actualizar contraseña</button>
        <button type="button" class="btn btn-ghost btn-sm" id="set-pw-forgot">Restablecer por correo</button>
      </div>
      <div class="err-box" id="set-pw-msg"></div>
      <div class="hint-box" id="set-pw-hint"></div>`;
  }

  async function savePassword() {
    const btn = $("set-pw-save");
    const msg = $("set-pw-msg"), hint = $("set-pw-hint");
    setMsg(msg, ""); hint.classList.remove("show");
    const current = $("set-pw-current").value, next = $("set-pw-new").value, next2 = $("set-pw-new2").value;
    if (!current) return setMsg(msg, "Escribe tu contraseña actual.");
    if (next.length < 6) return setMsg(msg, "La nueva contraseña debe tener al menos 6 caracteres.");
    if (next === current) return setMsg(msg, "La nueva contraseña debe ser distinta de la actual.");
    if (next !== next2) return setMsg(msg, "Las contraseñas nuevas no coinciden.");
    btn.disabled = true;
    const label = btn.textContent;
    btn.innerHTML = '<span class="spinner" style="border-top-color:#fff;"></span>';
    try {
      await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, current));
      await updatePassword(auth.currentUser, next);
      hint.textContent = "Contraseña actualizada correctamente ✓";
      hint.classList.add("show");
      ["set-pw-current", "set-pw-new", "set-pw-new2"].forEach(id => { $(id).value = ""; });
      api.toast("Contraseña actualizada ✓");
    } catch (e) {
      const map = {
        "auth/wrong-password": "Tu contraseña actual no es correcta.",
        "auth/invalid-credential": "Tu contraseña actual no es correcta.",
        "auth/weak-password": "La nueva contraseña es muy débil.",
        "auth/too-many-requests": "Demasiados intentos. Espera un momento e intenta de nuevo.",
        "auth/requires-recent-login": "Por seguridad, cierra sesión, vuelve a entrar e inténtalo de nuevo.",
      };
      setMsg(msg, map[e.code] || "No se pudo actualizar la contraseña. Intenta de nuevo.");
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  async function sendReset() {
    const btn = $("set-pw-forgot");
    const msg = $("set-pw-msg"), hint = $("set-pw-hint");
    const email = auth.currentUser?.email;
    if (!email) return;
    setMsg(msg, ""); hint.classList.remove("show");
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Enviando…";
    try {
      await sendPasswordResetEmail(auth, email, {
        url: `${window.location.origin}${window.location.pathname.replace(/dashboard\.html$/, "")}reset-password.html`,
        handleCodeInApp: true,
      });
      hint.textContent = `Te enviamos un correo a ${email} con instrucciones. Revisa también la carpeta de spam.`;
      hint.classList.add("show");
      api.toast("Correo de restablecimiento enviado ✓");
    } catch {
      setMsg(msg, "No se pudo enviar el correo. Intenta de nuevo en un momento.");
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  /* ---------- Carrera y progreso ---------- */
  function renderCareer() {
    const p = api.getPensum();
    const select = $("set-career-select");
    select.innerHTML = Object.values(PENSUMS)
      .map(c => `<option value="${c.key}"${c.key === p.key ? " selected" : ""}>${esc(c.nombre)} (${c.key})</option>`).join("");
    updateCareerPreview();
    $("set-reset-progress").hidden = api.getDoneCount() === 0;
  }

  function updateCareerPreview() {
    const p = api.getPensum();
    const select = $("set-career-select");
    const sel = PENSUMS[select.value] || p;
    const badge = $("set-career-badge");
    badge.style.background = sel.color;
    badge.textContent = sel.key;
    $("set-career-hint").textContent = sel.key === p.key
      ? `Tu carrera actual: ${p.titulo} · ${p.totalCreditos} créditos.`
      : `Cambiar a ${sel.nombre} (${sel.titulo}) borrará tu progreso actual y empezarás desde cero.`;
  }

  function askCareerChange(key) {
    const p = PENSUMS[key];
    if (!p) return;
    pendingCareerKey = key;
    $("career-confirm-name").textContent = `${p.nombre} (${p.key})`;
    $("career-confirm-count").textContent = api.getDoneCount();
    openModal("career-confirm-overlay");
  }

  async function applyCareerChange() {
    if (!pendingCareerKey) return;
    const key = pendingCareerKey;
    const btn = $("career-confirm-ok");
    const label = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="border-top-color:#fff;"></span>';
    try {
      await api.changeCareer(key);
      pendingCareerKey = null;
      closeModal("career-confirm-overlay");
      closeModal("settings-overlay");
    } catch {
      api.toast("No se pudo cambiar de carrera. Revisa tu conexión e intenta de nuevo.");
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  /* ---------- Marcos y logros ---------- */
  const glyphIcon = (g) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[g] || ""}</svg>`;

  let frameFilter = "all";
  function renderFrames() {
    const u = api.getUser();
    const earned = new Set(u.earned || []);
    const full = achievementsForPensum(api.getPensum())
      .sort((a, b) => (earned.has(b.id) - earned.has(a.id)) || b.tier - a.tier || a.name.localeCompare(b.name, "es"));
    const list = full.filter(a => frameFilter === "all" || (frameFilter === "earned") === earned.has(a.id));
    document.querySelectorAll("#set-frames-filter [data-ff]").forEach(b => b.classList.toggle("is-on", b.dataset.ff === frameFilter));
    const verified = !!u.verifiedAt;
    const have = full.filter(a => earned.has(a.id)).length;

    $("set-frames-intro").innerHTML = verified && u.needsRelink
      ? `Tus logros se verificaron antes de que agregáramos los nuevos, así que <strong>faltan los más recientes</strong>. Vuelve a vincular con UTESA <strong>una sola vez</strong> y se actualizan solos, y de ahí en adelante cada logro nuevo te aparece sin hacer nada. <button type="button" class="link-btn" data-open-utesa>Vincular ahora</button>`
      : verified
      ? `Tienes <strong>${have} de ${full.length}</strong> logros de tu carrera. Se verificaron el ${new Date(u.verifiedAt).toLocaleDateString("es-DO", { day: "numeric", month: "long" })}${u.verifiedVia === "bookmark" ? " con el marcador" : ""}; vuelve a vincular con UTESA para actualizarlos.`
      : `Cada materia clave que apruebas desbloquea un marco para tu avatar. <strong>Solo cuentan si vinculas con el botón de UTESA</strong> (inicias sesión en la página oficial y la app lee tu avance): el modo manual no los desbloquea. <button type="button" class="link-btn" data-open-utesa>Vincular ahora</button>`;

    const cur = u.frame ? (full.find(a => a.id === u.frame) || MOD_BY_ID[u.frame] || null) : null;
    $("set-frames-equipped").innerHTML = `
      ${framedAvatar(u.avatar, u.avatarBg || null, u.frame || null, 84)}
      <div class="fr-equipped-info">
        <strong>${cur ? esc(cur.name) : "Sin marco"}</strong>
        <span class="muted">${cur ? esc(cur.flavor) : "Elige uno de tus logros para equiparlo."}</span>
        ${cur ? '<button type="button" class="btn btn-ghost btn-sm" data-frame-off>Quitar marco</button>' : ""}
      </div>`;

    const modBlock = u.admin ? `<div class="ach-mod-head"><strong>🛡️ Marcos exclusivos del equipo de moderación</strong><span>Solo los ven y equipan el dueño y los moderadores.</span></div>${MOD_FRAMES.map(m => {
      const on = u.frame === m.id;
      return `<div class="ach is-earned is-mod ${on ? "is-on" : ""}" data-tier="mod">
        <div class="ach-art">${framedAvatar(u.avatar, u.avatarBg || null, m.id, 64)}</div>
        <div class="ach-info"><strong>${esc(m.name)}</strong><span class="ach-sub">${esc(m.flavor)}</span><span class="ach-tier">Exclusivo · Moderación</span></div>
        <button type="button" class="btn ${on ? "btn-ghost" : "btn-primary"} btn-sm" data-frame="${esc(m.id)}" ${on ? "disabled" : ""}>${on ? "Equipado" : "Equipar"}</button>
      </div>`;
    }).join("")}<div class="ach-mod-head is-sub"><strong>Logros por materias</strong></div>` : "";
    $("set-frames-grid").innerHTML = modBlock + (!list.length ? `<p class="muted" style="font-size:13px;padding:10px 4px">${frameFilter === "earned" ? "Aún no tienes logros verificados." : "¡Ganaste todos los logros!"}</p>` : list.map(a => {
      const t = TIERS[a.tier];
      const has = earned.has(a.id);
      const on = u.frame === a.id;
      return `<div class="ach ${has ? "is-earned" : "is-locked"} ${on ? "is-on" : ""}" data-tier="${t.id}">
        <div class="ach-art">${framedAvatar(u.avatar, u.avatarBg || null, a.id, 64)}</div>
        <div class="ach-info">
          <strong>${esc(a.name)}</strong>
          <span class="ach-sub">${glyphIcon(a.glyph)} ${esc(a.subject)} · ${esc(a.code)}</span>
          <span class="ach-tier">${t.name}</span>
        </div>
        ${has
          ? `<button type="button" class="btn ${on ? "btn-ghost" : "btn-primary"} btn-sm" data-frame="${esc(a.id)}" ${on ? "disabled" : ""}>${on ? "Equipado" : "Equipar"}</button>`
          : `<span class="ach-lock" title="Aprueba ${esc(a.subject)} y vincula con tu matrícula"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></span>`}
      </div>`;
    }).join(""));
  }

  async function equipFrame(id) {
    const u = api.getUser();
    const prev = u.frame || null;
    u.frame = id;
    renderFrames(); api.refreshHeader();
    try {
      await api.saveUser({ frame: id });
      api.toast(id ? "Marco equipado ✓" : "Marco quitado");
    } catch {
      u.frame = prev;
      renderFrames(); api.refreshHeader();
      api.toast("No se pudo guardar el marco. Vincula con UTESA y vuelve a intentar.");
    }
  }

  $("frames-section")?.addEventListener("click", (e) => {
    const ff = e.target.closest("[data-ff]");
    if (ff) { frameFilter = ff.dataset.ff; return renderFrames(); }
    const eq = e.target.closest("[data-frame]");
    if (eq && !eq.disabled) return equipFrame(eq.dataset.frame);
    if (e.target.closest("[data-frame-off]")) return equipFrame(null);
  });

  /* ---------- Avisos del chat ---------- */
  const notifBox = $("set-chat-notif");
  notifBox?.addEventListener("change", () => { notifBox.checked ? chatNotifOn_() : chatNotifOff(); });
  window.addEventListener("chat-prefs", () => { if (notifBox) notifBox.checked = chatNotifOn(); });

  const onlBox = $("set-show-online");
  onlBox?.addEventListener("change", async () => {
    onlBox.disabled = true;
    try { await api.saveUser({ hideOnline: !onlBox.checked }); api.toast(onlBox.checked ? "Tus amigos verán cuándo estás en línea ✓" : "Ya no muestras cuándo estás en línea ✓"); }
    catch { onlBox.checked = !onlBox.checked; api.toast("No se pudo guardar. Intenta de nuevo."); }
    onlBox.disabled = false;
  });
  const dirBox = $("set-dir-visible");
  dirBox?.addEventListener("change", async () => {
    dirBox.disabled = true;
    try { await api.saveUser({ dirHidden: !dirBox.checked }); api.toast(dirBox.checked ? "Apareces en el directorio ✓" : "Ya no apareces en el directorio ✓"); }
    catch { dirBox.checked = !dirBox.checked; api.toast("No se pudo guardar. Intenta de nuevo."); }
    dirBox.disabled = false;
  });

  /* ---------- Abrir ---------- */
  function openSettings() {
    if (notifBox) notifBox.checked = chatNotifOn();
    if (dirBox) dirBox.checked = !api.getUser().dirHidden;
    if (onlBox) onlBox.checked = !api.getUser().hideOnline;
    $("set-name-in").value = api.getUser().name || "";
    setMsg($("set-name-msg"), "");
    setEditorOpen(false);
    renderProfile();
    $("set-rank").innerHTML = rankCardHtml(api.getUser().pct ?? null, { own: true });
    renderFrames();
    renderTheme();
    renderUtesa();
    renderPassword();
    renderCareer();
    $("set-logout").hidden = false;
    openModal("settings-overlay");
  }

  /* ---------- Eventos (una sola vez) ---------- */
  $("btn-settings")?.addEventListener("click", openSettings);

  const root = $("settings-overlay");
  root.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("#set-avatar-toggle")) setEditorOpen($("avatar-editor").hidden);
    else if (t.closest("#avatar-cancel")) setEditorOpen(false);
    else if (t.closest("#avatar-save")) saveAvatar();
    else if (t.closest("#set-name-save")) saveName();
    else if (t.closest("[data-set-utesa]")) {
      closeModal("settings-overlay");
      $("btn-utesa")?.click();
    } else if (t.closest("#set-unlink")) {
      twoStep(t.closest("#set-unlink"), "¿Seguro? Toca otra vez", async () => {
        try { await api.unlink(); renderUtesa(); } catch { api.toast("No se pudo desvincular. Intenta de nuevo."); }
      });
    } else if (t.closest("#set-pw-save")) savePassword();
    else if (t.closest("#set-pw-forgot")) sendReset();
    else if (t.closest("#set-reset-progress")) {
      twoStep(t.closest("#set-reset-progress"), "¿Borrar todo mi avance? Toca otra vez", async () => {
        try { await api.resetProgress(); renderCareer(); } catch { api.toast("No se pudo reiniciar. Intenta de nuevo."); }
      });
    } else if (t.closest("#set-logout")) api.signOut();
  });
  root.addEventListener("change", (e) => {
    if (e.target.id === "set-pw-show") {
      ["set-pw-current", "set-pw-new", "set-pw-new2"].forEach(id => { const i = $(id); if (i) i.type = e.target.checked ? "text" : "password"; });
    } else if (e.target.id === "set-career-select") {
      updateCareerPreview();
      const key = e.target.value;
      if (key && key !== api.getPensum().key) askCareerChange(key);
    }
  });
  $("set-name-in").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveName(); } });

  // ventana de confirmación de carrera
  $("career-confirm-ok").addEventListener("click", applyCareerChange);
  $("career-confirm-overlay").addEventListener("modal:closed", () => {
    // si se cancela (botón, fondo o Esc), el selector vuelve a mostrar la carrera actual
    if (!pendingCareerKey) return;
    pendingCareerKey = null;
    $("set-career-select").value = api.getPensum().key;
    updateCareerPreview();
  });
}
