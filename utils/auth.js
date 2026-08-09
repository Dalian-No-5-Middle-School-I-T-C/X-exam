// utils/auth.js
// 登录态管理：token / user 的存取，登录与登出，静默登录判断
const { API_BASE, API_PREFIX } = require('./env');

const TOKEN_KEY = 'px_token';
const USER_KEY = 'px_user';

function getToken() {
  try { return wx.getStorageSync(TOKEN_KEY) || null; } catch (e) { return null; }
}
function setToken(t) {
  try { wx.setStorageSync(TOKEN_KEY, t); } catch (e) { /* ignore */ }
}
function clearToken() {
  try { wx.removeStorageSync(TOKEN_KEY); } catch (e) { /* ignore */ }
}
function getUser() {
  try { return wx.getStorageSync(USER_KEY) || null; } catch (e) { return null; }
}
function setUser(u) {
  try { wx.setStorageSync(USER_KEY, u); } catch (e) { /* ignore */ }
}
function clearUser() {
  try { wx.removeStorageSync(USER_KEY); } catch (e) { /* ignore */ }
}

// 登录：identifier 支持 用户名 / 学号 / 邮箱；isPersistent=记住我(180天)
function login(identifier, password, remember) {
  return new Promise(function (resolve, reject) {
    wx.request({
      url: API_BASE + API_PREFIX + '/auth/login',
      method: 'POST',
      data: { identifier: identifier, password: password, isPersistent: remember },
      header: { 'content-type': 'application/json' },
      success: function (res) {
        if (res.statusCode === 200 && res.data && res.data.token) {
          setToken(res.data.token);
          setUser(res.data.user);
          resolve(res.data);
        } else {
          let msg = '登录失败';
          try { if (res.data && res.data.message) msg = res.data.message; } catch (e) { /* ignore */ }
          const err = new Error(msg);
          err.status = res.statusCode;
          reject(err);
        }
      },
      fail: function () { reject(new Error('网络异常，请检查连接')); }
    });
  });
}

function logout() {
  clearToken();
  clearUser();
}

// 静默登录：有 token 即视为已登录（真实有效性由接口 401 判定）
function isLoggedIn() {
  return !!getToken();
}

module.exports = {
  getToken: getToken,
  setToken: setToken,
  clearToken: clearToken,
  getUser: getUser,
  setUser: setUser,
  clearUser: clearUser,
  login: login,
  logout: logout,
  isLoggedIn: isLoggedIn
};
