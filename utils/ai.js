// utils/ai.js
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

module.exports = { normalizeReport };
