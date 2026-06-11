import { fetchQuiz, findModule } from './content.js';
import { store } from './progress.js';

// Renders an interactive quiz into `container`.
// lessonId may be a lesson id or '_module_review'.
export async function renderQuiz(container, moduleId, lessonId) {
  const module = findModule(moduleId);
  const quizData = module ? await fetchQuiz(module) : null;
  const quiz = quizData ? quizData[lessonId] : null;

  if (!quiz || !quiz.questions || quiz.questions.length === 0) {
    container.innerHTML = `<h1>Quiz</h1><p>No quiz available for this lesson yet.</p>
      <p><a href="#/module/${moduleId}">← Back to module</a></p>`;
    return;
  }

  const isReview = lessonId === '_module_review';
  const title = isReview ? `${module.title} — Module Review` : `Quiz: ${lessonTitle(module, lessonId)}`;
  const backLink = isReview ? `#/module/${moduleId}` : `#/lesson/${moduleId}/${lessonId}`;

  const state = { idx: 0, correct: 0, missed: [], answers: [] };
  container.innerHTML = `
    <div class="breadcrumbs"><a href="${backLink}">← Back</a></div>
    <h1>${title}</h1>
    <div class="quiz-container">
      <div class="quiz-progress" id="qz-progress"></div>
      <div id="qz-body"></div>
    </div>`;

  showQuestion();

  function showQuestion() {
    const q = quiz.questions[state.idx];
    const body = container.querySelector('#qz-body');
    container.querySelector('#qz-progress').textContent =
      `Question ${state.idx + 1} of ${quiz.questions.length}`;

    const inputType = q.type === 'multi' ? 'checkbox' : 'radio';
    body.innerHTML = `
      <div class="quiz-question">
        <h3>${escapeHtml(q.prompt)}</h3>
        ${q.type === 'multi' ? '<p class="quiz-progress">Select all that apply.</p>' : ''}
        <div id="qz-options">
          ${q.options.map((opt, i) => `
            <label class="quiz-option" data-i="${i}">
              <input type="${inputType}" name="qz" value="${i}">
              <span>${escapeHtml(opt)}</span>
            </label>`).join('')}
        </div>
        <div id="qz-feedback"></div>
        <div class="footer-actions" style="margin-top:16px">
          <button class="btn primary" id="qz-check">Check answer</button>
        </div>
      </div>`;

    body.querySelector('#qz-check').addEventListener('click', () => grade(q, body));
  }

  function grade(q, body) {
    const chosen = [...body.querySelectorAll('input:checked')].map((el) => Number(el.value));
    if (chosen.length === 0) return;

    const answer = [...q.answer].sort().join(',');
    const got = [...chosen].sort().join(',');
    const ok = answer === got;

    if (ok) state.correct += 1;
    else state.missed.push(q.id);
    state.answers.push({ q, chosen, ok });

    body.querySelectorAll('.quiz-option').forEach((label) => {
      const i = Number(label.dataset.i);
      label.classList.add('disabled');
      label.querySelector('input').disabled = true;
      if (chosen.includes(i)) label.classList.add(q.answer.includes(i) ? 'correct' : 'incorrect');
      else if (q.answer.includes(i)) label.classList.add('revealed');
    });

    body.querySelector('#qz-feedback').innerHTML = `
      <div class="quiz-explanation">
        <span class="verdict ${ok ? 'ok' : 'bad'}">${ok ? '✔ Correct.' : '✘ Not quite.'}</span>
        ${escapeHtml(q.explanation)}
      </div>`;

    const actions = body.querySelector('.footer-actions');
    const last = state.idx === quiz.questions.length - 1;
    actions.innerHTML = `<button class="btn primary" id="qz-next">${last ? 'See results' : 'Next question →'}</button>`;
    actions.querySelector('#qz-next').addEventListener('click', () => {
      if (last) finish();
      else { state.idx += 1; showQuestion(); }
    });
    actions.querySelector('#qz-next').focus();
  }

  function finish() {
    const total = quiz.questions.length;
    const score = state.correct / total;
    store.recordQuiz(moduleId, lessonId, score, state.missed);

    const pct = Math.round(score * 100);
    const pass = score >= 0.7;
    const body = container.querySelector('#qz-body');
    container.querySelector('#qz-progress').textContent = '';
    body.innerHTML = `
      <div class="quiz-summary">
        <div>${pass ? '🎉' : '📚'}</div>
        <div class="quiz-score ${pass ? 'pass' : 'fail'}">${pct}%</div>
        <p>${state.correct} of ${total} correct — ${pass
          ? (isReview ? 'module review passed.' : 'lesson marked complete!')
          : 'below the 70% pass mark. The explanations above are the learning — review and retry.'}</p>
        ${state.missed.length ? `<p class="quiz-progress">${state.missed.length} missed question${state.missed.length > 1 ? 's' : ''} added to your <a href="#/review">review queue</a> for spaced practice.</p>` : ''}
        <div class="footer-actions" style="justify-content:center">
          <button class="btn" id="qz-retry">Retry quiz</button>
          <a class="btn primary" href="${backLink}">Continue</a>
        </div>
        <div class="quiz-recap">
          <h3>Recap</h3>
          <ul>
            ${state.answers.map((a) => `<li>${a.ok ? '✔' : '✘'} ${escapeHtml(a.q.prompt)}</li>`).join('')}
          </ul>
        </div>
      </div>`;
    body.querySelector('#qz-retry').addEventListener('click', () => {
      state.idx = 0; state.correct = 0; state.missed = []; state.answers = [];
      showQuestion();
    });
    // Sidebar checkmarks may have changed (auto-complete on pass).
    window.dispatchEvent(new CustomEvent('progress-changed'));
  }

  function lessonTitle(mod, lid) {
    const l = mod.lessons.find((x) => x.id === lid);
    return l ? l.title : lid;
  }
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
