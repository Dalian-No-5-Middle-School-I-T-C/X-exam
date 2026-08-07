App({
  globalData: {
    token: '',
    user: null
  },
  onLaunch: function () {
    var token = wx.getStorageSync('px_token');
    var user = wx.getStorageSync('px_user');
    if (token) {
      this.globalData.token = token;
      this.globalData.user = user;
    }
  }
});
