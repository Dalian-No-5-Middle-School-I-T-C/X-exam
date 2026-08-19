// pages/semester/semester.js
const scoresService = require('../../services/scoresService');
const { animateNumber } = require('../../utils/animate');
const { toNum } = require('../../utils/response');
const share = require('../../growth/share');
const growthService = require('../../services/growthService');

function round1(n) { return Math.round(n * 10) / 10; }

Page({
  data: {
    loading: false,
    error: '',
    current: null,
    previous: null,
    avgScoreChange: null,
    improved: [],
    declined: [],
    rows: [],
    ready: false,
    curAvg: 0,
    prevAvg: 0
  },

  onShow: function () {
    // 自动加载防抖：进行中或 5 秒内刚加载过则跳过；下拉刷新/点击重试不受限
    const now = Date.now();
    if (!this._loading && (!this._lastAutoLoad || now - this._lastAutoLoad > 5000)) {
      this._lastAutoLoad = now;
      this.load();
    }
  },

  onReady: function () { this.setData({ ready: true }); share.enableShareMenu(); },
  onHide: function () { this._cancelAvgs(); },
  onUnload: function () { this._cancelAvgs(); },

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
    scoresService.fetchSemesterComparison()
      .then(function (r) {
        const resp = r || {};
        const current = resp.current || null;
        const previous = resp.previous || null;
        self.setData({
          loading: false,
          error: '',
          current: current,
          previous: previous,
          avgScoreChange: resp.avgScoreChange != null ? toNum(resp.avgScoreChange, null) : null,
          improved: Array.isArray(resp.improvedSubjects) ? resp.improvedSubjects : [],
          declined: Array.isArray(resp.declinedSubjects) ? resp.declinedSubjects : [],
          rows: self.buildRows(current, previous)
        });
        self.animateAvgs(current, previous);
      })
      .catch(function (err) {
        // 失败与"没有数据"分开：错误态可点击重试
        self._lastAutoLoad = 0; // 失败后允许下次 onShow 立即重试
        self.setData({
          loading: false,
          error: (err && err.message) || '加载失败，请重试',
          current: null,
          previous: null,
          rows: []
        });
      })
      .finally(function () {
        self._loading = false;
        if (typeof done === 'function') done();
      });
  },

  // 学期均分数字滚动：首次滚动，之后直接赋值避免闪动
  animateAvgs: function (current, previous) {
    const self = this;
    const curT = current ? toNum(current.avgScore, 0) : 0;
    const prevT = previous ? toNum(previous.avgScore, 0) : 0;
    this._cancelAvgs();
    if (!this._avgDone) {
      this._avgDone = true;
      this.setData({ curAvg: 0, prevAvg: 0 });
      this._cancelCur = animateNumber({ from: 0, to: curT, duration: 650, onUpdate: function (v) { self.setData({ curAvg: v }); } });
      this._cancelPrev = animateNumber({ from: 0, to: prevT, duration: 650, onUpdate: function (v) { self.setData({ prevAvg: v }); } });
    } else {
      this.setData({ curAvg: curT, prevAvg: prevT });
    }
  },

  _cancelAvgs: function () {
    if (this._cancelCur) { this._cancelCur(); this._cancelCur = null; }
    if (this._cancelPrev) { this._cancelPrev(); this._cancelPrev = null; }
  },

  onShareAppMessage: function () {
    growthService.onShareApp({ from: 'semester' });
    return share.makeShareAppMessage({ title: '我的学期对比', query: {} });
  },

  onShareTimeline: function () {
    growthService.onShareTimeline({ from: 'semester' });
    return share.makeShareTimeline({ title: 'Project-X 学期对比' });
  },

  // 学科明细：本学期各科均分 vs 上学期同科均分，算 delta
  buildRows: function (current, previous) {
    if (!current || !Array.isArray(current.subjects)) return [];
    const prevMap = {};
    if (previous && Array.isArray(previous.subjects)) {
      previous.subjects.forEach(function (s) { prevMap[s.subject] = s; });
    }
    return current.subjects.map(function (s) {
      const p = prevMap[s.subject];
      const cv = toNum(s.avgScore, null);
      const pv = p ? toNum(p.avgScore, null) : null;
      let delta = null;
      if (cv != null && pv != null) delta = round1(cv - pv);
      return {
        subject: s.subject,
        cur: cv != null ? cv : '—',
        prev: pv != null ? pv : '—',
        delta: delta,
        gap: s.avgClassGap != null ? toNum(s.avgClassGap, '—') : '—'
      };
    });
  }
});
