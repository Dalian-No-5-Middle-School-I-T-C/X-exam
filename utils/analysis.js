// utils/analysis.js
// 教师端分析接口响应归一化。后端口径按代码核对，与 types.ts 声明不一致处以运行时为准：
// - scoreRate / correctRate / errorRate / passRate / excellentRate 均为 0-100 的整数百分比；
// - difficulty 是 0-1（3 位小数），discrimination 是 -1~1（3 位小数），三者不能混着格式化；
// - 逐题分析里 questionNumber 是 string，班级对比/选项分析里是 number，知识点是逗号拼接串；
// - 知识点条目是 snake_case，其余分析接口是 camelCase；
// - /students 榜单不含 studentId，故不提供个人下钻。
const { toNum, pick, toArr } = require('./response');

// 允许 null 的数值：缺失/不可转时返回 dflt（默认 null），避免把「无数据」画成 0。
// 计数类字段传 0，比率/分数类字段保持 null 以显示「—」。
function numOrNull(v, dflt) {
  if (v === null || v === undefined || v === '') return dflt === undefined ? null : dflt;
  var n = Number(v);
  return isFinite(n) ? n : (dflt === undefined ? null : dflt);
}

function pct(v) {
  var n = numOrNull(v);
  return n === null ? '—' : Math.round(n) + '%';
}

function fix(v, d) {
  var n = numOrNull(v);
  return n === null ? '—' : n.toFixed(d === undefined ? 2 : d);
}

// 较上次考试的增减：统一保留 1 位小数并带符号，null 表示无可比考试
function delta(v, suffix) {
  var n = numOrNull(v);
  if (n === null) return { text: '—', dir: 0 };
  var rounded = Math.round(n * 10) / 10;
  var sign = rounded > 0 ? '+' : '';
  return { text: sign + rounded + (suffix || ''), dir: rounded > 0 ? 1 : (rounded < 0 ? -1 : 0) };
}

function normalizeExamList(resp) {
  return toArr(resp, 'exams').map(function (e) {
    var published = numOrNull(pick(e, ['score_published', 'scorePublished'], 0));
    return {
      examId: numOrNull(pick(e, ['id', 'examId', 'exam_id'], null)),
      name: pick(e, ['name', 'exam_name', 'examName'], ''),
      subject: pick(e, ['subject'], ''),
      gradeName: pick(e, ['grade_name', 'gradeName'], ''),
      examDate: pick(e, ['exam_date', 'examDate'], ''),
      status: pick(e, ['status'], ''),
      gradedCount: numOrNull(pick(e, ['graded_count', 'gradedCount'], null)),
      avgScore: numOrNull(pick(e, ['avg_score', 'avgScore'], null)),
      // 0=未公布 1=已公布 2=已撤回，是 number 不是 boolean
      publishState: published === null ? 0 : published,
      publishLabel: published === 1 ? '已公布' : (published === 2 ? '已撤回' : '未公布')
    };
  }).filter(function (e) { return e.examId !== null; });
}

function normalizeClasses(resp) {
  return toArr(resp, 'classes').map(function (c) {
    return {
      classId: numOrNull(pick(c, ['classId', 'class_id'], null)),
      className: pick(c, ['className', 'class_name', 'name'], ''),
      gradeName: pick(c, ['gradeName', 'grade_name'], '')
    };
  }).filter(function (c) { return c.classId !== null; });
}

function normalizeOverview(resp) {
  var r = resp && typeof resp === 'object' ? resp : {};
  var buckets = r.errorRateBuckets || {};
  return {
    fullScore: numOrNull(r.fullScore),
    totalStudents: numOrNull(r.totalStudents, 0),
    gradedCount: numOrNull(r.gradedCount, 0),
    avgScore: numOrNull(r.avgScore),
    maxScore: numOrNull(r.maxScore),
    minScore: numOrNull(r.minScore),
    stdDev: numOrNull(r.stdDev),
    passRate: numOrNull(r.passRate),
    excellentRate: numOrNull(r.excellentRate),
    passScore: numOrNull(r.passScore),
    excellentScore: numOrNull(r.excellentScore),
    highErrorQuestionCount: numOrNull(r.highErrorQuestionCount, 0),
    errorBuckets: {
      low: numOrNull(buckets.low, 0),
      medium: numOrNull(buckets.medium, 0),
      high: numOrNull(buckets.high, 0)
    },
    // scoreSummary 在无参考人数时为 null，五处指标各自可能是 0
    summary: r.scoreSummary ? {
      min: numOrNull(r.scoreSummary.min), q1: numOrNull(r.scoreSummary.q1),
      median: numOrNull(r.scoreSummary.median), q3: numOrNull(r.scoreSummary.q3),
      max: numOrNull(r.scoreSummary.max), avg: numOrNull(r.scoreSummary.avg),
      count: numOrNull(r.scoreSummary.count, 0)
    } : null,
    distribution: Array.isArray(r.distribution) ? r.distribution.map(function (b) {
      return { range: b.range, count: numOrNull(b.count, 0) };
    }) : []
  };
}

function normalizeMetrics(resp) {
  var r = resp && typeof resp === 'object' ? resp : {};
  return {
    difficulty: numOrNull(r.difficulty),      // 0-1
    discrimination: numOrNull(r.discrimination), // -1~1
    reliability: numOrNull(r.reliability),    // 样本不足为 null
    cv: numOrNull(r.cv),
    avgScore: numOrNull(r.avgScore),
    fullScore: numOrNull(r.fullScore),
    gradedCount: numOrNull(r.gradedCount, 0)
  };
}

function normalizePrevious(resp) {
  var r = resp && typeof resp === 'object' ? resp : {};
  var prevName = pick(r, ['prevExamName', 'prev_exam_name'], '');
  return {
    hasPrevious: !!prevName,
    prevExamName: prevName,
    prevAvgScore: numOrNull(r.prevAvgScore),
    prevPassRate: numOrNull(r.prevPassRate),
    avgScoreChange: delta(r.avgScoreChange),
    passRateChange: delta(r.passRateChange, 'pp')
  };
}

function normalizeQuestionStats(resp) {
  return toArr(resp, 'questions').map(function (q) {
    // 后端 String(question_number)，钻取时按原值回传，不先转 number 以免丢前导零
    var no = pick(q, ['questionNumber', 'question_number'], '');
    return {
      questionNumber: no === null || no === undefined ? '' : String(no),
      questionType: pick(q, ['questionType', 'question_type'], ''),
      scoreRate: numOrNull(q.scoreRate),
      correctRate: numOrNull(q.correctRate),   // 主观题/无作答为 null
      avgScore: numOrNull(q.avgScore),
      maxScore: numOrNull(q.maxScore),
      errorCount: numOrNull(q.errorCount, 0),
      errorRate: numOrNull(q.errorRate),
      errorRateLevel: pick(q, ['errorRateLevel'], 'none'),
      totalCount: numOrNull(q.totalCount, 0),
      difficulty: numOrNull(q.difficulty),       // 0-1
      discrimination: numOrNull(q.discrimination), // -1~1
      knowledgePoint: pick(q, ['knowledgePoint'], '') || ''
    };
  });
}

function normalizeKnowledge(resp) {
  var list = resp && typeof resp === 'object' && Array.isArray(resp.weaknesses)
    ? resp.weaknesses : [];
  return list.map(function (w) {
    return {
      pointText: pick(w, ['point_text', 'pointText'], ''),
      // 逗号拼接字符串，不是数组
      questionNumbers: pick(w, ['question_numbers', 'questionNumbers'], ''),
      avgRate: numOrNull(w.avg_rate != null ? w.avg_rate : w.avgRate),  // 0-100
      difficulty: numOrNull(w.difficulty),                              // 0-1
      discrimination: numOrNull(w.discrimination),
      studentCount: numOrNull(w.student_count != null ? w.student_count : w.studentCount, 0),
      totalQuestions: numOrNull(w.total_questions != null ? w.total_questions : w.totalQuestions, 0),
      coverageRate: numOrNull(w.coverage_rate != null ? w.coverage_rate : w.coverageRate),
      severity: pick(w, ['severity'], 'ok')
    };
  });
}

function normalizeQuestionStudents(resp) {
  return toArr(resp, 'rows').map(function (r) {
    return {
      studentId: numOrNull(r.studentId),
      studentNumber: pick(r, ['studentNumber', 'student_number'], ''),
      // 本接口字段名是 name，不是 studentName
      name: pick(r, ['name', 'studentName'], ''),
      className: pick(r, ['className', 'class_name'], '') || '—',
      score: numOrNull(r.score),
      maxScore: numOrNull(r.maxScore),
      scoreRate: numOrNull(r.scoreRate),
      isFull: !!r.isFull
    };
  });
}

function normalizeStudentRanking(resp) {
  return toArr(resp, 'students').map(function (s) {
    return {
      rank: numOrNull(s.rank),
      studentNumber: pick(s, ['studentNumber', 'student_number'], ''),
      studentName: pick(s, ['studentName', 'student_name', 'name'], ''),
      totalScore: numOrNull(s.totalScore),
      objectiveScore: numOrNull(s.objectiveScore),
      subjectiveScore: numOrNull(s.subjectiveScore),
      lowScoreCount: numOrNull(s.lowScoreCount, 0),
      questionCount: numOrNull(s.questionCount, 0),
      errorRate: numOrNull(s.errorRate),
      errorRateLevel: pick(s, ['errorRateLevel'], 'none')
    };
  });
}

function normalizeClassComparison(resp) {
  var r = resp && typeof resp === 'object' ? resp : {};
  return {
    fullScore: numOrNull(r.fullScore),
    classes: toArr(r, 'classes').map(function (c) {
      return {
        classId: numOrNull(c.classId),
        className: pick(c, ['className', 'class_name'], ''),
        gradeName: pick(c, ['gradeName', 'grade_name'], ''),
        count: numOrNull(c.count, 0),
        avgScore: numOrNull(c.avgScore),
        // 注意：此处 maxScore/minScore/median 是该班的分数统计，不是题目分值
        maxScore: numOrNull(c.maxScore),
        minScore: numOrNull(c.minScore),
        median: numOrNull(c.median),
        stdDev: numOrNull(c.stdDev),
        passRate: numOrNull(c.passRate),
        excellentRate: numOrNull(c.excellentRate),
        difficulty: numOrNull(c.difficulty),
        discrimination: numOrNull(c.discrimination)
      };
    }),
    questionStats: toArr(r, 'questionStats').map(function (q) {
      // 此处 questionNumber 是 number，与逐题分析接口的 string 不同
      return {
        questionNumber: numOrNull(pick(q, ['questionNumber', 'question_number'], null)),
        // 后端按 (question_number, score_type) 分组，同题号可能各出一行
        scoreType: pick(q, ['scoreType'], ''),
        maxScore: numOrNull(q.maxScore),
        byClass: toArr(q, 'byClass').map(function (b) {
          return {
            classId: numOrNull(b.classId),
            scoreRate: numOrNull(b.scoreRate),
            correctRate: numOrNull(b.correctRate)
          };
        })
      };
    })
  };
}

module.exports = {
  numOrNull: numOrNull,
  pct: pct,
  fix: fix,
  delta: delta,
  normalizeExamList: normalizeExamList,
  normalizeClasses: normalizeClasses,
  normalizeOverview: normalizeOverview,
  normalizeMetrics: normalizeMetrics,
  normalizePrevious: normalizePrevious,
  normalizeQuestionStats: normalizeQuestionStats,
  normalizeKnowledge: normalizeKnowledge,
  normalizeQuestionStudents: normalizeQuestionStudents,
  normalizeStudentRanking: normalizeStudentRanking,
  normalizeClassComparison: normalizeClassComparison
};

// 自检：node utils/analysis.js（小程序运行时 require.main 为 undefined，不会执行）
if (typeof require !== 'undefined' && require.main === module) {
  const assert = require('assert');

  const exams = normalizeExamList([{ id: '7', name: '期中', score_published: 2, avg_score: '88.5' }]);
  assert.strictEqual(exams[0].examId, 7);
  assert.strictEqual(exams[0].publishState, 2);
  assert.strictEqual(exams[0].publishLabel, '已撤回');
  assert.strictEqual(exams[0].avgScore, 88.5);

  // 无成绩时 overview 仍带全部键，scoreSummary 为 null；
  // 计数类缺字段回落 0，比率类缺字段保持 null（显示「—」而不是 0%）
  const ov = normalizeOverview({ gradedCount: 0, scoreSummary: null, distribution: [] });
  assert.strictEqual(ov.summary, null);
  assert.strictEqual(ov.gradedCount, 0);
  assert.strictEqual(ov.totalStudents, 0);
  assert.strictEqual(ov.highErrorQuestionCount, 0);
  assert.strictEqual(ov.errorBuckets.high, 0);
  assert.strictEqual(ov.passRate, null);
  assert.strictEqual(pct(ov.passRate), '—');
  // 后端「无参考人数」会显式送 0，此时应显示 0% 而不是「—」
  assert.strictEqual(normalizeOverview({ passRate: 0 }).passRate, 0);

  const qs = normalizeQuestionStats([{
    questionNumber: '03', questionType: '主观', scoreRate: 42, correctRate: null,
    avgScore: 4.2, maxScore: 10, difficulty: 0.42, discrimination: -0.031
  }]);
  assert.strictEqual(qs[0].questionNumber, '03');
  assert.strictEqual(qs[0].correctRate, null);
  assert.strictEqual(pct(qs[0].scoreRate), '42%');
  assert.strictEqual(fix(qs[0].difficulty, 2), '0.42');
  assert.strictEqual(fix(qs[0].discrimination, 2), '-0.03');
  assert.strictEqual(pct(null), '—');

  const kp = normalizeKnowledge({ weaknesses: [{
    point_text: '三角函数', question_numbers: '3,5,8', avg_rate: 51.3,
    difficulty: 0.513, student_count: 42, severity: 'common_weak'
  }] });
  assert.strictEqual(kp[0].pointText, '三角函数');
  assert.strictEqual(kp[0].questionNumbers, '3,5,8');
  assert.strictEqual(kp[0].studentCount, 42);
  assert.strictEqual(normalizeKnowledge({}).length, 0);

  const qst = normalizeQuestionStudents([{ studentId: 3, name: '张三', scoreRate: 75, isFull: false }]);
  assert.strictEqual(qst[0].name, '张三');
  assert.strictEqual(qst[0].scoreRate, 75);

  const rank = normalizeStudentRanking([{ rank: 1, studentName: '李四', errorRate: 20 }]);
  assert.strictEqual(rank[0].studentName, '李四');
  assert.strictEqual(rank[0].rank, 1);

  const cmp = normalizeClassComparison({
    fullScore: 150,
    classes: [{ classId: 2, className: '一班', passRate: 66 }],
    questionStats: [{ questionNumber: 5, byClass: [{ classId: 2, scoreRate: 58, correctRate: null }] }]
  });
  assert.strictEqual(cmp.classes[0].passRate, 66);
  assert.strictEqual(cmp.questionStats[0].questionNumber, 5);
  assert.strictEqual(cmp.questionStats[0].byClass[0].scoreRate, 58);

  assert.deepEqual(delta(-2.34), { text: '-2.3', dir: -1 });
  assert.deepEqual(delta(null), { text: '—', dir: 0 });
  assert.strictEqual(delta(12.06, 'pp').text, '+12.1pp');

  assert.strictEqual(normalizeExamList('oops').length, 0);
  assert.strictEqual(normalizeClasses({ classes: [{ className: '无班级', classId: 0 }] })[0].classId, 0);

  console.log('analysis.js self-check OK');
}
