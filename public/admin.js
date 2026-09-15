const $ = (selector, root = document) => root.querySelector(selector);
let allRequests = [];
let allUsers = [];
let allAppointments = [];

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
    $("#password-modal").classList.toggle("hidden", !user.mustChangePassword);
    await Promise.all([loadRequests(), loadUsers(), loadAppointments()]);
  } catch {
    location.replace("/central");
  }
}

document.querySelectorAll(".admin-tabs button").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".admin-tabs button").forEach((item) => item.classList.toggle("active", item === button));
  $("#requests-tab").classList.toggle("hidden", button.dataset.tab !== "requests");
  $("#users-tab").classList.toggle("hidden", button.dataset.tab !== "users");
  $("#appointments-tab").classList.toggle("hidden", button.dataset.tab !== "appointments");
}));

$("#logout").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST", body: "{}" }).catch(() => {});
  location.replace("/central");
});

$("#password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $(".form-message", form);
  const button = $('button[type="submit"]', form);
  message.textContent = "";
  message.classList.remove("success");
  button.disabled = true;
  try {
    const payload = Object.fromEntries(new FormData(form));
    await api("/api/change-password", { method:"POST", body:JSON.stringify(payload) });
    form.reset();
    $("#password-modal").classList.add("hidden");
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
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

async function loadAppointments() {
  const data = await api("/api/appointments?view=admin");
  allAppointments = data.appointments;
  renderAppointments();
}

function renderAppointments() {
  const search = $("#appointment-search").value.trim().toLowerCase();
  const status = $("#appointment-filter").value;
  const filtered = allAppointments.filter((item) => {
    const haystack = `${item.fullName} ${item.company || ""} ${item.email} ${item.phone}`.toLowerCase();
    return (!search || haystack.includes(search)) && (!status || item.status === status);
  });
  const pending = allAppointments.filter((item) => item.status === "pending").length;
  $("#appointment-total").textContent = filtered.length + " reunião" + (filtered.length === 1 ? "" : "ões");
  $("#appointment-badge").textContent = String(pending);
  $("#appointment-badge").classList.toggle("hidden", pending === 0);
  const list = $("#appointment-list");
  list.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "Nenhuma reunião encontrada."; list.append(empty); return;
  }
  filtered.forEach((item) => list.append(appointmentCard(item)));
  window.lucide?.createIcons();
}

function appointmentCard(item) {
  const card = document.createElement("article"); card.className = "appointment-card";
  const icon = document.createElement("span"); icon.className = "appointment-icon"; icon.innerHTML = '<i data-lucide="calendar-clock" aria-hidden="true"></i>';
  const content = document.createElement("div"); content.className = "appointment-content";
  const title = document.createElement("div"); title.className = "appointment-title";
  const heading = document.createElement("div");
  const name = document.createElement("h3"); name.textContent = item.fullName;
  const company = document.createElement("p"); company.textContent = item.company || "Sem empresa informada";
  heading.append(name, company);
  const date = document.createElement("strong"); date.textContent = `${formatDate(item.meetingDate)} às ${item.meetingTime}`;
  title.append(heading, date);
  const meta = document.createElement("div"); meta.className = "appointment-meta";
  [item.email, item.phone, "30 minutos"].forEach((value) => { const span = document.createElement("span"); span.textContent = value; meta.append(span); });
  content.append(title, meta);
  if (item.notes) { const notes = document.createElement("p"); notes.className = "appointment-notes"; notes.textContent = item.notes; content.append(notes); }
  const select = document.createElement("select"); select.className = "appointment-status";
  [["pending","Pendente"],["confirmed","Confirmada"],["cancelled","Cancelada"]].forEach(([value,label]) => { const option = document.createElement("option"); option.value = value; option.textContent = label; option.selected = item.status === value; select.append(option); });
  select.addEventListener("change", async () => {
    select.disabled = true;
    try { await api("/api/appointments", { method:"PATCH", body:JSON.stringify({ id:item.id, status:select.value }) }); item.status = select.value; renderAppointments(); }
    catch (error) { alert(error.message); select.value = item.status; }
    finally { select.disabled = false; }
  });
  card.append(icon, content, select);
  return card;
}

$("#appointment-search").addEventListener("input", renderAppointments);
$("#appointment-filter").addEventListener("change", renderAppointments);

async function loadUsers() {
  const data = await api("/api/users");
  allUsers = data.users;
  renderUsers();
}

function renderUsers() {
  const clients = allUsers.filter((user) => user.role === "client");
  $("#user-total").textContent = clients.length + " cliente" + (clients.length === 1 ? "" : "s");
  const list = $("#client-list");
  list.replaceChildren();
  if (!clients.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Nenhum cliente cadastrado ainda.";
    list.append(empty);
    return;
  }
  clients.forEach((user) => {
    const card = document.createElement("article");
    card.className = "client-card";
    const identity = document.createElement("div");
    identity.className = "client-identity";
    const avatar = document.createElement("span");
    avatar.className = "client-avatar";
    avatar.innerHTML = '<i data-lucide="user-round" aria-hidden="true"></i>';
    const details = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = user.displayName;
    const meta = document.createElement("span");
    meta.textContent = "@" + user.username + (user.email ? " · " + user.email : "");
    details.append(name, meta);
    identity.append(avatar, details);
    const controls = document.createElement("div");
    controls.className = "client-controls";
    const state = document.createElement("span");
    state.className = "user-state" + (user.active ? "" : " off");
    state.textContent = user.active ? "Ativo" : "Inativo";
    const finance = document.createElement("span");
    finance.className = "financial-state " + (user.financialStatus || "ok");
    finance.textContent = user.financialStatus === "overdue" ? "Em atraso" : "Em dia";
    const button = document.createElement("button");
    button.className = "edit-button";
    button.innerHTML = '<i data-lucide="pencil" aria-hidden="true"></i><span>Editar</span>';
    button.addEventListener("click", () => openUserEditor(user));
    controls.append(finance, state, button);
    card.append(identity, controls);
    list.append(card);
  });
  window.lucide?.createIcons();
}

function openUserEditor(user) {
  const form = $("#edit-user-form");
  form.elements.id.value = user.id;
  form.elements.displayName.value = user.displayName;
  form.elements.username.value = user.username;
  form.elements.email.value = user.email || "";
  form.elements.active.value = String(user.active);
  form.elements.password.value = "";
  form.elements.financialStatus.value = user.financialStatus || "ok";
  form.elements.amountDue.value = Number(user.amountDue || 0).toFixed(2);
  form.elements.paymentDueDate.value = user.paymentDueDate ? String(user.paymentDueDate).slice(0, 10) : "";
  $(".form-message", form).textContent = "";
  $("#edit-user-modal").classList.remove("hidden");
  form.elements.displayName.focus();
}

function closeUserEditor() {
  $("#edit-user-modal").classList.add("hidden");
  $("#edit-user-form").reset();
}

$(".modal-close").addEventListener("click", closeUserEditor);
$(".modal-cancel").addEventListener("click", closeUserEditor);
$("#edit-user-modal").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeUserEditor();
});

$("#generate-password").addEventListener("click", () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const values = crypto.getRandomValues(new Uint32Array(16));
  $("#edit-user-form").elements.password.value = Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
});

$("#edit-user-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $(".form-message", form);
  const button = $('button[type="submit"]', form);
  message.textContent = "";
  message.classList.remove("success");
  button.disabled = true;
  try {
    const payload = Object.fromEntries(new FormData(form));
    payload.active = payload.active === "true";
    const data = await api("/api/users", { method:"PATCH", body:JSON.stringify(payload) });
    const index = allUsers.findIndex((user) => user.id === data.user.id);
    if (index >= 0) allUsers[index] = data.user;
    renderUsers();
    closeUserEditor();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

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
window.lucide?.createIcons();
