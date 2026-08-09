// pages/login/login.js
const { login, isLoggedIn } = require('../../utils/auth');

Page({
  data: {
    identifier: '',
    password: '',
    remember: true,
    loading: false,
    error: '',
    ready: false
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
    const data = this.data;
    const identifier = (data.identifier || '').trim();
    const password = data.password;
    const remember = data.remember;
    if (!identifier || !password) {
      this.setData({ error: '请输入用户名和密码' });
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const res = await login(identifier, password, remember);
      if (res.passwordChangeRequired) {
        // 初始密码账号：先设置新密码，改密后需重新登录
        wx.reLaunch({ url: '/pages/change-password/change-password' });
        return;
      }
      wx.reLaunch({ url: '/pages/scores/scores' });
    } catch (err) {
      this.setData({ error: (err && err.message) || '登录失败' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
