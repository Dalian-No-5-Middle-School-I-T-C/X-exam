// services/leaderboardService.js
// 天梯业务层：封装天梯查询请求。页面只调本服务，不直接 require request。
const request = require('../utils/request');

function fetchBoard(examId) {
  return request.get('/ladder/exams/' + examId);
}

module.exports = { fetchBoard: fetchBoard };
