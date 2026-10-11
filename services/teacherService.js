// services/teacherService.js
// 教师工作台（只读分析）业务层：页面只调本服务，不直接 require request。
// 契约要点（均按后端实现核对，勿凭字段名猜）：
// - 知识点接口路径是 /analysis/knowledge-points/:examId，不是 /analysis/exams/:id/knowledge-points。
// - 响应有裸数组也有裸对象，不统一信封，因此本层不做拆包，交 utils/analysis.js 归一化。
// - 只含 GET：改分、发布、阅卷提交等写操作不在小程序侧提供。
const request = require('../utils/request');

function qs(params) {
  if (!params) return '';
  var parts = [];
  Object.keys(params).forEach(function (k) {
    var v = params[k];
    if (v === undefined || v === null || v === '') return;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
  });
  return parts.length ? '?' + parts.join('&') : '';
}

// id 来自页面 options，逐个编码避免路径/查询串注入
function seg(v) {
  return encodeURIComponent(v);
}

function examPath(examId, suffix, params) {
  return '/analysis/exams/' + seg(examId) + (suffix || '') + qs(params);
}

function fetchExams() {
  // selection=1 才带出 grade_name / graded_count / avg_score / score_published
  return request.get('/exams' + qs({ selection: 1 }));
}

function fetchClasses(examId) {
  return request.get(examPath(examId, '/classes'));
}

function fetchOverview(examId, classId) {
  return request.get(examPath(examId, '/overview', { classId: classId }));
}

function fetchMetrics(examId, classId) {
  return request.get(examPath(examId, '/metrics', { classId: classId }));
}

function fetchPrevious(examId, classId) {
  return request.get(examPath(examId, '/previous', { classId: classId }));
}

function fetchQuestions(examId, classId) {
  return request.get(examPath(examId, '/questions', { classId: classId }));
}

function fetchKnowledge(examId, classId) {
  return request.get('/analysis/knowledge-points/' + seg(examId) + qs({ classId: classId }));
}

function fetchQuestionStudents(examId, questionNumber, classId) {
  return request.get(examPath(examId, '/question-students', {
    questionNumber: questionNumber, classId: classId
  }));
}

function fetchStudentRanking(examId, classId) {
  // 后端无分页与排序参数，整榜一次返回，分页在页面本地做
  return request.get(examPath(examId, '/students', { classId: classId }));
}

function fetchClassComparison(examId) {
  return request.get(examPath(examId, '/class-comparison', { all: 1 }));
}

module.exports = {
  fetchExams: fetchExams,
  fetchClasses: fetchClasses,
  fetchOverview: fetchOverview,
  fetchMetrics: fetchMetrics,
  fetchPrevious: fetchPrevious,
  fetchQuestions: fetchQuestions,
  fetchKnowledge: fetchKnowledge,
  fetchQuestionStudents: fetchQuestionStudents,
  fetchStudentRanking: fetchStudentRanking,
  fetchClassComparison: fetchClassComparison
};
