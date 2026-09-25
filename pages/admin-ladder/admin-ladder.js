const { getUser } = require('../../utils/auth');
const ladderSettingsService = require('../../services/ladderSettingsService');

function isAdmin(user) {
  if (!user) return false;
  if (user.isAdmin === true || user.is_admin === true) return true;
  const role = String(user.role || user.roleCode || user.role_code || '').toLowerCase();
  const displayName = String(user.role_display_name || '');
  return role === 'admin' || role === 'administrator' || displayName.indexOf('管理员') >= 0;
}
function readEnabled(data, fallback) {
  if (data && data.ladderEnabled != null) return !!data.ladderEnabled;
  if (data && data.ladder_enabled != null) return !!data.ladder_enabled;
  if (data && data.enabled != null) return !!data.enabled;
  return !!fallback;
}

Page({
  data: {
    enabled: false,
    loading: true,
    saving: false,
    error: ''
  },

  onLoad: function () {
    if (!isAdmin(getUser())) {
      this.setData({ loading: false, error: '仅管理员可管理成绩天梯' });
      return;
    }
    this.loadSettings();
  },

  loadSettings: function () {
    const self = this;
    this.setData({ loading: true, error: '' });
    ladderSettingsService.getSettings()
      .then(function (data) { self.setData({ enabled: readEnabled(data), loading: false }); })
      .catch(function (err) { self.setData({ loading: false, error: (err && err.message) || '加载失败' }); });
  },

  onToggle: function (event) {
    if (this.data.saving) return;
    const enabled = !!(event.detail && event.detail.value);
    const self = this;
    this.setData({ saving: true, error: '' });
    ladderSettingsService.setEnabled(enabled)
      .then(function (data) {
        self.setData({ enabled: readEnabled(data, enabled), saving: false });
        wx.showToast({ title: enabled ? '成绩天梯已开启' : '成绩天梯已关闭', icon: 'success' });
      })
      .catch(function (err) {
        self.setData({ saving: false, error: (err && err.message) || '保存失败' });
      });
  }
});
