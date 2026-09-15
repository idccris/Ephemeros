const header = document.querySelector('.site-header');
const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');
const themeToggle = document.querySelector('.theme-toggle');
const themeMeta = document.querySelector('meta[name="theme-color"]');
const bookingFrame = document.querySelector('.booking-wrap iframe');

const applyTheme = (theme) => {
  const isLight = theme === 'light';
  document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
  localStorage.setItem('ephemeros-theme', isLight ? 'light' : 'dark');
  themeToggle?.setAttribute('aria-pressed', String(isLight));
  themeToggle?.setAttribute('aria-label', isLight ? 'Ativar modo escuro' : 'Ativar modo claro');
  themeMeta?.setAttribute('content', isLight ? '#f6f3f8' : '#050505');

  if (bookingFrame) {
    const frameUrl = new URL(bookingFrame.src);
    const wantedTheme = isLight ? 'light' : 'dark';
    if (frameUrl.searchParams.get('theme') !== wantedTheme) {
      frameUrl.searchParams.set('theme', wantedTheme);
      bookingFrame.src = frameUrl.toString();
    }
  }
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
