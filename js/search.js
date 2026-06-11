import { getManifest, fetchMarkdown } from './content.js';
import { escapeHtml } from './quiz.js';

let index = null;
let building = false;

async function buildIndex() {
  if (index || building) return;
  building = true;
  const manifest = getManifest();
  const docs = [];
  await Promise.all(manifest.modules.map(async (mod) => {
    await Promise.all(mod.lessons.map(async (lesson) => {
      try {
        const md = await fetchMarkdown(`${mod.dir}/${lesson.file}`);
        const headings = [...md.matchAll(/^#{1,4}\s+(.+)$/gm)].map((m) => m[1]);
        const body = md.replace(/```[\s\S]*?```/g, ' ').replace(/[#*_`>\[\]]/g, ' ');
        docs.push({
          route: `#/lesson/${mod.id}/${lesson.id}`,
          moduleTitle: mod.title,
          title: lesson.title,
          headings: headings.join(' ').toLowerCase(),
          body: body.toLowerCase(),
          bodyRaw: body
        });
      } catch { /* unfetchable lesson: skip from index */ }
    }));
  }));
  index = docs;
  building = false;
}

function search(query) {
  const q = query.trim().toLowerCase();
  if (!q || !index) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const results = [];
  for (const doc of index) {
    let score = 0;
    for (const t of terms) {
      if (doc.title.toLowerCase().includes(t)) score += 10;
      if (doc.headings.includes(t)) score += 5;
      if (doc.body.includes(t)) score += 1;
    }
    if (score > 0) {
      const pos = doc.body.indexOf(terms[0]);
      const start = Math.max(0, pos - 40);
      const snippet = pos >= 0 ? doc.bodyRaw.slice(start, start + 120).trim() : '';
      results.push({ doc, score, snippet });
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 12);
}

function highlight(text, terms) {
  let out = escapeHtml(text);
  for (const t of terms) {
    out = out.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>');
  }
  return out;
}

export function initSearch() {
  const modal = document.getElementById('search-modal');
  const input = document.getElementById('search-input');
  const resultsEl = document.getElementById('search-results');
  let selected = 0;

  function open() {
    modal.classList.remove('hidden');
    input.value = '';
    resultsEl.innerHTML = '<div class="search-empty">Type to search all lessons…</div>';
    input.focus();
    buildIndex().then(() => render());
  }

  function close() { modal.classList.add('hidden'); }

  function render() {
    const q = input.value;
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const results = search(q);
    selected = 0;
    if (!q.trim()) {
      resultsEl.innerHTML = '<div class="search-empty">Type to search all lessons…</div>';
      return;
    }
    if (results.length === 0) {
      resultsEl.innerHTML = `<div class="search-empty">No results for “${escapeHtml(q)}”</div>`;
      return;
    }
    resultsEl.innerHTML = results.map((r, i) => `
      <a class="search-result ${i === 0 ? 'selected' : ''}" href="${r.doc.route}" data-i="${i}">
        <div class="sr-module">${escapeHtml(r.doc.moduleTitle)}</div>
        <div class="sr-title">${highlight(r.doc.title, terms)}</div>
        ${r.snippet ? `<div class="sr-snippet">…${highlight(r.snippet, terms)}…</div>` : ''}
      </a>`).join('');
    resultsEl.querySelectorAll('.search-result').forEach((el) => {
      el.addEventListener('click', close);
    });
  }

  function move(delta) {
    const items = resultsEl.querySelectorAll('.search-result');
    if (items.length === 0) return;
    selected = (selected + delta + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle('selected', i === selected));
    items[selected].scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') {
      const sel = resultsEl.querySelector('.search-result.selected');
      if (sel) { location.hash = sel.getAttribute('href'); close(); }
    } else if (e.key === 'Escape') close();
  });

  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.getElementById('search-trigger').addEventListener('click', open);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
    if (e.key === '/' && modal.classList.contains('hidden') &&
        !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault(); open();
    }
  });
}
