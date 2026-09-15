const $ = (selector, root = document) => root.querySelector(selector);
let allRequests = [];
let allUsers = [];

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

async function boot() {
  try {
    const { user } = await api("/api/me");
    if (user.role !== "admin") return location.replace("/central");
    $("#admin-name").textContent = user.displayName;
    await Promise.all([loadRequests(), loadUsers()]);
  } catch {
    location.replace("/central");
  }
}

document.querySelectorAll(".admin-tabs button").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".admin-tabs button").forEach((item) => item.classList.toggle("active", item === button));
  $("#requests-tab").classList.toggle("hidden", button.dataset.tab !== "requests");
  $("#users-tab").classList.toggle("hidden", button.dataset.tab !== "users");
}));

$("#logout").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST", body: "{}" }).catch(() => {});
  location.replace("/central");
});

async function loadRequests() {
  const data = await api("/api/requests");
  allRequests = data.requests;
  renderRequests();
}

function renderRequests() {
  const search = $("#request-search").value.trim().toLowerCase();
  const status = $("#status-filter").value;
  const filtered = allRequests.filter((item) => {
    const haystack = (item.title + " " + item.clientName + " " + item.username).toLowerCase();
    return (!search || haystack.includes(search)) && (!status || item.status === status);
  });
  $("#request-total").textContent = filtered.length + " pedido" + (filtered.length === 1 ? "" : "s");
  const list = $("#admin-request-list");
  list.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Nenhuma solicitação encontrada.";
    list.append(empty);
    return;
  }
  filtered.forEach((item) => list.append(adminRequestCard(item)));
}

function adminRequestCard(item) {
  const card = document.createElement("article");
  card.className = "request-card admin-request";
  const content = document.createElement("div");
  const header = document.createElement("header");
  const heading = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = item.title;
  const client = document.createElement("p");
  client.textContent = item.clientName + " · @" + item.username + " · publicar em " + formatDate(item.publicationDate);
  heading.append(title, client);
  header.append(heading);
  const meta = document.createElement("div");
  meta.className = "request-meta";
  [item.platforms, item.contentFormat, item.objective].forEach((value) => {
    const chip = document.createElement("span");
    chip.textContent = value;
    meta.append(chip);
  });
  const detail = document.createElement("div");
  detail.className = "detail-box";
  detail.textContent = item.details + (item.captionNotes ? "\n\nLegenda: " + item.captionNotes : "") + (item.referenceLinks ? "\n\nReferências: " + item.referenceLinks : "");
  content.append(header, meta, detail);
  const select = document.createElement("select");
  [["recebido","Recebido"],["briefing","Briefing"],["criacao","Em criação"],["revisao","Em revisão"],["aprovado","Aprovado"],["agendado","Agendado"],["publicado","Publicado"],["cancelado","Cancelado"]].forEach(([value,label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = item.status === value;
    select.append(option);
  });
  select.addEventListener("change", async () => {
    select.disabled = true;
    try {
      await api("/api/requests", { method: "PATCH", body: JSON.stringify({ id:item.id, status:select.value }) });
      item.status = select.value;
    } catch (error) {
      alert(error.message);
      select.value = item.status;
    } finally {
      select.disabled = false;
    }
  });
  card.append(content, select);
  return card;
}

$("#request-search").addEventListener("input", renderRequests);
$("#status-filter").addEventListener("change", renderRequests);

async function loadUsers() {
  const data = await api("/api/users");
  allUsers = data.users;
  renderUsers();
}

function renderUsers() {
  const clients = allUsers.filter((user) => user.role === "client");
  $("#user-total").textContent = clients.length + " cliente" + (clients.length === 1 ? "" : "s");
  const body = $("#users-body");
  body.replaceChildren();
  clients.forEach((user) => {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = user.displayName;
    const username = document.createElement("td");
    username.textContent = "@" + user.username;
    const stateCell = document.createElement("td");
    const state = document.createElement("span");
    state.className = "user-state" + (user.active ? "" : " off");
    state.textContent = user.active ? "Ativo" : "Inativo";
    stateCell.append(state);
    const actionCell = document.createElement("td");
    const button = document.createElement("button");
    button.className = "small-action";
    button.textContent = user.active ? "Desativar" : "Ativar";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const data = await api("/api/users", { method:"PATCH", body:JSON.stringify({ id:user.id, active:!user.active }) });
        Object.assign(user, data.user);
        renderUsers();
      } catch (error) {
        alert(error.message);
        button.disabled = false;
      }
    });
    actionCell.append(button);
    row.append(name, username, stateCell, actionCell);
    body.append(row);
  });
}

$("#user-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $(".form-message", form);
  const button = $('button[type="submit"]', form);
  message.textContent = "";
  message.classList.remove("success");
  button.disabled = true;
  try {
    const payload = Object.fromEntries(new FormData(form));
    await api("/api/users", { method:"POST", body:JSON.stringify(payload) });
    form.reset();
    message.textContent = "Usuário criado. Envie o usuário e a senha temporária ao cliente por um canal seguro.";
    message.classList.add("success");
    await loadUsers();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone:"UTC" }).format(new Date(String(value).slice(0,10) + "T12:00:00Z"));
}
boot();
