'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const store = {};
global.wx = {
  getStorageSync: key => (key in store ? store[key] : ''),
  setStorageSync: (key, value) => { store[key] = value; },
  removeStorageSync: key => { delete store[key]; },
  reLaunch: () => {}
};

const auth = require('../utils/auth');
const share = require('../growth/share');
const privacy = require('../utils/privacy');

test('share links omit personal identifiers', () => {
  auth.setUser({ studentId: '20260001', schoolCode: 'DL5Z' }, false);
  const query = share.buildShareQuery({ examId: 7 });
  assert.equal(query, 'school=DL5Z&examId=7');
  assert.ok(!query.includes('inviter'));
  assert.ok(!query.includes('20260001'));
  auth.clearUser();
});

test('privacy authorization resolves when accepted', async () => {
  global.wx.requirePrivacyAuthorize = ({ success }) => success();
  await new Promise((resolve, reject) => privacy.requirePrivacyAuthorize(resolve, reject));
  delete global.wx.requirePrivacyAuthorize;
});

test('privacy authorization rejects when declined or unavailable due to an error', async () => {
  global.wx.requirePrivacyAuthorize = ({ fail }) => fail({ errMsg: 'requirePrivacyAuthorize:fail reject' });
  await assert.rejects(new Promise((resolve, reject) => privacy.requirePrivacyAuthorize(resolve, reject)));
  global.wx.requirePrivacyAuthorize = () => { throw new Error('unavailable'); };
  await assert.rejects(new Promise((resolve, reject) => privacy.requirePrivacyAuthorize(resolve, reject)));
  delete global.wx.requirePrivacyAuthorize;
});

test('privacy authorization supports older base libraries', async () => {
  await new Promise((resolve, reject) => privacy.requirePrivacyAuthorize(resolve, reject));
});

function captureLoginPage() {
  let definition;
  global.Page = page => { definition = page; };
  const pagePath = require.resolve('../pages/login/login.js');
  delete require.cache[pagePath];
  require(pagePath);
  delete global.Page;
  return definition;
}

function makePage(definition) {
  const page = Object.assign({}, definition, { data: JSON.parse(JSON.stringify(definition.data)) });
  page.setData = patch => Object.assign(page.data, patch);
  return page;
}

test('login requires privacy authorization and defaults to session-only login', async () => {
  const originalLogin = auth.login;
  const originalAuthorize = privacy.requirePrivacyAuthorize;
  let calls = 0;
  auth.login = async (identifier, password, remember) => {
    calls++;
    assert.equal(identifier, 'student');
    assert.equal(password, 'password');
    assert.equal(remember, false);
    return {};
  };
  privacy.requirePrivacyAuthorize = (resolve, reject) => reject(new Error('declined'));

  try {
    const page = makePage(captureLoginPage());
    page.setData({ identifier: 'student', password: 'password' });
    assert.equal(page.data.remember, false);
    await page.onLogin();
    assert.equal(calls, 0);
    assert.equal(page.data.error, '需同意隐私保护指引后才能登录');
    assert.equal(page.data.loading, false);

    privacy.requirePrivacyAuthorize = resolve => resolve();
    await page.onLogin();
    assert.equal(calls, 1);
  } finally {
    auth.login = originalLogin;
    privacy.requirePrivacyAuthorize = originalAuthorize;
  }
});
