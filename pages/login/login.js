// pages/login/login.js
const { login, isLoggedIn } = require('../../utils/auth');
const growthService = require('../../services/growthService');
const invite = require('../../growth/invite');
const privacy = require('../../utils/privacy');

Page({
  data: {
    identifier: '',
    password: '',
    remember: false,
    loading: false,
    error: '',
    ready: false,
    schoolCode: ''
  },
  onLoad: function (options) {
    // 读取落地页落地的待生效邀请；若直接带参进入（防御）也落地一次
    const p = invite.getPending();
    this.setData({ schoolCode: (p && p.schoolCode) || '' });
    if (options && (options.school || options.examId)) {
      growthService.onLandingLoad(options);
    }
  },
  onShow: function () {
    // 已有 token 视为已登录：冷启动不再重复输入账号密码
    if (isLoggedIn()) {
      wx.reLaunch({ url: '/pages/scores/scores' });
    }
  },
  onReady: function () { this.setData({ ready: true }); },
  onIdentifier: function (e) { this.setData({ identifier: e.detail.value }); },
  onPassword: function (e) { this.setData({ password: e.detail.value }); },
  onRememberChange: function (e) {
    const vals = (e.detail && e.detail.value) || [];
    this.setData({ remember: vals.indexOf('remember') >= 0 });
  },
  onLogin: async function () {
    if (this.data.loading) return;
    const data = this.data;
    const identifier = (data.identifier || '').trim();
    const password = data.password;
    const remember = data.remember;
    if (!identifier || !password) {
      this.setData({ error: '请输入用户名和密码' });
      return;
    }
    this.setData({ loading: true, error: '' });
    let privacyAuthorized = false;
    try {
      await new Promise(function (resolve, reject) {
        privacy.requirePrivacyAuthorize(resolve, reject);
      });
      privacyAuthorized = true;
      const res = await login(identifier, password, remember, this.data.schoolCode);
      if (res.passwordChangeRequired) {
        wx.reLaunch({ url: '/pages/change-password/change-password' });
        return;
      }
      const pending = growthService.onLoginSuccess();
      invite.clearPending();
      if (pending && pending.examId) {
        wx.reLaunch({ url: '/pages/detail/detail?examId=' + pending.examId });
      } else {
        wx.reLaunch({ url: '/pages/scores/scores' });
      }
    } catch (err) {
      this.setData({ error: privacyAuthorized ? ((err && err.message) || '登录失败') : '需同意隐私保护指引后才能登录' });
    } finally {
      this.setData({ loading: false });
    }
  },
  openPrivacy: function () {
    privacy.openPrivacyContract();
  }
});
