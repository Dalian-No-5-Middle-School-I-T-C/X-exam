// pages/t-exams/t-exams.js
// 教师工作台首屏：本人可见的考试列表（数据范围由后端 getVisibleExamIds 决定，前端不自行放大）。
const teacherService = require('../../services/teacherService');
const role = require('../../utils/role');
const { normalizeExamList } = require('../../utils/analysis');

function byDateDesc(a, b) {
  return (b.examDate || '').localeCompare(a.examDate || '');
}

Page({
  data: {
    list: [],
    viewList: [],
    subjects: [],
    subjectFilter: '',
    keyword: '',
    stats: null,
    loading: false,
    error: '',
    ready: false
  },

  onLoad: function () {
    if (!role.guardWorkspace()) return;
    this.load();
  },

  onReady: function () { this.setData({ ready: true }); },

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
    teacherService.fetchExams()
      .then(function (resp) {
        const list = normalizeExamList(resp).sort(byDateDesc);
        self.setData({
          list: list,
          subjects: Array.from(new Set(list.map(function (e) { return e.subject; }).filter(Boolean))),
          loading: false
        });
        self.computeStats();
        self.recompute();
      })
      .catch(function (err) {
        self.setData({ loading: false, list: [], viewList: [], error: (err && err.message) || '加载失败' });
      })
      .finally(function () {
        self._loading = false;
        if (typeof done === 'function') done();
      });
  },

  // 顶部汇总：全部按本地列表统计，公布状态取后端 score_published，不做任何推断
  computeStats: function () {
    const list = this.data.list;
    if (list.length === 0) { this.setData({ stats: null }); return; }
    const published = list.filter(function (e) { return e.publishState === 1; }).length;
    const graded = list.filter(function (e) { return e.gradedCount > 0; }).length;
    this.setData({
      stats: { exams: list.length, published: published, graded: graded }
    });
  },

  recompute: function () {
    const kw = (this.data.keyword || '').trim().toLowerCase();
    const sf = this.data.subjectFilter || '';
    let view = this.data.list;
    if (sf) view = view.filter(function (e) { return e.subject === sf; });
    if (kw) view = view.filter(function (e) {
      return (e.name || '').toLowerCase().indexOf(kw) >= 0 ||
        (e.subject || '').toLowerCase().indexOf(kw) >= 0;
    });
    this.setData({ viewList: view });
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

  goAnalysis: function (e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.viewList.filter(function (x) { return x.examId === id; })[0];
    if (!item) return;
    const name = item.name ? encodeURIComponent(item.name) : '';
    wx.navigateTo({
      url: '/pages/t-analysis/t-analysis?examId=' + item.examId + '&name=' + name
    });
  },

  // 本页不在 tabBar 名单里（避免学生端多出用不了的一栏），故自己提供回「我的」的入口
  goProfile: function () {
    wx.switchTab({ url: '/pages/profile/profile' });
  }
});
