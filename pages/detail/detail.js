// pages/detail/detail.js
const { get, post } = require('../../utils/request');
const { getToken, getUser } = require('../../utils/auth');
const { getCachedScores } = require('../../utils/cache');
const { normalizeReport, getCachedAI, setCachedAI } = require('../../utils/ai');
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
    // 图片下载被 onHide 取消后，返回页面自动恢复
    if (this._extrasCancelled && this._answerBlocks && this._answerBlocks.length > 0 &&
        !this._imagesDone && !this._extrasAllFailed && !this.data.loading && !this.data.error) {
      this.loadCropImages(this._answerBlocks);
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

  // 单请求：/scores/me/exams/:examId 已含逐题、班级均分与原卷图块（后端 PR #232）
  loadDetail: function (done) {
    const self = this;
    if (this._loadingDetail) {
      if (typeof done === 'function') done();
      return;
    }
    this._loadingDetail = true;
    this.setData({ loading: true, error: '' });
    get('/scores/me/exams/' + this.data.examId)
      .then(function (resp) {
        self._answerBlocks = resp.answerBlocks || [];
        self.setData({
          rawQuestions: normalizeQuestions(resp),
          classAvgMap: resp.classQuestionStats || {},
          extrasUnavailable: false
        });
        self.buildLists();
        self.setData({ loading: false });
        self.loadCropImages(self._answerBlocks);
      })
      .catch(function (err) {
        self.setData({ loading: false, error: (err && err.message) || '加载失败' });
      })
      .finally(function () {
        self._loadingDetail = false;
        if (typeof done === 'function') done();
      });
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

  // 原卷图：wx.downloadFile 带 Authorization 头拿临时文件，token 不进 URL，
  // 也不再把大图 base64 塞进 setData（避免超过 setData 体积上限）。
  // 并发限制 3，页面隐藏/卸载后不再回写结果。
  loadCropImages: function (blocks) {
    const self = this;
    const token = getToken();
    const list = blocks.filter(function (b) { return b && b.id; });
    if (!token || list.length === 0) return;

    this._extrasCancelled = false;
    this._imagesDone = false;
    this._extrasAllFailed = false;
    const CONCURRENCY = 3;
    // 按请求顺序落位（results[idx]），并发完成顺序不影响最终图片顺序
    const results = new Array(list.length).fill(null);
    let failed = false;
    let index = 0;

    const finish = function () {
      if (self._extrasCancelled) return;
      const ok = results.filter(Boolean);
      if (ok.length > 0) {
        self.setData({ images: ok, showImages: true });
        self._imagesDone = true;
        if (failed) {
          wx.showToast({ title: (list.length - ok.length) + ' 张图片加载失败', icon: 'none' });
        }
      } else if (failed) {
        // 全部下载失败：给出可感知提示，而不是无声缺失
        self._extrasAllFailed = true; // 本页会话不再自动重试，下拉刷新可手动重试
        self.setData({ extrasUnavailable: true });
      }
    };
    const next = function () {
      if (self._extrasCancelled) return;
      if (index >= list.length) { finish(); return; }
      const idx = index;
      const b = list[idx];
      index++;
      wx.downloadFile({
        url: API_BASE + API_PREFIX + '/answer-block-crops/' + b.id + '/image',
        header: { 'Authorization': 'Bearer ' + token },
        success: function (res) {
          if (res.statusCode === 200 && res.tempFilePath) {
            results[idx] = {
              id: b.id,
              title: b.blockTitle || ('第' + ((b.questionNumbers && b.questionNumbers[0]) || '?') + ' 题'),
              url: res.tempFilePath
            };
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

  // 一键转发：组装本场成绩报告模型交给分享组件生成图片
  onShare: function () {
    if (this.data.loading || this.data.error) return;
    const user = getUser();
    const model = {
      type: 'detail',
      examName: this.data.examName,
      studentName: user && (user.name || '') || '',
      date: (this.data.summary && this.data.summary.graded_at) || '',
      summary: this.data.summary || null,
      objective: this.data.objective || [],
      subjective: this.data.subjective || [],
      aiText: (this.data.aiReport && this.data.aiReport.isText) ? this.data.aiReport.text : ''
    };
    this.selectComponent('#poster').open(model);
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
    const cached = getCachedAI('exam', this.data.examId);
    if (cached) { this.setData({ aiReport: cached }); return; }
    this.setData({ aiLoading: true, aiError: '' });
    post('/scores/me/exams/' + this.data.examId + '/ai-analysis', {}, { timeout: 120000 })
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
