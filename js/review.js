import { findModule, fetchQuiz } from './content.js';
import { store } from './progress.js';
import { escapeHtml } from './quiz.js';

// Spaced-practice session over due review items (missed quiz questions).
export async function renderReview(container) {
  const due = store.dueReviews();

  if (due.length === 0) {
    const upcoming = store.raw.review
      .slice()
      .sort((a, b) => new Date(a.due) - new Date(b.due))
      .slice(0, 5);
    container.innerHTML = `
      <h1>🔁 Review Queue</h1>
      <p>Nothing due right now. Questions you miss in quizzes come back here on expanding
      intervals (1 → 3 → 7 → 14 days) — spaced retrieval practice is the most effective
      way to make this material stick.</p>
      ${upcoming.length ? `
        <h3>Coming up</h3>
        <ul>${upcoming.map((r) => `<li><code>${escapeHtml(r.ref)}</code> — due ${new Date(r.due).toLocaleDateString()}</li>`).join('')}</ul>
      ` : '<p>Your queue is empty. Take some quizzes!</p>'}
      <a class="btn primary" href="#/">Back to dashboard</a>`;
    return;
  }

  // Resolve each due ref (module/lesson/qid) to its question object.
  const items = [];
  for (const r of due) {
    const [moduleId, lessonId, qid] = r.ref.split('/');
    const module = findModule(moduleId);
    if (!module) continue;
    const quizData = await fetchQuiz(module);
    const quiz = quizData && quizData[lessonId];
    const q = quiz && quiz.questions.find((x) => x.id === qid);
    if (q) items.push({ ref: r.ref, moduleId, lessonId, q });
  }

  if (items.length === 0) {
    container.innerHTML = '<h1>🔁 Review Queue</h1><p>Could not load review questions.</p>';
    return;
  }

  let idx = 0, correct = 0;
  container.innerHTML = `
    <h1>🔁 Review Session</h1>
    <div class="quiz-container">
      <div class="quiz-progress" id="rv-progress"></div>
      <div id="rv-body"></div>
    </div>`;

  show();

  function show() {
    const item = items[idx];
    const q = item.q;
    container.querySelector('#rv-progress').textContent =
      `${idx + 1} of ${items.length} due · from ${item.moduleId}`;
    const body = container.querySelector('#rv-body');
    const inputType = q.type === 'multi' ? 'checkbox' : 'radio';
    body.innerHTML = `
      <div class="quiz-question">
        <h3>${escapeHtml(q.prompt)}</h3>
        <div>
          ${q.options.map((opt, i) => `
            <label class="quiz-option" data-i="${i}">
              <input type="${inputType}" name="rv" value="${i}">
              <span>${escapeHtml(opt)}</span>
            </label>`).join('')}
        </div>
        <div id="rv-feedback"></div>
        <div class="footer-actions" style="margin-top:16px">
          <button class="btn primary" id="rv-check">Check answer</button>
        </div>
      </div>`;

    body.querySelector('#rv-check').addEventListener('click', () => {
      const chosen = [...body.querySelectorAll('input:checked')].map((el) => Number(el.value));
      if (chosen.length === 0) return;
      const ok = [...q.answer].sort().join(',') === [...chosen].sort().join(',');
      if (ok) { correct += 1; store.reviewPassed(item.ref); }
      else store.reviewFailed(item.ref);

      body.querySelectorAll('.quiz-option').forEach((label) => {
        const i = Number(label.dataset.i);
        label.classList.add('disabled');
        label.querySelector('input').disabled = true;
        if (chosen.includes(i)) label.classList.add(q.answer.includes(i) ? 'correct' : 'incorrect');
        else if (q.answer.includes(i)) label.classList.add('revealed');
      });

      body.querySelector('#rv-feedback').innerHTML = `
        <div class="quiz-explanation">
          <span class="verdict ${ok ? 'ok' : 'bad'}">${ok ? '✔ Correct — interval extended.' : '✘ Missed — back to a 1-day interval.'}</span>
          ${escapeHtml(q.explanation)}
        </div>`;

      const actions = body.querySelector('.footer-actions');
      const last = idx === items.length - 1;
      actions.innerHTML = `<button class="btn primary" id="rv-next">${last ? 'Finish' : 'Next →'}</button>`;
      actions.querySelector('#rv-next').addEventListener('click', () => {
        if (last) finish();
        else { idx += 1; show(); }
      });
    });
  }

  function finish() {
    container.querySelector('#rv-progress').textContent = '';
    container.querySelector('#rv-body').innerHTML = `
      <div class="quiz-summary">
        <div>🧠</div>
        <div class="quiz-score ${correct === items.length ? 'pass' : 'fail'}">${correct}/${items.length}</div>
        <p>Review session complete. Correct answers moved to a longer interval; misses come back tomorrow.</p>
        <a class="btn primary" href="#/">Back to dashboard</a>
      </div>`;
    window.dispatchEvent(new CustomEvent('progress-changed'));
  }
}
