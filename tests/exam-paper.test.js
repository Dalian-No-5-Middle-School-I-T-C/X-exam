'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ---------- wx stub（必须在 require 业务模块之前装好） ----------
let downloadCalls = [];
let pending = [];
let failUrls = new Set();
let badStatusUrls = new Set();
let previews = [];

function resetDownloads() {
  downloadCalls = [];
  pending = [];
  failUrls = new Set();
  badStatusUrls = new Set();
}

function fire(opts, statusCode) {
  const i = pending.indexOf(opts);
  if (i >= 0) pending.splice(i, 1);
  if (failUrls.has(opts.url)) { opts.fail({ errMsg: 'downloadFile:fail' }); return; }
  opts.success({ statusCode: statusCode, tempFilePath: 'wxfile://tmp-' + downloadCalls.indexOf(opts) });
}

function fireAll(statusCode) {
  while (pending.length) fire(pending[0], statusCode === undefined ? 200 : statusCode);
}

global.wx = {
  getStorageSync: k => (k === 'px_token' ? 'tok-1' : ''),
  setStorageSync: () => {},
  removeStorageSync: () => {},
  showToast: () => {},
  stopPullDownRefresh: () => {},
  previewImage: opts => { previews.push(opts); },
  downloadFile: opts => { downloadCalls.push(opts); pending.push(opts); }
};

const request = require('../utils/request');
const examPaperService = require('../services/examPaperService');
const { normalizePaper, answerRows, decorate } = require('../utils/examPaper');

const flush = () => new Promise(resolve => setImmediate(resolve));

function capture(modulePath) {
  let def = null;
  global.Page = obj => { def = obj; };
  require(modulePath);
  delete global.Page;
  assert.ok(def, 'Page was not registered by ' + modulePath);
  return def;
}

function makePage(def) {
  const page = Object.assign({}, def, { data: JSON.parse(JSON.stringify(def.data)) });
  page.setData = function (patch) { Object.assign(this.data, patch); };
  return page;
}

const examPaperDef = capture('../pages/exam-paper/exam-paper.js');

let getStub = async () => { throw new Error('get 未打桩'); };
request.get = (...args) => getStub(...args);

function paperUrl(examId, page) {
  return '/api/scores/me/exams/' + examId + '/paper/pages/' + page + '/image';
}

function paperPayload(overrides) {
  return Object.assign({
    examId: 5,
    examName: '月考',
    subject: '数学',
    hasOriginalPaper: true,
    pages: [
      {
        pageIndex: 1, filename: 'original.jpg', mimeType: 'image/jpeg', isImage: true,
        imageUrl: paperUrl(5, 1),
        answers: [{ questionNumber: 2, answerText: 'B', pageIndex: 1 }]
      },
      {
        pageIndex: 2, filename: 'original-2.pdf', mimeType: 'application/pdf', isImage: false,
        imageUrl: paperUrl(5, 2),
        answers: [{ questionNumber: 1, answerText: '  大于  90  ', pageIndex: 2 }]
      }
    ],
    answers: [
      { questionNumber: 2, answerText: 'B', pageIndex: 1 },
      { questionNumber: 1, answerText: '大于 90', pageIndex: 2 }
    ],
    answerBlocks: [
      { id: '9', imageUrl: '/api/answer-block-crops/9/image', blockTitle: '第 1 题', questionNumbers: [1] }
    ]
  }, overrides || {});
}

// ---------- utils/examPaper ----------
test('normalizePaper accepts snake/camel fields and attaches answers to their page', () => {
  const p = normalizePaper(paperPayload());
  assert.equal(p.examId, 5);
  assert.equal(p.examName, '月考');
  assert.equal(p.hasOriginalPaper, true);
  assert.deepEqual(p.pages.map(x => x.pageIndex), [1, 2]);
  assert.deepEqual(p.pages[0].rows, [{ key: 'q-2', label: '第 2 题', text: 'B' }]);
  // 空白折叠：老师手打的多余空格不上屏
  assert.deepEqual(p.pages[1].rows, [{ key: 'q-1', label: '第 1 题', text: '大于 90' }]);
  assert.equal(p.pages[1].isImage, false);
  assert.deepEqual(p.rows.map(r => r.label), ['第 1 题', '第 2 题']);
  assert.equal(p.blocks[0].title, '第 1 题');
});

test('normalizePaper reads snake_case payloads too', () => {
  const p = normalizePaper({
    exam_id: 7, exam_name: '期中', hasOriginalPaper: 0,
    pages: [{ page_index: 1, mime_type: 'image/png', is_image: 1, image_url: paperUrl(7, 1),
      answers: [{ question_number: 3, answer_text: 'ABC', page_index: 1 }] }],
    answer_blocks: [{ id: 12, image_url: '/api/answer-block-crops/12/image', question_numbers: [12] }]
  });
  assert.equal(p.examId, 7);
  assert.equal(p.hasOriginalPaper, false);
  assert.equal(p.pages[0].isImage, true);
  assert.deepEqual(p.pages[0].rows, [{ key: 'q-3', label: '第 3 题', text: 'ABC' }]);
  assert.equal(p.blocks[0].id, '12');
  assert.equal(p.blocks[0].title, '第 12 题'); // 无 blockTitle 时用题号兜底
});

test('normalizePaper falls back to pages length and drops unusable blocks', () => {
  assert.equal(normalizePaper({ pages: [{ page_index: 1 }] }).hasOriginalPaper, true);
  assert.equal(normalizePaper({}).hasOriginalPaper, false);
  const p = normalizePaper({
    pages: [],
    answer_blocks: [{ id: '', image_url: '/a' }, { id: '3', image_url: '' }, { id: '4', image_url: '/b' }]
  });
  assert.deepEqual(p.blocks.map(b => b.id), ['4']);
  assert.equal(p.blocks[0].title, '作答'); // 无题号也不伪造题号
});

test('answerRows keeps blank and unnumbered answers honest', () => {
  assert.deepEqual(answerRows([]), []);
  const rows = answerRows([
    { question_number: 5, answer_text: '  ' },
    { answer_text: '略', question_number: null },
    { question_number: 1, answer_text: 'A' }
  ]);
  assert.deepEqual(rows, [
    { key: 'q-1', label: '第 1 题', text: 'A' },
    { key: 'q-x', label: '答案', text: '略' }
  ]);
});

test('decorate fills urls by key and drops images without a temp file', () => {
  const paper = normalizePaper(paperPayload());
  const view = decorate(paper, { p1: '/tmp/a.jpg', b9: '/tmp/b.jpg' });
  assert.deepEqual(view.pages.map(p => p.url), ['/tmp/a.jpg']);
  assert.deepEqual(view.blocks.map(b => b.url), ['/tmp/b.jpg']);
  // 页面图片仍保留答案行（只掉图不掉答案）
  assert.deepEqual(view.pages[0].rows, [{ key: 'q-2', label: '第 2 题', text: 'B' }]);
  assert.deepEqual(decorate(paper, {}).pages, []);
});

// ---------- services/examPaperService ----------
test('fetchPaper hits the student paper endpoint', async () => {
  let url = '';
  getStub = async (u) => { url = u; return { ok: true }; };
  assert.deepEqual(await examPaperService.fetchPaper(5), { ok: true });
  assert.equal(url, '/scores/me/exams/5/paper');
});

test('absoluteUrl only adds the domain', () => {
  assert.equal(examPaperService.absoluteUrl('/api/a/b'), 'https://dl5zx.cn/api/a/b');
  assert.equal(examPaperService.absoluteUrl('https://cdn.x/a.png'), 'https://cdn.x/a.png');
});

test('downloadImages caps concurrency at 3 and sends the bearer header', async () => {
  resetDownloads();
  const items = [1, 2, 3, 4, 5].map(i => ({ key: 'p' + i, url: '/api/x' + i }));
  const p = examPaperService.downloadImages(items);
  await flush();
  assert.equal(downloadCalls.length, 3);
  assert.equal(downloadCalls[0].url, 'https://dl5zx.cn/api/x1');
  assert.equal(downloadCalls[0].header.Authorization, 'Bearer tok-1');

  fire(pending[0], 200);
  assert.equal(downloadCalls.length, 4);
  fireAll(200);
  const res = await p;
  assert.equal(res.failed, 0);
  assert.deepEqual(Object.keys(res.paths).sort(), ['p1', 'p2', 'p3', 'p4', 'p5']);
});

test('downloadImages counts fail-callback and non-200 downloads', async () => {
  resetDownloads();
  failUrls.add('https://dl5zx.cn/api/y2');
  const p = examPaperService.downloadImages([
    { key: 'a', url: '/api/y1' }, { key: 'b', url: '/api/y2' },
    { key: 'c', url: '/api/y3' }, { key: '', url: '/api/y4' }
  ]);
  await flush();
  assert.equal(downloadCalls.length, 3); // key 为空的条目直接过滤
  fire(pending[0], 200);
  fire(pending[0], 200); // b 命中 failUrls：走 fail 回调
  fire(pending[0], 403); // c 非 200 不算成功
  const res = await p;
  assert.equal(res.failed, 2);
  assert.deepEqual(Object.keys(res.paths), ['a']);
});

test('downloadImages resolves empty lists and skips downloads without a token', async () => {
  resetDownloads();
  assert.deepEqual(await examPaperService.downloadImages([]), { paths: {}, failed: 0, cancelled: false });
  getStub = async () => ({});
  const saved = global.wx.getStorageSync;
  global.wx.getStorageSync = () => '';
  const res = await examPaperService.downloadImages([{ key: 'a', url: '/api/x' }]);
  global.wx.getStorageSync = saved;
  assert.deepEqual(res, { paths: {}, failed: 1, cancelled: false });
  assert.equal(downloadCalls.length, 0);
});

test('downloadImages cancel stops picking up new work but keeps finished files', async () => {
  resetDownloads();
  const p = examPaperService.downloadImages([
    { key: 'a', url: '/api/z1' }, { key: 'b', url: '/api/z2' }, { key: 'c', url: '/api/z3' }
  ]);
  await flush();
  assert.equal(downloadCalls.length, 3);
  p.cancel();
  fire(pending[0], 200);
  assert.equal(downloadCalls.length, 3); // 不再派发后续请求
  fireAll(200);
  const res = await p;
  assert.equal(res.cancelled, true);
  assert.equal(Object.keys(res.paths).length, 3);
});

// ---------- pages/exam-paper ----------
test('exam-paper onLoad rejects a missing examId without calling the API', async () => {
  resetDownloads();
  getStub = async () => { throw new Error('不应发起请求'); };
  const page = makePage(examPaperDef);
  page.onLoad({});
  assert.equal(page.data.error, '参数缺失，无法加载原卷');
  assert.equal(page.data.loading, false);
});

test('exam-paper.load renders pages, per-page answers and my blocks', async () => {
  resetDownloads();
  previews = [];
  getStub = async () => paperPayload();
  const page = makePage(examPaperDef);
  page.onLoad({ examId: '5', name: encodeURIComponent('月考') });
  await flush();
  fireAll(200);
  await flush();
  assert.equal(page.data.examName, '月考');
  assert.equal(page.data.subject, '数学');
  assert.equal(page.data.loading, false);
  assert.equal(page.data.error, '');
  assert.deepEqual(page.data.rows.map(r => r.label), ['第 1 题', '第 2 题']);
  assert.deepEqual(page.data.pages.map(p => p.pageIndex), [1, 2]);
  assert.deepEqual(page.data.pages[1].rows, [{ key: 'q-1', label: '第 1 题', text: '大于 90' }]);
  assert.equal(page.data.pages[0].url, 'wxfile://tmp-0');
  assert.equal(page.data.blocks.length, 1);
  assert.equal(page.data.imagesUnavailable, false);
  assert.equal(downloadCalls.length, 3); // 2 张原卷页 + 1 张作答图块
});

test('exam-paper keeps answers visible when every paper image fails', async () => {
  resetDownloads();
  getStub = async () => paperPayload();
  const page = makePage(examPaperDef);
  page.onLoad({ examId: '5' });
  await flush();
  fireAll(500);
  await flush();
  assert.equal(page.data.pages.length, 0);
  assert.equal(page.data.imagesUnavailable, true);
  assert.equal(page.data.error, '');
  assert.equal(page.data.rows.length, 2); // 图挂了也不影响逐题答案
});

test('exam-paper shows 原卷未上传 when the teacher never uploaded a paper', async () => {
  resetDownloads();
  getStub = async () => paperPayload({ hasOriginalPaper: false, pages: [], answerBlocks: [] });
  const page = makePage(examPaperDef);
  page.onLoad({ examId: '5' });
  await flush();
  await flush();
  assert.equal(page.data.hasOriginalPaper, false);
  assert.equal(page.data.imagesUnavailable, false);
  assert.equal(page.data.pages.length, 0);
  assert.equal(downloadCalls.length, 0);
  assert.equal(page.data.loading, false);
});

test('exam-paper surfaces request errors', async () => {
  resetDownloads();
  getStub = async () => { throw new Error('成绩尚未公布'); };
  const page = makePage(examPaperDef);
  page.onLoad({ examId: '5' });
  await flush();
  assert.equal(page.data.error, '成绩尚未公布');
  assert.equal(page.data.loading, false);
});

test('exam-paper.onUnload cancels in-flight downloads and blocks late setData', async () => {
  resetDownloads();
  getStub = async () => paperPayload();
  const page = makePage(examPaperDef);
  page.onLoad({ examId: '5' });
  await flush();
  page.onUnload();
  const written = {};
  const realSetData = page.setData.bind(page);
  page.setData = patch => { Object.assign(written, patch); realSetData(patch); };
  fireAll(200);
  await flush();
  assert.equal(written.pages, undefined);
  assert.equal(page.data.pages.length, 0);
});

test('exam-paper.onPreview previews only downloaded images', async () => {
  const page = makePage(examPaperDef);
  page.setData({ pages: [{ url: '/tmp/a' }, { url: '' }] });
  page.onPreview({ currentTarget: { dataset: { index: '0' } } });
  assert.deepEqual(previews, [{ current: '/tmp/a', urls: ['/tmp/a'] }]);
});

// ---------- 入口串联（模板与处理函数同名，否则点了没反应） ----------
test('score-card 用独立事件抛出「查看原卷」，不与整卡 cardtap 混流', () => {
  let def = null;
  global.Component = obj => { def = obj; };
  require('../components/score-card/score-card.js');
  delete global.Component;
  const events = [];
  const instance = {
    data: { score: { exam_id: 12 } },
    triggerEvent: (name, payload) => events.push([name, payload])
  };
  def.methods.onTap.call(instance);
  def.methods.onPaperTap.call(instance);
  assert.deepEqual(events, [['cardtap', { id: 12 }], ['papertap', { id: 12 }]]);
});

test('成绩列表与详情页的原卷入口都已接上，且入口受 paper_visible 控制', () => {
  const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const card = read('components/score-card/score-card.wxml');
  assert.match(card, /catchtap="onPaperTap"/);
  assert.match(card, /paper_visible == 1/);
  assert.match(read('pages/scores/scores.wxml'), /bind:papertap="goPaper"/);
  assert.match(read('pages/scores/scores.js'), /goPaper: function/);
  assert.match(read('pages/detail/detail.wxml'), /bindtap="goPaper"/);
  assert.match(read('pages/detail/detail.js'), /goPaper: function/);
  assert.ok(JSON.parse(read('app.json')).pages.includes('pages/exam-paper/exam-paper'));
});
