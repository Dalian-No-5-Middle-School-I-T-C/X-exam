// utils/cache.js
// 成绩本地缓存（首页“秒开”关键）：写入最后一次 /api/scores/me 响应
// key 带用户盐：401 换账号后不会展示上一个学生的成绩
const { userSalt } = require('./auth');

// 缓存 24 小时后视为过期，避免断网时永远展示旧成绩
const CACHE_TTL = 24 * 60 * 60 * 1000;

function scoresKey() {
  return 'px_cache_scores_me_' + userSalt();
}

function getCachedScores() {
  try {
    const raw = wx.getStorageSync(scoresKey());
    if (raw && raw.t) {
      if (Date.now() - raw.t < CACHE_TTL) return raw.data;
    } else if (raw && raw.scores) {
      // 旧格式（无时间戳）：兼容升级前已存在的缓存，下次成功刷新会迁移为新格式
      return raw;
    }
  } catch (e) { /* ignore */ }
  return null;
}
function setCachedScores(data) {
  try { wx.setStorageSync(scoresKey(), { t: Date.now(), data: data }); } catch (e) { /* ignore */ }
}
function clearCachedScores() {
  try { wx.removeStorageSync(scoresKey()); } catch (e) { /* ignore */ }
}

module.exports = { getCachedScores: getCachedScores, setCachedScores: setCachedScores, clearCachedScores: clearCachedScores };
