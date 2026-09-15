import { db } from "./_lib/db.js";
import { requireUser } from "./_lib/auth.js";
import { allowMethods, json, requireSameOrigin } from "./_lib/http.js";

const STATUSES = new Set(["recebido","briefing","criacao","revisao","aprovado","agendado","publicado","cancelado"]);

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET", "POST", "PATCH"]) || !requireSameOrigin(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;
  const sql = db();

  if (req.method === "GET") {
    const rows = user.role === "admin"
      ? await sql`
          SELECT r.*, u.username, u.display_name FROM post_requests r
          JOIN portal_users u ON u.id = r.user_id
          ORDER BY r.publication_date ASC, r.created_at DESC
        `
      : await sql`
          SELECT r.*, u.username, u.display_name FROM post_requests r
          JOIN portal_users u ON u.id = r.user_id
          WHERE r.user_id = ${user.id}
          ORDER BY r.publication_date ASC, r.created_at DESC
        `;
    return json(res, 200, { requests: rows.map(serialize) });
  }

  if (req.method === "POST") {
    if (user.must_change_password) return json(res, 403, { error: "Troque sua senha temporária antes de criar uma solicitação." });
    const financial = await sql`SELECT financial_status, amount_due, payment_due_date FROM portal_users WHERE id = ${user.id} LIMIT 1`;
    const account = financial[0];
    const overdue = account?.financial_status === "overdue";
    if (overdue) return json(res, 403, { error: "Novas solicitações estão temporariamente indisponíveis devido a um pagamento em atraso." });
    const body = sanitize(req.body);
    if (!body.title || !body.platforms || !body.contentFormat || !body.objective || !body.details || !body.publicationDate) {
      return json(res, 400, { error: "Preencha todos os campos obrigatórios." });
    }
    const date = new Date(`${body.publicationDate}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return json(res, 400, { error: "Informe uma data válida." });
    const rows = await sql`
      INSERT INTO post_requests (user_id, title, platforms, content_format, objective, details, caption_notes, reference_links, publication_date)
      VALUES (${user.id}, ${body.title}, ${body.platforms}, ${body.contentFormat}, ${body.objective}, ${body.details}, ${body.captionNotes}, ${body.referenceLinks}, ${body.publicationDate})
      RETURNING *
    `;
    return json(res, 201, { request: serialize({ ...rows[0], username: user.username, display_name: user.display_name }) });
  }

  if (user.role !== "admin") return json(res, 403, { error: "Somente administradores podem atualizar solicitações." });
  const id = String(req.body?.id || "");
  const status = String(req.body?.status || "");
  if (!/^\d+$/.test(id) || !STATUSES.has(status)) return json(res, 400, { error: "Solicitação ou status inválido." });
  const rows = await sql`
    UPDATE post_requests SET status = ${status}, updated_at = NOW() WHERE id = ${id} RETURNING *
  `;
  if (!rows[0]) return json(res, 404, { error: "Solicitação não encontrada." });
  return json(res, 200, { request: serialize(rows[0]) });
}

function trim(value, max) { return String(value || "").trim().slice(0, max); }
function sanitize(body = {}) {
  return {
    title: trim(body.title, 140), platforms: trim(body.platforms, 160), contentFormat: trim(body.contentFormat, 80),
    objective: trim(body.objective, 500), details: trim(body.details, 5000), captionNotes: trim(body.captionNotes, 2500),
    referenceLinks: trim(body.referenceLinks, 2500), publicationDate: trim(body.publicationDate, 10)
  };
}
function serialize(row) {
  return {
    id: String(row.id), userId: String(row.user_id), username: row.username, clientName: row.display_name,
    title: row.title, platforms: row.platforms, contentFormat: row.content_format, objective: row.objective,
    details: row.details, captionNotes: row.caption_notes, referenceLinks: row.reference_links,
    publicationDate: row.publication_date, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at
  };
}
