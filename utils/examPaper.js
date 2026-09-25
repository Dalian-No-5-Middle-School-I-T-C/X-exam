// utils/examPaper.js
// 「原卷 + 逐题正确答案」响应归一化与展示模型（纯函数，可在 Node 下直接测）。
// 后端契约：Project-X GET /api/scores/me/exams/:examId/paper
// 口径：答案只渲染教师保存的文字，不做对错判断；题号缺失时不伪造题号。
'use strict';

function arr(v) { return Array.isArray(v) ? v : []; }
function obj(v) { return v && typeof v === 'object' ? v : {}; }

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
  return {
    examId: toNumOrNull(pick(r, ['examId', 'exam_id'])) || 0,
    examName: toStr(pick(r, ['examName', 'exam_name', 'name'])),
    subject: toStr(pick(r, ['subject'])),
    // 后端未给 hasOriginalPaper 时以 pages 长度为准（语义一致，不猜）
    hasOriginalPaper: r.hasOriginalPaper === undefined
      ? pages.length > 0
      : (r.hasOriginalPaper === true || r.hasOriginalPaper === 1),
    pages: pages,
    answers: answers,
    rows: answerRows(answers),
    blocks: blocks.filter(function (b) { return b.id !== '' && b.imageUrl !== ''; })
  };
}

// 下载结果落位：key 为 p<pageIndex> / b<id>，未取到临时文件的条目剔除（不显示破图）
function decorate(paper, paths) {
  var map = obj(paths);
  var pages = paper.pages
    .map(function (p) { return Object.assign({}, p, { url: map['p' + p.pageIndex] || '' }); })
    .filter(function (p) { return p.url !== ''; });
  var blocks = paper.blocks
    .map(function (b) { return Object.assign({}, b, { url: map['b' + b.id] || '' }); })
    .filter(function (b) { return b.url !== ''; });
  return { pages: pages, blocks: blocks };
}

module.exports = {
  normalizePaper: normalizePaper,
  normalizeAnswer: normalizeAnswer,
  answerRows: answerRows,
  sortAnswers: sortAnswers,
  decorate: decorate
};
