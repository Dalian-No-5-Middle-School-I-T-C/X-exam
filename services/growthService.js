// services/growthService.js
// 增长业务层（横切）：聚合邀请归因、分享、订阅引导、埋点，是页面接入增长能力的统一入口。
// 页面只调本服务（及 scores/leaderboard 服务），不直接 require request。
const invite = require('../growth/invite');
const analytics = require('../growth/analytics');
const subscribe = require('../growth/subscribe');
const auth = require('../utils/auth');

// 落地页加载：解析分享参数，落地待生效邀请（供登录后归因/深链）
function onLandingLoad(options) {
  options = options || {};
  const inviter = options.inviter ? invite.decodeInviter(options.inviter) : '';
  const school = options.school || (auth.getUser() && auth.getUser().schoolCode) || '';
  const examId = options.examId ? (parseInt(options.examId, 10) || 0) : 0;
  invite.savePending({ inviterId: inviter, schoolCode: school, examId: examId });
  analytics.report(analytics.EVENTS.LANDING_VIEW, { school: school, hasInviter: !!inviter });
}

function onLandingEnter() {
  analytics.report(analytics.EVENTS.LANDING_ENTER, {});
}

// 查分成功后引导订阅：返回 true 表示本次应弹出引导
function afterQueryGuide() {
  return subscribe.guideAfterQuery();
}

// 登录成功：上报转化并返回待生效邀请（用于深链到具体考试）
function onLoginSuccess() {
  const p = invite.getPending();
  analytics.report(analytics.EVENTS.LOGIN_CONVERT, { hasInviter: !!(p && p.inviterId) });
  return p;
}

function onSubscribeOn() {
  analytics.report(analytics.EVENTS.SUBSCRIBE_ON, {});
}

function onShareApp(extra) {
  analytics.report(analytics.EVENTS.SHARE_APP, extra || {});
}
function onShareTimeline(extra) {
  analytics.report(analytics.EVENTS.SHARE_TIMELINE, extra || {});
}
function onPosterSave(type) {
  analytics.report(analytics.EVENTS.POSTER_SAVE, { type: type || '' });
}

module.exports = {
  onLandingLoad: onLandingLoad,
  onLandingEnter: onLandingEnter,
  afterQueryGuide: afterQueryGuide,
  onLoginSuccess: onLoginSuccess,
  onSubscribeOn: onSubscribeOn,
  onShareApp: onShareApp,
  onShareTimeline: onShareTimeline,
  onPosterSave: onPosterSave
};
