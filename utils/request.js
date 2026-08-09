// utils/request.js
// 统一封装 wx.request：自动带 Bearer，401 清登录态并跳登录。
// requestRaw 为低层请求，auth.js 复用，避免登录接口重复一套请求逻辑。
const { API_BASE, API_PREFIX } = require('./env');

const DEFAULT_TIMEOUT = 20000;
let handling401 = false;

// 延迟 require 打破 auth.js <-> request.js 循环依赖
function getToken() { return require('./auth').getToken(); }
function clearLogin() {
  var auth = require('./auth');
  auth.clearToken();
  auth.clearUser();
}

function handleUnauthorized() {
  if (handling401) return;
  handling401 = true;
  clearLogin();
  var pages = getCurrentPages();
  var top = pages[pages.length - 1];
  var onLogin = top && top.route && top.route.indexOf('login') >= 0;
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

function apiError(res) {
  var message = '请求失败';
  var body = null;
  try {
    body = res.data;
    if (body && body.message) message = body.message;
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
      throw err;
    });
}

function get(path, opts) {
  return request('GET', path, undefined, opts);
}

function post(path, data, opts) {
  return request('POST', path, data, opts);
}

module.exports = { requestRaw: requestRaw, get: get, post: post };
