// utils/exportStore.js
// 导出文件的本地落盘层：FileSystemManager 封装 + 保留策略 + 隐私清理钩子。
// 为什么需要一份 storage 索引：FileSystemManager 没有可靠的「按修改时间列目录」能力，
// 而「只保留最近 N 个导出文件」必须有顺序；索引只存文件名/路径/时间戳，不含任何成绩数据。
// 隐私约束：导出的 xlsx 是他人成绩明文，主动退出与 401 被动登出都要走 clearAll()，
// 与 utils/request.js 里清 px_cache_scores_me_ / px_perms 的同一条线。
'use strict';

var INDEX_KEY = 'px_exports_index';
var DIR_NAME = 'px_exports';
var EXT = '.xlsx';
var MAX_SUFFIX = 50;

function fsManager() {
  if (typeof wx === 'undefined' || typeof wx.getFileSystemManager !== 'function') return null;
  try {
    return wx.getFileSystemManager();
  } catch (e) {
    return null;
  }
}

function baseDir() {
  if (typeof wx === 'undefined' || !wx.env) return '';
  return wx.env.USER_DATA_PATH || '';
}

function dirPath() {
  var base = baseDir();
  return base ? base + '/' + DIR_NAME : '';
}

function readIndex() {
  if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') return [];
  var raw;
  try { raw = wx.getStorageSync(INDEX_KEY); } catch (e) { return []; }
  if (!Array.isArray(raw)) return [];
  return raw.filter(function (it) { return it && typeof it.path === 'string' && it.path; });
}

function saveIndex(list) {
  if (typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') return;
  try { wx.setStorageSync(INDEX_KEY, Array.isArray(list) ? list : []); } catch (e) { /* 存储写失败不影响导出结果 */ }
}

function byteLength(data) {
  if (!data) return 0;
  if (typeof data.byteLength === 'number') return data.byteLength;
  if (typeof data.length === 'number') return data.length;
  return 0;
}

function ensureDir(fm) {
  var p = dirPath();
  if (!p) return '当前环境不支持本地文件写入';
  try {
    fm.mkdirSync(p, true);
  } catch (e) {
    // 目录已存在会抛错，这里只在真的写不进去时由 writeFile 暴露出来
  }
  return '';
}

// 同名文件加序号后缀：Windows/微信文档查看器都按文件名显示，教师看到的应是「期中_一班_成绩表(2).xlsx」
function uniqueName(list, fileName) {
  var taken = {};
  list.forEach(function (it) { if (it.name) taken[it.name] = true; });
  if (!taken[fileName]) return fileName;
  var dot = fileName.lastIndexOf(EXT);
  var stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  for (var i = 2; i <= MAX_SUFFIX; i++) {
    var candidate = stem + '(' + i + ')' + EXT;
    if (!taken[candidate]) return candidate;
  }
  return stem + '-' + Date.now() + EXT;
}

// data 为 ArrayBuffer / Uint8Array 时不能传 encoding，否则微信会按文本写坏二进制
function writeBinary(fm, filePath, data) {
  var isText = typeof data === 'string';
  if (isText) return fm.writeFileSync(filePath, data, 'utf8');
  try {
    return fm.writeFileSync(filePath, data);
  } catch (e) {
    // 老基础库上两参数写法不接受 ArrayBuffer 时，退回显式 binary
    return fm.writeFileSync(filePath, data, 'binary');
  }
}

// 返回 { ok, path, name, size, error }，不抛异常：逐班导出时单班失败要继续跑下一班
function writeWorkbook(data, fileName, maxMb) {
  var fm = fsManager();
  if (!fm) return { ok: false, error: '当前微信版本不支持本地文件写入' };
  var p = dirPath();
  if (!p) return { ok: false, error: '本地存储目录不可用' };
  var size = byteLength(data);
  if (!size) return { ok: false, error: '导出返回空文件' };
  var cap = Number(maxMb);
  if (isFinite(cap) && cap > 0 && size > cap * 1024 * 1024) {
    return { ok: false, error: '文件超过本地写入上限 ' + cap + 'MB，请到主站导出' };
  }
  var mkErr = ensureDir(fm);
  if (mkErr) return { ok: false, error: mkErr };
  var list = readIndex();
  var name = uniqueName(list, fileName);
  var filePath = p + '/' + name;
  try {
    writeBinary(fm, filePath, data);
  } catch (e) {
    return { ok: false, error: (e && e.errMsg) || '写入本地文件失败' };
  }
  list.push({ path: filePath, name: name, at: Date.now(), size: size });
  saveIndex(list);
  return { ok: true, path: filePath, name: name, size: size };
}

function unlinkSafe(fm, path) {
  try { fm.unlinkSync(path); return true; } catch (e) { return false; }
}

// 只保留最近 keep 个：更早的从磁盘删掉并从索引里剔除
function prune(keep) {
  var fm = fsManager();
  var list = readIndex();
  if (!fm || list.length === 0) return { removed: 0, left: list.length };
  var n = Math.floor(Number(keep));
  if (!isFinite(n) || n < 1) n = 1;
  var removed = 0;
  while (list.length > n) {
    var oldest = list.shift();
    if (oldest && oldest.path) unlinkSafe(fm, oldest.path);
    removed++;
  }
  saveIndex(list);
  return { removed: removed, left: list.length };
}

function removeFile(path) {
  var fm = fsManager();
  if (!fm || !path) return false;
  var ok = unlinkSafe(fm, path);
  saveIndex(readIndex().filter(function (it) { return it.path !== path; }));
  return ok;
}

// 退出登录 / 被 401 踢下线时调用：清掉全部导出文件与索引
function clearAll() {
  var fm = fsManager();
  var list = readIndex();
  if (fm) {
    list.forEach(function (it) { if (it.path) unlinkSafe(fm, it.path); });
    var p = dirPath();
    if (p) { try { fm.rmdirSync(p); } catch (e) { /* 目录已空或不存在 */ } }
  }
  if (typeof wx !== 'undefined' && typeof wx.removeStorageSync === 'function') {
    try { wx.removeStorageSync(INDEX_KEY); } catch (e) { /* ignore */ }
  }
  return list.length;
}

module.exports = {
  INDEX_KEY: INDEX_KEY,
  DIR_NAME: DIR_NAME,
  dirPath: dirPath,
  readIndex: readIndex,
  writeWorkbook: writeWorkbook,
  prune: prune,
  removeFile: removeFile,
  clearAll: clearAll,
  uniqueName: uniqueName,
  byteLength: byteLength
};

// 自检：node utils/exportStore.js（小程序运行时 require.main 为 undefined，不会执行）
if (typeof require !== 'undefined' && require.main === module) {
  var assert = require('assert');
  var store = [];
  global.wx = {
    env: { USER_DATA_PATH: '/tmp/px' },
    getStorageSync: function (k) { return k === INDEX_KEY ? store : ''; },
    setStorageSync: function (k, v) { if (k === INDEX_KEY) store = v; },
    removeStorageSync: function () { store = []; },
    getFileSystemManager: function () {
      return {
        mkdirSync: function () {},
        unlinkSync: function () {},
        rmdirSync: function () {},
        writeFileSync: function (path, data, encoding) {
          if (typeof data === 'string' && encoding !== 'utf8') throw new Error('文本必须带 utf8');
          if (typeof data !== 'string' && encoding !== undefined) throw new Error('二进制不能传 encoding');
          return '';
        }
      };
    }
  };
  assert.strictEqual(dirPath(), '/tmp/px/px_exports');
  assert.strictEqual(byteLength(new Uint8Array(7)), 7);
  var buf = new Uint8Array(10).buffer;
  var r1 = writeWorkbook(buf, '期中_成绩表.xlsx', 8);
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r1.name, '期中_成绩表.xlsx');
  var r2 = writeWorkbook(buf, '期中_成绩表.xlsx', 8);
  assert.strictEqual(r2.name, '期中_成绩表(2).xlsx');
  assert.strictEqual(writeWorkbook(new Uint8Array(0).buffer, '空.xlsx', 8).ok, false);
  assert.strictEqual(writeWorkbook(buf, '超限.xlsx', 0.000001).ok, false);
  assert.strictEqual(prune(1).left, 1);
  assert.strictEqual(clearAll(), 1);
  assert.strictEqual(store.length, 0);
  console.log('exportStore.js self-check OK');
}
