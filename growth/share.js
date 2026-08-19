// growth/share.js
// 分享横切：统一构造“指向 landing 公开页”的分享路径（携带邀请人与学校参数），
// 并提供 onShareAppMessage / onShareTimeline 工厂，避免各页重复实现。
const invite = require('../invite');
const auth = require('../../utils/auth');

function myInviterCode() {
  const u = auth.getUser();
  if (!u) return '';
  const id = u.studentId || u.student_id || u.id || '';
  return id ? invite.encodeInviter(id) : '';
}
function mySchoolCode() {
  const u = auth.getUser();
  return (u && u.schoolCode) || '';
}

// 构造分享查询串：inviter + school + 调用方额外参数（如 examId）
function buildShareQuery(extra) {
  const q = [];
  const inv = myInviterCode(); if (inv) q.push('inviter=' + encodeURIComponent(inv));
  const sc = mySchoolCode(); if (sc) q.push('school=' + encodeURIComponent(sc));
  if (extra) {
    for (const k in extra) {
      if (extra[k] != null && extra[k] !== '') q.push(k + '=' + encodeURIComponent(extra[k]));
    }
  }
  return q.join('&');
}

// 分享给微信好友：路径指向公开 landing 页（未登录用户也能落地）
function buildLandingPath(extra) {
  const q = buildShareQuery(extra);
  return 'pages/landing/landing' + (q ? '?' + q : '');
}

function enableShareMenu() {
  try { wx.showShareMenu({ withShareTicket: false, menus: ['shareAppMessage', 'shareTimeline'] }); } catch (e) { /* ignore */ }
}

function makeShareAppMessage(opts) {
  opts = opts || {};
  return {
    title: opts.title || '来看看我的成绩报告',
    path: buildLandingPath(opts.query || {}),
    imageUrl: opts.imageUrl || ''
  };
}

// 朋友圈分享：只能分享当前页，query 携带邀请/考试参数；落地页据此归因
function makeShareTimeline(opts) {
  opts = opts || {};
  return {
    title: opts.title || 'Project-X 学生成绩查询',
    query: buildShareQuery(opts.query || {})
  };
}

module.exports = {
  myInviterCode: myInviterCode,
  buildShareQuery: buildShareQuery,
  buildLandingPath: buildLandingPath,
  enableShareMenu: enableShareMenu,
  makeShareAppMessage: makeShareAppMessage,
  makeShareTimeline: makeShareTimeline
};
