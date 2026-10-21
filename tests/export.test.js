'use strict';
// 成绩表导出（主站教师端导出面板迁到小程序）的三层测试：
//   1) utils/exportTable.js 的纯计算——这里锁的是「与后端 / 主站同源」的口径：
//      classId 三态、列 id 与写进 Excel 的表头文案、名次变化写法、A4 宽度式、模板字段名；
//   2) utils/request.js + utils/exportStore.js + services/exportService.js——线协议、落盘、逐班串行与隐私清理；
//   3) pages/t-export 的守卫与交互，外加入口标记与字体排版回归（本次任务的第二项）。
// 改动任一字符串前先核对 utils/exportTable.js 顶部注释指向的两处实现，两端各写一套正是本次要防的事。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const table = require('../utils/exportTable');
const env = require('../utils/env');
const store = require('../utils/exportStore');
const { decodeUtf8 } = require('../utils/response');
const request = require('../utils/request');
const auth = require('../utils/auth');
const exportService = require('../services/exportService');

// 导出页会覆盖 request 上的导出方法，线协议用例先留一份真实实现
const realGet = request.get;
const realPost = request.post;
const realDel = request.del;

const FORBID = '权限不足：管理员已关闭你对本场考试「查看成绩」的查看权限';
const TEACHER = { id: 9, name: '王老师', role_name: 'teacher', role_display_name: '教师' };
const STUDENT = { id: 5, name: '张小明', role_name: 'student', role_display_name: '学生', student_number: '2024001' };

const flush = () => new Promise(resolve => setImmediate(resolve));

// 真机上 wx.request 的 arraybuffer 响应就是一段字节视图；Node 里 Buffer.from(s).buffer
// 拿到的可能是 8KB 共享池（byteOffset 非 0），按整块解码只会读到池里的杂字节。
function binaryBytes(str) {
  const b = Buffer.from(String(str), 'utf8');
  return new Uint8Array(b.buffer, b.byteOffset, b.length);
}

function signIn(user, perms) { auth.setUser(user, false); auth.setPermissions(perms, false); }
function signOut() { auth.clearUser(); auth.clearPermissions(); auth.clearToken(); }

// ── 假的 wx：Storage + 文件系统 + 弹窗，全部记录在 state 里供断言 ──
let state = null;
function resetWx() {
  state = {
    storage: {}, files: {}, writes: [], unlinks: [], rmdir: 0,
    requests: [], responds: [], openDocs: [], toasts: [], modals: [], navs: [], launches: [],
    confirm: true, content: '', page: 'pages/t-export/t-export'
  };
  state.respond = opts => {
    // 按顺序消费预设响应：一个请求对应一个响应，剩下的请求走 200
    const r = state.responds.shift();
    if (r === undefined) return { statusCode: 200, data: {} };
    return typeof r === 'function' ? r(opts) : r;
  };
  global.wx = {
    env: { USER_DATA_PATH: '/tmp/px' },
    getStorageSync: k => (k in state.storage ? state.storage[k] : ''),
    setStorageSync: (k, v) => { state.storage[k] = v; },
    removeStorageSync: k => { delete state.storage[k]; },
    getStorageInfoSync: () => ({ keys: Object.keys(state.storage) }),
    getFileSystemManager: () => ({
      mkdirSync: () => true,
      rmdirSync: () => { state.rmdir += 1; },
      writeFileSync: (p, data, enc) => {
        if (typeof data !== 'string' && enc !== undefined) throw new Error('二进制不能传 encoding');
        state.files[p] = data; state.writes.push(p); return '';
      },
      unlinkSync: p => {
        if (!(p in state.files)) throw new Error('no such file: ' + p);
        delete state.files[p]; state.unlinks.push(p);
      }
    }),
    showToast: o => { state.toasts.push(o.title); },
    showLoading: () => {},
    hideLoading: () => {},
    showModal: o => {
      state.modals.push(o);
      if (o.success) o.success({ confirm: state.confirm, content: o.editable ? state.content : undefined });
      return o;
    },
    openDocument: o => { state.openDocs.push(o); if (o.success) o.success({}); return o; },
    navigateTo: o => { state.navs.push(o.url); if (o.success) o.success({}); },
    navigateBack: o => { if (o && o.fail) o.fail({}); },
    redirectTo: o => { state.navs.push(o.url); },
    reLaunch: o => { state.launches.push(o.url); if (o.complete) o.complete(); },
    switchTab: () => {},
    stopPullDownRefresh: () => {},
    // 微信语义：只要拿到了 HTTP 响应就走 success（4xx 也算），fail 只留给网络层失败
    request: o => {
      state.requests.push(o);
      const res = state.respond(o);
      if (res === null) { if (o.fail) o.fail({ errMsg: 'request:fail timeout' }); return; }
      if (o.success) o.success(res);
      if (o.complete) o.complete({});
    },
    createSelectorQuery: () => ({ select: () => ({ fields: () => ({ exec: () => {} }) }) })
  };
  global.getCurrentPages = () => [{ route: state.page }];
  return state;
}

// ── 服务层用的 request 桩：只记业务语义，不发 wx.request ──
let posts = [], gets = [], puts = [], dels = [];
let postImpl = () => new Uint8Array(64).buffer;
let getImpl = () => [];
function stubRequest() {
  posts = []; gets = []; puts = []; dels = [];
  postImpl = () => new Uint8Array(64).buffer;
  getImpl = () => [];
  request.post = async (p, d, o) => { const rec = { path: p, body: d, opts: o }; posts.push(rec); return postImpl(p, d, o, rec); };
  request.get = async (p, o) => { gets.push(p); return getImpl(p, o); };
  request.put = async (p, d) => { puts.push({ path: p, body: d }); return {}; };
  request.del = async p => { dels.push(p); return {}; };
}

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

function tap(key, value) { return { currentTarget: { dataset: { [key]: value } } }; }
function input(v) { return { detail: { value: v } }; }

const CLASSES = [{ classId: 3, className: '一班' }, { classId: 4, className: '二班' }];
const SCORE_TABLE = {
  examName: '期中文', subject: '数学', examDate: '2026-04-10', hasAssignedScore: true, totalCount: 42,
  rows: [
    { studentNumber: '01', studentName: '甲', className: '一班', gradeName: '高一', totalScore: 660, assignedScore: 665.5, objectiveScore: 300, subjectiveScore: 360, gradeRank: 3, classRank: 1, rankChange: 3, displayValue: 78 },
    { studentNumber: '02', studentName: '乙', className: '一班', totalScore: 620, assignedScore: 621, objectiveScore: 280, subjectiveScore: 340, gradeRank: 5, classRank: 2, rankChange: -2 },
    { studentNumber: '03', studentName: '丙', className: '二班', totalScore: null, assignedScore: null, objectiveScore: 0, subjectiveScore: 0, gradeRank: null, classRank: null, rankChange: 0 },
    { studentNumber: '04', studentName: '丁', className: '二班', totalScore: 600, assignedScore: 601, objectiveScore: 270, subjectiveScore: 330, gradeRank: 7, classRank: 3, rankChange: null }
  ]
};

// ── 1. classId 三态 ────────────────────────────────────
test('classId 三态：0 是「无班级」，绝不能被当成没传', () => {
  assert.equal(table.normalizeClassId(0), 0);
  assert.equal(table.normalizeClassId('0'), 0);
  assert.equal(table.normalizeClassId(3), 3);
  assert.equal(table.normalizeClassId('7.9'), 7);
  assert.equal(table.normalizeClassId(undefined), undefined);
  assert.equal(table.normalizeClassId(null), undefined);
  assert.equal(table.normalizeClassId(''), undefined);
  assert.equal(table.normalizeClassId('abc'), undefined);
  assert.equal(table.normalizeClassId(-1), undefined);

  assert.equal(table.buildExportBody({ columns: ['totalScore'], classId: 0 }).classId, 0);
  assert.equal(table.buildExportBody({ columns: ['totalScore'], classId: '0' }).classId, 0);
  assert.equal(table.buildExportBody({ columns: ['totalScore'], classId: 4 }).classId, 4);
  // 「全部班级」在请求体里干脆不带这个键，后端才会走每生去重取首行的口径
  assert.equal('classId' in table.buildExportBody({ columns: ['totalScore'] }), false);
  assert.equal('classId' in table.buildExportBody({ columns: ['totalScore'], classId: null }), false);
  // 预览用的 GET 不接受 classId=0（后端 query 真值判断吃掉），所以只放行正整数
  assert.equal(exportService.previewScope(0), undefined);
  assert.equal(exportService.previewScope(3), 3);
  assert.equal(exportService.previewScope(''), undefined);
});

// ── 2. 列选择与后端列 id ──────────────────────────────
test('列：未知 id 与重复项被丢掉，空选择在本地就拦下', () => {
  assert.deepEqual(table.cleanColumns(['totalScore', 'totalScore', 'secret', 'studentName']), ['totalScore', 'studentName']);
  assert.equal(table.cleanColumns('不是数组').length, 0);
  assert.equal(table.cleanColumns(table.COLUMN_DEFS.map(d => d.id).concat(['totalScore', 'bogus'])).length, table.COLUMN_DEFS.length);
  // 含小题分的预设是「全列 + 两列小分」，共 13 列（列定义共 16 个）
  assert.equal(table.cleanColumns(table.PRESET_WITH_SUBS.concat(table.PRESET_FULL)).length, 13);
  assert.deepEqual(table.toggleColumn(['totalScore'], 'studentName'), ['totalScore', 'studentName']);
  assert.deepEqual(table.toggleColumn(['totalScore'], 'totalScore'), []);
  assert.deepEqual(table.toggleColumn(['totalScore'], '不存在的列'), ['totalScore']);
  assert.deepEqual(table.moveColumn(['studentName', 'totalScore', 'className'], 2, -1), ['studentName', 'className', 'totalScore']);
  assert.deepEqual(table.moveColumn(['studentName', 'totalScore'], 0, -5), ['studentName', 'totalScore']);
  // 越界的 delta 只夹回边界，不能把列甩飞；非法 id 会被 cleanColumns 丢掉
  assert.deepEqual(table.moveColumn(['totalScore'], 9, 1), ['totalScore']);
  assert.deepEqual(table.moveColumn(['不存在的列'], 0, 1), []);
  assert.equal(table.remainingColumns(['totalScore']).length, table.COLUMN_DEFS.length - 1);
  assert.equal(table.columnsByCategory(['totalScore', 'studentName']).score.length, 1);

  assert.throws(() => table.buildExportBody({ columns: [] }), err => err.code === 'NO_COLUMN' && err.message === '请至少选择一列');
  assert.throws(() => table.buildExportBody({ columns: ['不存在的列'] }), err => err.code === 'NO_COLUMN');
  assert.throws(() => table.buildExportBody(null), err => err.code === 'NO_COLUMN');
});

test('列文案与后端 / 主站同源：label 给选择器，header 写进 Excel', () => {
  assert.equal(table.labelOf('totalScore'), '成绩');
  assert.equal(table.headerOf('totalScore'), '原始分');
  assert.equal(table.labelOf('gradeRank'), '年排');
  assert.equal(table.headerOf('objectiveSubScores'), '客观题小分');
  assert.equal(table.headerOf('不存在'), '不存在');
  table.COLUMN_DEFS.forEach(d => {
    assert.ok(d.id && d.label && d.header && d.category && d.width > 0, '列定义不完整: ' + d.id);
  });
  // 后端对这两列写死空值，选中了也只是空列，页面必须提示而不是让教师以为是 bug
  assert.deepEqual(table.PLACEHOLDER_COLUMNS, ['needsReview', 'confidence']);
  assert.deepEqual(table.PRESET_BASIC, ['classRank', 'studentName', 'totalScore', 'assignedScore', 'gradeRank', 'objectiveScore', 'subjectiveScore']);
  assert.equal(table.PRESET_WITH_SUBS.length, table.PRESET_FULL.length + 2);
});

// ── 3. A4 宽度式 ───────────────────────────────────────
test('A4 宽度估算与主站同式：主表列宽 + 间隙列 + 侧表三列(5+8+7)', () => {
  assert.equal(table.A4_MAX_CHARS, 63);
  assert.equal(table.computeTotalWidth(['studentName'], 0, 0), 8);
  assert.equal(table.computeTotalWidth(['studentName'], 5, 2), 8 + 2 + 20);
  const w = table.widthInfo(table.PRESET_BASIC, 10, 1);
  assert.equal(w.total, 67);
  assert.equal(w.limit, 63);
  assert.equal(w.over, true, '基础预设 + 参照表在 A4 纵向一定超宽，必须给出提示');
  const plain = table.widthInfo(table.PRESET_BASIC, 0, 1);
  assert.equal(plain.total, 46);
  assert.equal(plain.sideOn, false);
  assert.equal(plain.over, false);
  // N 只影响「取前几名」，不改变侧表占位宽（与主站一致）
  assert.equal(table.computeTotalWidth(['studentName'], 1, 1), table.computeTotalWidth(['studentName'], 200, 1));
});

// ── 4. 三档数值闸门 ────────────────────────────────────
test('数值闸门：env 默认 / 可改档 / 天花板夹紧，非法值回落默认', () => {
  const lim = table.limits();
  assert.deepEqual(Object.keys(lim).sort(), Object.keys(table.LIMIT_CEILING).sort());
  assert.equal(lim.classesPerExport, 40);
  assert.equal(lim.exportTimeoutMs, 60000);
  // env.js 与天花板必须同键：漏一处就有一个上限永远读不到配置
  assert.deepEqual(Object.keys(env.LIMITS).sort(), Object.keys(table.LIMIT_CEILING).sort());

  const backup = Object.assign({}, env.LIMITS);
  try {
    env.LIMITS.classesPerExport = 5;
    assert.equal(table.limits().classesPerExport, 5);
    env.LIMITS.classesPerExport = 9999;
    assert.equal(table.limits().classesPerExport, table.LIMIT_CEILING.classesPerExport[1]);
    env.LIMITS.exportTimeoutMs = 1;
    assert.equal(table.limits().exportTimeoutMs, table.LIMIT_CEILING.exportTimeoutMs[0]);
    env.LIMITS.fileMb = 'eight';
    assert.equal(table.limits().fileMb, table.LIMIT_DEFAULTS.fileMb);
    // 上限仍然生效：改档不是取消保护
    const body = table.buildExportBody({ columns: ['totalScore'], classId: 3 }, { limits: table.limits() });
    assert.equal(body.classId, 3);
  } finally {
    Object.keys(backup).forEach(k => { env.LIMITS[k] = backup[k]; });
  }
  assert.deepEqual(table.limits(), lim);

  // 参照表参数是「教师选的数」，env 只给初始值，不能把选中的值裁小；上界是天花板
  assert.equal(table.buildExportBody({ columns: ['totalScore'], sideTableN: 20, gapCols: 4 }).sideTableN, 20);
  assert.equal(table.buildExportBody({ columns: ['totalScore'], sideTableN: 20, gapCols: 4 }).gapCols, 4);
  assert.equal(table.buildExportBody({ columns: ['totalScore'], sideTableN: 99999, gapCols: 99999 }).sideTableN, 200);
  assert.equal(table.buildExportBody({ columns: ['totalScore'], sideTableN: 99999, gapCols: 99999 }).gapCols, 10);
  assert.equal(table.buildExportBody({ columns: ['totalScore'] }).sideTableN, 0);
  assert.equal(table.buildExportBody({ columns: ['totalScore'], sideTableN: -3 }).sideTableN, 0);
  assert.equal(table.clampSetting('gapCols', '99', 1), 10);
  assert.equal(table.clampSetting('gapCols', '0', 1), 1);
  assert.equal(table.clampSetting('sideTableN', 'abc', 1), 10);
  assert.equal(table.clampSetting('sideTableN', '', 1), 10);
  assert.equal(table.clampSetting('不存在档', '5', 1), 0);
});

// ── 5. 模板：与主站共用同一份后端数据 ─────────────────
test('模板归一化：snake_case 字段、JSON 字符串列、槽位限 1-4、按槽排序', () => {
  const list = table.normalizeTemplates([
    { slot: 3, name: '月考', columns: '["totalScore","bogus","totalScore"]', side_table_n: '8', gap_cols: '3' },
    { slot: 1, columns: ['studentName'], sideTableN: 0 },
    { slot: 5, columns: ['totalScore'] },
    { slot: 2, columns: [] },
    { slot: 'x', columns: ['totalScore'] },
    null
  ]);
  assert.deepEqual(list.map(t => t.slot), [1, 3]);
  assert.deepEqual(list[1].columns, ['totalScore']);
  assert.equal(list[1].name, '月考');
  assert.equal(list[1].sideTableN, 8);
  assert.equal(list[1].gapCols, 3);
  assert.equal(list[0].name, '模板1');
  assert.equal(list[0].sideTableN, 0);
  // 后端未给 gap_cols 时缺省 3，与主站导出面板一致
  assert.equal(list[0].gapCols, 3);
  assert.deepEqual(table.normalizeTemplates('不是数组'), []);
  assert.deepEqual(table.templateBody({ columns: ['totalScore', 'bogus'] }),
    { name: '未命名', columns: ['totalScore'], sideTableN: 0, gapCols: 1 });
  assert.deepEqual(table.templateBody({ name: '期中', columns: ['totalScore'], sideTableN: 12, gapCols: 0 }),
    { name: '期中', columns: ['totalScore'], sideTableN: 12, gapCols: 1 });
});

// ── 6. 班级计划（逐班各出一份） ────────────────────────
test('班级计划：逐班按上限截断并报出跳过数，未知班级也是一份合法文件', () => {
  const roster = [
    { classId: 3, className: '一班' }, { classId: 4, className: '二班' },
    { classId: 0, className: '未知班级' }, { classId: null, className: '脏数据' }
  ];
  const each = table.planClasses('each', roster, null, 2);
  assert.deepEqual(each.scopes, [{ classId: 3, className: '一班' }, { classId: 4, className: '二班' }]);
  assert.equal(each.skipped, 1);
  assert.deepEqual(table.planClasses('each', roster, null, 10).scopes.map(s => s.classId), [3, 4, 0]);
  assert.deepEqual(table.planClasses('each', [{ classId: 5 }], null, 10).scopes[0].className, '班级5');
  // 「指定一个班」即便选了名单外的班也照样发（后端会给出空表或 403，前端不猜）
  assert.deepEqual(table.planClasses('one', roster, 0), { scopes: [{ classId: 0, className: '未知班级' }], skipped: 0 });
  assert.deepEqual(table.planClasses('one', roster, '4'), { scopes: [{ classId: 4, className: '二班' }], skipped: 0 });
  assert.equal(table.planClasses('one', roster, 99).scopes[0].className, '');
  const all = table.planClasses('all', roster, 4);
  assert.equal(all.scopes.length, 1);
  assert.equal(all.scopes[0].classId, undefined);
  assert.deepEqual(table.planClasses('each', '不是数组', null, 10), { scopes: [], skipped: 0 });
});

// ── 7. 文件名 ──────────────────────────────────────────
test('文件名：非法字符替换、长度封顶、班级名可缺省', () => {
  assert.equal(table.sanitizeName('a/b\\c:d*e'), 'a_b_c_d_e');
  assert.equal(table.sanitizeName('  高一   3 班  '), '高一 3 班');
  assert.equal(table.sanitizeName('尾部点号...'), '尾部点号');
  assert.equal(table.sanitizeName('换行\n和\t制表'), '换行_和_制表');
  assert.equal(table.sanitizeName(undefined), '');
  assert.equal(table.sanitizeName('x'.repeat(50)).length, table.NAME_MAX_CHARS);
  assert.equal(table.buildFileName('2026.9.22听力练习', '高一(3)班'), '2026.9.22听力练习_高一(3)班_成绩表.xlsx');
  assert.equal(table.buildFileName('期中', ''), '期中_成绩表.xlsx');
  assert.equal(table.buildFileName('', '一班'), '成绩表_一班_成绩表.xlsx');
});

// ── 8. 预览矩阵 ────────────────────────────────────────
test('预览：无赋分时整列省略，名次变化写法与后端一致', () => {
  const basic = table.previewTable(SCORE_TABLE, table.PRESET_BASIC, 3);
  assert.deepEqual(basic.headers, ['班排', '姓名', '原始分', '赋分', '年排', '客观分', '主观分']);
  assert.equal(basic.rows.length, 3);
  assert.deepEqual(basic.rows[0], ['1', '甲', '660', '665.5', '3', '300', '360']);
  assert.deepEqual(basic.rows[2], ['—', '丙', '—', '—', '—', '0', '0']);
  assert.equal(basic.examName, '期中文');
  assert.equal(basic.totalCount, 42);
  assert.equal(basic.hasSubColumns, false);

  const noAssigned = table.previewTable(Object.assign({}, SCORE_TABLE, { hasAssignedScore: false }), table.PRESET_BASIC, 3);
  assert.deepEqual(noAssigned.headers, ['班排', '姓名', '原始分', '年排', '客观分', '主观分']);
  assert.equal(noAssigned.headers.indexOf('赋分'), -1);

  const full = table.previewTable(SCORE_TABLE, table.PRESET_FULL, 10);
  const at = full.headers.indexOf('名次变化');
  assert.equal(at, 9);
  assert.deepEqual(full.rows.map(r => r[at]), ['↑+3', '↓-2', '0', '-']);
  assert.equal(full.rows.length, 4);
  // 逐题小分后端不在 score-table 里返回，预览只能占位
  const withSubs = table.previewTable(SCORE_TABLE, ['objectiveSubScores', 'confidence', 'needsReview'], 3);
  assert.deepEqual(withSubs.rows[0], ['…', '—', '—']);
  assert.equal(withSubs.hasSubColumns, true);
  assert.deepEqual(table.previewTable(null, ['totalScore'], 3).headers, ['原始分']);

  assert.equal(table.formatRankChange(3), '↑+3');
  assert.equal(table.formatRankChange(-2), '↓-2');
  assert.equal(table.formatRankChange(0), '0');
  assert.equal(table.formatRankChange(null), '-');
  assert.equal(table.formatRankChange(''), '-');
  assert.equal(table.formatRankChange('abc'), '-');
});

test('二进制错误体解码 + 文件体积文案', () => {
  assert.equal(table.parseErrorText(Buffer.from(JSON.stringify({ message: FORBID }), 'utf8')), FORBID);
  assert.equal(table.parseErrorText(new Uint8Array(Buffer.from('{"message":"导出失败"}', 'utf8'))), '导出失败');
  // xlsx 的 ZIP 头不是 JSON，不能被误判成错误文案
  assert.equal(table.parseErrorText(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14]).buffer), '');
  assert.equal(table.parseErrorText(Buffer.from('{"message":"截断"', 'utf8')), '');
  assert.equal(table.parseErrorText(Buffer.from('{"code":1}', 'utf8')), '');
  assert.equal(table.parseErrorText(Buffer.from('', 'utf8')), '');
  assert.equal(table.parseErrorText(null), '');

  // UTF-8：2/3/4 字节 + 4 字节拆代理对 + 截断序列不产坏字 + 裸续字节跳过
  assert.equal(decodeUtf8(Buffer.from('权限不足', 'utf8')), '权限不足');
  assert.equal(decodeUtf8(Buffer.from('Aé€😀', 'utf8')), 'Aé€😀');
  assert.equal(decodeUtf8(Buffer.from('😀', 'utf8')).length, 2);
  assert.equal(decodeUtf8(Buffer.from('{"message":"' + FORBID + '"}', 'utf8')).startsWith('{"message":"权限不足'), true);
  assert.equal(decodeUtf8(new Uint8Array([0xe4, 0xbd]).buffer), '');
  assert.equal(decodeUtf8(new Uint8Array([0xf0, 0x9f, 0x98]).buffer), '');
  assert.equal(decodeUtf8(new Uint8Array([0x80, 0x41]).buffer), 'A');
  assert.equal(decodeUtf8([0xe4, 0xb8, 0xad]), '中');

  assert.equal(table.formatBytes(512), '512 B');
  assert.equal(table.formatBytes(1500), '1.5 KB');
  assert.equal(table.formatBytes(2048), '2.0 KB');
  assert.equal(table.formatBytes(1048576), '1.0 MB');
  assert.equal(table.formatBytes(0), '0 B');
  assert.equal(table.formatBytes(-1), '—');
  assert.equal(table.formatBytes(undefined), '—');
});

// ── 9. 线协议 ──────────────────────────────────────────
test('线协议：导出用 arraybuffer 通道，删模板用 DELETE，403 的中文原样带出', async () => {
  const st = resetWx();
  signOut();
  auth.setToken('tk', false);
  st.responds = [
    { statusCode: 200, data: new Uint8Array(64).buffer },
    { statusCode: 200, data: { ok: true } },
    () => ({ statusCode: 403, data: binaryBytes(JSON.stringify({ message: FORBID })) })
  ];
  const buf = await realPost('/export/exams/7/scores', { columns: ['totalScore'] }, { responseType: 'arraybuffer', timeout: 45000 });
  assert.equal(buf.byteLength, 64);
  const r0 = st.requests[0];
  assert.equal(r0.url, 'https://dl5zx.cn/api/export/exams/7/scores');
  assert.equal(r0.method, 'POST');
  assert.equal(r0.responseType, 'arraybuffer');
  assert.equal(r0.timeout, 45000);
  assert.equal(r0.header.Authorization, 'Bearer tk');
  assert.deepEqual(r0.data, { columns: ['totalScore'] });

  await realDel('/export/templates/2');
  assert.equal(st.requests[1].method, 'DELETE');
  assert.equal(st.requests[1].url, 'https://dl5zx.cn/api/export/templates/2');

  // responseType=arraybuffer 时错误体也是二进制：不解码就只能显示「请求失败」，
  // 而「权限不足：管理员已关闭…」这句正是教师需要看到的
  await assert.rejects(realPost('/export/exams/7/scores', {}, { responseType: 'arraybuffer' }), err => {
    assert.equal(err.status, 403);
    assert.equal(err.message, FORBID);
    return true;
  });
  // 403 不做跳转：登出是教师自己的动作，不是会话失效
  assert.deepEqual(st.launches, []);
  signOut();
});

test('401 被动登出：导出文件、索引与权限位一起清掉', async () => {
  const st = resetWx();
  signOut();
  auth.setToken('tk', true);
  auth.setUser(TEACHER, true);
  auth.setPermissions(['grade:read'], true);
  const w = store.writeWorkbook(new Uint8Array(32).buffer, '期中_成绩表.xlsx', 8);
  assert.equal(w.ok, true);
  assert.ok(('/tmp/px/px_exports/期中_成绩表.xlsx') in st.files);
  st.storage['px_cache_scores_me_9'] = 'x';
  st.responds = [{ statusCode: 401, data: new Uint8Array(0).buffer }];
  await assert.rejects(realGet('/export/templates'));
  assert.deepEqual(st.launches, ['/pages/login/login']);
  // 导出的 xlsx 是他人成绩明文：文件与 storage 索引都不能留在设备上
  assert.equal('/tmp/px/px_exports/期中_成绩表.xlsx' in st.files, false);
  assert.deepEqual(st.unlinks, ['/tmp/px/px_exports/期中_成绩表.xlsx']);
  assert.equal(st.storage.px_exports_index, undefined);
  assert.equal(st.storage.px_cache_scores_me_9, undefined);
  assert.equal(st.storage.px_perms, undefined);
  assert.equal(auth.getToken(), null);
  assert.equal(auth.getUser(), null);
  signOut();
});

// ── 10. 本地落盘 ───────────────────────────────────────
test('本地落盘：同名加序号、空文件与超限判失败、只保留最近 N 个', () => {
  const st = resetWx();
  const buf = new Uint8Array(64).buffer;
  const a = store.writeWorkbook(buf, '期中_一班_成绩表.xlsx', 8);
  const b = store.writeWorkbook(buf, '期中_一班_成绩表.xlsx', 8);
  assert.equal(a.name, '期中_一班_成绩表.xlsx');
  assert.equal(b.name, '期中_一班_成绩表(2).xlsx');
  assert.equal(store.byteLength(buf), 64);
  assert.equal(store.writeWorkbook(new Uint8Array(0).buffer, '空.xlsx', 8).error, '导出返回空文件');
  assert.equal(store.writeWorkbook(buf, '超限.xlsx', 0.000001).ok, false);
  assert.equal(store.dirPath(), '/tmp/px/px_exports');
  const c = store.writeWorkbook(buf, '期中_二班_成绩表.xlsx', 8);
  assert.equal(store.readIndex().length, 3);

  store.prune(2);
  assert.equal(store.readIndex().length, 2);
  assert.equal(a.path in st.files, false, '最旧那份已被删除');
  assert.equal(c.path in st.files, true);
  assert.equal(store.removeFile(b.path), true);
  assert.equal(store.readIndex().length, 1);
  assert.equal(store.clearAll(), 1);
  assert.equal(store.readIndex().length, 0);
  assert.equal(st.rmdir, 1);
  // 索引坏掉（老版本残留 / 用户清缓存清了一半）不能抛错
  st.storage[store.INDEX_KEY] = '不是数组';
  assert.deepEqual(store.readIndex(), []);
  st.storage[store.INDEX_KEY] = [{ path: '' }, null, { path: '/tmp/px/px_exports/x.xlsx' }];
  assert.equal(store.readIndex().length, 1);
});

// ── 11. 服务层：模板与取文件 ───────────────────────────
test('模板接口：槽位越界与空列在本地拦下，PUT/DELETE 路径带槽位', async () => {
  resetWx(); stubRequest();
  await assert.rejects(exportService.saveTemplate(5, { columns: ['totalScore'] }), e => e.code === 'BAD_SLOT');
  await assert.rejects(exportService.deleteTemplate(0), e => e.code === 'BAD_SLOT');
  await assert.rejects(exportService.saveTemplate(2, { columns: [] }), e => e.code === 'NO_COLUMN');
  await exportService.saveTemplate(2, { name: '月考', columns: ['totalScore', 'bogus'], sideTableN: 8, gapCols: 3 });
  assert.deepEqual(puts, [{ path: '/export/templates/2', body: { name: '月考', columns: ['totalScore'], sideTableN: 8, gapCols: 3 } }]);
  await exportService.deleteTemplate(3);
  assert.deepEqual(dels, ['/export/templates/3']);
  getImpl = () => [{ slot: 1, columns: ['totalScore'], name: 'A' }];
  const list = await exportService.fetchTemplates();
  assert.deepEqual(list.map(t => t.slot), [1]);
  assert.deepEqual(gets, ['/export/templates']);
});

test('取工作簿：200 的 JSON / 空文件 / 超限都不落盘', async () => {
  resetWx(); stubRequest();
  await assert.rejects(exportService.requestWorkbook('abc', { columns: ['totalScore'] }), e => e.code === 'BAD_EXAM');
  await assert.rejects(exportService.requestWorkbook(7, { columns: [] }), e => e.code === 'NO_COLUMN');

  postImpl = () => Buffer.from(JSON.stringify({ message: FORBID }), 'utf8');
  await assert.rejects(exportService.requestWorkbook(7, { columns: ['totalScore'] }), e => {
    assert.equal(e.code, 'JSON_IN_BINARY');
    assert.equal(e.message, FORBID);
    return true;
  });
  postImpl = () => new Uint8Array(0).buffer;
  await assert.rejects(exportService.requestWorkbook(7, { columns: ['totalScore'] }), e => e.code === 'EMPTY');

  const backup = Object.assign({}, env.LIMITS);
  try {
    env.LIMITS.fileMb = 1;
    postImpl = () => new Uint8Array(2 * 1024 * 1024).buffer;
    await assert.rejects(exportService.requestWorkbook(7, { columns: ['totalScore'] }), e => {
      assert.equal(e.code, 'TOO_LARGE');
      assert.match(e.message, /1MB/);
      return true;
    });
  } finally {
    Object.keys(backup).forEach(k => { env.LIMITS[k] = backup[k]; });
    // 超限那一份 2MB 响应要收回去，否则后面「未知班级」拿到的还是同一份大文件
    postImpl = () => new Uint8Array(64).buffer;
  }

  // 「未知班级」那份必须按 classId=0 取，退回全年级表是最危险的静默错误
  const wb = await exportService.requestWorkbook(7, { columns: ['totalScore'], sideTableN: 20, gapCols: 4 }, 0);
  assert.equal(wb.size, 64);
  assert.deepEqual(posts[posts.length - 1].body, { columns: ['totalScore'], sideTableN: 20, gapCols: 4, classId: 0 });
  assert.equal(posts[posts.length - 1].path, '/export/exams/7/scores');
  assert.equal(posts[posts.length - 1].opts.responseType, 'arraybuffer');
  assert.equal(posts[posts.length - 1].opts.timeout, table.limits().exportTimeoutMs);
});

// ── 12. 逐班串行导出 ───────────────────────────────────
test('逐班导出：每班一份文件，单班 403 只记错不断整批', async () => {
  const st = resetWx(); stubRequest();
  const seen = [];
  postImpl = (p, d) => {
    seen.push(d.classId === undefined ? 'all' : d.classId);
    if (d.classId === 4) return Promise.reject(Object.assign(new Error('权限不足：二班不在你的班级范围内'), { status: 403 }));
    return new Uint8Array(64).buffer;
  };
  const progress = [];
  const r = await exportService.runExport({
    examId: 7, examName: '期中文', columns: table.PRESET_BASIC, sideTableN: 10, gapCols: 1,
    mode: 'each', classes: [
      { classId: 3, className: '一班' }, { classId: 4, className: '二班' }, { classId: 0, className: '未知班级' }
    ],
    onProgress: p => progress.push(p.done + ':' + p.className)
  });
  // 串行而非并发：后端每班一次请求，顺序与名单一致
  assert.deepEqual(seen, [3, 4, 0]);
  assert.deepEqual(progress, ['0:一班', '1:二班', '2:未知班级']);
  assert.equal(r.files.length, 2);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].className, '二班');
  assert.equal(r.errors[0].status, 403);
  assert.equal(r.errors[0].message, '权限不足：二班不在你的班级范围内');
  assert.equal(r.files[0].name, '期中文_一班_成绩表.xlsx');
  assert.equal(r.files[0].className, '一班');
  assert.equal(r.files[0].sizeText, '64 B');
  assert.equal(r.files[1].className, '未知班级');
  assert.equal(r.total, 3);
  assert.equal(r.skipped, 0);
  assert.equal(r.cancelled, false);
  assert.equal(Object.keys(st.files).length, 2);
});

test('取消：已完成的部分保留，剩下的班级不再发请求（issue #15 的 cancel() 约定）', async () => {
  resetWx(); stubRequest();
  let n = 0;
  const roster = [{ classId: 1, className: '一班' }, { classId: 2, className: '二班' }, { classId: 3, className: '三班' }];
  postImpl = () => { n += 1; return new Uint8Array(16).buffer; };

  let cancel = null;
  const job = exportService.runExport({
    examId: 7, examName: '期中', columns: ['totalScore'], mode: 'each', classes: roster,
    onProgress: p => { if (p.done === 1 && cancel) cancel(); }
  });
  cancel = job.cancel;
  const r = await job;
  assert.equal(n, 2, '第三个班的请求不该发出去');
  assert.equal(r.files.length, 2);
  assert.equal(r.cancelled, true);
  assert.equal(r.total, 3);

  // 立刻取消：第一个请求已经发出（页面只能等它回来），后续一律不发
  n = 0;
  const job2 = exportService.runExport({ examId: 7, examName: '期中', columns: ['totalScore'], mode: 'each', classes: roster });
  assert.equal(typeof job2.cancel, 'function');
  job2.cancel();
  const r2 = await job2;
  assert.equal(n, 1);
  assert.equal(r2.files.length, 1);
  assert.equal(r2.cancelled, true);
});

test('导出前置失败不抛异常：空列 / 超出单次上限的班级数', async () => {
  resetWx(); stubRequest();
  // cancel() 挂在返回的 promise 上（页面 onUnload 无条件调用），失败信息走 resolve 而不是 throw
  assert.equal(typeof exportService.runExport({ examId: 7, columns: [], mode: 'all' }).cancel, 'function');
  const empty = await exportService.runExport({ examId: 7, columns: [], mode: 'all' });
  assert.equal(empty.files.length, 0);
  assert.equal(empty.errors[0].message, '请至少选择一列');
  assert.deepEqual(posts, []);

  const roster = [{ classId: 1, className: '一班' }, { classId: 2, className: '二班' }, { classId: 3, className: '三班' }];
  const backup = Object.assign({}, env.LIMITS);
  try {
    env.LIMITS.classesPerExport = 2;
    postImpl = () => new Uint8Array(16).buffer;
    const r = await exportService.runExport({ examId: 7, examName: '期中', columns: ['totalScore'], mode: 'each', classes: roster });
    assert.equal(r.files.length, 2);
    assert.equal(r.skipped, 1);
    assert.equal(r.total, 2);
  } finally { Object.keys(backup).forEach(k => { env.LIMITS[k] = backup[k]; }); }

  const noClass = await exportService.runExport({ examId: 7, examName: '期中', columns: ['totalScore'], mode: 'each', classes: [] });
  assert.equal(noClass.files.length, 0);
  assert.equal(noClass.total, 0);
});

test('本地文件列表与打开：倒序展示，只走系统预览（不给页面加分享）', async () => {
  const st = resetWx();
  const a = store.writeWorkbook(new Uint8Array(16).buffer, '期中_一班_成绩表.xlsx', 8);
  const b = store.writeWorkbook(new Uint8Array(2048).buffer, '期中_二班_成绩表.xlsx', 8);
  const list = exportService.listLocalFiles();
  assert.deepEqual(list.map(f => f.name), [b.name, a.name]);
  assert.equal(list[0].sizeText, '2.0 KB');

  await exportService.openFile(b.path);
  assert.deepEqual(st.openDocs.map(o => [o.filePath, o.fileType, o.showMenu]), [[b.path, 'xlsx', true]]);
  await assert.rejects(exportService.openFile(''), e => e.message === '文件路径无效');
  global.wx.openDocument = o => o.fail({ errMsg: 'openDocument:fail 文件不存在' });
  await assert.rejects(exportService.openFile(b.path), e => e.message === 'openDocument:fail 文件不存在');
  delete global.wx.openDocument;
  await assert.rejects(exportService.openFile(b.path), e => e.message.indexOf('不支持打开文档') >= 0);
});

// ── 13. 导出页 ─────────────────────────────────────────
const tExportDef = capture('../pages/t-export/t-export.js');

function loadPage(options) {
  const page = makePage(tExportDef);
  page.onLoad(options || { examId: '7' });
  return page;
}

function stubPageRequests(overrides) {
  getImpl = p => {
    if (p.indexOf('/classes') >= 0) return (overrides && overrides.classes) || CLASSES;
    if (p.indexOf('/score-table') >= 0) return (overrides && overrides.scoreTable) || SCORE_TABLE;
    if (p.indexOf('/export/templates') >= 0) return (overrides && overrides.templates) || [];
    return [];
  };
}

test('t-export：学生被守卫拦下，非法 examId 一个请求都不发', async () => {
  const st = resetWx(); stubRequest();
  signOut(); signIn(STUDENT, ['score:read']);
  stubPageRequests();
  const page = loadPage();
  await flush();
  assert.deepEqual(st.launches, ['/pages/scores/scores']);
  assert.deepEqual(gets, []);

  signOut(); signIn(TEACHER, ['grade:read']);
  const bad = loadPage({ examId: '7 or 1=1' });
  await flush();
  assert.equal(bad.data.invalid, true);
  assert.equal(bad.data.loading, false);
  assert.deepEqual(gets, []);
  signOut();
});

test('t-export：起步用基础表预设，模板补齐 4 格，A4 超宽先提示', async () => {
  resetWx(); stubRequest();
  signOut(); signIn(TEACHER, ['grade:read']);
  stubPageRequests({
    templates: [{ slot: 2, name: '月考', columns: ['totalScore'], side_table_n: 5, gap_cols: 2 }]
  });
  const page = loadPage();
  await flush(); await flush();
  assert.deepEqual(page.data.selectedIds, table.PRESET_BASIC);
  assert.equal(page.data.preset, 'basic');
  assert.equal(page.data.widthTotal, 67);
  assert.equal(page.data.overA4, true);
  assert.equal(page.data.widthLimit, 63);
  assert.equal(page.data.examName, '期中文');
  assert.equal(page.data.previewCount, 42);
  assert.equal(page.data.noAssigned, false);
  assert.equal(page.data.hasPlaceholder, false);
  assert.equal(page.data.loading, false);
  assert.deepEqual(page.data.preview.headers.map(h => h.text), ['班排', '姓名', '原始分', '赋分', '年排', '客观分', '主观分']);
  assert.deepEqual(page.data.preview.rows[0].cells.map(c => c.text), ['1', '甲', '660', '665.5', '3', '300', '360']);
  // 「—」会重复，行/格都必须带位置 uid
  const keys = page.data.preview.rows.reduce((acc, r) => acc.concat(r.cells.map(c => c.uid)), []);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(page.data.slotList.map(s => s.filled), [false, true, false, false]);
  assert.equal(page.data.slotList[1].name, '月考');
  assert.equal(page.data.slotList[1].meta, '1 列 · 前 5 名 · 间隙 2 列');
  assert.equal(page.data.slotList[0].name, '空槽位');
  assert.equal(page.data.available.length, table.COLUMN_DEFS.length - table.PRESET_BASIC.length);
  assert.equal(page.data.classLabel, '一班');
  assert.equal(page.data.previewNote, '预览口径：全部班级');
  assert.equal(page.data.classesCap, 40);
  signOut();
});

test('t-export：从成绩榜带班进入，班级名单到手后预览改按该班重取', async () => {
  const st = resetWx(); stubRequest();
  signOut(); signIn(TEACHER, ['grade:read']);
  stubPageRequests();
  const page = loadPage({ examId: '7', classId: '4', name: '期中（手写）' });
  await flush(); await flush();
  assert.equal(page.data.mode, 'one');
  assert.equal(page.data.classIndex, 1);
  assert.equal(page.data.classLabel, '二班');
  // 名单比首屏预览慢：口径变成二班时必须重取一次，否则文字说二班、表里是全年级
  assert.deepEqual(gets.filter(p => p.indexOf('/score-table') >= 0),
    ['/analysis/exams/7/score-table', '/analysis/exams/7/score-table?classId=4']);
  assert.equal(page.data.previewNote, '预览口径：二班');
  assert.deepEqual(st.navs, []);

  // 未知班级（classId=0）：GET 不接受，预览退回全部班级，但页面要说清文件仍按 0 筛
  resetWx(); stubRequest();
  stubPageRequests({ classes: [{ classId: 0, className: '未知班级' }].concat(CLASSES) });
  const zero = loadPage({ examId: '7', classId: '0' });
  await flush(); await flush();
  assert.deepEqual(gets.filter(p => p.indexOf('/score-table') >= 0), ['/analysis/exams/7/score-table']);
  assert.match(zero.data.previewNote, /后端 GET 不接受 classId=0/);
  assert.equal(zero.data.classLabel, '未知班级');
  signOut();
});

test('t-export：列增删移动、参照表开关与输入夹紧都在本地即时生效', async () => {
  resetWx(); stubRequest();
  signOut(); signIn(TEACHER, ['grade:read']);
  stubPageRequests();
  const page = loadPage();
  await flush(); await flush();

  page.onAddCol(tap('id', 'studentNumber'));
  assert.deepEqual(page.data.selectedIds, table.PRESET_BASIC.concat(['studentNumber']));
  assert.equal(page.data.widthTotal, 67 + 14);
  assert.equal(page.data.preset, '', '手改列之后预设胶囊不再高亮，避免教师以为点一下能还原');
  assert.equal(page.data.selected[page.data.selected.length - 1].canUp, true);
  assert.equal(page.data.selected[page.data.selected.length - 1].canDown, false);

  page.onMoveCol({ currentTarget: { dataset: { index: 7, delta: '-7' } } });
  assert.deepEqual(page.data.selectedIds, ['studentNumber'].concat(table.PRESET_BASIC));
  page.onMoveCol({ currentTarget: { dataset: { index: 0, delta: '-1' } } });
  assert.deepEqual(page.data.selectedIds, ['studentNumber'].concat(table.PRESET_BASIC), '首行上移越界不动');
  page.onRemoveCol(tap('id', 'studentNumber'));
  assert.deepEqual(page.data.selectedIds, table.PRESET_BASIC);

  page.onAddCol(tap('id', 'needsReview'));
  assert.equal(page.data.hasPlaceholder, true);
  page.onRemoveCol(tap('id', 'needsReview'));
  assert.equal(page.data.hasPlaceholder, false);

  page.onPreset(tap('key', 'subs'));
  assert.deepEqual(page.data.selectedIds, table.PRESET_WITH_SUBS);
  await flush();
  assert.equal(page.data.hasSubColumns, true);
  assert.match(page.data.preview.rows[0].cells.map(c => c.text).join(','), /…/);
  page.onPreset(tap('key', 'basic'));

  page.onToggleSide(input(false));
  assert.equal(page.data.sideOn, false);
  assert.equal(page.data.sideN, 0);
  assert.equal(page.data.widthTotal, 46);
  assert.equal(page.data.overA4, false);
  // 再打开时必须给回一个正的 N：「开关开着 + N=0」导出的文件里却没有参照表
  page.onToggleSide(input(true));
  assert.equal(page.data.sideOn, true);
  assert.equal(page.data.sideN, 10);
  assert.equal(page.data.widthTotal, 67);

  page.onSideNInput(input('20'));
  assert.equal(page.data.sideN, 20);
  assert.equal(page.data.widthTotal, 67, 'N 不改变侧表占位宽');
  page.onSideNInput(input('999'));
  assert.equal(page.data.sideN, table.LIMIT_CEILING.sideTableN[1]);
  page.onSideNInput(input('abc'));
  assert.equal(page.data.sideN, table.LIMIT_DEFAULTS.sideTableN);
  // 间隙列历史上被 env 默认值(1)当成上界卡死，教师永远改不动
  page.onGapInput(input('4'));
  assert.equal(page.data.gapCols, 4);
  assert.equal(page.data.widthTotal, 46 + 4 + 20);
  page.onGapInput(input('0'));
  assert.equal(page.data.gapCols, 1);
  page.onGapInput(input('999'));
  assert.equal(page.data.gapCols, table.LIMIT_CEILING.gapCols[1]);
  signOut();
});

test('t-export：模板载入/保存/删除走同一份后端数据', async () => {
  const st = resetWx(); stubRequest();
  signOut(); signIn(TEACHER, ['grade:read']);
  let saved = [{ slot: 2, name: '月考', columns: '["totalScore"]', side_table_n: 5, gap_cols: 2 }];
  stubPageRequests({});
  getImpl = p => {
    if (p.indexOf('/classes') >= 0) return CLASSES;
    if (p.indexOf('/score-table') >= 0) return SCORE_TABLE;
    if (p.indexOf('/export/templates') >= 0) return saved;
    return [];
  };
  request.put = async (p, d) => {
    puts.push({ path: p, body: d });
    const slot = Number(p.split('/').pop());
    saved = saved.filter(t => t.slot !== slot).concat([{ slot: slot, name: d.name, columns: d.columns, sideTableN: d.sideTableN, gapCols: d.gapCols }]);
    return {};
  };
  request.del = async p => {
    dels.push(p);
    saved = saved.filter(t => t.slot !== Number(p.split('/').pop()));
    return {};
  };

  const page = loadPage();
  await flush(); await flush();
  assert.deepEqual(page.data.slotList.map(s => s.filled), [false, true, false, false]);

  page.onLoadTemplate(tap('slot', 2));
  assert.equal(page.data.activeSlot, 2);
  assert.deepEqual(page.data.selectedIds, ['totalScore']);
  assert.equal(page.data.sideOn, true);
  assert.equal(page.data.sideN, 5);
  assert.equal(page.data.gapCols, 2);
  assert.equal(page.data.widthTotal, 7 + 2 + 20);
  assert.equal(page.data.overA4, false);
  assert.equal(page.data.slotList[1].active, true);
  assert.deepEqual(st.toasts, ['已载入模板2']);
  await flush();
  assert.deepEqual(page.data.preview.headers.map(h => h.text), ['原始分']);

  // 载入模板后列被换掉，此时存到 3 号槽位要带上当前口径
  st.content = '我的模板';
  await Promise.resolve(page.onSaveTemplate(tap('slot', 3)));
  await flush(); await flush();
  assert.deepEqual(puts, [{ path: '/export/templates/3', body: { name: '我的模板', columns: ['totalScore'], sideTableN: 5, gapCols: 2 } }]);
  assert.deepEqual(saved.map(t => t.slot).sort(), [2, 3]);
  assert.deepEqual(page.data.slotList.map(s => s.filled), [false, true, true, false]);
  assert.equal(page.data.activeSlot, 3);
  assert.equal(page.data.slotList[2].active, true);
  assert.match(st.toasts[st.toasts.length - 1], /^已存到模板3$/);
  assert.match(st.modals[0].title, /保存为模板3/);

  page.onDeleteTemplate(tap('slot', 2));
  await flush(); await flush();
  assert.deepEqual(dels, ['/export/templates/2']);
  assert.deepEqual(page.data.templates.map(t => t.slot), [3]);
  assert.equal(page.data.templateBusy, false);

  // 空槽位没有「载入」，删也不该发请求
  page.onLoadTemplate(tap('slot', 1));
  page.onDeleteTemplate(tap('slot', 1));
  await flush();
  assert.deepEqual(dels, ['/export/templates/2']);
  signOut();
});

test('t-export：整场 / 指定班 / 逐班三种模式各按其请求体', async () => {
  const st = resetWx(); stubRequest();
  signOut(); signIn(TEACHER, ['grade:read']);
  stubPageRequests({ classes: CLASSES.concat([{ classId: 0, className: '未知班级' }]) });
  postImpl = (p, d) => {
    if (d.classId === 0) return Promise.reject(Object.assign(new Error(FORBID), { status: 403 }));
    return new Uint8Array(64).buffer;
  };
  const page = loadPage();
  await flush(); await flush();

  page.onExport();
  assert.equal(page.data.exporting, true);
  assert.equal(page.data.progressTotal, 1);
  await flush(); await flush();
  assert.equal(page.data.exporting, false);
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].body, { columns: table.PRESET_BASIC, sideTableN: 10, gapCols: 1 });
  assert.equal(posts[0].path, '/export/exams/7/scores');
  assert.equal(page.data.results.length, 1);
  assert.equal(page.data.results[0].name, '期中文_成绩表.xlsx');
  assert.equal(page.data.results[0].className, '全部班级');
  assert.equal(page.data.results[0].uid, 0);
  assert.equal(page.data.resultNote, '已导出 1 份');
  assert.equal(page.data.localCount, 1);
  assert.equal(page.data.progressPct, 100);

  // 指定「未知班级」：请求体必须带 classId=0，后端才给「无班级」那份表
  page.onPickMode(tap('key', 'one'));
  await flush();
  page.onClassChange(input('2'));
  await flush();
  assert.equal(page.data.classLabel, '未知班级');
  page.onExport();
  await flush(); await flush();
  assert.equal(posts[1].body.classId, 0);
  assert.equal(page.data.results.length, 0, '这一班被后端拒了，列表里不该留旧文件');
  assert.equal(page.data.resultErrors.length, 1);
  assert.equal(page.data.resultNote, '全部 1 份都没导出成功，原因见下');
  assert.deepEqual(st.toasts[st.toasts.length - 1], FORBID);

  // 逐班：0 号班失败也只进 errors，其余继续跑
  page.onPickMode(tap('key', 'each'));
  page.onExport();
  assert.equal(page.data.progressTotal, 3);
  await flush(); await flush(); await flush();
  assert.equal(page.data.results.length, 2);
  assert.deepEqual(page.data.results.map(f => f.name), ['期中文_一班_成绩表.xlsx', '期中文_二班_成绩表.xlsx']);
  assert.equal(page.data.resultNote, '完成 2 份，1 份失败');
  assert.equal(page.data.resultErrors[0].className, '未知班级');

  page.onOpenFile({ currentTarget: { dataset: { path: page.data.results[0].path } } });
  assert.deepEqual(st.openDocs.map(o => o.filePath), ['/tmp/px/px_exports/期中文_一班_成绩表.xlsx']);

  const kept = page.data.localCount;
  st.confirm = false;
  page.onClearFiles();
  assert.equal(page.data.localCount, kept, '取消弹窗不能删文件');
  assert.ok(kept >= 3, '整场一份 + 逐班两份都留在本机索引里');
  st.confirm = true;
  page.onClearFiles();
  assert.equal(page.data.localCount, 0);
  assert.deepEqual(page.data.results, []);
  assert.equal(Object.keys(st.files).length, 0);
  signOut();
});

test('t-export：onUnload 取消在跑的批量导出，重复点击不并发两份', async () => {
  resetWx(); stubRequest();
  signOut(); signIn(TEACHER, ['grade:read']);
  stubPageRequests({ classes: CLASSES });
  let n = 0;
  postImpl = () => { n += 1; return new Uint8Array(16).buffer; };
  const page = loadPage();
  await flush(); await flush();

  page.onPickMode(tap('key', 'each'));
  page.onExport();
  page.onExport();  // 进行中再点不该重开一个 job
  assert.equal(n, 1);
  page.onUnload();
  await flush(); await flush();
  assert.equal(n, 1, '卸载后剩余班级不再请求');
  assert.equal(page.data.exporting, false, 'job 收尾后按钮回到可用态');
  assert.equal(page.data.progressTotal, 2);

  // 空列与没拿到名单时只提示，不发请求
  const empty = loadPage();
  await flush(); await flush();
  empty.syncColumns([], '');
  empty.onExport();
  assert.deepEqual(posts.slice(n), []);
  empty.onPickMode(tap('key', 'each'));
  empty.setData({ classOptions: [] });
  empty.onExport();
  assert.deepEqual(posts.slice(n), []);
  signOut();
});

test('t-export：预览失败显示后端文案并可重试；跨页跳转带上当前班级', async () => {
  const st = resetWx(); stubRequest();
  signOut(); signIn(TEACHER, ['grade:read']);
  getImpl = p => {
    if (p.indexOf('/classes') >= 0) return CLASSES;
    if (p.indexOf('/score-table') >= 0) throw Object.assign(new Error('权限不足：管理员已关闭你对本场考试「查看成绩」的查看权限'), { status: 403 });
    return [];
  };
  const page = loadPage();
  await flush(); await flush();
  assert.equal(page.data.previewError, FORBID);
  assert.equal(page.data.loading, false);
  assert.deepEqual(page.data.preview, { headers: [], rows: [] });
  getImpl = p => (p.indexOf('/score-table') >= 0 ? SCORE_TABLE : CLASSES);
  page.loadPreview();
  await flush();
  assert.equal(page.data.previewError, '');
  assert.equal(page.data.previewCount, 42);

  page.onPickMode(tap('key', 'one'));
  page.onClassChange(input('1'));
  page.goRanking();
  assert.deepEqual(st.navs, ['/pages/t-ranking/t-ranking?examId=7&classId=4']);
  st.navs.length = 0;
  page.onPickMode(tap('key', 'all'));
  page.goRanking();
  assert.deepEqual(st.navs, ['/pages/t-ranking/t-ranking?examId=7']);
  assert.equal(st.launches.length, 0);
  signOut();
});

// ── 14. 入口与排版回归 ─────────────────────────────────
function readRel(...parts) { return fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8'); }

function wxmlFiles() {
  const dir = path.join(__dirname, '..', 'pages');
  return fs.readdirSync(dir).flatMap(d =>
    fs.readdirSync(path.join(dir, d)).filter(f => f.endsWith('.wxml')).map(f => 'pages/' + d + '/' + f)
  );
}

function wxssRules(file) {
  const css = file === 'app.wxss' ? readRel('app.wxss') : readRel(...file.split('/'));
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  const out = [];
  let m;
  while ((m = re.exec(clean))) out.push({ sel: m[1].split('\n').pop().trim(), body: m[2], css: clean });
  return out;
}

// 返回仓库里所有 wxss 的相对路径（app.wxss + 各页面），断言按文件报问题才定位得了
function allWxss() {
  const dir = path.join(__dirname, '..', 'pages');
  return ['app.wxss'].concat(
    fs.readdirSync(dir).flatMap(d =>
      fs.readdirSync(path.join(dir, d)).filter(f => f.endsWith('.wxss')).map(f => 'pages/' + d + '/' + f)
    )
  );
}

test('入口：页面已注册，分析页与成绩榜都有导出入口', () => {
  const app = JSON.parse(readRel('app.json'));
  assert.equal(app.pages.indexOf('pages/t-export/t-export') >= 0, true, 't-export 必须注册进 app.json');
  const analysis = readRel('pages', 't-analysis', 't-analysis.wxml');
  assert.match(analysis, /bindtap="goExport"[^>]*>导出成绩|导出成绩[^<]*<\/text>\s*<\/view>/, '分析页要有导出入口');
  assert.match(readRel('pages', 't-analysis', 't-analysis.js'), /\/pages\/t-export\/t-export\?examId=/);

  const ranking = readRel('pages', 't-ranking', 't-ranking.wxml');
  assert.match(ranking, /导出成绩/);
  assert.match(readRel('pages', 't-ranking', 't-ranking.js'), /'&classId=' \+ encodeURIComponent\(this\.data\.classId\)/,
    '成绩榜筛中哪个班，导出页就从哪个班起步');

  const exp = readRel('pages', 't-export', 't-export.wxml');
  assert.match(exp, /wx:for="\{\{results\}\}"\s+wx:key="uid"/);
  assert.match(exp, /wx:for="\{\{preview\.rows\}\}"\s+wx:key="uid"/);
  assert.match(exp, /wx:for="\{\{slotList\}\}"\s+wx:key="slot"/);
  assert.match(exp, /class="prog-fill"/, '进度条填充必须是 view：<i> 不是合法的 WXML 标签');
  assert.doesNotMatch(exp, /<i\b/, 'WXML 里没有 <i> 标签');
  assert.match(exp, /里面有其他同学的成绩：退出登录会一并删除本机文件/);
  assert.doesNotMatch(readRel('pages', 't-export', 't-export.js'), /shareFileMessage|onShareAppMessage/);
  // 教师端不接入分享是仓库既有原则，导出的更是他人成绩明文
  fs.readdirSync(path.join(__dirname, '..', 'pages'))
    .filter(d => d.indexOf('t-') === 0)
    .forEach(d => {
      assert.doesNotMatch(readRel('pages', d, d + '.js'), /onShareAppMessage/, '教师端页面不得接分享：' + d);
    });
});

test('排版回归：眉题按拉丁/中文拆开，mono + uppercase 只留给英文部分', () => {
  const app = readRel('app.wxss');
  const base = wxssRules('app.wxss').filter(r => r.sel === '.eyebrow')[0];
  const en = wxssRules('app.wxss').filter(r => r.sel === '.eyebrow .en')[0];
  assert.ok(base && en, 'app.wxss 必须有 .eyebrow 与 .eyebrow .en 两条规则');
  assert.match(base.body, /font-family:\s*var\(--font-sans\)/);
  assert.doesNotMatch(base.body, /font-mono|text-transform/, '整行套 mono 会把汉字逐字撑开，这是本次修掉的排版 bug');
  assert.match(en.body, /font-family:\s*var\(--font-mono\)/);
  assert.match(en.body, /text-transform:\s*uppercase/);
  assert.equal((app.match(/text-transform/g) || []).length, 1, 'uppercase 只允许出现在 .eyebrow .en 一处');

  // 每个眉题都必须用 .en / .cn 拆分写法，漏一页就等于把 bug 留着
  wxmlFiles().forEach(f => {
    readRel(f).split(/\r?\n/).forEach(line => {
      if (line.indexOf('class="eyebrow') < 0) return;
      assert.match(line, /<text class="en">/, '眉题未拆分：' + f);
    });
  });
});

test('排版回归：中文标题不再负字距，徽章行高锁 1，破格只按整词断', () => {
  const negative = [];
  const breakAll = [];
  allWxss().forEach(f => {
    wxssRules(f).forEach(r => {
      if (r.sel.charAt(0) !== '.') return; // @keyframes 的 from/to 步不参与
      if (/letter-spacing:\s*-/.test(r.body)) negative.push(f + ' ' + r.sel);
      if (/word-break:\s*break-all/.test(r.body)) breakAll.push(f + ' ' + r.sel);
    });
  });
  // 负字距只适合数字：大字号读数紧一点好看，中文压紧了会互相咬字
  assert.deepEqual(negative, ['pages/scores/scores.wxss .hero-score', 'pages/t-analysis/t-analysis.wxss .hero-num'],
    '新增负字距请先确认那条规则里只有数字');
  assert.deepEqual(breakAll, [], 'break-all 会把「2026.9.22」这类日期从中间硬切，只能 overflow-wrap: break-word');

  const appRules = wxssRules('app.wxss');
  const pick = sel => appRules.filter(r => r.sel === sel)[0];
  assert.match(pick('.title').body, /letter-spacing:\s*0;/);
  assert.match(pick('.section-title').body, /letter-spacing:\s*0;/);
  assert.match(pick('.badge').body, /line-height:\s*1;/, '36rpx 固定高 + 全局 1.65 行高会切掉汉字下沿');
  assert.match(pick('.meta').body, /font-family:\s*var\(--font-sans\)/);
  assert.match(pick('.meta').body, /font-variant-numeric:\s*tabular-nums/, '中英数混排的元信息：等宽字体会让中文逐字回退');

  const rowName = wxssRules('pages/t-exams/t-exams.wxss').filter(r => r.sel === '.row-name')[0];
  assert.match(rowName.body, /letter-spacing:\s*0;/);
  assert.match(rowName.body, /overflow-wrap:\s*break-word/);

  ['pages/login/login.wxss', 'pages/scores/scores.wxss', 'pages/t-exams/t-exams.wxss', 'pages/t-ranking/t-ranking.wxss'].forEach(f => {
    const ph = wxssRules(f).filter(r => r.sel === '.ph')[0];
    assert.ok(ph, '缺 .ph 占位符规则：' + f);
    assert.match(ph.body, /var\(--gray\)/, '占位符颜色必须走变量，否则各页灰得不一致：' + f);
  });

  const gp = wxssRules('pages/t-classes/t-classes.wxss').filter(r => r.sel === '.gp-no')[0];
  assert.match(gp.body, /white-space:\s*nowrap/, '题号列被折成两行是本次修的排版 bug');
  const rankingSub = wxssRules('pages/t-ranking/t-ranking.wxss').filter(r => r.sel === '.s-sub')[0];
  assert.match(rankingSub.body, /white-space:\s*nowrap/);
});

test('成绩榜窄列口径：客/主分与「低分/题数」都压进一行', async () => {
  const ranking = readRel('pages', 't-ranking', 't-ranking.wxml');
  assert.match(ranking, /客\{\{item\.objectiveScore\}\}\s*·\s*主\{\{item\.subjectiveScore\}\}/);
  assert.match(ranking, /\{\{item\.lowScoreCount\}\}\/\{\{item\.questionCount\}\}/);
  const errW = (wxssRules('pages/t-ranking/t-ranking.wxss').filter(r => r.sel === '.c-err')[0].body.match(/(\d+)rpx/) || [])[1];
  const scoreW = (wxssRules('pages/t-ranking/t-ranking.wxss').filter(r => r.sel === '.c-score')[0].body.match(/(\d+)rpx/) || [])[1];
  assert.ok(Number(errW) > 0 && Number(scoreW) > 0);
  // 名次为 null 的学生不能占着「前三」的样式（与 teacher.test.js 同一条口径，这里守文案列宽）
  resetWx(); stubRequest();
  signOut(); signIn(TEACHER, ['grade:read']);
  getImpl = p => (p.indexOf('/classes') >= 0 ? [] : [
    { rank: null, studentNumber: 'A', studentName: '无名次', totalScore: 10, objectiveScore: 4, subjectiveScore: 6, lowScoreCount: 1, questionCount: 4, errorRate: 25, errorRateLevel: 'low' }
  ]);
  const tRankingDef = capture('../pages/t-ranking/t-ranking.js');
  const page = makePage(tRankingDef);
  page.onLoad({ examId: '7' });
  await flush();
  assert.equal(page.data.list[0].rankText, '—');
  assert.equal(page.data.list[0].isTop, false);
  signOut();
});
