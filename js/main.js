const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#site-nav');
const themeButton = document.querySelector('#theme-toggle');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

if (!reduceMotion.matches) {
  document.documentElement.classList.add('page-entering');
}

window.addEventListener('pageshow', () => {
  document.documentElement.classList.remove('page-leaving');
});

document.querySelectorAll('a[href]').forEach((link) => {
  link.addEventListener('click', (event) => {
    if (
      reduceMotion.matches ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      link.target ||
      link.hasAttribute('download')
    ) return;

    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;

    event.preventDefault();
    document.documentElement.classList.add('page-leaving');
    window.setTimeout(() => window.location.assign(destination.href), 170);
  });
});

function updateThemeButton(theme) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const label = nextTheme === 'dark' ? 'Modo escuro' : 'Modo claro';
  themeButton.setAttribute('aria-label', `Ativar ${label.toLowerCase()}`);
  themeButton.querySelector('.theme-toggle-label').textContent = label;
  themeButton.querySelector('.theme-icon-moon').hidden = nextTheme !== 'dark';
  themeButton.querySelector('.theme-icon-sun').hidden = nextTheme !== 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#10232f' : '#ffffff');
}

const activeTheme = document.documentElement.dataset.theme || 'light';
updateThemeButton(activeTheme);

themeButton.addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = nextTheme;
  updateThemeButton(nextTheme);
  try {
    localStorage.setItem('jvm-theme', nextTheme);
  } catch {}
});

menuButton.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!isOpen));
  menuButton.setAttribute('aria-label', isOpen ? 'Abrir menu' : 'Fechar menu');
  navigation.classList.toggle('is-open', !isOpen);
});

navigation.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Abrir menu');
    navigation.classList.remove('is-open');
  });
});

document.querySelectorAll('#year').forEach((year) => {
  year.textContent = new Date().getFullYear();
});

const contactApiBaseUrl = (window.JVM_CONTACT_API_URL || '').replace(/\/$/, '');
const isGitHubPages = window.location.hostname.endsWith('github.io');

const contactForm = document.querySelector('#contact-form');
contactForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const note = document.querySelector('#form-note');
  const submitButton = form.querySelector('button[type="submit"]');
  if (!form.reportValidity()) return;

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  if (isGitHubPages && !contactApiBaseUrl) {
    note.dataset.state = 'error';
    note.textContent = 'O formulário ainda precisa ser conectado ao backend. Por enquanto, fale com a JVM pelo WhatsApp ou e-mail.';
    return;
  }

  submitButton.disabled = true;
  note.removeAttribute('data-state');
  note.textContent = 'Enviando sua mensagem…';

  fetch(`${contactApiBaseUrl || window.location.origin}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message || 'Não foi possível enviar sua mensagem. Tente novamente.');
      }
      form.reset();
      note.dataset.state = 'success';
      note.textContent = result.message || 'Mensagem enviada. A equipe da JVM entrará em contato.';
    })
    .catch((error) => {
      note.dataset.state = 'error';
      note.textContent = error.message || 'Falha de conexão. Tente novamente mais tarde.';
    })
    .finally(() => {
      submitButton.disabled = false;
    });
});
