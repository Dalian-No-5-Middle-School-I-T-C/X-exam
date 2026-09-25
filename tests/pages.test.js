'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

function capture(modulePath, beforeRequire) {
  let def = null;
  global.Page = obj => { def = obj; };
  if (beforeRequire) beforeRequire();
  require(modulePath);
  delete global.Page;
  assert.ok(def, 'Page was not registered by ' + modulePath);
  return def;
}

function makePage(def) {
  const page = Object.assign({}, def, { data: JSON.parse(JSON.stringify(def.data)) });
  page.setData = function (patch) { Object.assign(this.data, patch); };
  return page;
}

const flush = () => new Promise(resolve => setImmediate(resolve));

const request = require('../utils/request');
const auth = require('../utils/auth');
const poster = require('../growth/poster');

const baseWx = {
  getStorageSync: () => '',
  setStorageSync: () => {},
  removeStorageSync: () => {},
  showToast: () => {},
  reLaunch: () => {}
};

let getStub = async () => { throw new Error('get 未打桩'); };
let postStub = async () => { throw new Error('post 未打桩'); };

const scoresDef = capture('../pages/scores/scores.js');
const detailDef = capture('../pages/detail/detail.js');
const trendsDef = capture('../pages/trends/trends.js');
request.get = (...args) => getStub(...args);
request.post = (...args) => postStub(...args);
const leaderboardDef = capture('../pages/leaderboard/leaderboard.js');
const changePasswordDef = capture('../pages/change-password/change-password.js');
const profileDef = capture('../pages/profile/profile.js');

function makeCanvas() {
  const calls = [];
  let rafCb = null;
  const ctx = new Proxy({}, {
    get(target, prop) {
      if (prop === Symbol.toPrimitive) return undefined;
      return (...args) => { calls.push([prop, ...args]); };
    },
    set(target, prop, value) {
      calls.push(['set ' + prop, value]);
      return true;
    }
  });
  return {
    calls,
    get pending() { return !!rafCb; },
    canvas: {
      width: 0,
      height: 0,
      getContext: () => ctx,
      requestAnimationFrame: fn => { rafCb = fn; return 1; },
      cancelAnimationFrame: () => { rafCb = null; }
    },
    run() {
      assert.ok(rafCb, 'requestAnimationFrame was not scheduled');
      rafCb();
      rafCb = null;
    }
  };
}

function installCanvasQuery(canvasMap) {
  const selects = [];
  global.wx = {
    getWindowInfo: () => ({ pixelRatio: 2 }),
    createSelectorQuery: () => ({
      select(sel) {
        selects.push(sel);
        return {
          fields() {
            return {
              exec(cb) {
                const entry = canvasMap[sel];
                cb(entry ? [entry] : [null]);
              }
            };
          }
        };
      }
    })
  };
  return selects;
}

function assertFiniteArgs(calls) {
  for (const call of calls) {
    for (const arg of call.slice(1)) {
      if (typeof arg === 'number') assert.ok(Number.isFinite(arg), 'non-finite arg in ' + call[0]);
    }
  }
}

// ---------- pages/scores ----------
test('scores.applyData sorts, dedupes subjects, computes overview', () => {
  const page = makePage(scoresDef);
  page.animateHero = () => {};
  page.applyData({
    name: '张三',
    scores: [
      { exam_id: 2, exam_name: '期中', subject: '数学', total_score: 80, full_score: 100, graded_at: '2026-03-01' },
      { exam_id: 1, exam_name: '月考', subject: '数学', total_score: 90, full_score: 100, graded_at: '2026-02-01' },
      { exam_id: 3, exam_name: '周测', subject: '语文', total_score: 85, full_score: 100, graded_at: '2026-04-01' }
    ]
  }, false);
  assert.equal(page.data.name, '张三');
  assert.deepEqual(page.data.list.map(s => s.exam_id), [3, 2, 1]);
  assert.deepEqual(page.data.subjects, ['语文', '数学']);
  assert.equal(page.data.latestChange, null); // 不同科目不比
  assert.equal(page.data.overview.totalExams, 3);
  assert.equal(page.data.overview.subjectCount, 2);
  assert.equal(page.data.overview.avgScore, 85);
  assert.equal(page.data.overview.best, '数学 90');
  assert.equal(page.data.overview.worst, '数学 80');
  assert.equal(page.data.fromCache, false);
});

test('scores.applyData computes latestChange only for same subject/full_score', () => {
  const page = makePage(scoresDef);
  page.animateHero = () => {};
  page.applyData({ scores: [
    { exam_id: 2, subject: '数学', total_score: 88, full_score: 100, graded_at: '2026-03-01' },
    { exam_id: 1, subject: '数学', total_score: 90, full_score: 100, graded_at: '2026-02-01' }
  ] }, false);
  assert.equal(page.data.latestChange, -2);

  const page2 = makePage(scoresDef);
  page2.animateHero = () => {};
  page2.applyData({ scores: [
    { exam_id: 2, subject: '数学', total_score: 88, full_score: 150, graded_at: '2026-03-01' },
    { exam_id: 1, subject: '数学', total_score: 90, full_score: 100, graded_at: '2026-02-01' }
  ] }, false);
  assert.equal(page2.data.latestChange, null);
});

test('scores.recompute filters by keyword and subject', () => {
  const page = makePage(scoresDef);
  page.setData({ list: [
    { exam_id: 1, exam_name: '期中考试', subject: 'Math' },
    { exam_id: 2, exam_name: '月考', subject: '语文' },
    { exam_id: 3, exam_name: '周测', subject: '英语' }
  ] });
  page.setData({ keyword: 'math' });
  page.recompute();
  assert.deepEqual(page.data.viewList.map(s => s.exam_id), [1]);
  page.setData({ keyword: '', subjectFilter: '语文' });
  page.recompute();
  assert.deepEqual(page.data.viewList.map(s => s.exam_id), [2]);
});

test('scores.goPaper 用列表里的考试名跳原卷页，列表缺失也不报错', () => {
  const urls = [];
  global.wx = { ...baseWx, navigateTo: o => urls.push(o.url) };
  const page = makePage(scoresDef);
  page.setData({ viewList: [
    { exam_id: 1, exam_name: '期中考试' },
    { exam_id: 2, exam_name: '周测' }
  ] });
  page.goPaper({ detail: { id: 2 } });
  assert.deepEqual(urls, ['/pages/exam-paper/exam-paper?examId=2&name=' + encodeURIComponent('周测')]);
  page.goPaper({ detail: { id: 99 } });
  assert.equal(urls[1], '/pages/exam-paper/exam-paper?examId=99&name=');
});

// ---------- pages/leaderboard ----------
function leaderboardPage() {
  const page = makePage(leaderboardDef);
  page.animateMine = () => {};
  return page;
}

test('leaderboard.loadBoard maps rows with fallbacks and myRank', async () => {
  getStub = async () => ({
    rows: [
      { studentId: 1, student_name: '甲', total_score: 95, ranking: 2 },
      { studentId: 2, name: '乙', score: 90, isMe: true }
    ],
    myRank: 3,
    myScore: 90
  });
  const page = leaderboardPage();
  page.setData({ examId: 5 });
  page.loadBoard();
  await flush();
  assert.equal(page.data.loading, false);
  assert.equal(page.data.list.length, 2);
  assert.deepEqual(page.data.list[0], { studentId: 1, rank: 2, name: '甲', score: 95, isMe: false });
  assert.deepEqual(page.data.list[1], { studentId: 2, rank: 2, name: '乙', score: 90, isMe: true });
  assert.deepEqual(page.data.mine, { rank: 3, score: 90, name: '我' });
  assert.equal(page.data.enabled, true);
});

test('leaderboard.loadBoard falls back to isMe row', async () => {
  getStub = async () => ({
    leaderboard: [{ rank: 1, name: 'A', score: 100, isCurrentUser: true }]
  });
  const page = leaderboardPage();
  page.setData({ examId: 5 });
  page.loadBoard();
  await flush();
  assert.deepEqual(page.data.mine, { rank: 1, score: 100, name: '我' });
});

test('leaderboard.loadBoard gives equal scores the same rank', async () => {
  getStub = async () => ({
    rows: [
      { ranking: 3, name: '甲', score: 20 },
      { ranking: 1, name: '乙', score: 30, isCurrentUser: true },
      { ranking: 2, name: '丙', score: 30 }
    ]
  });
  const page = leaderboardPage();
  page.setData({ examId: 5 });
  page.loadBoard();
  await flush();
  assert.deepEqual(page.data.list.map(item => item.rank), [3, 1, 1]);
  assert.deepEqual(page.data.mine, { rank: 1, score: 30, name: '我' });
});

test('leaderboard.loadBoard renders all 12 rows of a first-place tie', async () => {
  const rows = [];
  for (let i = 0; i < 12; i++) rows.push({ rank: 1, name: '甲' + i, totalScore: 143 });
  getStub = async () => ({ rows, myRank: 13, myScore: 140 });
  const page = leaderboardPage();
  page.setData({ examId: 5 });
  page.loadBoard();
  await flush();
  assert.equal(page.data.list.length, 12);
  assert.deepEqual(page.data.list.map(item => item.rank), new Array(12).fill(1));
  assert.equal(page.data.tiedFirst, 12);
  assert.equal(page.data.boardDesc, '前十 · 同分并列全显（共 12 人）');
  assert.deepEqual(page.data.mine, { rank: 13, score: 140, name: '我' });
});

test('leaderboard.loadBoard keeps the podium for a three-way first-place tie but not a four-way one', async () => {
  const board = (ranks) => {
    const rows = ranks.map((rank, i) => ({ rank, name: '甲' + i, totalScore: 200 - rank }));
    return { rows, myRank: ranks.length, myScore: 150 };
  };
  getStub = async () => board([1, 1, 1, 4, 5, 6, 7, 8, 9, 10]);
  const three = leaderboardPage();
  three.setData({ examId: 5 });
  three.loadBoard();
  await flush();
  assert.equal(three.data.tiedFirst, 3);
  assert.equal(three.data.boardDesc, '前十');

  getStub = async () => board([1, 1, 1, 1, 5, 6, 7, 8, 9, 10]);
  const four = leaderboardPage();
  four.setData({ examId: 5 });
  four.loadBoard();
  await flush();
  assert.equal(four.data.tiedFirst, 4);
});

test('leaderboard.loadBoard keeps the plain 前十 label for a normal board', async () => {
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push({ rank: i + 1, name: '甲' + i, totalScore: 150 - i });
  getStub = async () => ({ rows, myRank: 20, myScore: 100 });
  const page = leaderboardPage();
  page.setData({ examId: 5 });
  page.loadBoard();
  await flush();
  assert.equal(page.data.tiedFirst, 1);
  assert.equal(page.data.boardDesc, '前十');
});

test('leaderboard.loadBoard renders a mid-board tie that crosses the cut line', async () => {
  const rows = [];
  for (let i = 0; i < 8; i++) rows.push({ rank: i + 1, name: '甲' + i, totalScore: 150 - i });
  for (let i = 0; i < 5; i++) rows.push({ rank: 9, name: '乙' + i, totalScore: 142 });
  getStub = async () => ({ rows, myRank: 9, myScore: 142 });
  const page = leaderboardPage();
  page.setData({ examId: 5 });
  page.loadBoard();
  await flush();
  assert.equal(page.data.list.length, 13);
  assert.deepEqual(page.data.list.slice(8).map(item => item.rank), new Array(5).fill(9));
  assert.equal(page.data.tiedFirst, 1);
  assert.equal(page.data.boardDesc, '前十 · 同分并列全显（共 13 人）');
});

test('leaderboard.loadBoard flags the current user row so 我 gets highlighted', async () => {
  getStub = async () => ({
    rows: [
      { rank: 1, name: '甲', totalScore: 150, isCurrentUser: false },
      { rank: 2, name: '我', totalScore: 149, isCurrentUser: true },
      { rank: 3, name: '乙', totalScore: 148 }
    ],
    myRank: 2,
    myScore: 149
  });
  const page = leaderboardPage();
  page.setData({ examId: 5 });
  page.loadBoard();
  await flush();
  assert.deepEqual(page.data.list.map(item => item.isMe), [false, true, false]);
  assert.deepEqual(page.data.mine, { rank: 2, score: 149, name: '我' });
});

test('leaderboard.loadBoard treats 暂未开放 403 as disabled', async () => {
  getStub = async () => { throw Object.assign(new Error('天梯暂未开放'), { status: 403 }); };
  const page = leaderboardPage();
  page.setData({ examId: 5 });
  page.loadBoard();
  await flush();
  assert.equal(page.data.enabled, false);
  assert.equal(page.data.error, '');
});

test('leaderboard.loadBoard shows other errors', async () => {
  getStub = async () => { throw Object.assign(new Error('权限不足'), { status: 403 }); };
  const page = leaderboardPage();
  page.setData({ examId: 5 });
  page.loadBoard();
  await flush();
  assert.equal(page.data.error, '权限不足');
});

test('leaderboard.loadBoard guards missing examId', async () => {
  getStub = async () => { throw new Error('不应发起请求'); };
  const page = leaderboardPage();
  page.loadBoard();
  await flush();
  assert.equal(page.data.error, '参数缺失，无法加载天梯');
  assert.equal(page.data.loading, false);
});

// ---------- growth/poster ----------
function posterTexts(model) {
  const calls = [];
  const ctx = new Proxy({}, {
    get(target, prop) {
      if (prop === Symbol.toPrimitive) return undefined;
      // clipText 靠 measureText 决定截断，代理必须回一个可数的宽度
      if (prop === 'measureText') return (text) => ({ width: String(text).length * 10 });
      return (...args) => { calls.push([prop, ...args]); };
    },
    set(target, prop, value) {
      calls.push(['set ' + prop, value]);
      return true;
    }
  });
  poster.drawLeaderboardCard(ctx, 640, 560, model);
  return {
    texts: calls.filter(c => c[0] === 'fillText').map(c => String(c[1])),
    calls
  };
}

test('poster leaderboard card draws three named pods for a normal board', () => {
  const m = posterTexts({
    examName: '月考',
    tieCount: 1,
    top: [
      { rank: 1, name: '甲', score: 150 },
      { rank: 2, name: '乙', score: 149 },
      { rank: 3, name: '丙', score: 148 }
    ],
    mine: { rank: 20, score: 130 }
  });
  assert.deepEqual(m.texts.filter(t => t.charAt(0) === '#'), ['#1', '#2', '#3']);
  assert.ok(m.texts.includes('甲'));
  assert.ok(!m.texts.some(t => /^第 1 名 \d+ 人$/.test(t)));
  assertFiniteArgs(m.calls);
});

test('poster leaderboard card reports the tie size instead of picking three representatives', () => {
  const board = [];
  for (let i = 0; i < 12; i++) board.push({ rank: 1, name: '甲' + i, score: 150 });
  const m = posterTexts({ examName: '月考', tieCount: 12, top: board.slice(0, 3), mine: null });
  assert.ok(m.texts.includes('第 1 名 12 人'), m.texts.join('|'));
  assert.ok(!m.texts.some(t => t.charAt(0) === '#'), '并列第 1 超过 3 人时不该再画三张卡');
  assert.ok(!m.texts.includes('甲0'), '不该挑前三个同分的人上卡');
  assertFiniteArgs(m.calls);
});

test('poster leaderboard card keeps the pods for a three-way tie and survives a missing tieCount', () => {
  const top = [{ rank: 1, name: '甲', score: 150 }, { rank: 1, name: '乙', score: 150 }, { rank: 3, name: '丙', score: 148 }];
  assert.deepEqual(posterTexts({ tieCount: 3, top: top }).texts.filter(t => t.charAt(0) === '#'), ['#1', '#1', '#3']);
  assert.deepEqual(posterTexts({ top: top }).texts.filter(t => t.charAt(0) === '#'), ['#1', '#1', '#3']);
  assert.deepEqual(posterTexts({}).texts.filter(t => t.charAt(0) === '#'), []);
});

test('leaderboard.onSaveBoardCard hands the poster the first-place tie size', async () => {
  const growthService = require('../services/growthService');
  const realDrawAndSave = poster.drawAndSave;
  const realOnPosterSave = growthService.onPosterSave;
  let model = null;
  poster.drawAndSave = (type, m) => { model = { type, m }; return Promise.resolve('/tmp/x.png'); };
  growthService.onPosterSave = () => {};
  global.wx = Object.assign({}, baseWx, { showLoading: () => {}, hideLoading: () => {}, showToast: () => {} });
  try {
    const page = leaderboardPage();
    page.setData({ enabled: true, loading: false, error: '', examName: '月考', tiedFirst: 12 });
    page.data.list = [];
    for (let i = 0; i < 12; i++) page.data.list.push({ rank: 1, name: '甲' + i, score: 150, isMe: i === 0 });
    page.data.mine = { rank: 1, score: 150, name: '我' };
    page.onSaveBoardCard();
    assert.equal(model.type, 'leaderboard');
    assert.equal(model.m.tieCount, 12);
    assert.equal(model.m.top.length, 3);
    assert.deepEqual(model.m.mine, { rank: 1, score: 150 });
    await flush();
  } finally {
    poster.drawAndSave = realDrawAndSave;
    growthService.onPosterSave = realOnPosterSave;
    delete global.wx;
  }
});

// ---------- pages/detail ----------
test('detail.buildLists splits objective/subjective and enriches classAvg', () => {
  const page = makePage(detailDef);
  page.setData({
    rawQuestions: [
      { _key: 0, question_number: 1, score_type: 'objective', score: 2, max_score: 2 },
      { _key: 1, question_number: 2, score_type: 'subjective', score: 3, max_score: 5 },
      { _key: 2, question_number: 3, score_type: 'objective', score: 0, max_score: 1 }
    ],
    classAvgMap: { 1: { avgScore: 1.8 }, 3: { avgScore: 0.5 } }
  });
  page.buildLists();
  assert.equal(page.data.objective.length, 2);
  assert.equal(page.data.subjective.length, 1);
  assert.equal(page.data.objective[0].classAvg, 1.8);
  assert.equal(page.data.objective[1].classAvg, 0.5);
  assert.equal(page.data.subjective[0].classAvg, null);
});

test('detail.goPaper 带上考试名跳原卷页', () => {
  const urls = [];
  global.wx = { ...baseWx, navigateTo: o => urls.push(o.url) };
  const page = makePage(detailDef);
  page.setData({ examId: 5, examName: '月考' });
  page.goPaper();
  assert.deepEqual(urls, ['/pages/exam-paper/exam-paper?examId=5&name=' + encodeURIComponent('月考')]);
});

test('detail.loadDetail 记录后端 paperVisible 作为「查看答案解析」入口条件', async () => {
  global.wx = baseWx;
  getStub = async () => ({ paperVisible: 1, questions: [], classQuestionStats: {}, answerBlocks: [] });
  const page = makePage(detailDef);
  page.setData({ examId: 5 });
  page.loadDetail();
  await flush();
  assert.equal(page.data.paperVisible, 1);
  assert.equal(page.data.loading, false);
  assert.equal(page.data.error, '');

  const page2 = makePage(detailDef);
  getStub = async () => ({ questions: [], answerBlocks: [] });
  page2.setData({ examId: 5 });
  page2.loadDetail();
  await flush();
  assert.equal(page2.data.paperVisible, 0); // 后端没给就是不可见
});

// ---------- pages/trends（分析页：成绩走势 + 学科对比） ----------
const trendRows = { trends: [{ examName: '月考', total_score: 90, class_avg: 80, grade_avg: 70 }] };
const subjectRows = {
  subjects: ['数学', '语文', '英语'].map((subject, i) => ({
    subject, avg_score: 80 + i, avg_class_avg: 70 + i, gap_to_class: 10 - i, exam_count: 3, trend: 'up'
  })),
  weak_subject: '英语'
};

function stubUrls(map) {
  getStub = async (url) => {
    const key = Object.keys(map).filter(k => url.indexOf(k) >= 0)[0];
    if (!key) throw new Error('未打桩的接口: ' + url);
    if (map[key] instanceof Error) throw map[key];
    return map[key];
  };
}

test('trends.drawLine renders grid and series for a single point', () => {
  const realNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    const m = makeCanvas();
    installCanvasQuery({ '#lineCanvas': { node: m.canvas, width: 300, height: 200 } });
    const page = makePage(trendsDef);
    page.setData({ trends: [{ examName: '月考', total: 90, classAvg: 80, gradeAvg: 70 }] });
    page.drawLine();
    now += 1000;
    m.run();
    assert.ok(m.calls.some(c => c[0] === 'clearRect'));
    assert.ok(m.calls.some(c => c[0] === 'fillText'));
    assert.ok(m.calls.filter(c => c[0] === 'stroke').length >= 4);
    assertFiniteArgs(m.calls);
  } finally {
    Date.now = realNow;
  }
});

test('trends.drawLine skips empty data', () => {
  const selects = installCanvasQuery({});
  const page = makePage(trendsDef);
  page.drawLine();
  assert.deepEqual(selects, []);
});

test('trends.drawSubjects skips radar with <3 subjects and draws bar', () => {
  const realNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    const bar = makeCanvas();
    const selects = installCanvasQuery({ '#barCanvas': { node: bar.canvas, width: 300, height: 200 } });
    const page = makePage(trendsDef);
    page.setData({ subjects: [
      { subject: '数学', avgScore: 88, avgClassAvg: 80, gapToClass: 8 },
      { subject: '语文', avgScore: 75, avgClassAvg: 70, gapToClass: 5 }
    ] });
    page.drawSubjects();
    assert.deepEqual(selects, ['#barCanvas']);
    now += 1000;
    bar.run();
    assert.ok(bar.calls.some(c => c[0] === 'fillRect'));
    assert.ok(bar.calls.some(c => c[0] === 'fillText'));
    assertFiniteArgs(bar.calls);
  } finally {
    Date.now = realNow;
  }
});

test('trends.drawSubjects draws radar and bar with >=3 subjects', () => {
  const realNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    const radar = makeCanvas();
    const bar = makeCanvas();
    const selects = installCanvasQuery({
      '#radarCanvas': { node: radar.canvas, width: 300, height: 200 },
      '#barCanvas': { node: bar.canvas, width: 300, height: 200 }
    });
    const page = makePage(trendsDef);
    page.setData({
      subjects: ['数学', '语文', '英语', '物理'].map((subject, i) => ({
        subject, avgScore: 80 + i, avgClassAvg: 70 + i, gapToClass: 10 - i
      }))
    });
    page.drawSubjects();
    assert.deepEqual(selects, ['#radarCanvas', '#barCanvas']);
    now += 1000;
    radar.run();
    bar.run();
    assert.ok(radar.calls.some(c => c[0] === 'arc'));
    assert.ok(radar.calls.some(c => c[0] === 'fillText'));
    assert.ok(bar.calls.some(c => c[0] === 'fillRect'));
    assertFiniteArgs(radar.calls);
    assertFiniteArgs(bar.calls);
  } finally {
    Date.now = realNow;
  }
});

test('trends.drawSubjects leaves an in-flight 成绩走势 animation running', () => {
  const line = makeCanvas();
  const radar = makeCanvas();
  const bar = makeCanvas();
  installCanvasQuery({
    '#lineCanvas': { node: line.canvas, width: 300, height: 200 },
    '#radarCanvas': { node: radar.canvas, width: 300, height: 200 },
    '#barCanvas': { node: bar.canvas, width: 300, height: 200 }
  });
  const page = makePage(trendsDef);
  page.setData({
    trends: [{ examName: '月考', total: 90, classAvg: 80, gradeAvg: 70 }],
    subjects: ['数学', '语文', '英语'].map(subject => ({ subject, avgScore: 80, avgClassAvg: 70, gapToClass: 10 }))
  });
  page.drawLine();
  assert.equal(line.pending, true);
  // 两段数据各自回来、各自重绘：学科这一段刷新不能把折线的动画掐在半路
  page.drawSubjects();
  assert.equal(line.pending, true, '折线动画被学科重绘取消了');
  assert.equal(radar.pending, true);
  assert.equal(bar.pending, true);
});

test('trends.onHide cancels every running animation', () => {
  const line = makeCanvas();
  installCanvasQuery({ '#lineCanvas': { node: line.canvas, width: 300, height: 200 } });
  const page = makePage(trendsDef);
  page.setData({ trends: [{ examName: '月考', total: 90, classAvg: 80, gradeAvg: 70 }] });
  page.drawLine();
  assert.equal(line.pending, true);
  page.onHide();
  assert.equal(line.pending, false);
});

test('trends skips a canvas that reports zero size', () => {
  const line = makeCanvas();
  installCanvasQuery({ '#lineCanvas': { node: line.canvas, width: 0, height: 0 } });
  const page = makePage(trendsDef);
  page.setData({ trends: [{ examName: '月考', total: 90, classAvg: 80, gradeAvg: 70 }] });
  // 尺寸为 0 时按 dpr 缩放会得到退化画布，画出来全是越界图形，不如不画
  page.drawLine();
  assert.equal(line.pending, false);
  assert.equal(line.canvas.width, 0);
});

test('trends.load fills both sections from their own endpoints', async () => {
  stubUrls({ '/scores/me/trends': trendRows, '/scores/me/subject-comparison': subjectRows });
  installCanvasQuery({});
  const page = makePage(trendsDef);
  page.load();
  assert.equal(page.data.loading, true);
  await flush();
  assert.equal(page.data.loading, false);
  assert.deepEqual(page.data.trends.map(p => p.total), [90]);
  assert.equal(page.data.subjects.length, 3);
  assert.equal(page.data.weakSubject, '英语');
  assert.equal(page.data.error, '');
  assert.equal(page.data.subjectsError, '');
});

test('trends.load keeps the 成绩走势 section when 学科对比 fails', async () => {
  stubUrls({ '/scores/me/trends': trendRows, '/scores/me/subject-comparison': new Error('学科接口挂了') });
  installCanvasQuery({});
  const page = makePage(trendsDef);
  page.load();
  await flush();
  assert.deepEqual(page.data.trends.map(p => p.total), [90]);
  assert.equal(page.data.error, '');
  assert.equal(page.data.subjectsError, '学科接口挂了');
  assert.deepEqual(page.data.subjects, []);
  assert.equal(page.data.loading, false);
});

test('trends.load keeps the 学科对比 section when 成绩走势 fails', async () => {
  stubUrls({ '/scores/me/trends': new Error('趋势接口挂了'), '/scores/me/subject-comparison': subjectRows });
  installCanvasQuery({});
  const page = makePage(trendsDef);
  page.load();
  await flush();
  assert.equal(page.data.error, '趋势接口挂了');
  assert.deepEqual(page.data.trends, []);
  assert.equal(page.data.subjectsError, '');
  assert.equal(page.data.subjects.length, 3);
});

test('trends.load ignores a second call while one is in flight', async () => {
  const urls = [];
  getStub = async (url) => { urls.push(url); return url.indexOf('trends') >= 0 ? trendRows : subjectRows; };
  installCanvasQuery({});
  const page = makePage(trendsDef);
  page.load();
  page.load();
  await flush();
  assert.deepEqual(urls.sort(), ['/scores/me/subject-comparison', '/scores/me/trends']);
  assert.equal(page.data.loading, false);
});

test('trends.onShare mounts the poster first and opens it only once injected', async () => {
  const realNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    stubUrls({ '/scores/me/trends': trendRows, '/scores/me/subject-comparison': subjectRows });
    installCanvasQuery({});
    let opened = null;
    const page = makePage(trendsDef);
    // 用时注入：占位阶段 selectComponent 拿不到 open()
    let injected = false;
    page.selectComponent = () => (injected ? { open: (m) => { opened = m; } } : null);
    page.onShare();
    assert.equal(opened, null, '无数据时不该挂载海报');
    assert.equal(page.data.posterMounted, false);

    page.load();
    await flush();
    page.onShare();
    assert.equal(page.data.posterMounted, true, '点一键转发才挂载组件');
    assert.equal(opened, null, '占位组件还没换成真组件，不该调用 open');

    injected = true;
    page.onPosterReady();
    assert.equal(opened.type, 'subjects');
    assert.equal(opened.subjects.length, 3);
    assert.equal(opened.weakSubject, '英语');

    // 组件已在时直接开，不必等 ready
    opened = null;
    page.onShare();
    assert.equal(opened.type, 'subjects');
  } finally {
    Date.now = realNow;
  }
});

// ---------- pages/change-password ----------
function changePasswordPage() {
  const page = makePage(changePasswordDef);
  page.setData({ oldPassword: 'old123', newPassword: 'new123', confirm: 'new123' });
  return page;
}

test('change-password.onSubmit validates input', async () => {
  global.wx = baseWx;
  postStub = async () => { throw new Error('不应调用 post'); };
  const page = makePage(changePasswordDef);

  page.setData({ oldPassword: '', newPassword: 'x', confirm: 'x' });
  await page.onSubmit();
  assert.equal(page.data.error, '请输入当前密码和新密码');

  page.setData({ oldPassword: 'a', newPassword: '12345', confirm: '12345' });
  await page.onSubmit();
  assert.equal(page.data.error, '新密码长度至少 6 位');

  page.setData({ oldPassword: 'a', newPassword: '123456', confirm: '654321' });
  await page.onSubmit();
  assert.equal(page.data.error, '两次输入的新密码不一致');

  page.setData({ oldPassword: '123456', newPassword: '123456', confirm: '123456' });
  await page.onSubmit();
  assert.equal(page.data.error, '新密码不能与当前密码相同');
});

// ---------- pages/profile 成绩发布提醒开关 ----------
const { TEMPLATE_ID } = require('../utils/subscribe');

// 走真实 request.js（statusCode → err.status、body.message → err.message），
// 因此这里打的是 wx.request 而不是 request.post：subscribe.js 在 scores 页
// 经 growthService 就已加载，捕获的是原始的 request.post 引用。
async function toggleSub(http, setting) {
  const titles = [];
  global.wx = {
    ...baseWx,
    showToast: opts => { titles.push(opts.title); },
    showModal: () => {},
    reportAnalytics: () => {},
    requestSubscribeMessage: opts => opts.success({ [TEMPLATE_ID]: setting === undefined ? 'accept' : setting }),
    login: opts => opts.success({ code: 'c' }),
    request: opts => {
      if (http.transportFail) { opts.fail({ errMsg: 'request:fail' }); return; }
      opts.success({ statusCode: http.status, data: http.body || {} });
    }
  };
  const page = makePage(profileDef);
  await page.onToggleSub({ detail: { value: true } });
  await flush();
  return { page, titles };
}

test('profile 开关按后端状态码给不同文案，而不是笼统的绑定失败', async () => {
  // 503 = 环境变量没配；404 = 这一版后端还没上线。两者都不该让用户以为是自己操作错了
  assert.match((await toggleSub({ status: 503, body: { message: '服务端未配置成绩发布订阅模板' } })).titles[0], /服务尚未就绪/);
  assert.match((await toggleSub({ status: 404 })).titles[0], /服务尚未就绪/);
  assert.match((await toggleSub({ status: 403, body: { message: '仅学生账号可订阅成绩发布通知' } })).titles[0], /登录已过期/);
  assert.match((await toggleSub({ transportFail: true })).titles[0], /网络异常/);
  assert.equal((await toggleSub({ status: 500, body: { message: '订阅绑定保存失败，请稍后重试' } })).titles[0], '绑定失败，请重试');
});

test('profile 开关区分用户取消与订阅总开关被关闭', async () => {
  assert.equal((await toggleSub({}, 'reject')).titles[0], '已取消开启');
  assert.equal((await toggleSub({}, 'ban')).titles[0], '请先在右上角设置中允许订阅消息');
  assert.equal((await toggleSub({}, 'filter')).titles[0], '当前暂不支持该提醒，请稍后再试');
});

test('profile 开关成功后写本机关授权状态', async () => {
  const r = await toggleSub({ status: 200 });
  assert.equal(r.titles[0], '已开启成绩提醒');
  assert.equal(r.page.data.subOn, true);
  r.page.onToggleSub({ detail: { value: false } });
  assert.equal(r.page.data.subOn, false);
});

test('change-password.onSubmit clears login and reLaunches on success', async () => {
  const relaunchUrls = [];
  // 改密成功后先弹 modal 确认，用户点击确认才 reLaunch（避免 toast 被页面销毁吞掉）
  global.wx = { ...baseWx, reLaunch: opts => { relaunchUrls.push(opts.url); }, showModal: opts => { if (opts.success) opts.success({ confirm: true }); } };
  auth.setToken('t', true);
  postStub = async () => ({ ok: true });
  const page = changePasswordPage();
  await page.onSubmit();
  assert.equal(auth.getToken(), null);
  assert.deepEqual(relaunchUrls, ['/pages/login/login']);
  assert.equal(page.data.loading, false);
  auth.clearToken();
});

test('change-password.onSubmit shows error and keeps login on failure', async () => {
  const relaunchUrls = [];
  global.wx = { ...baseWx, reLaunch: opts => { relaunchUrls.push(opts.url); } };
  auth.setToken('t', true);
  postStub = async () => { throw new Error('修改失败'); };
  const page = changePasswordPage();
  await page.onSubmit();
  assert.equal(page.data.error, '修改失败');
  assert.equal(page.data.loading, false);
  assert.deepEqual(relaunchUrls, []);
  assert.equal(auth.getToken(), 't');
  auth.clearToken();
});
