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
    showMessage(form, "Solicitação enviada com sucesso.", true);
    await loadRequests();
  } catch (error) {
    showMessage(form, error.message);
  } finally {
    setLoading(form, false);
  }
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
  $("#total-count").textContent = requests.length;
  $("#open-count").textContent = requests.filter((item) => !["publicado", "cancelado"].includes(item.status)).length;
  const list = $("#request-list");
  list.replaceChildren();
  if (!requests.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Nenhuma solicitação ainda.";
    list.append(empty);
    return;
  }
  requests.slice(0, 8).forEach((item) => list.append(requestCard(item)));
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
