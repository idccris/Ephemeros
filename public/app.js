const header = document.querySelector('.site-header');
const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');
const themeToggle = document.querySelector('.theme-toggle');
const themeMeta = document.querySelector('meta[name="theme-color"]');

const applyTheme = (theme) => {
  const isLight = theme === 'light';
  document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
  localStorage.setItem('ephemeros-theme', isLight ? 'light' : 'dark');
  themeToggle?.setAttribute('aria-pressed', String(isLight));
  themeToggle?.setAttribute('aria-label', isLight ? 'Ativar modo escuro' : 'Ativar modo claro');
  themeMeta?.setAttribute('content', isLight ? '#f6f3f8' : '#050505');

};

applyTheme(document.documentElement.dataset.theme);
themeToggle?.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
});

const closeMenu = () => {
  toggle?.classList.remove('open');
  nav?.classList.remove('open');
  toggle?.setAttribute('aria-expanded', 'false');
  toggle?.setAttribute('aria-label', 'Abrir menu');
};

toggle?.addEventListener('click', () => {
  const isOpen = toggle.classList.toggle('open');
  nav.classList.toggle('open', isOpen);
  toggle.setAttribute('aria-expanded', String(isOpen));
  toggle.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
});

nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
window.addEventListener('scroll', () => header?.classList.toggle('scrolled', window.scrollY > 12), { passive: true });
document.getElementById('year').textContent = new Date().getFullYear();
window.lucide?.createIcons();

const bookingForm = document.getElementById('booking-form');
if (bookingForm) {
  const daysGrid = document.getElementById('calendar-days');
  const monthLabel = document.getElementById('calendar-month');
  const dateLabel = document.getElementById('selected-date-label');
  const slotsGrid = document.getElementById('time-slots');
  const summary = document.getElementById('booking-summary');
  const submit = bookingForm.querySelector('button[type="submit"]');
  const prev = document.getElementById('calendar-prev');
  const next = document.getElementById('calendar-next');
  const todayParts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  const todayText = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
  const today = parseDate(todayText);
  const limit = new Date(today); limit.setUTCDate(limit.getUTCDate() + 90);
  let view = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  let selectedDate = '';
  let selectedTime = '';
  let occupied = new Set();

  function parseDate(value) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12));
  }

  function isoDate(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
  }

  function formatLongDate(value) {
    return new Intl.DateTimeFormat('pt-BR', { weekday:'long', day:'2-digit', month:'long', timeZone:'UTC' }).format(parseDate(value));
  }

  function availableTimes(date) {
    const times = [];
    for (let hour = 9; hour < 17; hour += 1) {
      times.push(`${String(hour).padStart(2,'0')}:00`, `${String(hour).padStart(2,'0')}:30`);
    }
    return times.filter((time) => !occupied.has(`${date}|${time}`) && new Date(`${date}T${time}:00-03:00`).getTime() > Date.now() + 60 * 60 * 1000);
  }

  async function loadMonth() {
    daysGrid.innerHTML = '<span class="calendar-loading">Carregando...</span>';
    const month = `${view.getUTCFullYear()}-${String(view.getUTCMonth() + 1).padStart(2,'0')}`;
    try {
      const response = await fetch(`/api/appointments?month=${month}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      occupied = new Set((data.occupied || []).map((item) => `${item.date}|${item.time}`));
      renderCalendar();
    } catch {
      daysGrid.innerHTML = '<span class="calendar-loading">Não foi possível carregar a agenda.</span>';
    }
  }

  function renderCalendar() {
    daysGrid.replaceChildren();
    monthLabel.textContent = new Intl.DateTimeFormat('pt-BR', { month:'long', year:'numeric', timeZone:'UTC' }).format(view);
    const firstWeekday = new Date(Date.UTC(view.getUTCFullYear(), view.getUTCMonth(), 1)).getUTCDay();
    const totalDays = new Date(Date.UTC(view.getUTCFullYear(), view.getUTCMonth() + 1, 0)).getUTCDate();
    for (let index = 0; index < firstWeekday; index += 1) {
      const blank = document.createElement('span'); blank.className = 'calendar-day blank'; daysGrid.append(blank);
    }
    for (let day = 1; day <= totalDays; day += 1) {
      const date = new Date(Date.UTC(view.getUTCFullYear(), view.getUTCMonth(), day, 12));
      const value = isoDate(date);
      const weekday = date.getUTCDay();
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'calendar-day'; button.textContent = String(day); button.dataset.date = value;
      button.setAttribute('role','gridcell'); button.setAttribute('aria-label', formatLongDate(value));
      button.disabled = date < today || date > limit || weekday === 0 || weekday === 6 || availableTimes(value).length === 0;
      button.classList.toggle('today', value === todayText); button.classList.toggle('selected', value === selectedDate);
      button.addEventListener('click', () => selectDate(value));
      daysGrid.append(button);
    }
    const firstMonth = today.getUTCFullYear() * 12 + today.getUTCMonth();
    const currentMonth = view.getUTCFullYear() * 12 + view.getUTCMonth();
    const lastMonth = limit.getUTCFullYear() * 12 + limit.getUTCMonth();
    prev.disabled = currentMonth <= firstMonth; next.disabled = currentMonth >= lastMonth;
  }

  function selectDate(value) {
    selectedDate = value; selectedTime = '';
    bookingForm.elements.meetingDate.value = value; bookingForm.elements.meetingTime.value = '';
    dateLabel.textContent = formatLongDate(value);
    renderCalendar(); renderTimes(); updateSummary();
  }

  function renderTimes() {
    slotsGrid.replaceChildren();
    const times = availableTimes(selectedDate);
    if (!times.length) {
      const message = document.createElement('p'); message.textContent = 'Não há horários livres neste dia.'; slotsGrid.append(message); return;
    }
    times.forEach((time) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'time-slot'; button.textContent = time;
      button.classList.toggle('selected', time === selectedTime);
      button.addEventListener('click', () => { selectedTime = time; bookingForm.elements.meetingTime.value = time; renderTimes(); updateSummary(); });
      slotsGrid.append(button);
    });
  }

  function updateSummary() {
    if (!selectedDate || !selectedTime) {
      summary.textContent = selectedDate ? 'Agora escolha um dos horários disponíveis.' : 'Escolha uma data e um horário para continuar.';
      submit.disabled = true; return;
    }
    summary.textContent = `${formatLongDate(selectedDate)}, às ${selectedTime} · horário de Brasília`;
    submit.disabled = false;
  }

  prev.addEventListener('click', () => { view = new Date(Date.UTC(view.getUTCFullYear(), view.getUTCMonth() - 1, 1)); selectedDate = ''; selectedTime = ''; loadMonth(); renderTimes(); updateSummary(); });
  next.addEventListener('click', () => { view = new Date(Date.UTC(view.getUTCFullYear(), view.getUTCMonth() + 1, 1)); selectedDate = ''; selectedTime = ''; loadMonth(); renderTimes(); updateSummary(); });

  bookingForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = bookingForm.querySelector('.booking-message');
    message.textContent = ''; message.classList.remove('success'); submit.disabled = true;
    try {
      const payload = Object.fromEntries(new FormData(bookingForm));
      const response = await fetch('/api/appointments', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível agendar.');
      const content = document.querySelector('.booking-content');
      content.innerHTML = '<div class="booking-success"><div><i data-lucide="circle-check-big" aria-hidden="true"></i><h3>Reunião agendada!</h3><p>Recebemos seu agendamento. A equipe Ephemeros verá o aviso no painel administrativo e entrará em contato pelo e-mail ou WhatsApp informado.</p></div></div>';
      window.lucide?.createIcons();
    } catch (error) {
      message.textContent = error.message;
      submit.disabled = false;
      if (/horário/i.test(error.message)) loadMonth();
    }
  });

  loadMonth();
}
