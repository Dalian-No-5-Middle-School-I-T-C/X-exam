// utils/examPaper.js
// 「原卷 + 正确答案」响应归一化与展示模型（纯函数，可在 Node 下直接测）。
// 后端契约：Project-X GET /api/scores/me/exams/:examId/paper
// 口径：答案下发哪一份由后端 exams.answer_key_mode 决定（v66），小程序只按 answerKeyMode 排版：
//   · 'text' → 渲染教师保存的文字，不做对错判断；题号缺失时不伪造题号。
//   · 'file' → 渲染教师上传的答案原文件（图片内联，PDF/DOCX 交给 wx.openDocument）。
'use strict';

function arr(v) { return Array.isArray(v) ? v : []; }
function obj(v) { return v && typeof v === 'object' ? v : {}; }

const ANSWER_FILE_MODE = 'file';

function normalizeAnswerKeyMode(v) {
  return v === ANSWER_FILE_MODE ? ANSWER_FILE_MODE : 'text';
}

function truthy(v) { return v === true || v === 1 || v === '1'; }

// 文件类型只按「后端登记的文件名 + MIME」判定，不看 URL：URL 里只有页码，没有扩展名。
// 返回值同时是 wx.openDocument 的 fileType，故只有 'pdf' / 'docx' 能直接投给系统预览器；
// 后端本就拒收 .doc（提示转 .docx），这里也不把 .doc 认成 docx，免得给出打不开的入口。
function answerFileKind(filename, mimeType, isImage) {
  const name = toStr(filename).toLowerCase();
  const mime = toStr(mimeType).toLowerCase();
  if (isImage || /\.(jpg|jpeg|png|webp|gif|bmp)$/.test(name) || mime.startsWith('image/')) return 'image';
  if (/\.pdf$/.test(name) || mime === 'application/pdf') return 'pdf';
  if (/\.docx$/.test(name) || mime.indexOf('wordprocessingml') >= 0) return 'docx';
  return 'other';
}

function toStr(v) {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  return String(v);
}

function toNumOrNull(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Number(v);
  return null;
}

function pick(o, keys) {
  for (var i = 0; i < keys.length; i++) {
    var v = o[keys[i]];
    if (v !== undefined && v !== null) return v;
  }
  return null;
}

function normalizeAnswer(a) {
  var o = obj(a);
  return {
    questionNumber: toNumOrNull(pick(o, ['questionNumber', 'question_number', 'no'])),
    answerText: toStr(pick(o, ['answerText', 'answer_text', 'text'])).replace(/\s+/g, ' ').trim(),
    pageIndex: toNumOrNull(pick(o, ['pageIndex', 'page_index']))
  };
}

// 答案按题号升序；题号缺失的排到最后，不丢弃
function sortAnswers(answers) {
  return answers.slice().sort(function (x, y) {
    var n = x.questionNumber == null ? Number.MAX_SAFE_INTEGER : x.questionNumber;
    var m = y.questionNumber == null ? Number.MAX_SAFE_INTEGER : y.questionNumber;
    return n - m;
  });
}

// 渲染行：wxml 只能做有限表达式，标签在这里拼好
function answerRows(answers) {
  return sortAnswers(arr(answers).map(normalizeAnswer))
    .filter(function (a) { return a.answerText !== ''; })
    .map(function (a) {
      return {
        key: 'q-' + (a.questionNumber == null ? 'x' : a.questionNumber),
        label: a.questionNumber == null ? '答案' : '第 ' + a.questionNumber + ' 题',
        text: a.answerText
      };
    });
}

function normalizePaper(resp) {
  var r = obj(resp);
  var pages = arr(r.pages).map(function (p) {
    var o = obj(p);
    return {
      pageIndex: toNumOrNull(pick(o, ['pageIndex', 'page_index'])),
      filename: toStr(pick(o, ['filename'])),
      mimeType: toStr(pick(o, ['mimeType', 'mime_type'])),
      isImage: o.isImage === true || o.is_image === 1 || o.isImage === 1 || o.is_image === true,
      imageUrl: toStr(pick(o, ['imageUrl', 'image_url'])),
      answers: arr(o.answers).map(normalizeAnswer),
      rows: answerRows(o.answers)
    };
  });
  var blocks = arr(r.answerBlocks || r.answer_blocks).map(function (b) {
    var o = obj(b);
    var numbers = arr(o.questionNumbers || o.question_numbers);
    return {
      id: toStr(pick(o, ['id'])),
      imageUrl: toStr(pick(o, ['imageUrl', 'image_url'])),
      title: toStr(pick(o, ['blockTitle', 'block_title', 'title'])) ||
        (numbers.length > 0 ? '第 ' + numbers[0] + ' 题' : '作答')
    };
  });
  var answers = sortAnswers(arr(r.answers).map(normalizeAnswer));
  var answerKeyMode = normalizeAnswerKeyMode(pick(r, ['answerKeyMode', 'answer_key_mode']));
  var answerFiles = arr(r.answerFiles || r.answer_files).map(function (f) {
    var o = obj(f);
    var isImage = truthy(o.isImage) || truthy(o.is_image);
    var filename = toStr(pick(o, ['filename']));
    var mimeType = toStr(pick(o, ['mimeType', 'mime_type']));
    var kind = answerFileKind(filename, mimeType, isImage);
    return {
      pageIndex: toNumOrNull(pick(o, ['pageIndex', 'page_index'])),
      filename: filename,
      mimeType: mimeType,
      isImage: isImage,
      fileUrl: toStr(pick(o, ['fileUrl', 'file_url'])),
      kind: kind,
      // 卡片标题与「能否在小程序里直接看」都在归一化时定死，wxml 里不再做判断
      label: '答案第 ' + (toNumOrNull(pick(o, ['pageIndex', 'page_index'])) || '?') + ' 页',
      inline: kind === 'image'
    };
  }).filter(function (f) { return f.fileUrl !== ''; });
  return {
    examId: toNumOrNull(pick(r, ['examId', 'exam_id'])) || 0,
    examName: toStr(pick(r, ['examName', 'exam_name', 'name'])),
    subject: toStr(pick(r, ['subject'])),
    // 后端未给 hasOriginalPaper 时以 pages 长度为准（语义一致，不猜）
    hasOriginalPaper: r.hasOriginalPaper === undefined
      ? pages.length > 0
      : (r.hasOriginalPaper === true || r.hasOriginalPaper === 1),
    // v66：答案展示模式 + 原卷是否开放。showOriginalPaper 缺字段时按「开」处理 ——
    // 那是 v54 的语义（能看到这一页就说明原卷是开的），不能反过来把已上线的界面关掉。
    answerKeyMode: answerKeyMode,
    showOriginalPaper: r.showOriginalPaper === undefined && r.show_original_paper === undefined
      ? true
      : (truthy(pick(r, ['showOriginalPaper', 'show_original_paper']))),
    pages: pages,
    answers: answers,
    rows: answerRows(answers),
    answerFiles: answerFiles,
    blocks: blocks.filter(function (b) { return b.id !== '' && b.imageUrl !== ''; })
  };
}

// 下载结果落位：key 为 p<pageIndex> / b<id> / a<pageIndex>，未取到临时文件的条目剔除（不显示破图）
function decorate(paper, paths) {
  var map = obj(paths);
  var pages = paper.pages
    .map(function (p) { return Object.assign({}, p, { url: map['p' + p.pageIndex] || '' }); })
    .filter(function (p) { return p.url !== ''; });
  var blocks = paper.blocks
    .map(function (b) { return Object.assign({}, b, { url: map['b' + b.id] || '' }); })
    .filter(function (b) { return b.url !== ''; });
  // 答案原文件：只有内联图片需要临时文件；PDF/DOCX 是点开时才下载，这里一律保留
  var answerFiles = paper.answerFiles
    .map(function (f) { return Object.assign({}, f, { url: f.inline ? (map['a' + f.pageIndex] || '') : '' }); })
    .filter(function (f) { return !f.inline || f.url !== ''; });
  return { pages: pages, blocks: blocks, answerFiles: answerFiles };
}

module.exports = {
  normalizePaper: normalizePaper,
  normalizeAnswer: normalizeAnswer,
  normalizeAnswerKeyMode: normalizeAnswerKeyMode,
  answerFileKind: answerFileKind,
  answerRows: answerRows,
  sortAnswers: sortAnswers,
  decorate: decorate
};
