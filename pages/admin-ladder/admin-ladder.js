const { getUser } = require('../../utils/auth');
const role = require('../../utils/role');
const ladderSettingsService = require('../../services/ladderSettingsService');

// 管理员判据统一走 utils/role.js：本页原先自带一套宽松判定，
// 与 profile 的入口判据可能对不上，出现「入口看不见、页面却能进」的错位
function isAdmin(user) {
  return role.isAdminUser(user);
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
