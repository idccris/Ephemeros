const $ = (selector, root = document) => root.querySelector(selector);
const authView = $("#auth-view");
const clientView = $("#client-view");
const logoutButton = $("#logout");
let currentUser;

document.querySelectorAll(".theme-button").forEach((button) => button.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("ephemeros-theme", next);
}));

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
  return data;
}

function showMessage(form, message, success = false) {
  const target = $(".form-message", form);
  target.textContent = message;
  target.classList.toggle("success", success);
}

function setLoading(form, loading) {
  $('button[type="submit"]', form).disabled = loading;
}

async function loadSession() {
  try {
    const { user } = await api("/api/me");
    currentUser = user;
    if (user.role === "admin") {
      location.replace("/admin");
      return;
    }
    authView.classList.add("hidden");
    clientView.classList.remove("hidden");
    logoutButton.classList.remove("hidden");
    $("#client-name").textContent = user.displayName;
    $("#password-notice").classList.toggle("hidden", !user.mustChangePassword);
    $("#password-modal").classList.toggle("hidden", !user.mustChangePassword);
    renderFinance(user);
    await loadRequests();
  } catch {
    authView.classList.remove("hidden");
    clientView.classList.add("hidden");
    logoutButton.classList.add("hidden");
  }
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  showMessage(form, "");
  setLoading(form, true);
  try {
    const body = Object.fromEntries(new FormData(form));
    const { user } = await api("/api/login", { method: "POST", body: JSON.stringify(body) });
    location.replace(user.role === "admin" ? "/admin" : "/central");
  } catch (error) {
    showMessage(form, error.message);
  } finally {
    setLoading(form, false);
  }
});

$("#request-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  showMessage(form, "");
  setLoading(form, true);
  try {
    const body = Object.fromEntries(new FormData(form));
    await api("/api/requests", { method: "POST", body: JSON.stringify(body) });
    form.reset();
    closeRequestModal();
    await loadRequests();
  } catch (error) {
    showMessage(form, error.message);
  } finally {
    setLoading(form, false);
  }
});

$("#open-request").addEventListener("click", () => {
  if (currentUser?.mustChangePassword || currentUser?.financialStatus === "overdue") return;
  $("#request-modal").classList.remove("hidden");
  $("#request-form").elements.title.focus();
});

function closeRequestModal() {
  $("#request-modal").classList.add("hidden");
  showMessage($("#request-form"), "");
}

$(".request-modal-close").addEventListener("click", closeRequestModal);
$(".request-modal-cancel").addEventListener("click", closeRequestModal);
$("#request-modal").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeRequestModal();
});

$("#open-finance").addEventListener("click", () => $("#finance-modal").classList.remove("hidden"));
document.querySelectorAll(".finance-modal-close").forEach((button) => button.addEventListener("click", () => $("#finance-modal").classList.add("hidden")));
$("#finance-modal").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.classList.add("hidden");
});

$("#password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  showMessage(form, "");
  setLoading(form, true);
  try {
    const body = Object.fromEntries(new FormData(form));
    await api("/api/change-password", { method: "POST", body: JSON.stringify(body) });
    currentUser.mustChangePassword = false;
    $("#password-modal").classList.add("hidden");
    $("#password-notice").classList.add("hidden");
    renderFinance(currentUser);
    form.reset();
  } catch (error) {
    showMessage(form, error.message);
  } finally {
    setLoading(form, false);
  }
});

logoutButton.addEventListener("click", async () => {
  await api("/api/logout", { method: "POST", body: "{}" }).catch(() => {});
  location.replace("/central");
});

async function loadRequests() {
  const { requests } = await api("/api/requests");
  const upcoming = requests.filter((item) => !["publicado", "cancelado"].includes(item.status));
  $("#completed-count").textContent = requests.filter((item) => item.status === "publicado").length;
  $("#open-count").textContent = upcoming.length;
  $("#upcoming-total").textContent = upcoming.length + " publicaç" + (upcoming.length === 1 ? "ão" : "ões");
  const list = $("#request-list");
  list.replaceChildren();
  if (!upcoming.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Nenhuma publicação programada.";
    list.append(empty);
    return;
  }
  upcoming.slice(0, 10).forEach((item) => list.append(requestCard(item)));
}

function renderFinance(user) {
  const status = $("#finance-status");
  const labels = { ok:"Em dia", overdue:"Em atraso" };
  status.textContent = labels[user.financialStatus] || "Em dia";
  status.className = "finance-status " + (user.financialStatus || "ok");
  const referenceDate = user.paymentDueDate ? new Date(String(user.paymentDueDate).slice(0, 10) + "T12:00:00Z") : new Date();
  const month = new Intl.DateTimeFormat("pt-BR", { month:"long", year:"numeric", timeZone:"UTC" }).format(referenceDate);
  $("#finance-reference").textContent = "Pagamento " + month.charAt(0).toUpperCase() + month.slice(1);
  $("#finance-due-detail").textContent = user.paymentDueDate ? "Vencimento: " + formatDate(user.paymentDueDate) : "";
  $("#finance-detail-amount").textContent = formatCurrency(user.amountDue);
  const detailStatus = $("#finance-detail-status");
  const open = user.financialStatus === "overdue";
  detailStatus.textContent = open ? "Em aberto" : "Pago";
  detailStatus.className = "payment-status " + (open ? "open" : "paid");
  const button = $("#open-request");
  const blocked = user.financialStatus === "overdue" || user.mustChangePassword;
  button.disabled = blocked;
  $("#request-action-note").textContent = user.financialStatus === "overdue"
    ? "Indisponível: pagamento em atraso"
    : user.mustChangePassword ? "Troque sua senha para continuar" : "Enviar briefing de conteúdo";
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(Number(value || 0));
}

function requestCard(item) {
  const card = document.createElement("article");
  card.className = "request-card";
  const header = document.createElement("header");
  const content = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = item.title;
  const date = document.createElement("p");
  date.textContent = "Publicação: " + formatDate(item.publicationDate);
  const status = document.createElement("span");
  status.className = "status status-" + item.status;
  status.textContent = statusLabel(item.status);
  content.append(title, date);
  header.append(content, status);
  const meta = document.createElement("div");
  meta.className = "request-meta";
  [item.platforms, item.contentFormat].forEach((value) => {
    const chip = document.createElement("span");
    chip.textContent = value;
    meta.append(chip);
  });
  card.append(header, meta);
  return card;
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(String(value).slice(0, 10) + "T12:00:00Z"));
}

function statusLabel(value) {
  return ({ recebido:"Recebido", briefing:"Briefing", criacao:"Em criação", revisao:"Em revisão", aprovado:"Aprovado", agendado:"Agendado", publicado:"Publicado", cancelado:"Cancelado" })[value] || value;
}

loadSession();
