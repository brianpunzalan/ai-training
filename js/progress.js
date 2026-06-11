// Progress store: single versioned localStorage key, all reads/writes go through here.
const KEY = 'ai-training-progress';
const VERSION = 1;

function blank() {
  return { version: VERSION, lessons: {}, review: [], lastVisited: null, settings: {} };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const data = JSON.parse(raw);
    if (data.version !== VERSION) return migrate(data);
    return { ...blank(), ...data };
  } catch {
    return blank();
  }
}

function migrate(data) {
  // Future schema migrations go here; for now, preserve what we can.
  return { ...blank(), ...data, version: VERSION };
}

let state = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not persist progress:', e);
  }
}

export const store = {
  get raw() { return state; },

  lessonKey(moduleId, lessonId) { return `${moduleId}/${lessonId}`; },

  getLesson(moduleId, lessonId) {
    return state.lessons[this.lessonKey(moduleId, lessonId)] || null;
  },

  isComplete(moduleId, lessonId) {
    const l = this.getLesson(moduleId, lessonId);
    return !!(l && l.completed);
  },

  setComplete(moduleId, lessonId, completed) {
    const key = this.lessonKey(moduleId, lessonId);
    const lesson = state.lessons[key] || {};
    lesson.completed = completed;
    lesson.completedAt = completed ? new Date().toISOString() : null;
    state.lessons[key] = lesson;
    save();
  },

  recordQuiz(moduleId, lessonId, score, missedIds) {
    const key = this.lessonKey(moduleId, lessonId);
    const lesson = state.lessons[key] || {};
    const quiz = lesson.quiz || { bestScore: 0, attempts: 0 };
    quiz.attempts += 1;
    quiz.bestScore = Math.max(quiz.bestScore, score);
    quiz.lastAttempt = new Date().toISOString();
    quiz.missed = missedIds;
    lesson.quiz = quiz;
    // Passing the quiz (>= 70%) marks the lesson complete automatically.
    if (score >= 0.7 && lessonId !== '_module_review') {
      lesson.completed = true;
      lesson.completedAt = lesson.completedAt || new Date().toISOString();
    }
    state.lessons[key] = lesson;
    this._scheduleReview(moduleId, lessonId, missedIds);
    save();
  },

  // ----- Spaced review queue (Leitner-style expanding intervals) -----
  _scheduleReview(moduleId, lessonId, missedIds) {
    const now = Date.now();
    for (const qid of missedIds) {
      const ref = `${moduleId}/${lessonId}/${qid}`;
      if (!state.review.some((r) => r.ref === ref)) {
        state.review.push({ ref, due: new Date(now + 86400000).toISOString(), interval: 1 });
      } else {
        // Missed again somewhere: reset its interval.
        const item = state.review.find((r) => r.ref === ref);
        item.interval = 1;
        item.due = new Date(now + 86400000).toISOString();
      }
    }
  },

  dueReviews() {
    const now = Date.now();
    return state.review.filter((r) => new Date(r.due).getTime() <= now);
  },

  // Answered correctly in a review session: advance 1 -> 3 -> 7 -> 14 days, then retire.
  reviewPassed(ref) {
    const item = state.review.find((r) => r.ref === ref);
    if (!item) return;
    const next = { 1: 3, 3: 7, 7: 14 }[item.interval];
    if (!next) {
      state.review = state.review.filter((r) => r.ref !== ref);
    } else {
      item.interval = next;
      item.due = new Date(Date.now() + next * 86400000).toISOString();
    }
    save();
  },

  reviewFailed(ref) {
    const item = state.review.find((r) => r.ref === ref);
    if (!item) return;
    item.interval = 1;
    item.due = new Date(Date.now() + 86400000).toISOString();
    save();
  },

  // ----- misc -----
  setLastVisited(route) {
    state.lastVisited = route;
    save();
  },

  get lastVisited() { return state.lastVisited; },

  getSetting(name) { return state.settings[name]; },

  setSetting(name, value) {
    state.settings[name] = value;
    save();
  },

  moduleStats(module) {
    const total = module.lessons.length;
    const done = module.lessons.filter((l) => this.isComplete(module.id, l.id)).length;
    return { total, done };
  },

  overallStats(manifest) {
    let total = 0, done = 0, quizzes = 0, scoreSum = 0;
    for (const m of manifest.modules) {
      const s = this.moduleStats(m);
      total += s.total;
      done += s.done;
      for (const l of m.lessons) {
        const rec = this.getLesson(m.id, l.id);
        if (rec && rec.quiz) { quizzes += 1; scoreSum += rec.quiz.bestScore; }
      }
    }
    return { total, done, quizzes, avgScore: quizzes ? scoreSum / quizzes : 0 };
  },

  exportJSON() { return JSON.stringify(state, null, 2); },

  importJSON(text) {
    const data = JSON.parse(text);
    if (typeof data !== 'object' || !data.lessons) throw new Error('Not a valid progress file');
    state = { ...blank(), ...data, version: VERSION };
    save();
  },

  reset() {
    state = blank();
    save();
  }
};
