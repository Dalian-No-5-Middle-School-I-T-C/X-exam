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
let toasts = [];
let opened = [];
let loadings = 0;
let openDocumentFails = false;

function resetDownloads() {
  downloadCalls = [];
  pending = [];
  failUrls = new Set();
  badStatusUrls = new Set();
}

function resetOpen() {
  toasts = [];
  opened = [];
  loadings = 0;
  openDocumentFails = false;
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
  showToast: opts => { toasts.push(opts.title); },
  stopPullDownRefresh: () => {},
  showLoading: opts => { loadings += 1; },
  hideLoading: () => { loadings -= 1; },
  openDocument: opts => {
    if (openDocumentFails) { opts.fail({ errMsg: 'openDocument:fail' }); return; }
    opened.push(opts);
  },
  previewImage: opts => { previews.push(opts); },
  downloadFile: opts => { downloadCalls.push(opts); pending.push(opts); }
};

const request = require('../utils/request');
const examPaperService = require('../services/examPaperService');
const {
  normalizePaper, answerRows, decorate, normalizeAnswerKeyMode, answerFileKind
} = require('../utils/examPaper');

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

function answerFileUrl(examId, page) {
  return '/api/scores/me/exams/' + examId + '/paper/answer-file/' + page;
}

// v64「原文件直接下发」：answerKeyMode=file，answerFiles 为老师上传的答案原文件
function fileModePayload(overrides) {
  return paperPayload(Object.assign({
    answerKeyMode: 'file',
    showOriginalPaper: true,
    answerFiles: [
      {
        pageIndex: 1, filename: 'answer-1.jpg', mimeType: 'image/jpeg', isImage: true,
        fileUrl: answerFileUrl(5, 1)
      },
      {
        pageIndex: 2, filename: '答案.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        isImage: false, fileUrl: answerFileUrl(5, 2)
      }
    ]
  }, overrides || {}));
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

test('sparse paper pages render as-is: answers stay under their real page numbers', () => {
  // 后端归页按原卷真实页码集合（删中间页会留下稀疏页码如 [1,3]），客户端只消费 pages[].answers
  const p = normalizePaper({
    pages: [
      { page_index: 1, image_url: paperUrl(5, 1), answers: [{ question_number: 1, answer_text: 'A', page_index: 1 }] },
      { page_index: 3, image_url: paperUrl(5, 3), answers: [{ question_number: 2, answer_text: 'B', page_index: 3 }] }
    ],
    answer_blocks: []
  });
  assert.deepEqual(p.pages.map(x => x.pageIndex), [1, 3]);
  const view = decorate(p, { p1: '/tmp/1.jpg', p3: '/tmp/3.jpg' });
  assert.deepEqual(view.pages.map(x => x.pageIndex), [1, 3]);
  assert.deepEqual(view.pages[1].rows, [{ key: 'q-2', label: '第 2 题', text: 'B' }]);
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

// ---------- v64 答案原文件直发 ----------
test('normalizeAnswerKeyMode：只有 file 是直发，其余一律回落到逐题文字', () => {
  assert.equal(normalizeAnswerKeyMode('file'), 'file');
  ['text', '', null, undefined, 'FILE', 'ocr', 0, 1].forEach(v => {
    assert.equal(normalizeAnswerKeyMode(v), 'text', String(v));
  });
});

test('answerFileKind 只认后端登记的文件名与 MIME，不去猜 URL', () => {
  assert.equal(answerFileKind('a.jpg', 'image/jpeg', false), 'image');
  assert.equal(answerFileKind('b.PNG', '', false), 'image');
  assert.equal(answerFileKind('scan', 'image/png', false), 'image'); // 无扩展名靠 MIME
  assert.equal(answerFileKind('x', '', true), 'image');              // isImage 兜底
  assert.equal(answerFileKind('a.pdf', 'application/pdf', false), 'pdf');
  assert.equal(answerFileKind('answer.docx', '', false), 'docx');
  assert.equal(answerFileKind('word.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', false), 'docx');
  // .doc 后端不收，这里也不认成 docx —— kind 同时是 wx.openDocument 的 fileType，认错就是死入口
  assert.equal(answerFileKind('老答案.doc', 'application/msword', false), 'other');
  assert.equal(answerFileKind('notes.txt', 'text/plain', false), 'other');
  assert.equal(answerFileKind('', '', false), 'other');
  // URL 里没有扩展名，不能因为路径带 .pdf 就误判
  assert.equal(answerFileKind('', '', false), 'other');
});

test('normalizePaper 在直发模式下整理答案文件（camel 与 snake 同形）', () => {
  const p = normalizePaper(fileModePayload());
  assert.equal(p.answerKeyMode, 'file');
  assert.equal(p.showOriginalPaper, true);
  assert.deepEqual(p.answerFiles.map(f => f.kind), ['image', 'docx']);
  assert.deepEqual(p.answerFiles.map(f => f.pageIndex), [1, 2]);
  assert.deepEqual(p.answerFiles.map(f => f.label), ['答案第 1 页', '答案第 2 页']);
  assert.equal(p.answerFiles[0].inline, true);
  assert.equal(p.answerFiles[1].inline, false);
  assert.equal(p.answerFiles[1].fileUrl, answerFileUrl(5, 2));

  const s = normalizePaper({
    answer_key_mode: 'file',
    show_original_paper: 0,
    answer_files: [
      { page_index: 3, filename: 'p3.pdf', mime_type: 'application/pdf', is_image: 0, file_url: answerFileUrl(7, 3) },
      { page_index: 4, filename: 'no-url.jpg', is_image: 1 } // 没有 fileUrl 的下发不了，直接丢
    ]
  });
  assert.equal(s.answerKeyMode, 'file');
  assert.equal(s.showOriginalPaper, false);
  assert.deepEqual(s.answerFiles.map(f => f.kind), ['pdf']);
  assert.deepEqual(s.answerFiles.map(f => f.pageIndex), [3]);
});

test('老响应没有 answerKeyMode / showOriginalPaper 字段时按 v54 语义处理', () => {
  const p = normalizePaper(paperPayload()); // 无 answerKeyMode、无 showOriginalPaper
  assert.equal(p.answerKeyMode, 'text');
  assert.equal(p.showOriginalPaper, true, '缺字段不能反过来把已上线的原卷段关掉');
  assert.deepEqual(p.answerFiles, []);
  assert.equal(normalizePaper({ showOriginalPaper: 0 }).showOriginalPaper, false);
  assert.equal(normalizePaper({ showOriginalPaper: false }).showOriginalPaper, false);
  assert.equal(normalizePaper({ show_original_paper: 1 }).showOriginalPaper, true);
});

test('decorate：答案内联图按 a<pageIndex> 落位，PDF/DOCX 不预取也保留', () => {
  const paper = normalizePaper(fileModePayload());
  const view = decorate(paper, { p1: '/tmp/1.jpg', a1: '/tmp/a1.jpg' });
  assert.deepEqual(view.pages.map(x => x.pageIndex), [1]);
  assert.deepEqual(view.answerFiles.map(f => f.url), ['/tmp/a1.jpg', '']);
  assert.deepEqual(view.answerFiles.map(f => f.kind), ['image', 'docx']);
  // 内联图没取到就掉，文本类文件不受影响
  const none = decorate(paper, {});
  assert.deepEqual(none.answerFiles.map(f => f.kind), ['docx']);
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

test('downloadImages early returns are cancellable (issue #15)', () => {
  resetDownloads();
  const empty = examPaperService.downloadImages([]);
  assert.equal(typeof empty.cancel, 'function');
  assert.doesNotThrow(() => empty.cancel());
  const saved = global.wx.getStorageSync;
  global.wx.getStorageSync = () => '';
  const noToken = examPaperService.downloadImages([{ key: 'a', url: '/api/x' }]);
  global.wx.getStorageSync = saved;
  assert.equal(typeof noToken.cancel, 'function');
  assert.doesNotThrow(() => noToken.cancel());
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

test('exam-paper.onUnload after a no-image load does not throw (issue #15)', async () => {
  resetDownloads();
  getStub = async () => paperPayload({ hasOriginalPaper: false, pages: [], answerBlocks: [] });
  const page = makePage(examPaperDef);
  page.onLoad({ examId: '5' });
  await flush();
  await flush();
  assert.doesNotThrow(() => page.onUnload());
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

// ---------- pages/exam-paper：答案原文件直发 ----------
test('直发模式：只预取内联答案图，PDF/DOCX 留到点击时', async () => {
  resetDownloads();
  resetOpen();
  previews = [];
  getStub = async () => fileModePayload();
  const page = makePage(examPaperDef);
  page.onLoad({ examId: '5' });
  await flush();
  fireAll(200);
  await flush();
  assert.equal(page.data.answerKeyMode, 'file');
  assert.equal(page.data.showOriginalPaper, true);
  assert.equal(page.data.loading, false);
  assert.deepEqual(downloadCalls.map(c => c.url), [
    'https://dl5zx.cn' + paperUrl(5, 1),
    'https://dl5zx.cn' + paperUrl(5, 2),
    'https://dl5zx.cn/api/answer-block-crops/9/image',
    'https://dl5zx.cn' + answerFileUrl(5, 1)
  ]);
  assert.equal(page.data.answerFiles[0].url, 'wxfile://tmp-3');
  assert.equal(page.data.answerFiles[0].inline, true);
  assert.equal(page.data.answerFiles[1].kind, 'docx');
  assert.equal(page.data.answerFiles[1].url, '');
  assert.equal(page.data.filesUnavailable, false);
  // 原卷页与逐题答案数据照旧备齐，切换展示方式不需要后端给别的字段
  assert.deepEqual(page.data.pages.map(p => p.pageIndex), [1, 2]);
  assert.equal(page.data.rows.length, 2);
});

test('直发模式：教师关了原卷，页面只出答案文件', async () => {
  resetDownloads();
  resetOpen();
  getStub = async () => fileModePayload({ showOriginalPaper: false });
  const page = makePage(examPaperDef);
  page.onLoad({ examId: '5' });
  await flush();
  fireAll(200);
  await flush();
  assert.equal(page.data.showOriginalPaper, false);
  assert.equal(page.data.answerFiles.length, 2);
  assert.deepEqual(page.data.pages, []);
  assert.equal(page.data.imagesUnavailable, false);
  assert.equal(downloadCalls.length, 2); // 只剩作答图块 + 答案内联图，原卷一张都不取
  assert.deepEqual(downloadCalls.map(c => c.url), [
    'https://dl5zx.cn/api/answer-block-crops/9/image',
    'https://dl5zx.cn' + answerFileUrl(5, 1)
  ]);
});

test('直发模式：答案图没取到要报「暂不可用」，不能空着当没上传', async () => {
  resetDownloads();
  resetOpen();
  failUrls.add('https://dl5zx.cn' + answerFileUrl(5, 1));
  getStub = async () => fileModePayload();
  const page = makePage(examPaperDef);
  page.onLoad({ examId: '5' });
  await flush();
  fireAll(200);
  await flush();
  assert.equal(page.data.filesUnavailable, true);
  assert.equal(page.data.pages.length, 2); // 原卷没事
  assert.equal(page.data.imagesUnavailable, false);
  assert.deepEqual(page.data.answerFiles.map(f => f.kind), ['docx']); // 掉图不掉文件条目
});

test('直发模式：老师没上传答案文件时走空态、不报错', async () => {
  resetDownloads();
  resetOpen();
  getStub = async () => fileModePayload({ answerFiles: [] });
  const page = makePage(examPaperDef);
  page.onLoad({ examId: '5' });
  await flush();
  fireAll(200);
  await flush();
  assert.equal(page.data.answerKeyMode, 'file');
  assert.deepEqual(page.data.answerFiles, []);
  assert.equal(page.data.filesUnavailable, false);
  assert.equal(page.data.error, '');
});

test('onPreviewAnswer 按条目取当前页，PDF 占位不会错位', () => {
  resetOpen();
  previews = [];
  const page = makePage(examPaperDef);
  page.setData({
    answerFiles: [
      { pageIndex: 1, kind: 'image', inline: true, url: '/tmp/a1.jpg' },
      { pageIndex: 2, kind: 'docx', inline: false, url: '' },
      { pageIndex: 3, kind: 'image', inline: true, url: '/tmp/a3.jpg' }
    ]
  });
  page.onPreviewAnswer({ currentTarget: { dataset: { index: '2' } } });
  assert.deepEqual(previews, [{ current: '/tmp/a3.jpg', urls: ['/tmp/a1.jpg', '/tmp/a3.jpg'] }]);
  page.onPreviewAnswer({ currentTarget: { dataset: { index: '1' } } }); // 点文档行不预览
  assert.equal(previews.length, 1);
  page.onPreviewAnswer({ currentTarget: { dataset: { index: '9' } } });
  assert.equal(previews.length, 1);
});

function filePage(files) {
  const page = makePage(examPaperDef);
  page.setData({ answerFiles: files });
  return page;
}

test('onOpenAnswerFile：下载该页答案文件再交给系统文档预览', async () => {
  resetDownloads();
  resetOpen();
  const page = filePage([
    { pageIndex: 2, kind: 'pdf', inline: false, fileUrl: answerFileUrl(5, 2) },
    { pageIndex: 3, kind: 'docx', inline: false, fileUrl: answerFileUrl(5, 3) }
  ]);
  page.onOpenAnswerFile({ currentTarget: { dataset: { index: '1' } } });
  await flush();
  assert.equal(page.data.openingKey, 'a3');
  assert.equal(loadings, 1);
  assert.equal(downloadCalls.length, 1);
  assert.equal(downloadCalls[0].url, 'https://dl5zx.cn' + answerFileUrl(5, 3));
  assert.equal(downloadCalls[0].header.Authorization, 'Bearer tok-1');
  fireAll(200);
  await flush();
  assert.deepEqual(opened.map(o => ({ filePath: o.filePath, fileType: o.fileType, showMenu: o.showMenu })),
    [{ filePath: 'wxfile://tmp-0', fileType: 'docx', showMenu: true }]);
  assert.equal(typeof opened[0].fail, 'function');
  assert.equal(page.data.openingKey, '');
  assert.equal(loadings, 0);
  assert.deepEqual(toasts, []);
});

test('onOpenAnswerFile：取文件期间不重复发请求（连点保护）', async () => {
  resetDownloads();
  resetOpen();
  const page = filePage([{ pageIndex: 1, kind: 'pdf', inline: false, fileUrl: answerFileUrl(5, 1) }]);
  page.onOpenAnswerFile({ currentTarget: { dataset: { index: 0 } } });
  page.onOpenAnswerFile({ currentTarget: { dataset: { index: 0 } } });
  await flush();
  assert.equal(downloadCalls.length, 1);
  fireAll(200);
  await flush();
  assert.equal(opened.length, 1);
});

test('onOpenAnswerFile：小程序打不开的类型只提示、不下载', async () => {
  resetDownloads();
  resetOpen();
  const page = filePage([{ pageIndex: 1, kind: 'other', inline: false, fileUrl: answerFileUrl(5, 1) }]);
  page.onOpenAnswerFile({ currentTarget: { dataset: { index: 0 } } });
  await flush();
  assert.equal(downloadCalls.length, 0);
  assert.deepEqual(toasts, ['该格式暂不支持在小程序内打开']);
  assert.deepEqual(opened, []);
  page.onOpenAnswerFile({ currentTarget: { dataset: {} } }); // 无 index 也不炸
  assert.equal(toasts.length, 1);
});

test('onOpenAnswerFile：下载失败与本机打不开都有反馈', async () => {
  resetDownloads();
  resetOpen();
  const page = filePage([{ pageIndex: 1, kind: 'pdf', inline: false, fileUrl: answerFileUrl(5, 1) }]);
  page.onOpenAnswerFile({ currentTarget: { dataset: { index: 0 } } });
  await flush();
  fireAll(403); // 非 200
  await flush();
  assert.deepEqual(toasts, ['文件下载失败，请重试']);
  assert.deepEqual(opened, []);
  assert.equal(page.data.openingKey, '');
  assert.equal(loadings, 0);

  resetDownloads();
  toasts = [];
  openDocumentFails = true;
  page.onOpenAnswerFile({ currentTarget: { dataset: { index: 0 } } });
  await flush();
  fireAll(200);
  await flush();
  assert.deepEqual(toasts, ['本机无法打开该文件，可转存后查看']);
  assert.equal(page.data.openingKey, '');
});

test('onOpenAnswerFile 期间卸载页面：不再打开文档（issue #15 同口径）', async () => {
  resetDownloads();
  resetOpen();
  const page = filePage([{ pageIndex: 1, kind: 'pdf', inline: false, fileUrl: answerFileUrl(5, 1) }]);
  page.onOpenAnswerFile({ currentTarget: { dataset: { index: 0 } } });
  await flush();
  assert.doesNotThrow(() => page.onUnload());
  fireAll(200);
  await flush();
  assert.deepEqual(opened, []);
  assert.deepEqual(toasts, []);
});

test('exam-paper 无参进入时不会碰到答案文件的分支', () => {
  resetDownloads();
  resetOpen();
  previews = [];
  const page = makePage(examPaperDef);
  page.setData({ answerFiles: [{ pageIndex: 1, kind: 'pdf', inline: false, fileUrl: answerFileUrl(5, 1) }] });
  page.onOpenAnswerFile({ currentTarget: { dataset: { index: 'x' } } });
  page.onPreviewAnswer({ currentTarget: { dataset: { index: 'x' } } });
  assert.equal(downloadCalls.length, 0);
  assert.deepEqual(previews, []);
  assert.deepEqual(opened, []);
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

test('exam-paper 模板接线：wxml 绑到的处理函数都存在，答案文件样式都在 wxss 里', () => {
  const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const wxml = read('pages/exam-paper/exam-paper.wxml');
  const wxss = read('pages/exam-paper/exam-paper.wxss');
  const handlers = new Set();
  wxml.replace(/(?:bind|catch)\s*:?tap="([A-Za-z0-9_]+)"/g, (m, name) => {
    handlers.add(name); return m;
  });
  assert.ok(handlers.size >= 3, '至少应接上原卷预览、答案预览、答案打开三类点击');
  handlers.forEach(name => assert.equal(typeof examPaperDef[name], 'function', name + ' 在页面里没有实现'));
  // 直发展示由后端 answerKeyMode 决定；原卷段受 showOriginalPaper 控制
  assert.match(wxml, /answerKeyMode === 'file'/);
  assert.match(wxml, /wx:if="\{\{showOriginalPaper\}\}"/);
  // 部分答案图挂掉时：提示条与已拿到的文件必须同时出现，不能整段被 wx:else 吞掉
  assert.match(wxml, /class="file-warn"/);
  assert.match(wxml, /answerFiles\.length === 0 && !filesUnavailable/);
  assert.doesNotMatch(wxml, /wx:(elif|else)="[^"]*answerFiles/);
  // 打不开的类型不能写着「点击查看」骗人点
  assert.match(wxml, /暂不支持在小程序内打开/);
  ['afile', 'afile-main', 'afile-kind', 'afile-hint', 'afile-go', 'file-warn'].forEach(c => {
    assert.match(wxss, new RegExp('\\.' + c + '\\s*\\{'), c + ' 缺少样式');
  });
  // 答案文件条目用 view：微信基础库给 button 注入 min-height 2.588em / line-height / margin auto
  assert.doesNotMatch(wxml, /<button[^>]*class="[^"]*afile/);
});
