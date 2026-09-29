const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#site-nav');

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

document.querySelector('#year').textContent = new Date().getFullYear();

const contactApiBaseUrl = (window.JVM_CONTACT_API_URL || '').replace(/\/$/, '');
const isGitHubPages = window.location.hostname.endsWith('github.io');

document.querySelector('#contact-form').addEventListener('submit', (event) => {
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
