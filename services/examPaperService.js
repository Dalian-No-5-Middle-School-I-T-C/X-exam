// services/examPaperService.js
// 原卷与答案解析业务层：一个 JSON 请求 + 原卷页图片下载（带 Bearer，落临时文件）。
// 图片下载与页面解耦：页面只管把 imageUrl 列表交给本服务，取消/并发/失败计数都在此收敛。
'use strict';

const request = require('../utils/request');
const { getToken } = require('../utils/auth');
const { API_BASE } = require('../utils/env');

const CONCURRENCY = 3;

function fetchPaper(examId) {
  return request.get('/scores/me/exams/' + encodeURIComponent(examId) + '/paper');
}

// imageUrl 已由后端给出 /api 前缀，这里只补域名
function absoluteUrl(imageUrl) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(imageUrl)) return imageUrl;
  return API_BASE + imageUrl;
}

// items: [{ key, url }] → Promise<{ paths: {key: tempFilePath}, failed: number, cancelled: boolean }>
// 顺序无关（调用方按 key 落位）；页面卸载后调用 cancel()，已完成的图片仍会返回。
function downloadImages(items) {
  const list = (Array.isArray(items) ? items : []).filter(function (it) {
    return it && it.key && it.url;
  });
  if (list.length === 0) {
    return Promise.resolve({ paths: {}, failed: 0, cancelled: false });
  }
  const token = getToken();
  if (!token) {
    return Promise.resolve({ paths: {}, failed: list.length, cancelled: false });
  }

  const paths = {};
  let failed = 0;
  let cancelled = false;
  let index = 0;
  let running = 0;
  let finish;
  const done = new Promise(function (resolve) { finish = resolve; });

  const settle = function () {
    if (running === 0) finish({ paths: paths, failed: failed, cancelled: cancelled });
  };
  const next = function () {
    if (cancelled) { settle(); return; }
    if (index >= list.length) { settle(); return; }
    const item = list[index++];
    running++;
    wx.downloadFile({
      url: absoluteUrl(item.url),
      header: { 'Authorization': 'Bearer ' + token },
      success: function (res) {
        if (res.statusCode === 200 && res.tempFilePath) paths[item.key] = res.tempFilePath;
        else failed++;
        running--;
        next();
      },
      fail: function () {
        failed++;
        running--;
        next();
      }
    });
  };

  for (let i = 0; i < Math.min(CONCURRENCY, list.length); i++) next();

  return Object.assign(done, {
    cancel: function () {
      cancelled = true;
      // 无在途请求时立即结算；有在途请求时由最后一个回调触发 settle
      if (running === 0) finish({ paths: paths, failed: failed, cancelled: true });
    }
  });
}

module.exports = {
  fetchPaper: fetchPaper,
  downloadImages: downloadImages,
  absoluteUrl: absoluteUrl
};
