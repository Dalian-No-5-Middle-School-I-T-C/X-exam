// pages/profile/profile.js
const { getUser, logout, getToken } = require('../../utils/auth');
const { post, requestRaw } = require('../../utils/request');
const { normalizeReport, getCachedAI, setCachedAI } = require('../../utils/ai');
const { getSubStatus, setSubStatus, requestSubscribe, TEMPLATE_ID } = require('../../utils/subscribe');
const { clearCachedScores } = require('../../utils/cache');
const growthService = require('../../services/growthService');
const share = require('../../growth/share');

function isAdmin(user) {
  if (!user) return false;
  if (user.isAdmin === true || user.is_admin === true) return true;
  const role = String(user.role || user.roleCode || user.role_code || '').toLowerCase();
  const displayName = String(user.role_display_name || '');
  return role === 'admin' || role === 'administrator' || displayName.indexOf('管理员') >= 0;
}

// 学生只看结论，HTTP 状态 / 微信 errno 只进 console（真机 vConsole 可定位到底是
// 后端没部署（404）、未配环境变量（503）还是用户自己取消）。
function subFailText(r) {
  if (r.reason === 'rejected') {
    if (r.detail === 'setting=ban') return '请先在右上角设置中允许订阅消息';
    if (r.detail === 'setting=filter') return '当前暂不支持该提醒，请稍后再试';
    return '已取消开启';
  }
  if (r.reason === 'denied') return '订阅窗口未弹出，请稍后重试';
  if (r.reason === 'loginFailed') return '微信登录失败，请重试';
  if (r.reason === 'bindFailed') {
    if (r.status === 401 || r.status === 403) return '登录已过期，请重新登录';
    if (r.status === 0) return '网络异常，请稍后重试';
    if (r.status === 404 || r.status === 503) return '服务尚未就绪，请稍后再试';
    return '绑定失败，请重试';
  }
  return '开启失败，请稍后再试';
}

Page({
  data: {
    user: null,
    nameInitial: '?',
    aiReport: null,
    aiLoading: false,
    aiError: '',
    subOn: false,
    subReady: false,
    isAdmin: false,
    ready: false
  },

  onReady: function () { this.setData({ ready: true }); share.enableShareMenu(); },

  onShow: function () {
    const u = getUser();
    this.setData({
      user: u,
      nameInitial: (u && u.name) ? String(u.name).charAt(0) : '?',
      subOn: getSubStatus(),
      subReady: !!TEMPLATE_ID,
      isAdmin: isAdmin(u)
    });
    this.syncSubAuth();
  },

  // 用微信真实订阅授权态复核本地开关，避免开关与实际授权脱节
  // 注意：单向同步——只处理 reject→关闭；用户在系统设置里重新允许后，开关需手动打开
  syncSubAuth: function () {
    if (!TEMPLATE_ID) return;
    const self = this;
    wx.getSetting({
      withSubscriptions: true,
      success: function (res) {
        const settings = res.subscriptionsSetting && res.subscriptionsSetting.itemSettings;
        if (settings && settings[TEMPLATE_ID] === 'reject') {
          setSubStatus(false);
          self.setData({ subOn: false });
        }
      }
    });
  },

  onAi: function () {
    const self = this;
    if (this.data.aiLoading) return;
    if (!getToken()) { this.setData({ aiError: '请先登录' }); return; }
    const cached = getCachedAI('overall');
    if (cached) { this.setData({ aiReport: cached }); return; }
    this.setData({ aiLoading: true, aiError: '' });
    post('/scores/me/ai-analysis', {}, { timeout: 120000 })
      .then(function (resp) {
        const rep = normalizeReport(resp);
        if (rep) { setCachedAI('overall', null, rep); self.setData({ aiReport: rep }); }
        else self.setData({ aiError: '暂未生成分析' });
      })
      .catch(function (err) {
        self.setData({ aiError: (err && err.message) || 'AI 服务暂不可用，请稍后再试' });
      })
      .finally(function () { self.setData({ aiLoading: false }); });
  },

  onToggleSub: function (e) {
    const self = this;
    const wantOn = e.detail.value;
    if (!wantOn) {
      setSubStatus(false);
      this.setData({ subOn: false });
      // 后端 /unsubscribe 接口尚未在契约中，关闭仅管理本机授权状态
      return;
    }
    requestSubscribe().then(function (r) {
      if (r.ok && r.accepted) {
        self.setData({ subOn: true });
        growthService.onSubscribeOn();
        wx.showToast({ title: '已开启成绩提醒', icon: 'success' });
        return;
      }
      if (r.reason === 'noTemplate') {
        self.setData({ subOn: false, subReady: false });
        wx.showModal({ title: '功能筹备中', content: '成绩发布提醒模板尚未配置，暂不可开启。', showCancel: false });
        return;
      }
      if (r.reason !== 'rejected') {
        console.warn('[subscribe] ' + r.reason + ' status=' + r.status + ' errno=' + r.errno + ' ' + r.detail);
      }
      self.setData({ subOn: false });
      wx.showToast({ title: subFailText(r), icon: 'none' });
    });
  },

  onAdminLadder: function () {
    wx.navigateTo({ url: '/pages/admin-ladder/admin-ladder' });
  },

  onLogout: function () {
    wx.showModal({
      title: '退出登录',
      content: '确定退出当前账号？',
      success: function (r) {
        if (r.confirm) {
          const token = getToken();
          // 先清缓存再登出：logout 后 userSalt 会变空，清不到当前用户的 key
          clearCachedScores();
          logout();
          wx.reLaunch({ url: '/pages/login/login' });
          // 服务端吊销 token（尽力而为，不影响本地登出）
          if (token) {
            requestRaw('POST', '/auth/logout', undefined, {
              header: { 'Authorization': 'Bearer ' + token }
            }).catch(function () { /* 网络失败不阻塞本地登出 */ });
          }
        }
      }
    });
  },

  onShareAppMessage: function () {
    growthService.onShareApp({ from: 'profile' });
    return share.makeShareAppMessage({ title: 'Project-X 学生成绩查询', query: {} });
  },

  onShareTimeline: function () {
    growthService.onShareTimeline({ from: 'profile' });
    return share.makeShareTimeline({ title: 'Project-X 学生成绩查询' });
  }
});
