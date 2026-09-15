import { getSessionUser } from "./_lib/auth.js";
import { allowMethods, json } from "./_lib/http.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  const user = await getSessionUser(req);
  if (!user) return json(res, 401, { error: "Não autenticado." });
  return json(res, 200, {
    user: { id: String(user.id), username: user.username, displayName: user.display_name, email: user.email, role: user.role, mustChangePassword: user.must_change_password }
  });
}
