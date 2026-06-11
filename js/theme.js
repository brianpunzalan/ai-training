import { store } from './progress.js';

function apply(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('hljs-light').disabled = theme === 'dark';
  document.getElementById('hljs-dark').disabled = theme !== 'dark';
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

export function initTheme() {
  const saved = store.getSetting('theme');
  const theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  apply(theme);

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    store.setSetting('theme', next);
    apply(next);
  });
}
