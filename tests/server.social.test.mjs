// tests/server.social.test.mjs — personas, amistades, chat privado, grupos, moderadores, vaciado, eliminar usuarios,
// presencia, marcos exclusivos, artículos exclusivos y verificación con marcador.
import { sq, env, ok, prof, sleep, call, tok, w, H, allIsc, approved, PENSUMS, b, finish } from "./harness.mjs";


// ===== red social: directorio, amistades, chat privado y moderadores =====
const pid = {};
for (const [u, n, c] of [["ana", "Ana Pérez", "ISC"], ["bob", "Bob Díaz", "ISC"], ["cat", "Cat Ruiz", "DER"], ["dan", "Dan Mora", "ISC"], ["boss", "Jefe", "ISC"]]) {
  await call("PUT", "/api/user", tok(u, u === "boss" ? { email: "boss@x.com", email_verified: true } : {}), prof(n, c));
}
for (const u of ["ana", "bob", "cat", "dan"]) pid[u] = (await call("GET", "/api/user", tok(u)))[1].user.pid;
const bossTok = () => tok("boss", { email: "boss@x.com", email_verified: true });
pid.boss = (await call("GET", "/api/user", bossTok()))[1].user.pid;

let r = await call("GET", "/api/user", bossTok());
ok("el dueño (ADMIN_EMAILS verificado) sale como owner y admin", r[1].user.owner === true && r[1].user.admin === true, r[1].user);
r = await call("GET", "/api/user", tok("ana"));
ok("un usuario normal no es owner ni admin", r[1].user.owner === false && r[1].user.admin === false, r[1].user);
r = await call("GET", "/api/user", tok("boss", { email: "boss@x.com" }));
ok("correo sin verificar NO da dueño", r[1].user.owner === false, r[1].user);

// directorio
r = await call("GET", "/api/people", tok("ana"));
const names = r[1].people.map(p => p.name);
ok("directorio: por defecto la carrera propia, sin uno mismo", r[0] === 200 && names.includes("Bob Díaz") && !names.includes("Ana Pérez") && !names.includes("Cat Ruiz"), names);
ok("directorio: trae conteo por carrera", r[1].careers.some(c => c.career === "ISC" && c.n >= 4) && r[1].careers.some(c => c.career === "DER"), r[1].careers);
ok("directorio: no expone uid ni correo", r[1].people.every(p => !("uid" in p) && !("email" in p) && /^[0-9a-f]{16}$/.test(p.pid)), r[1].people[0]);
r = await call("GET", "/api/people?career=DER", tok("ana"));
ok("directorio: ver otra carrera", r[1].people.length === 1 && r[1].people[0].name === "Cat Ruiz" && r[1].people[0].rel === "none", r[1].people);
r = await call("GET", "/api/people?career=all&q=dan", tok("ana"));
ok("directorio: buscar por nombre en todas las carreras", r[1].people.length === 1 && r[1].people[0].name === "Dan Mora", r[1].people);
r = await call("GET", "/api/people?career=XXX", tok("ana"));
ok("directorio: carrera inválida -> 400", r[0] === 400, r);
r = await call("GET", "/api/people?career=all&q=B%25b", tok("ana"));
ok("directorio: % no actúa como comodín", r[1].people.length === 0, r[1].people);
r = await call("GET", "/api/people", null);
ok("directorio sin sesión -> 401", r[0] === 401, r);

// privacidad: ocultarse del directorio
r = await call("PUT", "/api/user", tok("dan"), { fields: { dirHidden: true } });
ok("activar 'ocultarme del directorio'", r[0] === 200, r);
r = await call("GET", "/api/people", tok("ana"));
ok("oculto: no sale en el directorio", !r[1].people.some(p => p.name === "Dan Mora"), r[1].people.map(p => p.name));
r = await call("GET", "/api/people?career=all&q=dan", bossTok());
ok("oculto: el dueño sí lo ve (para gestionar)", r[1].people.some(p => p.name === "Dan Mora"), r[1].people);
r = await call("PUT", "/api/user", tok("dan"), { fields: { dirHidden: "si" } });
ok("dirHidden no booleano -> 400", r[0] === 400, r);

// solicitudes
r = await call("POST", "/api/friends", tok("ana"), { action: "request", pid: pid.ana });
ok("no puedes agregarte a ti mismo", r[0] === 400, r);
r = await call("POST", "/api/friends", tok("ana"), { action: "request", pid: "0000000000000000" });
ok("solicitud a perfil inexistente -> 404", r[0] === 404, r);
r = await call("POST", "/api/friends", tok("ana"), { action: "request", pid: pid.bob });
ok("enviar solicitud", r[0] === 200 && r[1].rel === "sent", r);
r = await call("POST", "/api/friends", tok("ana"), { action: "request", pid: pid.bob });
ok("repetir solicitud es idempotente", r[0] === 200 && r[1].rel === "sent", r);
r = await call("GET", "/api/friends", tok("bob"));
ok("Bob ve la solicitud entrante", r[1].incoming.length === 1 && r[1].incoming[0].pid === pid.ana && r[1].friends.length === 0, r[1]);
r = await call("GET", "/api/friends", tok("ana"));
ok("Ana ve la solicitud saliente", r[1].outgoing.length === 1 && r[1].outgoing[0].pid === pid.bob, r[1]);
r = await call("GET", "/api/people", tok("bob"));
ok("directorio marca la relación (received)", r[1].people.find(p => p.pid === pid.ana).rel === "received", r[1].people);
r = await call("POST", "/api/friends", tok("ana"), { action: "accept", pid: pid.bob });
ok("quien envió no puede aceptar su propia solicitud", r[0] === 404, r);
// chat privado antes de ser amigos
r = await call("GET", `/api/chat?room=dm:${pid.bob}`, tok("ana"));
ok("chat privado sin ser amigos -> 400", r[0] === 400, r);
r = await call("POST", "/api/chat", tok("ana"), { room: `dm:${pid.bob}`, text: "hola" });
ok("escribir sin ser amigos -> 400", r[0] === 400, r);
r = await call("POST", "/api/friends", tok("bob"), { action: "accept", pid: pid.ana });
ok("Bob acepta", r[0] === 200 && r[1].rel === "friend", r);
r = await call("GET", "/api/friends", tok("ana"));
ok("ahora son amigos en ambos lados", r[1].friends.length === 1 && r[1].friends[0].pid === pid.bob && r[1].outgoing.length === 0, r[1]);
r = await call("GET", "/api/friends", tok("bob"));
ok("... también en Bob", r[1].friends.length === 1 && r[1].friends[0].pid === pid.ana && r[1].incoming.length === 0, r[1]);

// cruce de solicitudes: se aceptan solas
await call("POST", "/api/friends", tok("cat"), { action: "request", pid: pid.dan });
r = await call("POST", "/api/friends", tok("dan"), { action: "request", pid: pid.cat });
ok("solicitudes cruzadas se aceptan solas", r[1].rel === "friend", r);
r = await call("POST", "/api/friends", tok("cat"), { action: "remove", pid: pid.dan });
ok("eliminar amistad", r[1].rel === "none", r);
// rechazar / cancelar
await call("POST", "/api/friends", tok("cat"), { action: "request", pid: pid.ana });
r = await call("POST", "/api/friends", tok("ana"), { action: "decline", pid: pid.cat });
ok("rechazar solicitud", r[1].rel === "none", r);
r = await call("GET", "/api/friends", tok("cat"));
ok("tras rechazar no queda saliente", r[1].outgoing.length === 0, r[1]);
await call("POST", "/api/friends", tok("cat"), { action: "request", pid: pid.ana });
r = await call("POST", "/api/friends", tok("cat"), { action: "cancel", pid: pid.ana });
ok("cancelar solicitud enviada", r[1].rel === "none", r);
r = await call("POST", "/api/friends", tok("ana"), { action: "explotar", pid: pid.cat });
ok("acción desconocida -> 400", r[0] === 400, r);

// chat privado
await sleep(1300);
r = await call("POST", "/api/chat", tok("ana"), { room: `dm:${pid.bob}`, text: "hola Bob, ¿vas a clase?" });
ok("Ana escribe en privado", r[0] === 200, r);
const dmId = r[1].id;
r = await call("GET", `/api/chat?room=dm:${pid.ana}`, tok("bob"));
ok("Bob lo ve en su sala dm:<pid de Ana>", r[0] === 200 && r[1].messages.length === 1 && r[1].messages[0].text.startsWith("hola Bob") && r[1].messages[0].pid === pid.ana, r);
r = await call("GET", `/api/chat?room=general&after=0`, tok("cat"));
ok("el privado NO aparece en el chat general", !r[1].messages.some(m => /hola Bob/.test(m.text)), r[1].messages);
r = await call("GET", `/api/chat?room=dm:${pid.bob}`, tok("cat"));
ok("un tercero no puede leer el chat de otros", r[0] === 400, r);
r = await call("GET", `/api/chat?room=dm:${pid.bob}`, bossTok());
ok("ni el dueño lee chats privados", r[0] === 400, r);
r = await call("GET", "/api/friends", tok("bob"));
ok("Bob tiene 1 mensaje sin leer de Ana", r[1].unread === 1 && r[1].friends[0].unread === 1, r[1]);
r = await call("GET", "/api/friends", tok("ana"));
ok("Ana no cuenta su propio mensaje como no leído", r[1].unread === 0, r[1]);
r = await call("POST", "/api/dm/read", tok("bob"), { pid: pid.ana });
ok("marcar como leído", r[0] === 200, r);
r = await call("GET", "/api/friends", tok("bob"));
ok("... y ya no hay no leídos", r[1].unread === 0, r[1]);
await sleep(1300);
r = await call("POST", "/api/chat", tok("bob"), { room: `dm:${pid.ana}`, text: "eres una mierda" });
ok("el privado también enmascara malas palabras", r[0] === 200 && r[1].flagged === true, r);
r = await call("GET", `/api/chat?room=dm:${pid.bob}&after=${dmId}`, tok("ana"));
ok("... y se ve enmascarado", r[1].messages.length === 1 && !/mierda/.test(r[1].messages[0].text) && /\*/.test(r[1].messages[0].text), r[1].messages);
// borrar / moderar
const bobMsg = r[1].messages[0].id;
r = await call("DELETE", `/api/chat?id=${bobMsg}`, bossTok());
ok("el dueño NO puede borrar un privado sin reporte", r[0] === 403, r);
r = await call("POST", "/api/chat/report", tok("ana"), { id: bobMsg, reason: "insulto" });
ok("Ana reporta el mensaje", r[0] === 200, r);
r = await call("DELETE", `/api/chat?id=${bobMsg}`, bossTok());
ok("reportado: un moderador sí puede ocultarlo", r[0] === 200, r);
r = await call("DELETE", `/api/chat?id=${dmId}`, tok("bob"));
ok("Bob no puede borrar el mensaje de Ana", r[0] === 403, r);
r = await call("DELETE", `/api/chat?id=${dmId}`, tok("ana"));
ok("Ana borra el suyo -> tombstone", r[0] === 200, r);
r = await call("GET", `/api/chat?room=dm:${pid.ana}&after=0`, tok("bob"));
ok("queda como 'borrado por su autor'", r[1].messages.find(m => m.id === dmId).hidden === "self" && r[1].messages.find(m => m.id === dmId).text === "", r[1].messages);
// dejar de ser amigos corta el acceso
await call("POST", "/api/friends", tok("bob"), { action: "remove", pid: pid.ana });
r = await call("GET", `/api/chat?room=dm:${pid.ana}`, tok("bob"));
ok("sin amistad se pierde el acceso al privado", r[0] === 400, r);
// bloquear quita amistad y evita solicitudes
await call("POST", "/api/friends", tok("ana"), { action: "request", pid: pid.bob });
await call("POST", "/api/friends", tok("bob"), { action: "accept", pid: pid.ana });
await call("POST", "/api/chat/block", tok("bob"), { pid: pid.ana, on: true });
r = await call("GET", "/api/friends", tok("bob"));
ok("bloquear elimina la amistad", r[1].friends.length === 0, r[1]);
r = await call("POST", "/api/friends", tok("ana"), { action: "request", pid: pid.bob });
ok("no se puede solicitar a quien te bloqueó", r[0] === 403, r);
r = await call("GET", "/api/people", tok("ana"));
ok("el bloqueado ya no ve a quien lo bloqueó en el directorio", !r[1].people.some(p => p.pid === pid.bob), r[1].people.map(p => p.name));
await call("POST", "/api/chat/block", tok("bob"), { pid: pid.ana, on: false });

// límites
r = await call("POST", "/api/friends", tok("ana"), { action: "request", pid: pid.bob }, "7.7.7.7");
ok("tras desbloquear se puede volver a solicitar", r[0] === 200, r);

// moderadores
r = await call("POST", "/api/mods", tok("ana"), { pid: pid.bob, on: true });
ok("un usuario normal no puede nombrar moderadores", r[0] === 403, r);
r = await call("POST", "/api/mods", bossTok(), { pid: pid.bob, on: true });
ok("el dueño nombra moderador a Bob", r[0] === 200 && r[1].role === "mod", r);
r = await call("GET", "/api/user", tok("bob"));
ok("Bob ahora es admin pero no dueño", r[1].user.admin === true && r[1].user.owner === false, r[1].user);
r = await call("POST", "/api/mods", tok("bob"), { pid: pid.cat, on: true });
ok("un moderador tampoco puede nombrar otros", r[0] === 403, r);
r = await call("GET", "/api/mods", tok("bob"));
ok("el moderador ve la lista de moderadores (dueño primero)", r[0] === 200 && r[1].mods[0].role === "owner" && r[1].mods.some(m => m.pid === pid.bob && m.role === "mod") && r[1].owner === false, r[1]);
r = await call("GET", "/api/mods", tok("ana"));
ok("un usuario normal no ve esa lista", r[0] === 403, r);
r = await call("POST", "/api/mods", bossTok(), { pid: pid.boss, on: false });
ok("al dueño no se le puede quitar el rol (ni a uno mismo)", r[0] === 400, r);
r = await call("POST", "/api/chat", tok("ana"), { room: "general", text: "mensaje para moderar" });
const gid = r[1].id;
r = await call("DELETE", `/api/chat?id=${gid}`, tok("bob"));
ok("el moderador nombrado puede ocultar mensajes del general", r[0] === 200, r);
r = await call("GET", "/api/chat?room=general&after=0", tok("bob"));
ok("... y la sala marca el rol en los mensajes", r[1].messages.every(m => m.role === null || m.role === "mod" || m.role === "owner") && r[1].admin === true, r[1].messages.map(m => m.role));
r = await call("POST", "/api/mods", bossTok(), { pid: pid.bob, on: false });
ok("el dueño le quita el rol", r[0] === 200 && r[1].role === null, r);
r = await call("GET", "/api/user", tok("bob"));
ok("Bob deja de ser admin", r[1].user.admin === false, r[1].user);
r = await call("DELETE", `/api/chat?id=${gid}`, tok("bob"));
ok("... y ya no puede moderar", r[0] === 403, r);
r = await call("GET", `/api/profile?pid=${pid.boss}`, tok("ana"));
ok("el perfil público muestra el rol de dueño y la relación", r[1].profile.role === "owner" && r[1].rel === "none", r[1]);
r = await call("GET", "/api/people?career=ISC", tok("ana"));
ok("el directorio pone primero al dueño", r[1].people[0].role === "owner", r[1].people.map(p => p.name + ":" + p.role));


// vaciar chats
await sleep(1300);
await call("POST", "/api/chat", tok("ana"), { room: "general", text: "para vaciar" });
await call("POST", "/api/mods", bossTok(), { pid: pid.bob, on: true });
r = await call("POST", "/api/chat/wipe", tok("ana"), { room: "general" });
ok("un usuario normal no puede vaciar", r[0] === 403, r);
r = await call("GET", "/api/chat?room=general", tok("ana")); const ep1 = r[1].epoch;
r = await call("POST", "/api/chat/wipe", tok("bob"), { room: "all" });
ok("un moderador no puede vaciar todo", r[0] === 403, r);
r = await call("POST", "/api/chat/wipe", tok("bob"), { room: "general" });
ok("un moderador sí vacía General", r[0] === 200, r);
r = await call("GET", "/api/chat?room=general", tok("ana"));
ok("General queda vacío y cambia el epoch", r[1].messages.length === 0 && r[1].epoch !== ep1, r[1]);
r = await call("GET", `/api/chat?room=dm:${pid.bob}`, tok("ana"));
ok("los privados no se tocan (sala sigue válida si hay amistad)", r[0] === 200 || r[0] === 400, r[0]);
{ // "vaciar todo" borra solo las salas públicas: los privados y los grupos sobreviven
  const ins = sq.prepare("INSERT INTO messages (room, uid, text, created_at) VALUES (?, 'ana', ?, ?)");
  const t0 = Date.now();
  for (const room of ["general", "c:ISC", "c:DER", "g:99991", `dm:${pid.ana}:${pid.bob}`]) ins.run(room, "para el wipe total", t0);
  const left = (room) => sq.prepare("SELECT COUNT(*) AS n FROM messages WHERE room = ?").get(room).n;
  const dmRoom0 = `dm:${pid.ana}:${pid.bob}`, dmBefore = left(dmRoom0);
  r = await call("POST", "/api/chat/wipe", bossTok(), { room: "all" });
  ok("el dueño vacía todo", r[0] === 200, r);
  ok("vaciar todo borra General y las salas de carrera", left("general") === 0 && left("c:ISC") === 0 && left("c:DER") === 0, { g: left("general"), isc: left("c:ISC"), der: left("c:DER") });
  ok("vaciar todo NO borra los mensajes de grupos ni los privados", left("g:99991") === 1 && dmBefore >= 1 && left(dmRoom0) === dmBefore, { grupo: left("g:99991"), dmAntes: dmBefore, dmDespues: left(dmRoom0) });
  sq.prepare("DELETE FROM messages WHERE room = 'g:99991' OR (room = ? AND text = 'para el wipe total')").run(dmRoom0);
}
r = await call("POST", "/api/chat/wipe", bossTok(), { room: "xx" });
ok("sala inválida -> 400", r[0] === 400, r);


// ===== grupos y presencia =====
r = await call("GET", "/api/friends", tok("ana"));
ok("presencia: los amigos traen online/seen", r[1].friends.every(f => typeof f.online === "boolean" && "seen" in f), r[1].friends);
await call("POST", "/api/friends", tok("ana"), { action: "request", pid: pid.bob }); await call("POST", "/api/friends", tok("bob"), { action: "accept", pid: pid.ana });
await call("POST", "/api/friends", tok("ana"), { action: "request", pid: pid.dan }); await call("POST", "/api/friends", tok("dan"), { action: "accept", pid: pid.ana });
r = await call("GET", "/api/friends", tok("ana"));
ok("quien usa la app aparece en línea", r[1].friends.find(f => f.pid === pid.bob).online === true, r[1].friends);
await call("PUT", "/api/user", tok("bob"), { fields: { hideOnline: true } });
r = await call("GET", "/api/friends", tok("ana"));
const bobF = r[1].friends.find(f => f.pid === pid.bob);
ok("ocultar el estado en línea lo oculta a los demás", bobF.online === false && bobF.seen === null, bobF);
await call("PUT", "/api/user", tok("bob"), { fields: { hideOnline: false } });

r = await call("POST", "/api/groups", tok("ana"), { action: "create", name: "" });
ok("grupo sin nombre -> 400", r[0] === 400, r);
r = await call("POST", "/api/groups", tok("ana"), { action: "create", name: "grupo de mierda" });
ok("nombre con malas palabras -> 400", r[0] === 400, r);
r = await call("POST", "/api/groups", tok("ana"), { action: "create", name: "Estudio Cálculo", members: [pid.bob, pid.cat] });
ok("crear grupo (solo suma amigos: Cat no es amiga)", r[0] === 200 && r[1].id > 0, r);
const G = r[1].id;
r = await call("GET", `/api/groups?id=${G}`, tok("ana"));
ok("detalle: creadora admin y solo Bob dentro", r[1].group.members.length === 2 && r[1].group.me === "admin" && r[1].group.iAmCreator && r[1].group.members.find(m => m.pid === pid.bob).grole === "member", r[1]);
r = await call("GET", `/api/groups?id=${G}`, tok("cat"));
ok("quien no es miembro no ve el grupo", r[0] === 404, r);
r = await call("GET", `/api/chat?room=g:${G}`, tok("cat"));
ok("ni lee sus mensajes", r[0] === 400, r);
await sleep(1300);
r = await call("POST", "/api/chat", tok("bob"), { room: `g:${G}`, text: "¿quién resuelve el taller?" });
ok("un miembro escribe en el grupo", r[0] === 200, r); const gm1 = r[1].id;
r = await call("GET", `/api/chat?room=g:${G}`, tok("ana"));
ok("la admin lo ve", r[1].messages.length === 1, r[1]);
r = await call("GET", "/api/groups", tok("ana"));
ok("lista de grupos con no leídos", r[1].groups.length === 1 && r[1].groups[0].unread === 1 && r[1].groups[0].n === 2 && r[1].groups[0].role === "admin", r[1]);
await call("POST", "/api/groups", tok("ana"), { action: "read", id: G });
r = await call("GET", "/api/groups", tok("ana"));
ok("marcar leído", r[1].groups[0].unread === 0, r[1]);
r = await call("POST", "/api/groups", tok("bob"), { action: "add", id: G, pid: pid.dan });
ok("un miembro normal no puede agregar", r[0] === 403, r);
r = await call("POST", "/api/groups", tok("ana"), { action: "add", id: G, pid: pid.cat });
ok("no se puede agregar a quien no es tu amigo", r[0] === 400, r);
r = await call("POST", "/api/groups", tok("ana"), { action: "add", id: G, pid: pid.dan });
ok("la admin agrega a un amigo", r[0] === 200, r);
r = await call("POST", "/api/groups", tok("ana"), { action: "role", id: G, pid: pid.bob, on: true });
ok("la admin nombra admin a Bob", r[0] === 200, r);
await sleep(1300);
r = await call("POST", "/api/chat", tok("dan"), { room: `g:${G}`, text: "mensaje a moderar" }); const gm2 = r[1].id;
r = await call("DELETE", `/api/chat?id=${gm2}`, tok("bob"));
ok("el admin del grupo (Bob) oculta mensajes de su grupo", r[0] === 200, r);
r = await call("DELETE", `/api/chat?id=${gm1}`, bossTok());
ok("el dueño global NO modera grupos ajenos sin reporte", r[0] === 403, r);
r = await call("POST", "/api/groups", tok("bob"), { action: "role", id: G, pid: pid.dan, on: true });
await call("POST", "/api/groups", tok("bob"), { action: "role", id: G, pid: pid.dan, on: false });
r = await call("POST", "/api/groups", tok("bob"), { action: "role", id: G, pid: pid.dan, on: false });
ok("un admin que no creó el grupo no puede quitar admins", r[0] === 403, r);
r = await call("POST", "/api/groups", tok("bob"), { action: "role", id: G, pid: pid.ana, on: false });
ok("no se puede degradar a la creadora", r[0] === 409, r);
r = await call("POST", "/api/groups", tok("bob"), { action: "remove", id: G, pid: pid.dan });
ok("un admin puede sacar a un miembro (Dan es admin ahora: solo la creadora)", r[0] === 403, r);
r = await call("POST", "/api/groups", tok("ana"), { action: "remove", id: G, pid: pid.dan });
ok("la creadora saca a Dan", r[0] === 200, r);
r = await call("POST", "/api/groups", tok("ana"), { action: "rename", id: G, name: "Cálculo IV" });
ok("renombrar", r[0] === 200, r);
r = await call("POST", "/api/chat/report", tok("cat"), { id: gm1, reason: "x" });
ok("no se puede reportar un mensaje de un grupo ajeno", r[0] === 404, r);
r = await call("POST", "/api/groups", tok("bob"), { action: "delete", id: G });
ok("solo la creadora borra el grupo", r[0] === 403, r);
r = await call("POST", "/api/groups", tok("ana"), { action: "leave", id: G });
ok("la creadora sale y el grupo pasa a otro admin", r[0] === 200, r);
r = await call("GET", `/api/groups?id=${G}`, tok("bob"));
ok("Bob queda como creador/admin", r[0] === 200 && r[1].group.iAmCreator === true && r[1].group.members.length === 1, r);
r = await call("POST", "/api/groups", tok("bob"), { action: "delete", id: G });
ok("el nuevo creador borra el grupo", r[0] === 200, r);
r = await call("GET", `/api/chat?room=g:${G}`, tok("bob"));
ok("grupo borrado: sala inválida", r[0] === 400, r);


// ===== eliminar usuarios (solo el dueño) =====
await call("PUT", "/api/user", tok("zed"), prof("Zed Luna", "ISC")); const zpid = (await call("GET", "/api/user", tok("zed")))[1].user.pid;
await call("POST", "/api/friends", tok("zed"), { action: "request", pid: pid.dan }); await call("POST", "/api/friends", tok("dan"), { action: "accept", pid: zpid });
await sleep(1300); await call("POST", "/api/chat", tok("zed"), { room: "general", text: "mensaje de Zed" });
r = await call("POST", "/api/groups", tok("zed"), { action: "create", name: "Grupo de Zed", members: [pid.dan] }); const zg = r[1].id;
await sleep(1300); await call("POST", "/api/chat", tok("dan"), { room: `dm:${zpid}`, text: "hola Zed" });
r = await call("POST", "/api/users/delete", tok("ana"), { pid: zpid });
ok("un usuario normal no puede eliminar usuarios", r[0] === 403, r);
await call("POST", "/api/mods", bossTok(), { pid: pid.bob, on: true });
r = await call("POST", "/api/users/delete", tok("bob"), { pid: zpid });
ok("ni un moderador", r[0] === 403, r);
r = await call("POST", "/api/users/delete", bossTok(), { pid: pid.boss });
ok("el dueño no puede eliminarse a sí mismo", r[0] === 400, r);
r = await call("POST", "/api/users/delete", bossTok(), { pid: zpid });
ok("el dueño elimina a Zed", r[0] === 200, r);
r = await call("GET", "/api/chat?room=general", tok("ana"));
ok("sus mensajes desaparecen", !r[1].messages.some(m => /de Zed/.test(m.text)), r[1].messages);
r = await call("GET", "/api/user", tok("zed"));
ok("Zed ya no tiene perfil y no puede volver", r[0] === 403, r);
r = await call("PUT", "/api/user", tok("zed"), prof("Zed Luna", "ISC"));
ok("no puede crear un perfil nuevo", r[0] === 403, r);
r = await call("GET", `/api/groups?id=${zg}`, tok("dan"));
ok("su grupo pasa a otro miembro (Dan)", r[0] === 200 && r[1].group.iAmCreator === true && r[1].group.me === "admin", r);
r = await call("GET", `/api/chat?room=dm:${zpid}`, tok("dan"));
ok("el chat privado con Zed ya no existe: 'Usuario eliminado'", r[0] === 410 && r[1].message === "Usuario eliminado", r);
ok("y sus mensajes privados se borraron de la base", sq.prepare("SELECT COUNT(*) n FROM messages WHERE room LIKE ?").get(`dm:%${zpid}%`).n === 0, 0);
r = await call("GET", `/api/profile?pid=${zpid}`, tok("ana"));
ok("su perfil devuelve 404 (se muestra 'Usuario eliminado')", r[0] === 404, r);
r = await call("GET", "/api/people?career=all&q=Zed", tok("ana"));
ok("ya no sale en Ver estudiantes", r[1].people.length === 0, r[1].people);


// ===== emojis =====
await sleep(1300);
r = await call("POST", "/api/chat", tok("ana"), { room: "general", text: "hola 👨‍👩‍👧 ❤️‍🔥 😀" });
ok("el servidor conserva los emojis compuestos (ZWJ)", r[0] === 200 && r[1].text === "hola 👨‍👩‍👧 ❤️‍🔥 😀", r);
await sleep(1300);
r = await call("POST", "/api/chat", tok("ana"), { room: "general", text: "a​b‮c" });
ok("pero sigue quitando caracteres invisibles peligrosos", r[0] === 200 && r[1].text === "abc", r);


// ===== marcos exclusivos de moderación =====
r = await call("PUT", "/api/user", tok("ana"), { fields: { frame: "MOD-1" } });
ok("un usuario normal NO puede equipar un marco de moderación", r[0] === 403, r);
r = await call("PUT", "/api/user", bossTok(), { fields: { frame: "MOD-4" } });
ok("el dueño sí puede equipar MOD-4", r[0] === 200, r);
r = await call("PUT", "/api/user", bossTok(), { fields: { frame: "MOD-9" } });
ok("un marco MOD inexistente -> 400", r[0] === 400, r);
await call("POST", "/api/mods", bossTok(), { pid: pid.bob, on: true });
r = await call("PUT", "/api/user", tok("bob"), { fields: { frame: "MOD-3" } });
ok("un moderador puede equipar MOD-3", r[0] === 200, r);
r = await call("GET", "/api/user", tok("bob"));
ok("queda guardado", r[1].user.frame === "MOD-3", r[1].user);
await call("POST", "/api/mods", bossTok(), { pid: pid.bob, on: false });
r = await call("GET", "/api/user", tok("bob"));
ok("al perder el rol pierde el marco exclusivo", r[1].user.frame === null, r[1].user);
r = await call("GET", "/api/user", tok("zed"));
ok("usuario eliminado: código 'eliminada' (la web lo manda a cuenta-eliminada.html)", r[0] === 403 && r[1].code === "eliminada", r);


// ===== artículos exclusivos del personaje (solo equipo) =====
const AV_X = 'c1:{"k":"p","s":2,"xh":1,"xw":2,"xa":1}', AV_N = 'c1:{"k":"p","s":3,"c":30,"ht":9}';
r = await call("PUT", "/api/user", tok("ana"), { fields: { avatar: AV_X } });
ok("un usuario normal NO puede guardar artículos exclusivos", r[0] === 403, r);
r = await call("PUT", "/api/user", tok("ana"), { fields: { avatar: AV_N } });
ok("ropa y sombrero navideños sí (para todos)", r[0] === 200, r);
r = await call("PUT", "/api/user", bossTok(), { fields: { avatar: AV_X } });
ok("el dueño sí guarda artículos exclusivos", r[0] === 200, r);
await call("POST", "/api/mods", bossTok(), { pid: pid.bob, on: true });
r = await call("PUT", "/api/user", tok("bob"), { fields: { avatar: AV_X } });
ok("un moderador también", r[0] === 200, r);
await call("POST", "/api/mods", bossTok(), { pid: pid.bob, on: false });
r = await call("GET", "/api/user", tok("bob"));
ok("al perder el rol se le quitan los artículos exclusivos", !/"xh"|"xw"|"xa"/.test(r[1].user.avatar) && /"s":2/.test(r[1].user.avatar), r[1].user.avatar);


// ===== verificación con el marcador =====
const pendAll = allIsc.filter(c => !approved.has(c));
const vcall = (t, body) => call("POST", "/api/utesa-verify", t, body, "8.8.8.8");
r = await vcall(null, { pending: pendAll });
ok("verificar con marcador exige sesión", r[0] === 401, r);
r = await vcall(tok("ana"), { pending: pendAll.map((c, i) => (i % 2 ? c.replace("-", "") : c)), counts: { aprob: 6, insc: 0, pend: pendAll.length } });
ok("el marcador verifica y da logros (Cálculo IV)", r[0] === 200 && r[1].verified.earned.includes("MAT-360") && r[1].verified.via === "bookmark" && typeof r[1].verified.pct === "number", r);
r = await call("GET", "/api/user", tok("ana"));
ok("queda marcado como verificado por marcador", r[1].user.verifiedVia === "bookmark" && r[1].user.pct > 0, r[1].user);
r = await call("GET", `/api/profile?pid=${pid.ana}`, tok("bob"));
ok("otros ven la etiqueta en su perfil", r[1].profile.verifiedVia === "bookmark", r[1].profile);
r = await vcall(tok("ana"), { pending: pendAll, counts: { aprob: 6, insc: 0, pend: 5 } });
ok("contadores que no cuadran con la lista -> 400", r[0] === 400 && r[1].code === "contadores", r);
r = await vcall(tok("ana"), { pending: [] });
ok("lista vacía sospechosa -> 400", r[0] === 400, r);
r = await vcall(tok("dan"), { pending: [], counts: { aprob: 243, insc: 0, pend: 0 } });
ok("lista vacía con contadores en 0 (falsificación de 100 %) -> 400", r[0] === 400 && r[1].code === "sospechoso", r);
r = await call("GET", "/api/user", tok("dan"));
ok("... y no queda verificado ni gana logros", !r[1].user.verifiedAt && r[1].user.earned.length === 0 && r[1].user.pct === null, { v: r[1].user.verifiedAt, e: r[1].user.earned.length, pct: r[1].user.pct });
const derCodes = PENSUMS.DER.cuatrimestres.flatMap(c => c.materias.map(m => m.c)).filter(c => /^[A-Z]{2,4}-\d{3}$/.test(c));
const before = (await call("GET", "/api/user", tok("ana")))[1].user.earned.length;
r = await vcall(tok("ana"), { pending: derCodes });
ok("pendientes de otra carrera: mismatch y no se otorga nada", r[0] === 200 && r[1].verified.mismatch === true && r[1].verified.earned.length === 0, r);
r = await call("GET", "/api/user", tok("ana"));
ok("... y no cambia lo que ya tenía", r[1].user.earned.length === before, r[1].user.earned.length);
r = await vcall(tok("ana"), { pending: [...pendAll, ...Array.from({ length: 9 }, (_, i) => "ZZZ-00" + (i + 1))] });
ok("el avance no puede retroceder de golpe -> 409", r[0] === 409, r);
let last; for (let i = 0; i < 3; i++) last = await vcall(tok("ana"), { pending: pendAll });
ok("límite de intentos por hora -> 429", last[0] === 429, last);


// ===== auditoría run-2: evidencia de reportes (N-04) y topes atómicos (N-12) =====
for (const [u, n] of [["fay", "Fay Luna"], ["gus", "Gus Peña"], ["hal", "Hal Ríos"], ["ivy", "Ivy Sol"]]) await call("PUT", "/api/user", tok(u), prof(n, "ISC"));
for (const u of ["fay", "gus", "hal", "ivy"]) pid[u] = (await call("GET", "/api/user", tok(u)))[1].user.pid;

// N-04: el reporte guarda el texto; borrar o editar después no destruye la evidencia
await sleep(1300);
r = await call("POST", "/api/chat", tok("fay"), { room: "general", text: "texto original que molesta a alguien" });
const fayMsg = r[1].id;
r = await call("POST", "/api/chat/report", tok("gus"), { id: fayMsg, reason: "acoso" });
ok("N-04: Gus reporta el mensaje de Fay", r[0] === 200, r);
r = await call("PATCH", "/api/chat", tok("fay"), { id: fayMsg, text: "texto suave" });
ok("N-04: Fay edita su mensaje después del reporte (sigue permitido)", r[0] === 200, r);
let rep = (await call("GET", "/api/chat/reports", bossTok()))[1].reports.find(x => x.id === fayMsg);
ok("N-04: la cola muestra el texto ORIGINAL y marca que se editó", rep && rep.text === "texto original que molesta a alguien" && rep.edited === true && !rep.selfDeleted, rep || null);
r = await call("DELETE", `/api/chat?id=${fayMsg}`, tok("fay"));
rep = (await call("GET", "/api/chat/reports", bossTok()))[1].reports.find(x => x.id === fayMsg);
ok("N-04: si Fay lo borra, sigue en la cola con el texto original y marcado", r[0] === 200 && rep && rep.selfDeleted === true && rep.text === "texto original que molesta a alguien", rep || null);
r = await call("POST", "/api/chat/report", tok("hal"), { id: fayMsg, reason: "x" });
ok("N-04: no se puede reportar un mensaje ya borrado (409)", r[0] === 409 && r[1].code === "oculto", r);
r = await call("DELETE", `/api/chat?id=${fayMsg}`, bossTok());
rep = (await call("GET", "/api/chat/reports", bossTok()))[1].reports.find(x => x.id === fayMsg);
ok("N-04: el equipo lo archiva y sale de la cola", r[0] === 200 && !rep, rep || null);

// N-12: el máximo de amigos se aplica también al aceptar y a la auto-aceptación
const t0 = Date.now();
for (let i = 0; i < 300; i++) sq.prepare("INSERT INTO friendships (from_uid, to_uid, status, created_at) VALUES (?, 'hal', 'accepted', ?)").run("relleno" + i, t0);
r = await call("POST", "/api/friends", tok("ivy"), { action: "request", pid: pid.hal });
ok("N-12: Ivy puede pedirle amistad a Hal (Ivy no está llena)", r[0] === 200 && r[1].rel === "sent", r);
r = await call("POST", "/api/friends", tok("hal"), { action: "accept", pid: pid.ivy });
ok("N-12: Hal (300 amigos) no puede aceptar -> 409", r[0] === 409 && r[1].code === "limite", r);
r = await call("POST", "/api/friends", tok("hal"), { action: "request", pid: pid.ivy });
ok("N-12: tampoco por auto-aceptación -> 409", r[0] === 409 && r[1].code === "limite", r);
sq.prepare("DELETE FROM friendships WHERE from_uid LIKE 'relleno%'").run();

// N-12: tope de 50 miembros y de 10 grupos dentro de la inserción
await call("POST", "/api/friends", tok("fay"), { action: "request", pid: pid.gus });
await call("POST", "/api/friends", tok("gus"), { action: "accept", pid: pid.fay });
r = await call("POST", "/api/groups", tok("fay"), { action: "create", name: "Grupo lleno" });
const fullGid = r[1].id;
for (let i = 0; i < 49; i++) sq.prepare("INSERT INTO group_members (gid, uid, role, joined_at) VALUES (?, ?, 'member', ?)").run(fullGid, "socio" + i, t0);
r = await call("POST", "/api/groups", tok("fay"), { action: "add", id: fullGid, pid: pid.gus });
ok("N-12: grupo con 50 personas -> no se puede agregar (409)", r[0] === 409 && r[1].code === "limite", r);
const cnt = sq.prepare("SELECT COUNT(*) AS n FROM group_members WHERE gid = ?").get(fullGid).n;
ok("N-12: ... y sigue en 50", cnt === 50, cnt);
for (let i = 0; i < 9; i++) await call("POST", "/api/groups", tok("fay"), { action: "create", name: "G" + i });
r = await call("POST", "/api/groups", tok("fay"), { action: "create", name: "Once" });
ok("N-12: el grupo número 11 se rechaza (429)", r[0] === 429 && r[1].code === "limite", r);
ok("N-12: ... y Fay tiene exactamente 10 grupos", sq.prepare("SELECT COUNT(*) AS n FROM chat_groups WHERE owner_uid = 'fay'").get().n === 10);

// N-11: el límite de mensajes no se salta con peticiones en paralelo
await sleep(1300);
const burst = await Promise.all(Array.from({ length: 12 }, (_, i) => call("POST", "/api/chat", tok("ivy"), { room: "general", text: "ráfaga " + i })));
ok("N-11: de 12 mensajes enviados a la vez solo pasa 1 (los demás 429)", burst.filter(x => x[0] === 200).length === 1 && burst.filter(x => x[0] === 429).length === 11, burst.map(x => x[0]));

// N-16: la rama since también oculta lo editado por alguien bloqueado
await sleep(1300);
r = await call("POST", "/api/chat", tok("gus"), { room: "general", text: "mensaje de Gus" });
const gusMsg = r[1].id;
await call("POST", "/api/chat/block", tok("hal"), { pid: pid.gus, on: true });
const since0 = Date.now() - 1;
await sleep(5);
await call("PATCH", "/api/chat", tok("gus"), { id: gusMsg, text: "mensaje de Gus editado" });
r = await call("GET", `/api/chat?room=general&since=${since0}&after=${gusMsg + 100}`, tok("hal"));
ok("N-16: quien bloqueó no recibe el mensaje editado del bloqueado", r[0] === 200 && !r[1].edited.some(m => m.id === gusMsg), r[1].edited.map(m => m.id));
r = await call("GET", `/api/chat?room=general&since=${since0}&after=${gusMsg + 100}`, tok("ivy"));
ok("N-16: los demás sí lo reciben", r[1].edited.some(m => m.id === gusMsg), r[1].edited.map(m => m.id));

// N-09: si lo degradan mientras guarda su perfil, no se queda con el marco MOD
await call("POST", "/api/mods", bossTok(), { pid: pid.dan, on: true });
const realPrepare = env.DB.prepare;
env.DB.prepare = (q) => { if (q.startsWith("UPDATE users SET frame")) sq.prepare("UPDATE users SET is_mod = 0 WHERE uid = 'dan'").run(); return realPrepare.call(env.DB, q); };
r = await call("PUT", "/api/user", tok("dan"), { fields: { frame: "MOD-1" } });
env.DB.prepare = realPrepare;
const danRow = sq.prepare("SELECT frame, is_mod FROM users WHERE uid = 'dan'").get();
ok("N-09: degradado a mitad del guardado -> 403 y sin marco MOD", r[0] === 403 && danRow.frame !== "MOD-1" && danRow.is_mod === 0, { status: r[0], ...danRow });
r = await call("POST", "/api/mods", bossTok(), { pid: pid.dan, on: "false" });
ok("N-09: 'on' solo cuenta si es true de verdad (el texto \"false\" no nombra moderador)", r[1].role === null && sq.prepare("SELECT is_mod FROM users WHERE uid = 'dan'").get().is_mod === 0, r[1]);

finish();
