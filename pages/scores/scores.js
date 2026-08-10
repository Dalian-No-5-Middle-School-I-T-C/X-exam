// pages/scores/scores.js
const { get } = require('../../utils/request');
const { getCachedScores, setCachedScores } = require('../../utils/cache');
const { animateNumber } = require('../../utils/animate');
const { normalizeScores, toNum } = require('../../utils/response');

function byDateDesc(a, b) {
  return (b.graded_at || '').localeCompare(a.graded_at || '');
}
function round1(n) { return Math.round(n * 10) / 10; }

Page({
  data: {
    name: '',
    latest: null,
    latestChange: null,
    list: [],
    viewList: [],
    subjects: [],
    overview: null,
    keyword: '',
    subjectFilter: '',
    loading: false,
    fromCache: false,
    error: '',
    ready: false,
    heroScore: 0
  },

  onReady: function () {
    this.setData({ ready: true });
  },

  onHide: function () { if (this._cancelHero) { this._cancelHero(); this._cancelHero = null; } },
  onUnload: function () { if (this._cancelHero) { this._cancelHero(); this._cancelHero = null; } },

  onShow: function () {
    const cache = getCachedScores();
    if (cache) {
      this.applyData(cache, true);
    }
    // 自动刷新防抖：进行中或 5 秒内刚刷新过则跳过；下拉刷新不受限
    const now = Date.now();
    if (!this._refreshing && (!this._lastAutoRefresh || now - this._lastAutoRefresh > 5000)) {
      this._lastAutoRefresh = now;
      this.refresh();
    }
  },

  onPullDownRefresh: function () {
    this.refresh(function () { wx.stopPullDownRefresh(); });
  },

  applyData: function (resp, fromCache) {
    const data = normalizeScores(resp);
    const sorted = (data.scores || []).slice().sort(byDateDesc);
    const subjects = Array.from(new Set(sorted.map(function (s) { return s.subject; }).filter(function (x) { return x; })));
    let latestChange = null;
    if (sorted.length >= 2) {
      const a = sorted[0];
      const b = sorted[1];
      // 后端 /scores/me 暂不返回 full_score（归一化为 null）：
      // 必须双方非空且一致才比较，避免 150 分卷与 120 分卷误比
      if (a.subject && a.subject === b.subject && a.full_score != null && a.full_score === b.full_score) {
        latestChange = toNum(a.total_score) - toNum(b.total_score);
      }
    }
    this.setData({
      name: data.name || '',
      latest: sorted[0] || null,
      latestChange: latestChange,
      list: sorted,
      subjects: subjects,
      overview: this.computeOverview(sorted),
      fromCache: fromCache
    });
    this.recompute();
    this.animateHero(sorted[0] || null);
  },

  // hero 总分数字滚动：首次滚动，之后缓存/刷新直接赋值避免闪动
  animateHero: function (latest) {
    const target = latest && latest.total_score != null ? latest.total_score : 0;
    if (this._cancelHero) { this._cancelHero(); this._cancelHero = null; }
    if (!this._heroDone) {
      this._heroDone = true;
      const self = this;
      this.setData({ heroScore: 0 });
      this._cancelHero = animateNumber({
        from: 0, to: target, duration: 650,
        onUpdate: function (v) { self.setData({ heroScore: v }); }
      });
    } else {
      this.setData({ heroScore: target });
    }
  },

  // 汇总统计卡：考试次数 / 平均分 / 学科数 / 最佳最差单科（均基于 /me 列表本地计算）
  computeOverview: function (list) {
    if (!list || list.length === 0) return null;
    const total = list.reduce(function (s, x) { return s + toNum(x.total_score); }, 0);
    const avg = round1(total / list.length);
    const subs = new Set(list.map(function (s) { return s.subject; }).filter(function (x) { return x; })).size;
    const best = list.slice().sort(function (a, b) { return toNum(b.total_score) - toNum(a.total_score); })[0];
    const worst = list.slice().sort(function (a, b) { return toNum(a.total_score) - toNum(b.total_score); })[0];
    const label = function (e) { return (e.subject ? e.subject + ' ' : '') + (e.total_score != null ? e.total_score : '—'); };
    return {
      totalExams: list.length,
      avgScore: avg,
      subjectCount: subs,
      best: label(best),
      worst: label(worst)
    };
  },

  recompute: function () {
    const kw = (this.data.keyword || '').trim().toLowerCase();
    const sf = this.data.subjectFilter || '';
    let view = this.data.list;
    if (sf) view = view.filter(function (s) { return s.subject === sf; });
    if (kw) view = view.filter(function (s) {
      return (s.exam_name || '').toLowerCase().indexOf(kw) >= 0 ||
        (s.subject || '').toLowerCase().indexOf(kw) >= 0;
    });
    this.setData({ viewList: view });
  },

  refresh: function (done) {
    const self = this;
    if (this._refreshing) {
      if (typeof done === 'function') done();
      return;
    }
    this._refreshing = true;
    this.setData({ loading: true, error: '' });
    get('/scores/me')
      .then(function (resp) {
        const norm = normalizeScores(resp);
        self.applyData(norm, false);
        setCachedScores(norm);
        self.setData({ loading: false });
      })
      .catch(function (err) {
        // 失败后允许下次 onShow 立即重试（防抖窗口不阻断重试）
        self._lastAutoRefresh = 0;
        const cache = getCachedScores();
        if (cache) {
          self.setData({ loading: false, fromCache: true });
          wx.showToast({ title: '已显示缓存成绩', icon: 'none' });
        } else {
          self.setData({ loading: false, error: (err && err.message) || '加载失败' });
        }
      })
      .finally(function () {
        self._refreshing = false;
        if (done) done();
      });
  },

  onSearch: function (e) {
    this.setData({ keyword: e.detail.value });
    this.recompute();
  },

  onSubject: function (e) {
    const v = e.currentTarget.dataset.value;
    this.setData({ subjectFilter: this.data.subjectFilter === v ? '' : v });
    this.recompute();
  },

  goLatest: function () {
    const item = this.data.latest;
    if (!item) return;
    const name = item.exam_name ? encodeURIComponent(item.exam_name) : '';
    wx.navigateTo({ url: '/pages/detail/detail?examId=' + item.exam_id + '&name=' + name });
  },

  goLeaderboard: function () {
    const item = this.data.latest;
    if (!item) return;
    const name = item.exam_name ? encodeURIComponent(item.exam_name) : '';
    wx.navigateTo({ url: '/pages/leaderboard/leaderboard?examId=' + item.exam_id + '&name=' + name });
  },

  goDetail: function (e) {
    const id = e.detail.id;
    const item = this.data.viewList.filter(function (s) { return s.exam_id === id; })[0];
    const name = item ? encodeURIComponent(item.exam_name) : '';
    wx.navigateTo({ url: '/pages/detail/detail?examId=' + id + '&name=' + name });
  },

  goSubjects: function () {
    wx.navigateTo({ url: '/pages/subjects/subjects' });
  },

  goSemester: function () {
    wx.navigateTo({ url: '/pages/semester/semester' });
  }
});
