// pages/trends/trends.js
// 分析页：成绩走势折线 + 学科对比（雷达 / 明细 / 差距柱）。
// 两个数据源各自加载、各自出错，任一接口失败只影响自己那一段，不清空另一段。
const scoresService = require('../../services/scoresService');
const { normalizeTrends, normalizeSubjects, toNum } = require('../../utils/response');
const { getUser } = require('../../utils/auth');
const share = require('../../growth/share');
const growthService = require('../../services/growthService');

// 数值容错：响应中的字符串数字也参与绘图
function val(v) { return toNum(v, 0); }

function errMsg(err) { return (err && err.message) || '加载失败，请重试'; }

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
    // 以数据点为中心绘制并钳制在画布内，避免多点时标签越界/重叠出界
    const lx = Math.min(Math.max(x, 20), w - 20);
    ctx.textAlign = 'center';
    ctx.fillText(lbl, lx, h - 22);
  });
  ctx.textAlign = 'left';
}

// 雷达图：我的均分 vs 班级均分；progress 0→1 多边形从中心展开
function drawRadar(ctx, w, h, labels, myData, classData, axisMin, axisMax, progress) {
  if (progress == null) progress = 1;
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2 + 6;
  const R = Math.min(w, h) / 2 - 46;
  const N = labels.length;
  if (N < 3) return;
  const span = axisMax - axisMin || 1;
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
      const rr = R * Math.max(0, Math.min(1, (val(data[idx]) - axisMin) / span)) * progress;
      const x = cx + rr * Math.cos(a);
      const y = cy + rr * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke();
    for (let i = 0; i < N; i++) {
      const a = angle(i);
      const rr = R * Math.max(0, Math.min(1, (val(data[i]) - axisMin) / span)) * progress;
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
  ctx.fillStyle = '#8B887E'; ctx.font = '9px sans-serif';
  items.forEach(function (it, i) {
    const v = val(it.gapToClass);
    const x = padL + gap * i + (gap - bw) / 2;
    const yTop = yAt(v), yZero = yAt(0);
    const hgt = Math.abs(yTop - yZero) * progress;
    const top = v >= 0 ? (yZero - hgt) : yZero;
    const finalTop = Math.min(yTop, yZero);
    ctx.fillStyle = v >= 0 ? '#2E44FF' : '#C00F28';
    ctx.fillRect(x, top, bw, hgt);
    ctx.textAlign = 'center';
    let s = it.subject || ''; if (s.length > 4) s = s.slice(0, 4);
    ctx.fillText(s, x + bw / 2, h - 22);
    // 数值标签居中于柱子，保留 1 位小数避免长小数溢出
    ctx.fillText((Math.round(v * 10) / 10).toFixed(1), x + bw / 2, finalTop - 4);
  });
  ctx.textAlign = 'left';
}

function setupCanvas(canvas, ctx, w, h) {
  const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio) || 2;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
}

Page({
  data: {
    trends: [],
    subjects: [],
    weakSubject: '',
    totalExams: 0,
    loading: false,
    error: '',
    subjectsError: '',
    posterMounted: false,
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
    this.drawSubjects();
  },
  onHide: function () { this._cancelAll(); },
  onUnload: function () { this._cancelAll(); },

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
    this._pending = 2;
    this.setData({ loading: true });
    // 两个请求都回来才算加载结束：先回来的不能提前关掉 loading，否则下拉刷新会早停
    const settle = function () {
      self._pending -= 1;
      if (self._pending > 0) return;
      self._loading = false;
      self.setData({ loading: false });
      if (typeof done === 'function') done();
    };
    this.loadTrends(settle);
    this.loadSubjects(settle);
  },

  loadTrends: function (settle) {
    const self = this;
    scoresService.fetchTrends()
      .then(function (r) {
        self.setData({ trends: normalizeTrends(r), error: '' });
        self.drawLine();
      })
      .catch(function (err) {
        // 失败与"没有数据"分开：错误态可点击重试；学科对比段不受影响
        self._lastAutoLoad = 0;
        self.setData({ trends: [], error: errMsg(err) });
      })
      .finally(settle);
  },

  loadSubjects: function (settle) {
    const self = this;
    scoresService.fetchSubjectComparison()
      .then(function (r) {
        const d = normalizeSubjects(r);
        // 差距值统一保留 1 位小数，避免表格/图表出现长小数
        const subjects = (d.subjects || []).map(function (s) {
          if (s.gapToClass != null) s.gapToClass = Math.round(val(s.gapToClass) * 10) / 10;
          return s;
        });
        self.setData({
          subjects: subjects,
          weakSubject: d.weakSubject || '',
          totalExams: d.totalExams || 0,
          subjectsError: ''
        });
        self.drawSubjects();
      })
      .catch(function (err) {
        self._lastAutoLoad = 0;
        self.setData({
          subjects: [],
          weakSubject: '',
          totalExams: 0,
          subjectsError: errMsg(err)
        });
      })
      .finally(settle);
  },

  // 重试按钮入口：wxml bindtap 会把事件对象当首参传入，这里包一层保证 load(done) 契约干净
  onRetry: function () { this.load(); },

  // 一键转发：组装学科对比模型交给分享组件生成图片
  onShare: function () {
    if (this.data.loading || this.data.subjectsError || this.data.subjects.length === 0) return;
    const user = getUser();
    const model = {
      type: 'subjects',
      studentName: user && (user.name || '') || '',
      subjects: this.data.subjects || [],
      weakSubject: this.data.weakSubject || '',
      totalExams: this.data.totalExams || 0
    };
    this._posterModel = model;
    // 海报组件开了用时注入：先挂载，等 ready 换掉占位组件后才拿得到 open()
    if (this.data.posterMounted) this._openPoster();
    else this.setData({ posterMounted: true });
  },

  onPosterReady: function () { this._openPoster(); },

  _openPoster: function () {
    const el = this.selectComponent('#poster');
    // 仍是占位组件时拿不到 open()，交给随后的 ready 事件
    if (!el || !el.open || !this._posterModel) return;
    el.open(this._posterModel);
    this._posterModel = null;
  },

  onShareAppMessage: function () {
    // from 沿用 'trends'：埋点标识是历史数据的口径，页面改名不动它
    growthService.onShareApp({ from: 'trends' });
    return share.makeShareAppMessage({ title: '我的成绩分析', query: {} });
  },

  onShareTimeline: function () {
    growthService.onShareTimeline({ from: 'trends' });
    return share.makeShareTimeline({ title: 'Project-X 成绩分析' });
  },

  _cancelAll: function () {
    this._cancel('_trendCanvas', '_trendRaf');
    this._cancel('_radarCanvas', '_radarRaf');
    this._cancel('_barCanvas', '_barRaf');
  },

  // 只取消本图自己的上一轮动画：三张图分属两段数据，重绘雷达不该掐断折线的动画
  _cancel: function (canvasKey, rafKey) {
    const canvas = this[canvasKey];
    if (canvas && this[rafKey]) canvas.cancelAnimationFrame(this[rafKey]);
    this[rafKey] = null;
    this[canvasKey] = null;
  },

  _queryCanvas: function (sel, cb) {
    wx.createSelectorQuery().select(sel).fields({ node: true, size: true }).exec(function (res) {
      if (!res || !res[0] || !res[0].node) return;
      const w = res[0].width, h = res[0].height;
      // 画布尚未插入渲染树或页面隐藏时尺寸可能为 0，缩放后绘制只会得到负坐标图形
      if (!w || !h) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      setupCanvas(canvas, ctx, w, h);
      cb(canvas, ctx, w, h);
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

  drawLine: function () {
    const self = this;
    const pts = this.data.trends.map(function (p) {
      return { examName: p.examName, total: p.total, classAvg: p.classAvg, gradeAvg: p.gradeAvg };
    });
    if (pts.length === 0) return;
    this._cancel('_trendCanvas', '_trendRaf');
    this._queryCanvas('#lineCanvas', function (canvas, ctx, w, h) {
      self._trendCanvas = canvas;
      self._animate(canvas, '_trendRaf', function (p) {
        drawLine(ctx, w, h, pts, p);
      });
    });
  },

  drawSubjects: function () {
    const self = this;
    const arr = this.data.subjects || [];
    if (arr.length === 0) return;
    const labels = arr.map(function (s) { return s.subject; });
    const myData = arr.map(function (s) { return val(s.avgScore); });
    const classData = arr.map(function (s) { return val(s.avgClassAvg); });
    const vals = myData.concat(classData);
    let axisMin = Math.floor(Math.min.apply(null, vals.concat(0)) / 10) * 10;
    let axisMax = Math.ceil(Math.max.apply(null, vals.concat(0)) / 10) * 10;
    if (axisMin < 0) axisMin = 0;
    if (axisMax - axisMin < 20) axisMax = axisMin + 20;
    this._cancel('_radarCanvas', '_radarRaf');
    this._cancel('_barCanvas', '_barRaf');

    if (arr.length >= 3) {
      this._queryCanvas('#radarCanvas', function (canvas, ctx, w, h) {
        self._radarCanvas = canvas;
        self._animate(canvas, '_radarRaf', function (p) {
          drawRadar(ctx, w, h, labels, myData, classData, axisMin, axisMax, p);
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
