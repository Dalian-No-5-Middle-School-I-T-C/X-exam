// utils/subscribe.js
// 微信订阅消息：前端只负责收集用户授权，真实推送由后端在成绩发布时
// 调用 subscribeMessage.send 完成。前端无法独立完成推送。
//
const { post } = require('./request');

const TEMPLATE_ID = 'A2bLYK2r2_t56N0emFQ-ptdlEQqPnj7ZtI5TLn7zeJE';

function getSubStatus() {
  try { return wx.getStorageSync('subAccepted') === true; } catch (e) { return false; }
}

function setSubStatus(v) {
  try { wx.setStorageSync('subAccepted', !!v); } catch (e) { /* ignore */ }
}

// 发起授权并将当前微信用户绑定到当前学生账号。
function requestSubscribe() {
  return new Promise(function (resolve) {
    wx.requestSubscribeMessage({
      tmplIds: [TEMPLATE_ID],
      success: function (res) {
        if (res[TEMPLATE_ID] !== 'accept') {
          setSubStatus(false);
          resolve({ ok: true, accepted: false, reason: 'rejected' });
          return;
        }
        wx.login({
          success: function (loginResult) {
            if (!loginResult.code) {
              setSubStatus(false);
              resolve({ ok: false, accepted: false, reason: 'loginFailed' });
              return;
            }
            post('/wechat/subscriptions/grade-release', { code: loginResult.code, templateId: TEMPLATE_ID })
              .then(function () {
                setSubStatus(true);
                resolve({ ok: true, accepted: true, reason: '' });
              })
              .catch(function () {
                setSubStatus(false);
                resolve({ ok: false, accepted: false, reason: 'bindFailed' });
              });
          },
          fail: function () {
            setSubStatus(false);
            resolve({ ok: false, accepted: false, reason: 'loginFailed' });
          }
        });
      },
      fail: function () {
        setSubStatus(false);
        resolve({ ok: false, accepted: false, reason: 'denied' });
      }
    });
  });
}

module.exports = { TEMPLATE_ID, getSubStatus, setSubStatus, requestSubscribe };
