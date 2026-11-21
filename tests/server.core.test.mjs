// tests/server.core.test.mjs — usuarios, perfiles, logros, marcos, chat (público), moderación, historial y borrado total.
import { sq, env, ok, prof, sleep, call, tok, w, H, allIsc, approved, PENSUMS, b, finish } from "./harness.mjs";


for (const [u, n, c] of [["ana", "Ana Pérez", "ISC"], ["bob", "Bob Díaz", "ISC"], ["cat", "Cat Ruiz", "DER"], ["admin1", "Moderador", "ISC"]]) await call("PUT", "/api/user", tok(u), prof(n, c));
let r = await call("GET", "/api/user", tok("ana"));
ok("GET user trae pid y earned vacío", r[0] === 200 && /^[0-9a-f]{16}$/.test(r[1].user.pid) && r[1].user.earned.length === 0, r);
const anaPid = r[1].user.pid;
r = await call("PUT", "/api/user", tok("ana"), { fields: { frame: "MAT-360" } });
ok("equipar sin verificar -> 403", r[0] === 403, r);

r = await call("POST", "/api/utesa-login", tok("ana"), { matricula: "1000000", recinto: "UTSAN", password: "x" }, "2.2.2.2");
ok("login directo verifica y da logros", r[0] === 200 && r[1].verified && r[1].verified.earned.includes("MAT-360") && r[1].verified.earned.includes("INF-164"), r);
ok("no desbloquea lo pendiente", !r[1].verified.earned.includes("INF-502") && !r[1].verified.earned.includes("DPG-020"), r[1].verified && r[1].verified.earned);
ok("no cuenta materias de DER para ISC", !r[1].verified.earned.some(c => c.startsWith("DER")), r[1].verified && r[1].verified.earned);
r = await call("PUT", "/api/user", tok("ana"), { fields: { frame: "MAT-360" } });
ok("equipar Calculo IV ganado -> 200", r[0] === 200, r);
r = await call("PUT", "/api/user", tok("ana"), { fields: { frame: "INF-502" } });
ok("equipar uno NO ganado -> 403", r[0] === 403, r);
r = await call("PUT", "/api/user", tok("ana"), { fields: { frame: "NOEXISTE" } });
ok("marco inexistente -> 400", r[0] === 400, r);
r = await call("GET", "/api/user", tok("ana"));
ok("GET muestra frame y earned", r[1].user.frame === "MAT-360" && r[1].user.earned.length > 3, r[1].user);

r = await call("POST", "/api/utesa-login", null, { matricula: "1000000", recinto: "UTSAN", password: "x" }, "3.3.3.3");
ok("login sin token -> 401 (no sirve de intermediario sin sesión de la app)", r[0] === 401 && r[1].code === "sesion", r);
r = await call("POST", "/api/utesa-login", "token-falso", { matricula: "1000000", recinto: "UTSAN", password: "x" }, "3.3.3.4");
ok("login con token inválido -> 401", r[0] === 401 && r[1].code === "sesion", r);
{
  let n429 = 0, calls = 0; // límite por cuenta: 10 intentos por hora aunque cambien matrícula e IP
  for (let i = 0; i < 12; i++) {
    const x = await call("POST", "/api/utesa-login", tok("hugo"), { matricula: String(5000000 + i), recinto: "UTSAN", password: "x" }, "6.6." + i + ".1");
    calls++; if (x[0] === 429) n429++;
  }
  ok("límite por cuenta: tras 10 intentos/hora responde 429", calls === 12 && n429 === 2, { calls, n429 });
}
r = await call("POST", "/api/utesa-login", tok("cat"), { matricula: "2000000", recinto: "UTSAN", password: "x" }, "4.4.4.4");
ok("DER vinculando pensum ISC -> sin logros", r[0] === 200 && r[1].verified.mismatch === true && r[1].verified.earned.length === 0, r[1].verified);
await call("PUT", "/api/user", tok("ana"), { fields: { career: "IEL" } });
r = await call("GET", "/api/user", tok("ana"));
ok("cambiar de carrera borra logros y marco", r[1].user.earned.length === 0 && r[1].user.frame === null, r[1].user);
await call("PUT", "/api/user", tok("ana"), { fields: { career: "ISC" } });

r = await call("GET", "/api/chat?room=general", tok("ana"));
ok("chat general vacio", r[0] === 200 && r[1].messages.length === 0, r);
r = await call("POST", "/api/chat", tok("ana"), { room: "general", text: "  Hola   a todos  " });
ok("enviar mensaje", r[0] === 200, r);
r = await call("POST", "/api/chat", tok("ana"), { room: "general", text: "otra" });
ok("antispam: muy rapido -> 429", r[0] === 429, r);
await sleep(1300);
r = await call("POST", "/api/chat", tok("bob"), { room: "carrera", text: "Hola ISC" });
ok("bob escribe en su carrera", r[0] === 200, r);
r = await call("POST", "/api/chat", tok("cat"), { room: "carrera", text: "Hola DER" });
ok("cat escribe en carrera DER", r[0] === 200, r);
r = await call("GET", "/api/chat?room=carrera", tok("ana"));
ok("ana solo ve carrera ISC", r[0] === 200 && r[1].messages.length === 1 && r[1].messages[0].text === "Hola ISC" && r[1].messages[0].career === "ISC", r[1].messages);
r = await call("GET", "/api/chat?room=carrera", tok("cat"));
ok("cat solo ve carrera DER", r[1].messages.length === 1 && r[1].messages[0].text === "Hola DER", r[1].messages);
r = await call("GET", "/api/chat?room=c:DER", tok("ana"));
ok("sala ajena por nombre -> 400", r[0] === 400, r);
r = await call("GET", "/api/chat?room=general", tok("bob"));
ok("general: texto limpio, nombre real", r[1].messages[0].text === "Hola a todos" && r[1].messages[0].name === "Ana Pérez", r[1].messages);
ok("general: el mensaje trae el marco (si lo tenia equipado)", "frame" in r[1].messages[0], r[1].messages);
const lastId = r[1].messages[0].id;
r = await call("POST", "/api/chat", tok("ana"), { room: "general", text: "x".repeat(501) });
ok("texto largo -> 400", r[0] === 400, r);
r = await call("GET", `/api/chat?room=general&after=${lastId}`, tok("bob"));
ok("after devuelve solo nuevos", r[1].messages.length === 0, r);

r = await call("GET", "/api/profile?pid=" + anaPid, tok("bob"));
ok("perfil publico con nombre/logros, sin datos privados", r[0] === 200 && r[1].profile.name === "Ana Pérez" && !("done" in r[1].profile) && !("uid" in r[1].profile), r[1]);
r = await call("POST", "/api/chat/block", tok("bob"), { pid: anaPid, on: true });
ok("bloquear", r[0] === 200, r);
r = await call("GET", "/api/chat?room=general", tok("bob"));
ok("bob ya no ve mensajes de Ana", r[1].messages.length === 0, r[1].messages);
r = await call("GET", "/api/chat?room=general", tok("cat"));
ok("cat si los ve", r[1].messages.length === 1, r[1].messages);
await call("POST", "/api/chat/block", tok("bob"), { pid: anaPid, on: false });

r = await call("POST", "/api/chat/report", tok("bob"), { id: lastId, reason: "spam" });
ok("reportar", r[0] === 200, r);
r = await call("GET", "/api/chat/reports", tok("bob"));
ok("reportes: no admin -> 403", r[0] === 403, r);
r = await call("GET", "/api/chat/reports", tok("admin1"));
ok("reportes: admin ve 1", r[0] === 200 && r[1].reports.length === 1 && r[1].reports[0].text === "Hola a todos", r);
r = await call("DELETE", `/api/chat?id=${lastId}`, tok("bob"));
ok("bob no borra mensaje ajeno -> 403", r[0] === 403, r);
r = await call("DELETE", `/api/chat?id=${lastId}`, tok("admin1"));
ok("admin oculta mensaje", r[0] === 200, r);
r = await call("GET", "/api/chat?room=general", tok("bob"));
ok("mensaje oculto: ahora deja rastro (sin texto)", r[1].messages.length === 1 && r[1].messages[0].hidden === "mod" && r[1].messages[0].text === "", r[1].messages);
r = await call("GET", `/api/chat?room=general&after=${lastId + 100}&since=1`, tok("bob"));
ok("borrados en vivo: 'removed' incluye el mensaje oculto", r[0] === 200 && r[1].removed.includes(lastId) && typeof r[1].now === "number", r[1]);
r = await call("GET", `/api/chat?room=general&after=${lastId + 100}&since=${Date.now() + 60000}`, tok("bob"));
ok("since futuro: nada nuevo que quitar", r[1].removed.length === 0, r[1]);
await sleep(1300);
r = await call("POST", "/api/chat", tok("bob"), { room: "general", text: "mio" });
const myId = r[1].id;
r = await call("DELETE", `/api/chat?id=${myId}`, tok("bob"));
ok("borrar propio", r[0] === 200, r);
r = await call("GET", "/api/chat?room=general", null);
ok("chat sin token -> 401", r[0] === 401, r);
r = await w.fetch(new Request(H + "/api/chat", { method: "POST", headers: { authorization: "Bearer " + tok("bob"), origin: "https://evil.com" }, body: '{"room":"general","text":"hola"}' }), env);
ok("POST chat con origen ajeno -> 403", r.status === 403, r.status);
// ---- Logros: formatos del portal y logros nuevos ----
const U2 = ["dana", "erik", "fran", "gina"];
for (const u of U2) await call("PUT", "/api/user", tok(u), prof("Prueba " + u, "ISC"));
const want = ["MAT-360", "MAT-170", "INF-164"];
for (const [u, fmt, name] of [["dana", (c) => c + "-001", "con sección (INF-117-001)"], ["erik", (c) => c.replace("-", ""), "sin guion (INF117)"], ["fran", (c) => c.toLowerCase().replace("-", " "), "minúscula y espacio (inf 117)"]]) {
  globalThis.__fmt = fmt;
  const r = await call("POST", "/api/utesa-login", tok(u), { matricula: "3000000", recinto: "UTSAN", password: "x" }, "7." + u.length + ".7." + u.charCodeAt(0));
  ok("portal " + name + ": verifica sin falso desajuste", r[0] === 200 && r[1].verified && !r[1].verified.mismatch && want.every(c => r[1].verified.earned.includes(c)), r[1].verified && { mismatch: r[1].verified.mismatch, n: r[1].verified.earned.length });
  ok("portal " + name + ": lo pendiente NO cuenta", r[1].verified && !r[1].verified.earned.includes("INF-502") && !r[1].verified.earned.includes("DPG-020"), r[1].verified && r[1].verified.earned);
}
globalThis.__fmt = null;
sq.prepare("UPDATE users SET earned = '[]' WHERE uid = ?").run("dana");
let g = await call("GET", "/api/user", tok("dana"));
ok("logros nuevos aparecen sin volver a vincular (lista guardada vieja)", g[1].user.earned.includes("MAT-360") && g[1].user.earned.length > 3 && !g[1].user.needsRelink, g[1].user);
g = await call("PUT", "/api/user", tok("dana"), { fields: { frame: "INF-164" } });
ok("equipar un logro que no estaba en la lista vieja -> 200", g[0] === 200, g);
sq.prepare("UPDATE users SET verified_at = ?, verified_pending = NULL, earned = ? WHERE uid = ?").run(Date.now(), JSON.stringify(["MAT-170"]), "gina");
g = await call("GET", "/api/user", tok("gina"));
ok("cuenta antigua: conserva sus logros y marca needsRelink", g[1].user.earned.length === 1 && g[1].user.needsRelink === true, g[1].user);
globalThis.__fmt = (c) => c + "-002";
const rl = await call("POST", "/api/utesa-login", tok("gina"), { matricula: "4000000", recinto: "UTSAN", password: "x" }, "8.8.8.8");
g = await call("GET", "/api/user", tok("gina"));
ok("al volver a vincular: logros completos y ya no pide vincular", rl[0] === 200 && g[1].user.earned.length > 3 && g[1].user.needsRelink === false, g[1].user);
globalThis.__fmt = null;
const gp = await call("GET", "/api/user", tok("dana"));
const pr = await call("GET", "/api/profile?pid=" + gp[1].user.pid, tok("erik"));
ok("perfil público muestra los logros en vivo y el marco", pr[0] === 200 && pr[1].profile.earned.includes("MAT-360") && pr[1].profile.frame === "INF-164", pr[1]);

globalThis.__fmt = () => "???";
const sus = await call("POST", "/api/utesa-login", tok("erik"), { matricula: "3000000", recinto: "UTSAN", password: "x" }, "9.9.1.1");
ok("códigos irreconocibles (lista vacía): no se regalan logros", sus[0] === 200 && sus[1].verified === null || sus[0] === 401, sus[1]);
globalThis.__fmt = null;
// ---- Moderador por correo, borrados visibles, edición de 5 min y rangos ----
{
  const tokE = (uid, email, verified) => tok(uid, { email, email_verified: verified });
  await call("PUT", "/api/user", tokE("boss", "boss@x.com", true), prof("Jefa", "ISC"));
  let a = await call("GET", "/api/user", tokE("boss", "boss@x.com", true));
  ok("moderador por correo verificado", a[0] === 200 && a[1].user.admin === true, a[1].user);
  a = await call("GET", "/api/user", tokE("boss", "boss@x.com", false));
  ok("mismo correo SIN verificar: no es moderador", a[1].user.admin === false, a[1].user);
  await call("PUT", "/api/user", tokE("fake", "otra@x.com", true), prof("Otra", "ISC"));
  a = await call("GET", "/api/user", tokE("fake", "otra@x.com", true));
  ok("otro correo verificado: no es moderador", a[1].user.admin === false, a[1].user);
  a = await call("GET", "/api/user", tok("boss"));
  ok("sin correo en el token: no es moderador", a[1].user.admin === false, a[1].user);

  const sendAs = async (u, text, room = "general") => { await sleep(1300); const r = await call("POST", "/api/chat", tok(u), { room, text }); return r[1].id; };
  const view = async (u) => (await call("GET", "/api/chat?room=general", u)) [1].messages;
  const find = (arr, id) => arr.find(m => m.id === id);

  // edición
  const e1 = await sendAs("erik", "mensaje para editar");
  let r = await call("PATCH", "/api/chat", tok("erik"), { id: e1, text: "mensaje editado" });
  ok("editar mi mensaje (dentro de 5 min)", r[0] === 200 && !r[1].flagged, r);
  let m = find(await view(tok("fran")), e1);
  ok("el cambio lo ve toda la sala con marca de editado", m && m.text === "mensaje editado" && m.edited > 0, m);
  r = await call("PATCH", "/api/chat", tok("fran"), { id: e1, text: "me lo robo" });
  ok("editar el mensaje de otra persona -> 403", r[0] === 403, r);
  r = await call("PATCH", "/api/chat", tok("erik"), { id: e1, text: "   " });
  ok("editar dejándolo vacío -> 400", r[0] === 400, r);
  r = await call("PATCH", "/api/chat", tok("erik"), { id: e1, text: "ahora eres un pendejo" });
  ok("editar con mala palabra: se enmascara y avisa", r[0] === 200 && r[1].flagged === true && !!r[1].notice, r);
  m = find(await view(tok("fran")), e1);
  ok("la mala palabra quedó enmascarada en lo editado", m && /\*{7}/.test(m.text) && !/pendejo/i.test(m.text), m);
  sq.prepare("UPDATE messages SET created_at = ? WHERE id = ?").run(Date.now() - 6 * 60 * 1000, e1);
  r = await call("PATCH", "/api/chat", tok("erik"), { id: e1, text: "tarde" });
  ok("pasados 5 minutos ya no se puede editar -> 403", r[0] === 403 && r[1].code === "tiempo", r);

  // borrado propio: queda el rastro
  const d1 = await sendAs("erik", "voy a borrar esto");
  r = await call("DELETE", `/api/chat?id=${d1}`, tok("erik"));
  m = find(await view(tok("fran")), d1);
  ok("borrado propio: queda 'mensaje borrado' sin texto", r[0] === 200 && m && m.hidden === "self" && m.text === "", m);
  r = await call("PATCH", "/api/chat", tok("erik"), { id: d1, text: "revivir" });
  ok("un mensaje borrado no se puede editar -> 409", r[0] === 409, r);

  // moderador oculta el de otra persona
  const h1 = await sendAs("fran", "mensaje que el moderador oculta");
  r = await call("DELETE", `/api/chat?id=${h1}`, tok("admin1"));
  m = find(await view(tok("erik")), h1);
  ok("ocultado por moderador: queda marcado 'mod' y sin texto", r[0] === 200 && m && m.hidden === "mod" && m.text === "" && !("adminText" in m), m);
  m = find(await view(tok("admin1")), h1);
  ok("el moderador sí puede ver el texto original", m && m.adminText === "mensaje que el moderador oculta", m);
  r = await call("GET", `/api/chat?room=general&after=${h1 + 100}&since=1`, tok("erik"));
  ok("cambio en vivo: 'hiddenNow' avisa del ocultado", r[1].hiddenNow.some(x => x.id === h1 && x.hidden === "mod"), r[1].hiddenNow);
  r = await call("POST", "/api/chat/restore", tok("erik"), { id: h1 });
  ok("restaurar sin ser moderador -> 403", r[0] === 403, r);
  r = await call("POST", "/api/chat/restore", tok("admin1"), { id: d1 });
  ok("no se restauran mensajes que borró su autor -> 409", r[0] === 409, r);
  r = await call("POST", "/api/chat/restore", tok("admin1"), { id: h1 });
  m = find(await view(tok("erik")), h1);
  ok("el moderador restaura y vuelve a verse", r[0] === 200 && m && !m.hidden && m.text === "mensaje que el moderador oculta", m);

  // rangos / porcentaje verificado
  const total = new Set(allIsc).size, want = Math.round(100 * 6 / total);
  a = await call("GET", "/api/user", tok("dana"));
  ok("porcentaje verificado de la carrera (" + want + "%)", a[1].user.pct === want, a[1].user.pct);
  a = await call("GET", "/api/user", tok("cat"));
  ok("sin verificar: pct nulo", a[1].user.pct === null, a[1].user.pct);
  const dm = await sendAs("dana", "mensaje de alguien con rango");
  m = find(await view(tok("fran")), dm);
  ok("los mensajes traen el % de quien escribe", m && m.pct === want, m);
  const dpid = (await call("GET", "/api/user", tok("dana")))[1].user.pid;
  a = await call("GET", "/api/profile?pid=" + dpid, tok("fran"));
  ok("el perfil público trae el %", a[1].profile.pct === want, a[1].profile);
}
// ---- Historial hacia atrás y reinicio del chat ----
{
  const ins = sq.prepare("INSERT INTO messages (room, uid, text, created_at) VALUES ('general', ?, ?, ?)");
  const t0 = Date.now() - 3600000;
  for (let i = 1; i <= 130; i++) ins.run(i % 2 ? "bob" : "cat", "histórico " + i, t0 + i * 1000);
  let r = await call("GET", "/api/chat?room=general", tok("ana"));
  const ids0 = r[1].messages.map(m => m.id);
  ok("primera carga: 60 mensajes en orden y avisa que hay más", r[1].messages.length === 60 && r[1].more === true && ids0.every((v, i) => !i || v > ids0[i - 1]), { n: r[1].messages.length, more: r[1].more });
  const epoch0 = r[1].epoch;
  ok("trae la marca de reinicio (epoch)", typeof epoch0 === "string", epoch0);
  let min = ids0[0], total = 60, more = true, rounds = 0, ordered = true, dup = false; const seen = new Set(ids0);
  while (more && rounds < 10) {
    r = await call("GET", `/api/chat?room=general&before=${min}`, tok("ana"));
    const ids = r[1].messages.map(m => m.id);
    ordered = ordered && ids.every((v, i) => !i || v > ids[i - 1]) && ids.every(v => v < min);
    ids.forEach(v => { if (seen.has(v)) dup = true; seen.add(v); });
    total += ids.length; more = r[1].more; if (ids.length) min = ids[0]; rounds++;
  }
  ok("subir recorre todo el historial sin repetidos y en orden", ordered && !dup && total >= 130, { total, rounds, ordered, dup });
  ok("el historial termina (more=false al llegar al inicio)", more === false, more);
  r = await call("GET", `/api/chat?room=general&before=${min}`, tok("ana"));
  ok("pedir antes del primer mensaje no devuelve nada", r[0] === 200 && r[1].messages.length === 0 && r[1].more === false, r[1]);
  // reinicio total: la marca cambia y las salas quedan vacías
  sq.prepare("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)").run();
  sq.prepare("DELETE FROM messages").run(); sq.prepare("DELETE FROM reports").run();
  sq.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('chat_epoch', ?)").run("1999999999");
  r = await call("GET", "/api/chat?room=general", tok("ana"));
  ok("tras borrar todo: sala vacía y epoch distinto", r[1].messages.length === 0 && r[1].epoch === "1999999999" && r[1].epoch !== epoch0, { n: r[1].messages.length, epoch: r[1].epoch });
  await sleep(1300);
  r = await call("POST", "/api/chat", tok("ana"), { room: "general", text: "primer mensaje después del reinicio" });
  ok("se puede escribir normal después del reinicio", r[0] === 200 && r[1].id > 130, r);
  r = await call("GET", "/api/chat?room=general&after=0", tok("bob"));
  ok("y los demás lo ven", r[1].messages.length === 1 && r[1].messages[0].text === "primer mensaje después del reinicio", r[1].messages);
}

// ===== auditoría run-2 (N-08): si UTESA dice otra carrera, el inicio directo no otorga logros =====
{
  await call("PUT", "/api/user", tok("jon"), prof("Jon Paz", "ISC"));
  globalThis.__carrera = "CONTADURIA PUBLICA";
  let x = await call("POST", "/api/utesa-login", tok("jon"), { matricula: "6100000", recinto: "UTSAN", password: "x" }, "5.5.5.1");
  ok("N-08: UTESA dice Contaduría y el perfil dice ISC -> mismatch sin logros", x[0] === 200 && x[1].verified && x[1].verified.mismatch === true && x[1].verified.earned.length === 0 && x[1].verified.portalCareer === "CON", x[1].verified);
  let g = await call("GET", "/api/user", tok("jon"));
  ok("N-08: ... y no se guarda ninguna verificación", !g[1].user.verifiedAt && g[1].user.earned.length === 0 && g[1].user.pct === null, g[1].user);
  globalThis.__carrera = "Ingeniería en Sistemas Computacionales";
  x = await call("POST", "/api/utesa-login", tok("jon"), { matricula: "6100001", recinto: "UTSAN", password: "x" }, "5.5.5.2");
  ok("N-08: si UTESA dice la misma carrera, verifica normal", x[0] === 200 && x[1].verified && !x[1].verified.mismatch && x[1].verified.earned.length > 3, x[1].verified && { mismatch: x[1].verified.mismatch, n: x[1].verified.earned.length });
  globalThis.__carrera = "ADMINISTRACION DE EMPRESAS TURISTICAS Y HOTELERAS";
  await call("PUT", "/api/user", tok("kim"), prof("Kim Sol", "ADM"));
  x = await call("POST", "/api/utesa-login", tok("kim"), { matricula: "6100002", recinto: "UTSAN", password: "x" }, "5.5.5.3");
  ok("N-08: el nombre más largo gana (Turísticas y Hoteleras no se confunde con Administración)", x[1].verified && x[1].verified.portalCareer === "ATH", x[1].verified);
  globalThis.__carrera = undefined;
}

// ===== auditoría run-2 (N-03): nadie bloquea la matrícula de otra persona; solo los fallos reales cuentan =====
{
  for (const u of ["lia", "max"]) await call("PUT", "/api/user", tok(u), prof("Prueba " + u, "ISC"));
  let x;
  for (let i = 0; i < 5; i++) x = await call("POST", "/api/utesa-login", tok("lia"), { matricula: "7000000", recinto: "UTSAN", password: "x" + i }, "6.6.0." + i);
  x = await call("POST", "/api/utesa-login", tok("lia"), { matricula: "7000000", recinto: "UTSAN", password: "x" }, "6.6.0.9");
  ok("N-03: la misma cuenta sí topa sus 5 intentos con esa matrícula", x[0] === 429, x[0]);
  x = await call("POST", "/api/utesa-login", tok("max"), { matricula: "7000000", recinto: "UTSAN", password: "x" }, "6.6.1.1");
  ok("N-03: otra cuenta con la misma matrícula NO queda bloqueada", x[0] === 200, x[0]);
  globalThis.__portalFail = true;
  const codes = [];
  for (let i = 0; i < 11; i++) { const who = ["nia", "oto", "pam"][i % 3]; x = await call("POST", "/api/utesa-login", tok(who), { matricula: "7100000", recinto: "UTSAN", password: "mal" + i }, "6.6.2." + i); codes.push(x[0]); }
  ok("N-03: 10 contraseñas fallidas por hora frenan esa matrícula para todos (401 ×10, luego 429)", codes.slice(0, 10).every(c => c === 401) && codes[10] === 429, codes);
  globalThis.__portalFail = false;
  x = await call("POST", "/api/utesa-login", tok("max"), { matricula: "7200000", recinto: "UTSAN", password: "x" }, "6.6.3.1");
  ok("N-03: otra matrícula sigue funcionando", x[0] === 200, x[0]);
}

// ===== auditoría run-2 (N-02): una kid desconocida no provoca una descarga de claves por petición =====
{
  const realFetch = globalThis.fetch;
  let n = 0;
  globalThis.fetch = (u, o) => { if (String(u).includes("securetoken")) n++; return realFetch(u, o); };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  for (let i = 0; i < 25; i++) await call("GET", "/api/user", `${b64({ alg: "RS256", kid: "kid-falsa-" + i })}.${b64({ sub: "x" })}.firma`);
  globalThis.fetch = realFetch;
  ok("N-02: 25 tokens con kid al azar causan como mucho 1 descarga de claves", n <= 1, n);
  const g = await call("GET", "/api/user", tok("lia"));
  ok("N-02: los tokens válidos siguen funcionando", g[0] === 200, g[0]);
}

finish();
