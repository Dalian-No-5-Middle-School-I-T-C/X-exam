// growth/subscribe.js
// 订阅横切：复用 utils/subscribe 的实现，并补充“查分成功后引导订阅”逻辑。
const sub = require('../../utils/subscribe');
const GUIDE_KEY = 'px_sub_guide';

// 查分成功后是否需引导开启订阅（仅首次、且模板已配置、且未订阅时）
function guideAfterQuery() {
  try {
    if (sub.TEMPLATE_ID && !sub.getSubStatus()) {
      if (wx.getStorageSync(GUIDE_KEY) !== true) {
        wx.setStorageSync(GUIDE_KEY, true);
        return true;
      }
    }
  } catch (e) { /* ignore */ }
  return false;
}

module.exports = Object.assign({}, sub, { guideAfterQuery: guideAfterQuery, GUIDE_KEY: GUIDE_KEY });
