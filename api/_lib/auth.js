import { createHmac, timingSafeEqual, scrypt as scryptCallback, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { db, ensureSchema } from "./db.js";
import { json } from "./http.js";

const scrypt = promisify(scryptCallback);
const COOKIE = "ephemeros_session";
const SESSION_SECONDS = 60 * 60 * 12;

function secret() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET precisa ter pelo menos 32 caracteres");
  }
  return process.env.SESSION_SECRET;
}

function encode(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(payload) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").filter(Boolean).map((item) => {
    const index = item.indexOf("=");
    return [item.slice(0, index).trim(), decodeURIComponent(item.slice(index + 1))];
  }));
}

export async function hashPassword(password, suppliedSalt) {
  const salt = suppliedSalt || randomBytes(16).toString("hex");
  const result = await scrypt(String(password), salt, 64);
  return { salt, hash: Buffer.from(result).toString("hex") };
}

export async function verifyPassword(password, salt, expectedHash) {
  const { hash } = await hashPassword(password, salt);
  const actual = Buffer.from(hash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function ensureAdmin() {
  await ensureSchema();
  const username = String(process.env.ADMIN_USERNAME || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");
  if (!username || password.length < 12) return;
  const sql = db();
  const existing = await sql`SELECT id FROM portal_users WHERE role = 'admin' LIMIT 1`;
  if (existing.length) return;
  const secured = await hashPassword(password);
  await sql`
    INSERT INTO portal_users (username, display_name, email, password_hash, password_salt, role, must_change_password)
    VALUES (${username}, ${process.env.ADMIN_NAME || "Equipe Ephemeros"}, ${process.env.ADMIN_EMAIL || null}, ${secured.hash}, ${secured.salt}, 'admin', TRUE)
    ON CONFLICT (username) DO NOTHING
  `;
}

export function setSession(res, user) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = encode(JSON.stringify({ id: String(user.id), role: user.role, exp: expires }));
  const token = `${payload}.${sign(payload)}`;
  res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`);
}

export function clearSession(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

export async function getSessionUser(req) {
  try {
    const token = parseCookies(req)[COOKIE];
    if (!token) return null;
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expected = Buffer.from(sign(payload));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;
    await ensureSchema();
    const sql = db();
    const rows = await sql`
      SELECT id, username, display_name, email, role, active, must_change_password,
             financial_status, amount_paid, amount_due, payment_due_date, billing_type
             , plan_name, plan_version, plan_terms
      FROM portal_users WHERE id = ${session.id} LIMIT 1
    `;
    const user = rows[0];
    return user?.active ? user : null;
  } catch {
    return null;
  }
}

export async function requireUser(req, res, role) {
  const user = await getSessionUser(req);
  if (!user) {
    json(res, 401, { error: "Faça login para continuar." });
    return null;
  }
  if (role && user.role !== role) {
    json(res, 403, { error: "Você não tem permissão para esta ação." });
    return null;
  }
  return user;
}
