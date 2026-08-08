// pages/trends/trends.js
const { get } = require('../../utils/request');
const { fail: failToast } = require('../../utils/toast');

// progress: 0→1 折线从底部生长（克制：缓出，无弹跳）
function drawLine(ctx, w, h, pts, progress) {
  if (progress == null) progress = 1;
  ctx.clearRect(0, 0, w, h);
  const padL = 42, padR = 16, padT = 18, padB = 46;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const all = [];
  pts.forEach(function (p) { all.push(p.total, p.classAvg, p.gradeAvg); });
  let min = Math.min.apply(null, all);
  let max = Math.max.apply(null, all);
  if (!isFinite(min) || !isFinite(max)) { min = 0; max = 100; }
  min = Math.floor(min - 10); if (min < 0) min = 0;
  max = Math.ceil(max + 10);

  const xAt = function (i) { return padL + (pts.length === 1 ? plotW / 2 : plotW * i / (pts.length - 1)); };
  const yAt = function (v) { return padT + plotH * (1 - (v - min) / (max - min)); };
  const yv = function (v) { return min + (v - min) * progress; };

  ctx.strokeStyle = '#D8D5CB';
  ctx.fillStyle = '#8B887E';
  ctx.lineWidth = 1;
  ctx.font = '10px sans-serif';
  const ticks = 4;
  let t;
  for (t = 0; t <= ticks; t++) {
    const v = min + (max - min) * t / ticks;
    const y = yAt(v);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillText(String(Math.round(v)), 4, y + 3);
  }

  const series = [
    { key: 'total', color: '#2E44FF', lw: 2.5 },
    { key: 'classAvg', color: '#1A1917', lw: 1.5 },
    { key: 'gradeAvg', color: '#8B887E', lw: 1.5 }
  ];
  series.forEach(function (s) {
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.lw;
    ctx.beginPath();
    pts.forEach(function (p, i) { const x = xAt(i), y = yAt(yv(p[s.key])); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke();
    pts.forEach(function (p, i) { const x = xAt(i), y = yAt(yv(p[s.key])); ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill(); });
  });

  ctx.fillStyle = '#8B887E'; ctx.font = '9px sans-serif';
  pts.forEach(function (p, i) {
    const x = xAt(i);
    let lbl = p.examName || ('#' + (i + 1));
    if (lbl.length > 5) lbl = lbl.slice(0, 5);
    ctx.fillText(lbl, x - 12, h - 22);
  });
}

Page({
  data: {
    trends: [],
    loading: false,
    ready: false
  },

  onShow: function () {
    this.load();
  },

  onReady: function () { this.setData({ ready: true }); },
  onHide: function () { this._cancelTrend(); },
  onUnload: function () { this._cancelTrend(); },

  onPullDownRefresh: function () {
    this.load(function () { wx.stopPullDownRefresh(); });
  },

  load: function (done) {
    const self = this;
    this.setData({ loading: true });
    get('/scores/me/trends')
      .then(function (r) { self.setData({ trends: r || [] }); self.drawLine(); })
      .catch(function () { self.setData({ trends: [] }); failToast('成绩趋势加载失败'); })
      .finally(function () { self.setData({ loading: false }); if (done) done(); });
  },

  _cancelTrend: function () {
    if (this._trendCanvas && this._trendRaf) {
      this._trendCanvas.cancelAnimationFrame(this._trendRaf);
      this._trendRaf = null;
    }
  },

  drawLine: function () {
    const self = this;
    const pts = this.data.trends.map(function (p) {
      return { examName: p.examName, total: p.totalScore, classAvg: p.classAvg, gradeAvg: p.gradeAvg };
    });
    if (pts.length === 0) return;
    this._cancelTrend();
    wx.createSelectorQuery().select('#lineCanvas').fields({ node: true, size: true }).exec(function (res) {
      if (!res || !res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio) || 2;
      canvas.width = res[0].width * dpr;
      canvas.height = res[0].height * dpr;
      ctx.scale(dpr, dpr);
      self._trendCanvas = canvas;
      const w = res[0].width, h = res[0].height;
      const dur = 500;
      const start = Date.now();
      const frame = function () {
        const t = Math.min((Date.now() - start) / dur, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        drawLine(ctx, w, h, pts, eased);
        if (t < 1) self._trendRaf = canvas.requestAnimationFrame(frame);
      };
      self._trendRaf = canvas.requestAnimationFrame(frame);
    });
  }
});
