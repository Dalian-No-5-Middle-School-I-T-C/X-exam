// pages/exam-paper/exam-paper.js
// 学生端「查看原卷 / 查看答案解析」：v66 起答案有两种下发形态，由后端 answerKeyMode 决定，
// 页面只按它排版 —— 'text' 渲染教师保存的文字（原卷图片在前，每张图下按题号出答案），
// 'file' 渲染教师上传的答案原文件（图片内联，PDF/DOCX 点开时才下载并交给 wx.openDocument）。
// 再展示本人作答图块（先看卷、再看作答）。答案只出内容，不判对错。
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
    imagesUnavailable: false,
    answerKeyMode: 'text',
    answerFiles: [],
    showOriginalPaper: true,
    filesUnavailable: false,
    openingKey: ''
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
    if (this._openDownload) this._openDownload.cancel();
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
          rows: paper.rows,
          answerKeyMode: paper.answerKeyMode,
          showOriginalPaper: paper.showOriginalPaper
        });
        // 只有内联图片需要预下载；PDF/DOCX 在点击时才取文件，避免开场就拉大附件。
        // 教师未开放试卷时原卷页一张都不取——后端本就不会下发 pages，这里再挡一层，
        // 免得响应里混进旧页码就白跑一趟请求（展示段也已按 showOriginalPaper 隐藏）。
        const paperPages = paper.showOriginalPaper
          ? paper.pages.filter(function (p) { return p.imageUrl; })
            .map(function (p) { return { key: 'p' + p.pageIndex, url: p.imageUrl }; })
          : [];
        const items = paperPages
          .concat(paper.blocks.map(function (b) { return { key: 'b' + b.id, url: b.imageUrl }; }))
          .concat(paper.answerFiles.filter(function (f) { return f.inline; })
            .map(function (f) { return { key: 'a' + f.pageIndex, url: f.fileUrl }; }));
        const download = examPaperService.downloadImages(items);
        self._download = download;
        return download.then(function (res) {
          if (self._destroyed) return;
          const view = decorate(paper, res.paths);
          // 内联答案图缺失就得以「暂不可用」提示，不能默默少一页当成老师没上传
          const wantInline = paper.answerFiles.filter(function (f) { return f.inline; }).length;
          self.setData({
            loading: false,
            pages: view.pages,
            blocks: view.blocks,
            answerFiles: view.answerFiles,
            // 有原卷页记录却一张都没拿到：给可感知提示，可下拉重试
            imagesUnavailable: paper.showOriginalPaper && paper.hasOriginalPaper && view.pages.length === 0 && res.failed > 0,
            filesUnavailable: wantInline > 0 && view.answerFiles.filter(function (f) { return f.inline; }).length < wantInline
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
  },

  // 答案图片：与其它图片一致的预览器（可长按转发/保存）
  // data-index 是 answerFiles 里的下标，PDF/DOCX 不内联会占位，所以按条目本身取当前页再筛可预览列表
  onPreviewAnswer: function (e) {
    const index = Number(e.currentTarget.dataset.index);
    const file = (this.data.answerFiles || [])[Number.isInteger(index) ? index : -1];
    if (!file || !file.inline || !file.url) return;
    const urls = (this.data.answerFiles || [])
      .filter(function (f) { return f.inline && f.url; })
      .map(function (f) { return f.url; });
    wx.previewImage({ current: file.url, urls: urls });
  },

  /**
   * 打开答案原文件（PDF / DOCX）：先按页码取临时文件，再交给系统文档预览。
   * 只接受后端登记过的页码 —— URL 里没有文件名，也就无从指到别处。
   */
  onOpenAnswerFile: function (e) {
    const self = this;
    const index = Number(e.currentTarget.dataset.index);
    const file = (this.data.answerFiles || [])[Number.isInteger(index) ? index : -1];
    if (!file) return;
    if (file.kind !== 'pdf' && file.kind !== 'docx') {
      wx.showToast({ title: '该格式暂不支持在小程序内打开', icon: 'none' });
      return;
    }
    const key = 'a' + file.pageIndex;
    if (this.data.openingKey) return;
    this.setData({ openingKey: key });
    wx.showLoading({ title: '正在打开…', mask: true });
    const download = examPaperService.downloadImages([{ key: key, url: file.fileUrl }]);
    this._openDownload = download;
    download.then(function (res) {
      const path = res.paths[key];
      wx.hideLoading();
      self.setData({ openingKey: '' });
      if (self._destroyed) return;
      if (!path) {
        wx.showToast({ title: '文件下载失败，请重试', icon: 'none' });
        return;
      }
      wx.openDocument({
        filePath: path,
        fileType: file.kind,
        showMenu: true,
        fail: function () { wx.showToast({ title: '本机无法打开该文件，可转存后查看', icon: 'none' }); }
      });
    }).catch(function () {
      wx.hideLoading();
      self.setData({ openingKey: '' });
      if (!self._destroyed) wx.showToast({ title: '文件下载失败，请重试', icon: 'none' });
    });
  }
});
