// utils/cache.js
// 成绩本地缓存（首页“秒开”关键）：写入最后一次 /api/scores/me 响应
// key 带用户盐：401 换账号后不会展示上一个学生的成绩
const { userSalt } = require('./auth');

function scoresKey() {
  return 'px_cache_scores_me_' + userSalt();
}

function getCachedScores() {
  try { return wx.getStorageSync(scoresKey()) || null; } catch (e) { return null; }
}
function setCachedScores(data) {
  try { wx.setStorageSync(scoresKey(), data); } catch (e) { /* ignore */ }
}
function clearCachedScores() {
  try { wx.removeStorageSync(SCORES_KEY); } catch (e) { /* ignore */ }
}

module.exports = { getCachedScores: getCachedScores, setCachedScores: setCachedScores, clearCachedScores: clearCachedScores };
