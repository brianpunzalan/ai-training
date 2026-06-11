import { loadManifest, getManifest, findModule, findLesson, findLab, flatLessons, fetchMarkdown, renderMarkdown, fetchQuiz } from './content.js';
import { store } from './progress.js';
import { renderSidebar, initSidebarToggle } from './nav.js';
import { renderQuiz, escapeHtml } from './quiz.js';
import { renderReview } from './review.js';
import { initSearch } from './search.js';
import { initTheme } from './theme.js';

const content = document.getElementById('content');

async function boot() {
  initTheme();
  initSidebarToggle();
  try {
    await loadManifest();
  } catch (e) {
    content.innerHTML = `<h1>Could not load course</h1>
      <p>${escapeHtml(e.message)}</p>
      <p>If you opened this file directly (<code>file://</code>), serve it instead:
      <code>python3 -m http.server 8000</code> then open <code>http://localhost:8000</code>.</p>`;
    return;
  }
  initSearch();
  window.addEventListener('hashchange', route);
  window.addEventListener('progress-changed', () => renderSidebar(currentPath()));
  route();
}

function currentPath() {
  return location.hash.replace(/^#/, '') || '/';
}

async function route() {
  const path = currentPath();
  renderSidebar(path);
  content.scrollTop = 0;
  window.scrollTo(0, 0);

  const parts = path.split('/').filter(Boolean); // e.g. ['lesson', 'rag', 'chunking']
  try {
    if (path === '/' || path === '/progress') await viewDashboard();
    else if (parts[0] === 'module' && parts[1]) await viewModule(parts[1]);
    else if (parts[0] === 'lesson' && parts[1] && parts[2]) await viewLesson(parts[1], parts[2]);
    else if (parts[0] === 'quiz' && parts[1] && parts[2]) await renderQuiz(content, parts[1], parts[2]);
    else if (parts[0] === 'lab' && parts[1]) await viewLab(parts[1]);
    else if (parts[0] === 'review') await renderReview(content);
    else content.innerHTML = `<h1>Not found</h1><p>No page at <code>${escapeHtml(path)}</code>. <a href="#/">Go home</a>.</p>`;
  } catch (e) {
    console.error(e);
    content.innerHTML = `<h1>Something went wrong</h1><p>${escapeHtml(e.message)}</p><p><a href="#/">Go home</a></p>`;
  }

  if (path !== '/') store.setLastVisited(path);
}

// ---------- Dashboard ----------
async function viewDashboard() {
  const manifest = getManifest();
  const stats = store.overallStats(manifest);
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const due = store.dueReviews().length;
  const last = store.lastVisited;

  content.innerHTML = `
    <div class="hero">
      <h1>${escapeHtml(manifest.siteTitle)}</h1>
      <p class="tagline">${escapeHtml(manifest.tagline)}</p>
    </div>

    ${due > 0 ? `
      <div class="review-banner">
        <span>🔁</span>
        <span><strong>${due} question${due > 1 ? 's' : ''} due for review.</strong> Spaced retrieval is how this material sticks.</span>
        <a class="btn primary" href="#/review">Start review</a>
      </div>` : ''}

    <div class="stat-cards">
      <div class="stat-card">
        <div class="num">${pct}%</div>
        <div class="lbl">Course complete (${stats.done}/${stats.total} lessons)</div>
        <div class="progress-bar"><div style="width:${pct}%"></div></div>
      </div>
      <div class="stat-card">
        <div class="num">${stats.quizzes}</div>
        <div class="lbl">Quizzes taken</div>
      </div>
      <div class="stat-card">
        <div class="num">${stats.quizzes ? Math.round(stats.avgScore * 100) + '%' : '—'}</div>
        <div class="lbl">Average best quiz score</div>
      </div>
      <div class="stat-card">
        <div class="num">${due}</div>
        <div class="lbl">Reviews due</div>
      </div>
    </div>

    <div class="footer-actions">
      ${last && last.startsWith('/lesson/') ? `<a class="btn primary" href="#${last}">▶ Continue where you left off</a>` : ''}
      <button class="btn" id="export-btn">⬇ Export progress</button>
      <button class="btn" id="import-btn">⬆ Import progress</button>
      <input type="file" id="import-file" accept="application/json" style="display:none">
    </div>

    <h2>Modules</h2>
    ${manifest.modules.map((m, i) => {
      const s = store.moduleStats(m);
      const mpct = s.total ? Math.round((s.done / s.total) * 100) : 0;
      return `
      <a class="module-card" href="#/module/${m.id}">
        <div class="module-title">${i + 1}. ${escapeHtml(m.title)}</div>
        <div class="module-desc">${escapeHtml(m.description)}</div>
        <div class="module-meta">
          <span class="level-badge ${m.level.toLowerCase()}">${m.level}</span>
          <span>${m.lessons.length} lessons</span>
          <span>${s.done}/${s.total} complete</span>
        </div>
        <div class="progress-bar"><div style="width:${mpct}%"></div></div>
      </a>`;
    }).join('')}

    <h2>Hands-on Labs</h2>
    <p>Each lab ships with <strong>Python and TypeScript</strong> starter code you run locally against any provider (Anthropic, OpenAI, or a local model via Ollama). See <a href="#/lab/${manifest.labs[0].id}">Lab 01</a> to set up.</p>
    <ul>
      ${manifest.labs.map((l) => `<li><a href="#/lab/${l.id}">${escapeHtml(l.title)}</a></li>`).join('')}
    </ul>`;

  document.getElementById('export-btn').addEventListener('click', () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ai-training-progress.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  document.getElementById('import-btn').addEventListener('click', () =>
    document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      store.importJSON(await file.text());
      route();
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  });
}

// ---------- Module overview ----------
async function viewModule(moduleId) {
  const mod = findModule(moduleId);
  if (!mod) { content.innerHTML = '<h1>Module not found</h1>'; return; }
  const idx = getManifest().modules.indexOf(mod);
  const stats = store.moduleStats(mod);
  const quizData = await fetchQuiz(mod);
  const hasReview = quizData && quizData._module_review;
  const reviewRec = store.getLesson(mod.id, '_module_review');

  content.innerHTML = `
    <div class="breadcrumbs"><a href="#/">Dashboard</a> / Module ${idx + 1}</div>
    <h1>${idx + 1}. ${escapeHtml(mod.title)} <span class="level-badge ${mod.level.toLowerCase()}">${mod.level}</span></h1>
    <p>${escapeHtml(mod.description)}</p>
    <div class="progress-bar" style="max-width:420px"><div style="width:${stats.total ? (stats.done / stats.total) * 100 : 0}%"></div></div>
    <p class="quiz-progress">${stats.done} of ${stats.total} lessons complete</p>

    <h2>Lessons</h2>
    <ul class="lesson-list">
      ${mod.lessons.map((l) => {
        const done = store.isComplete(mod.id, l.id);
        const rec = store.getLesson(mod.id, l.id);
        const quizBadge = rec && rec.quiz ? `quiz best: ${Math.round(rec.quiz.bestScore * 100)}%` : '';
        return `<li><a href="#/lesson/${mod.id}/${l.id}">
          <span class="check ${done ? 'done' : ''}">${done ? '✔' : '○'}</span>
          <span>${escapeHtml(l.title)}</span>
          ${l.lab ? '<span class="badge">🧪 lab</span>' : ''}
          <span class="badge">${quizBadge}</span>
        </a></li>`;
      }).join('')}
    </ul>

    ${hasReview ? `
      <h2>Module review</h2>
      <p>A cumulative quiz mixing concepts from across the module — distributed practice for long-term retention.${
        reviewRec && reviewRec.quiz ? ` Best score so far: <strong>${Math.round(reviewRec.quiz.bestScore * 100)}%</strong>.` : ''}</p>
      <a class="btn primary" href="#/quiz/${mod.id}/_module_review">Take module review</a>` : ''}

    ${mod.references && mod.references.length ? `
      <h2>References & further reading</h2>
      <ul class="ref-list">
        ${mod.references.map((r) => `<li><a href="${r.url}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a></li>`).join('')}
      </ul>` : ''}`;
}

// ---------- Lesson ----------
async function viewLesson(moduleId, lessonId) {
  const found = findLesson(moduleId, lessonId);
  if (!found) { content.innerHTML = '<h1>Lesson not found</h1>'; return; }
  const { module: mod, lesson } = found;
  const moduleIdx = getManifest().modules.indexOf(mod);

  content.innerHTML = '<div class="loading">Loading lesson…</div>';
  const md = await fetchMarkdown(`${mod.dir}/${lesson.file}`);

  content.innerHTML = `
    <div class="breadcrumbs">
      <a href="#/">Dashboard</a> / <a href="#/module/${mod.id}">${moduleIdx + 1}. ${escapeHtml(mod.title)}</a>
    </div>
    <article id="lesson-body"></article>
    <div class="lesson-footer" id="lesson-footer"></div>`;

  renderMarkdown(md, document.getElementById('lesson-body'));
  renderLessonFooter(mod, lesson);
}

function renderLessonFooter(mod, lesson) {
  const footer = document.getElementById('lesson-footer');
  const flat = flatLessons();
  const flatIdx = flat.findIndex((f) => f.module.id === mod.id && f.lesson.id === lesson.id);
  const prev = flat[flatIdx - 1];
  const next = flat[flatIdx + 1];
  const done = store.isComplete(mod.id, lesson.id);
  const lab = lesson.lab ? findLab(lesson.lab) : null;

  footer.innerHTML = `
    ${lab ? `
      <div class="callout lab">
        <span class="callout-icon">🧪</span>
        <div><strong>Hands-on lab:</strong> <a href="#/lab/${lab.id}">${escapeHtml(lab.title)}</a><br>
        <small>Apply this lesson in code (Python or TypeScript) — active practice beats passive reading.</small></div>
      </div>` : ''}
    <div class="footer-actions">
      <a class="btn primary" href="#/quiz/${mod.id}/${lesson.id}">📝 Take the lesson quiz</a>
      <button class="btn ${done ? 'success' : ''}" id="complete-btn">${done ? '✔ Completed' : 'Mark as complete'}</button>
    </div>
    <div class="prev-next">
      ${prev ? `<a href="#/lesson/${prev.module.id}/${prev.lesson.id}">
        <span class="label">← Previous</span><span class="title">${escapeHtml(prev.lesson.title)}</span></a>` : '<span></span>'}
      ${next ? `<a class="next" href="#/lesson/${next.module.id}/${next.lesson.id}">
        <span class="label">Next →</span><span class="title">${escapeHtml(next.lesson.title)}</span></a>` : ''}
    </div>`;

  footer.querySelector('#complete-btn').addEventListener('click', (e) => {
    const nowDone = !store.isComplete(mod.id, lesson.id);
    store.setComplete(mod.id, lesson.id, nowDone);
    e.target.textContent = nowDone ? '✔ Completed' : 'Mark as complete';
    e.target.classList.toggle('success', nowDone);
    window.dispatchEvent(new CustomEvent('progress-changed'));
  });
}

// ---------- Lab ----------
async function viewLab(labId) {
  const lab = findLab(labId);
  if (!lab) { content.innerHTML = '<h1>Lab not found</h1>'; return; }

  content.innerHTML = '<div class="loading">Loading lab…</div>';
  const md = await fetchMarkdown(`${lab.dir}/INSTRUCTIONS.md`);
  content.innerHTML = `
    <div class="breadcrumbs"><a href="#/">Dashboard</a> / Labs</div>
    <article id="lab-body"></article>
    <div class="callout">
      <span class="callout-icon">📂</span>
      <div>Starter code and solutions live in <code>${lab.dir}/</code> in the repository —
      <code>python/</code> and <code>typescript/</code> variants of each. Clone the repo and work locally;
      see <code>labs/README.md</code> for environment setup (any provider, or free local models via Ollama).</div>
    </div>`;
  renderMarkdown(md, document.getElementById('lab-body'));
}

boot();
