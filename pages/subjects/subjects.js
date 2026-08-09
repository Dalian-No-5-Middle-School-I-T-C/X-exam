// pages/subjects/subjects.js
const { get } = require('../../utils/request');
const { fail: failToast } = require('../../utils/toast');
const { normalizeSubjects, toNum } = require('../../utils/response');

// 数值容错：响应中的字符串数字也参与绘图
function val(v) { return toNum(v, 0); }

// 雷达图：我的均分 vs 班级均分；progress 0→1 多边形从中心展开
function drawRadar(ctx, w, h, labels, myData, classData, axisMax, progress) {
  if (progress == null) progress = 1;
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2 + 6;
  const R = Math.min(w, h) / 2 - 46;
  const N = labels.length;
  if (N < 3) return;
  const angle = function (i) { return -Math.PI / 2 + i * 2 * Math.PI / N; };

  const rings = 4;
  ctx.strokeStyle = '#D8D5CB';
  ctx.lineWidth = 1;
  for (let r = 1; r <= rings; r++) {
    const rr = R * r / rings;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const a = angle(i % N);
      const x = cx + rr * Math.cos(a);
      const y = cy + rr * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.fillStyle = '#8B887E';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < N; i++) {
    const a = angle(i);
    const x = cx + R * Math.cos(a);
    const y = cy + R * Math.sin(a);
    ctx.strokeStyle = '#D8D5CB';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
    const lx = cx + (R + 18) * Math.cos(a);
    const ly = cy + (R + 18) * Math.sin(a);
    let lab = labels[i] || '';
    if (lab.length > 4) lab = lab.slice(0, 4);
    ctx.fillText(lab, lx, ly);
  }

  const poly = function (data, stroke, fill) {
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const idx = i % N;
      const a = angle(idx);
      const rr = R * (val(data[idx]) / axisMax) * progress;
      const x = cx + rr * Math.cos(a);
      const y = cy + rr * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke();
    for (let i = 0; i < N; i++) {
      const a = angle(i);
      const rr = R * (val(data[i]) / axisMax) * progress;
      ctx.beginPath();
      ctx.arc(cx + rr * Math.cos(a), cy + rr * Math.sin(a), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = stroke; ctx.fill();
    }
  };
  poly(classData, '#8B887E', 'rgba(139,136,126,0.12)');
  poly(myData, '#2E44FF', 'rgba(46,68,255,0.12)');
}

// 与班级均分差距柱状图；progress 0→1 柱子从基线升起
function drawBar(ctx, w, h, items, progress) {
  if (progress == null) progress = 1;
  ctx.clearRect(0, 0, w, h);
  const padL = 42, padR = 16, padT = 18, padB = 46;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const vals = items.map(function (it) { return val(it.gapToClass); });
  if (vals.length === 0) return;
  const absMax = Math.max(Math.abs(Math.max.apply(null, vals.concat(0))), Math.abs(Math.min.apply(null, vals.concat(0))), 1);
  const yAt = function (v) { return padT + plotH * (1 - (v + absMax) / (absMax * 2)); };
  ctx.strokeStyle = '#D8D5CB'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padL, yAt(0)); ctx.lineTo(w - padR, yAt(0)); ctx.stroke();
  const n = items.length;
  const gap = plotW / n;
  const bw = gap * 0.6;
  items.forEach(function (it, i) {
    const v = val(it.gapToClass);
    const x = padL + gap * i + (gap - bw) / 2;
    const yTop = yAt(v), yZero = yAt(0);
    const hgt = Math.abs(yTop - yZero) * progress;
    const top = v >= 0 ? (yZero - hgt) : yZero;
    const finalTop = Math.min(yTop, yZero);
    ctx.fillStyle = v >= 0 ? '#2E44FF' : '#C00F28';
    ctx.fillRect(x, top, bw, hgt);
    ctx.fillStyle = '#8B887E'; ctx.font = '9px sans-serif';
    let s = it.subject || ''; if (s.length > 4) s = s.slice(0, 4);
    ctx.fillText(s, x, h - 22);
    ctx.fillText(String(v), x, finalTop - 4);
  });
}

function setupCanvas(canvas, ctx, w, h) {
  const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio) || 2;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
}

Page({
  data: {
    loading: false,
    error: '',
    subjects: [],
    weakSubject: '',
    totalExams: 0,
    ready: false
  },

  onShow: function () { this.load(); },

  onReady: function () {
    this.setData({ ready: true });
    // 兜底重绘：网络极快时 onShow 里的绘制可能早于 onReady
    this.drawAll();
  },
  onHide: function () { this._cancelAll(); },
  onUnload: function () { this._cancelAll(); },

  onPullDownRefresh: function () {
    this.load(function () { wx.stopPullDownRefresh(); });
  },

  load: function (done) {
    const self = this;
    this.setData({ loading: true, error: '' });
    get('/scores/me/subject-comparison')
      .then(function (r) {
        const d = normalizeSubjects(r);
        self.setData({
          subjects: d.subjects || [],
          weakSubject: d.weakSubject || '',
          totalExams: d.totalExams || 0,
          loading: false,
          error: ''
        });
        self.drawAll();
      })
      .catch(function (err) {
        // 失败与“没有数据”分开：错误态可点击重试
        self.setData({
          subjects: [],
          weakSubject: '',
          totalExams: 0,
          loading: false,
          error: (err && err.message) || '加载失败，请重试'
        });
        failToast('学科对比加载失败');
      })
      .finally(function () { if (typeof done === 'function') done(); });
  },

  _queryCanvas: function (sel, cb) {
    wx.createSelectorQuery().select(sel).fields({ node: true, size: true }).exec(function (res) {
      if (res && res[0] && res[0].node) {
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        setupCanvas(canvas, ctx, res[0].width, res[0].height);
        cb(canvas, ctx, res[0].width, res[0].height);
      }
    });
  },

  _animate: function (canvas, rafKey, draw) {
    const self = this;
    const dur = 500;
    const start = Date.now();
    const frame = function () {
      const t = Math.min((Date.now() - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      draw(eased);
      if (t < 1) self[rafKey] = canvas.requestAnimationFrame(frame);
    };
    this[rafKey] = canvas.requestAnimationFrame(frame);
  },

  _cancelAll: function () {
    if (this._radarCanvas && this._radarRaf) { this._radarCanvas.cancelAnimationFrame(this._radarRaf); this._radarRaf = null; }
    if (this._barCanvas && this._barRaf) { this._barCanvas.cancelAnimationFrame(this._barRaf); this._barRaf = null; }
  },

  drawAll: function () {
    const self = this;
    const arr = this.data.subjects || [];
    if (arr.length === 0) return;
    const labels = arr.map(function (s) { return s.subject; });
    const myData = arr.map(function (s) { return val(s.avgScore); });
    const classData = arr.map(function (s) { return val(s.avgClassAvg); });
    let maxVal = 100;
    myData.concat(classData).forEach(function (v) { if (v > maxVal) maxVal = v; });
    const axisMax = Math.ceil(maxVal / 10) * 10;
    this._cancelAll();

    if (arr.length >= 3) {
      this._queryCanvas('#radarCanvas', function (canvas, ctx, w, h) {
        self._radarCanvas = canvas;
        self._animate(canvas, '_radarRaf', function (p) {
          drawRadar(ctx, w, h, labels, myData, classData, axisMax, p);
        });
      });
    }

    this._queryCanvas('#barCanvas', function (canvas, ctx, w, h) {
      self._barCanvas = canvas;
      self._animate(canvas, '_barRaf', function (p) {
        drawBar(ctx, w, h, arr, p);
      });
    });
  }
});
