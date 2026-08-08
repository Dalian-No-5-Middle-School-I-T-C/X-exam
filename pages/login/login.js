// pages/login/login.js
const { login } = require('../../utils/auth');

Page({
  data: {
    identifier: '',
    password: '',
    remember: true,
    loading: false,
    error: '',
    ready: false
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
    const identifier = data.identifier;
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
        wx.showToast({ title: '请先修改密码', icon: 'none' });
      }
      wx.reLaunch({ url: '/pages/scores/scores' });
    } catch (err) {
      this.setData({ error: (err && err.message) || '登录失败' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
