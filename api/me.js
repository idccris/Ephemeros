import { getSessionUser } from "./_lib/auth.js";
import { allowMethods, json } from "./_lib/http.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  const user = await getSessionUser(req);
  if (!user) return json(res, 401, { error: "Não autenticado." });
  return json(res, 200, {
    user: {
      id: String(user.id), username: user.username, displayName: user.display_name, email: user.email,
      role: user.role, mustChangePassword: user.must_change_password,
      financialStatus: effectiveFinancialStatus(user), amountPaid: Number(user.amount_paid || 0),
      amountDue: Number(user.amount_due || 0), paymentDueDate: user.payment_due_date,
      billingType: user.billing_type === "monthly" ? "monthly" : "one_time",
      planName: user.plan_name || "Plano atual", planVersion: user.plan_version || "1.0"
    }
  });
}

function effectiveFinancialStatus(user) {
  return user.financial_status === "overdue" ? "overdue" : "ok";
}
