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
      SELECT id, username, display_name, email, role, active, must_change_password, created_at,
             financial_status, amount_paid, amount_due, payment_due_date
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
        RETURNING id, username, display_name, email, role, active, must_change_password, created_at,
                  financial_status, amount_paid, amount_due, payment_due_date
      `;
      return json(res, 201, { user: serialize(rows[0]) });
    } catch (error) {
      if (String(error).includes("unique")) return json(res, 409, { error: "Esse nome de usuário já existe." });
      throw error;
    }
  }

  const id = String(req.body?.id || "");
  if (!/^\d+$/.test(id)) return json(res, 400, { error: "Usuário inválido." });
  const currentRows = await sql`SELECT * FROM portal_users WHERE id = ${id} AND role = 'client' LIMIT 1`;
  const current = currentRows[0];
  if (!current) return json(res, 404, { error: "Cliente não encontrado." });
  const username = normalizeUsername(req.body?.username ?? current.username);
  const displayName = String(req.body?.displayName ?? current.display_name).trim().slice(0, 120);
  const email = String(req.body?.email ?? current.email ?? "").trim().toLowerCase().slice(0, 200) || null;
  const active = typeof req.body?.active === "boolean" ? req.body.active : current.active;
  const password = String(req.body?.password || "");
  const financialStatus = ["ok", "pending", "overdue"].includes(req.body?.financialStatus) ? req.body.financialStatus : current.financial_status;
  const amountPaid = money(req.body?.amountPaid, current.amount_paid);
  const amountDue = money(req.body?.amountDue, current.amount_due);
  const paymentDueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.paymentDueDate || "")) ? req.body.paymentDueDate : null;
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return json(res, 400, { error: "Use de 3 a 40 caracteres no usuário: letras, números, ponto, hífen ou sublinhado." });
  if (!displayName) return json(res, 400, { error: "Informe o nome do cliente." });
  if (password && password.length < 10) return json(res, 400, { error: "A nova senha deve ter pelo menos 10 caracteres." });
  const secured = password ? await hashPassword(password) : null;
  try {
    const rows = await sql`
      UPDATE portal_users SET
        username = ${username}, display_name = ${displayName}, email = ${email}, active = ${active},
        financial_status = ${financialStatus}, amount_paid = ${amountPaid}, amount_due = ${amountDue}, payment_due_date = ${paymentDueDate},
        password_hash = ${secured?.hash || current.password_hash},
        password_salt = ${secured?.salt || current.password_salt},
        must_change_password = ${password ? true : current.must_change_password},
        updated_at = NOW()
      WHERE id = ${id} AND role = 'client'
      RETURNING id, username, display_name, email, role, active, must_change_password, created_at,
                financial_status, amount_paid, amount_due, payment_due_date
    `;
    return json(res, 200, { user: serialize(rows[0]) });
  } catch (error) {
    if (String(error).includes("unique")) return json(res, 409, { error: "Esse nome de usuário já existe." });
    throw error;
  }
}

function serialize(row) {
  return {
    id: String(row.id), username: row.username, displayName: row.display_name, email: row.email, role: row.role,
    active: row.active, mustChangePassword: row.must_change_password, createdAt: row.created_at,
    financialStatus: row.financial_status || "ok", amountPaid: Number(row.amount_paid || 0),
    amountDue: Number(row.amount_due || 0), paymentDueDate: row.payment_due_date
  };
}

function money(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 9999999999 ? parsed.toFixed(2) : Number(fallback || 0).toFixed(2);
}
