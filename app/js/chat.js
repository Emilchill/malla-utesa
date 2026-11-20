// chat.js — página completa de la comunidad (chat.html). Es la misma pieza que el cuadro del panel.
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { applyTheme, getLocalTheme } from "./theme.js";
import { framedAvatar } from "./frames.js";
import { loadUser } from "./store.js";
import { initModals } from "./modal.js";
import { createChat } from "./chat-core.js";
import { bindBell } from "./chat-prefs.js";
import { revealApp } from "./motion.js";

const $ = (id) => document.getElementById(id);

onAuthStateChanged(auth, async (user) => {
  if (!user) { location.href = "index.html"; return; }
  let data;
  try { data = await loadUser(); } catch {
    document.body.innerHTML = '<p style="font:16px system-ui;padding:32px;text-align:center">No pudimos cargar tus datos. <a href="">Recarga la página</a>.</p>';
    return;
  }
  if (!data) { location.href = "profile.html"; return; }
  applyTheme(data.theme || getLocalTheme());
  initModals();
  bindBell($("chat-bell"));
  $("chat-me").innerHTML = framedAvatar(data.avatar, data.avatarBg, data.frame, 36);
  revealApp(); // el esqueleto se desvanece
  const base = document.title;
  const chat = createChat({
    root: $("chat-root"),
    me: { pid: data.pid, career: data.career, admin: !!data.admin, owner: !!data.owner, name: data.name },
    isVisible: () => !document.hidden,
    onUnread: (n) => { document.title = (n ? `(${n}) ` : "") + base; },
  });
  chat.show();
});
