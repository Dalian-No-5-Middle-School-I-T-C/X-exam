// app.js
// 全局入口：登录态统一由 utils/auth.js 的 storage 管理，这里不再维护重复的 globalData
App({
  // 全局错误兜底：线上 JS 异常与未处理的 Promise 拒绝至少留有控制台痕迹，
  // 后续接入上报时只需在此处补 wx.reportAnalytics / 自建埋点
  onError: function (err) {
    console.error('[app] onError:', err);
  },
  onUnhandledRejection: function (res) {
    console.error('[app] onUnhandledRejection:', res && res.reason);
  }
});
