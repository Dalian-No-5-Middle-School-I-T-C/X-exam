// pages/landing/landing.js
// 公开落地页：承载 school + inviter + examId 参数，引导进入登录。
// 不要求登录即可访问；已登录用户直接跳成绩页（或深链考试详情）。
const auth = require('../../utils/auth');
const invite = require('../../growth/invite');
const growthService = require('../../services/growthService');
const share = require('../../growth/share');
const privacy = require('../../utils/privacy');

Page({
  data: {
    schoolName: '大连第五中学',
    examName: '',
    inviterHint: '',
    examId: 0,
    ready: false
  },

  onLoad: function (options) {
    options = options || {};
    // 已登录：直接进成绩（或深链考试），跳过公开落地
    if (auth.isLoggedIn()) {
      const p = invite.getPending();
      if (p && p.examId) {
        wx.reLaunch({ url: '/pages/detail/detail?examId=' + p.examId });
      } else {
        wx.reLaunch({ url: '/pages/scores/scores' });
      }
      return;
    }
    // 未登录：落地分享参数，用于登录后归因/深链
    growthService.onLandingLoad(options);
    this.setData({
      schoolName: invite.schoolName(options.school || ''),
      examName: options.examId ? ('考试 #' + options.examId) : '',
      inviterHint: options.inviter ? '好友推荐 · 一起查成绩' : '',
      examId: options.examId ? (parseInt(options.examId, 10) || 0) : 0
    });
  },

  onReady: function () {
    this.setData({ ready: true });
    share.enableShareMenu();
  },

  onEnter: function () {
    growthService.onLandingEnter();
    wx.navigateTo({ url: '/pages/login/login' });
  },

  openPrivacy: function () {
    privacy.openPrivacyContract();
  },

  onShareAppMessage: function () {
    growthService.onShareApp({ from: 'landing' });
    return share.makeShareAppMessage({
      title: '学生成绩查询 · 快来查你的成绩',
      query: { examId: this.data.examId || '' }
    });
  },

  onShareTimeline: function () {
    growthService.onShareTimeline({ from: 'landing' });
    return share.makeShareTimeline({ title: 'Project-X 学生成绩查询' });
  }
});
