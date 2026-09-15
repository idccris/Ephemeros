export function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.end(JSON.stringify(body));
}

export function allowMethods(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader("Allow", methods.join(", "));
  json(res, 405, { error: "Método não permitido." });
  return false;
}

export function requireSameOrigin(req, res) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return true;
  const origin = req.headers.origin;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!origin || !host) return true;
  try {
    if (new URL(origin).host === host) return true;
  } catch {}
  json(res, 403, { error: "Origem inválida." });
  return false;
}

export function getIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim()
    .slice(0, 80);
}

export function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}
