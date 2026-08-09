// utils/auth.js
// 登录态管理：token / user 的存取，登录与退出，静默登录判断
const { requestRaw } = require('./request');

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

// 本地缓存盐：优先用户 id，缺失时用 token 尾部，保证跨账号隔离
function userSalt() {
  var u = getUser() || {};
  var id = u.studentId || u.student_id || u.id || u.student_number || '';
  if (id) return String(id);
  var t = getToken() || '';
  return t ? t.slice(-8) : '';
}

// 登录：identifier 支持 用户名 / 学号 / 邮箱；isPersistent=记住我 180 天
function login(identifier, password, remember) {
  return requestRaw('POST', '/auth/login', {
    identifier: identifier,
    password: password,
    isPersistent: remember
  }).then(function (res) {
    if (res.data && res.data.token) {
      setToken(res.data.token);
      setUser(res.data.user);
      return res.data;
    }
    var err = new Error((res.data && res.data.message) || '登录失败');
    err.status = res.statusCode;
    throw err;
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
  isLoggedIn: isLoggedIn,
  userSalt: userSalt
};
