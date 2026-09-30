try {
  const savedTheme = localStorage.getItem('jvm-theme');
  if (savedTheme === 'light' || savedTheme === 'dark') {
    document.documentElement.dataset.theme = savedTheme;
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.dataset.theme = 'dark';
  }
} catch {
  // O tema padrão continua disponível quando o navegador bloqueia o armazenamento.
}
