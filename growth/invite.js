// growth/invite.js
// 邀请归因：编/解码 inviterId 与 schoolCode，落地到本地“待生效邀请”（pending）。
// 编码仅为分享短码（非加密），便于在分享链接中携带；真实安全由后端登录态保证。
const ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const PENDING_KEY = 'px_pending_invite';

// 学校代码 → 名称 静态映射（后续可由后端 /schools 接口下发，这里先占位）
const SCHOOL_MAP = { 'DL5Z': '大连第五中学' };

// 可逆凯撒（仅在 62 位字母数字表内位移），保证分享码 URL 安全
function caesar(str, d) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const idx = ALPHA.indexOf(str[i]);
    if (idx < 0) { out += str[i]; continue; }
    let n = (idx + d) % ALPHA.length;
    if (n < 0) n += ALPHA.length;
    out += ALPHA[n];
  }
  return out;
}

// 当前用户的邀请码（用于分享时作为 inviter 参数）
function encodeInviter(id) {
  if (id == null) return '';
  return 'v' + caesar(String(id), 7);
}
function decodeInviter(code) {
  if (!code) return '';
  let s = String(code);
  if (s[0] === 'v') s = s.slice(1);
  return caesar(s, -7);
}

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
  try { wx.setStorageSync(PENDING_KEY, p || {}); } catch (e) { /* ignore */ }
}
function getPending() {
  try { return wx.getStorageSync(PENDING_KEY) || null; } catch (e) { return null; }
}
function clearPending() {
  try { wx.removeStorageSync(PENDING_KEY); } catch (e) { /* ignore */ }
}

module.exports = {
  ALPHA: ALPHA,
  SCHOOL_MAP: SCHOOL_MAP,
  encodeInviter: encodeInviter,
  decodeInviter: decodeInviter,
  schoolName: schoolName,
  schoolCodeByName: schoolCodeByName,
  savePending: savePending,
  getPending: getPending,
  clearPending: clearPending
};
