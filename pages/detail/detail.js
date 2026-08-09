// pages/detail/detail.js
const { get, post, getBuffer } = require('../../utils/request');
const { getToken } = require('../../utils/auth');
const { getCachedScores } = require('../../utils/cache');
const { normalizeReport, getCachedAI, setCachedAI } = require('../../utils/ai');

Page({
  data: {
    examId: 0,
    examName: '',
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
    const examName = options.name ? decodeURIComponent(options.name) : '';
    this.setData({ examId: examId, examName: examName });
    this.loadDetail();
  },

  onReady: function () {
    this.setData({ ready: true });
  },

  onPullDownRefresh: function () {
    this.loadDetail(function () { wx.stopPullDownRefresh(); });
  },

  loadDetail: function (done) {
    const self = this;
    this.setData({ loading: true, error: '' });
    get('/scores/me/exams/' + this.data.examId)
      .then(function (resp) {
        self.setData({ rawQuestions: resp.questions || [] });
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
    const cached = getCachedScores();
    const studentId = cached && cached.studentId;
    if (!studentId) return; // 鉴权由 request 封装统一处理

    // 元数据走统一封装：自动带 Bearer、401 自动清 token 并跳登录
    get('/exams/' + this.data.examId + '/student/' + studentId + '/scores')
      .then(function (d) {
        if (d.classQuestionStats) {
          self.setData({ classAvgMap: d.classQuestionStats });
          self.buildLists();
        }
        const blocks = d.answerBlocks || [];
        if (blocks.length > 0) self.loadCropImages(blocks);
      })
      .catch(function () { /* 附加信息不可用，静默降级 */ });
  },

  // 原卷图：经 getBuffer 在请求头带 token 拉取字节，转 base64 data URI 喂给 <image>
  // token 仅存在于请求头，不再落入 URL / 访问日志 / 缓存键
  loadCropImages: function (blocks) {
    const self = this;
    const tasks = blocks
      .filter(function (b) { return b && b.id; })
      .map(function (b) {
        return getBuffer('/answer-block-crops/' + b.id + '/image')
          .then(function (r) {
            const base64 = wx.arrayBufferToBase64(r.buffer);
            return {
              id: b.id,
              title: b.blockTitle || ('第 ' + ((b.questionNumbers && b.questionNumbers[0]) || '?') + ' 题'),
              url: 'data:' + r.contentType + ';base64,' + base64
            };
          })
          .catch(function () { return null; }); // 单张失败不阻断其余
      });

    Promise.all(tasks).then(function (imgs) {
      const ok = imgs.filter(Boolean);
      if (ok.length > 0) self.setData({ images: ok, showImages: true });
    });
  },

  onAi: function () {
    const self = this;
    if (this.data.aiLoading) return;
    if (!getToken()) { this.setData({ aiError: '请先登录' }); return; }
    const cached = getCachedAI('exam', this.data.examId);
    if (cached) { this.setData({ aiReport: cached }); return; }
    this.setData({ aiLoading: true, aiError: '' });
    post('/scores/me/exams/' + this.data.examId + '/ai-analysis', {})
      .then(function (resp) {
        const rep = normalizeReport(resp);
        if (rep) { setCachedAI('exam', self.data.examId, rep); self.setData({ aiReport: rep }); }
        else self.setData({ aiError: '暂未生成分析' });
      })
      .catch(function (err) {
        self.setData({ aiError: (err && err.message) || 'AI 服务暂不可用，请稍后再试' });
      })
      .finally(function () { self.setData({ aiLoading: false }); });
  }
});
