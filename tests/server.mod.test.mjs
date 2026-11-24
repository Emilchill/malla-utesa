// tests/server.mod.test.mjs — actualización de moderación: panel de cuentas, suspensiones del chat por tiempo,
// reinicio de cuentas (por el equipo y por la propia persona) y registro de moderación.
import { sq, ok, prof, call, tok, sleep, finish } from "./harness.mjs";

const bossTok = () => tok("boss", { email: "boss@x.com", email_verified: true });
const T = { boss: bossTok };
const pid = {};
for (const [u, n, c] of [["boss", "Jefe", "ISC"], ["mia", "Mia Mod", "ISC"], ["sol", "Sol Estudiante", "ISC"], ["leo", "Leo Estudiante", "DER"], ["noa", "Noa Mod", "ISC"]]) {
  if (!T[u]) T[u] = () => tok(u);
  await call("PUT", "/api/user", T[u](), prof(n, c));
  pid[u] = (await call("GET", "/api/user", T[u]()))[1].user.pid;
}
await call("POST", "/api/mods", T.boss(), { pid: pid.mia, on: true });
await call("POST", "/api/mods", T.boss(), { pid: pid.noa, on: true });

// ===== permisos del panel =====
let r = await call("GET", "/api/mod/accounts", T.sol());
ok("un estudiante no ve el panel de cuentas", r[0] === 403, r);
r = await call("GET", "/api/mod/summary", T.mia());
ok("un moderador ve el resumen", r[0] === 200 && r[1].summary.users >= 5 && r[1].owner === false, r[1]);
r = await call("GET", "/api/mod/accounts", T.mia());
ok("un moderador ve todas las cuentas (dueño primero)", r[0] === 200 && r[1].accounts.length === 5 && r[1].accounts[0].role === "owner", r[1].accounts.map(a => a.name));
ok("las cuentas no exponen uid ni correo", r[1].accounts.every(a => !("uid" in a) && !("email" in a) && /^[0-9a-f]{16}$/.test(a.pid)), r[1].accounts[0]);
r = await call("GET", "/api/mod/accounts?q=leo", T.mia());
ok("buscar cuentas por nombre (todas las carreras)", r[1].accounts.length === 1 && r[1].accounts[0].career === "DER", r[1].accounts);
r = await call("GET", "/api/mod/accounts?filter=staff", T.mia());
ok("filtro «equipo»", r[1].accounts.map(a => a.name).sort().join() === "Jefe,Mia Mod,Noa Mod", r[1].accounts.map(a => a.name));
r = await call("GET", "/api/mod/accounts?filter=xyz", T.mia());
ok("filtro inválido -> 400", r[0] === 400, r);

// ===== suspensiones =====
await call("POST", "/api/chat", T.sol(), { room: "general", text: "hola antes de la suspensión" });
r = await call("POST", "/api/mod/ban", T.mia(), { pid: pid.sol, minutes: 60, reason: "spam" });
ok("un moderador suspende a un estudiante 1 hora", r[0] === 200 && r[1].ban.until > Date.now() + 59 * 60000 && r[1].ban.reason === "spam", r);
r = await call("POST", "/api/chat", T.sol(), { room: "general", text: "intento escribir" });
ok("suspendido: no puede escribir en el chat (mensaje con la fecha y el motivo)", r[0] === 403 && r[1].code === "suspendido" && /spam/.test(r[1].message) && r[1].ban.until > Date.now(), r);
r = await call("GET", "/api/chat?room=general", T.sol());
ok("suspendido: sí puede leer, y el chat le dice que está suspendido", r[0] === 200 && r[1].ban && r[1].ban.reason === "spam", r[1].ban);
const sid = r[1].messages.find(m => m.text === "hola antes de la suspensión")?.id;
r = await call("PATCH", "/api/chat", T.sol(), { id: sid, text: "editado" });
ok("suspendido: tampoco puede editar", r[0] === 403 && r[1].code === "suspendido", r);
r = await call("GET", "/api/user", T.sol());
ok("su perfil también trae la suspensión", r[1].user.chatBan && r[1].user.chatBan.reason === "spam", r[1].user.chatBan);
r = await call("GET", "/api/mod/accounts?filter=banned", T.mia());
ok("filtro «suspendidas»", r[1].accounts.length === 1 && r[1].accounts[0].name === "Sol Estudiante" && r[1].accounts[0].ban.reason === "spam", r[1].accounts);
r = await call("POST", "/api/mod/ban", T.mia(), { pid: pid.noa, minutes: 60 });
ok("un moderador NO puede suspender a otro moderador", r[0] === 403, r);
r = await call("POST", "/api/mod/ban", T.mia(), { pid: pid.boss, minutes: 60 });
ok("nadie suspende al dueño", r[0] === 409, r);
r = await call("POST", "/api/mod/ban", T.mia(), { pid: pid.mia, minutes: 60 });
ok("nadie se suspende a sí mismo", r[0] === 400, r);
r = await call("POST", "/api/mod/ban", T.mia(), { pid: pid.leo, minutes: 0 });
ok("la suspensión indefinida es solo del dueño", r[0] === 400, r);
r = await call("POST", "/api/mod/ban", T.mia(), { pid: pid.leo, minutes: 7 });
ok("duración fuera de la lista -> 400", r[0] === 400, r);
r = await call("POST", "/api/mod/ban", T.boss(), { pid: pid.noa, minutes: 0, reason: "prueba" });
ok("el dueño suspende indefinidamente incluso a un moderador", r[0] === 200 && r[1].ban.until === null, r);
r = await call("POST", "/api/chat", T.noa(), { room: "general", text: "hola" });
ok("indefinida: el mensaje lo dice", r[0] === 403 && /indefinido/.test(r[1].message), r);
r = await call("POST", "/api/mod/unban", T.boss(), { pid: pid.noa });
ok("levantar suspensión", r[0] === 200 && (await call("POST", "/api/chat", T.noa(), { room: "general", text: "volví" }))[0] === 200, r);
// expira sola
sq.prepare("UPDATE chat_bans SET until = ? WHERE uid = 'sol'").run(Date.now() - 1);
await sleep(1300); // el límite normal de 1,2 s entre mensajes sigue aplicando
r = await call("POST", "/api/chat", T.sol(), { room: "general", text: "ya puedo" });
ok("la suspensión vence sola", r[0] === 200, r);

// ===== reinicio por el equipo =====
await call("PUT", "/api/user", T.leo(), { fields: { avatar: 'c1:{"k":"p","h":3}', done: ["DER-101"] } });
r = await call("POST", "/api/mod/reset", T.mia(), { pid: pid.leo, reason: "nombre ofensivo" });
ok("un moderador reinicia una cuenta", r[0] === 200, r);
r = await call("GET", "/api/user", T.leo());
ok("la cuenta reiniciada debe configurarse de nuevo (404 «reiniciado»)", r[0] === 404 && r[1].code === "reiniciado", r);
r = await call("GET", "/api/chat?room=general", T.leo());
ok("reiniciada: no entra al chat hasta configurarse", r[0] === 409 && r[1].code === "sin-perfil", r);
r = await call("GET", "/api/people?career=all&q=Estudiante", T.sol());
ok("reiniciada: no sale en el directorio mientras tanto", !r[1].people.some(p => p.pid === pid.leo), r[1].people.map(p => p.name));
r = await call("PUT", "/api/user", T.leo(), { fields: { theme: "utesa" } });
ok("reiniciada: guardar sin nombre y carrera -> 409", r[0] === 409, r);
r = await call("PUT", "/api/user", T.leo(), prof("Leo Nuevo", "ISC"));
const leo = (await call("GET", "/api/user", T.leo()))[1].user;
ok("al configurarse vuelve con el mismo pid, nombre nuevo y avance en cero", r[0] === 200 && leo.pid === pid.leo && leo.name === "Leo Nuevo" && leo.done.length === 0 && leo.career === "ISC", leo);
r = await call("POST", "/api/mod/reset", T.mia(), { pid: pid.noa });
ok("un moderador NO reinicia a otro moderador", r[0] === 403, r);
r = await call("POST", "/api/mod/reset", T.mia(), { pid: pid.mia });
ok("el panel no reinicia la propia cuenta (eso va por Configuración)", r[0] === 400, r);

// ===== reinicio por la propia persona =====
r = await call("POST", "/api/user/reset", T.mia(), {});
ok("reiniciar mi cuenta pide confirmación escrita", r[0] === 400 && r[1].code === "confirmar", r);
r = await call("POST", "/api/user/reset", T.mia(), { confirm: "REINICIAR" });
ok("reiniciar mi cuenta", r[0] === 200 && (await call("GET", "/api/user", T.mia()))[1].code === "reiniciado", r);
await call("PUT", "/api/user", T.mia(), prof("Mia Otra Vez", "ISC"));
r = await call("GET", "/api/user", T.mia());
ok("tras reiniciarse conserva su rol de moderadora", r[1].user.admin === true && r[1].user.name === "Mia Otra Vez", r[1].user);
r = await call("GET", "/api/mod/summary", T.sol());
ok("un estudiante no ve el resumen", r[0] === 403, r);

// ===== registro =====
r = await call("GET", "/api/mod/log", T.boss());
const acts = r[1].log.map(l => l.action);
ok("el registro anota suspensiones, levantamientos, reinicios y cambios de rol",
  ["suspender", "levantar", "reiniciar", "hacer-mod"].every(x => acts.includes(x)), acts);
ok("el registro dice quién lo hizo y a quién, sin uids", r[1].log.some(l => l.action === "suspender" && l.actorPid === pid.mia && l.target === "Sol Estudiante" && /spam/.test(l.detail)) && r[1].log.every(l => !("actor_uid" in l)), r[1].log.slice(0, 3));
r = await call("GET", "/api/mod/log", T.sol());
ok("un estudiante no ve el registro", r[0] === 403, r);
r = await call("POST", "/api/mod/ban", T.mia(), { pid: pid.sol, minutes: 60 }, undefined);
r = await call("GET", "/api/mod/accounts?q=sol", T.boss());
ok("la cuenta muestra mensajes y suspensión", r[1].accounts[0].msgs >= 2 && r[1].accounts[0].ban, r[1].accounts[0]);

// ===== cuentas eliminadas: registro y reactivación =====
await call("PUT", "/api/user", T.leo(), { fields: { done: ["MAT-170", "INF-164"] } });
sq.prepare("UPDATE users SET avatar = ? WHERE uid = 'leo'").run('c1:{"k":"p","h":5,"xh":1}'); // como si hubiera sido del equipo
r = await call("POST", "/api/users/delete", T.boss(), { pid: pid.leo, reason: "cuenta de prueba duplicada" });
ok("el dueño elimina una cuenta con motivo", r[0] === 200, r);
r = await call("GET", "/api/user", T.leo());
ok("la cuenta eliminada no puede entrar", r[0] === 403 && r[1].code === "eliminada", r);
r = await call("GET", "/api/mod/deleted", T.mia());
ok("un moderador no ve las eliminadas", r[0] === 403, r);
sq.prepare("INSERT INTO banned (uid, at) VALUES ('vieja', 1)").run(); // eliminada antes de este cambio (sin datos)
r = await call("GET", "/api/mod/deleted", T.boss());
const del = r[1].deleted.find(d => d.pid === pid.leo);
ok("el dueño ve la eliminada: nombre, carrera, motivo, quién y fecha", del && del.name === "Leo Nuevo" && del.career === "ISC" && del.reason === "cuenta de prueba duplicada" && del.by === "Jefe" && del.restorable === true, del);
const vieja = r[1].deleted.find(d => d.at === 1);
ok("las eliminadas antes del cambio salen con su pid calculado y sin copia", vieja && /^[0-9a-f]{16}$/.test(vieja.pid) && vieja.restorable === false && vieja.name === null, vieja);
r = await call("POST", "/api/mod/reactivate", T.mia(), { pid: pid.leo });
ok("un moderador no reactiva", r[0] === 403, r);
r = await call("POST", "/api/mod/reactivate", T.boss(), { pid: pid.leo });
ok("el dueño reactiva", r[0] === 200 && r[1].restored === true, r);
r = await call("GET", "/api/user", T.leo());
ok("vuelve con su nombre, carrera y avance, el mismo pid y sin artículos del equipo", r[0] === 200 && r[1].user.name === "Leo Nuevo" && r[1].user.pid === pid.leo && r[1].user.done.length === 2 && !/xh/.test(r[1].user.avatar || ""), r[1].user || r);
r = await call("GET", "/api/mod/deleted", T.boss());
ok("ya no sale en la lista de eliminadas", !r[1].deleted.some(d => d.pid === pid.leo), r[1].deleted);
r = await call("POST", "/api/mod/reactivate", T.boss(), { pid: vieja.pid });
ok("reactivar una vieja la deja entrar para configurar un perfil nuevo", r[0] === 200 && r[1].restored === false && (await call("GET", "/api/user", tok("vieja")))[0] === 404, r);
r = await call("GET", "/api/mod/log", T.boss());
ok("el registro anota eliminar (con motivo) y reactivar", r[1].log.some(l => l.action === "eliminar" && /duplicada/.test(l.detail)) && r[1].log.some(l => l.action === "reactivar"), r[1].log.slice(0, 4));

finish();
