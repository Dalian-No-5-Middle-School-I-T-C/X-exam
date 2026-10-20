// utils/response.js
// 后端响应归一化：字段别名 + 数值容错，页面只消费规范结构。
// 落地 CHANGELOG 2026-08-07 的 P1 待办「响应字段契约归一化」。

// 数值容错：接受 number 或可转数字的字符串，否则返回 dflt
function toNum(v, dflt) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Number(v);
  return dflt;
}

// 字段别名：按 key 顺序取第一个非空值
function pick(obj, keys, dflt) {
  if (!obj || typeof obj !== 'object') return dflt;
  for (var i = 0; i < keys.length; i++) {
    var v = obj[keys[i]];
    if (v !== undefined && v !== null) return v;
  }
  return dflt;
}

// 取数组：支持裸数组或 { key: [...] }
function toArr(resp, key) {
  if (Array.isArray(resp)) return resp;
  if (resp && typeof resp === 'object' && Array.isArray(resp[key])) return resp[key];
  return [];
}

// ArrayBuffer / Uint8Array → UTF-8 字符串。
// 为什么手写解码：request 用 responseType 'arraybuffer' 取 Excel 二进制时，
// 同一通道返回的 403/401 错误体也是 ArrayBuffer，小程序侧没有可靠的 TextDecoder 可用，
// 不解码就只能把「权限不足：管理员已关闭…」压成一句「请求失败」。
// 覆盖 1/2/3/4 字节序列，4 字节（emoji 等）拆成代理对；遇到裸续字节或截断序列直接跳过。
function decodeUtf8(input) {
  if (!input) return '';
  var bytes;
  if (typeof Uint8Array !== 'undefined' && (input instanceof ArrayBuffer || input instanceof Uint8Array)) {
    bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  } else if (Array.isArray(input)) {
    bytes = input;
  } else {
    return typeof input === 'string' ? input : '';
  }
  var out = '';
  var i = 0;
  // 取后续字节；越界返回 -1 让调用方丢弃这条不完整序列（补 0 会产出「一」这类假字）
  function cont(at) {
    if (at >= bytes.length) return -1;
    var c = bytes[at] & 0xFF;
    return (c & 0xC0) === 0x80 ? (c & 0x3F) : -1;
  }
  while (i < bytes.length) {
    var b = bytes[i] & 0xFF;
    i += 1;
    var cp = -1;
    if (b < 0x80) {
      cp = b;
    } else if (b >= 0xC2 && b <= 0xDF) {
      var c1 = cont(i);
      if (c1 < 0) break;
      cp = ((b & 0x1F) << 6) | c1;
      i += 1;
    } else if (b >= 0xE0 && b <= 0xEF) {
      var c2 = cont(i);
      var c3 = cont(i + 1);
      if (c2 < 0 || c3 < 0) break;
      cp = ((b & 0x0F) << 12) | (c2 << 6) | c3;
      i += 2;
    } else if (b >= 0xF0 && b <= 0xF4) {
      var c4 = cont(i);
      var c5 = cont(i + 1);
      var c6 = cont(i + 2);
      if (c4 < 0 || c5 < 0 || c6 < 0) break;
      cp = ((b & 0x07) << 18) | (c4 << 12) | (c5 << 6) | c6;
      i += 3;
    } else {
      continue; // 0x80-0xC1 的续字节/非法首字节：跳过而不是产出乱码
    }
    if (cp > 0xFFFF) {
      var v = cp - 0x10000;
      out += String.fromCharCode(0xD800 + (v >> 10), 0xDC00 + (v & 0x3FF));
    } else {
      out += String.fromCharCode(cp);
    }
  }
  return out;
}

function normalizeScores(resp) {
  var r = resp && typeof resp === 'object' ? resp : {};
  var scores = toArr(resp, 'scores').map(function (s) {
    return {
      exam_id: toNum(pick(s, ['exam_id', 'examId'], 0)),
      exam_name: pick(s, ['exam_name', 'examName', 'name'], ''),
      subject: pick(s, ['subject'], ''),
      total_score: toNum(pick(s, ['total_score', 'totalScore'], 0)),
      full_score: toNum(pick(s, ['full_score', 'fullScore', 'max_score', 'maxScore'], null), null),
      graded_at: pick(s, ['graded_at', 'gradedAt', 'date'], ''),
      rank: pick(s, ['rank'], null),
      class_size: pick(s, ['class_size', 'classSize'], null),
      percentile: pick(s, ['percentile'], null),
      objective_score: toNum(pick(s, ['objective_score', 'objectiveScore'], 0)),
      subjective_score: toNum(pick(s, ['subjective_score', 'subjectiveScore'], 0)),
      // v53: 原卷/答案解析入口开关（后端已合并 已公布 + 显示原卷 两道门）
      paper_visible: toNum(pick(s, ['paper_visible', 'paperVisible'], 0), 0)
    };
  });
  return {
    name: r.name || '',
    studentId: pick(r, ['studentId', 'student_id', 'studentID'], ''),
    scores: scores
  };
}

function normalizeTrends(resp) {
  // 按“字段存在性”过滤而非“非零”，保留真实 0 分条目
  var arr = toArr(resp, 'trends').filter(function (p) {
    return pick(p, ['examName', 'exam_name', 'name'], '') !== '' ||
      pick(p, ['totalScore', 'total_score', 'total'], null) != null ||
      pick(p, ['classAvg', 'class_avg', 'classAverage', 'class_average'], null) != null ||
      pick(p, ['gradeAvg', 'grade_avg', 'gradeAverage', 'grade_average'], null) != null;
  });
  return arr
    .map(function (p) {
      return {
        examName: pick(p, ['examName', 'exam_name', 'name'], ''),
        total: toNum(pick(p, ['totalScore', 'total_score', 'total'], 0)),
        classAvg: toNum(pick(p, ['classAvg', 'class_avg', 'classAverage', 'class_average'], 0)),
        gradeAvg: toNum(pick(p, ['gradeAvg', 'grade_avg', 'gradeAverage', 'grade_average'], 0))
      };
    });
}

function normalizeSubjects(resp) {
  var r = resp && typeof resp === 'object' ? resp : {};
  var subjects = toArr(resp, 'subjects')
    .map(function (s) {
      return {
        subject: pick(s, ['subject', 'name'], ''),
        avgScore: toNum(pick(s, ['avgScore', 'avg_score', 'averageScore'], 0)),
        avgClassAvg: toNum(pick(s, ['avgClassAvg', 'avg_class_avg', 'classAvg', 'class_avg'], 0)),
        gapToClass: toNum(pick(s, ['gapToClass', 'gap_to_class', 'gap'], 0)),
        examCount: toNum(pick(s, ['examCount', 'exam_count', 'count'], 0)),
        trend: pick(s, ['trend'], '')
      };
    })
    .filter(function (s) { return s.subject !== ''; });
  return {
    subjects: subjects,
    // 后端不返回 weakSubject 时不做猜测，避免展示误导性结论
    weakSubject: r.weakSubject || r.weak_subject || '',
    totalExams: r.totalExams != null ? toNum(r.totalExams, 0) : subjects.length
  };
}

function normalizeQuestions(resp) {
  return toArr(resp, 'questions').map(function (q, i) {
    return {
      _key: i,
      // 保留 null：后端 question_number 可空，页面显示 “Q?” 而不是伪造 Q0
      question_number: pick(q, ['question_number', 'questionNumber', 'no'], null),
      score_type: pick(q, ['score_type', 'scoreType', 'type'], ''),
      score: toNum(pick(q, ['score'], 0)),
      max_score: toNum(pick(q, ['max_score', 'maxScore', 'full_score', 'fullScore'], null), null)
    };
  });
}

module.exports = {
  toNum: toNum,
  pick: pick,
  toArr: toArr,
  decodeUtf8: decodeUtf8,
  normalizeScores: normalizeScores,
  normalizeTrends: normalizeTrends,
  normalizeSubjects: normalizeSubjects,
  normalizeQuestions: normalizeQuestions
};

// 自检：node utils/response.js（小程序运行时 require.main 为 undefined，不会执行）
if (typeof require !== 'undefined' && require.main === module) {
  const assert = require('assert');
  const s = normalizeScores({
    name: '张三',
    studentId: 1,
    scores: [{ exam_id: '5', totalScore: '78.5', full_score: '100', objective_score: '20' }]
  });
  assert.strictEqual(s.studentId, 1);
  assert.strictEqual(s.scores[0].exam_id, 5);
  assert.strictEqual(s.scores[0].total_score, 78.5);
  assert.strictEqual(s.scores[0].objective_score, 20);
  assert.strictEqual(s.scores[0].full_score, 100);
  assert.strictEqual(s.scores[0].paper_visible, 0);

  const t = normalizeTrends([{ total_score: '90', class_avg: 80, grade_avg: '70' }]);
  assert.strictEqual(t[0].total, 90);
  assert.strictEqual(t[0].classAvg, 80);
  assert.strictEqual(t[0].gradeAvg, 70);
  // 真实 0 分条目不应被过滤
  assert.strictEqual(normalizeTrends([{ exam_name: '考试0', total_score: 0 }]).length, 1);

  const subj = normalizeSubjects({ subjects: [{ subject: '数学', avg_score: '88' }] });
  assert.strictEqual(subj.subjects[0].avgScore, 88);
  assert.strictEqual(subj.weakSubject, '');

  const q = normalizeQuestions({ questions: [{ questionNumber: 3, scoreType: 'objective', score: '2', maxScore: 4 }] });
  assert.strictEqual(q[0].question_number, 3);
  assert.strictEqual(q[0].score_type, 'objective');
  assert.strictEqual(q[0].score, 2);
  assert.strictEqual(q[0].max_score, 4);
  // 缺少满分时归一化为 null，而不是 0
  assert.strictEqual(normalizeQuestions({ questions: [{ score: 2 }] })[0].max_score, null);

  assert.strictEqual(normalizeTrends('oops').length, 0);
  assert.strictEqual(normalizeSubjects(null).subjects.length, 0);

  // UTF-8 解码：1/2/3/4 字节混排 + 裸续字节跳过 + 截断序列不产坏字
  assert.strictEqual(decodeUtf8(Buffer.from('权限不足', 'utf8')), '权限不足');
  assert.strictEqual(decodeUtf8(Buffer.from('Aé€😀', 'utf8')), 'Aé€😀');
  assert.strictEqual(decodeUtf8(Buffer.from('{"message":"导出失败"}', 'utf8')), '{"message":"导出失败"}');
  assert.strictEqual(decodeUtf8(new Uint8Array([0x80, 0x41]).buffer), 'A');
  assert.strictEqual(decodeUtf8(new Uint8Array([0xE4, 0xB8]).buffer), '');
  assert.strictEqual(decodeUtf8(''), '');
  assert.strictEqual(decodeUtf8(null), '');
  assert.strictEqual(decodeUtf8('已是字符串'), '已是字符串');

  console.log('response.js self-check OK');
}
