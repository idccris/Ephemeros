import { db, ensureSchema } from "./_lib/db.js";
import { json, allowMethods, getIp, normalizeUsername, requireSameOrigin } from "./_lib/http.js";
import { ensureAdmin, setSession, verifyPassword } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"]) || !requireSameOrigin(req, res)) return;
  try {
    await ensureSchema();
    await ensureAdmin();
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || "");
    if (!username || !password) return json(res, 400, { error: "Informe usuário e senha." });

    const sql = db();
    const ip = getIp(req);
    const attempts = await sql`
      SELECT COUNT(*)::int AS total FROM login_attempts
      WHERE username = ${username} AND ip = ${ip} AND attempted_at > NOW() - INTERVAL '15 minutes'
    `;
    if ((attempts[0]?.total || 0) >= 8) {
      return json(res, 429, { error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." });
    }

    const rows = await sql`
      SELECT id, username, display_name, email, password_hash, password_salt, role, active, must_change_password
      FROM portal_users WHERE username = ${username} LIMIT 1
    `;
    const user = rows[0];
    const valid = user?.active && await verifyPassword(password, user.password_salt, user.password_hash);
    if (!valid) {
      await sql`INSERT INTO login_attempts (username, ip) VALUES (${username}, ${ip})`;
      return json(res, 401, { error: "Usuário ou senha incorretos." });
    }

    await sql`DELETE FROM login_attempts WHERE username = ${username} AND ip = ${ip}`;
    setSession(res, user);
    return json(res, 200, {
      user: { id: String(user.id), username: user.username, displayName: user.display_name, role: user.role, mustChangePassword: user.must_change_password }
    });
  } catch (error) {
    console.error("login_error", error);
    return json(res, 500, { error: "A Central do Cliente está temporariamente indisponível." });
  }
}
