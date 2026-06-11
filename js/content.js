// Manifest + markdown loading and rendering.
let manifest = null;
const mdCache = new Map();
const quizCache = new Map();

export async function loadManifest() {
  if (manifest) return manifest;
  const res = await fetch('data/manifest.json');
  if (!res.ok) throw new Error(`Failed to load manifest: ${res.status}`);
  manifest = await res.json();
  return manifest;
}

export function getManifest() { return manifest; }

export function findModule(moduleId) {
  return manifest.modules.find((m) => m.id === moduleId) || null;
}

export function findLesson(moduleId, lessonId) {
  const mod = findModule(moduleId);
  if (!mod) return null;
  const idx = mod.lessons.findIndex((l) => l.id === lessonId);
  if (idx === -1) return null;
  return { module: mod, lesson: mod.lessons[idx], index: idx };
}

export function findLab(labId) {
  return (manifest.labs || []).find((l) => l.id === labId) || null;
}

// Flat ordered list of {module, lesson} for prev/next navigation.
export function flatLessons() {
  const out = [];
  for (const m of manifest.modules) {
    for (const l of m.lessons) out.push({ module: m, lesson: l });
  }
  return out;
}

export async function fetchMarkdown(path) {
  if (mdCache.has(path)) return mdCache.get(path);
  const res = await fetch(path);
  if (!res.ok) {
    console.warn(`Content not found: ${path} (${res.status})`);
    throw new Error(`Could not load ${path}`);
  }
  const text = await res.text();
  mdCache.set(path, text);
  return text;
}

export async function fetchQuiz(module) {
  if (quizCache.has(module.id)) return quizCache.get(module.id);
  const res = await fetch(module.quiz);
  if (!res.ok) return null;
  const data = await res.json();
  quizCache.set(module.id, data);
  return data;
}

export function renderMarkdown(mdText, container) {
  container.innerHTML = marked.parse(mdText);
  container.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el));
  buildCodeTabs(container);
  // External links open in a new tab.
  container.querySelectorAll('a[href^="http"]').forEach((a) => {
    a.target = '_blank';
    a.rel = 'noopener';
  });
}

// Merge consecutive python + typescript code blocks into a tabbed widget.
function buildCodeTabs(container) {
  const langOf = (pre) => {
    const code = pre.querySelector('code');
    if (!code) return null;
    if (code.classList.contains('language-python')) return 'Python';
    if (code.classList.contains('language-typescript') || code.classList.contains('language-ts')) return 'TypeScript';
    return null;
  };

  const pres = [...container.querySelectorAll('pre')];
  let i = 0;
  while (i < pres.length) {
    const first = pres[i];
    const firstLang = langOf(first);
    if (!firstLang) { i++; continue; }

    // Collect the run of consecutive sibling code blocks with alternating languages.
    const group = [{ pre: first, lang: firstLang }];
    let next = first.nextElementSibling;
    while (next && next.tagName === 'PRE' && langOf(next) && langOf(next) !== group[group.length - 1].lang) {
      group.push({ pre: next, lang: langOf(next) });
      next = next.nextElementSibling;
    }

    if (group.length > 1) {
      const wrap = document.createElement('div');
      wrap.className = 'code-tabs';
      const bar = document.createElement('div');
      bar.className = 'tab-bar';
      wrap.appendChild(bar);
      first.parentNode.insertBefore(wrap, first);

      group.forEach(({ pre, lang }, idx) => {
        const btn = document.createElement('button');
        btn.className = 'tab-btn' + (idx === 0 ? ' active' : '');
        btn.textContent = lang;
        bar.appendChild(btn);

        const pane = document.createElement('div');
        pane.className = 'tab-pane' + (idx === 0 ? ' active' : '');
        pane.appendChild(pre);
        wrap.appendChild(pane);

        btn.addEventListener('click', () => {
          wrap.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
          wrap.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
          btn.classList.add('active');
          pane.classList.add('active');
        });
      });
      // Skip past the group members we consumed.
      i += group.length;
    } else {
      i++;
    }
  }
}
