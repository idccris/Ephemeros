import { clearSession } from "./_lib/auth.js";
import { allowMethods, json, requireSameOrigin } from "./_lib/http.js";

export default function handler(req, res) {
  if (!allowMethods(req, res, ["POST"]) || !requireSameOrigin(req, res)) return;
  clearSession(res);
  return json(res, 200, { ok: true });
}
