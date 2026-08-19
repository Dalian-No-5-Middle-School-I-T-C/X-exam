// pages/trends/trends.js
const scoresService = require('../../services/scoresService');
const { normalizeTrends } = require('../../utils/response');
const share = require('../../growth/share');
const growthService = require('../../services/growthService');

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
    error: '',
    ready: false
  },

  onShow: function () {
    // 自动加载防抖：进行中或 5 秒内刚加载过则跳过；下拉刷新/点击重试不受限
    const now = Date.now();
    if (!this._loading && (!this._lastAutoLoad || now - this._lastAutoLoad > 5000)) {
      this._lastAutoLoad = now;
      this.load();
    }
  },

  onReady: function () {
    this.setData({ ready: true });
    share.enableShareMenu();
    // 兜底重绘：网络极快时 onShow 里的绘制可能早于 onReady
    this.drawLine();
  },
  onHide: function () { this._cancelTrend(); },
  onUnload: function () { this._cancelTrend(); },

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
    scoresService.fetchTrends()
      .then(function (r) {
        self.setData({ trends: normalizeTrends(r), error: '' });
        self.drawLine();
      })
      .catch(function (err) {
        // 失败与"没有数据"分开：错误态可点击重试
        self.setData({ trends: [], error: (err && err.message) || '加载失败，请重试' });
        self._lastAutoLoad = 0; // 失败后允许下次 onShow 立即重试
      })
      .finally(function () {
        self._loading = false;
        self.setData({ loading: false });
        if (typeof done === 'function') done();
      });
  },

  _cancelTrend: function () {
    if (this._trendCanvas && this._trendRaf) {
      this._trendCanvas.cancelAnimationFrame(this._trendRaf);
      this._trendRaf = null;
    }
  },

  onShareAppMessage: function () {
    growthService.onShareApp({ from: 'trends' });
    return share.makeShareAppMessage({ title: '我的成绩趋势', query: {} });
  },

  onShareTimeline: function () {
    growthService.onShareTimeline({ from: 'trends' });
    return share.makeShareTimeline({ title: 'Project-X 成绩趋势' });
  },

  drawLine: function () {
    const self = this;
    const pts = this.data.trends.map(function (p) {
      return { examName: p.examName, total: p.total, classAvg: p.classAvg, gradeAvg: p.gradeAvg };
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
