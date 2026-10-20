'use strict';
// 教师工作台（只读分析）的角色门、页面守卫与归一化行为。
// 后端才是真实边界，这里锁的是「学生看不到入口 + 前端不放大权限 + 数值口径不混用」。
const { test } = require('node:test');
const assert = require('node:assert/strict');

function capture(modulePath) {
  let def = null;
  global.Page = obj => { def = obj; };
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
const role = require('../utils/role');

const baseWx = {
  getStorageSync: () => '',
  setStorageSync: () => {},
  removeStorageSync: () => {},
  showToast: () => {},
  stopPullDownRefresh: () => {},
  navigateTo: () => {},
  reLaunch: () => {},
  switchTab: () => {},
  createSelectorQuery: () => ({ select: () => ({ fields: () => ({ exec: () => {} }) }) })
};

let getUrl = null;
function stubGet(fn) { getUrl = fn; }
// 必须是 async：桩内 throw 要变成 rejected promise，否则会同步炸穿页面的 .catch 链
request.get = async (path) => {
  if (!getUrl) throw new Error('get 未打桩');
  return getUrl(path);
};

function signIn(user, perms) {
  auth.setUser(user, true);
  auth.setPermissions(perms, true);
}
function signOut() {
  auth.clearUser();
  auth.clearPermissions();
}

const TEACHER = { id: 9, name: '王老师', role_id: 2, role_name: 'teacher', role_display_name: '教师', teacher_role: 'subject_teacher', subject: '数学' };
const ADMIN = { id: 1, name: '管理员', role_id: 1, role_name: 'admin', role_display_name: '管理员' };
const STUDENT = { id: 5, name: '张小明', role_id: 3, role_name: 'student', role_display_name: '学生', student_number: '2024001' };

// ── utils/role.js ─────────────────────────────────────
test('角色门：教师与管理员可达工作台，学生一律不可', () => {
  assert.equal(role.canViewTeacherWorkspace(TEACHER, ['grade:read']), true);
  assert.equal(role.canViewTeacherWorkspace(ADMIN, ['*']), true);
  assert.equal(role.canViewTeacherWorkspace(STUDENT, ['score:read']), false);
  // 未知角色（后端加新角色时前端默认拒绝）
  assert.equal(role.canViewTeacherWorkspace({ role_name: 'auditor' }, ['*']), false);
  // 只有 role_id 的旧响应也能判定
  assert.equal(role.canViewTeacherWorkspace({ role_id: 2 }, ['grade:read']), true);
  assert.equal(role.canViewTeacherWorkspace({ role_id: 3 }, ['score:read']), false);
});

test('角色门：域级通配、缺 permissions 的旧会话与明确的零权限', () => {
  assert.equal(role.canViewTeacherWorkspace(TEACHER, ['grade:*']), true);
  assert.equal(role.canViewTeacherWorkspace(TEACHER, ['exam:read']), false);
  // null / undefined = 读不到权限位（本次改动前建立的会话、后端未返回该字段）：
  // 放行入口，真实鉴权仍由后端做，避免把老用户挡在门外又给不出原因
  assert.equal(role.canViewTeacherWorkspace(TEACHER, null), true);
  assert.equal(role.canViewTeacherWorkspace(TEACHER, undefined), true);
  // [] = 后端明确给了「一个权限位都没有」：隐藏入口，点了只会看到 403
  assert.equal(role.canViewTeacherWorkspace(TEACHER, []), false);
  assert.equal(role.hasPermission(['*'], 'grade:read'), true);
  assert.equal(role.hasPermission([], 'grade:read'), false);
});

test('管理员判据：权威字段优先，旧会话才退回历史线索', () => {
  global.wx = baseWx;
  signOut();
  assert.equal(role.isAdminUser(ADMIN), true);
  assert.equal(role.isAdminUser({ role_id: 1 }), true);
  assert.equal(role.isAdminUser(STUDENT), false);
  assert.equal(role.isAdminUser(TEACHER), false);
  // 学生即便带上线索也不是管理员（权威字段存在时一概不查线索）
  assert.equal(role.isAdminUser({ role_name: 'student', isAdmin: true }), false);
  assert.equal(role.isAdminUser({ role_id: 3, role_display_name: '管理员' }), false);
  // 旧会话：没有 role_name / role_id，只有历史线索 —— 放行，否则管理员会失去天梯入口
  assert.equal(role.isAdminUser({ isAdmin: true }), true);
  assert.equal(role.isAdminUser({ role: 'Administrator' }), true);
  assert.equal(role.isAdminUser({ role_display_name: '管理员' }), true);
  assert.equal(role.isAdminUser(null), false);
  // 同一判据同时决定工作台入口，不再出现「入口看不见、页面却能进」的错位
  assert.equal(role.canViewTeacherWorkspace({ role_display_name: '管理员' }, []), true);
  assert.equal(role.canViewTeacherWorkspace({ role_name: 'teacher', role_display_name: '管理员' }, []), false);
  signOut();
});

test('homePath 决定登录落地页；guardWorkspace 拦下学生', () => {
  global.wx = baseWx;
  assert.equal(role.homePath(TEACHER, ['grade:read']), '/pages/t-exams/t-exams');
  assert.equal(role.homePath(ADMIN, ['*']), '/pages/t-exams/t-exams');
  assert.equal(role.homePath(STUDENT, ['score:read']), '/pages/scores/scores');

  const urls = [];
  global.wx = Object.assign({}, baseWx, { reLaunch: o => urls.push(o.url) });
  signIn(STUDENT, ['score:read']);
  assert.equal(role.guardWorkspace(), false);
  assert.deepEqual(urls, ['/pages/scores/scores']);

  urls.length = 0;
  signIn(TEACHER, ['grade:read']);
  assert.equal(role.guardWorkspace(), true);
  assert.deepEqual(urls, []);
  signOut();
});

// 「我的」页眉标原先写死成学生文案，教师 / 管理员进来也显示「STUDENT · 学生档案」。
// 这里锁的是判据本身：文字由角色给出，且管理员与「管理」入口共用同一条判据。
test('profileEyebrow 按角色出文案，认不出角色回落学生文案', () => {
  global.wx = baseWx;
  signOut();
  assert.equal(role.profileEyebrow(TEACHER), 'TEACHER · 老师档案');
  assert.equal(role.profileEyebrow(ADMIN), 'ADMIN · 管理员档案');
  assert.equal(role.profileEyebrow(STUDENT), 'STUDENT · 学生档案');
  // 只有 role_id 的旧响应
  assert.equal(role.profileEyebrow({ role_id: 2 }), 'TEACHER · 老师档案');
  assert.equal(role.profileEyebrow({ role_id: 3 }), 'STUDENT · 学生档案');
  // role_name 优先于 role_id：后端给了什么角色就显示什么，不按 id 猜
  assert.equal(role.profileEyebrow({ role_name: 'teacher', role_id: 3 }), 'TEACHER · 老师档案');
  // 未知角色与未登录：回落本页默认受众，不留空
  assert.equal(role.profileEyebrow({ role_name: 'auditor' }), 'STUDENT · 学生档案');
  assert.equal(role.profileEyebrow(null), 'STUDENT · 学生档案');
  // 旧会话只剩历史线索的管理员，与 isAdminUser 决定的入口保持一致
  assert.equal(role.profileEyebrow({ role_display_name: '管理员' }), 'ADMIN · 管理员档案');
  assert.equal(role.profileEyebrow({ role_name: 'teacher', role_display_name: '管理员' }), 'TEACHER · 老师档案');
});

// 眉题在模板里要拆成 .en / .cn 两段（mono + uppercase 只能落在拉丁上，见 app.wxss），
// 拆分必须由 utils/role.js 做，页面不自己 cut 字符串；这里锁住「拆开再拼回等于整行」这条契约。
test('profileEyebrowParts 拆分文案，en + cn 恰好等于 profileEyebrow', () => {
  [TEACHER, ADMIN, STUDENT, { role_id: 2 }, { role_name: 'auditor' }, null].forEach(u => {
    const p = role.profileEyebrowParts(u);
    assert.equal(p.en + p.cn, role.profileEyebrow(u), '拼接必须还原整行：' + JSON.stringify(u));
    assert.match(p.en, /^[A-Z0-9 /]+$/, 'en 段只能是不含中文的拉丁串：' + p.en);
    assert.ok(p.cn === '' || /^ · /.test(p.cn), 'cn 段必须带前导分隔符：' + JSON.stringify(p.cn));
  });
  assert.deepEqual(role.profileEyebrowParts(TEACHER), { en: 'TEACHER', cn: ' · 老师档案' });
  assert.deepEqual(role.profileEyebrowParts(ADMIN), { en: 'ADMIN', cn: ' · 管理员档案' });
  assert.deepEqual(role.profileEyebrowParts(STUDENT), { en: 'STUDENT', cn: ' · 学生档案' });
});

// ── pages/t-exams ─────────────────────────────────────
const tExamsDef = capture('../pages/t-exams/t-exams.js');
const tAnalysisDef = capture('../pages/t-analysis/t-analysis.js');
const tQuestionDef = capture('../pages/t-question/t-question.js');
const tRankingDef = capture('../pages/t-ranking/t-ranking.js');
const tClassesDef = capture('../pages/t-classes/t-classes.js');

test('t-exams：学生被守卫拦下，不发任何请求', async () => {
  global.wx = baseWx;
  signIn(STUDENT, ['score:read']);
  const reqs = [];
  stubGet(p => { reqs.push(p); return []; });
  const page = makePage(tExamsDef);
  page.onLoad();
  await flush();
  assert.deepEqual(reqs, []);
  signOut();
});

test('t-exams：公布状态按后端 0/1/2 映射，汇总按本地列表统计', async () => {
  global.wx = baseWx;
  signIn(TEACHER, ['grade:read']);
  const reqs = [];
  stubGet(p => {
    reqs.push(p);
    return [
      { id: 7, name: '期中文', subject: '数学', grade_name: '高一', exam_date: '2026-04-10', score_published: 1, graded_count: 42, avg_score: 96.5 },
      { id: 8, name: '期末末', subject: '物理', grade_name: '高一', exam_date: '2026-05-01', score_published: 0, graded_count: 0, avg_score: null },
      { id: 9, name: '晨测', subject: '数学', grade_name: '高一', exam_date: '2026-03-01', score_published: 2, graded_count: 12, avg_score: '20.0' }
    ];
  });
  const page = makePage(tExamsDef);
  page.onLoad();
  await flush();
  // selection=1 才带出 grade_name / graded_count / avg_score / score_published
  assert.deepEqual(reqs, ['/exams?selection=1']);
  assert.equal(page.data.list.length, 3);
  // 按 exam_date 倒序
  assert.deepEqual(page.data.list.map(e => e.examId), [8, 7, 9]);
  assert.deepEqual(page.data.stats, { exams: 3, published: 1, graded: 2 });
  assert.equal(page.data.list.find(e => e.examId === 9).publishLabel, '已撤回');
  assert.equal(page.data.list.find(e => e.examId === 8).avgScore, null);

  page.setData({ subjectFilter: '数学' });
  page.recompute();
  assert.deepEqual(page.data.viewList.map(e => e.examId), [7, 9]);
  page.setData({ subjectFilter: '', keyword: '期末' });
  page.recompute();
  assert.deepEqual(page.data.viewList.map(e => e.examId), [8]);
  signOut();
});

// ── pages/t-analysis ──────────────────────────────────
test('t-analysis：非法 examId 不发请求，后端 403 文案原样呈现', async () => {
  global.wx = baseWx;
  signIn(TEACHER, ['grade:read']);
  const reqs = [];
  stubGet(p => { reqs.push(p); throw Object.assign(new Error('权限不足：管理员已关闭你对本场考试「图表」的查看权限'), { status: 403 }); });

  const bad = makePage(tAnalysisDef);
  bad.onLoad({ examId: '7 or 1=1' });
  await flush();
  assert.equal(bad.data.invalid, true);
  assert.deepEqual(reqs, []);

  const page = makePage(tAnalysisDef);
  page.onLoad({ examId: '7' });
  await flush();
  await flush();
  assert.equal(page.data.ovError, '权限不足：管理员已关闭你对本场考试「图表」的查看权限');
  signOut();
});

test('t-analysis：班级筛选下标映射 classId，切班只重取当前页签', async () => {
  global.wx = baseWx;
  signIn(TEACHER, ['grade:read']);
  const reqs = [];
  stubGet(p => {
    reqs.push(p);
    if (p.indexOf('/classes') >= 0) return [{ classId: 3, className: '一班' }, { classId: 4, className: '二班' }];
    return { gradedCount: 0, distribution: [], errorRateBuckets: {} };
  });
  const page = makePage(tAnalysisDef);
  page.onLoad({ examId: '7' });
  await flush();
  await flush();
  assert.deepEqual(page.data.classOptions.map(c => c.className), ['全部班级', '一班', '二班']);
  assert.deepEqual(reqs, [
    '/analysis/exams/7/classes',
    '/analysis/exams/7/overview',
    '/analysis/exams/7/previous'
  ]);

  reqs.length = 0;
  page.onClassChange({ detail: { value: 1 } });
  await flush();
  await flush();
  assert.equal(page.data.classId, '3');
  assert.equal(page.data.classLabel, '一班');
  assert.deepEqual(reqs, ['/analysis/exams/7/overview?classId=3', '/analysis/exams/7/previous?classId=3']);
});

test('t-analysis：小题按得分率升序，非数字题号不给下钻入口', async () => {
  global.wx = baseWx;
  signIn(TEACHER, ['grade:read']);
  stubGet(p => {
    if (p.indexOf('/classes') >= 0) return [];
    if (p.indexOf('/questions') >= 0) {
      return [
        { questionNumber: '1', scoreRate: 80, difficulty: 0.8, discrimination: 0.2 },
        { questionNumber: '03', scoreRate: 35, difficulty: 0.35, discrimination: -0.05 },
        { questionNumber: '12(1)', scoreRate: 60, difficulty: 0.6, discrimination: null }
      ];
    }
    return { gradedCount: 0, distribution: [], errorRateBuckets: {} };
  });
  const page = makePage(tAnalysisDef);
  page.onLoad({ examId: '7' });
  await flush();
  await flush();
  page.switchTab({ currentTarget: { dataset: { key: 'question' } } });
  await flush();
  await flush();
  assert.deepEqual(page.data.questions.map(q => q.questionNumber), ['03', '12(1)', '1']);
  assert.equal(page.data.questions[0].rateText, '35%');
  assert.equal(page.data.questions[0].discriminationText, '-0.05');
  assert.equal(page.data.questions[1].canDrill, false);
  assert.equal(page.data.questions[0].canDrill, true);
  assert.equal(page.data.questions[2].canDrill, true);

  // 区分度升序：null 排最后，-0.05 在前
  page.onSort({ currentTarget: { dataset: { value: 'disc' } } });
  assert.deepEqual(page.data.questions.map(q => q.questionNumber), ['03', '1', '12(1)']);

  const urls = [];
  global.wx = Object.assign({}, baseWx, { navigateTo: o => urls.push(o.url) });
  page.goQuestion({ currentTarget: { dataset: { no: '12(1)' } } });
  assert.deepEqual(urls, []);
  page.goQuestion({ currentTarget: { dataset: { no: '03' } } });
  assert.equal(urls.length, 1);
  assert.match(urls[0], /questionNumber=03/);
  signOut();
});

test('t-analysis：题号重复时小题行仍有唯一列表键', async () => {
  const fs = require('fs');
  const path = require('path');
  global.wx = baseWx;
  signIn(TEACHER, ['grade:read']);
  stubGet(p => {
    if (p.indexOf('/classes') >= 0) return [];
    if (p.indexOf('/questions') >= 0) {
      // 同一题号的客观/主观两行：questionNumber 相同，不能当 wx:key
      return [
        { questionNumber: '5', questionType: '客观', scoreRate: 70, difficulty: 0.7, discrimination: 0.1 },
        { questionNumber: '5', questionType: '主观', scoreRate: 40, difficulty: 0.4, discrimination: 0.3 }
      ];
    }
    return { gradedCount: 0, distribution: [], errorRateBuckets: {} };
  });
  const page = makePage(tAnalysisDef);
  page.onLoad({ examId: '7' });
  await flush();
  await flush();
  page.switchTab({ currentTarget: { dataset: { key: 'question' } } });
  await flush();
  await flush();
  assert.equal(page.data.questions.length, 2);
  const before = page.data.questions.map(q => q.uid);
  assert.equal(new Set(before).size, 2, '重复题号必须给出两个不同的 uid');
  // 排序只改变顺序，不能让 uid 丢失或撞车
  page.onSort({ currentTarget: { dataset: { value: 'disc' } } });
  assert.deepEqual(page.data.questions.map(q => q.uid).sort(), before.slice().sort());
  assert.equal(new Set(page.data.questions.map(q => q.uid)).size, 2);

  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages', 't-analysis', 't-analysis.wxml'), 'utf8');
  assert.match(wxml, /wx:for="\{\{questions\}\}"\s+wx:key="uid"/, '小题列表的 wx:key 必须是 uid');
  signOut();
});

// ── pages/t-question ──────────────────────────────────
test('t-question：非法参数不请求，概览按逐人得分现算', async () => {
  global.wx = baseWx;
  signIn(TEACHER, ['grade:read']);
  const reqs = [];
  stubGet(p => { reqs.push(p); return []; });
  const bad = makePage(tQuestionDef);
  bad.onLoad({ examId: '7', questionNumber: '1;drop' });
  await flush();
  assert.equal(bad.data.invalid, true);
  assert.deepEqual(reqs, []);

  stubGet(() => [
    { studentId: 1, studentNumber: '01', name: '甲', className: '一班', score: 10, maxScore: 10, scoreRate: 100, isFull: true },
    { studentId: 2, studentNumber: '02', name: '乙', className: '一班', score: 0, maxScore: 10, scoreRate: 0, isFull: false },
    { studentId: 3, studentNumber: '03', name: '丙', className: '一班', score: 5, maxScore: 10, scoreRate: 50, isFull: false },
    { studentId: 4, studentNumber: '04', name: '丁', className: '二班', score: null, maxScore: null, scoreRate: null, isFull: false }
  ]);
  const page = makePage(tQuestionDef);
  page.onLoad({ examId: '7', questionNumber: '3', classId: '' });
  await flush();
  assert.equal(page.data.summary.full, 1);
  assert.equal(page.data.summary.zero, 1);
  assert.equal(page.data.summary.counted, 3);
  assert.equal(page.data.summary.total, 4);
  // (10+0+5)/3 = 5 → 50%
  assert.equal(page.data.summary.avgRate, '50%');
  // 默认按得分降序，null 得分按 0 参与排序但排在最后
  assert.deepEqual(page.data.list.map(r => r.name), ['甲', '丙', '乙', '丁']);
  assert.equal(page.data.list[0].seq, 1);
  assert.equal(page.data.list[3].rateText, '—');

  page.onSort({ currentTarget: { dataset: { value: 'asc' } } });
  assert.deepEqual(page.data.list.map(r => r.name), ['乙', '丁', '丙', '甲']);
  signOut();
});

test('t-question：满分缺失时平均得分率显示「—」而不是 0%', async () => {
  global.wx = baseWx;
  signIn(TEACHER, ['grade:read']);
  stubGet(() => [{ studentId: 1, studentNumber: '01', name: '甲', className: null, score: 3, maxScore: null, scoreRate: null, isFull: false }]);
  const page = makePage(tQuestionDef);
  page.onLoad({ examId: '7', questionNumber: '1' });
  await flush();
  assert.equal(page.data.summary.avgRate, '—');
  assert.equal(page.data.summary.maxScore, '—');
  assert.equal(page.data.list[0].className, '—');
  signOut();
});

// ── pages/t-ranking ───────────────────────────────────
test('t-ranking：整榜一次取回，分页与搜索全在本地', async () => {
  global.wx = baseWx;
  signIn(TEACHER, ['grade:read']);
  let hits = 0;
  const rows = [];
  for (let i = 1; i <= 65; i++) {
    rows.push({
      rank: i, studentNumber: 'N' + i, studentName: '学生' + i, totalScore: 700 - i,
      objectiveScore: 300, subjectiveScore: 400 - i, lowScoreCount: i % 5,
      questionCount: 20, errorRate: 10, errorRateLevel: 'low'
    });
  }
  stubGet(p => {
    if (p.indexOf('/classes') >= 0) return [];
    hits += 1;
    return rows;
  });
  const page = makePage(tRankingDef);
  page.onLoad({ examId: '7' });
  await flush();
  assert.equal(hits, 1);
  assert.equal(page.data.total, 65);
  assert.equal(page.data.list.length, 30);
  assert.equal(page.data.hasMore, true);

  page.onMore();
  assert.equal(page.data.list.length, 60);
  page.onMore();
  assert.equal(page.data.list.length, 65);
  assert.equal(page.data.hasMore, false);
  // 翻页不产生新请求
  assert.equal(hits, 1);

  page.onSearch({ detail: { value: '学生6' } });
  assert.equal(page.data.list.length, 7);
  assert.equal(page.data.matched, 7);
  assert.equal(page.data.total, 65);

  page.onSearch({ detail: { value: '' } });
  assert.equal(page.data.list.length, 30);
  signOut();
});

test('t-ranking：rank 为 null 不被当成前三名', async () => {
  global.wx = baseWx;
  signIn(TEACHER, ['grade:read']);
  stubGet(p => (p.indexOf('/classes') >= 0 ? [] : [{ rank: null, studentNumber: 'A', studentName: '无名次', totalScore: 10, lowScoreCount: 0, questionCount: 1, errorRate: null }]));
  const page = makePage(tRankingDef);
  page.onLoad({ examId: '7' });
  await flush();
  assert.equal(page.data.list[0].rankText, '—');
  assert.equal(page.data.list[0].isTop, false);
  assert.equal(page.data.list[0].errorRateText, '—');
  signOut();
});

// ── pages/t-analysis：满分不可知与班级口径 ───────────────
test('t-analysis：满分不可知时及格率/优秀率显示「—」而不是占位 0%', async () => {
  global.wx = baseWx;
  signIn(TEACHER, ['grade:read']);
  stubGet(p => {
    if (p.indexOf('/classes') >= 0) return [];
    if (p.indexOf('/previous') >= 0) return { prevExamName: null };
    // 后端口径：无答题卡且无逐题满分时 fullScore=0，及格率/优秀率一律置 0 作占位
    return {
      fullScore: 0, totalStudents: 40, gradedCount: 40, avgScore: 66.4, maxScore: 90, minScore: 12,
      stdDev: 12, passRate: 0, excellentRate: 0, passScore: 0, excellentScore: 0,
      distribution: [], scoreSummary: { min: 12, q1: 50, median: 66, q3: 80, max: 90, avg: 66.4, count: 40 }
    };
  });
  const page = makePage(tAnalysisDef);
  page.onLoad({ examId: '7' });
  await flush();
  await flush();
  assert.equal(page.data.ovText.passRate, '—');
  assert.equal(page.data.ovText.excellentRate, '—');
  assert.equal(page.data.ovText.full, '—');
  // 平均分与标准差是真实统计值，不受满分缺失影响
  assert.equal(page.data.ovText.avg, '66.4');
  assert.equal(page.data.prev.hasPrevious, false);
  signOut();
});

test('t-analysis：客观题显示正确率，错误计数按题型措辞', async () => {
  global.wx = baseWx;
  signIn(TEACHER, ['grade:read']);
  stubGet(p => {
    if (p.indexOf('/classes') >= 0) return [];
    if (p.indexOf('/questions') >= 0) {
      return [
        { questionNumber: '1', questionType: '客观', scoreRate: 80, correctRate: 80, avgScore: 4, maxScore: 5, errorCount: 10, errorRate: 20, totalCount: 50, difficulty: 0.8, discrimination: 0.2 },
        { questionNumber: '2', questionType: '主观', scoreRate: 60, correctRate: null, avgScore: 6, maxScore: 10, errorCount: 4, errorRate: 8, totalCount: 50, difficulty: 0.6, discrimination: 0.1 }
      ];
    }
    return { gradedCount: 0, distribution: [], errorRateBuckets: {} };
  });
  const page = makePage(tAnalysisDef);
  page.onLoad({ examId: '7' });
  await flush();
  await flush();
  page.switchTab({ currentTarget: { dataset: { key: 'question' } } });
  await flush();
  await flush();
  // 默认按得分率升序：主观题（60%）在前，客观题（80%）在后
  assert.deepEqual(page.data.questions.map(q => q.questionNumber), ['2', '1']);
  assert.equal(page.data.questions[0].correctRateText, '');
  assert.equal(page.data.questions[0].errorLabel, '低分');
  // 客观题的 errorCount 是「未满分」人数，正确率可直接展示
  assert.equal(page.data.questions[1].correctRateText, '80%');
  assert.equal(page.data.questions[1].errorLabel, '未满分');
  signOut();
});

test('t-analysis：未知班级（classId=0）不传给知识点接口', async () => {
  global.wx = baseWx;
  signIn(TEACHER, ['grade:read']);
  const reqs = [];
  stubGet(p => {
    reqs.push(p);
    if (p.indexOf('/classes') >= 0) return [{ classId: 0, className: '未知班级' }, { classId: 3, className: '一班' }];
    if (p.indexOf('knowledge-points') >= 0) return { weaknesses: [] };
    return { gradedCount: 0, distribution: [], errorRateBuckets: {} };
  });
  const page = makePage(tAnalysisDef);
  page.onLoad({ examId: '7' });
  await flush();
  await flush();
  reqs.length = 0;
  // picker 第 1 项是 classId=0 的「未知班级」
  page.onClassChange({ detail: { value: 1 } });
  await flush();
  await flush();
  assert.equal(page.data.classId, '0');
  page.switchTab({ currentTarget: { dataset: { key: 'knowledge' } } });
  await flush();
  await flush();
  assert.ok(reqs.indexOf('/analysis/knowledge-points/7') >= 0, 'knowledge-points 不带 classId');
  assert.equal(reqs.filter(x => x.indexOf('knowledge-points') >= 0 && x.indexOf('classId') >= 0).length, 0);
  // 同一筛选下概况/逐题接口是支持 classId=0 的（后端 classFilter 认 0=无班级），只有知识点接口口径不同
  assert.ok(reqs.indexOf('/analysis/exams/7/overview?classId=0') >= 0);
  signOut();
});

// ── pages/t-classes ───────────────────────────────────
test('t-classes：班际差距取同题各班得分率极差，按差距降序截断', async () => {
  global.wx = baseWx;
  signIn(TEACHER, ['grade:read']);
  stubGet(() => ({
    fullScore: 150,
    classes: [
      { classId: 3, className: '一班', count: 40, avgScore: 120, maxScore: 149, minScore: 60, median: 122, stdDev: 12, passRate: 90, excellentRate: 40, difficulty: 0.8, discrimination: 0.3 },
      { classId: 4, className: '二班', count: 38, avgScore: 90, maxScore: 130, minScore: 40, median: 92, stdDev: 18, passRate: 60, excellentRate: 15, difficulty: 0.6, discrimination: 0.35 }
    ],
    questionStats: [
      { questionNumber: 1, maxScore: 10, byClass: [{ classId: 3, scoreRate: 90 }, { classId: 4, scoreRate: 60 }] },
      { questionNumber: 2, maxScore: 10, byClass: [{ classId: 3, scoreRate: 50 }, { classId: 4, scoreRate: 48 }] },
      { questionNumber: 3, maxScore: 10, byClass: [{ classId: 3, scoreRate: null }] }
    ]
  }));
  const page = makePage(tClassesDef);
  page.onLoad({ examId: '7' });
  await flush();
  assert.equal(page.data.classes.length, 2);
  // 平均分条按满分归一：120/150 = 80%
  assert.equal(page.data.classes[0].barWidth, 80);
  assert.equal(page.data.classes[0].avgScore, '120.0');
  // 单班题（不足两个班有数据）不参与差距统计
  assert.equal(page.data.gaps.length, 2);
  assert.deepEqual(page.data.gaps.map(g => g.questionNumber), ['1', '2']);
  assert.equal(page.data.gaps[0].gap, 30);
  assert.equal(page.data.gaps[0].bestClass, '一班');
  assert.equal(page.data.gaps[0].worstClass, '二班');

  page.onSort({ currentTarget: { dataset: { value: 'passRate' } } });
  assert.deepEqual(page.data.classes.map(c => c.className), ['一班', '二班']);
  // 二班区分度更高（0.35 > 0.3），按区分度排序要把这个班顶到前面
  page.onSort({ currentTarget: { dataset: { value: 'discrimination' } } });
  assert.deepEqual(page.data.classes.map(c => c.className), ['二班', '一班']);
  signOut();
});

test('t-classes：满分不可知时及格率/优秀率显示「—」，条不画但排序仍按原值', async () => {
  global.wx = baseWx;
  signIn(TEACHER, ['grade:read']);
  stubGet(() => ({
    fullScore: 0,
    classes: [
      { classId: 3, className: '一班', count: 40, avgScore: 120, maxScore: 149, minScore: 60, median: 122, stdDev: 12, passRate: 0, excellentRate: 0, difficulty: 0.8, discrimination: 0.3 },
      { classId: 4, className: '二班', count: 38, avgScore: 90, maxScore: 130, minScore: 40, median: 92, stdDev: 18, passRate: 0, excellentRate: 0, difficulty: 0.6, discrimination: 0.35 }
    ],
    questionStats: []
  }));
  const page = makePage(tClassesDef);
  page.onLoad({ examId: '7' });
  await flush();
  assert.equal(page.data.classes[0].passRate, '—');
  assert.equal(page.data.classes[0].excellentRate, '—');
  assert.equal(page.data.classes[0].barWidth, 0);
  // 平均分是真实统计，不受满分缺失影响；排序仍按平均分把一班顶在前面
  assert.equal(page.data.classes[0].avgScore, '120.0');
  assert.deepEqual(page.data.classes.map(c => c.className), ['一班', '二班']);
  signOut();
});

test('t-ranking：切班写回 classLabel，筛选走后端 classId 而不是本地过滤', async () => {
  global.wx = baseWx;
  signIn(TEACHER, ['grade:read']);
  const reqs = [];
  stubGet(p => {
    reqs.push(p);
    if (p.indexOf('/classes') >= 0) return [{ classId: 3, className: '一班' }, { classId: 0, className: '未知班级' }];
    return [{ rank: 1, studentNumber: 'A', studentName: '甲', totalScore: 10, objectiveScore: 4, subjectiveScore: 6, lowScoreCount: 1, questionCount: 4, errorRate: 25, errorRateLevel: 'low' }];
  });
  const page = makePage(tRankingDef);
  page.onLoad({ examId: '7' });
  await flush();
  assert.equal(page.data.classLabel, '全部班级');
  reqs.length = 0;
  page.onClassChange({ detail: { value: 2 } });
  await flush();
  assert.equal(page.data.classLabel, '未知班级');
  assert.equal(page.data.classId, '0');
  // 榜单接口按后端 classId=0 过滤（与分析接口同一套 classFilter 口径）
  assert.ok(reqs.indexOf('/analysis/exams/7/students?classId=0') >= 0);
  assert.equal(page.data.list[0].errorRateText, '25%');
  signOut();
});

// ── 角色判据统一（天梯管理页不再自带一套宽松判定）─────
const adminLadderDef = capture('../pages/admin-ladder/admin-ladder.js');

test('admin-ladder：判据与 profile 同源，学生与「显示名像管理员」的教师都进不去', async () => {
  global.wx = baseWx;
  const reqs = [];
  stubGet(p => { reqs.push(p); return { ladderEnabled: true }; });

  signIn(STUDENT, ['score:read']);
  const s = makePage(adminLadderDef);
  s.onLoad();
  assert.equal(s.data.error, '仅管理员可管理成绩天梯');
  assert.deepEqual(reqs, []);

  // 权威字段是 teacher：显示名带「管理员」也不算管理员（旧判据正是这样漏的）
  signIn({ id: 8, name: '李老师', role_name: 'teacher', role_display_name: '管理员' }, ['grade:read']);
  const t = makePage(adminLadderDef);
  t.onLoad();
  assert.equal(t.data.error, '仅管理员可管理成绩天梯');
  assert.deepEqual(reqs, []);

  // 旧会话没有 role_name / role_id：历史线索继续有效，否则管理员升级后连原有页面都进不去
  signIn({ id: 1, name: '管理员', role_display_name: '管理员' }, null);
  const a = makePage(adminLadderDef);
  a.onLoad();
  await flush();
  assert.equal(a.data.error, '');
  assert.deepEqual(reqs, ['/ladder/config']);
  assert.equal(a.data.enabled, true);
  signOut();
});
