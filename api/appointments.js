import { db, ensureSchema } from "./_lib/db.js";
import { requireUser } from "./_lib/auth.js";
import { allowMethods, getIp, json, requireSameOrigin } from "./_lib/http.js";

const STATUSES = new Set(["pending", "confirmed", "cancelled"]);
const TIMES = new Set(Array.from({ length: 16 }, (_, index) => {
  const minutes = 9 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}));

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET", "POST", "PATCH"]) || !requireSameOrigin(req, res)) return;
  await ensureSchema();
  const sql = db();

  if (req.method === "GET" && req.query?.view === "admin") {
    const admin = await requireUser(req, res, "admin");
    if (!admin) return;
    const rows = await sql`SELECT * FROM meeting_appointments ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END, meeting_date ASC, meeting_time ASC, created_at DESC`;
    return json(res, 200, { appointments: rows.map(serialize) });
  }

  if (req.method === "GET") {
    const month = String(req.query?.month || "");
    if (!/^\d{4}-\d{2}$/.test(month)) return json(res, 400, { error: "Mês inválido." });
    const rows = await sql`
      SELECT meeting_date, meeting_time FROM meeting_appointments
      WHERE TO_CHAR(meeting_date, 'YYYY-MM') = ${month} AND status <> 'cancelled'
      ORDER BY meeting_date, meeting_time
    `;
    return json(res, 200, { occupied: rows.map((row) => ({ date: dateOnly(row.meeting_date), time: timeOnly(row.meeting_time) })) });
  }

  if (req.method === "PATCH") {
    const admin = await requireUser(req, res, "admin");
    if (!admin) return;
    const id = String(req.body?.id || "");
    const status = String(req.body?.status || "");
    if (!/^\d+$/.test(id) || !STATUSES.has(status)) return json(res, 400, { error: "Agendamento ou status inválido." });
    try {
      const rows = await sql`UPDATE meeting_appointments SET status = ${status}, updated_at = NOW() WHERE id = ${id} RETURNING *`;
      if (!rows[0]) return json(res, 404, { error: "Agendamento não encontrado." });
      return json(res, 200, { appointment: serialize(rows[0]) });
    } catch (error) {
      if (String(error).includes("meeting_appointments_slot_idx")) return json(res, 409, { error: "Este horário já está ocupado." });
      throw error;
    }
  }

  const body = sanitize(req.body);
  if (body.website) return json(res, 201, { appointment: null });
  if (!body.fullName || !validEmail(body.email) || body.phone.replace(/\D/g, "").length < 8) {
    return json(res, 400, { error: "Informe nome, e-mail e WhatsApp válidos." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.meetingDate) || !TIMES.has(body.meetingTime)) {
    return json(res, 400, { error: "Escolha uma data e um horário válidos." });
  }
  const chosen = new Date(`${body.meetingDate}T${body.meetingTime}:00-03:00`);
  const maxDate = Date.now() + 91 * 24 * 60 * 60 * 1000;
  const weekday = new Date(`${body.meetingDate}T12:00:00Z`).getUTCDay();
  if (Number.isNaN(chosen.getTime()) || chosen.getTime() <= Date.now() + 60 * 60 * 1000 || chosen.getTime() > maxDate || weekday === 0 || weekday === 6) {
    return json(res, 400, { error: "Este horário não está disponível para agendamento." });
  }
  const ip = getIp(req);
  const recent = await sql`SELECT COUNT(*)::int AS count FROM meeting_appointments WHERE requester_ip = ${ip} AND created_at > NOW() - INTERVAL '1 hour'`;
  if (Number(recent[0]?.count || 0) >= 5) return json(res, 429, { error: "Limite de agendamentos atingido. Tente novamente mais tarde." });
  try {
    const rows = await sql`
      INSERT INTO meeting_appointments (meeting_date, meeting_time, start_at, full_name, email, phone, company, notes, requester_ip)
      VALUES (${body.meetingDate}, ${body.meetingTime}, (${body.meetingDate}::date + ${body.meetingTime}::time) AT TIME ZONE 'America/Sao_Paulo', ${body.fullName}, ${body.email}, ${body.phone}, ${body.company || null}, ${body.notes || null}, ${ip})
      RETURNING *
    `;
    return json(res, 201, { appointment: serialize(rows[0]) });
  } catch (error) {
    if (String(error).includes("meeting_appointments_slot_idx") || String(error).includes("duplicate key")) {
      return json(res, 409, { error: "Este horário acabou de ser reservado. Escolha outro horário." });
    }
    throw error;
  }
}

function trim(value, max) { return String(value || "").trim().slice(0, max); }
function sanitize(body = {}) {
  return {
    meetingDate: trim(body.meetingDate, 10), meetingTime: trim(body.meetingTime, 5), fullName: trim(body.fullName, 120),
    email: trim(body.email, 200).toLowerCase(), phone: trim(body.phone, 30), company: trim(body.company, 120),
    notes: trim(body.notes, 1000), website: trim(body.website, 200)
  };
}
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function dateOnly(value) { return String(value instanceof Date ? value.toISOString() : value).slice(0, 10); }
function timeOnly(value) { return String(value).slice(0, 5); }
function serialize(row) {
  return {
    id: String(row.id), meetingDate: dateOnly(row.meeting_date), meetingTime: timeOnly(row.meeting_time),
    durationMinutes: Number(row.duration_minutes), fullName: row.full_name, email: row.email, phone: row.phone,
    company: row.company, notes: row.notes, status: row.status, createdAt: row.created_at
  };
}
