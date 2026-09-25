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

// 统一结果形状，失败细节随 reason 一起返回，供调用方分类文案：
//   { ok, accepted, reason, status, errno, detail }
//   rejected   —— 用户主动没点允许，属正常业务，ok 仍为 true
//   denied     —— 弹窗没出来，errno/detail 是微信原始错误码与 errMsg
//   bindFailed —— 授权成功但绑定接口失败，status/detail 是 HTTP 状态与后端 message
//   noTemplate / loginFailed —— 前置条件不满足
function result(reason, ok, extra) {
  setSubStatus(false);
  return Object.assign({ ok: ok, accepted: false, reason: reason, status: 0, errno: 0, detail: '' }, extra || {});
}

// 发起授权并将当前微信用户绑定到当前学生账号。
function requestSubscribe() {
  return new Promise(function (resolve) {
    if (!TEMPLATE_ID) {
      resolve(result('noTemplate', false, { detail: 'TEMPLATE_ID 未配置' }));
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: [TEMPLATE_ID],
      success: function (res) {
        const setting = res && res[TEMPLATE_ID];
        if (setting !== 'accept') {
          // ban = 用户关了订阅总开关，filter = 模板被过滤（类目/资质不符），二者文案不同
          resolve(result('rejected', true, { detail: 'setting=' + setting }));
          return;
        }
        wx.login({
          success: function (loginResult) {
            if (!loginResult.code) {
              resolve(result('loginFailed', false, { detail: 'no code' }));
              return;
            }
            post('/wechat/subscriptions/grade-release', { code: loginResult.code, templateId: TEMPLATE_ID })
              .then(function () {
                setSubStatus(true);
                resolve({ ok: true, accepted: true, reason: '', status: 0, errno: 0, detail: '' });
              })
              .catch(function (err) {
                resolve(result('bindFailed', false, {
                  status: (err && err.status) || 0,
                  detail: (err && err.message) || ''
                }));
              });
          },
          fail: function (err) {
            resolve(result('loginFailed', false, { errno: (err && err.errno) || 0, detail: (err && err.errMsg) || '' }));
          }
        });
      },
      fail: function (err) {
        resolve(result('denied', false, { errno: (err && err.errno) || 0, detail: (err && err.errMsg) || '' }));
      }
    });
  });
}

module.exports = { TEMPLATE_ID, getSubStatus, setSubStatus, requestSubscribe };
