// utils/cache.js
// 成绩本地缓存（首页“秒开”关键）：写入最后一次 /api/scores/me 响应
const SCORES_KEY = 'px_cache_scores_me';

function getCachedScores() {
  try { return wx.getStorageSync(SCORES_KEY) || null; } catch (e) { return null; }
}
function setCachedScores(data) {
  try { wx.setStorageSync(SCORES_KEY, data); } catch (e) { /* ignore */ }
}
function clearCachedScores() {
  try { wx.removeStorageSync(SCORES_KEY); } catch (e) { /* ignore */ }
}

module.exports = { getCachedScores: getCachedScores, setCachedScores: setCachedScores, clearCachedScores: clearCachedScores };
