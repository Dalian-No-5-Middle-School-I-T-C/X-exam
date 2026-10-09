// pages/t-classes/t-classes.js
// 班级对比：/analysis/exams/:id/class-comparison?all=1 一次返回全部可见班级。
// 「差距」单位为百分点（percentage point，后端得分率是 0-100 的整数），页面上统一写 pp 以免和百分比混淆。
const teacherService = require('../../services/teacherService');
const role = require('../../utils/role');
const analysis = require('../../utils/analysis');

const pct = analysis.pct;
const fix = analysis.fix;
const GAP_LIMIT = 10;

function failText(err) {
  if (!err) return '加载失败';
  if (err.status === 0) return '网络异常，请检查连接后重试';
  return err.message || '加载失败';
}

function cmpBy(key) {
  return function (a, b) {
    const x = a[key], y = b[key];
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x;
  };
}

Page({
  data: {
    examId: '',
    invalid: false,
    fullScore: null,
    classes: [],
    gaps: [],
    gapNote: '',
    sortKey: 'avgScore',
    loading: false,
    error: '',
    ready: false
  },

  onLoad: function (options) {
    if (!role.guardWorkspace()) return;
    const id = options && options.examId ? String(options.examId) : '';
    if (!/^\d+$/.test(id)) {
      this.setData({ invalid: true });
      return;
    }
    this.setData({ examId: id });
    this.load();
  },

  onReady: function () { this.setData({ ready: true }); },

  onPullDownRefresh: function () {
    this.load(function () { wx.stopPullDownRefresh(); });
  },

  load: function (done) {
    const self = this;
    if (this._loading) {
      if (typeof done === 'function') done();
      return;
    }
    this._loading = true;
    this.setData({ loading: true, error: '' });
    teacherService.fetchClassComparison(this.data.examId)
      .then(function (resp) {
        const model = analysis.normalizeClassComparison(resp);
        self._model = model;
        self.setData({ loading: false, fullScore: model.fullScore });
        self.reorder();
        self.buildGaps();
      })
      .catch(function (err) {
        self.setData({ loading: false, classes: [], gaps: [], gapNote: '', error: failText(err) });
      })
      .finally(function () {
        self._loading = false;
        if (typeof done === 'function') done();
      });
  },

  reorder: function () {
    const model = this._model;
    if (!model) return;
    const names = {};
    model.classes.forEach(function (c) { names[c.classId] = c.className || ('班级 #' + c.classId); });
    this._names = names;
    // 与概况同口径：满分不可知时后端把及格率/优秀率一律置 0 作占位，显示「—」而不是 0%
    const scoreKnown = model.fullScore !== null && model.fullScore > 0;
    const sorted = model.classes.slice().sort(cmpBy(this.data.sortKey));
    this.setData({
      classes: sorted.map(function (c) {
        return {
          classId: c.classId,
          className: c.className || ('班级 #' + c.classId),
          gradeName: c.gradeName || '',
          count: c.count,
          avgScore: fix(c.avgScore, 1),
          maxScore: fix(c.maxScore, 1),
          minScore: fix(c.minScore, 1),
          median: fix(c.median, 1),
          stdDev: fix(c.stdDev, 1),
          passRate: scoreKnown ? pct(c.passRate) : '—',
          excellentRate: scoreKnown ? pct(c.excellentRate) : '—',
          difficulty: fix(c.difficulty, 2),
          discrimination: fix(c.discrimination, 2),
          // 平均分条按满分归一，满分未知时不画（避免误读为 0）
          barWidth: (c.avgScore === null || !model.fullScore)
            ? 0
            : Math.max(0, Math.min(100, Math.round(c.avgScore * 100 / model.fullScore)))
        };
      })
    });
  },

  // 逐题班际差距：同一题各班得分率的极差，只列差距最大的前若干题
  buildGaps: function () {
    const model = this._model;
    if (!model) return;
    const names = this._names || {};
    const rows = [];
    model.questionStats.forEach(function (q) {
      const vals = q.byClass.filter(function (b) { return b.scoreRate !== null; });
      if (vals.length < 2) return;
      let hi = vals[0], lo = vals[0];
      vals.forEach(function (b) {
        if (b.scoreRate > hi.scoreRate) hi = b;
        if (b.scoreRate < lo.scoreRate) lo = b;
      });
      rows.push({
        questionNumber: q.questionNumber === null ? '?' : String(q.questionNumber),
        typeLabel: q.scoreType === 'objective' ? '客观' : (q.scoreType === 'subjective' ? '主观' : ''),
        gap: Math.round((hi.scoreRate - lo.scoreRate) * 10) / 10,
        bestClass: names[hi.classId] || ('班级 #' + hi.classId),
        worstClass: names[lo.classId] || ('班级 #' + lo.classId),
        bestRate: pct(hi.scoreRate),
        worstRate: pct(lo.scoreRate),
        maxScore: fix(q.maxScore, 1)
      });
    });
    rows.sort(function (a, b) { return b.gap - a.gap; });
    // 同一题号可能同时有客观/主观两行，questionNumber 不保证唯一，故列表键用下标
    const top = rows.slice(0, GAP_LIMIT).map(function (r, i) {
      r.uid = i;
      return r;
    });
    this.setData({
      gaps: top,
      gapNote: rows.length > GAP_LIMIT
        ? ('共 ' + rows.length + ' 题存在班际差距，以下列出最大的 ' + GAP_LIMIT + ' 题')
        : (rows.length > 0 ? '共 ' + rows.length + ' 题存在班际差距' : '')
    });
  },

  onSort: function (e) {
    const v = e.currentTarget.dataset.value;
    if (v === this.data.sortKey) return;
    this.setData({ sortKey: v });
    this.reorder();
  },

  onRetry: function () { this.load(); }
});
