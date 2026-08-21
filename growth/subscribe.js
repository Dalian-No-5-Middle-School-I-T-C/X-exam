// growth/subscribe.js
// 订阅横切：复用 utils/subscribe 的实现，并补充“查分成功后引导订阅”逻辑。
const sub = require('../utils/subscribe');
const { userSalt } = require('../utils/auth');
const GUIDE_KEY = 'px_sub_guide';
// 引导冷却期：用户拒绝后 14 天内不再打扰，而非永久关闭
const GUIDE_COOLDOWN = 14 * 24 * 60 * 60 * 1000;

function guideKey() {
  // key 带用户盐：多账号共用设备时互不污染
  return GUIDE_KEY + '_' + userSalt();
}

// 查分成功后是否需引导开启订阅（冷却期外、且模板已配置、且未订阅时）
function guideAfterQuery() {
  try {
    if (sub.TEMPLATE_ID && !sub.getSubStatus()) {
      const last = Number(wx.getStorageSync(guideKey())) || 0;
      if (Date.now() - last > GUIDE_COOLDOWN) {
        wx.setStorageSync(guideKey(), Date.now());
        return true;
      }
    }
  } catch (e) { /* ignore */ }
  return false;
}

module.exports = Object.assign({}, sub, { guideAfterQuery: guideAfterQuery, GUIDE_KEY: GUIDE_KEY });
