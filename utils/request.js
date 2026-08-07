// utils/request.js
// 统一封装 wx.request：自动带 Bearer，401 清 token 并跳登录
const { getToken, clearToken } = require('./auth');
const { API_BASE, API_PREFIX } = require('./env');

function request(method, path, data) {
  return new Promise(function (resolve, reject) {
    const token = getToken();
    const header = { 'content-type': 'application/json' };
    if (token) header['Authorization'] = 'Bearer ' + token;

    wx.request({
      url: API_BASE + API_PREFIX + path,
      method: method,
      data: data,
      header: header,
      success: function (res) {
        const status = res.statusCode;
        if (status >= 200 && status < 300) {
          resolve(res.data);
          return;
        }
        let message = '请求失败';
        let body = null;
        try {
          body = res.data;
          if (body && body.message) message = body.message;
        } catch (e) { /* ignore */ }
        if (status === 401) {
          clearToken();
          const pages = getCurrentPages();
          const top = pages[pages.length - 1];
          const onLogin = top && top.route && top.route.indexOf('login') >= 0;
          if (!onLogin) {
            wx.reLaunch({ url: '/pages/login/login' });
          }
        }
        const err = new Error(message);
        err.status = status;
        err.body = body;
        reject(err);
      },
      fail: function (err) {
        const e = new Error((err && err.errMsg) || '网络异常，请检查连接');
        e.status = 0;
        reject(e);
      }
    });
  });
}

function get(path) {
  return request('GET', path);
}

function post(path, data) {
  return request('POST', path, data);
}

// 二进制资源（如原卷图）：带鉴权头拉取，返回 { buffer, contentType }
// 用于 <image> 无法附加 Authorization 头的场景——字节经本地转 base64，token 不进 URL
function getBuffer(path) {
  return new Promise(function (resolve, reject) {
    const token = getToken();
    const header = { 'content-type': 'application/json' };
    if (token) header['Authorization'] = 'Bearer ' + token;

    wx.request({
      url: API_BASE + API_PREFIX + path,
      method: 'GET',
      responseType: 'arraybuffer',
      header: header,
      success: function (res) {
        const status = res.statusCode;
        if (status >= 200 && status < 300) {
          const rawType = (res.header && (res.header['Content-Type'] || res.header['content-type'])) || 'image/png';
          resolve({ buffer: res.data, contentType: rawType.split(';')[0] });
          return;
        }
        if (status === 401) {
          clearToken();
          const pages = getCurrentPages();
          const top = pages[pages.length - 1];
          const onLogin = top && top.route && top.route.indexOf('login') >= 0;
          if (!onLogin) {
            wx.reLaunch({ url: '/pages/login/login' });
          }
        }
        const err = new Error('资源加载失败');
        err.status = status;
        reject(err);
      },
      fail: function (err) {
        const e = new Error((err && err.errMsg) || '网络异常，请检查连接');
        e.status = 0;
        reject(e);
      }
    });
  });
}

module.exports = { get, post, getBuffer };
