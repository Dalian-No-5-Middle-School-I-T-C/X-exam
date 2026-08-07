// pages/semester/semester.js
const { get } = require('../../utils/request');
const { animateNumber } = require('../../utils/animate');

function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
function round1(n) { return Math.round(n * 10) / 10; }

Page({
  data: {
    loading: false,
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

  onShow: function () { this.load(); },

  onReady: function () { this.setData({ ready: true }); },
  onHide: function () { this._cancelAvgs(); },
  onUnload: function () { this._cancelAvgs(); },

  onPullDownRefresh: function () {
    this.load(function () { wx.stopPullDownRefresh(); });
  },

  load: function (done) {
    const self = this;
    this.setData({ loading: true });
    get('/scores/me/semester-comparison')
      .then(function (r) {
        const resp = r || {};
        const current = resp.current || null;
        const previous = resp.previous || null;
        self.setData({
          loading: false,
          current: current,
          previous: previous,
          avgScoreChange: (resp.avgScoreChange != null) ? resp.avgScoreChange : null,
          improved: Array.isArray(resp.improvedSubjects) ? resp.improvedSubjects : [],
          declined: Array.isArray(resp.declinedSubjects) ? resp.declinedSubjects : [],
          rows: self.buildRows(current, previous)
        });
        self.animateAvgs(current, previous);
      })
      .catch(function () {
        self.setData({ loading: false, current: null, previous: null, rows: [] });
      })
      .finally(function () { if (done) done(); });
  },

  // 学期均分数字滚动：首次滚动，之后直接赋值避免闪动
  animateAvgs: function (current, previous) {
    const self = this;
    const curT = current && typeof current.avgScore === 'number' ? current.avgScore : 0;
    const prevT = previous && typeof previous.avgScore === 'number' ? previous.avgScore : 0;
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

  // 学科明细：本学期各科均分 vs 上学期同科均分，算 delta
  buildRows: function (current, previous) {
    if (!current || !Array.isArray(current.subjects)) return [];
    const prevMap = {};
    if (previous && Array.isArray(previous.subjects)) {
      previous.subjects.forEach(function (s) { prevMap[s.subject] = s; });
    }
    return current.subjects.map(function (s) {
      const p = prevMap[s.subject];
      let delta = null;
      if (p && typeof p.avgScore === 'number' && typeof s.avgScore === 'number') {
        delta = round1(s.avgScore - p.avgScore);
      }
      return {
        subject: s.subject,
        cur: num(s.avgScore, '—'),
        prev: p ? num(p.avgScore, '—') : '—',
        delta: delta,
        gap: num(s.avgClassGap, '—')
      };
    });
  }
});
