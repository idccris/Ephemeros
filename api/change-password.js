import { db } from "./_lib/db.js";
import { hashPassword, requireUser, verifyPassword } from "./_lib/auth.js";
import { allowMethods, json, requireSameOrigin } from "./_lib/http.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"]) || !requireSameOrigin(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");
  if (newPassword.length < 10) return json(res, 400, { error: "A nova senha deve ter pelo menos 10 caracteres." });
  const sql = db();
  const rows = await sql`SELECT password_hash, password_salt FROM portal_users WHERE id = ${user.id} LIMIT 1`;
  if (!rows[0] || !await verifyPassword(currentPassword, rows[0].password_salt, rows[0].password_hash)) {
    return json(res, 401, { error: "Senha atual incorreta." });
  }
  const next = await hashPassword(newPassword);
  await sql`
    UPDATE portal_users SET password_hash = ${next.hash}, password_salt = ${next.salt}, must_change_password = FALSE, updated_at = NOW()
    WHERE id = ${user.id}
  `;
  return json(res, 200, { ok: true });
}
