// utils/toast.js —— 统一轻量提示，避免各页散落 wx.showToast
function show(msg, icon) {
  wx.showToast({ title: msg || '操作失败', icon: icon || 'none', duration: 2000 });
}
function fail(msg) {
  show(msg || '网络异常，请稍后重试', 'none');
}
function ok(msg) {
  show(msg || '成功', 'success');
}
module.exports = { show: show, fail: fail, ok: ok };
