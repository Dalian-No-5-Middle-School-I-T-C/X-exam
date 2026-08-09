// utils/ai.js
const { getUser } = require('./auth');
// 将后端 AI 分析响应归一化为统一结构，兼容多种返回格式：
// - { report: {...} } / { report: "文本" }
// - { analysis: "..." } / { data: "..." }
// - 响应体本身即报告对象或字符串
function normalizeReport(data) {
  if (!data) return null;

  var rep = null;
  if (typeof data === 'string') {
    rep = data;
  } else if (data.report !== undefined) {
    rep = data.report;
  } else if (data.analysis !== undefined) {
    rep = data.analysis;
  } else if (data.data !== undefined) {
    rep = data.data;
  } else {
    rep = data; // 整个响应即报告
  }
  if (rep === null || rep === undefined) return null;

  // 纯文本报告
  if (typeof rep === 'string') {
    return { isText: true, text: rep };
  }

  if (typeof rep === 'object') {
    var weak = rep.weakPoints || rep.weak_points || [];
    var next = rep.nextActions || rep.next_actions || [];
    var teach = rep.teachingSuggestions || rep.teaching_suggestions || rep.suggestions || [];
    var cave = rep.caveats || rep.caveat || [];
    return {
      isText: false,
      overall: rep.overallJudgement || rep.overall || rep.summary || rep.judgement || '',
      weak: Array.isArray(weak) ? weak : (weak ? [weak] : []),
      next: Array.isArray(next) ? next : (next ? [next] : []),
      teach: Array.isArray(teach) ? teach : (teach ? [teach] : []),
      cave: Array.isArray(cave) ? cave : (cave ? [cave] : [])
    };
  }
  return null;
}

// AI 报告本地缓存：避免每次进入都重请求（报告短时不变）；
// key 带用户标识，避免同一设备换账号后读到上一个学生的报告
const CACHE_TTL = 30 * 60 * 1000; // 30 分钟
function userSalt() {
  const u = getUser() || {};
  return u.studentId || u.student_id || u.id || u.student_number || '';
}
function aiKey(kind, id) {
  const salt = userSalt();
  return 'px_ai_' + (salt ? salt + '_' : '') + kind + '_' + (id || 'overall');
}
function getCachedAI(kind, id) {
  try {
    const raw = wx.getStorageSync(aiKey(kind, id));
    if (raw && raw.t && (Date.now() - raw.t) < CACHE_TTL) return raw.report;
  } catch (e) { /* ignore */ }
  return null;
}
function setCachedAI(kind, id, report) {
  try { wx.setStorageSync(aiKey(kind, id), { t: Date.now(), report: report }); } catch (e) { /* ignore */ }
}

module.exports = { normalizeReport, getCachedAI, setCachedAI };
