// services/scoresService.js
// 成绩业务层：封装成绩相关网络请求与本地缓存。页面只调本服务，不直接 require request。
const request = require('../utils/request');
const cache = require('../utils/cache');

function fetchScores() {
  return request.get('/scores/me');
}
function fetchExamDetail(examId) {
  return request.get('/scores/me/exams/' + examId);
}
function fetchSubjectComparison() {
  return request.get('/scores/me/subject-comparison');
}
function fetchTrends() {
  return request.get('/scores/me/trends');
}
function fetchSemesterComparison() {
  return request.get('/scores/me/semester-comparison');
}

module.exports = {
  fetchScores: fetchScores,
  fetchExamDetail: fetchExamDetail,
  fetchSubjectComparison: fetchSubjectComparison,
  fetchTrends: fetchTrends,
  fetchSemesterComparison: fetchSemesterComparison,
  getCachedScores: cache.getCachedScores,
  setCachedScores: cache.setCachedScores
};
