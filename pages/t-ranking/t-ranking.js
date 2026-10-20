// pages/t-ranking/t-ranking.js
// 本场考试成绩榜：/analysis/exams/:id/students 一次返回整榜（后端无分页与排序参数），
// 分页、搜索、班级筛选都在本地做，避免每翻一页就重刷全量网络数据。
const teacherService = require('../../services/teacherService');
const role = require('../../utils/role');
const analysis = require('../../utils/analysis');

const PAGE_SIZE = 30;

function failText(err) {
  if (!err) return '加载失败';
  if (err.status === 0) return '网络异常，请检查连接后重试';
  return err.message || '加载失败';
}

function decorate(s, i) {
  return {
    // 榜单不带 studentId，学号也可能缺失，用当前切片下标作 wx:key 的稳定值
    uid: i,
    // rank 可能为 null（后端未排名），null <= 3 会误判为前三，故显式判定
    isTop: s.rank !== null && s.rank !== undefined && s.rank <= 3,
    rankText: s.rank === null ? '—' : String(s.rank),
    studentNumber: s.studentNumber || '—',
    studentName: s.studentName || '—',
    totalScore: s.totalScore === null ? '—' : analysis.fix(s.totalScore, 1),
    objectiveScore: s.objectiveScore === null ? '—' : analysis.fix(s.objectiveScore, 1),
    subjectiveScore: s.subjectiveScore === null ? '—' : analysis.fix(s.subjectiveScore, 1),
    lowScoreCount: s.lowScoreCount,
    questionCount: s.questionCount,
    errorRateText: analysis.pct(s.errorRate),
    errorLevel: s.errorRateLevel
  };
}

Page({
  data: {
    examId: '',
    invalid: false,
    classOptions: [{ className: '全部班级', classId: null }],
    classIndex: 0,
    classLabel: '全部班级',
    classId: '',
    keyword: '',
    total: 0,
    matched: 0,
    list: [],
    page: 0,
    hasMore: false,
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
    // 导出页「成绩榜 ›」会把当前班级带过来，班级名单到手后再对齐 picker 的选中项
    const cid = options && options.classId !== undefined && options.classId !== null ? String(options.classId) : '';
    this.setData({ examId: id, classId: /^\d+$/.test(cid) ? cid : '' });
    this.loadClasses();
    this.load();
  },

  onReady: function () { this.setData({ ready: true }); },

  onPullDownRefresh: function () {
    this.load(function () { wx.stopPullDownRefresh(); });
  },

  loadClasses: function () {
    const self = this;
    teacherService.fetchClasses(this.data.examId)
      .then(function (resp) {
        const classes = analysis.normalizeClasses(resp);
        const options = [{ className: '全部班级', classId: null }].concat(classes);
        // 带着 classId 进来时（导出页的「成绩榜 ›」），picker 要显示同一个班，
        // 否则榜单已经按班筛了、选择器却还写着「全部班级」
        const at = self.data.classId ? options.findIndex(function (c) {
          return c.classId !== null && String(c.classId) === self.data.classId;
        }) : -1;
        self.setData({
          classOptions: options,
          classIndex: at > 0 ? at : 0,
          classLabel: at > 0 ? options[at].className : '全部班级'
        });
      })
      .catch(function () { /* 筛选失败不影响榜单本身 */ });
  },

  load: function (done) {
    const self = this;
    if (this._loading) {
      if (typeof done === 'function') done();
      return;
    }
    this._loading = true;
    this.setData({ loading: true, error: '' });
    teacherService.fetchStudentRanking(this.data.examId, this.data.classId || undefined)
      .then(function (resp) {
        self._rows = analysis.normalizeStudentRanking(resp);
        self.setData({ loading: false, total: self._rows.length });
        self.resetPage();
      })
      .catch(function (err) {
        self._rows = [];
        self.setData({ loading: false, total: 0, list: [], page: 0, hasMore: false, error: failText(err) });
      })
      .finally(function () {
        self._loading = false;
        if (typeof done === 'function') done();
      });
  },

  // 筛选/搜索后回到第一页，翻页只做本地切片
  resetPage: function () {
    this.setData({ page: 0 });
    this.fill();
  },

  fill: function () {
    const rows = this.filtered();
    const upto = Math.min((this.data.page + 1) * PAGE_SIZE, rows.length);
    this.setData({
      list: rows.slice(0, upto).map(decorate),
      // 剩余人数按筛选后的条数算，关键词过滤时不能用全榜 total
      matched: rows.length,
      hasMore: upto < rows.length
    });
  },

  filtered: function () {
    const kw = (this.data.keyword || '').trim().toLowerCase();
    const rows = this._rows || [];
    if (!kw) return rows;
    return rows.filter(function (r) {
      return (r.studentName || '').toLowerCase().indexOf(kw) >= 0
        || (r.studentNumber || '').toLowerCase().indexOf(kw) >= 0;
    });
  },

  onSearch: function (e) {
    this.setData({ keyword: e.detail.value, page: 0 });
    this.fill();
  },

  onClassChange: function (e) {
    const idx = Number(e.detail.value);
    const picked = this.data.classOptions[idx];
    if (!picked) return;
    this.setData({
      classIndex: idx,
      classLabel: picked.className || '全部班级',
      classId: picked.classId === null || picked.classId === undefined ? '' : String(picked.classId)
    });
    this.load();
  },

  onMore: function () {
    if (!this.data.hasMore) return;
    this.setData({ page: this.data.page + 1 });
    this.fill();
  },

  onRetry: function () { this.load(); },

  // 榜单筛中哪个班，导出页就从哪个班起步；「全部班级」不带 classId，落到导出页的整场一份
  goExport: function () {
    const cid = this.data.classId ? '&classId=' + encodeURIComponent(this.data.classId) : '';
    wx.navigateTo({ url: '/pages/t-export/t-export?examId=' + this.data.examId + cid });
  }
});
