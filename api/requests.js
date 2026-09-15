import { db } from "./_lib/db.js";
import { requireUser } from "./_lib/auth.js";
import { allowMethods, getIp, json, requireSameOrigin } from "./_lib/http.js";

const STATUSES = new Set(["recebido","briefing","criacao","revisao","aprovado","agendado","publicado","cancelado"]);

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET", "POST", "PATCH"]) || !requireSameOrigin(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;
  const sql = db();

  if (req.method === "GET") {
    const rows = user.role === "admin"
      ? await sql`
          SELECT r.*, u.username, u.display_name,
                 a.id AS acceptance_id, a.plan_name AS accepted_plan_name, a.plan_version AS accepted_plan_version,
                 a.accepted_at, a.accepted_ip, a.revoked_at, a.revoke_reason
          FROM post_requests r
          JOIN portal_users u ON u.id = r.user_id
          LEFT JOIN request_plan_acceptances a ON a.request_id = r.id
          ORDER BY r.publication_date ASC, r.created_at DESC
        `
      : await sql`
          SELECT r.*, u.username, u.display_name,
                 a.id AS acceptance_id, a.plan_name AS accepted_plan_name, a.plan_version AS accepted_plan_version,
                 a.accepted_at, a.revoked_at, a.revoke_reason
          FROM post_requests r
          JOIN portal_users u ON u.id = r.user_id
          LEFT JOIN request_plan_acceptances a ON a.request_id = r.id
          WHERE r.user_id = ${user.id}
          ORDER BY r.publication_date ASC, r.created_at DESC
        `;
    return json(res, 200, { requests: rows.map(serialize) });
  }

  if (req.method === "POST") {
    if (user.must_change_password) return json(res, 403, { error: "Troque sua senha temporária antes de criar uma solicitação." });
    const financial = await sql`SELECT financial_status, amount_due, payment_due_date, plan_name, plan_version, plan_terms, display_name, username, email FROM portal_users WHERE id = ${user.id} LIMIT 1`;
    const account = financial[0];
    const overdue = account?.financial_status === "overdue";
    if (overdue) return json(res, 403, { error: "Novas solicitações estão temporariamente indisponíveis devido a um pagamento em atraso." });
    const body = sanitize(req.body);
    if (!body.planAccepted) return json(res, 400, { error: "É necessário ler e aceitar o Plano Atual antes de enviar a solicitação." });
    if (!body.title || !body.platforms || !body.contentFormat || !body.objective || !body.details || !body.publicationDate) {
      return json(res, 400, { error: "Preencha todos os campos obrigatórios." });
    }
    const date = new Date(`${body.publicationDate}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return json(res, 400, { error: "Informe uma data válida." });
    const contractTerms = account.plan_terms || "Condições do plano conforme a proposta comercial vigente entre as partes.";
    const contract = JSON.stringify({ clientName:account.display_name, username:account.username, email:account.email || "Não informado", planName:account.plan_name, planVersion:account.plan_version, terms:contractTerms });
    const acceptedIp = getIp(req);
    let created;
    await sql.begin(async (tx) => {
      const rows = await tx`
        INSERT INTO post_requests (user_id, title, platforms, content_format, objective, details, caption_notes, reference_links, publication_date)
        VALUES (${user.id}, ${body.title}, ${body.platforms}, ${body.contentFormat}, ${body.objective}, ${body.details}, ${body.captionNotes}, ${body.referenceLinks}, ${body.publicationDate})
        RETURNING *
      `;
      const acceptance = await tx`
        INSERT INTO request_plan_acceptances (request_id, user_id, plan_name, plan_version, contract_snapshot, accepted_ip)
        VALUES (${rows[0].id}, ${user.id}, ${account.plan_name}, ${account.plan_version}, ${contract}, ${acceptedIp})
        RETURNING id, accepted_at
      `;
      created = { ...rows[0], username:user.username, display_name:user.display_name, acceptance_id:acceptance[0].id, accepted_plan_name:account.plan_name, accepted_plan_version:account.plan_version, accepted_at:acceptance[0].accepted_at };
    });
    return json(res, 201, { request: serialize(created) });
  }

  if (user.role !== "admin") return json(res, 403, { error: "Somente administradores podem atualizar solicitações." });
  const id = String(req.body?.id || "");
  if (req.body?.action === "revokeAcceptance") {
    const reason = trim(req.body?.reason, 1000);
    if (!/^\d+$/.test(id) || reason.length < 5) return json(res, 400, { error: "Informe uma justificativa para invalidar o aceite." });
    const rows = await sql`
      UPDATE request_plan_acceptances SET revoked_at = NOW(), revoked_by = ${user.id}, revoke_reason = ${reason}
      WHERE request_id = ${id} AND revoked_at IS NULL RETURNING id, revoked_at, revoke_reason
    `;
    if (!rows[0]) return json(res, 404, { error: "Aceite não encontrado ou já invalidado." });
    return json(res, 200, { acceptance: { id:String(rows[0].id), revokedAt:rows[0].revoked_at, revokeReason:rows[0].revoke_reason } });
  }
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
    referenceLinks: trim(body.referenceLinks, 2500), publicationDate: trim(body.publicationDate, 10),
    planAccepted: body.planAccepted === true || body.planAccepted === "true"
  };
}
function serialize(row) {
  return {
    id: String(row.id), userId: String(row.user_id), username: row.username, clientName: row.display_name,
    title: row.title, platforms: row.platforms, contentFormat: row.content_format, objective: row.objective,
    details: row.details, captionNotes: row.caption_notes, referenceLinks: row.reference_links,
    publicationDate: row.publication_date, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
    acceptance: row.acceptance_id ? { id:String(row.acceptance_id), planName:row.accepted_plan_name, planVersion:row.accepted_plan_version,
      acceptedAt:row.accepted_at, acceptedIp:row.accepted_ip || null, revokedAt:row.revoked_at || null, revokeReason:row.revoke_reason || null } : null
  };
}
