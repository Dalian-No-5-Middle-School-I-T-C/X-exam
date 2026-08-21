// services/leaderboardService.js
// 天梯业务层：封装天梯查询请求。页面只调本服务，不直接 require request。
const request = require('../utils/request');

function fetchBoard(examId) {
  // encodeURIComponent：examId 来自页面 options，防止路径/查询串注入
  return request.get('/ladder/exams/' + encodeURIComponent(examId));
}

module.exports = { fetchBoard: fetchBoard };
