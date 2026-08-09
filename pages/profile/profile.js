// pages/profile/profile.js
const { getUser, logout, getToken } = require('../../utils/auth');
const { post } = require('../../utils/request');
const { normalizeReport, getCachedAI, setCachedAI } = require('../../utils/ai');
const { getSubStatus, setSubStatus, requestSubscribe, TEMPLATE_ID } = require('../../utils/subscribe');
const { clearCachedScores } = require('../../utils/cache');

Page({
  data: {
    user: null,
    nameInitial: '?',
    aiReport: null,
    aiLoading: false,
    aiError: '',
    subOn: false,
    subReady: false,
    ready: false
  },

  onReady: function () { this.setData({ ready: true }); },

  onShow: function () {
    const u = getUser();
    this.setData({
      user: u,
      nameInitial: (u && u.name) ? String(u.name).charAt(0) : '?',
      subOn: getSubStatus(),
      subReady: !!TEMPLATE_ID
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
        wx.showToast({ title: '已开启成绩提醒', icon: 'success' });
      } else if (r.reason === 'noTemplate') {
        self.setData({ subOn: false, subReady: false });
        wx.showModal({ title: '功能筹备中', content: '成绩发布提醒模板尚未配置，暂不可开启。', showCancel: false });
      } else {
        self.setData({ subOn: false });
        wx.showToast({ title: '授权未开启', icon: 'none' });
      }
    });
  },

  onLogout: function () {
    wx.showModal({
      title: '退出登录',
      content: '确定退出当前账号？',
      success: function (r) {
        if (r.confirm) {
          // 先清缓存再登出：logout 后 userSalt 会变空，清不到当前用户的 key
          clearCachedScores();
          logout();
          wx.reLaunch({ url: '/pages/login/login' });
        }
      }
    });
  }
});
