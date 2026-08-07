// utils/subscribe.js
// 微信订阅消息：前端只负责收集用户授权，真实推送由后端在成绩发布时
// 调用 subscribeMessage.send 完成。前端无法独立完成推送。
//
// TODO（需你操作）：在微信公众平台「订阅消息」中申请"成绩发布通知"类模板，
// 将模板 ID 填入下方 TEMPLATE_ID 常量，订阅开关即可正式生效。
const TEMPLATE_ID = '';

function getSubStatus() {
  try { return wx.getStorageSync('subAccepted') === true; } catch (e) { return false; }
}

function setSubStatus(v) {
  try { wx.setStorageSync('subAccepted', !!v); } catch (e) { /* ignore */ }
}

// 发起授权请求；返回 Promise<{ ok, accepted, reason }>
function requestSubscribe() {
  return new Promise(function (resolve) {
    if (!TEMPLATE_ID) {
      resolve({ ok: false, accepted: false, reason: 'noTemplate' });
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: [TEMPLATE_ID],
      success: function (res) {
        var accepted = res[TEMPLATE_ID] === 'accept';
        setSubStatus(accepted);
        resolve({ ok: true, accepted: accepted, reason: accepted ? '' : 'rejected' });
      },
      fail: function () {
        resolve({ ok: false, accepted: false, reason: 'denied' });
      }
    });
  });
}

module.exports = { TEMPLATE_ID, getSubStatus, setSubStatus, requestSubscribe };
