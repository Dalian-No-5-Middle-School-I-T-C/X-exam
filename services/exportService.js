// services/exportService.js
// 成绩表导出的执行层：调后端导出接口拿 xlsx 二进制 → 落本地文件 → 交给微信文档预览。
// 后端契约（Project-X src/server/routes/export-scores.ts，已确认挂载在 prod 的 /api/export 下）：
// - POST /api/export/exams/:examId/scores  体 { columns, classId?, sideTableN, gapCols }
//   成功 = xlsx 二进制；失败 = 非 2xx 的 { message }。
//   门禁四道：requireExamAccess + can_view_scores + can_view_students + grade:read，
//   任一不过返回 403 且 message 已写成教师能看懂的中文，页面原样显示，不要改写。
// - GET / PUT/:slot / DELETE/:slot  /api/export/templates  按 user_id 存 4 个槽位，与主站共用同一份数据，
//   所以在主站存的模板这里直接能用（columns 为字符串时后端已解析成数组，这里再兜一层）。
// 小程序没有浏览器的 a.download，所以走 responseType 'arraybuffer' + FileSystemManager 落盘；
// 逐班导出是「一次 HTTP 出一个班」，因为后端每次只接受一个 classId、只产一个 Sheet。
'use strict';

var request = require('../utils/request');
var table = require('../utils/exportTable');
var store = require('../utils/exportStore');

var MAX_SLOT = 4;

function codeError(code, message) {
  var e = new Error(message);
  e.code = code;
  return e;
}

function slotSeg(slot) {
  var n = Math.floor(Number(slot));
  if (!isFinite(n) || n < 1 || n > MAX_SLOT) throw codeError('BAD_SLOT', '模板槽位须为 1-4');
  return n;
}

function examSeg(examId) {
  var n = Number(examId);
  if (!isFinite(n) || n <= 0) throw codeError('BAD_EXAM', '考试编号无效');
  return encodeURIComponent(n);
}

// ── 模板 ───────────────────────────────────────────────
// 入参校验一律走 rejected promise，不同步 throw：
// 页面的错误处理是一条 .catch，混进同步异常会变成「点了没反应」的白屏。
function fetchTemplates() {
  return request.get('/export/templates').then(function (resp) {
    return table.normalizeTemplates(resp);
  });
}

function saveTemplate(slot, cfg) {
  var s;
  try {
    s = slotSeg(slot);
  } catch (e) {
    return Promise.reject(e);
  }
  var body = table.templateBody(cfg);
  if (body.columns.length === 0) return Promise.reject(codeError('NO_COLUMN', '请至少选择一列再保存模板'));
  return request.put('/export/templates/' + s, body);
}

function deleteTemplate(slot) {
  try {
    var s = slotSeg(slot);
  } catch (e) {
    return Promise.reject(e);
  }
  return request.del('/export/templates/' + s);
}

// ── 预览数据 ───────────────────────────────────────────
// GET /score-table 的 classId 走 query，后端写的是 req.query.classId ? Number(...) : undefined，
// 所以 classId=0（无班级）会被这个真值判断吃掉、退回全部班级口径；导出本身走 POST body 不受影响。
// 因此预览只在 classId>0 时按班取，其余情况按全部班级取并在页面上说明口径。
function previewScope(classId) {
  var id = table.normalizeClassId(classId);
  return id && id > 0 ? id : undefined;
}

// ── 取一个工作簿 ───────────────────────────────────────
function requestWorkbook(examId, cfg, scopeClassId) {
  var lim = table.limits();
  var body;
  var path;
  try {
    path = '/export/exams/' + examSeg(examId) + '/scores';
    body = table.buildExportBody({
      columns: cfg.columns,
      classId: scopeClassId,
      sideTableN: cfg.sideTableN,
      gapCols: cfg.gapCols
    }, { limits: lim });
  } catch (e) {
    return Promise.reject(e);
  }
  return request.post(path, body, {
    responseType: 'arraybuffer',
    timeout: lim.exportTimeoutMs
  }).then(function (data) {
    var size = store.byteLength(data);
    // 200 却给了 JSON（例如网关改了响应）时，按错误文案处理，不把 JSON 存成 .xlsx
    var jsonMsg = size && size < 65536 ? table.parseErrorText(data) : '';
    if (jsonMsg) throw codeError('JSON_IN_BINARY', jsonMsg);
    if (!size) throw codeError('EMPTY', '导出返回空文件');
    if (size > lim.fileMb * 1024 * 1024) {
      throw codeError('TOO_LARGE', '文件超过 ' + lim.fileMb + 'MB 本地写入上限，请到主站导出');
    }
    return { data: data, size: size };
  });
}

// ── 逐班串行导出 ───────────────────────────────────────
// opts: { examId, examName, columns, sideTableN, gapCols, mode, classId, classes, onProgress }
// 永远 resolve（单班 403 之类只进 errors，不中断整批），返回对象带 cancel()：页面 onUnload 会无条件调用。
function runExport(opts) {
  var o = opts || {};
  var lim = table.limits();
  var cancelled = false;
  var files = [];
  var errors = [];
  var plan;
  var columns = table.cleanColumns(o.columns);

  try {
    if (columns.length === 0) throw new Error('请至少选择一列');
    plan = table.planClasses(o.mode, o.classes, o.classId, lim.classesPerExport);
  } catch (e) {
    var immediate = Promise.resolve({
      files: [], errors: [{ className: '', message: e.message || '导出失败' }],
      cancelled: false, skipped: 0, total: 0
    });
    immediate.cancel = function () {};
    return immediate;
  }

  store.prune(lim.keepFiles);

  var scopes = plan.scopes;
  var finish;
  var job = new Promise(function (resolve) { finish = resolve; });
  job.cancel = function () { cancelled = true; };

  function step(i) {
    if (cancelled) {
      finish({ files: files, errors: errors, cancelled: true, skipped: plan.skipped, total: scopes.length });
      return;
    }
    if (i >= scopes.length) {
      finish({ files: files, errors: errors, cancelled: false, skipped: plan.skipped, total: scopes.length });
      return;
    }
    var scope = scopes[i];
    if (typeof o.onProgress === 'function') {
      o.onProgress({ done: i, total: scopes.length, className: scope.className });
    }
    requestWorkbook(o.examId, { columns: columns, sideTableN: o.sideTableN, gapCols: o.gapCols }, scope.classId)
      .then(function (wb) {
        var name = table.buildFileName(o.examName, scope.className);
        var res = store.writeWorkbook(wb.data, name, lim.fileMb);
        if (!res.ok) {
          errors.push({ className: scope.className, message: res.error || '写入本地文件失败' });
        } else {
          files.push({
            className: scope.className || '全部班级',
            name: res.name,
            path: res.path,
            size: res.size,
            sizeText: table.formatBytes(res.size)
          });
        }
      })
      .catch(function (err) {
        errors.push({ className: scope.className || '全部班级', message: (err && err.message) || '导出失败', status: err && err.status });
      })
      .then(function () { step(i + 1); });
  }

  step(0);
  return job;
}

// ── 本地文件 ───────────────────────────────────────────
function listLocalFiles() {
  var list = store.readIndex().slice();
  list.reverse();
  return list.map(function (it) {
    return { path: it.path, name: it.name, at: it.at, size: it.size, sizeText: table.formatBytes(it.size) };
  });
}

function removeLocalFile(path) {
  return store.removeFile(path);
}

function clearLocalFiles() {
  return store.clearAll();
}

// 打开预览：showMenu 让教师自己在右上角菜单里「发送给朋友 / 另存」，
// 页面本身不接 onShareAppMessage，教师端也不产生可自动扩散的分享卡片。
function openFile(path) {
  return new Promise(function (resolve, reject) {
    if (typeof wx === 'undefined' || typeof wx.openDocument !== 'function') {
      reject(new Error('当前微信版本不支持打开文档，请升级后重试'));
      return;
    }
    if (!path) {
      reject(new Error('文件路径无效'));
      return;
    }
    wx.openDocument({
      filePath: path,
      fileType: 'xlsx',
      showMenu: true,
      success: function () { resolve(true); },
      fail: function (e) {
        reject(new Error((e && e.errMsg) || '打开失败，可稍后重试'));
      }
    });
  });
}

module.exports = {
  fetchTemplates: fetchTemplates,
  saveTemplate: saveTemplate,
  deleteTemplate: deleteTemplate,
  previewScope: previewScope,
  requestWorkbook: requestWorkbook,
  runExport: runExport,
  listLocalFiles: listLocalFiles,
  removeLocalFile: removeLocalFile,
  clearLocalFiles: clearLocalFiles,
  openFile: openFile
};
