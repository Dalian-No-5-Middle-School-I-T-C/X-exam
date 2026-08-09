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

function normalizeScores(resp) {
  var r = resp && typeof resp === 'object' ? resp : {};
  var scores = toArr(resp, 'scores').map(function (s) {
    return {
      exam_id: toNum(pick(s, ['exam_id', 'examId'], 0)),
      exam_name: pick(s, ['exam_name', 'examName', 'name'], ''),
      subject: pick(s, ['subject'], ''),
      total_score: toNum(pick(s, ['total_score', 'totalScore'], 0)),
      full_score: pick(s, ['full_score', 'fullScore', 'max_score', 'maxScore'], null),
      graded_at: pick(s, ['graded_at', 'gradedAt', 'date'], ''),
      rank: pick(s, ['rank'], null),
      class_size: pick(s, ['class_size', 'classSize'], null),
      percentile: pick(s, ['percentile'], null),
      objective_score: toNum(pick(s, ['objective_score', 'objectiveScore'], 0)),
      subjective_score: toNum(pick(s, ['subjective_score', 'subjectiveScore'], 0))
    };
  });
  return {
    name: r.name || '',
    studentId: pick(r, ['studentId', 'student_id', 'studentID'], ''),
    scores: scores
  };
}

function normalizeTrends(resp) {
  return toArr(resp, 'trends')
    .map(function (p) {
      return {
        examName: pick(p, ['examName', 'exam_name', 'name'], ''),
        total: toNum(pick(p, ['totalScore', 'total_score', 'total'], 0)),
        classAvg: toNum(pick(p, ['classAvg', 'class_avg', 'classAverage', 'class_average'], 0)),
        gradeAvg: toNum(pick(p, ['gradeAvg', 'grade_avg', 'gradeAverage', 'grade_average'], 0))
      };
    })
    .filter(function (p) {
      return p.examName !== '' || p.total !== 0 || p.classAvg !== 0 || p.gradeAvg !== 0;
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
  return toArr(resp, 'questions').map(function (q) {
    return {
      question_number: toNum(pick(q, ['question_number', 'questionNumber', 'no'], 0)),
      score_type: pick(q, ['score_type', 'scoreType', 'type'], ''),
      score: toNum(pick(q, ['score'], 0)),
      max_score: toNum(pick(q, ['max_score', 'maxScore', 'full_score', 'fullScore'], 0))
    };
  });
}

module.exports = {
  toNum: toNum,
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
    scores: [{ exam_id: '5', totalScore: '78.5', full_score: 100, objective_score: '20' }]
  });
  assert.strictEqual(s.studentId, 1);
  assert.strictEqual(s.scores[0].exam_id, 5);
  assert.strictEqual(s.scores[0].total_score, 78.5);
  assert.strictEqual(s.scores[0].objective_score, 20);

  const t = normalizeTrends([{ total_score: '90', class_avg: 80, grade_avg: '70' }]);
  assert.strictEqual(t[0].total, 90);
  assert.strictEqual(t[0].classAvg, 80);
  assert.strictEqual(t[0].gradeAvg, 70);

  const subj = normalizeSubjects({ subjects: [{ subject: '数学', avg_score: '88' }] });
  assert.strictEqual(subj.subjects[0].avgScore, 88);
  assert.strictEqual(subj.weakSubject, '');

  const q = normalizeQuestions({ questions: [{ questionNumber: 3, scoreType: 'objective', score: '2', maxScore: 4 }] });
  assert.strictEqual(q[0].question_number, 3);
  assert.strictEqual(q[0].score_type, 'objective');
  assert.strictEqual(q[0].score, 2);
  assert.strictEqual(q[0].max_score, 4);

  assert.strictEqual(normalizeTrends('oops').length, 0);
  assert.strictEqual(normalizeSubjects(null).subjects.length, 0);
  console.log('response.js self-check OK');
}
