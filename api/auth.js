// Cuentas de DropStats (independientes de Epic Games): crear cuenta, entrar, salir, borrar cuenta.
// GET  /api/auth            → { configured, user }
// POST /api/auth {action}   → register | login | logout | delete
import crypto from "node:crypto";
import { storeReady, redis, send, sameOrigin, readJSON, hashPassword, checkPassword, newToken, setSessionCookie, currentUser, clientIp, tooMany, SESSION_DAYS } from "./_lib.js";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export default async function handler(req, res) {
  if (!storeReady()) return send(res, 200, { configured: false, user: null });
  try {
    if (req.method === "GET") {
      const u = await currentUser(req);
      return send(res, 200, { configured: true, user: u ? { email: u.email } : null });
    }
    if (req.method !== "POST") return send(res, 405, { error: "method" });
    if (!sameOrigin(req)) return send(res, 403, { error: "origin" });
    const b = await readJSON(req, 10_000);
    const action = b.action;

    if (action === "logout") {
      const u = await currentUser(req);
      if (u) await redis("DEL", "sess:" + u.token);
      setSessionCookie(res, "", 0);
      return send(res, 200, { ok: true });
    }

    const email = String(b.email || "").trim().toLowerCase();
    const password = String(b.password || "");

    if (action === "register") {
      if (!EMAIL.test(email)) return send(res, 400, { error: "Escribe un correo válido." });
      if (password.length < 8 || password.length > 200) return send(res, 400, { error: "La contraseña debe tener al menos 8 caracteres." });
      if (await tooMany("rl:reg:" + clientIp(req), 10, 3600)) return send(res, 429, { error: "Demasiados intentos. Prueba dentro de una hora." });
      const id = crypto.randomBytes(12).toString("hex");
      const { salt, hash } = hashPassword(password);
      const ok = await redis("SET", "user:" + email, JSON.stringify({ id, email, salt, hash, created: Date.now() }), "NX");
      if (ok !== "OK") return send(res, 409, { error: "Ya existe una cuenta con ese correo. Entra con tu contraseña." });
      return startSession(res, { id, email });
    }

    if (action === "login") {
      if (!EMAIL.test(email) || !password) return send(res, 400, { error: "Escribe tu correo y tu contraseña." });
      if (await tooMany("rl:login:" + email, 8, 900) || await tooMany("rl:ip:" + clientIp(req), 40, 900))
        return send(res, 429, { error: "Demasiados intentos. Espera 15 minutos." });
      const raw = await redis("GET", "user:" + email);
      const u = raw && JSON.parse(raw);
      if (!u || !checkPassword(password, u.salt, u.hash)) return send(res, 401, { error: "Correo o contraseña incorrectos." });
      return startSession(res, { id: u.id, email: u.email });
    }

    if (action === "delete") {
      const s = await currentUser(req);
      if (!s) return send(res, 401, { error: "Tu sesión ha caducado. Vuelve a entrar." });
      const raw = await redis("GET", "user:" + s.email);
      const u = raw && JSON.parse(raw);
      if (!u || !checkPassword(password, u.salt, u.hash)) return send(res, 401, { error: "Contraseña incorrecta." });
      await redis("DEL", "user:" + s.email, "data:" + s.id, "sess:" + s.token);
      setSessionCookie(res, "", 0);
      return send(res, 200, { ok: true });
    }
    return send(res, 400, { error: "Acción no válida." });
  } catch (e) {
    return send(res, e.code || 500, { error: e.code === 413 ? "Datos demasiado grandes." : e.code === 415 ? "Formato no válido." : "Error del servidor. Inténtalo de nuevo." });
  }
}

async function startSession(res, user) {
  const token = newToken();
  await redis("SET", "sess:" + token, JSON.stringify(user), "EX", SESSION_DAYS * 86400);
  setSessionCookie(res, token);
  return send(res, 200, { ok: true, user: { email: user.email } });
}
