// pages/profile/profile.js
const { getUser, logout, getToken } = require('../../utils/auth');
const { post, requestRaw } = require('../../utils/request');
const { normalizeReport } = require('../../utils/ai');
const { getSubStatus, setSubStatus, requestSubscribe, TEMPLATE_ID } = require('../../utils/subscribe');

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
  },

  onAi: function () {
    const self = this;
    if (this.data.aiLoading) return;
    if (!getToken()) { this.setData({ aiError: '请先登录' }); return; }
    this.setData({ aiLoading: true, aiError: '' });
    post('/scores/me/ai-analysis', {}, { timeout: 120000 })
      .then(function (resp) {
        const rep = normalizeReport(resp);
        if (rep) self.setData({ aiReport: rep });
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
          const token = getToken();
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
  }
});
