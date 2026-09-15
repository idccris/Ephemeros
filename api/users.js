import { db } from "./_lib/db.js";
import { hashPassword, requireUser } from "./_lib/auth.js";
import { allowMethods, json, normalizeUsername, requireSameOrigin } from "./_lib/http.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET", "POST", "PATCH"]) || !requireSameOrigin(req, res)) return;
  const admin = await requireUser(req, res, "admin");
  if (!admin) return;
  const sql = db();

  if (req.method === "GET") {
    const rows = await sql`
      SELECT id, username, display_name, email, role, active, must_change_password, created_at
      FROM portal_users ORDER BY role ASC, display_name ASC
    `;
    return json(res, 200, { users: rows.map(serialize) });
  }

  if (req.method === "POST") {
    const username = normalizeUsername(req.body?.username);
    const displayName = String(req.body?.displayName || "").trim().slice(0, 120);
    const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 200) || null;
    const password = String(req.body?.password || "");
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) return json(res, 400, { error: "Use de 3 a 40 caracteres no usuário: letras, números, ponto, hífen ou sublinhado." });
    if (!displayName) return json(res, 400, { error: "Informe o nome do cliente." });
    if (password.length < 10) return json(res, 400, { error: "A senha temporária deve ter pelo menos 10 caracteres." });
    const secured = await hashPassword(password);
    try {
      const rows = await sql`
        INSERT INTO portal_users (username, display_name, email, password_hash, password_salt, role, must_change_password)
        VALUES (${username}, ${displayName}, ${email}, ${secured.hash}, ${secured.salt}, 'client', TRUE)
        RETURNING id, username, display_name, email, role, active, must_change_password, created_at
      `;
      return json(res, 201, { user: serialize(rows[0]) });
    } catch (error) {
      if (String(error).includes("unique")) return json(res, 409, { error: "Esse nome de usuário já existe." });
      throw error;
    }
  }

  const id = String(req.body?.id || "");
  if (!/^\d+$/.test(id)) return json(res, 400, { error: "Usuário inválido." });
  if (id === String(admin.id) && req.body?.active === false) return json(res, 400, { error: "Você não pode desativar seu próprio acesso." });
  const active = Boolean(req.body?.active);
  const rows = await sql`
    UPDATE portal_users SET active = ${active}, updated_at = NOW()
    WHERE id = ${id} AND role = 'client'
    RETURNING id, username, display_name, email, role, active, must_change_password, created_at
  `;
  if (!rows[0]) return json(res, 404, { error: "Cliente não encontrado." });
  return json(res, 200, { user: serialize(rows[0]) });
}

function serialize(row) {
  return { id: String(row.id), username: row.username, displayName: row.display_name, email: row.email, role: row.role, active: row.active, mustChangePassword: row.must_change_password, createdAt: row.created_at };
}
