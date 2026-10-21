// utils/exportTable.js
// 成绩表导出的纯逻辑层：不碰 wx，页面与服务层只消费这里算好的结构，便于在 Node 里直接断言。
// 口径来源（改任何数字/文案前先核对这两处，两端各写一套是本次要防的事）：
// - 后端 src/server/routes/export-scores.ts：列 id、写进 Excel 的表头文案、rankChange 的「↑+3 / ↓-2 / 0 / -」、
//   无赋分时「赋分」列整列省略、sheet 名「成绩表」、文件名「{考试名}_成绩表.xlsx」。
// - 主站 ExportModal.tsx：列选择器文案、COL_WIDTHS、SIDE_COL_WIDTHS、A4_MAX_CHARS=63、两个快捷预设。
// classId 三态是后端语义，必须原样保留：undefined=全部班级（每生去重取首行）、0=无班级学生、正整数=指定班。
// 「0」绝不能被当成 falsy 丢掉，否则「未知班级」那份表会悄悄变成全年级表。
const { decodeUtf8 } = require('./response');
const env = require('./env');

// ── 列定义 ─────────────────────────────────────────────
// label = 列选择器文案（主站同款）；header = 写进 Excel 的表头（后端同款）；width = A4 宽度估算用的 ch 数
var COLUMN_DEFS = [
  { id: 'studentNumber', label: '考号', header: '考号', category: 'basic', width: 14 },
  { id: 'studentName', label: '姓名', header: '姓名', category: 'basic', width: 8 },
  { id: 'className', label: '班级', header: '班级', category: 'basic', width: 8 },
  { id: 'grade', label: '年级', header: '年级', category: 'basic', width: 8 },
  { id: 'totalScore', label: '成绩', header: '原始分', category: 'score', width: 7 },
  { id: 'assignedScore', label: '赋分', header: '赋分', category: 'score', width: 7 },
  { id: 'objectiveScore', label: '客观分', header: '客观分', category: 'score', width: 7 },
  { id: 'subjectiveScore', label: '主观分', header: '主观分', category: 'score', width: 7 },
  { id: 'gradeRank', label: '年排', header: '年排', category: 'ranking', width: 5 },
  { id: 'classRank', label: '班排', header: '班排', category: 'ranking', width: 5 },
  { id: 'rankChange', label: '名次变化', header: '名次变化', category: 'ranking', width: 10 },
  { id: 'displayValue', label: '偏差值/Z值', header: '偏差值/Z值', category: 'other', width: 10 },
  { id: 'needsReview', label: '需要复核', header: '需要复核', category: 'other', width: 6 },
  { id: 'confidence', label: '置信度', header: '置信度', category: 'other', width: 7 },
  { id: 'objectiveSubScores', label: '客观题小分', header: '客观题小分', category: 'questions', width: 7 },
  { id: 'subjectiveSubScores', label: '主观题小分', header: '主观题小分', category: 'questions', width: 7 }
];

var PRESET_BASIC = ['classRank', 'studentName', 'totalScore', 'assignedScore', 'gradeRank', 'objectiveScore', 'subjectiveScore'];
var PRESET_FULL = ['studentNumber', 'studentName', 'className', 'totalScore', 'assignedScore',
  'gradeRank', 'classRank', 'objectiveScore', 'subjectiveScore', 'rankChange', 'displayValue'];
// 主站只有前两个预设；小程序屏幕窄，把「逐题小分」做成一键，省得教师在 16 个胶囊里逐个点
var PRESET_WITH_SUBS = PRESET_FULL.concat(['objectiveSubScores', 'subjectiveSubScores']);

var A4_MAX_CHARS = 63;
var SIDE_COL_WIDTHS = [5, 8, 7];
// 后端对「需要复核 / 置信度」写死空值（导出时这两列没有数据源），选中了也只是空列
var PLACEHOLDER_COLUMNS = ['needsReview', 'confidence'];

var DEF_BY_ID = {};
COLUMN_DEFS.forEach(function (d) { DEF_BY_ID[d.id] = d; });

// ── 数值闸门 ───────────────────────────────────────────
// env.js 里的 LIMITS 是可改档，这里给死天花板；越界按夹紧处理，非法值回落默认值（不保留放宽通道）。
var LIMIT_CEILING = {
  exportTimeoutMs: [5000, 120000],
  classesPerExport: [1, 80],
  sideTableN: [0, 200],
  gapCols: [1, 10],
  fileMb: [1, 32],
  keepFiles: [1, 30],
  previewRows: [1, 10]
};
var LIMIT_DEFAULTS = {
  exportTimeoutMs: 60000,
  classesPerExport: 40,
  sideTableN: 10,
  gapCols: 1,
  fileMb: 8,
  keepFiles: 10,
  previewRows: 3
};

function resolveLimit(raw, key) {
  var def = LIMIT_DEFAULTS[key];
  var bounds = LIMIT_CEILING[key];
  var n = typeof raw === 'number' && isFinite(raw) ? Math.floor(raw) : NaN;
  if (!isFinite(n)) return def;
  if (n < bounds[0]) return bounds[0];
  if (n > bounds[1]) return bounds[1];
  return n;
}

function limits() {
  var cfg = (env && env.LIMITS) || {};
  var out = {};
  Object.keys(LIMIT_CEILING).forEach(function (k) { out[k] = resolveLimit(cfg[k], k); });
  return out;
}

// ── 列操作 ─────────────────────────────────────────────
function isColumn(id) { return Object.prototype.hasOwnProperty.call(DEF_BY_ID, id); }
function labelOf(id) { return isColumn(id) ? DEF_BY_ID[id].label : String(id); }
function headerOf(id) { return isColumn(id) ? DEF_BY_ID[id].header : String(id); }

// 去掉未知 id 与重复项，长度封顶在列定义总数
function cleanColumns(list) {
  if (!Array.isArray(list)) return [];
  var seen = {};
  var out = [];
  for (var i = 0; i < list.length && out.length < COLUMN_DEFS.length; i++) {
    var id = list[i];
    if (!isColumn(id) || seen[id]) continue;
    seen[id] = true;
    out.push(id);
  }
  return out;
}

function toggleColumn(list, id) {
  if (!isColumn(id)) return cleanColumns(list);
  var out = cleanColumns(list);
  var at = out.indexOf(id);
  if (at >= 0) out.splice(at, 1);
  else out.push(id);
  return out;
}

// 上移 / 下移：越界按边界夹紧，返回新数组
function moveColumn(list, index, delta) {
  var out = cleanColumns(list);
  var from = Math.floor(Number(index));
  if (!isFinite(from) || from < 0 || from >= out.length) return out;
  var to = Math.min(out.length - 1, Math.max(0, from + Math.floor(Number(delta) || 0)));
  var item = out.splice(from, 1)[0];
  out.splice(to, 0, item);
  return out;
}

function remainingColumns(list) {
  var picked = cleanColumns(list);
  var map = {};
  picked.forEach(function (id) { map[id] = true; });
  return COLUMN_DEFS.filter(function (d) { return !map[d.id]; });
}

function columnsByCategory(list) {
  var groups = {};
  cleanColumns(list).forEach(function (id) {
    var d = DEF_BY_ID[id];
    (groups[d.category] || (groups[d.category] = [])).push(d);
  });
  return groups;
}

// ── 宽度与 A4 告警 ─────────────────────────────────────
// 与主站 computeTotalWidth 同式：侧表在同一个 Sheet 右侧，占位宽 = 三列之和
function computeTotalWidth(columns, sideN, gapCols) {
  var sum = cleanColumns(columns).reduce(function (acc, id) { return acc + DEF_BY_ID[id].width; }, 0);
  if (Number(sideN) > 0) return sum + (Number(gapCols) || 0) + SIDE_COL_WIDTHS.reduce(function (a, b) { return a + b; }, 0);
  return sum;
}

function widthInfo(columns, sideN, gapCols, maxChars) {
  var total = computeTotalWidth(columns, sideN, gapCols);
  var limit = typeof maxChars === 'number' ? maxChars : A4_MAX_CHARS;
  return { total: total, limit: limit, over: total > limit, sideOn: Number(sideN) > 0 };
}

// 输入框取值夹紧：上界取天花板，非法值/空值回落 env 默认值。
// sideTableN 与 gapCols 是「教师选的参数」，env.LIMITS 对它们只表示首次进入页面的初始值，
// 拿初始值当上界会把教师选的数悄悄裁小（选「前 20 名」却导出前 10 名），所以这里只认天花板。
// classesPerExport / fileMb / keepFiles 反过来本身就是上限，走 limits() 而不是这里。
function clampSetting(key, raw, lo) {
  var bounds = LIMIT_CEILING[key];
  if (!bounds) return 0;
  var dflt = limits()[key];
  if (raw === '' || raw === null || raw === undefined) return dflt;
  var n = Math.floor(Number(raw));
  if (!isFinite(n)) return dflt;
  var min = typeof lo === 'number' ? Math.max(lo, bounds[0]) : bounds[0];
  return Math.min(Math.max(n, min), bounds[1]);
}

// ── classId 三态 ───────────────────────────────────────
// null / undefined / '' → 全部班级（请求体里干脆不带这个键）
// 0 → 「无班级 / 未知班级」，必须原样传 0
// 其余数字 → 指定班
function normalizeClassId(v) {
  if (v === undefined || v === null || v === '') return undefined;
  var n = Number(v);
  if (!isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

// ── 请求体 ─────────────────────────────────────────────
// 与后端 ExportConfigRequest 对齐；后端 columns 为空返回 400「请至少选择一列」，这里提前拦下。
function buildExportBody(cfg, opts) {
  var o = opts || {};
  var lim = o.limits || limits();
  var columns = cleanColumns(cfg && cfg.columns);
  if (columns.length === 0) {
    var err = new Error('请至少选择一列');
    err.code = 'NO_COLUMN';
    throw err;
  }
  var body = { columns: columns, sideTableN: 0, gapCols: lim.gapCols };
  var classId = normalizeClassId(cfg && cfg.classId);
  if (classId !== undefined) body.classId = classId;
  // 参照表参数按天花板夹紧，不按 env 默认值夹紧（理由见 clampSetting）
  var sideN = Math.floor(Number(cfg && cfg.sideTableN));
  if (isFinite(sideN) && sideN > 0) body.sideTableN = Math.min(sideN, LIMIT_CEILING.sideTableN[1]);
  var gap = Math.floor(Number(cfg && cfg.gapCols));
  if (isFinite(gap) && gap > 0) body.gapCols = Math.min(gap, LIMIT_CEILING.gapCols[1]);
  return body;
}

// ── 模板（后端 /api/export/templates*，与主站共用同一份 user_id 维度的数据） ──
function normalizeTemplate(t) {
  if (!t || typeof t !== 'object') return null;
  var slot = Math.floor(Number(t.slot));
  if (!isFinite(slot) || slot < 1 || slot > 4) return null;
  var rawCols = t.columns;
  if (typeof rawCols === 'string') {
    try { rawCols = JSON.parse(rawCols); } catch (e) { rawCols = []; }
  }
  var columns = cleanColumns(rawCols);
  return {
    slot: slot,
    name: typeof t.name === 'string' && t.name ? t.name : '模板' + slot,
    columns: columns,
    sideTableN: Math.max(0, Math.floor(Number(pickNum(t, ['sideTableN', 'side_table_n'], 0)))),
    gapCols: Math.max(1, Math.floor(Number(pickNum(t, ['gapCols', 'gap_cols'], 3))))
  };
}

function pickNum(obj, keys, dflt) {
  for (var i = 0; i < keys.length; i++) {
    var v = obj[keys[i]];
    if (v !== undefined && v !== null) return v;
  }
  return dflt;
}

function normalizeTemplates(resp) {
  var list = Array.isArray(resp) ? resp : [];
  var out = [];
  list.forEach(function (t) {
    var n = normalizeTemplate(t);
    if (n && n.columns.length > 0) out.push(n);
  });
  out.sort(function (a, b) { return a.slot - b.slot; });
  return out;
}

// PUT 请求体：后端按 name/columns/sideTableN/gapCols 取，缺省会给「未命名」与 gapCols 3
function templateBody(cfg) {
  var columns = cleanColumns(cfg && cfg.columns);
  return {
    name: (cfg && cfg.name) || '未命名',
    columns: columns,
    sideTableN: Math.max(0, Math.floor(Number(cfg && cfg.sideTableN) || 0)),
    gapCols: Math.max(1, Math.floor(Number(cfg && cfg.gapCols) || 1))
  };
}

// ── 班级计划 ───────────────────────────────────────────
// mode: all=整场一份 / one=按所选班一份 / each=名单里每个班各出一份
// normalizeClasses 会把 classId 为 0 的「未知班级」保留下来，逐班导出时它也是一份合法文件。
function planClasses(mode, classes, classId, max) {
  var cap = typeof max === 'number' ? max : limits().classesPerExport;
  var list = (Array.isArray(classes) ? classes : []).filter(function (c) {
    return c && typeof c === 'object' && c.classId !== null && c.classId !== undefined;
  });
  if (mode === 'each') {
    var planned = list.slice(0, cap).map(function (c) {
      return { classId: normalizeClassId(c.classId), className: c.className || ('班级' + c.classId) };
    });
    return { scopes: planned, skipped: Math.max(0, list.length - planned.length) };
  }
  if (mode === 'one') {
    var id = normalizeClassId(classId);
    var hit = null;
    for (var i = 0; i < list.length; i++) {
      if (normalizeClassId(list[i].classId) === id) { hit = list[i]; break; }
    }
    return {
      scopes: [{ classId: id, className: hit ? (hit.className || '') : '' }],
      skipped: 0
    };
  }
  return { scopes: [{ classId: undefined, className: '' }], skipped: 0 };
}

// ── 文件名 ─────────────────────────────────────────────
var NAME_MAX_CHARS = 40;
// 后端也做同样的字符替换（[\\/:*?"<>|]），这里再叠一层：班级名/考试名都可能带斜杠
function sanitizeName(name) {
  var s = String(name === undefined || name === null ? '' : name)
    .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > NAME_MAX_CHARS) s = s.slice(0, NAME_MAX_CHARS).trim();
  // 去掉 Windows 保留名与结尾点号，否则写盘会失败
  s = s.replace(/\.+$/, '');
  return s;
}

function buildFileName(examName, className) {
  var base = sanitizeName(examName) || '成绩表';
  var cls = sanitizeName(className);
  return base + (cls ? '_' + cls : '') + '_成绩表.xlsx';
}

// ── 预览（数据源 GET /analysis/exams/:id/score-table，行字段与导出用的是同一个仓储方法） ──
var PREVIEW_FIELD = {
  studentNumber: 'studentNumber', studentName: 'studentName', className: 'className', grade: 'gradeName',
  totalScore: 'totalScore', assignedScore: 'assignedScore', objectiveScore: 'objectiveScore',
  subjectiveScore: 'subjectiveScore', gradeRank: 'gradeRank', classRank: 'classRank',
  displayValue: 'displayValue', rankChange: 'rankChange'
};

// 后端对名次变化的写法：null→"-"，正→"↑+N"，负→"↓N"，0→"0"
function formatRankChange(v) {
  var n = Number(v);
  if (v === null || v === undefined || v === '' || !isFinite(n)) return '-';
  if (n > 0) return '↑+' + n;
  if (n < 0) return '↓' + n;
  return '0';
}

function formatCell(id, row, hasAssignedScore) {
  if (id === 'assignedScore' && !hasAssignedScore) return { skip: true };
  if (id === 'objectiveSubScores' || id === 'subjectiveSubScores') return { text: '…' };
  if (id === 'needsReview' || id === 'confidence') return { text: '—' };
  var key = PREVIEW_FIELD[id];
  var v = key ? row[key] : undefined;
  if (id === 'rankChange') return { text: formatRankChange(v) };
  if (v === null || v === undefined || v === '') return { text: '—' };
  return { text: String(v) };
}

// 返回给页面直接渲染的矩阵；hasAssignedScore=false 时「赋分」整列不出现，与后端一致
function previewTable(resp, columns, maxRows) {
  var r = resp && typeof resp === 'object' ? resp : {};
  var rows = Array.isArray(r.rows) ? r.rows : [];
  var cols = cleanColumns(columns);
  var hasAssigned = !!r.hasAssignedScore;
  var headers = [];
  var keys = [];
  cols.forEach(function (id) {
    if (id === 'assignedScore' && !hasAssigned) return;
    headers.push(headerOf(id));
    keys.push(id);
  });
  var cap = typeof maxRows === 'number' ? maxRows : limits().previewRows;
  var body = rows.slice(0, cap).map(function (row) {
    return keys.map(function (id) { return formatCell(id, row || {}, hasAssigned).text; });
  });
  return {
    examName: typeof r.examName === 'string' ? r.examName : '',
    subject: typeof r.subject === 'string' ? r.subject : '',
    examDate: typeof r.examDate === 'string' ? r.examDate : '',
    hasAssignedScore: hasAssigned,
    totalCount: typeof r.totalCount === 'number' ? r.totalCount : rows.length,
    headers: headers,
    rows: body,
    // 后端 rows 不含小题分，预览只能提示「逐题展开」而不是伪造数字
    hasSubColumns: keys.indexOf('objectiveSubScores') >= 0 || keys.indexOf('subjectiveSubScores') >= 0
  };
}

// ── 二进制响应里的错误文案 ─────────────────────────────
// responseType=arraybuffer 时后端 403 的 JSON 也是 ArrayBuffer，不解码就只能显示「请求失败」，
// 而「权限不足：管理员已关闭你对本场考试「查看成绩」的查看权限」这句正是教师需要的信息。
function parseErrorText(buf) {
  var text = decodeUtf8(buf);
  if (!text) return '';
  var trimmed = text.replace(/^\s+/, '');
  if (trimmed.charAt(0) !== '{') return '';
  try {
    var obj = JSON.parse(text);
    return obj && typeof obj.message === 'string' ? obj.message : '';
  } catch (e) {
    return '';
  }
}

function formatBytes(n) {
  var b = Number(n);
  if (!isFinite(b) || b < 0) return '—';
  if (b < 1024) return b + ' B';
  // 固定一位小数：字符串拼接数字会把 2.0 变成 2，同一批文件列表里宽度会跳
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

module.exports = {
  COLUMN_DEFS: COLUMN_DEFS,
  PRESET_BASIC: PRESET_BASIC,
  PRESET_FULL: PRESET_FULL,
  PRESET_WITH_SUBS: PRESET_WITH_SUBS,
  PLACEHOLDER_COLUMNS: PLACEHOLDER_COLUMNS,
  A4_MAX_CHARS: A4_MAX_CHARS,
  LIMIT_CEILING: LIMIT_CEILING,
  LIMIT_DEFAULTS: LIMIT_DEFAULTS,
  NAME_MAX_CHARS: NAME_MAX_CHARS,
  limits: limits,
  resolveLimit: resolveLimit,
  clampSetting: clampSetting,
  isColumn: isColumn,
  labelOf: labelOf,
  headerOf: headerOf,
  cleanColumns: cleanColumns,
  toggleColumn: toggleColumn,
  moveColumn: moveColumn,
  remainingColumns: remainingColumns,
  columnsByCategory: columnsByCategory,
  computeTotalWidth: computeTotalWidth,
  widthInfo: widthInfo,
  normalizeClassId: normalizeClassId,
  buildExportBody: buildExportBody,
  normalizeTemplate: normalizeTemplate,
  normalizeTemplates: normalizeTemplates,
  templateBody: templateBody,
  planClasses: planClasses,
  sanitizeName: sanitizeName,
  buildFileName: buildFileName,
  formatRankChange: formatRankChange,
  previewTable: previewTable,
  parseErrorText: parseErrorText,
  formatBytes: formatBytes
};

// 自检：node utils/exportTable.js（小程序运行时 require.main 为 undefined，不会执行）
if (typeof require !== 'undefined' && require.main === module) {
  var assert = require('assert');
  assert.strictEqual(labelOf('totalScore'), '成绩');
  assert.strictEqual(headerOf('totalScore'), '原始分');
  assert.strictEqual(cleanColumns(['totalScore', 'totalScore', 'nope']).length, 1);
  assert.deepEqual(moveColumn(['studentName', 'totalScore', 'className'], 2, -1), ['studentName', 'className', 'totalScore']);
  assert.deepEqual(moveColumn(['studentName', 'totalScore'], 0, -5), ['studentName', 'totalScore']);
  assert.strictEqual(normalizeClassId(0), 0);
  assert.strictEqual(normalizeClassId(''), undefined);
  assert.strictEqual(buildExportBody({ columns: ['totalScore'], classId: 0 }).classId, 0);
  assert.strictEqual('classId' in buildExportBody({ columns: ['totalScore'] }), false);
  // 教师选的参照表参数不能被 env 默认值裁小
  assert.strictEqual(buildExportBody({ columns: ['totalScore'], sideTableN: 20, gapCols: 4 }).sideTableN, 20);
  assert.strictEqual(buildExportBody({ columns: ['totalScore'], sideTableN: 20, gapCols: 4 }).gapCols, 4);
  assert.strictEqual(buildExportBody({ columns: ['totalScore'], sideTableN: 9999 }).sideTableN, 200);
  assert.strictEqual(clampSetting('gapCols', '99', 1), 10);
  assert.strictEqual(clampSetting('gapCols', '', 1), 1);
  assert.strictEqual(clampSetting('sideTableN', 'abc', 1), 10);
  assert.strictEqual(widthInfo(PRESET_BASIC, 10, 1).over, true);
  assert.strictEqual(sanitizeName('a/b\\c:d*e'), 'a_b_c_d_e');
  assert.strictEqual(buildFileName('2026.9.22听力练习', '高一(3)班'), '2026.9.22听力练习_高一(3)班_成绩表.xlsx');
  assert.strictEqual(formatRankChange(-2), '↓-2');
  assert.strictEqual(formatRankChange(null), '-');
  assert.strictEqual(formatBytes(2048), '2.0 KB');
  assert.strictEqual(formatBytes(1048576), '1.0 MB');
  assert.strictEqual(formatBytes(-1), '—');
  assert.deepEqual(planClasses('each', [{ classId: 1, className: '一班' }, { classId: 0, className: '未知班级' }], null, 10).scopes.length, 2);
  assert.strictEqual(limits().sideTableN, 10);
  console.log('exportTable.js self-check OK');
}
