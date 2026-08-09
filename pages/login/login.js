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
    this.setData({ remember: (e.detail.value && e.detail.value.length > 0) });
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
        // 尚无改密页面：如实提示初始密码，而不是声称“请先修改密码”后照常进入
        wx.showToast({ title: '当前为初始密码，建议尽快联系管理员修改', icon: 'none' });
      }
      wx.reLaunch({ url: '/pages/scores/scores' });
    } catch (err) {
      this.setData({ error: (err && err.message) || '登录失败' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
