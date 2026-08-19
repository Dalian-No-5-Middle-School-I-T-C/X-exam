// utils/privacy.js
// 隐私保护指引占位模块。
// 微信自 2023-09 起要求：在处理用户个人信息前须弹出隐私授权窗（wx.requirePrivacyAuthorize），
// 并在「公众平台 → 设置 → 用户隐私保护指引」配置隐私政策。
// 本模块为占位：正式上线前需补全隐私政策地址，并在合适时机（如登录页首次进入）调用授权弹窗。
const PRIVACY_POLICY_URL = ''; // TODO: 填入隐私政策网页地址（mp 后台「隐私政策」处生成）
const DEFAULT_TEXT =
  '本小程序仅收集查分必需的学号与成绩数据，由学校 Project-X 系统提供，仅本人可见。';

// 打开隐私保护指引（优先微信官方隐私页，失败兜底弹窗说明）
function openPrivacyContract() {
  try {
    if (wx.openPrivacyContract) {
      wx.openPrivacyContract({
        fail: function () {
          wx.showModal({ title: '隐私保护指引', content: PRIVACY_POLICY_URL || DEFAULT_TEXT, showCancel: false });
        }
      });
      return;
    }
  } catch (e) { /* ignore */ }
  wx.showModal({ title: '隐私保护指引', content: PRIVACY_POLICY_URL || DEFAULT_TEXT, showCancel: false });
}

// 请求隐私授权（占位：正式上线前接入 wx.requirePrivacyAuthorize）
function requirePrivacyAuthorize(resolve, reject) {
  try {
    if (wx.requirePrivacyAuthorize) {
      wx.requirePrivacyAuthorize({ success: resolve, fail: reject });
      return;
    }
  } catch (e) { /* ignore */ }
  if (resolve) resolve();
}

module.exports = {
  PRIVACY_POLICY_URL: PRIVACY_POLICY_URL,
  DEFAULT_TEXT: DEFAULT_TEXT,
  openPrivacyContract: openPrivacyContract,
  requirePrivacyAuthorize: requirePrivacyAuthorize
};
