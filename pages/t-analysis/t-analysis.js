// pages/t-analysis/t-analysis.js
// 单场考试分析：概况 / 小题得分率 / 分布与指标 / 知识点。四个页签各自持有加载态，
// 任一接口失败只影响本页签；数据范围与查看权限由后端 requireExamAccess + can_view_charts 决定。
const teacherService = require('../../services/teacherService');
const role = require('../../utils/role');
const analysis = require('../../utils/analysis');

const TABS = [
  { key: 'overview', label: '概况' },
  { key: 'question', label: '小题得分率' },
  { key: 'dist', label: '分布与指标' },
  { key: 'knowledge', label: '知识点' }
];

const pct = analysis.pct;
const fix = analysis.fix;

// 后端 403 自带可读文案，网络失败（status 0）时给通用提示
function failText(err) {
  if (!err) return '加载失败';
  if (err.status === 0) return '网络异常，请检查连接后重试';
  return err.message || '加载失败';
}

// 题号必须是有限正数才能下钻：question-students 接口对 questionNumber 做 Number() 校验，
// 非数字题号（如 "12(1)"）会被后端判为 400，这类条目只展示不给入口。
function drillable(no) {
  var n = Number(no);
  return no !== '' && isFinite(n) && n > 0;
}

function decorateQuestion(q) {
  return {
    questionNumber: q.questionNumber,
    questionType: q.questionType || '—',
    rateText: pct(q.scoreRate),
    barWidth: q.scoreRate === null ? 0 : Math.max(0, Math.min(100, Math.round(q.scoreRate))),
    scoreText: (q.avgScore === null ? '—' : fix(q.avgScore, 1)) + ' / ' + (q.maxScore === null ? '—' : fix(q.maxScore, 1)),
    // 主观题 / 无标准答案时为 null，此时不显示正确率而不是显示 0%
    correctRateText: q.correctRate === null ? '' : pct(q.correctRate),
    // 后端口径：客观题 errorCount 是「未满分」人数，主观题是「低于低分线」人数
    errorLabel: q.questionType === '主观' ? '低分' : '未满分',
    difficultyText: fix(q.difficulty, 2),
    discriminationText: fix(q.discrimination, 2),
    errorCount: q.errorCount,
    totalCount: q.totalCount,
    errorLevel: q.errorRateLevel,
    knowledgePoint: q.knowledgePoint || '',
    canDrill: drillable(q.questionNumber)
  };
}

function byRateAsc(a, b) {
  if (a.scoreRate === null && b.scoreRate === null) return 0;
  if (a.scoreRate === null) return 1;
  if (b.scoreRate === null) return -1;
  return a.scoreRate - b.scoreRate;
}
function byDiscAsc(a, b) {
  if (a.discrimination === null && b.discrimination === null) return 0;
  if (a.discrimination === null) return 1;
  if (b.discrimination === null) return -1;
  return a.discrimination - b.discrimination;
}
function byNumber(a, b) {
  return (Number(a.questionNumber) || 0) - (Number(b.questionNumber) || 0);
}

function setupCanvas(canvas, ctx, w, h) {
  const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio) || 2;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
}

function drawHistogram(ctx, w, h, bins, accent) {
  ctx.clearRect(0, 0, w, h);
  const padL = 10, padR = 10, padT = 22, padB = 34;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const maxCount = bins.reduce(function (m, b) { return Math.max(m, b.count); }, 0);
  if (maxCount <= 0 || innerW <= 0 || innerH <= 0) return;

  const slot = innerW / bins.length;
  const bw = Math.max(4, slot * 0.62);
  ctx.textAlign = 'center';
  bins.forEach(function (b, i) {
    const bh = (b.count / maxCount) * innerH;
    const x = padL + i * slot + (slot - bw) / 2;
    const y = padT + innerH - bh;
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = '#8B887E';
    ctx.font = '9px monospace';
    // 桶数多时隔位标注，避免段宽小于文字宽度互相压字
    if (bins.length <= 8 || i % 2 === 0) ctx.fillText(b.range || '', x + bw / 2, h - 12);
    if (b.count > 0) {
      ctx.fillStyle = '#1A1917';
      ctx.font = '10px monospace';
      ctx.fillText(String(b.count), x + bw / 2, y - 4);
    }
  });
  ctx.strokeStyle = '#D8D5CB';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT + innerH + 0.5);
  ctx.lineTo(w - padR, padT + innerH + 0.5);
  ctx.stroke();
  ctx.textAlign = 'left';
}

Page({
  data: {
    examId: '',
    examName: '',
    invalid: false,
    tabs: TABS,
    tab: 'overview',
    classOptions: [{ className: '全部班级', classId: null }],
    classId: '',
    classIndex: 0,
    classLabel: '全部班级',
    ready: false,
    ov: null,
    ovText: null,
    prev: null,
    ovError: '',
    questions: [],
    qSort: 'rate',
    qError: '',
    metrics: null,
    metricsError: '',
    knowledge: [],
    kpError: '',
    loading: false
  },

  onLoad: function (options) {
    if (!role.guardWorkspace()) return;
    this._loaded = {};
    const id = options && options.examId ? String(options.examId) : '';
    // 只接受纯数字考试编号：非法值不发请求，避免拼出空路径打到别的接口上
    if (!/^\d+$/.test(id)) {
      this.setData({ invalid: true });
      return;
    }
    this.setData({
      examId: id,
      examName: options && options.name ? decodeURIComponent(options.name) : ''
    });
    this.loadClasses();
    this.loadTab('overview');
  },

  onReady: function () {
    this.setData({ ready: true });
    if (this.data.tab === 'dist') this.drawLine();
  },
  onHide: function () { this._cancel('_histCanvas', '_histRaf'); },
  onUnload: function () { this._cancel('_histCanvas', '_histRaf'); },

  onPullDownRefresh: function () {
    const tab = this.data.tab;
    this._loaded[tab] = false;
    // 分布直方图取的是 overview 的分数段，刷新该页签时也要重取概况
    if (tab === 'overview' || tab === 'dist') this._loaded.overview = false;
    this.loadClasses();
    this.loadTab(tab, function () { wx.stopPullDownRefresh(); });
  },

  loadClasses: function (done) {
    const self = this;
    teacherService.fetchClasses(this.data.examId)
      .then(function (resp) {
        const classes = analysis.normalizeClasses(resp);
        self.setData({
          // picker 第 0 项固定为「全部班级」，其余按下标对应后端 classId
          classOptions: [{ className: '全部班级', classId: null }].concat(classes)
        });
      })
      .catch(function () { /* 班级筛选是增强项：失败时保持「全部班级」，不打断主内容 */ })
      .then(function () { if (typeof done === 'function') done(); });
  },

  switchTab: function (e) {
    const tab = e.currentTarget.dataset.key;
    if (tab === this.data.tab) return;
    const self = this;
    // 画布要等本帧渲染完成后才拿得到节点，故在 setData 回调里重绘
    this.setData({ tab: tab }, function () {
      if (tab === 'dist') self.drawLine();
    });
    this.loadTab(tab);
  },

  // 页签数据只在首次进入或显式刷新时请求，切班级则重取当前页签
  loadTab: function (tab, done) {
    if (tab === 'overview') return this.loadOverview(done);
    if (tab === 'question') return this.loadQuestions(this.data.classId, done);
    if (tab === 'dist') {
      this.loadOverview();
      return this.loadDist(done);
    }
    if (tab === 'knowledge') return this.loadKnowledge(this.data.classId, done);
    if (typeof done === 'function') done();
  },

  onRetry: function () {
    this._loaded[this.data.tab] = false;
    this.loadTab(this.data.tab);
  },

  onClassChange: function (e) {
    const idx = Number(e.detail.value);
    const picked = this.data.classOptions[idx];
    if (!picked) return;
    this.setData({
      classIndex: idx,
      classId: picked.classId === null || picked.classId === undefined ? '' : String(picked.classId),
      classLabel: picked.className || '全部班级'
    });
    this._loaded.overview = false;
    this._loaded.question = false;
    this._loaded.dist = false;
    this._loaded.knowledge = false;
    this.loadTab(this.data.tab);
  },

  // 概况与分布共用一次 overview，故 classId 变化时两处都要重取
  loadOverview: function (done) {
    const self = this;
    if (this._loaded.overview) {
      if (typeof done === 'function') done();
      return;
    }
    this._loaded.overview = true;
    this.setData({ loading: true, ovError: '' });
    const cid = this.data.classId || undefined;
    Promise.all([
      teacherService.fetchOverview(this.data.examId, cid),
      teacherService.fetchPrevious(this.data.examId, cid)
    ]).then(function (res) {
      const ov = analysis.normalizeOverview(res[0]);
      // 后端在「满分不可知」（历史考试无答题卡也无逐题满分）时把及格率/优秀率/分数线一律置 0 作占位，
      // 那不代表真实 0%，故这里按 fullScore 是否已知决定显示数值还是「—」。
      const scoreKnown = ov.fullScore !== null && ov.fullScore > 0;
      self.setData({
        loading: false,
        ov: ov,
        ovText: {
          avg: fix(ov.avgScore, 1),
          full: scoreKnown ? fix(ov.fullScore, 0) : '—',
          passRate: scoreKnown ? pct(ov.passRate) : '—',
          excellentRate: scoreKnown ? pct(ov.excellentRate) : '—',
          stdDev: fix(ov.stdDev, 1),
          max: fix(ov.maxScore, 1),
          min: fix(ov.minScore, 1),
          median: ov.summary ? fix(ov.summary.median, 1) : '—',
          q1: ov.summary ? fix(ov.summary.q1, 1) : '—',
          q3: ov.summary ? fix(ov.summary.q3, 1) : '—'
        },
        prev: analysis.normalizePrevious(res[1])
      });
      if (self.data.tab === 'dist') self.drawLine();
    }).catch(function (err) {
      self._loaded.overview = false;
      self.setData({ loading: false, ov: null, ovText: null, prev: null, ovError: failText(err) });
    }).then(function () {
      if (typeof done === 'function') done();
    });
  },

  loadQuestions: function (classId, done) {
    const self = this;
    if (this._loaded.question) {
      if (typeof done === 'function') done();
      return;
    }
    this._loaded.question = true;
    this.setData({ loading: true, qError: '' });
    teacherService.fetchQuestions(this.data.examId, classId || undefined)
      .then(function (resp) {
        self._questions = analysis.normalizeQuestionStats(resp);
        self.setData({ loading: false, questions: self.applySort() });
      })
      .catch(function (err) {
        self._loaded.question = false;
        self.setData({ loading: false, questions: [], qError: failText(err) });
      })
      .then(function () { if (typeof done === 'function') done(); });
  },

  // sortKey 显式传入：setData 之前 this.data.qSort 仍是旧值，直接读会把排序吞掉
  applySort: function (sortKey) {
    const raw = this._questions || [];
    const sorted = raw.slice();
    const key = sortKey || this.data.qSort;
    if (key === 'disc') sorted.sort(byDiscAsc);
    else if (key === 'no') sorted.sort(byNumber);
    else sorted.sort(byRateAsc);
    return sorted.map(decorateQuestion);
  },

  onSort: function (e) {
    const v = e.currentTarget.dataset.value;
    if (v === this.data.qSort) return;
    this.setData({ qSort: v, questions: this.applySort(v) });
  },

  goQuestion: function (e) {
    const no = e.currentTarget.dataset.no;
    if (!drillable(no)) return;
    wx.navigateTo({
      url: '/pages/t-question/t-question?examId=' + this.data.examId
        + '&questionNumber=' + encodeURIComponent(no)
        + '&classId=' + encodeURIComponent(this.data.classId)
        + '&name=' + encodeURIComponent(this.data.examName || '')
    });
  },

  loadDist: function (done) {
    const self = this;
    if (this._loaded.dist) {
      this.drawLine();
      if (typeof done === 'function') done();
      return;
    }
    this._loaded.dist = true;
    this.setData({ loading: true, metricsError: '' });
    teacherService.fetchMetrics(this.data.examId, this.data.classId || undefined)
      .then(function (resp) {
        const m = analysis.normalizeMetrics(resp);
        self.setData({
          loading: false,
          metrics: {
            difficulty: fix(m.difficulty, 2),
            discrimination: fix(m.discrimination, 2),
            reliability: m.reliability === null ? '—' : fix(m.reliability, 3),
            cv: m.cv === null ? '—' : fix(m.cv, 3),
            gradedCount: m.gradedCount
          }
        });
        self.drawLine();
      })
      .catch(function (err) {
        self._loaded.dist = false;
        self.setData({ loading: false, metrics: null, metricsError: failText(err) });
      })
      .then(function () { if (typeof done === 'function') done(); });
  },

  loadKnowledge: function (classId, done) {
    const self = this;
    if (this._loaded.knowledge) {
      if (typeof done === 'function') done();
      return;
    }
    this._loaded.knowledge = true;
    this.setData({ loading: true, kpError: '' });
    // 后端知识点接口用 `if (classId)` 判筛选，classId=0（未知班级）会被当成不筛选，
    // 这里同样不传并给出提示，避免老师以为看到的是那个班的数据
    const kpClassId = classId && classId !== '0' ? classId : undefined;
    teacherService.fetchKnowledge(this.data.examId, kpClassId)
      .then(function (resp) {
        // 后端已按「薄弱程度 → 得分率升序」排好，前端不再重排以免打乱该口径
        const list = analysis.normalizeKnowledge(resp).map(function (k, i) {
          return {
            // 知识点名可能为空并回落到「未标注」，故列表键用下标而不是 pointText
            uid: i,
            pointText: k.pointText || '未标注',
            questionNumbers: k.questionNumbers || '—',
            rateText: pct(k.avgRate),
            barWidth: k.avgRate === null ? 0 : Math.max(0, Math.min(100, Math.round(k.avgRate))),
            difficultyText: fix(k.difficulty, 2),
            discriminationText: fix(k.discrimination, 2),
            studentCount: k.studentCount,
            totalQuestions: k.totalQuestions,
            coverageText: pct(k.coverageRate),
            severity: k.severity,
            severityClass: k.severity === 'common_weak' ? 'b-red' : (k.severity === 'weak' ? 'b-warn' : 'b-gray')
          };
        });
        self.setData({ loading: false, knowledge: list });
      })
      .catch(function (err) {
        self._loaded.knowledge = false;
        self.setData({ loading: false, knowledge: [], kpError: failText(err) });
      })
      .then(function () { if (typeof done === 'function') done(); });
  },

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
      if (!w || !h) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      setupCanvas(canvas, ctx, w, h);
      cb(canvas, ctx, w, h);
    });
  },

  drawLine: function () {
    const self = this;
    const ov = this.data.ov;
    if (!ov || ov.distribution.length === 0) return;
    this._cancel('_histCanvas', '_histRaf');
    this._queryCanvas('#histCanvas', function (canvas, ctx, w, h) {
      self._histCanvas = canvas;
      const bins = ov.distribution;
      const dur = 420;
      const start = Date.now();
      const frame = function () {
        const t = Math.min((Date.now() - start) / dur, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        ctx.clearRect(0, 0, w, h);
        drawHistogram(ctx, w, h, bins.map(function (b) {
          return { range: b.range, count: Math.round(b.count * eased) };
        }), '#2E44FF');
        if (t < 1) self._histRaf = canvas.requestAnimationFrame(frame);
      };
      self._histRaf = canvas.requestAnimationFrame(frame);
    });
  },

  goRanking: function () {
    wx.navigateTo({ url: '/pages/t-ranking/t-ranking?examId=' + this.data.examId });
  },
  goClasses: function () {
    wx.navigateTo({ url: '/pages/t-classes/t-classes?examId=' + this.data.examId });
  }
});
