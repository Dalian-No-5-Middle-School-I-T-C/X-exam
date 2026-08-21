// utils/request.js
// 统一封装 wx.request：自动带 Bearer，401 清登录态并跳登录。
// requestRaw 为低层请求，auth.js 复用，避免登录接口重复一套请求逻辑。
const { API_BASE, API_PREFIX } = require('./env');

const DEFAULT_TIMEOUT = 20000;
let handling401 = false;
let handling428 = false;

// 延迟 require 打破 auth.js <-> request.js 循环依赖
function getToken() { return require('./auth').getToken(); }
// 清理本地用户数据缓存（成绩/AI 报告/待生效邀请）：
// 401 被动登出时也必须清，否则前一学生的成绩明文残留在设备 storage 中
function clearLocalUserData() {
  var PREFIXES = ['px_cache_scores_me_', 'px_ai_'];
  try {
    var info = wx.getStorageInfoSync();
    var keys = (info && info.keys) || [];
    keys.forEach(function (k) {
      var hit = k === 'px_pending_invite';
      for (var i = 0; i < PREFIXES.length; i++) {
        if (k.indexOf(PREFIXES[i]) === 0) { hit = true; break; }
      }
      if (hit) { try { wx.removeStorageSync(k); } catch (e) { /* ignore */ } }
    });
  } catch (e) { /* ignore */ }
}
function clearLogin() {
  var auth = require('./auth');
  clearLocalUserData();
  auth.clearToken();
  auth.clearUser();
}

function handleUnauthorized() {
  if (handling401) return;
  handling401 = true;
  clearLogin();
  var pages = getCurrentPages();
  var top = pages[pages.length - 1];
  var onLogin = top && top.route === 'pages/login/login';
  if (onLogin) {
    handling401 = false;
    return;
  }
  // 多个并发请求同时 401 时只跳一次；reLaunch 完成后立即复位，避免锁住后续 401
  wx.reLaunch({
    url: '/pages/login/login',
    complete: function () { handling401 = false; }
  });
}

// 428 = 后端要求先完成一次性改密（PASSWORD_CHANGE_REQUIRED），统一引导到改密页
function handlePasswordRequired() {
  if (handling428) return;
  handling428 = true;
  var pages = getCurrentPages();
  var top = pages[pages.length - 1];
  var onChange = top && top.route === 'pages/change-password/change-password';
  if (onChange) {
    handling428 = false;
    return;
  }
  wx.reLaunch({
    url: '/pages/change-password/change-password',
    complete: function () { handling428 = false; }
  });
}

function apiError(res) {
  var message = '请求失败';
  var body = null;
  try {
    body = res.data;
    if (body && typeof body.message === 'string' && body.message) message = body.message;
  } catch (e) { /* ignore */ }
  var err = new Error(message);
  err.status = res.statusCode;
  err.body = body;
  return err;
}

// 低层请求：不带鉴权/401 逻辑，成功 resolve 完整 response
function requestRaw(method, path, data, options) {
  options = options || {};
  return new Promise(function (resolve, reject) {
    wx.request({
      url: API_BASE + API_PREFIX + path,
      method: method,
      data: data,
      header: options.header || { 'content-type': 'application/json' },
      responseType: options.responseType,
      timeout: options.timeout,
      success: function (res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res);
        } else {
          reject(apiError(res));
        }
      },
      fail: function (err) {
        var e = new Error((err && err.errMsg) || '网络异常，请检查连接');
        e.status = 0;
        reject(e);
      }
    });
  });
}

function request(method, path, data, opts) {
  opts = opts || {};
  var token = getToken();
  var header = { 'content-type': 'application/json' };
  if (token) header['Authorization'] = 'Bearer ' + token;
  return requestRaw(method, path, data, {
    header: header,
    timeout: opts.timeout || DEFAULT_TIMEOUT
  })
    .then(function (res) { return res.data; })
    .catch(function (err) {
      if (err.status === 401) handleUnauthorized();
      else if (err.status === 428) handlePasswordRequired();
      throw err;
    });
}

function get(path, opts) {
  return request('GET', path, undefined, opts);
}

function post(path, data, opts) {
  return request('POST', path, data, opts);
}

module.exports = { requestRaw: requestRaw, get: get, post: post, clearLocalUserData: clearLocalUserData };
