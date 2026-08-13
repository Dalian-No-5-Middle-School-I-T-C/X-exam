'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const store = {};
let requestCalls = [];
let relaunchCalls = [];
let currentPage = { route: 'pages/foo/foo' };
let holdReLaunch = false;
const heldReLaunch = [];

global.wx = {
  getStorageSync: k => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v; },
  removeStorageSync: k => { delete store[k]; },
  request: opts => { requestCalls.push(opts); opts.success({ statusCode: 200, data: {} }); },
  reLaunch: opts => {
    relaunchCalls.push(opts);
    if (holdReLaunch) heldReLaunch.push(opts);
    else if (opts.complete) opts.complete();
  }
};
global.getCurrentPages = () => [currentPage];

const auth = require('../utils/auth');
const request = require('../utils/request');

function flushHeld() {
  heldReLaunch.splice(0).forEach(o => o.complete && o.complete());
}

test('token: memory + persistent storage', () => {
  auth.clearToken();
  auth.setToken('t1', true);
  assert.equal(store.px_token, 't1');
  assert.equal(auth.getToken(), 't1');
  auth.setToken('t2', false); // 会话登录：仅内存，不落 Storage
  assert.equal(store.px_token, undefined);
  assert.equal(auth.getToken(), 't2');
  auth.clearToken();
  assert.equal(auth.getToken(), null);
});

test('user: memory + persistent storage', () => {
  auth.clearUser();
  auth.setUser({ name: 'A' }, true);
  assert.deepEqual(store.px_user, { name: 'A' });
  assert.deepEqual(auth.getUser(), { name: 'A' });
  auth.setUser({ name: 'B' }, false);
  assert.equal(store.px_user, undefined);
  assert.deepEqual(auth.getUser(), { name: 'B' });
  auth.clearUser();
  assert.equal(auth.getUser(), null);
});

test('isLoggedIn reflects token presence', () => {
  auth.clearToken();
  assert.equal(auth.isLoggedIn(), false);
  auth.setToken('x', true);
  assert.equal(auth.isLoggedIn(), true);
  auth.clearToken();
});

test('userSalt prefers user id over token tail', () => {
  auth.clearToken();
  auth.clearUser();
  assert.equal(auth.userSalt(), '');
  auth.setToken('abcdefgh12345678', true);
  assert.equal(auth.userSalt(), '12345678');
  auth.setUser({ student_id: 42 }, true);
  assert.equal(auth.userSalt(), '42');
  auth.setUser({ id: 'u7' }, true);
  assert.equal(auth.userSalt(), 'u7');
  auth.setUser({ student_number: 20260101 }, true);
  assert.equal(auth.userSalt(), '20260101');
});

test('auth degrades gracefully when storage throws', () => {
  auth.clearToken();
  auth.clearUser();
  const realWx = global.wx;
  global.wx = {
    getStorageSync() { throw new Error('boom'); },
    setStorageSync() { throw new Error('boom'); },
    removeStorageSync() { throw new Error('boom'); }
  };
  try {
    assert.equal(auth.getToken(), null);
    assert.equal(auth.getUser(), null);
    auth.setToken('x', true); // 不抛错
    auth.setUser({ id: 1 }, true); // 不抛错
  } finally {
    global.wx = realWx;
  }
  auth.clearToken();
  auth.clearUser();
});

test('login stores token/user on success', async () => {
  auth.clearToken();
  auth.clearUser();
  requestCalls = [];
  global.wx.request = opts => {
    requestCalls.push(opts);
    opts.success({
      statusCode: 200,
      data: { token: 'tk', user: { id: 9 }, passwordChangeRequired: true }
    });
  };
  const res = await auth.login('u', 'p', true);
  assert.deepEqual(res, { token: 'tk', user: { id: 9 }, passwordChangeRequired: true });
  assert.equal(store.px_token, 'tk');
  assert.deepEqual(store.px_user, { id: 9 });
  assert.equal(requestCalls[0].url, 'https://dl5zx.cn/api/auth/login');
  assert.deepEqual(requestCalls[0].data, { identifier: 'u', password: 'p', isPersistent: true });
});

test('login rejects with status and server message', async () => {
  auth.clearToken();
  auth.clearUser();
  global.wx.request = opts => opts.success({ statusCode: 401, data: { message: '账号或密码错误' } });
  await assert.rejects(auth.login('u', 'p', false), err => {
    assert.equal(err.status, 401);
    assert.equal(err.message, '账号或密码错误');
    return true;
  });
  assert.equal(auth.getToken(), null);
});

test('requestRaw builds URL and passes options', async () => {
  let captured;
  global.wx.request = opts => { captured = opts; opts.success({ statusCode: 204, data: '' }); };
  await request.requestRaw('DELETE', '/z', undefined, {
    header: { h: 1 }, responseType: 'arraybuffer', timeout: 5
  });
  assert.equal(captured.url, 'https://dl5zx.cn/api/z');
  assert.equal(captured.method, 'DELETE');
  assert.equal(captured.header.h, 1);
  assert.equal(captured.responseType, 'arraybuffer');
  assert.equal(captured.timeout, 5);
});

test('requestRaw rejects non-2xx with status/body/message', async () => {
  global.wx.request = opts => opts.success({ statusCode: 500, data: { message: '炸了' } });
  await assert.rejects(request.requestRaw('GET', '/x'), err => {
    assert.equal(err.status, 500);
    assert.equal(err.message, '炸了');
    assert.deepEqual(err.body, { message: '炸了' });
    return true;
  });
});

test('requestRaw maps network failure to status 0', async () => {
  global.wx.request = opts => opts.fail({ errMsg: 'request:fail timeout' });
  await assert.rejects(request.requestRaw('GET', '/x'), err => {
    assert.equal(err.status, 0);
    assert.equal(err.message, 'request:fail timeout');
    return true;
  });
});

test('get adds Bearer header and returns body', async () => {
  auth.setToken('sekret', true);
  let captured;
  global.wx.request = opts => { captured = opts; opts.success({ statusCode: 200, data: { fine: true } }); };
  const data = await request.get('/scores/me');
  assert.equal(data.fine, true);
  assert.equal(captured.header.Authorization, 'Bearer sekret');
  assert.equal(captured.timeout, 20000);
  auth.clearToken();
});

test('post sends method and data', async () => {
  let captured;
  global.wx.request = opts => { captured = opts; opts.success({ statusCode: 200, data: {} }); };
  await request.post('/auth/logout', { x: 1 });
  assert.equal(captured.method, 'POST');
  assert.deepEqual(captured.data, { x: 1 });
});

test('401 clears login and reLaunches once', async () => {
  auth.setToken('t', true);
  auth.setUser({ id: 1 }, true);
  currentPage = { route: 'pages/scores/scores' };
  relaunchCalls = [];
  global.wx.request = opts => opts.success({ statusCode: 401, data: {} });
  await assert.rejects(request.get('/x'), err => err.status === 401);
  assert.equal(auth.getToken(), null);
  assert.equal(auth.getUser(), null);
  assert.deepEqual(relaunchCalls.map(c => c.url), ['/pages/login/login']);
  auth.clearToken();
  auth.clearUser();
});

test('401 on login page does not reLaunch', async () => {
  auth.setToken('t', true);
  currentPage = { route: 'pages/login/login' };
  relaunchCalls = [];
  global.wx.request = opts => opts.success({ statusCode: 401, data: {} });
  await assert.rejects(request.get('/x'), err => err.status === 401);
  assert.deepEqual(relaunchCalls, []);
  auth.clearToken();
});

test('concurrent 401s reLaunch only once until complete', async () => {
  auth.setToken('t', true);
  currentPage = { route: 'pages/scores/scores' };
  relaunchCalls = [];
  holdReLaunch = true;
  try {
    global.wx.request = opts => opts.success({ statusCode: 401, data: {} });
    await Promise.all([
      request.get('/a').catch(() => {}),
      request.get('/b').catch(() => {})
    ]);
    assert.equal(relaunchCalls.length, 1);
    flushHeld();
    holdReLaunch = false;
    await request.get('/c').catch(() => {});
    assert.equal(relaunchCalls.length, 2);
  } finally {
    holdReLaunch = false;
    auth.clearToken();
  }
});

test('428 routes to change-password page once', async () => {
  auth.setToken('t', true);
  currentPage = { route: 'pages/scores/scores' };
  relaunchCalls = [];
  global.wx.request = opts => opts.success({ statusCode: 428, data: {} });
  await assert.rejects(request.get('/x'), err => err.status === 428);
  assert.deepEqual(relaunchCalls.map(c => c.url), ['/pages/change-password/change-password']);
  auth.clearToken();
});

test('428 on change-password page does not reLaunch', async () => {
  auth.setToken('t', true);
  currentPage = { route: 'pages/change-password/change-password' };
  relaunchCalls = [];
  global.wx.request = opts => opts.success({ statusCode: 428, data: {} });
  await assert.rejects(request.get('/x'), err => err.status === 428);
  assert.deepEqual(relaunchCalls, []);
  auth.clearToken();
});

test('other statuses do not trigger navigation', async () => {
  auth.setToken('t', true);
  currentPage = { route: 'pages/scores/scores' };
  relaunchCalls = [];
  global.wx.request = opts => opts.success({ statusCode: 403, data: { message: 'no' } });
  await assert.rejects(request.get('/x'), err => err.status === 403);
  assert.deepEqual(relaunchCalls, []);
  auth.clearToken();
});
