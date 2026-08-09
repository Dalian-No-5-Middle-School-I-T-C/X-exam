// pages/detail/detail.js
const { get, post } = require('../../utils/request');
const { getToken, getUser } = require('../../utils/auth');
const { getCachedScores } = require('../../utils/cache');
const { normalizeReport } = require('../../utils/ai');
const { normalizeScores, normalizeQuestions } = require('../../utils/response');
const { API_BASE, API_PREFIX } = require('../../utils/env');

Page({
  data: {
    examId: 0,
    examName: '',
    summary: null,
    extrasUnavailable: false,
    rawQuestions: [],
    objective: [],
    subjective: [],
    classAvgMap: {},
    images: [],
    showImages: false,
    aiReport: null,
    aiLoading: false,
    aiError: '',
    loading: false,
    error: '',
    ready: false
  },

  onLoad: function (options) {
    const examId = parseInt(options.examId, 10) || 0;
    if (!examId) {
      this.setData({ error: '参数缺失，无法加载考试' });
      return;
    }
    const examName = options.name ? decodeURIComponent(options.name) : '';
    this.setData({ examId: examId, examName: examName });
    this.loadSummary();
    this.loadDetail();
  },

  onReady: function () {
    this.setData({ ready: true });
  },

  onShow: function () {
    // 下载被 onHide 取消后返回页面时自动恢复附加信息
    if (this._extrasCancelled && this.data.examId && !this.data.loading && !this.data.error) {
      this.loadExtras();
    }
  },
  onHide: function () { this._extrasCancelled = true; },
  onUnload: function () { this._extrasCancelled = true; },

  onPullDownRefresh: function () {
    this.loadDetail(function () { wx.stopPullDownRefresh(); });
  },

  // 本场总分/排名概览：优先从成绩列表缓存中取，避免详情页缺少关键信息
  loadSummary: function () {
    const self = this;
    const cache = getCachedScores();
    if (!cache) return;
    const found = normalizeScores(cache).scores.filter(function (s) {
      return Number(s.exam_id) === self.data.examId;
    })[0];
    if (found) this.setData({ summary: found });
  },

  loadDetail: function (done) {
    const self = this;
    this.setData({ loading: true, error: '' });
    get('/scores/me/exams/' + this.data.examId)
      .then(function (resp) {
        self.setData({ rawQuestions: normalizeQuestions(resp) });
        self.buildLists();
        self.setData({ loading: false });
        self.loadExtras();
      })
      .catch(function (err) {
        self.setData({ loading: false, error: (err && err.message) || '加载失败' });
      })
      .finally(function () { if (done) done(); });
  },

  buildLists: function () {
    const qs = this.data.rawQuestions || [];
    const map = this.data.classAvgMap || {};
    const enrich = function (q) {
      return Object.assign({}, q, {
        classAvg: (map[q.question_number] ? map[q.question_number].avgScore : null)
      });
    };
    const obj = qs.filter(function (q) { return q.score_type === 'objective'; }).map(enrich);
    const sub = qs.filter(function (q) { return q.score_type === 'subjective'; }).map(enrich);
    this.setData({ objective: obj, subjective: sub });
  },

  loadExtras: function () {
    const self = this;
    let studentId = '';
    const cached = getCachedScores();
    if (cached) studentId = normalizeScores(cached).studentId;
    if (!studentId) {
      const u = getUser() || {};
      // 只用明确的 studentId 字段，不拿账号 id 猜学生 id
      studentId = u.studentId || u.student_id || '';
    }
    if (!studentId) {
      // 深链/直接进入时无缓存可依赖：明确提示，而不是静默缺失
      this.setData({ extrasUnavailable: true });
      return;
    }

    get('/exams/' + this.data.examId + '/student/' + studentId + '/scores')
      .then(function (d) {
        self.setData({ extrasUnavailable: false });
        if (d.classQuestionStats) {
          self.setData({ classAvgMap: d.classQuestionStats });
          self.buildLists();
        }
        const blocks = d.answerBlocks || [];
        if (blocks.length > 0) self.loadCropImages(blocks);
      })
      .catch(function () {
        // 附加信息不可用：静默降级，但给出可感知提示
        self.setData({ extrasUnavailable: true });
      });
  },

  // 原卷图：wx.downloadFile 带 Authorization 头拿临时文件，token 不进 URL，
  // 也不再把大图 base64 塞进 setData（避免超过 setData 体积上限）。
  // 并发限制 3，页面隐藏/卸载后不再回写结果。
  loadCropImages: function (blocks) {
    const self = this;
    const token = getToken();
    const list = blocks.filter(function (b) { return b && b.id; });
    if (!token || list.length === 0) return;

    this._extrasCancelled = false;
    const CONCURRENCY = 3;
    const results = [];
    let failed = false;
    let index = 0;

    const finish = function () {
      if (self._extrasCancelled) return;
      const ok = results.filter(Boolean);
      if (ok.length > 0) {
        self.setData({ images: ok, showImages: true });
      } else if (failed) {
        // 全部下载失败：给出可感知提示，而不是无声缺失
        self.setData({ extrasUnavailable: true });
      }
    };
    const next = function () {
      if (self._extrasCancelled) return;
      if (index >= list.length) { finish(); return; }
      const b = list[index++];
      wx.downloadFile({
        url: API_BASE + API_PREFIX + '/answer-block-crops/' + b.id + '/image',
        header: { 'Authorization': 'Bearer ' + token },
        success: function (res) {
          if (res.statusCode === 200 && res.tempFilePath) {
            results.push({
              id: b.id,
              title: b.blockTitle || ('第' + ((b.questionNumbers && b.questionNumbers[0]) || '?') + ' 题'),
              url: res.tempFilePath
            });
          } else {
            failed = true;
          }
          next();
        },
        fail: function () { failed = true; next(); }
      });
    };
    for (let i = 0; i < Math.min(CONCURRENCY, list.length); i++) next();
  },

  goLeaderboard: function () {
    const name = this.data.examName ? encodeURIComponent(this.data.examName) : '';
    wx.navigateTo({ url: '/pages/leaderboard/leaderboard?examId=' + this.data.examId + '&name=' + name });
  },

  onShareAppMessage: function () {
    return {
      title: this.data.examName || ('考试 #' + this.data.examId),
      path: '/pages/detail/detail?examId=' + this.data.examId +
        '&name=' + encodeURIComponent(this.data.examName || '')
    };
  },

  onAi: function () {
    const self = this;
    if (this.data.aiLoading) return;
    if (!getToken()) { this.setData({ aiError: '请先登录' }); return; }
    this.setData({ aiLoading: true, aiError: '' });
    post('/scores/me/exams/' + this.data.examId + '/ai-analysis', {}, { timeout: 60000 })
      .then(function (resp) {
        const rep = normalizeReport(resp);
        if (rep) self.setData({ aiReport: rep });
        else self.setData({ aiError: '暂未生成分析' });
      })
      .catch(function (err) {
        self.setData({ aiError: (err && err.message) || 'AI 服务暂不可用，请稍后再试' });
      })
      .finally(function () { self.setData({ aiLoading: false }); });
  }
});
