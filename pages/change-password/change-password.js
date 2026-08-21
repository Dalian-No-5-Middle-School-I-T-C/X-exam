// 首次登录 / 密码需修改账号：设置新密码（后端 /auth/change-password）
// 后端改密成功后吊销全部 token，因此本地登出并回到登录页重新登录。
const { getToken, clearToken, clearUser } = require('../../utils/auth');
const { post } = require('../../utils/request');

const MIN_LEN = 6;

Page({
  data: {
    oldPassword: '',
    newPassword: '',
    confirm: '',
    loading: false,
    error: '',
    ready: false
  },

  onShow: function () {
    // 无 token（被登出 / 直接进入）回到登录页
    if (!getToken()) {
      wx.reLaunch({ url: '/pages/login/login' });
    }
  },

  onReady: function () { this.setData({ ready: true }); },

  onOld: function (e) { this.setData({ oldPassword: e.detail.value }); },
  onNew: function (e) { this.setData({ newPassword: e.detail.value }); },
  onConfirm: function (e) { this.setData({ confirm: e.detail.value }); },

  onSubmit: async function () {
    if (this.data.loading) return;
    const oldPassword = this.data.oldPassword;
    const newPassword = this.data.newPassword;
    const confirm = this.data.confirm;

    if (!oldPassword || !newPassword) {
      this.setData({ error: '请输入当前密码和新密码' });
      return;
    }
    if (newPassword.length < MIN_LEN) {
      this.setData({ error: '新密码长度至少 ' + MIN_LEN + ' 位' });
      return;
    }
    if (newPassword !== confirm) {
      this.setData({ error: '两次输入的新密码不一致' });
      return;
    }
    if (newPassword === oldPassword) {
      this.setData({ error: '新密码不能与当前密码相同' });
      return;
    }

    this.setData({ loading: true, error: '' });
    try {
      await post('/auth/change-password', { oldPassword: oldPassword, newPassword: newPassword });
      clearToken();
      clearUser();
      // showModal 等用户确认后再跳转：toast 会随 reLaunch 页面销毁被吞掉
      wx.showModal({
        title: '修改成功',
        content: '请使用新密码重新登录',
        showCancel: false,
        success: function () { wx.reLaunch({ url: '/pages/login/login' }); }
      });
    } catch (err) {
      this.setData({ error: (err && err.message) || '修改失败' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
