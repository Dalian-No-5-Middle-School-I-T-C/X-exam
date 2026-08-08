// pages/detail/detail.js
const { get, post } = require('../../utils/request');
const { getToken, getUser } = require('../../utils/auth');
const { API_BASE } = require('../../utils/env');
const { normalizeReport, getCachedAI, setCachedAI } = require('../../utils/ai');
const { fail: failToast } = require('../../utils/toast');

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
    const user = getUser();
    const studentId = user && (user.id || user.studentId);
    const token = getToken();
    if (!studentId || !token) return;

    get('/exams/' + this.data.examId + '/student/' + studentId + '/scores')
      .then(function (d) {
        if (d && d.classQuestionStats) {
          self.setData({ classAvgMap: d.classQuestionStats });
          self.buildLists();
        }
        const blocks = (d && d.answerBlocks) || [];
        if (blocks.length > 0) {
          const imgs = [];
          blocks.forEach(function (b) {
            if (!b || !b.id) return;
            const title = b.blockTitle || ('第 ' + ((b.questionNumbers && b.questionNumbers[0]) || '?') + ' 题');
            wx.downloadFile({
              url: API_BASE + '/api/answer-block-crops/' + b.id + '/image',
              header: { 'Authorization': 'Bearer ' + token },
              success: function (res) {
                if (res.statusCode === 200 && res.tempFilePath) {
                  imgs.push({ id: b.id, title: title, url: res.tempFilePath });
                  self.setData({ images: imgs.slice(), showImages: true });
                }
              },
              fail: function () { /* 单张原卷图失败，忽略 */ }
            });
          });
        }
      })
      .catch(function () { failToast('原卷图加载失败'); });
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
