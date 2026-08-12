'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

// ---------- utils/response.js ----------
const {
  toNum,
  normalizeScores,
  normalizeTrends,
  normalizeSubjects,
  normalizeQuestions
} = require('../utils/response');

test('toNum accepts numbers and numeric strings', () => {
  assert.equal(toNum(42), 42);
  assert.equal(toNum('42.5'), 42.5);
  assert.equal(toNum(0), 0);
  assert.equal(toNum('0'), 0);
});

test('toNum falls back to default on invalid input', () => {
  assert.equal(toNum(null, 1), 1);
  assert.equal(toNum(undefined, 1), 1);
  assert.equal(toNum('', 1), 1);
  assert.equal(toNum('  ', 1), 1);
  assert.equal(toNum('12x', 1), 1);
  assert.equal(toNum(Infinity, 1), 1);
  assert.equal(toNum(true, 1), 1);
});

test('normalizeScores maps snake/camel fields and parses numbers', () => {
  const r = normalizeScores({
    name: '张三',
    student_id: 7,
    scores: [{
      exam_id: '5', examName: '月考', subject: '数学',
      totalScore: '78.5', full_score: '100', gradedAt: '2026-08-01',
      rank: 3, class_size: 40, percentile: 91,
      objectiveScore: '20', subjective_score: '58.5'
    }]
  });
  assert.equal(r.name, '张三');
  assert.equal(r.studentId, 7);
  assert.deepEqual(r.scores[0], {
    exam_id: 5, exam_name: '月考', subject: '数学',
    total_score: 78.5, full_score: 100, graded_at: '2026-08-01',
    rank: 3, class_size: 40, percentile: 91,
    objective_score: 20, subjective_score: 58.5
  });
});

test('normalizeScores keeps null full_score and empty list', () => {
  assert.equal(normalizeScores({ scores: [{ exam_id: 1, total_score: 100 }] }).scores[0].full_score, null);
  assert.deepEqual(normalizeScores(null).scores, []);
});

test('normalizeTrends drops empty points but keeps real zeros', () => {
  const t = normalizeTrends([
    { exam_name: '考试0', total_score: 0 },
    {},
    { total_score: '90', class_avg: 80, grade_avg: '70' }
  ]);
  assert.equal(t.length, 2);
  assert.deepEqual(t[0], { examName: '考试0', total: 0, classAvg: 0, gradeAvg: 0 });
  assert.deepEqual(t[1], { examName: '', total: 90, classAvg: 80, gradeAvg: 70 });
});

test('normalizeTrends handles non-array input', () => {
  assert.deepEqual(normalizeTrends('oops'), []);
});

test('normalizeSubjects maps fields and filters empty subjects', () => {
  const r = normalizeSubjects({
    subjects: [
      { subject: '数学', avg_score: '88', gap: '2.5', count: '5' },
      { name: '' }
    ],
    weak_subject: '数学',
    totalExams: '7'
  });
  assert.equal(r.subjects.length, 1);
  assert.deepEqual(r.subjects[0], {
    subject: '数学', avgScore: 88, avgClassAvg: 0,
    gapToClass: 2.5, examCount: 5, trend: ''
  });
  assert.equal(r.weakSubject, '数学');
  assert.equal(r.totalExams, 7);
});

test('normalizeSubjects defaults totalExams to subject count and handles null', () => {
  assert.equal(normalizeSubjects({ subjects: [{ subject: 'a', avgScore: 1 }] }).totalExams, 1);
  assert.deepEqual(normalizeSubjects(null).subjects, []);
  assert.equal(normalizeSubjects([{ subject: '数学' }]).subjects.length, 1);
});

test('normalizeQuestions maps aliases and preserves nulls/zeros', () => {
  const q = normalizeQuestions({
    questions: [
      { question_number: 3, scoreType: 'objective', score: '2', maxScore: 4 },
      { score: 0 }
    ]
  });
  assert.equal(q.length, 2);
  assert.deepEqual(q[0], { _key: 0, question_number: 3, score_type: 'objective', score: 2, max_score: 4 });
  assert.equal(q[1].question_number, null);
  assert.equal(q[1].score, 0);
  assert.equal(q[1].max_score, null);
});

test('normalizeQuestions handles non-array input', () => {
  assert.deepEqual(normalizeQuestions(null), []);
});

// ---------- utils/ai.js ----------
const store = {};
global.wx = {
  getStorageSync: k => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v; },
  removeStorageSync: k => { delete store[k]; }
};

const { normalizeReport, getCachedAI, setCachedAI } = require('../utils/ai');

test('normalizeReport returns null for empty/unknown input', () => {
  assert.equal(normalizeReport(null), null);
  assert.equal(normalizeReport(undefined), null);
  assert.equal(normalizeReport(42), null);
  assert.equal(normalizeReport({ report: null }), null);
});

test('normalizeReport normalizes text reports', () => {
  assert.deepEqual(normalizeReport('分析'), { isText: true, text: '分析' });
  assert.deepEqual(normalizeReport({ report: 'r' }), { isText: true, text: 'r' });
  assert.deepEqual(normalizeReport({ analysis: 'a' }), { isText: true, text: 'a' });
  assert.deepEqual(normalizeReport({ data: 'd' }), { isText: true, text: 'd' });
});

test('normalizeReport normalizes structured reports with aliases', () => {
  const r = normalizeReport({
    report: {
      overallJudgement: '不错',
      weak_points: '粗心',
      nextActions: ['a', 'b'],
      teaching_suggestions: '多练',
      caveat: ['注意']
    }
  });
  assert.deepEqual(r, {
    isText: false,
    overall: '不错',
    weak: ['粗心'],
    next: ['a', 'b'],
    teach: ['多练'],
    cave: ['注意']
  });
});

test('normalizeReport falls back to whole object', () => {
  const r = normalizeReport({ overall: 'ok', suggestions: ['x'] });
  assert.equal(r.overall, 'ok');
  assert.deepEqual(r.teach, ['x']);
});

test('AI cache respects user salt and 30min TTL', () => {
  store.px_user = { studentId: 'u1' };
  const realNow = Date.now;
  const now = realNow();
  Date.now = () => now;
  try {
    setCachedAI('exam', 5, { isText: true, text: 'ok' });
    assert.deepEqual(getCachedAI('exam', 5), { isText: true, text: 'ok' });
    Date.now = () => now + 29 * 60 * 1000;
    assert.ok(getCachedAI('exam', 5));
    Date.now = () => now + 31 * 60 * 1000;
    assert.equal(getCachedAI('exam', 5), null);
    store.px_user = { studentId: 'u2' };
    assert.equal(getCachedAI('exam', 5), null);
  } finally {
    Date.now = realNow;
  }
});

test('AI cache ignores storage errors', () => {
  const realWx = global.wx;
  global.wx = {
    getStorageSync() { throw new Error('boom'); },
    setStorageSync() { throw new Error('boom'); },
    removeStorageSync() { throw new Error('boom'); }
  };
  try {
    assert.equal(getCachedAI('exam', 1), null);
    setCachedAI('exam', 1, { x: 1 });
  } finally {
    global.wx = realWx;
  }
});

// ---------- utils/subscribe.js ----------
const { getSubStatus, setSubStatus, requestSubscribe } = require('../utils/subscribe');

test('subscribe status round-trips storage', () => {
  setSubStatus(true);
  assert.equal(getSubStatus(), true);
  setSubStatus(false);
  assert.equal(getSubStatus(), false);
  setSubStatus(1);
  assert.equal(getSubStatus(), true);
});

test('requestSubscribe resolves noTemplate while TEMPLATE_ID is empty', async () => {
  assert.deepEqual(await requestSubscribe(), { ok: false, accepted: false, reason: 'noTemplate' });
});

// ---------- utils/animate.js ----------
const { animateNumber } = require('../utils/animate');

test('animateNumber completes synchronously when from === to', () => {
  const updates = [];
  let done = 0;
  const cancel = animateNumber({
    from: 5, to: 5, duration: 100,
    onUpdate: v => updates.push(v),
    onDone: () => done++
  });
  assert.deepEqual(updates, [5]);
  assert.equal(done, 1);
  cancel();
});

test('animateNumber eases toward target and clears its timer', () => {
  const realNow = Date.now;
  const realSetInterval = global.setInterval;
  const realClearInterval = global.clearInterval;
  let now = 1000;
  let timerCb = null;
  let cleared = null;
  Date.now = () => now;
  global.setInterval = fn => { timerCb = fn; return 123; };
  global.clearInterval = id => { cleared = id; };
  try {
    const updates = [];
    let done = 0;
    animateNumber({
      from: 0, to: 100, duration: 1000,
      onUpdate: v => updates.push(v),
      onDone: () => done++
    });
    now = 1500;
    timerCb(); // t=0.5 -> eased 0.875 -> 88
    now = 2000;
    timerCb(); // t=1 -> 100 + done（源码在 t>=1 时重复 onUpdate(to)）
    assert.deepEqual(updates, [88, 100, 100]);
    assert.equal(done, 1);
    assert.equal(cleared, 123);
  } finally {
    Date.now = realNow;
    global.setInterval = realSetInterval;
    global.clearInterval = realClearInterval;
  }
});

test('animateNumber cancel clears the timer', () => {
  const realNow = Date.now;
  const realSetInterval = global.setInterval;
  const realClearInterval = global.clearInterval;
  let now = 1000;
  let timerCb = null;
  let cleared = null;
  Date.now = () => now;
  global.setInterval = fn => { timerCb = fn; return 456; };
  global.clearInterval = id => { cleared = id; };
  try {
    const cancel = animateNumber({ from: 0, to: 10, onUpdate() {}, onDone() {} });
    now = 1500;
    timerCb();
    cancel();
    assert.equal(cleared, 456);
  } finally {
    Date.now = realNow;
    global.setInterval = realSetInterval;
    global.clearInterval = realClearInterval;
  }
});
