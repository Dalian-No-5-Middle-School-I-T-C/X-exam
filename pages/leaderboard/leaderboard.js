// pages/leaderboard/leaderboard.js
const { get } = require('../../utils/request');
const { animateNumber } = require('../../utils/animate');

function pickScore(it) {
  if (it.totalScore != null) return it.totalScore;
  if (it.total_score != null) return it.total_score;
  if (it.score != null) return it.score;
  return '';
}
function pickName(it, i) {
  return it.studentName || it.name || it.student_name || ('同学' + (i + 1));
}
function pickRank(it, i) {
  return it.rank != null ? it.rank : (it.ranking != null ? it.ranking : (i + 1));
}

Page({
  data: {
    examId: 0,
    examName: '',
    enabled: true,
    list: [],
    mine: null,
    loading: true,
    error: '',
    ready: false,
    mineRank: 0
  },

  onLoad: function (options) {
    const examId = parseInt(options.examId, 10) || 0;
    if (!examId) {
      this.setData({ loading: false, error: '参数缺失，无法加载天梯' });
      return;
    }
    const examName = options.name ? decodeURIComponent(options.name) : '';
    this.setData({ examId: examId, examName: examName });
    this.loadBoard();
  },

  onReady: function () { this.setData({ ready: true }); },
  onHide: function () { this._cancelMine(); },
  onUnload: function () { this._cancelMine(); },

  loadBoard: function (done) {
    const self = this;
    // 下拉刷新/错误重试同样需要守卫，避免 examId=0 请求无效接口
    if (!this.data.examId) {
      this.setData({ loading: false, error: '参数缺失，无法加载天梯' });
      if (typeof done === 'function') done();
      return;
    }
    this.setData({ loading: true, error: '' });
    // 后端真实契约：GET /api/ladder/exams/:examId → { rows, myRank, myScore }；
    // 关闭时返回 403（"成绩天梯暂未开放"），开关状态见 /api/ladder/config
    get('/ladder/exams/' + this.data.examId)
      .then(function (resp) {
        const data = resp || {};
        const raw = data.rows || data.leaderboard || data.board || data.rankings || data.list || data.topTen || data.top10 || [];
        const list = raw.map(function (it, i) {
          return {
            // 后端竞赛排名允许并列（1,2,2,4），studentId 才是稳定 key
            studentId: it.studentId || it.student_id || ('r' + i),
            rank: pickRank(it, i),
            name: pickName(it, i),
            score: pickScore(it),
            isMe: !!it.isCurrentUser || !!it.isMe || !!it.isSelf
          };
        });

        let mine = null;
        if (data.myRank != null) {
          // 后端直接给当前用户的全量排名/总分，缺失时不伪造
          mine = { rank: data.myRank, score: data.myScore != null ? data.myScore : '', name: '我' };
        } else {
          const me = list.filter(function (x) { return x.isMe; })[0];
          if (me) mine = { rank: me.rank, score: me.score, name: '我' };
        }

        // 200 说明后端放行（后端开关默认开，管理员可预览）
        const enabled = true;
        self.setData({ list: list, mine: mine, enabled: enabled, loading: false, error: '' });
        self.animateMine(mine);
      })
      .catch(function (err) {
        const msg = (err && err.message) || '';
        if (err.status === 403 && msg.indexOf('暂未开放') >= 0) {
          // 后端明确关闭天梯：显示“功能暂未开启”
          self.setData({ loading: false, error: '', enabled: false });
        } else {
          // 其它 403（权限不足等）按真实错误展示，不伪装成“未开启”
          self.setData({ loading: false, error: msg || '加载失败', enabled: false });
        }
      })
      .finally(function () { if (typeof done === 'function') done(); });
  },

  // 我的排名数字滚动：首次滚动，之后直接赋值
  animateMine: function (mine) {
    const self = this;
    const target = mine && mine.rank != null ? mine.rank : 0;
    this._cancelMine();
    if (!this._mineDone) {
      this._mineDone = true;
      this.setData({ mineRank: 0 });
      this._cancelMineFn = animateNumber({ from: 0, to: target, duration: 650, onUpdate: function (v) { self.setData({ mineRank: v }); } });
    } else {
      this.setData({ mineRank: target });
    }
  },

  _cancelMine: function () {
    if (this._cancelMineFn) { this._cancelMineFn(); this._cancelMineFn = null; }
  },

  onPullDownRefresh: function () {
    this.loadBoard(function () { wx.stopPullDownRefresh(); });
  }
});
