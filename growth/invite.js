// growth/invite.js
// 落地参数仅保留学校与考试深链，不在公开链接中携带个人标识。
const PENDING_KEY = 'px_pending_invite';
const PENDING_TTL = 7 * 24 * 60 * 60 * 1000;

const SCHOOL_MAP = { 'DL5Z': '大连第五中学' };

function schoolName(code) {
  if (code && SCHOOL_MAP[code]) return SCHOOL_MAP[code];
  if (code) return '学校（' + code + '）';
  return '大连第五中学';
}
function schoolCodeByName(name) {
  for (const k in SCHOOL_MAP) { if (SCHOOL_MAP[k] === name) return k; }
  return '';
}

function savePending(p) {
  try { wx.setStorageSync(PENDING_KEY, Object.assign({ t: Date.now() }, p || {})); } catch (e) { /* ignore */ }
}
function getPending() {
  try {
    const p = wx.getStorageSync(PENDING_KEY) || null;
    if (!p) return null;
    if (!p.t || Date.now() - p.t > PENDING_TTL) {
      clearPending();
      return null;
    }
    return p;
  } catch (e) { return null; }
}
function clearPending() {
  try { wx.removeStorageSync(PENDING_KEY); } catch (e) { /* ignore */ }
}

module.exports = {
  SCHOOL_MAP: SCHOOL_MAP,
  schoolName: schoolName,
  schoolCodeByName: schoolCodeByName,
  savePending: savePending,
  getPending: getPending,
  clearPending: clearPending
};
