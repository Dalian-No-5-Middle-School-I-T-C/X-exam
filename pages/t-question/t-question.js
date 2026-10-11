// pages/t-question/t-question.js
// 单题全班得分下钻：数据来自 /analysis/exams/:id/question-students，需要 can_view_students 权限，
// 后端未开该权限时返回 403 文案，页面原样显示，不降级猜测。
const teacherService = require('../../services/teacherService');
const role = require('../../utils/role');
const analysis = require('../../utils/analysis');

const pct = analysis.pct;
const fix = analysis.fix;

function failText(err) {
  if (!err) return '加载失败';
  if (err.status === 0) return '网络异常，请检查连接后重试';
  return err.message || '加载失败';
}

function decorate(rows) {
  return rows.map(function (r, i) {
    return {
      // studentId 缺失时会是 null，多个 null 会撞 wx:key，故用当前序号做键
      uid: i,
      seq: i + 1,
      studentNumber: r.studentNumber || '—',
      name: r.name || '—',
      className: r.className || '—',
      scoreText: (r.score === null ? '—' : fix(r.score, 1)) + ' / ' + (r.maxScore === null ? '—' : fix(r.maxScore, 1)),
      rateText: pct(r.scoreRate),
      barWidth: r.scoreRate === null ? 0 : Math.max(0, Math.min(100, Math.round(r.scoreRate))),
      isFull: r.isFull
    };
  });
}

// 得分相同按学号稳定排序，避免每次刷新顺序跳动
function byRateDesc(a, b) {
  const d = (b.scoreRate || 0) - (a.scoreRate || 0);
  return d !== 0 ? d : String(a.studentNumber).localeCompare(String(b.studentNumber));
}
function byRateAsc(a, b) {
  const d = (a.scoreRate || 0) - (b.scoreRate || 0);
  return d !== 0 ? d : String(a.studentNumber).localeCompare(String(b.studentNumber));
}

Page({
  data: {
    examId: '',
    questionNumber: '',
    classId: '',
    classLabel: '全部班级',
    invalid: false,
    list: [],
    summary: null,
    sort: 'desc',
    loading: false,
    error: '',
    ready: false
  },

  onLoad: function (options) {
    if (!role.guardWorkspace()) return;
    const o = options || {};
    const id = o.examId ? String(o.examId) : '';
    const no = o.questionNumber ? decodeURIComponent(o.questionNumber) : '';
    const cid = o.classId ? decodeURIComponent(o.classId) : '';
    // 三个参数都要过白名单：非数字一律不发请求（后端同样按 Number 校验并 400）
    if (!/^\d+$/.test(id) || !/^\d+(\.\d+)?$/.test(no) || (cid && !/^\d+$/.test(cid))) {
      this.setData({ invalid: true });
      return;
    }
    this.setData({
      examId: id,
      questionNumber: no,
      classId: cid,
      classLabel: cid ? ('班级 #' + cid) : '全部班级'
    });
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
    teacherService.fetchQuestionStudents(this.data.examId, this.data.questionNumber,
        this.data.classId || undefined)
      .then(function (resp) {
        const rows = analysis.normalizeQuestionStudents(resp);
        self._rows = rows;
        self.setData({ loading: false, summary: self.computeSummary(rows) });
        self.reorder();
      })
      .catch(function (err) {
        self.setData({ loading: false, list: [], summary: null, error: failText(err) });
      })
      .finally(function () {
        self._loading = false;
        if (typeof done === 'function') done();
      });
  },

  // 概览：满分/零分/平均得分率，均按后端返回的逐人得分现算，不引用可能被筛掉的聚合值
  computeSummary: function (rows) {
    if (rows.length === 0) return null;
    var max = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].maxScore !== null) { max = rows[i].maxScore; break; }
    }
    let full = 0, zero = 0, sum = 0, counted = 0;
    rows.forEach(function (r) {
      if (r.score === null) return;
      counted += 1;
      sum += r.score;
      if (max !== null && r.score >= max) full += 1;
      if (r.score === 0) zero += 1;
    });
    return {
      total: rows.length,
      counted: counted,
      full: full,
      zero: zero,
      maxScore: max === null ? '—' : fix(max, 1),
      // 满分缺失或为 0 时得分率无意义，显示「—」而不是 0%
      avgRate: (max && counted > 0) ? pct((sum / counted) * 100 / max) : '—'
    };
  },

  reorder: function () {
    const raw = (this._rows || []).slice();
    raw.sort(this.data.sort === 'asc' ? byRateAsc : byRateDesc);
    this.setData({ list: decorate(raw) });
  },

  onSort: function (e) {
    const v = e.currentTarget.dataset.value;
    if (v === this.data.sort) return;
    this.setData({ sort: v });
    this.reorder();
  },

  onRetry: function () { this.load(); }
});
