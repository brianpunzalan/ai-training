import { getManifest } from './content.js';
import { store } from './progress.js';

export function renderSidebar(activeRoute) {
  const manifest = getManifest();
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = '';

  const home = document.createElement('a');
  home.href = '#/';
  home.className = 'nav-home' + (activeRoute === '/' ? ' active' : '');
  home.textContent = '🏠 Dashboard';
  sidebar.appendChild(home);

  const due = store.dueReviews().length;
  const review = document.createElement('a');
  review.href = '#/review';
  review.className = 'nav-home' + (activeRoute === '/review' ? ' active' : '');
  review.textContent = due > 0 ? `🔁 Review queue (${due} due)` : '🔁 Review queue';
  sidebar.appendChild(review);

  manifest.modules.forEach((mod, mi) => {
    const stats = store.moduleStats(mod);
    const isActive = activeRoute.startsWith(`/module/${mod.id}`) ||
      activeRoute.startsWith(`/lesson/${mod.id}/`) ||
      activeRoute.startsWith(`/quiz/${mod.id}/`);

    const div = document.createElement('div');
    div.className = 'nav-module' + (isActive ? ' open' : '');

    const header = document.createElement('button');
    header.className = 'nav-module-header';
    header.innerHTML = `<span class="chevron">▶</span><span>${mi + 1}. ${mod.title}</span>` +
      `<span class="module-progress">${stats.done}/${stats.total}</span>`;
    header.addEventListener('click', () => div.classList.toggle('open'));
    div.appendChild(header);

    const list = document.createElement('div');
    list.className = 'nav-lessons';

    const overview = document.createElement('a');
    overview.href = `#/module/${mod.id}`;
    overview.className = 'nav-lesson' + (activeRoute === `/module/${mod.id}` ? ' active' : '');
    overview.innerHTML = `<span class="check">▸</span><span>Module overview</span>`;
    list.appendChild(overview);

    for (const lesson of mod.lessons) {
      const a = document.createElement('a');
      a.href = `#/lesson/${mod.id}/${lesson.id}`;
      const done = store.isComplete(mod.id, lesson.id);
      a.className = 'nav-lesson' + (activeRoute === `/lesson/${mod.id}/${lesson.id}` ? ' active' : '');
      a.innerHTML = `<span class="check ${done ? 'done' : ''}">${done ? '✔' : '○'}</span><span>${lesson.title}</span>`;
      list.appendChild(a);
    }

    div.appendChild(list);
    sidebar.appendChild(div);
  });
}

export function initSidebarToggle() {
  const toggle = document.getElementById('sidebar-toggle');
  const backdrop = document.getElementById('sidebar-backdrop');
  toggle.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
  backdrop.addEventListener('click', () => document.body.classList.remove('sidebar-open'));
  // Close the drawer after navigating on mobile.
  window.addEventListener('hashchange', () => document.body.classList.remove('sidebar-open'));
}
