// growth/analytics.js
// 数据埋点：封装 wx.reportAnalytics。事件需在「公众平台 → 自定义分析」注册后才会真正上报。
// ENABLED 默认 false（占位）：注册事件并将下方常量置 true 后生效。
let ENABLED = false;

const EVENTS = {
  LANDING_VIEW: 'landing_view',
  LANDING_ENTER: 'landing_enter',
  LOGIN_CONVERT: 'login_convert',
  SHARE_APP: 'share_app',
  SHARE_TIMELINE: 'share_timeline',
  SUBSCRIBE_ON: 'subscribe_on',
  POSTER_SAVE: 'poster_save'
};

function report(name, data) {
  if (!ENABLED) return;
  try { if (wx.reportAnalytics) wx.reportAnalytics(name, data || {}); } catch (e) { /* ignore */ }
}
function setEnabled(v) { ENABLED = !!v; }

module.exports = {
  report: report,
  setEnabled: setEnabled,
  EVENTS: EVENTS,
  // getter：保证 setEnabled 后外部读到最新值（值导出只是快照）
  get ENABLED() { return ENABLED; }
};
