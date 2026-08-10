// scripts/cache-selfcheck.js
// 缓存兼容/TTL 自检：node scripts/cache-selfcheck.js（纯 Node，无依赖）
// 微信开发者工具只打包被页面引用的文件，本文件不会进入小程序包。
const assert = require('assert');

const store = {};
global.wx = {
  getStorageSync: function (k) { return k in store ? store[k] : ''; },
  setStorageSync: function (k, v) { store[k] = v; },
  removeStorageSync: function (k) { delete store[k]; }
};

const { getCachedScores, setCachedScores, clearCachedScores } = require('../utils/cache');
const KEY = 'px_cache_scores_me_salttest';
store.px_user = { studentId: 'salttest' }; // userSalt 优先取 px_user.studentId

// 旧格式（无时间戳）应直接返回，兼容升级前已存在的缓存
const legacy = { name: '张三', scores: [{ exam_id: 1, total_score: 100 }] };
store[KEY] = legacy;
assert.deepStrictEqual(getCachedScores(), legacy, '旧格式缓存应直接返回');
assert.ok(store[KEY].t, '旧格式命中后应补写时间戳迁移为新格式');

// 新格式未过期应返回 data
setCachedScores({ name: '张三', scores: [{ exam_id: 1, total_score: 120 }] });
assert.strictEqual(getCachedScores().scores[0].total_score, 120, '新格式未过期应返回 data');

// 新格式超过 24h 应判过期
store[KEY].t = Date.now() - 25 * 60 * 60 * 1000;
assert.strictEqual(getCachedScores(), null, '超过 24h 缓存应判过期');

// 清除后无缓存
clearCachedScores();
assert.strictEqual(getCachedScores(), null, '清除后应无缓存');

console.log('cache 自检通过');
