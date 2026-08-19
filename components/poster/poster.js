// components/poster/poster.js
// 一键转发弹层：持有离屏 Canvas 2D，调用 utils/poster 绘制海报，
// 导出高清图后提供「分享到微信 / 保存到相册 / 关闭」。
const poster = require('../../utils/poster');
const W = 375; // 设计稿宽度（px）；导出按 PX 缩放，见 _draw

Component({
  data: {
    visible: false,
    generating: false,
    posterPath: ''
  },

  methods: {
    // 父页面通过 selectComponent('#poster').open(model) 调用
    open: function (model) {
      if (!model || !model.type) {
        wx.showToast({ title: '暂无可转发的数据', icon: 'none' });
        return;
      }
      const self = this;
      this.setData({ visible: true, generating: true, posterPath: '' }, function () {
        // modal 已渲染，查询画布节点
        wx.createSelectorQuery().in(self).select('#posterCanvas')
          .fields({ node: true, size: true })
          .exec(function (res) {
            if (!res || !res[0] || !res[0].node) { self._fail('画布初始化失败，请重试'); return; }
            try { self._draw(res[0].node, model); }
            catch (e) { self._fail('生成失败：' + ((e && e.message) || e)); }
          });
      });
    },

    _draw: function (canvas, model) {
      const self = this;
      const sections = poster.buildSections(model, W);
      const H = sections.reduce(function (a, s) { return a + s.h; }, 0);

      // 缩放系数：默认 2 倍（750px 宽海报）；超高内容降系数以不超 4096px 上限
      let PX = 2;
      if (H * PX > 4096) PX = Math.max(1, Math.floor(4096 / H));

      const ctx = canvas.getContext('2d');
      canvas.width = W * PX;
      canvas.height = H * PX;
      ctx.scale(PX, PX);

      // 纸面背景
      ctx.fillStyle = poster.C.paper;
      ctx.fillRect(0, 0, W, H);

      let y = 0;
      sections.forEach(function (s) { s.draw(ctx, y, W); y += s.h; });

      // 等一帧确保合成完成再导出（iOS 稳定性）
      canvas.requestAnimationFrame(function () {
        wx.canvasToTempFilePath({
          canvas: canvas,
          x: 0, y: 0,
          width: canvas.width,
          height: canvas.height,
          destWidth: canvas.width,
          destHeight: canvas.height,
          fileType: 'png',
          success: function (r) { self.setData({ posterPath: r.tempFilePath, generating: false }); },
          fail: function () { self._fail('导出图片失败，请重试'); }
        });
      });
    },

    _fail: function (msg) {
      this.setData({ generating: false });
      wx.showToast({ title: msg, icon: 'none' });
    },

    doShare: function () {
      const p = this.data.posterPath;
      if (!p) return;
      // 优先用专门分享图片的 API（可发给好友 / 朋友圈）
      if (wx.showShareImageMenu) {
        wx.showShareImageMenu({
          path: p,
          fail: function () { wx.showToast({ title: '已取消分享', icon: 'none' }); }
        });
      } else {
        // 老基础库降级：预览大图，用户可长按转发
        wx.previewImage({ urls: [p], current: p });
      }
    },

    doSave: function () {
      const self = this;
      const p = this.data.posterPath;
      if (!p) return;
      wx.saveImageToPhotosAlbum({
        filePath: p,
        success: function () { wx.showToast({ title: '已保存到相册', icon: 'success' }); },
        fail: function (err) {
          const m = (err && err.errMsg) || '';
          if (m.indexOf('auth deny') >= 0 || m.indexOf('authorize') >= 0) {
            wx.showModal({
              title: '需要相册权限',
              content: '请在设置中允许“保存到相册”后重试',
              confirmText: '去设置',
              success: function (r) { if (r.confirm) wx.openSetting(); }
            });
          } else if (m.indexOf('cancel') < 0) {
            wx.showToast({ title: '保存失败', icon: 'none' });
          }
        }
      });
    },

    close: function () { this.setData({ visible: false }); },
    noop: function () {}
  }
});
