// pages/login/login.js
const { login, isLoggedIn } = require('../../utils/auth');
const growthService = require('../../services/growthService');
const invite = require('../../growth/invite');

Page({
  data: {
    identifier: '',
    password: '',
    remember: true,
    loading: false,
    error: '',
    ready: false,
    schoolCode: ''
  },
  onLoad: function (options) {
    // 读取落地页落地的待生效邀请；若直接带参进入（防御）也落地一次
    const p = invite.getPending();
    this.setData({ schoolCode: (p && p.schoolCode) || '' });
    if (options && (options.inviter || options.school || options.examId)) {
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
    try {
      const res = await login(identifier, password, remember, this.data.schoolCode);
      if (res.passwordChangeRequired) {
        // 初始密码账号：先设置新密码，改密后需重新登录
        wx.reLaunch({ url: '/pages/change-password/change-password' });
        return;
      }
      // 登录成功：上报转化并消费待生效邀请（深链到具体考试）
      const pending = growthService.onLoginSuccess();
      invite.clearPending();
      if (pending && pending.examId) {
        wx.reLaunch({ url: '/pages/detail/detail?examId=' + pending.examId });
      } else {
        wx.reLaunch({ url: '/pages/scores/scores' });
      }
    } catch (err) {
      this.setData({ error: (err && err.message) || '登录失败' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
