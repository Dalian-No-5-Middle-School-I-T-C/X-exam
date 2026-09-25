// pages/exam-paper/exam-paper.js
// 学生端「查看原卷 / 查看答案解析」：原卷图片在前，每张图下按题号渲染教师保存的答案文字，
// 再展示本人作答图块（先看卷、再看作答）。答案只出文字，不判对错。
const examPaperService = require('../../services/examPaperService');
const { normalizePaper, decorate } = require('../../utils/examPaper');

Page({
  data: {
    examId: 0,
    examName: '',
    subject: '',
    loading: false,
    error: '',
    ready: false,
    pages: [],
    blocks: [],
    rows: [],
    hasOriginalPaper: true,
    imagesUnavailable: false
  },

  onLoad: function (options) {
    const examId = parseInt(options && options.examId, 10) || 0;
    if (!examId) {
      this.setData({ error: '参数缺失，无法加载原卷' });
      return;
    }
    const examName = options.name ? decodeURIComponent(options.name) : '';
    this.setData({ examId: examId, examName: examName });
    this.load();
  },

  onReady: function () { this.setData({ ready: true }); },

  onUnload: function () {
    this._destroyed = true;
    if (this._download) this._download.cancel();
  },

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
    examPaperService.fetchPaper(this.data.examId)
      .then(function (resp) {
        const paper = normalizePaper(resp);
        if (self._destroyed) return;
        self.setData({
          examName: self.data.examName || paper.examName,
          subject: paper.subject,
          hasOriginalPaper: paper.hasOriginalPaper,
          rows: paper.rows
        });
        const items = paper.pages
          .filter(function (p) { return p.imageUrl; })
          .map(function (p) { return { key: 'p' + p.pageIndex, url: p.imageUrl }; })
          .concat(paper.blocks.map(function (b) { return { key: 'b' + b.id, url: b.imageUrl }; }));
        const download = examPaperService.downloadImages(items);
        self._download = download;
        return download.then(function (res) {
          if (self._destroyed) return;
          const view = decorate(paper, res.paths);
          self.setData({
            loading: false,
            pages: view.pages,
            blocks: view.blocks,
            // 有原卷页记录却一张都没拿到：给可感知提示，可下拉重试
            imagesUnavailable: paper.hasOriginalPaper && view.pages.length === 0 && res.failed > 0
          });
        });
      })
      .catch(function (err) {
        if (self._destroyed) return;
        self.setData({ loading: false, error: (err && err.message) || '加载失败' });
      })
      .finally(function () {
        self._loading = false;
        if (typeof done === 'function') done();
      });
  },

  onPreview: function (e) {
    const index = Number(e.currentTarget.dataset.index) || 0;
    const urls = (this.data.pages || []).map(function (p) { return p.url; }).filter(function (u) { return u; });
    if (urls.length === 0) return;
    wx.previewImage({ current: urls[index] || urls[0], urls: urls });
  }
});
